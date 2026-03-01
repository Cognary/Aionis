import { fetchOps, formatIso, formatNumber, readAuditQuery, withQuery } from "@/app/lib";
import AuditCopyActions from "@/app/components/audit-copy-actions";

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
  if (raw.includes("delete") || raw.includes("replay")) return { label: "high", className: "risk-high" };
  if (raw.includes("revoke") || raw.includes("rotate") || raw.includes("status")) return { label: "medium", className: "risk-medium" };
  return { label: "low", className: "risk-low" };
}

export default async function OpsAuditPage({ searchParams }) {
  const query = readAuditQuery(searchParams);
  const hasAdminToken = Boolean(process.env.AIONIS_ADMIN_TOKEN?.trim() || process.env.ADMIN_TOKEN?.trim());

  if (!hasAdminToken) {
    return (
      <div className="ops-page">
        <section className="panel">
          <p className="kicker">Aionis Audit</p>
          <h1>Write Operation Audit</h1>
          <p className="muted">
            Filtered view over `/v1/admin/control/audit-events` focused on control-plane write operations.
          </p>
        </section>
        <section className="panel warning">
          <h3>Admin token missing</h3>
          <p>
            Set `AIONIS_ADMIN_TOKEN` (or `ADMIN_TOKEN`) in Ops runtime env first. Audit page requires admin token.
          </p>
        </section>
      </div>
    );
  }

  const auditResult = await fetchOps(
    withQuery("/v1/admin/control/audit-events", {
      tenant_id: query.tenantId,
      action: query.action || undefined,
      limit: query.limit,
      offset: query.offset
    }),
    { admin: true }
  );

  const allEvents = Array.isArray(auditResult.data?.events) ? auditResult.data.events : [];
  const rows = query.writeOnly ? allEvents.filter((event) => isWriteLikeAction(event?.action)) : allEvents;
  const focusRequestId = String(query.focusRequestId || "").trim();
  const focusedIndex = focusRequestId
    ? rows.findIndex((event) => String(event?.request_id || "").trim() === focusRequestId)
    : query.focusLatest && rows.length > 0
      ? 0
      : -1;
  const focusRelativeHref = `${withQuery("/audit", {
    tenant_id: query.tenantId,
    action: query.action || undefined,
    limit: query.limit,
    offset: query.offset,
    write_only: query.writeOnly ? "1" : "0",
    focus_request_id: focusRequestId || undefined,
    focus_latest: !focusRequestId && query.focusLatest ? "1" : undefined
  })}#focus-row`;

  const highCount = rows.filter((event) => classifyRisk(event?.action).label === "high").length;
  const mediumCount = rows.filter((event) => classifyRisk(event?.action).label === "medium").length;

  return (
    <div className="ops-page">
      <section className="hero panel">
        <div>
          <p className="kicker">Aionis Audit</p>
          <h1>Write Operation Audit</h1>
          <p className="muted">
            Focused audit stream for control-plane writes. Use this page to spot risky operations quickly and trace
            actor/action/resource tuples.
          </p>
        </div>

        <form className="filters" action="/audit" method="GET">
          <label>
            tenant_id
            <input type="text" name="tenant_id" defaultValue={query.tenantId} maxLength={128} />
          </label>
          <label>
            action (exact, optional)
            <input type="text" name="action" defaultValue={query.action} maxLength={128} placeholder="tenant_quota.delete" />
          </label>
          <label>
            limit
            <input type="number" name="limit" defaultValue={query.limit} min={1} max={500} />
          </label>
          <label>
            offset
            <input type="number" name="offset" defaultValue={query.offset} min={0} max={100000} />
          </label>
          <label>
            write_only
            <select name="write_only" defaultValue={query.writeOnly ? "1" : "0"}>
              <option value="1">on (recommended)</option>
              <option value="0">off (show all)</option>
            </select>
          </label>
          <button type="submit">Refresh Audit</button>
        </form>
      </section>

      <section className="grid-4">
        <article className="panel stat">
          <p>query total</p>
          <h3>{formatNumber(allEvents.length)}</h3>
        </article>
        <article className="panel stat">
          <p>displayed</p>
          <h3>{formatNumber(rows.length)}</h3>
        </article>
        <article className="panel stat">
          <p>high risk</p>
          <h3>{formatNumber(highCount)}</h3>
        </article>
        <article className="panel stat">
          <p>medium risk</p>
          <h3>{formatNumber(mediumCount)}</h3>
        </article>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Audit Events</h2>
          <span className={`status ${auditResult.ok ? "status-ok" : "status-err"}`}>
            {auditResult.ok ? `OK ${auditResult.status}` : `ERR ${auditResult.status || 0}`}
          </span>
        </div>
        {focusRequestId ? (
          <div className="focus-meta">
            <p className="muted" style={{ marginTop: 0, marginBottom: "0.4rem" }}>
              Focus request_id: <span className="mono">{focusRequestId}</span>{" "}
              {focusedIndex >= 0 ? "(matched and highlighted)" : "(not found in current result set)"}
            </p>
            <AuditCopyActions requestId={focusRequestId} relativeHref={focusRelativeHref} />
          </div>
        ) : null}
        {!focusRequestId && query.focusLatest && rows.length > 0 ? (
          <div className="focus-meta">
            <p className="muted" style={{ marginTop: 0, marginBottom: "0.4rem" }}>
              Focus mode: latest event highlighted.
            </p>
            <AuditCopyActions requestId="" relativeHref={focusRelativeHref} />
          </div>
        ) : null}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>created_at</th>
                <th>risk</th>
                <th>actor</th>
                <th>action</th>
                <th>resource</th>
                <th>request_id</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((event, index) => {
                const risk = classifyRisk(event?.action);
                const key = String(event?.event_id || event?.id || `${event?.created_at || "na"}-${index}`);
                return (
                  <tr
                    key={key}
                    id={index === focusedIndex ? "focus-row" : undefined}
                    className={index === focusedIndex ? "focus-row" : undefined}
                  >
                    <td>{formatIso(event?.created_at)}</td>
                    <td>
                      <span className={`risk-badge ${risk.className}`}>{risk.label}</span>
                    </td>
                    <td>{String(event?.actor ?? "-")}</td>
                    <td>{String(event?.action ?? "-")}</td>
                    <td>{String(event?.resource_type ?? "-")}:{String(event?.resource_id ?? "-")}</td>
                    <td className="mono">{String(event?.request_id ?? "-")}</td>
                  </tr>
                );
              })}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty">No audit events</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
