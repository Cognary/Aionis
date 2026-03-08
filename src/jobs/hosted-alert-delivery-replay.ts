import "dotenv/config";

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  if (i === -1) return null;
  const v = process.argv[i + 1];
  if (!v || v.startsWith("--")) return null;
  return v;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function asInt(raw: string | null | undefined, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function trim(v: unknown): string {
  return String(v ?? "").trim();
}

function parseJson(text: string) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { raw: text };
  }
}

function isoMs(v: unknown): number {
  const n = Date.parse(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}

function replayBackoffMsForRow(row: any, fallbackMs: number | null): number {
  if (fallbackMs != null) return fallbackMs;
  const raw = Number(row?.metadata?.dispatch_policy?.replay_backoff_seconds);
  if (!Number.isFinite(raw)) return 300_000;
  return Math.max(0, Math.min(7 * 24 * 3600 * 1000, Math.trunc(raw) * 1000));
}

function workflowStateForRow(row: any): string {
  const workflow = row?.metadata?.alert_workflow && typeof row.metadata.alert_workflow === "object" ? row.metadata.alert_workflow : {};
  const explicit = trim(workflow?.state);
  if (explicit) return explicit;
  if (row?.metadata?.replay_of_delivery_id != null) return "replayed_row";
  if (row?.metadata?.payload_snapshot != null && (row?.status === "failed" || row?.status === "skipped")) return "replay_backlog";
  if (row?.status === "failed" || row?.status === "skipped") return "manual_review";
  return "observe";
}

function ownerModeForRow(row: any): "owned" | "unassigned" {
  const owner = trim(row?.metadata?.alert_workflow?.owner);
  return owner ? "owned" : "unassigned";
}

function slaStatusForRow(row: any): string {
  const workflow = row?.metadata?.alert_workflow && typeof row.metadata.alert_workflow === "object" ? row.metadata.alert_workflow : {};
  const target = trim(workflow?.sla_target_at);
  const backlogState = workflowStateForRow(row);
  if (!target) return "unset";
  const ts = isoMs(target);
  if (!ts) return "unset";
  if (backlogState === "resolved" || backlogState === "replayed_row") return "met";
  const remaining = ts - Date.now();
  if (remaining <= 0) return "breached";
  if (remaining <= 60 * 60 * 1000) return "at_risk";
  return "on_track";
}

function matchesReplayable(row: any) {
  return row?.metadata?.payload_snapshot != null && !row?.metadata?.replay_of_delivery_id;
}

function matchesOwner(row: any, owner: string) {
  if (!owner) return true;
  return trim(row?.metadata?.alert_workflow?.owner) === owner;
}

function matchesBacklog(row: any, backlog: string) {
  if (!backlog) return true;
  return workflowStateForRow(row) === backlog;
}

function matchesOwnerMode(row: any, mode: string) {
  if (!mode || mode === "any") return true;
  return ownerModeForRow(row) === mode;
}

function matchesSlaStatus(row: any, status: string) {
  if (!status || status === "any") return true;
  return slaStatusForRow(row) === status;
}

async function listDeliveries(input: {
  baseUrl: string;
  adminToken: string;
  tenantId?: string;
  eventType: string;
  status?: string;
  limit: number;
}) {
  const params = new URLSearchParams();
  if (input.tenantId) params.set("tenant_id", input.tenantId);
  params.set("event_type", input.eventType);
  if (input.status) params.set("status", input.status);
  params.set("limit", String(input.limit));
  const response = await fetch(`${input.baseUrl}/v1/admin/control/alerts/deliveries?${params.toString()}`, {
    headers: {
      "x-admin-token": input.adminToken,
    },
  });
  const text = await response.text();
  const data = parseJson(text);
  if (!response.ok) {
    throw new Error(`list alert deliveries failed: http_${response.status} ${JSON.stringify(data)}`);
  }
  return Array.isArray((data as any)?.deliveries) ? (data as any).deliveries : [];
}

async function replayDeliveries(input: {
  baseUrl: string;
  adminToken: string;
  ids: string[];
  overrideTarget?: string;
  dryRun: boolean;
}) {
  const response = await fetch(`${input.baseUrl}/v1/admin/control/alerts/deliveries/replay`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-admin-token": input.adminToken,
    },
    body: JSON.stringify({
      ids: input.ids,
      dry_run: input.dryRun,
      override_target: input.overrideTarget || undefined,
    }),
  });
  const text = await response.text();
  const data = parseJson(text);
  if (!response.ok) {
    throw new Error(`replay alert deliveries failed: http_${response.status} ${JSON.stringify(data)}`);
  }
  return {
    status: response.status,
    request_id: response.headers.get("x-request-id") || "",
    data,
  };
}

async function replayOnce(input: {
  baseUrl: string;
  adminToken: string;
  tenantId?: string;
  eventType: string;
  limit: number;
  owner?: string;
  ownerMode?: string;
  backlog?: string;
  slaStatus?: string;
  overrideTarget?: string;
  dryRun: boolean;
  allowAlreadyReplayed?: boolean;
  replayBackoffMsDefault: number | null;
}) {
  const rows = await listDeliveries({
    baseUrl: input.baseUrl,
    adminToken: input.adminToken,
    tenantId: input.tenantId,
    eventType: input.eventType,
    limit: Math.max(input.limit * 8, input.limit),
  });
  const latestReplayByOriginal = new Map<string, any>();
  for (const row of rows) {
    const originalId = trim(row?.metadata?.replay_of_delivery_id);
    if (!originalId) continue;
    const prev = latestReplayByOriginal.get(originalId);
    if (!prev || isoMs(row?.created_at) > isoMs(prev?.created_at)) {
      latestReplayByOriginal.set(originalId, row);
    }
  }
  const failedRows = rows.filter((row: any) => row?.status === "failed" || row?.status === "skipped");
  const nowMs = Date.now();
  const eligible = failedRows
    .filter(matchesReplayable)
    .filter((row: any) => matchesOwner(row, trim(input.owner)))
    .filter((row: any) => matchesOwnerMode(row, trim(input.ownerMode)))
    .filter((row: any) => matchesBacklog(row, trim(input.backlog)))
    .filter((row: any) => matchesSlaStatus(row, trim(input.slaStatus)))
    .filter((row: any) => {
      const deliveryId = trim(row?.delivery_id);
      if (!deliveryId) return false;
      const latestReplay = latestReplayByOriginal.get(deliveryId);
      if (!latestReplay) return true;
      if (input.allowAlreadyReplayed === true) return true;
      if (String(latestReplay?.status || "") === "sent") return false;
      const replayBackoffMs = replayBackoffMsForRow(row, input.replayBackoffMsDefault);
      if (replayBackoffMs <= 0) return true;
      const replayAgeMs = nowMs - isoMs(latestReplay?.created_at);
      return !(replayAgeMs >= 0 && replayAgeMs < replayBackoffMs);
    })
    .slice(0, input.limit);
  const ids = eligible.map((row: any) => trim(row?.delivery_id)).filter(Boolean);
  const skippedAlreadyReplayed = failedRows.filter(
    (row: any) => {
      const deliveryId = trim(row?.delivery_id);
      const latestReplay = latestReplayByOriginal.get(deliveryId);
      return (
        matchesReplayable(row) &&
        matchesOwner(row, trim(input.owner)) &&
        matchesOwnerMode(row, trim(input.ownerMode)) &&
        matchesBacklog(row, trim(input.backlog)) &&
        matchesSlaStatus(row, trim(input.slaStatus)) &&
        deliveryId.length > 0 &&
        latestReplay != null &&
        String(latestReplay?.status || "") === "sent"
      );
    },
  ).length;
  const skippedBackoff = failedRows.filter(
    (row: any) => {
      const deliveryId = trim(row?.delivery_id);
      const latestReplay = latestReplayByOriginal.get(deliveryId);
      const replayAgeMs = nowMs - isoMs(latestReplay?.created_at);
      const replayBackoffMs = replayBackoffMsForRow(row, input.replayBackoffMsDefault);
      return (
        matchesReplayable(row) &&
        matchesOwner(row, trim(input.owner)) &&
        matchesOwnerMode(row, trim(input.ownerMode)) &&
        matchesBacklog(row, trim(input.backlog)) &&
        matchesSlaStatus(row, trim(input.slaStatus)) &&
        deliveryId.length > 0 &&
        latestReplay != null &&
        String(latestReplay?.status || "") !== "sent" &&
        replayBackoffMs > 0 &&
        replayAgeMs >= 0 &&
        replayAgeMs < replayBackoffMs
      );
    },
  ).length;
  if (ids.length === 0) {
    return {
      ok: true,
      matched: 0,
      replayed: 0,
      failed: 0,
      skipped: 0,
      skipped_already_replayed: skippedAlreadyReplayed,
      skipped_backoff: skippedBackoff,
      dry_run_rows: 0,
      ids: [],
      response: null,
    };
  }
  const response = await replayDeliveries({
    baseUrl: input.baseUrl,
    adminToken: input.adminToken,
    ids,
    overrideTarget: input.overrideTarget,
    dryRun: input.dryRun,
  });
  const data: any = response.data ?? {};
  return {
    ok: true,
    matched: ids.length,
    replayed: Number(data.replayed || 0),
    failed: Number(data.failed || 0),
    skipped: Number(data.skipped || 0),
    skipped_already_replayed: skippedAlreadyReplayed,
    skipped_backoff: skippedBackoff,
    dry_run_rows: Number(data.dry_run_rows || 0),
    ids,
    response,
  };
}

async function main() {
  const baseUrl = trim(argValue("--base-url") || process.env.AIONIS_BASE_URL || "http://127.0.0.1:3001");
  const adminToken = trim(argValue("--admin-token") || process.env.AIONIS_ADMIN_TOKEN || process.env.ADMIN_TOKEN || "");
  if (!adminToken) throw new Error("AIONIS_ADMIN_TOKEN, ADMIN_TOKEN, or --admin-token is required");

  const tenantId = trim(argValue("--tenant-id") || process.env.MEMORY_TENANT_ID || "");
  const eventType = trim(argValue("--event-type") || process.env.HOSTED_ALERT_DELIVERY_REPLAY_EVENT_TYPE || "automation.slo.success_rate");
  const owner = trim(argValue("--owner") || process.env.HOSTED_ALERT_DELIVERY_REPLAY_OWNER || "");
  const ownerMode = trim(argValue("--owner-mode") || process.env.HOSTED_ALERT_DELIVERY_REPLAY_OWNER_MODE || "any");
  const backlog = trim(argValue("--backlog") || process.env.HOSTED_ALERT_DELIVERY_REPLAY_BACKLOG || "replay_backlog");
  const slaStatus = trim(argValue("--sla-status") || process.env.HOSTED_ALERT_DELIVERY_REPLAY_SLA_STATUS || "any");
  const overrideTarget = trim(argValue("--override-target") || process.env.HOSTED_ALERT_DELIVERY_REPLAY_OVERRIDE_TARGET || "");
  const limit = asInt(argValue("--limit") || process.env.HOSTED_ALERT_DELIVERY_REPLAY_LIMIT, 20, 1, 200);
  const dryRun = hasFlag("--dry-run");
  const once = hasFlag("--once");
  const allowAlreadyReplayed = hasFlag("--allow-already-replayed");
  const replayBackoffRaw = argValue("--replay-backoff-seconds") || process.env.HOSTED_ALERT_DELIVERY_REPLAY_BACKOFF_SECONDS || null;
  const replayBackoffSeconds = replayBackoffRaw == null ? null : asInt(replayBackoffRaw, 300, 0, 7 * 24 * 3600);
  const intervalMs = asInt(argValue("--interval-ms") || process.env.HOSTED_ALERT_DELIVERY_REPLAY_INTERVAL_MS, 5000, 250, 24 * 3600 * 1000);
  const maxRuns = asInt(argValue("--max-runs") || process.env.HOSTED_ALERT_DELIVERY_REPLAY_MAX_RUNS, 0, 0, 100000);

  if (once) {
    const out = await replayOnce({
      baseUrl,
      adminToken,
      tenantId: tenantId || undefined,
      eventType,
      limit,
      owner: owner || undefined,
      ownerMode: ownerMode || undefined,
      backlog: backlog || undefined,
      slaStatus: slaStatus || undefined,
      overrideTarget: overrideTarget || undefined,
      dryRun,
      allowAlreadyReplayed,
      replayBackoffMsDefault: replayBackoffSeconds == null ? null : replayBackoffSeconds * 1000,
    });
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ hosted: true, watch: false, dry_run: dryRun, base_url: baseUrl, tenant_id: tenantId || null, event_type: eventType, owner: owner || null, owner_mode: ownerMode || "any", backlog: backlog || null, sla_status: slaStatus || "any", allow_already_replayed: allowAlreadyReplayed, replay_backoff_seconds: replayBackoffSeconds, replay_backoff_source: replayBackoffSeconds == null ? "route_policy" : "cli_or_env", ...out }, null, 2));
    return;
  }

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ok: true, hosted: true, watch: true, dry_run: dryRun, base_url: baseUrl, tenant_id: tenantId || null, event_type: eventType, owner: owner || null, owner_mode: ownerMode || "any", backlog: backlog || null, sla_status: slaStatus || "any", allow_already_replayed: allowAlreadyReplayed, replay_backoff_seconds: replayBackoffSeconds, replay_backoff_source: replayBackoffSeconds == null ? "route_policy" : "cli_or_env", interval_ms: intervalMs, max_runs: maxRuns || null }, null, 2));
  let iteration = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    iteration += 1;
    const out = await replayOnce({
      baseUrl,
      adminToken,
      tenantId: tenantId || undefined,
      eventType,
      limit,
      owner: owner || undefined,
      ownerMode: ownerMode || undefined,
      backlog: backlog || undefined,
      slaStatus: slaStatus || undefined,
      overrideTarget: overrideTarget || undefined,
      dryRun,
      allowAlreadyReplayed,
      replayBackoffMsDefault: replayBackoffSeconds == null ? null : replayBackoffSeconds * 1000,
    });
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ ts: new Date().toISOString(), iteration, ...out }, null, 2));
    if (maxRuns > 0 && iteration >= maxRuns) return;
    await sleep(intervalMs);
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});
