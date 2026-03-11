import type pg from "pg";

export const REPLAY_STORE_ACCESS_CAPABILITY_VERSION = 1 as const;

export type ReplayNodeRow = {
  id: string;
  type: "event" | "entity" | "topic" | "rule" | "evidence" | "concept" | "procedure" | "self_model";
  title: string | null;
  text_summary: string | null;
  slots: any;
  created_at: string;
  updated_at: string;
  commit_id: string | null;
};

export type ReplayRunNodeRow = ReplayNodeRow;

export type ReplayPlaybookRow = ReplayNodeRow & {
  version_num: number;
  playbook_status: string | null;
  playbook_id: string | null;
};

export interface ReplayStoreAccess {
  readonly capability_version: typeof REPLAY_STORE_ACCESS_CAPABILITY_VERSION;
  findRunNodeByRunId(scope: string, runId: string): Promise<ReplayRunNodeRow | null>;
  findStepNodeById(scope: string, stepId: string): Promise<ReplayNodeRow | null>;
  findLatestStepNodeByIndex(scope: string, runId: string, stepIndex: number): Promise<ReplayNodeRow | null>;
  listReplayNodesByRunId(scope: string, runId: string): Promise<ReplayNodeRow[]>;
  listReplayPlaybookVersions(scope: string, playbookId: string): Promise<ReplayPlaybookRow[]>;
  getReplayPlaybookVersion(scope: string, playbookId: string, version: number): Promise<ReplayPlaybookRow | null>;
}

export function createPostgresReplayStoreAccess(client: pg.PoolClient): ReplayStoreAccess {
  return {
    capability_version: REPLAY_STORE_ACCESS_CAPABILITY_VERSION,

    async findRunNodeByRunId(scope: string, runId: string): Promise<ReplayRunNodeRow | null> {
      const out = await client.query<ReplayRunNodeRow>(
        `
        SELECT
          id::text,
          type::text AS type,
          title,
          text_summary,
          slots,
          created_at::text AS created_at,
          updated_at::text AS updated_at,
          commit_id::text AS commit_id
        FROM memory_nodes
        WHERE scope = $1
          AND slots->>'replay_kind' = 'run'
          AND slots->>'run_id' = $2
        ORDER BY created_at DESC
        LIMIT 1
        `,
        [scope, runId],
      );
      return out.rows[0] ?? null;
    },

    async findStepNodeById(scope: string, stepId: string): Promise<ReplayNodeRow | null> {
      const out = await client.query<ReplayNodeRow>(
        `
        SELECT
          id::text,
          type::text AS type,
          title,
          text_summary,
          slots,
          created_at::text AS created_at,
          updated_at::text AS updated_at,
          commit_id::text AS commit_id
        FROM memory_nodes
        WHERE scope = $1
          AND id = $2
          AND slots->>'replay_kind' = 'step'
        LIMIT 1
        `,
        [scope, stepId],
      );
      return out.rows[0] ?? null;
    },

    async findLatestStepNodeByIndex(scope: string, runId: string, stepIndex: number): Promise<ReplayNodeRow | null> {
      const out = await client.query<ReplayNodeRow>(
        `
        SELECT
          id::text,
          type::text AS type,
          title,
          text_summary,
          slots,
          created_at::text AS created_at,
          updated_at::text AS updated_at,
          commit_id::text AS commit_id
        FROM memory_nodes
        WHERE scope = $1
          AND slots->>'replay_kind' = 'step'
          AND slots->>'run_id' = $2
          AND slots->>'step_index' = $3
        ORDER BY created_at DESC
        LIMIT 1
        `,
        [scope, runId, String(stepIndex)],
      );
      return out.rows[0] ?? null;
    },

    async listReplayNodesByRunId(scope: string, runId: string): Promise<ReplayNodeRow[]> {
      const out = await client.query<ReplayNodeRow>(
        `
        SELECT
          id::text,
          type::text AS type,
          title,
          text_summary,
          slots,
          created_at::text AS created_at,
          updated_at::text AS updated_at,
          commit_id::text AS commit_id
        FROM memory_nodes
        WHERE scope = $1
          AND slots ? 'replay_kind'
          AND slots->>'run_id' = $2
        ORDER BY created_at ASC
        `,
        [scope, runId],
      );
      return out.rows;
    },

    async listReplayPlaybookVersions(scope: string, playbookId: string): Promise<ReplayPlaybookRow[]> {
      const out = await client.query<ReplayPlaybookRow>(
        `
        SELECT
          id::text,
          type::text AS type,
          title,
          text_summary,
          slots,
          created_at::text AS created_at,
          updated_at::text AS updated_at,
          commit_id::text AS commit_id,
          CASE
            WHEN coalesce(slots->>'version', '') ~ '^[0-9]+$' THEN (slots->>'version')::int
            ELSE 1
          END AS version_num,
          nullif(trim(coalesce(slots->>'status', '')), '') AS playbook_status,
          nullif(trim(coalesce(slots->>'playbook_id', '')), '') AS playbook_id
        FROM memory_nodes
        WHERE scope = $1
          AND slots->>'replay_kind' = 'playbook'
          AND slots->>'playbook_id' = $2
        ORDER BY version_num DESC, created_at DESC
        `,
        [scope, playbookId],
      );
      return out.rows;
    },

    async getReplayPlaybookVersion(scope: string, playbookId: string, version: number): Promise<ReplayPlaybookRow | null> {
      const out = await client.query<ReplayPlaybookRow>(
        `
        SELECT
          id::text,
          type::text AS type,
          title,
          text_summary,
          slots,
          created_at::text AS created_at,
          updated_at::text AS updated_at,
          commit_id::text AS commit_id,
          CASE
            WHEN coalesce(slots->>'version', '') ~ '^[0-9]+$' THEN (slots->>'version')::int
            ELSE 1
          END AS version_num,
          nullif(trim(coalesce(slots->>'status', '')), '') AS playbook_status,
          nullif(trim(coalesce(slots->>'playbook_id', '')), '') AS playbook_id
        FROM memory_nodes
        WHERE scope = $1
          AND slots->>'replay_kind' = 'playbook'
          AND slots->>'playbook_id' = $2
          AND (
            CASE
              WHEN coalesce(slots->>'version', '') ~ '^[0-9]+$' THEN (slots->>'version')::int
              ELSE 1
            END
          ) = $3
        ORDER BY created_at DESC
        LIMIT 1
        `,
        [scope, playbookId, version],
      );
      return out.rows[0] ?? null;
    },
  };
}

export function assertReplayStoreAccessContract(access: ReplayStoreAccess): void {
  if (access.capability_version !== REPLAY_STORE_ACCESS_CAPABILITY_VERSION) {
    throw new Error(
      `replay access capability version mismatch: expected=${REPLAY_STORE_ACCESS_CAPABILITY_VERSION} got=${String(
        (access as any).capability_version,
      )}`,
    );
  }
  const requiredMethods = [
    "findRunNodeByRunId",
    "findStepNodeById",
    "findLatestStepNodeByIndex",
    "listReplayNodesByRunId",
    "listReplayPlaybookVersions",
    "getReplayPlaybookVersion",
  ] as const;
  for (const method of requiredMethods) {
    if (typeof (access as any)[method] !== "function") {
      throw new Error(`replay access missing required method: ${method}`);
    }
  }
}
