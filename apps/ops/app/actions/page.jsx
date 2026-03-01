import ControlActions from "@/app/components/control-actions";

export const dynamic = "force-dynamic";

export default function ActionsPage() {
  const hasAdminToken = Boolean(process.env.AIONIS_ADMIN_TOKEN?.trim() || process.env.ADMIN_TOKEN?.trim());
  const dangerousActionsEnabled = String(process.env.OPS_DANGEROUS_ACTIONS_ENABLED ?? "").trim().toLowerCase() === "true"
    || String(process.env.OPS_DANGEROUS_ACTIONS_ENABLED ?? "").trim() === "1";

  return (
    <div className="ops-page">
      <section className="hero panel">
        <p className="kicker">Aionis Control Actions</p>
        <h1>Admin Write Operations</h1>
        <p className="muted">
          Execute high-signal admin operations from one place. This page uses Ops server-side token forwarding and only
          targets documented `/v1/admin/control/*` endpoints.
        </p>
        <p className="muted">
          Workflow: run preview (dry-run) first, confirm risk level, then execute write path and jump to audit trace.
        </p>
      </section>
      <section className={`panel ${dangerousActionsEnabled ? "" : "warning"}`}>
        <h3>Dangerous Actions</h3>
        <p>
          {dangerousActionsEnabled
            ? "`OPS_DANGEROUS_ACTIONS_ENABLED=true` (enabled): non-dry-run replay and tenant quota delete are allowed."
            : "`OPS_DANGEROUS_ACTIONS_ENABLED` is not enabled: non-dry-run replay / allow-all-tenants replay and tenant quota delete are blocked."}
        </p>
      </section>
      {hasAdminToken ? (
        <ControlActions dangerousActionsEnabled={dangerousActionsEnabled} />
      ) : (
        <section className="panel warning">
          <h3>Admin token missing</h3>
          <p>
            Set `AIONIS_ADMIN_TOKEN` (or `ADMIN_TOKEN`) in Ops runtime env first. Write operations are blocked until
            admin token is configured.
          </p>
        </section>
      )}
    </div>
  );
}
