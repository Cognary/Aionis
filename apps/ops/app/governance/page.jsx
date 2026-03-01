import {
  fetchOps,
  formatIso,
  formatNumber,
  formatPct,
  postOps,
  readGovernanceQuery,
  withQuery
} from "@/app/lib";

export const dynamic = "force-dynamic";

const WRITE_ACTION_HINTS = [
  "create",
  "upsert",
  "revoke",
  "rotate",
  "status",
  "enqueue",
  "replay",
  "delete"
];

function isWriteLikeAction(action) {
  const raw = String(action || "").trim().toLowerCase();
  if (!raw) return false;
  return WRITE_ACTION_HINTS.some((hint) => raw.includes(hint));
}

function classifyRisk(action) {
  const raw = String(action || "").trim().toLowerCase();
  if (raw.includes("delete") || raw.includes("replay")) return "high";
  if (raw.includes("revoke") || raw.includes("rotate") || raw.includes("status")) return "medium";
  return "low";
}

function StatusChip({ result }) {
  if (result?.skipped) return <span className="status status-skip">Skipped</span>;
  if (result?.ok) return <span className="status status-ok">OK {result.status}</span>;
  return <span className="status status-err">ERR {result?.status || 0}</span>;
}

export default async function GovernancePage({ searchParams }) {
  const query = readGovernanceQuery(searchParams);
  const tenant = encodeURIComponent(query.tenantId);
  const hasAdminToken = Boolean(process.env.AIONIS_ADMIN_TOKEN?.trim() || process.env.ADMIN_TOKEN?.trim());
  const decisionRequested = query.decisionId.length > 0;

  const requests = {
    dashboard: fetchOps(`/v1/admin/control/dashboard/tenant/${tenant}`, { admin: true }),
    diagnostics: fetchOps(
      withQuery(`/v1/admin/control/diagnostics/tenant/${tenant}`, {
        window_minutes: Math.max(5, Math.min(1440, query.windowHours * 60)),
        scope: query.scope || undefined
      }),
      { admin: true }
    ),
    audit: fetchOps(
      withQuery("/v1/admin/control/audit-events", {
        tenant_id: query.tenantId,
        limit: query.auditLimit
      }),
      { admin: true }
    )
  };

  const [dashboardResult, diagnosticsResult, auditResult] = await Promise.all([
    requests.dashboard,
    requests.diagnostics,
    requests.audit
  ]);

  const decisionResult = decisionRequested
    ? await postOps(
        "/v1/memory/tools/decision",
        {
          tenant_id: query.tenantId,
          scope: query.scope || undefined,
          decision_id: query.decisionId
        },
        { memoryAuth: true }
      )
    : {
        ok: false,
        skipped: true,
        status: 0,
        data: null,
        error: "decision_id_not_provided",
        auth: null
      };

  const dashboard = dashboardResult.data?.dashboard ?? null;
  const diagnostics = diagnosticsResult.data?.diagnostics ?? null;
  const endpointRows = Array.isArray(diagnostics?.request_telemetry?.endpoints)
    ? diagnostics.request_telemetry.endpoints
    : [];
  const recallTextRow = endpointRows.find((row) => String(row?.endpoint || "") === "recall_text") || null;
  const writeRow = endpointRows.find((row) => String(row?.endpoint || "") === "write") || null;
  const outboxTotals = diagnostics?.outbox?.totals ?? {};

  const auditEvents = Array.isArray(auditResult.data?.events) ? auditResult.data.events : [];
  const writeAuditEvents = auditEvents.filter((event) => isWriteLikeAction(event?.action));
  const highRiskWrites = writeAuditEvents.filter((event) => classifyRisk(event?.action) === "high");
  const replayWrites = writeAuditEvents.filter((event) => String(event?.action || "").toLowerCase().includes("replay"));
  const decision = decisionResult.data?.decision ?? null;

  const commandScope = query.scope || "default";
  const commandLines = [
    `npm run -s job:execution-loop-gate -- --scope ${commandScope} --strict-warnings`,
    `npm run -s job:governance-weekly-report -- --scope ${commandScope} --strict-warnings`,
    "npm run -s bench:aionis:v01 -- --suites xmb"
  ].join("\n");

  const adminSkipped = !hasAdminToken || dashboardResult.skipped || diagnosticsResult.skipped || auditResult.skipped;

  return (
    <div className="ops-page">
      <section className="hero panel">
        <div>
          <p className="kicker">Aionis Governance Surface</p>
          <h1>Governance, Replay, and Audit</h1>
          <p className="muted">
            Operational view for execution-loop health and traceability. Use this page to inspect rule execution signals,
            high-risk writes, and tool decision replay evidence.
          </p>
        </div>

        <form className="filters" action="/governance" method="GET">
          <label>
            tenant_id
            <input type="text" name="tenant_id" defaultValue={query.tenantId} maxLength={128} />
          </label>
          <label>
            scope (optional)
            <input type="text" name="scope" defaultValue={query.scope} maxLength={256} />
          </label>
          <label>
            window_hours
            <input type="number" name="window_hours" defaultValue={query.windowHours} min={1} max={720} />
          </label>
          <label>
            audit_limit
            <input type="number" name="audit_limit" defaultValue={query.auditLimit} min={10} max={500} />
          </label>
          <label>
            decision_id (optional)
            <input type="text" name="decision_id" defaultValue={query.decisionId} maxLength={128} />
          </label>
          <button type="submit">Refresh Governance View</button>
        </form>
      </section>

      {adminSkipped ? (
        <section className="panel warning">
          <h3>Admin data unavailable</h3>
          <p>
            Set `AIONIS_ADMIN_TOKEN` (or `ADMIN_TOKEN`) in Ops runtime environment to load dashboard/diagnostics/audit
            governance signals.
          </p>
        </section>
      ) : null}

      <section className="grid-4">
        <article className="panel stat">
          <p>active rules</p>
          <h3>{formatNumber(dashboard?.data_plane?.active_rules)}</h3>
          <StatusChip result={dashboardResult} />
        </article>
        <article className="panel stat">
          <p>recall_text error rate</p>
          <h3>{formatPct(recallTextRow?.error_rate)}</h3>
          <StatusChip result={diagnosticsResult} />
        </article>
        <article className="panel stat">
          <p>outbox failed</p>
          <h3>{formatNumber(outboxTotals?.failed)}</h3>
          <StatusChip result={diagnosticsResult} />
        </article>
        <article className="panel stat">
          <p>high-risk writes</p>
          <h3>{formatNumber(highRiskWrites.length)}</h3>
          <StatusChip result={auditResult} />
        </article>
      </section>

      <section className="grid-2">
        <article className="panel">
          <div className="panel-head">
            <h2>Execution Loop Snapshot</h2>
            <StatusChip result={diagnosticsResult} />
          </div>
          <div className="kv">
            <p>window_hours</p>
            <p>{query.windowHours}</p>
            <p>recall_text total</p>
            <p>{formatNumber(recallTextRow?.total)}</p>
            <p>recall_text p95</p>
            <p>{formatNumber(recallTextRow?.latency_p95_ms)} ms</p>
            <p>write total</p>
            <p>{formatNumber(writeRow?.total)}</p>
            <p>write p95</p>
            <p>{formatNumber(writeRow?.latency_p95_ms)} ms</p>
            <p>outbox pending/retrying/failed</p>
            <p>
              {formatNumber(outboxTotals?.pending)} / {formatNumber(outboxTotals?.retrying)} / {formatNumber(outboxTotals?.failed)}
            </p>
          </div>
        </article>

        <article className="panel">
          <div className="panel-head">
            <h2>Decision Replay Inspector</h2>
            <StatusChip result={decisionResult} />
          </div>
          {!decisionRequested ? (
            <p className="muted">Provide `decision_id` to load persisted decision provenance for replay debug.</p>
          ) : decisionResult.ok && decision ? (
            <div className="kv">
              <p>decision_id</p>
              <p className="mono">{String(decision.decision_id || "-")}</p>
              <p>decision_kind</p>
              <p>{String(decision.decision_kind || "-")}</p>
              <p>run_id</p>
              <p>{String(decision.run_id || "-")}</p>
              <p>selected_tool</p>
              <p>{String(decision.selected_tool || "-")}</p>
              <p>source_rule_ids</p>
              <p>{Array.isArray(decision.source_rule_ids) ? decision.source_rule_ids.length : 0}</p>
              <p>created_at</p>
              <p>{formatIso(decision.created_at)}</p>
              <p>policy_sha256</p>
              <p className="mono">{String(decision.policy_sha256 || "-")}</p>
            </div>
          ) : (
            <div>
              <p className="muted">
                Decision lookup failed. error=`{String(decisionResult.error || "unknown")}` status=
                {String(decisionResult.status || 0)}
              </p>
              {decisionResult.auth ? (
                <p className="muted">
                  memory auth: api_key={String(decisionResult.auth.has_api_key)} bearer={String(decisionResult.auth.has_bearer)}
                </p>
              ) : null}
            </div>
          )}
        </article>
      </section>

      <section className="grid-2">
        <article className="panel">
          <div className="panel-head">
            <h2>Audit Risk Slice</h2>
            <StatusChip result={auditResult} />
          </div>
          <div className="kv">
            <p>write-like events</p>
            <p>{formatNumber(writeAuditEvents.length)}</p>
            <p>replay-related writes</p>
            <p>{formatNumber(replayWrites.length)}</p>
            <p>high risk writes</p>
            <p>{formatNumber(highRiskWrites.length)}</p>
          </div>
          <div className="table-wrap" style={{ marginTop: "0.8rem" }}>
            <table>
              <thead>
                <tr>
                  <th>created_at</th>
                  <th>risk</th>
                  <th>action</th>
                  <th>request_id</th>
                </tr>
              </thead>
              <tbody>
                {writeAuditEvents.slice(0, 12).map((event, index) => (
                  <tr key={String(event?.event_id || `${event?.created_at || "na"}-${index}`)}>
                    <td>{formatIso(event?.created_at)}</td>
                    <td>{classifyRisk(event?.action)}</td>
                    <td>{String(event?.action || "-")}</td>
                    <td className="mono">{String(event?.request_id || "-")}</td>
                  </tr>
                ))}
                {writeAuditEvents.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="empty">No write-like audit events</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel">
          <div className="panel-head">
            <h2>Evidence Commands</h2>
            <span className="status status-ok">Runbook</span>
          </div>
          <p className="muted">
            Run these commands in CI or release review to produce benchmark + governance evidence artifacts.
          </p>
          <pre className="replay-pre mono">{commandLines}</pre>
        </article>
      </section>
    </div>
  );
}
