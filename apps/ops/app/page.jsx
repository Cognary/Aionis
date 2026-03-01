import {
  fetchOps,
  formatIso,
  formatMs,
  formatNumber,
  formatPct,
  readDashboardQuery,
  withQuery
} from "@/app/lib";

export const dynamic = "force-dynamic";

const HIGH_RISK_HINTS = ["delete", "replay"];

function StatusChip({ result }) {
  if (result?.skipped) return <span className="status status-skip">Skipped</span>;
  if (result?.ok) return <span className="status status-ok">OK {result.status}</span>;
  return <span className="status status-err">ERR {result?.status || 0}</span>;
}

function isHighRiskAction(action) {
  const raw = String(action || "").trim().toLowerCase();
  if (!raw) return false;
  return HIGH_RISK_HINTS.some((hint) => raw.includes(hint));
}

function EndpointOptions({ endpointFilter }) {
  return (
    <select name="endpoint" defaultValue={endpointFilter}>
      <option value="">all endpoints</option>
      <option value="write">write</option>
      <option value="recall">recall</option>
      <option value="recall_text">recall_text</option>
    </select>
  );
}

export default async function OpsDashboardPage({ searchParams }) {
  const query = readDashboardQuery(searchParams);
  const tenant = encodeURIComponent(query.tenantId);

  const requests = {
    health: fetchOps("/health"),
    dashboard: fetchOps(`/v1/admin/control/dashboard/tenant/${tenant}`, { admin: true }),
    diagnostics: fetchOps(
      withQuery(`/v1/admin/control/diagnostics/tenant/${tenant}`, {
        window_minutes: query.windowMinutes,
        scope: query.scope || undefined
      }),
      { admin: true }
    ),
    rollup: fetchOps(
      withQuery(`/v1/admin/control/dashboard/tenant/${tenant}/incident-publish-rollup`, {
        window_hours: query.windowHours,
        sample_limit: 10
      }),
      { admin: true }
    ),
    slo: fetchOps(
      withQuery(`/v1/admin/control/dashboard/tenant/${tenant}/incident-publish-slo`, {
        window_hours: 24,
        baseline_hours: 24 * 7
      }),
      { admin: true }
    ),
    timeseries: fetchOps(
      withQuery(`/v1/admin/control/dashboard/tenant/${tenant}/timeseries`, {
        window_hours: query.windowHours,
        endpoint: query.endpointFilter || undefined,
        limit: 120
      }),
      { admin: true }
    ),
    keyUsage: fetchOps(
      withQuery(`/v1/admin/control/dashboard/tenant/${tenant}/key-usage`, {
        window_hours: 24,
        baseline_hours: 24 * 7,
        endpoint: query.endpointFilter || undefined,
        limit: 50,
        min_requests: 20
      }),
      { admin: true }
    ),
    audit: fetchOps(
      withQuery("/v1/admin/control/audit-events", {
        tenant_id: query.tenantId,
        limit: 20
      }),
      { admin: true }
    )
  };

  const [
    healthResult,
    dashboardResult,
    diagnosticsResult,
    rollupResult,
    sloResult,
    timeseriesResult,
    keyUsageResult,
    auditResult
  ] = await Promise.all([
    requests.health,
    requests.dashboard,
    requests.diagnostics,
    requests.rollup,
    requests.slo,
    requests.timeseries,
    requests.keyUsage,
    requests.audit
  ]);

  const dashboard = dashboardResult.data?.dashboard ?? null;
  const diagnostics = diagnosticsResult.data?.diagnostics ?? null;
  const rollup = rollupResult.data?.rollup ?? null;
  const slo = sloResult.data?.report ?? null;
  const timeseries = timeseriesResult.data ?? null;
  const keyUsage = keyUsageResult.data ?? null;
  const auditEvents = Array.isArray(auditResult.data?.events) ? auditResult.data.events : [];

  const endpointRows = Array.isArray(diagnostics?.request_telemetry?.endpoints)
    ? diagnostics.request_telemetry.endpoints
    : [];
  const timeseriesRows = Array.isArray(timeseries?.series) ? timeseries.series.slice(0, 24) : [];
  const keyUsageRows = Array.isArray(keyUsage?.items) ? keyUsage.items.slice(0, 16) : [];
  const rollupFailedSample = Array.isArray(rollup?.failed_sample) ? rollup.failed_sample : [];
  const highRiskAuditCount = auditEvents.filter((event) => isHighRiskAction(event?.action)).length;
  const keyAnomalyCount = keyUsageRows.filter((row) => row?.anomaly?.is_anomaly === true).length;
  const incidentDegraded = Boolean(slo?.degraded);

  const adminSkipped = [dashboardResult, diagnosticsResult, rollupResult, sloResult, timeseriesResult, keyUsageResult, auditResult].some(
    (result) => result.skipped
  );

  return (
    <div className="ops-page">
      <section className="hero panel">
        <div>
          <p className="kicker">Runtime Control Surface</p>
          <h1>Tenant Ops Dashboard</h1>
          <p className="muted">
            Decision-first snapshot for on-call and release review. Focus on incident risk, recall/write reliability, and
            governance drift before drilling into detailed telemetry tables.
          </p>
        </div>

        <details className="filter-drawer" open>
          <summary>Filters</summary>
          <form className="filters" action="/" method="GET">
            <label>
              tenant_id
              <input type="text" name="tenant_id" defaultValue={query.tenantId} maxLength={128} />
            </label>
            <label>
              scope (optional)
              <input type="text" name="scope" defaultValue={query.scope} maxLength={256} />
            </label>
            <label>
              window_minutes
              <input type="number" name="window_minutes" defaultValue={query.windowMinutes} min={5} max={1440} />
            </label>
            <label>
              window_hours
              <input type="number" name="window_hours" defaultValue={query.windowHours} min={1} max={720} />
            </label>
            <label>
              endpoint filter
              <EndpointOptions endpointFilter={query.endpointFilter} />
            </label>
            <button type="submit">Refresh Snapshot</button>
          </form>
        </details>
      </section>

      <section className="priority-grid">
        <article className={`panel stat priority ${incidentDegraded ? "priority-high" : "priority-ok"}`}>
          <p>incident publish</p>
          <h3>{incidentDegraded ? "Degraded" : "Healthy"}</h3>
          <StatusChip result={sloResult} />
        </article>
        <article className={`panel stat priority ${Number(diagnostics?.outbox?.totals?.failed || 0) > 0 ? "priority-high" : "priority-ok"}`}>
          <p>outbox failed</p>
          <h3>{formatNumber(diagnostics?.outbox?.totals?.failed)}</h3>
          <StatusChip result={diagnosticsResult} />
        </article>
        <article className={`panel stat priority ${highRiskAuditCount > 0 ? "priority-warn" : "priority-ok"}`}>
          <p>high-risk audit writes</p>
          <h3>{formatNumber(highRiskAuditCount)}</h3>
          <StatusChip result={auditResult} />
        </article>
        <article className={`panel stat priority ${keyAnomalyCount > 0 ? "priority-warn" : "priority-ok"}`}>
          <p>api key anomalies</p>
          <h3>{formatNumber(keyAnomalyCount)}</h3>
          <StatusChip result={keyUsageResult} />
        </article>
      </section>

      <section className="grid-4">
        <article className="panel stat">
          <p>API base</p>
          <h3>{healthResult.baseUrl}</h3>
          <StatusChip result={healthResult} />
        </article>
        <article className="panel stat">
          <p>memory_store_backend</p>
          <h3>{String(healthResult.data?.memory_store_backend ?? "-")}</h3>
          <StatusChip result={healthResult} />
        </article>
        <article className="panel stat">
          <p>tenant</p>
          <h3>{query.tenantId}</h3>
          <StatusChip result={dashboardResult} />
        </article>
        <article className="panel stat">
          <p>diagnostics window</p>
          <h3>{query.windowMinutes} min</h3>
          <StatusChip result={diagnosticsResult} />
        </article>
      </section>

      {adminSkipped ? (
        <section className="panel warning">
          <h3>Admin token missing</h3>
          <p>
            This page can reach `/health`, but admin routes were skipped because no token was found. Set
            `AIONIS_ADMIN_TOKEN` (or `ADMIN_TOKEN`) in the Ops app runtime environment.
          </p>
        </section>
      ) : null}

      <section className="grid-2">
        <article className="panel">
          <div className="panel-head">
            <h2>Runtime Health</h2>
            <StatusChip result={healthResult} />
          </div>
          <div className="kv">
            <p>database_target_hash</p>
            <p>{String(healthResult.data?.database_target_hash ?? "-")}</p>
            <p>embedded runtime</p>
            <p>{String(healthResult.data?.memory_store_embedded_runtime ?? "-")}</p>
            <p>feature capabilities</p>
            <p className="mono">{JSON.stringify(healthResult.data?.memory_store_feature_capabilities ?? {}, null, 0)}</p>
          </div>
        </article>

        <article className="panel">
          <div className="panel-head">
            <h2>Tenant Snapshot</h2>
            <StatusChip result={dashboardResult} />
          </div>
          <div className="kv">
            <p>tenant status</p>
            <p>{String(dashboard?.tenant?.status ?? "-")}</p>
            <p>nodes / edges</p>
            <p>
              {formatNumber(dashboard?.data_plane?.nodes)} / {formatNumber(dashboard?.data_plane?.edges)}
            </p>
            <p>active rules</p>
            <p>{formatNumber(dashboard?.data_plane?.active_rules)}</p>
            <p>recalls_24h / commits_24h</p>
            <p>
              {formatNumber(dashboard?.data_plane?.recalls_24h)} / {formatNumber(dashboard?.data_plane?.commits_24h)}
            </p>
            <p>outbox pending/retrying/failed</p>
            <p>
              {formatNumber(dashboard?.outbox?.pending)} / {formatNumber(dashboard?.outbox?.retrying)} / {formatNumber(dashboard?.outbox?.failed)}
            </p>
          </div>
        </article>
      </section>

      <section className="grid-2">
        <article className="panel">
          <div className="panel-head">
            <h2>Request Telemetry</h2>
            <StatusChip result={diagnosticsResult} />
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>endpoint</th>
                  <th>total</th>
                  <th>err_rate</th>
                  <th>p95</th>
                  <th>p99</th>
                </tr>
              </thead>
              <tbody>
                {endpointRows.map((row) => (
                  <tr key={String(row.endpoint)}>
                    <td>{String(row.endpoint)}</td>
                    <td>{formatNumber(row.total)}</td>
                    <td>{formatPct(row.error_rate)}</td>
                    <td>{formatMs(row.latency_p95_ms)}</td>
                    <td>{formatMs(row.latency_p99_ms)}</td>
                  </tr>
                ))}
                {endpointRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="empty">No telemetry rows</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel">
          <div className="panel-head">
            <h2>Recall Pipeline</h2>
            <StatusChip result={diagnosticsResult} />
          </div>
          <div className="kv">
            <p>total</p>
            <p>{formatNumber(diagnostics?.recall_pipeline?.total)}</p>
            <p>empty_seed / empty_nodes / empty_edges</p>
            <p>
              {formatNumber(diagnostics?.recall_pipeline?.empty_seed)} / {formatNumber(diagnostics?.recall_pipeline?.empty_nodes)} / {formatNumber(diagnostics?.recall_pipeline?.empty_edges)}
            </p>
            <p>empty_seed_rate</p>
            <p>{formatPct(diagnostics?.recall_pipeline?.empty_seed_rate)}</p>
            <p>seed_avg / node_avg / edge_avg</p>
            <p>
              {formatNumber(diagnostics?.recall_pipeline?.seed_avg)} / {formatNumber(diagnostics?.recall_pipeline?.node_avg)} / {formatNumber(diagnostics?.recall_pipeline?.edge_avg)}
            </p>
            <p>outbox pending/retrying/failed</p>
            <p>
              {formatNumber(diagnostics?.outbox?.totals?.pending)} / {formatNumber(diagnostics?.outbox?.totals?.retrying)} / {formatNumber(diagnostics?.outbox?.totals?.failed)}
            </p>
          </div>
        </article>
      </section>

      <section className="grid-2">
        <article className="panel">
          <div className="panel-head">
            <h2>Incident Publish Rollup</h2>
            <StatusChip result={rollupResult} />
          </div>
          <div className="kv">
            <p>window_hours</p>
            <p>{formatNumber(rollup?.window_hours)}</p>
            <p>jobs total</p>
            <p>{formatNumber(rollup?.jobs?.total)}</p>
            <p>failed_or_dead_letter</p>
            <p>{formatNumber(rollup?.jobs?.failed_or_dead_letter)}</p>
            <p>replay candidate/replayed</p>
            <p>
              {formatNumber(rollup?.replay?.candidate_count)} / {formatNumber(rollup?.replay?.replayed_count)}
            </p>
          </div>
          <div className="table-wrap compact">
            <table>
              <thead>
                <tr>
                  <th>run_id</th>
                  <th>status</th>
                  <th>attempts</th>
                </tr>
              </thead>
              <tbody>
                {rollupFailedSample.map((row) => (
                  <tr key={String(row.id)}>
                    <td>{String(row.run_id ?? "-")}</td>
                    <td>{String(row.status ?? "-")}</td>
                    <td>
                      {formatNumber(row.attempts)} / {formatNumber(row.max_attempts)}
                    </td>
                  </tr>
                ))}
                {rollupFailedSample.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="empty">No failed/dead-letter sample</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel">
          <div className="panel-head">
            <h2>Incident Publish SLO</h2>
            <StatusChip result={sloResult} />
          </div>
          <div className="kv">
            <p>degraded</p>
            <p>{String(slo?.degraded ?? "-")}</p>
            <p>severity</p>
            <p>{String(slo?.severity ?? "none")}</p>
            <p>current failure/dead_letter rate</p>
            <p>
              {formatPct(slo?.metrics?.current?.failure_rate)} / {formatPct(slo?.metrics?.current?.dead_letter_rate)}
            </p>
            <p>threshold failure/dead_letter rate</p>
            <p>
              {formatPct(slo?.thresholds?.failure_rate_threshold)} / {formatPct(slo?.thresholds?.dead_letter_rate_threshold)}
            </p>
            <p>warning signals</p>
            <p className="mono">{Array.isArray(slo?.warning_signals) ? slo.warning_signals.join(", ") || "none" : "-"}</p>
          </div>
        </article>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Timeseries (latest buckets)</h2>
          <StatusChip result={timeseriesResult} />
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>bucket_utc</th>
                <th>endpoint</th>
                <th>total</th>
                <th>error_rate</th>
                <th>p95</th>
                <th>p99</th>
              </tr>
            </thead>
            <tbody>
              {timeseriesRows.map((row) => (
                <tr key={`${String(row.bucket_utc)}::${String(row.endpoint)}`}>
                  <td>{formatIso(row.bucket_utc)}</td>
                  <td>{String(row.endpoint)}</td>
                  <td>{formatNumber(row.total)}</td>
                  <td>{formatPct(row.error_rate)}</td>
                  <td>{formatMs(row.latency_p95_ms)}</td>
                  <td>{formatMs(row.latency_p99_ms)}</td>
                </tr>
              ))}
              {timeseriesRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty">No timeseries rows</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid-2">
        <article className="panel">
          <div className="panel-head">
            <h2>Key Usage Anomaly</h2>
            <StatusChip result={keyUsageResult} />
          </div>
          <div className="table-wrap compact">
            <table>
              <thead>
                <tr>
                  <th>api_key_prefix</th>
                  <th>endpoint</th>
                  <th>recent_total</th>
                  <th>anomaly</th>
                </tr>
              </thead>
              <tbody>
                {keyUsageRows.map((row) => (
                  <tr key={`${String(row.api_key_prefix)}::${String(row.endpoint)}`}>
                    <td className="mono">{String(row.api_key_prefix)}</td>
                    <td>{String(row.endpoint)}</td>
                    <td>{formatNumber(row.recent?.total)}</td>
                    <td>{row.anomaly?.is_anomaly ? String((row.anomaly?.reasons || []).join(", ")) : "no"}</td>
                  </tr>
                ))}
                {keyUsageRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="empty">No key usage rows</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel">
          <div className="panel-head">
            <h2>Control Audit Events</h2>
            <StatusChip result={auditResult} />
          </div>
          <div className="table-wrap compact">
            <table>
              <thead>
                <tr>
                  <th>created_at</th>
                  <th>action</th>
                  <th>resource</th>
                </tr>
              </thead>
              <tbody>
                {auditEvents.slice(0, 16).map((event) => (
                  <tr key={String(event.id)}>
                    <td>{formatIso(event.created_at)}</td>
                    <td>{String(event.action ?? "-")}</td>
                    <td>{String(event.resource_type ?? "-")}:{String(event.resource_id ?? "-")}</td>
                  </tr>
                ))}
                {auditEvents.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="empty">No audit events</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </div>
  );
}
