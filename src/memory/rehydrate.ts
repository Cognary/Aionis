import stableStringify from "fast-json-stable-stringify";
import type pg from "pg";
import { sha256Hex } from "../util/crypto.js";
import { normalizeText } from "../util/normalize.js";
import { redactPII } from "../util/redaction.js";
import { badRequest } from "../util/http.js";
import { MemoryArchiveRehydrateRequest } from "./schemas.js";
import { resolveTenantScope } from "./tenant.js";

type RehydrateOptions = {
  maxTextLen: number;
  piiRedaction: boolean;
};

type NodeTierRow = {
  id: string;
  tier: "hot" | "warm" | "cold" | "archive";
};

const TIER_RANK: Record<"archive" | "cold" | "warm" | "hot", number> = {
  archive: 0,
  cold: 1,
  warm: 2,
  hot: 3,
};

function uniqStrings(xs: string[]): string[] {
  return Array.from(new Set(xs));
}

function normalizeMaybeRedact(input: string | undefined, opts: RehydrateOptions): string | undefined {
  if (!input) return input;
  const normalized = normalizeText(input, opts.maxTextLen);
  if (!opts.piiRedaction) return normalized;
  return redactPII(normalized).text;
}

export async function rehydrateArchiveNodes(
  client: pg.PoolClient,
  body: unknown,
  defaultScope: string,
  defaultTenantId: string,
  opts: RehydrateOptions,
) {
  const parsed = MemoryArchiveRehydrateRequest.parse(body);
  const tenancy = resolveTenantScope(
    { scope: parsed.scope, tenant_id: parsed.tenant_id },
    { defaultScope, defaultTenantId },
  );
  const scope = tenancy.scope_key;
  const actor = parsed.actor ?? "system";
  const startedAt = new Date().toISOString();
  const reason = normalizeMaybeRedact(parsed.reason, opts) ?? null;
  const inputText = normalizeMaybeRedact(parsed.input_text, opts);
  const inputSha = parsed.input_sha256 ?? sha256Hex(inputText!);

  const requestedNodeIds = uniqStrings((parsed.node_ids ?? []).map((x) => x.toLowerCase()));
  const requestedClientIds = uniqStrings((parsed.client_ids ?? []).map((x) => x.trim()).filter((x) => x.length > 0));
  const resolvedNodeIdSet = new Set<string>(requestedNodeIds);
  const resolvedByClient: Array<{ client_id: string; node_id: string }> = [];
  const missingClientIds: string[] = [];

  if (requestedClientIds.length > 0) {
    const rs = await client.query<{ id: string; client_id: string }>(
      `
      SELECT id::text AS id, client_id
      FROM memory_nodes
      WHERE scope = $1
        AND client_id = ANY($2::text[])
      `,
      [scope, requestedClientIds],
    );
    const m = new Map<string, string>();
    for (const row of rs.rows) m.set(row.client_id, row.id);
    for (const cid of requestedClientIds) {
      const id = m.get(cid);
      if (!id) {
        missingClientIds.push(cid);
        continue;
      }
      resolvedByClient.push({ client_id: cid, node_id: id });
      resolvedNodeIdSet.add(id);
    }
  }

  const resolvedNodeIds = Array.from(resolvedNodeIdSet);
  if (resolvedNodeIds.length === 0) {
    badRequest("rehydrate_no_resolved_nodes", "No valid node_ids/client_ids resolved under this scope");
  }

  const foundRes = await client.query<NodeTierRow>(
    `
    SELECT id::text AS id, tier::text AS tier
    FROM memory_nodes
    WHERE scope = $1
      AND id = ANY($2::uuid[])
    `,
    [scope, resolvedNodeIds],
  );
  const foundMap = new Map(foundRes.rows.map((x) => [x.id, x]));
  const missingNodeIds = resolvedNodeIds.filter((id) => !foundMap.has(id));

  const movableIds: string[] = [];
  const noopIds: string[] = [];
  for (const id of resolvedNodeIds) {
    const row = foundMap.get(id);
    if (!row) continue;
    const fromRank = TIER_RANK[row.tier];
    const toRank = TIER_RANK[parsed.target_tier];
    if (fromRank < toRank) movableIds.push(id);
    else noopIds.push(id);
  }

  if (movableIds.length === 0) {
    return {
      scope: tenancy.scope,
      tenant_id: tenancy.tenant_id,
      target_tier: parsed.target_tier,
      commit_id: null as string | null,
      commit_hash: null as string | null,
      rehydrated: {
        requested_node_ids: requestedNodeIds.length,
        requested_client_ids: requestedClientIds.length,
        resolved_node_ids: resolvedNodeIds.length,
        found_nodes: foundRes.rows.length,
        moved_nodes: 0,
        noop_nodes: noopIds.length,
        missing_node_ids: missingNodeIds,
        missing_client_ids: missingClientIds,
        moved_ids: [] as string[],
        noop_ids: noopIds,
      },
    };
  }

  const parentRes = await client.query<{ id: string; commit_hash: string }>(
    "SELECT id, commit_hash FROM memory_commits WHERE scope = $1 ORDER BY created_at DESC LIMIT 1",
    [scope],
  );
  const parentHash = parentRes.rowCount ? parentRes.rows[0].commit_hash : "";
  const parentId = parentRes.rowCount ? parentRes.rows[0].id : null;

  const diff = {
    job: "archive_rehydrate",
    started_at: startedAt,
    scope,
    actor,
    target_tier: parsed.target_tier,
    reason,
    requested: {
      node_ids: requestedNodeIds,
      client_ids: requestedClientIds,
    },
    resolved_by_client: resolvedByClient,
    moved_ids: movableIds,
    noop_ids: noopIds,
    missing_node_ids: missingNodeIds,
    missing_client_ids: missingClientIds,
  };
  const diffSha = sha256Hex(stableStringify(diff));
  const commitHash = sha256Hex(stableStringify({ parentHash, inputSha, diffSha, scope, actor, kind: "archive_rehydrate" }));

  const commitRes = await client.query<{ id: string }>(
    `INSERT INTO memory_commits (scope, parent_id, input_sha256, diff_json, actor, commit_hash)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6)
     ON CONFLICT (commit_hash) DO UPDATE SET diff_json = memory_commits.diff_json
     RETURNING id`,
    [scope, parentId, inputSha, JSON.stringify(diff), actor, commitHash],
  );
  const commitId = commitRes.rows[0].id;

  await client.query(
    `
    WITH candidate AS (
      SELECT id, tier::text AS from_tier
      FROM memory_nodes
      WHERE scope = $1
        AND id = ANY($5::uuid[])
    )
    UPDATE memory_nodes n
    SET
      tier = $2::memory_tier,
      last_activated = now(),
      commit_id = $4::uuid,
      slots = jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  n.slots,
                  '{last_rehydrated_at}',
                  to_jsonb($3::text),
                  true
                ),
                '{last_rehydrated_job}',
                to_jsonb('archive_rehydrate'::text),
                true
              ),
              '{last_rehydrated_from_tier}',
              to_jsonb(c.from_tier),
              true
            ),
            '{last_rehydrated_to_tier}',
            to_jsonb($2::text),
            true
          ),
          '{last_rehydrated_reason}',
          to_jsonb($6::text),
          true
        ),
        '{last_rehydrated_input_sha256}',
        to_jsonb($7::text),
        true
      )
    FROM candidate c
    WHERE n.scope = $1
      AND n.id = c.id
      AND (
        CASE n.tier
          WHEN 'archive'::memory_tier THEN 0
          WHEN 'cold'::memory_tier THEN 1
          WHEN 'warm'::memory_tier THEN 2
          ELSE 3
        END
      ) < $8::int
    `,
    [scope, parsed.target_tier, startedAt, commitId, movableIds, reason, inputSha, TIER_RANK[parsed.target_tier]],
  );

  return {
    scope: tenancy.scope,
    tenant_id: tenancy.tenant_id,
    target_tier: parsed.target_tier,
    commit_id: commitId,
    commit_hash: commitHash,
    rehydrated: {
      requested_node_ids: requestedNodeIds.length,
      requested_client_ids: requestedClientIds.length,
      resolved_node_ids: resolvedNodeIds.length,
      found_nodes: foundRes.rows.length,
      moved_nodes: movableIds.length,
      noop_nodes: noopIds.length,
      missing_node_ids: missingNodeIds,
      missing_client_ids: missingClientIds,
      moved_ids: movableIds,
      noop_ids: noopIds,
    },
  };
}
