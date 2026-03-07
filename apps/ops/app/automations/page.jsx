import {
  formatIso,
  formatNumber,
  postOps,
  readAutomationQuery
} from "@/app/lib";
import AutomationGovernanceControls from "@/app/components/automation-governance-controls";
import AutomationPromotionControls from "@/app/components/automation-promotion-controls";

export const dynamic = "force-dynamic";

function StatusChip({ tone = "skip", children }) {
  return <span className={`status status-${tone}`}>{children}</span>;
}

function toneForLifecycle(run) {
  if (!run) return "skip";
  if (run.lifecycle_state === "terminal") {
    if (run.terminal_outcome === "succeeded" || run.terminal_outcome === "failed_compensated" || run.terminal_outcome === "cancelled_compensated") {
      return "ok";
    }
    if (run.terminal_outcome === "cancelled" || run.terminal_outcome === "skipped") return "skip";
    return "err";
  }
  if (run.lifecycle_state === "paused") return "err";
  if (run.lifecycle_state === "running") return "ok";
  return "skip";
}

function toneForNode(node) {
  if (!node) return "skip";
  if (node.lifecycle_state === "terminal") {
    if (node.terminal_outcome === "succeeded" || node.terminal_outcome === "compensated") return "ok";
    if (node.terminal_outcome === "skipped") return "skip";
    return "err";
  }
  if (node.lifecycle_state === "paused") return "err";
  if (node.lifecycle_state === "running" || node.lifecycle_state === "ready") return "ok";
  return "skip";
}

function toneForReadiness(status) {
  if (status === "ready") return "ok";
  if (status === "needs_review") return "skip";
  return "err";
}

function toneForShadowVerdict(verdict) {
  if (verdict === "approved") return "ok";
  if (verdict === "needs_changes") return "skip";
  if (verdict === "rejected") return "err";
  return "skip";
}

function toneForValidationStatus(status) {
  if (status === "completed") return "ok";
  if (status === "queued" || status === "running") return "skip";
  if (status === "failed") return "err";
  return "skip";
}

function toneForCompensationAssessment(status) {
  if (status === "succeeded") return "ok";
  if (status === "retryable" || status === "running") return "skip";
  return "err";
}

function toneForCompensationWorkflowState(state) {
  if (state === "manual_cleanup_completed") return "ok";
  if (state === "manual_cleanup_in_progress" || state === "observing") return "skip";
  if (state === "engineering_escalated") return "err";
  return "skip";
}

function toneForSlaStatus(status) {
  if (status === "met" || status === "on_track") return "ok";
  if (status === "at_risk" || status === "unset") return "skip";
  if (status === "breached") return "err";
  return "skip";
}

function compensationWorkflowBucket(assessment) {
  if (!assessment || typeof assessment !== "object") return "other";
  if (assessment.retry_allowed === true) return "retry";
  if (assessment.class === "manual_cleanup_required") return "manual_cleanup";
  if (assessment.status === "running") return "observe";
  if (assessment.class === "compensation_failed_without_plan" || assessment.class === "compensation_state_unknown" || assessment.class === "compensation_not_attempted") {
    return "escalate";
  }
  return "other";
}

function labelForCompensationWorkflowAction(action) {
  switch (action) {
    case "manual_cleanup_started":
      return "manual cleanup started";
    case "manual_cleanup_completed":
      return "manual cleanup completed";
    case "engineering_escalated":
      return "engineering escalated";
    case "observation_noted":
      return "observation noted";
    default:
      return action || "-";
  }
}

function formatPercent(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return "-";
  return `${(value * 100).toFixed(1)}%`;
}

function stringifyJson(value) {
  return JSON.stringify(value, null, 2);
}

function formatNodeEvidence(node) {
  const parts = [];
  if (node.playbook_id) {
    parts.push(`${node.playbook_id}@${node.playbook_version ?? "?"}`);
  }
  if (node.playbook_run_id) parts.push(`run:${node.playbook_run_id}`);
  if (node.approval_id) parts.push(`approval:${node.approval_id}`);
  if (node.compensation_run_id) parts.push(`comp:${node.compensation_run_id}`);
  return parts.length > 0 ? parts.join("\n") : "-";
}

function summarizeShadowEvidence(nodes) {
  const approvalAutoApproved = nodes.filter(
    (node) => node.node_kind === "approval" && node.output_snapshot_json?.shadow_auto_approved === true,
  ).length;
  const simulateNodes = nodes.filter((node) => node.output_snapshot_json?.mode === "simulate").length;
  const replayLinkedNodes = nodes.filter((node) => node.playbook_run_id).length;
  return {
    approvalAutoApproved,
    simulateNodes,
    replayLinkedNodes,
  };
}

function buildActionSnippet(path, body) {
  return [
    `POST ${path}`,
    stringifyJson(body),
  ].join("\n\n");
}

function deriveRunActions(query, run, nodes) {
  if (!run) return [];
  const bodyBase = {
    tenant_id: query.tenantId,
    scope: query.scope || undefined,
    run_id: run.run_id,
  };
  const pausedNode = nodes.find((node) => node.lifecycle_state === "paused") || null;
  if (run.lifecycle_state === "paused" && pausedNode?.pause_reason === "repair_required") {
    return [
      {
        title: "Approve repaired playbook and continue",
        summary: "Use this after a newer approved repair lineage exists for the paused playbook node.",
        snippet: buildActionSnippet("/v1/automations/runs/approve_repair", {
          ...bodyBase,
          actor: "ops",
          reason: "repair approved after review"
        })
      },
      {
        title: "Reject repair and trigger cleanup",
        summary: "Use this when the repair is not acceptable and the run should fail or compensate.",
        snippet: buildActionSnippet("/v1/automations/runs/reject_repair", {
          ...bodyBase,
          actor: "ops",
          reason: "repair rejected after review"
        })
      },
      {
        title: "Cancel instead of reviewing",
        summary: "Use this when the run should stop regardless of repair quality.",
        snippet: buildActionSnippet("/v1/automations/runs/cancel", {
          ...bodyBase,
          actor: "ops",
          reason: "operator cancelled paused repair run"
        })
      }
    ];
  }
  if (run.lifecycle_state === "paused" && pausedNode?.pause_reason === "approval_required") {
    return [
      {
        title: "Resume after external approval",
        summary: "Approval nodes are resumed directly after out-of-band review is complete.",
        snippet: buildActionSnippet("/v1/automations/runs/resume", {
          ...bodyBase,
          actor: "ops",
          reason: "approval granted externally"
        })
      },
      {
        title: "Cancel instead of continuing",
        summary: "Use this when the approval gate should remain denied.",
        snippet: buildActionSnippet("/v1/automations/runs/cancel", {
          ...bodyBase,
          actor: "ops",
          reason: "approval denied"
        })
      }
    ];
  }
  if (
    run.lifecycle_state === "terminal" &&
    (run.terminal_outcome === "failed" || run.terminal_outcome === "cancelled") &&
    run.compensation_status === "failed"
  ) {
    return [
      {
        title: "Retry compensation",
        summary: "Use this after fixing the compensation playbook or compensation environment.",
        snippet: buildActionSnippet("/v1/automations/runs/compensation/retry", {
          ...bodyBase,
          actor: "ops",
          reason: "retry compensation after remediation"
        })
      }
    ];
  }
  if (run.lifecycle_state === "running") {
    return [
      {
        title: "Observe or cancel",
        summary: "No mid-run mutation is recommended unless the run is stuck or unsafe.",
        snippet: buildActionSnippet("/v1/automations/runs/cancel", {
          ...bodyBase,
          actor: "ops",
          reason: "operator cancelled running automation"
        })
      }
    ];
  }
  return [];
}

function deriveNodeHint(node, run) {
  if (node.lifecycle_state === "paused" && node.pause_reason === "repair_required") {
    return "Needs approved repaired playbook lineage before continue.";
  }
  if (node.lifecycle_state === "paused" && node.pause_reason === "approval_required") {
    return "Waiting for out-of-band approval, then resume the run.";
  }
  if (node.compensation_status === "failed") {
    return "Cleanup failed. Repair compensator, then retry compensation.";
  }
  if (run?.execution_mode === "shadow" && node.node_kind === "approval" && node.output_snapshot_json?.shadow_auto_approved === true) {
    return "Shadow auto-approved. Review evidence instead of waiting on a human.";
  }
  if (run?.execution_mode === "shadow" && node.output_snapshot_json?.mode === "simulate") {
    return "Shadow replay evidence captured in simulate mode.";
  }
  if (node.error_code) return node.error_code;
  return "-";
}

export default async function AutomationGovernancePage({ searchParams }) {
  const query = readAutomationQuery(searchParams);
  const wantsRun = query.runId.length > 0;
  const wantsAutomation = query.automationId.length > 0;
  const queueResult = await postOps(
    "/v1/automations/runs/list",
    {
      tenant_id: query.tenantId,
      scope: query.scope || undefined,
      actionable_only: true,
      reviewer: query.reviewer || undefined,
      limit: query.queueLimit,
    },
    { memoryAuth: true },
  );
  const compensationQueueResult = await postOps(
    "/v1/automations/runs/list",
    {
      tenant_id: query.tenantId,
      scope: query.scope || undefined,
      compensation_only: true,
      reviewer: query.reviewer || undefined,
      compensation_owner: query.compensationOwner || undefined,
      escalation_owner: query.escalationOwner || undefined,
      workflow_bucket: query.workflowBucket || undefined,
      sla_status: query.slaStatus || undefined,
      limit: query.queueLimit,
    },
    { memoryAuth: true },
  );
  const compensationPolicyResult = await postOps(
    "/v1/automations/compensation/policy_matrix",
    {
      tenant_id: query.tenantId,
      scope: query.scope || undefined,
    },
    { memoryAuth: true },
  );
  const telemetryResult = await postOps(
    "/v1/automations/telemetry",
    {
      tenant_id: query.tenantId,
      scope: query.scope || undefined,
      automation_id: query.automationId || undefined,
      window_hours: query.telemetryWindowHours,
      incident_limit: 8,
    },
    { memoryAuth: true },
  );
  const promotionResult = await postOps(
    "/v1/automations/list",
    {
      tenant_id: query.tenantId,
      scope: query.scope || undefined,
      promotion_only: true,
      reviewer: query.reviewer || undefined,
      limit: query.promotionLimit,
    },
    { memoryAuth: true },
  );

  const runResult = wantsRun
    ? await postOps(
        "/v1/automations/runs/get",
        {
          tenant_id: query.tenantId,
          scope: query.scope || undefined,
          run_id: query.runId,
          include_nodes: query.includeNodes,
        },
        { memoryAuth: true },
      )
    : {
        ok: false,
        skipped: true,
        status: 0,
        data: null,
        error: "run_identifier_not_provided",
        auth: null,
      };

  const run = runResult.ok ? runResult.data?.run ?? null : null;
  const nodes = Array.isArray(runResult.data?.nodes) ? runResult.data.nodes : [];
  const queueRuns = Array.isArray(queueResult.data?.runs) ? queueResult.data.runs : [];
  const compensationQueueRuns = Array.isArray(compensationQueueResult.data?.runs) ? compensationQueueResult.data.runs : [];
  const compensationPolicyMatrix = Array.isArray(compensationPolicyResult.data?.matrix) ? compensationPolicyResult.data.matrix : [];
  const telemetry = telemetryResult.ok ? telemetryResult.data ?? null : null;
  const retryableCompensationRuns = compensationQueueRuns.filter((run) => compensationWorkflowBucket(run.compensation_assessment) === "retry");
  const manualCleanupCompensationRuns = compensationQueueRuns.filter((run) => compensationWorkflowBucket(run.compensation_assessment) === "manual_cleanup");
  const escalateCompensationRuns = compensationQueueRuns.filter((run) => compensationWorkflowBucket(run.compensation_assessment) === "escalate");
  const observeCompensationRuns = compensationQueueRuns.filter((run) => compensationWorkflowBucket(run.compensation_assessment) === "observe");
  const overdueCompensationRuns = compensationQueueRuns.filter((run) => run.compensation_workflow?.sla_status === "breached");
  const unassignedCompensationRuns = compensationQueueRuns.filter((run) => !run.compensation_workflow?.assignment?.owner);
  const escalationOwnedCompensationRuns = compensationQueueRuns.filter((run) => Boolean(run.compensation_workflow?.assignment?.escalation_owner));
  const promotionAutomations = Array.isArray(promotionResult.data?.automations) ? promotionResult.data.automations : [];
  const automationLookupId = run?.automation_id || query.automationId;
  const automationLookupVersion = run?.automation_version ?? (query.version > 0 ? query.version : undefined);
  const automationResult = automationLookupId
    ? await postOps(
        "/v1/automations/get",
        {
          tenant_id: query.tenantId,
          scope: query.scope || undefined,
          automation_id: automationLookupId,
          ...(automationLookupVersion ? { version: automationLookupVersion } : {}),
        },
        { memoryAuth: true },
      )
    : {
        ok: false,
        skipped: true,
        status: 0,
        data: null,
        error: "automation_identifier_not_provided",
        auth: null,
      };
  const shadowReportResult = automationLookupId
    ? await postOps(
        "/v1/automations/shadow/report",
        {
          tenant_id: query.tenantId,
          scope: query.scope || undefined,
          automation_id: automationLookupId,
        },
        { memoryAuth: true },
      )
    : {
        ok: false,
        skipped: true,
        status: 0,
        data: null,
        error: "automation_identifier_not_provided",
        auth: null,
      };

  const automation = automationResult.ok ? automationResult.data?.automation ?? null : null;
  const validation = automationResult.ok ? automationResult.data?.validation ?? null : null;
  const shadowReport = shadowReportResult.ok ? shadowReportResult.data ?? null : null;
  const hasMemoryAuth =
    Boolean(queueResult.auth?.has_api_key || queueResult.auth?.has_bearer) ||
    Boolean(compensationQueueResult.auth?.has_api_key || compensationQueueResult.auth?.has_bearer) ||
    Boolean(compensationPolicyResult.auth?.has_api_key || compensationPolicyResult.auth?.has_bearer) ||
    Boolean(promotionResult.auth?.has_api_key || promotionResult.auth?.has_bearer) ||
    Boolean(runResult.auth?.has_api_key || runResult.auth?.has_bearer) ||
    Boolean(shadowReportResult.auth?.has_api_key || shadowReportResult.auth?.has_bearer) ||
    Boolean(automationResult.auth?.has_api_key || automationResult.auth?.has_bearer);
  const actionItems = deriveRunActions(query, run, nodes);
  const shadowEvidence = run?.execution_mode === "shadow" ? summarizeShadowEvidence(nodes) : null;

  return (
    <div className="ops-page">
      <section className="hero panel">
        <div>
          <p className="kicker">Automation Governance Surface</p>
          <h1>Automation Run Inspector</h1>
          <p className="muted">
            Operator view for actionable automation runs, paused control paths, shadow validation evidence, and
            compensation state. Inspect, decide, and issue run-scoped governance actions from the same surface.
          </p>
        </div>

        <details className="filter-drawer" open>
          <summary>Filters</summary>
          <form className="filters" action="/automations" method="GET">
            <label>
              tenant_id
              <input type="text" name="tenant_id" defaultValue={query.tenantId} maxLength={128} />
            </label>
            <label>
              scope (optional)
              <input type="text" name="scope" defaultValue={query.scope} maxLength={256} />
            </label>
            <label>
              reviewer (optional)
              <input type="text" name="reviewer" defaultValue={query.reviewer} maxLength={256} />
            </label>
            <label>
              compensation owner
              <input type="text" name="compensation_owner" defaultValue={query.compensationOwner} maxLength={256} />
            </label>
            <label>
              escalation owner
              <input type="text" name="escalation_owner" defaultValue={query.escalationOwner} maxLength={256} />
            </label>
            <label>
              workflow bucket
              <input type="text" name="workflow_bucket" defaultValue={query.workflowBucket} maxLength={32} placeholder="retry/manual_cleanup/escalate" />
            </label>
            <label>
              SLA status
              <input type="text" name="sla_status" defaultValue={query.slaStatus} maxLength={32} placeholder="breached/on_track" />
            </label>
            <label>
              telemetry window hours
              <input type="number" name="telemetry_window_hours" defaultValue={query.telemetryWindowHours} min={1} max={720} />
            </label>
            <label>
              run_id (optional)
              <input type="text" name="run_id" defaultValue={query.runId} maxLength={128} />
            </label>
            <label>
              automation_id (optional)
              <input type="text" name="automation_id" defaultValue={query.automationId} maxLength={128} />
            </label>
            <label>
              version (optional)
              <input type="number" name="version" defaultValue={query.version > 0 ? query.version : ""} min={1} max={100000} />
            </label>
            <label>
              queue_limit
              <input type="number" name="queue_limit" defaultValue={query.queueLimit} min={1} max={100} />
            </label>
            <label>
              promotion_limit
              <input type="number" name="promotion_limit" defaultValue={query.promotionLimit} min={1} max={100} />
            </label>
            <label className="checkbox-row">
              <input type="checkbox" name="include_nodes" value="true" defaultChecked={query.includeNodes} />
              include node details
            </label>
            <button type="submit">Inspect Automation</button>
          </form>
        </details>
      </section>

      {!hasMemoryAuth ? (
        <section className="panel warning">
          <h3>Memory auth missing</h3>
          <p>
            Set `AIONIS_API_KEY` or `AIONIS_AUTH_BEARER` in the Ops runtime so this page can query automation APIs.
          </p>
        </section>
      ) : null}

      {!wantsRun && !wantsAutomation ? (
        <section className="panel">
          <div className="panel-head">
            <h2>How To Use This Page</h2>
            <StatusChip tone="skip">Awaiting Input</StatusChip>
          </div>
          <div className="kv">
            <p>run_id</p>
            <p>Use this to inspect an active, paused, failed, compensated, or shadow validation run.</p>
            <p>automation_id + version</p>
            <p>Use this to inspect the current definition status and graph validation without a run.</p>
            <p>best beta use</p>
            <p>Review `repair_required`, `approval_required`, compensation failures, and shadow evidence.</p>
          </div>
        </section>
      ) : null}

      <section className="panel">
        <div className="panel-head">
          <h2>Automation Telemetry</h2>
          <StatusChip tone={telemetryResult.ok ? "ok" : "err"}>
            {telemetryResult.ok ? `${query.telemetryWindowHours}h window` : `ERR ${telemetryResult.status || 0}`}
          </StatusChip>
        </div>
        <p className="muted">
          Lightweight automation runtime health view for the current tenant/scope. This is the current GA-path telemetry
          and SLO surface, not a full alerting system.
        </p>
        {telemetry ? (
          <>
            <section className="grid-4" style={{ marginTop: "0.8rem" }}>
              <article className="panel stat">
                <p>success rate</p>
                <h3>{formatPercent(telemetry.summary?.success_rate)}</h3>
              </article>
              <article className="panel stat">
                <p>paused rate</p>
                <h3>{formatPercent(telemetry.summary?.pause_rate)}</h3>
              </article>
              <article className="panel stat">
                <p>comp failure rate</p>
                <h3>{formatPercent(telemetry.summary?.compensation_failure_rate)}</h3>
              </article>
              <article className="panel stat">
                <p>p95 duration</p>
                <h3>{telemetry.summary?.p95_duration_seconds != null ? `${formatNumber(telemetry.summary.p95_duration_seconds)}s` : "-"}</h3>
              </article>
            </section>
            <section className="grid-4">
              <article className="panel stat">
                <p>total runs</p>
                <h3>{formatNumber(telemetry.summary?.total_runs)}</h3>
              </article>
              <article className="panel stat">
                <p>paused runs</p>
                <h3>{formatNumber(telemetry.summary?.paused_runs)}</h3>
              </article>
              <article className="panel stat">
                <p>repair paused</p>
                <h3>{formatNumber(telemetry.summary?.repair_paused_runs)}</h3>
              </article>
              <article className="panel stat">
                <p>shadow runs</p>
                <h3>{formatNumber(telemetry.summary?.shadow_runs)}</h3>
              </article>
            </section>
            <section className="grid-2">
              <article className="panel">
                <div className="panel-head">
                  <h2>Automation SLO</h2>
                  <StatusChip tone={telemetry.summary?.slo?.success_rate_met === false || telemetry.summary?.slo?.compensation_failure_budget_met === false ? "err" : "ok"}>
                    {telemetry.summary?.slo?.success_rate_met === false || telemetry.summary?.slo?.compensation_failure_budget_met === false ? "At Risk" : "Within Target"}
                  </StatusChip>
                </div>
                <div className="kv">
                  <p>success target</p>
                  <p>{formatPercent(telemetry.summary?.slo?.success_rate_target)}</p>
                  <p>success met</p>
                  <p>{String(telemetry.summary?.slo?.success_rate_met ?? "-")}</p>
                  <p>comp failure budget</p>
                  <p>{formatPercent(telemetry.summary?.slo?.compensation_failure_budget_target)}</p>
                  <p>budget met</p>
                  <p>{String(telemetry.summary?.slo?.compensation_failure_budget_met ?? "-")}</p>
                </div>
              </article>
              <article className="panel">
                <div className="panel-head">
                  <h2>Top Root Causes</h2>
                  <StatusChip tone="skip">{formatNumber(Array.isArray(telemetry.root_causes) ? telemetry.root_causes.length : 0)}</StatusChip>
                </div>
                <div className="table-wrap" style={{ marginTop: "0.7rem" }}>
                  <table>
                    <thead>
                      <tr>
                        <th>root cause</th>
                        <th>count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.isArray(telemetry.root_causes) && telemetry.root_causes.length > 0 ? telemetry.root_causes.map((item) => (
                        <tr key={`root:${String(item.root_cause_code || "null")}`}>
                          <td className="mono">{String(item.root_cause_code || "-")}</td>
                          <td>{formatNumber(item.count)}</td>
                        </tr>
                      )) : (
                        <tr><td colSpan={2} className="empty">No root cause samples in current window.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </article>
            </section>
            <section className="panel">
              <div className="panel-head">
                <h2>Recent Incidents</h2>
                <StatusChip tone="skip">{formatNumber(Array.isArray(telemetry.incidents) ? telemetry.incidents.length : 0)}</StatusChip>
              </div>
              <div className="table-wrap" style={{ marginTop: "0.7rem" }}>
                <table>
                  <thead>
                    <tr>
                      <th>updated_at</th>
                      <th>run</th>
                      <th>status</th>
                      <th>root cause</th>
                      <th>action hint</th>
                      <th>open</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.isArray(telemetry.incidents) && telemetry.incidents.length > 0 ? telemetry.incidents.map((item) => (
                      <tr key={`incident:${item.run_id}`}>
                        <td>{formatIso(item.updated_at)}</td>
                        <td className="mono">{item.run_id}</td>
                        <td><StatusChip tone={toneForLifecycle(item)}>{item.status_summary}</StatusChip></td>
                        <td className="mono">{item.root_cause_code || "-"}</td>
                        <td>{item.action_hint || "-"}</td>
                        <td>
                          <a href={`/automations?tenant_id=${encodeURIComponent(query.tenantId)}&scope=${encodeURIComponent(query.scope || "")}&reviewer=${encodeURIComponent(query.reviewer || "")}&run_id=${encodeURIComponent(item.run_id)}&queue_limit=${encodeURIComponent(String(query.queueLimit))}&promotion_limit=${encodeURIComponent(String(query.promotionLimit))}&telemetry_window_hours=${encodeURIComponent(String(query.telemetryWindowHours))}`}>
                            Inspect
                          </a>
                        </td>
                      </tr>
                    )) : (
                      <tr><td colSpan={6} className="empty">No paused, failed, or compensation-failed incidents in current window.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : null}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Actionable Run Queue</h2>
          <StatusChip tone={queueResult.ok ? "ok" : "err"}>
            {queueResult.ok ? `${queueRuns.length} runs` : `ERR ${queueResult.status || 0}`}
          </StatusChip>
        </div>
        <p className="muted">
          Paused approval runs, paused repair runs, and terminal runs with failed compensation in the current tenant/scope.
        </p>
        <div className="table-wrap" style={{ marginTop: "0.7rem" }}>
          <table>
            <thead>
              <tr>
                <th>updated_at</th>
                <th>automation</th>
                <th>status</th>
                <th>comp class</th>
                <th>reviewer</th>
                <th>action hint</th>
                <th>root cause node</th>
                <th>mode</th>
                <th>open</th>
              </tr>
            </thead>
            <tbody>
              {queueRuns.map((queuedRun) => (
                <tr key={queuedRun.run_id} className={queuedRun.run_id === query.runId ? "focus-row" : undefined}>
                  <td>{formatIso(queuedRun.updated_at)}</td>
                  <td className="mono">{queuedRun.automation_id}@{queuedRun.automation_version}</td>
                  <td>
                    <StatusChip tone={toneForLifecycle(queuedRun)}>{queuedRun.status_summary}</StatusChip>
                  </td>
                  <td className="mono">{queuedRun.compensation_assessment?.class || "-"}</td>
                  <td>{queuedRun.review_assignment?.reviewer || "-"}</td>
                  <td>{queuedRun.action_hint || "-"}</td>
                  <td className="mono">{queuedRun.root_cause_node_id || "-"}</td>
                  <td>{queuedRun.execution_mode || "default"}</td>
                  <td>
                    <a
                      href={`/automations?tenant_id=${encodeURIComponent(query.tenantId)}&scope=${encodeURIComponent(query.scope || "")}&reviewer=${encodeURIComponent(query.reviewer || "")}&run_id=${encodeURIComponent(queuedRun.run_id)}&queue_limit=${encodeURIComponent(String(query.queueLimit))}&promotion_limit=${encodeURIComponent(String(query.promotionLimit))}`}
                    >
                      Inspect
                    </a>
                  </td>
                </tr>
              ))}
              {queueRuns.length === 0 ? (
                <tr>
                  <td colSpan={9} className="empty">No actionable runs in current filter.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Compensation Failures Inbox</h2>
          <StatusChip tone={compensationQueueResult.ok ? "ok" : "err"}>
            {compensationQueueResult.ok ? `${compensationQueueRuns.length} runs` : `ERR ${compensationQueueResult.status || 0}`}
          </StatusChip>
        </div>
        <p className="muted">
          Terminal runs whose cleanup path failed and now require compensation-specific operator action.
        </p>
        <div className="table-wrap" style={{ marginTop: "0.7rem" }}>
          <table>
            <thead>
              <tr>
                <th>updated_at</th>
                <th>automation</th>
                <th>status</th>
                <th>workflow</th>
                <th>workflow state</th>
                <th>owner</th>
                <th>SLA</th>
                <th>latest action</th>
                <th>comp class</th>
                <th>retry</th>
                <th>failed nodes</th>
                <th>open</th>
              </tr>
            </thead>
            <tbody>
              {compensationQueueRuns.map((queuedRun) => (
                <tr key={`comp:${queuedRun.run_id}`} className={queuedRun.run_id === query.runId ? "focus-row" : undefined}>
                  <td>{formatIso(queuedRun.updated_at)}</td>
                  <td className="mono">{queuedRun.automation_id}@{queuedRun.automation_version}</td>
                  <td>
                    <StatusChip tone={toneForLifecycle(queuedRun)}>{queuedRun.status_summary}</StatusChip>
                  </td>
                  <td>{queuedRun.compensation_workflow?.bucket || compensationWorkflowBucket(queuedRun.compensation_assessment)}</td>
                  <td>
                    <StatusChip tone={toneForCompensationWorkflowState(queuedRun.compensation_workflow?.state)}>
                      {queuedRun.compensation_workflow?.state || "unclaimed"}
                    </StatusChip>
                  </td>
                  <td>{queuedRun.compensation_workflow?.assignment?.owner || "-"}</td>
                  <td>
                    <StatusChip tone={toneForSlaStatus(queuedRun.compensation_workflow?.sla_status)}>
                      {queuedRun.compensation_workflow?.sla_status || "unset"}
                    </StatusChip>
                  </td>
                  <td>{labelForCompensationWorkflowAction(queuedRun.compensation_workflow?.latest_action?.action)}</td>
                  <td className="mono">{queuedRun.compensation_assessment?.class || "-"}</td>
                  <td>{String(queuedRun.compensation_assessment?.retry_allowed ?? false)}</td>
                  <td className="mono">
                    {Array.isArray(queuedRun.compensation_assessment?.failed_nodes)
                      ? queuedRun.compensation_assessment.failed_nodes.join(", ") || "-"
                      : "-"}
                  </td>
                  <td>
                    <a
                      href={`/automations?tenant_id=${encodeURIComponent(query.tenantId)}&scope=${encodeURIComponent(query.scope || "")}&reviewer=${encodeURIComponent(query.reviewer || "")}&run_id=${encodeURIComponent(queuedRun.run_id)}&queue_limit=${encodeURIComponent(String(query.queueLimit))}&promotion_limit=${encodeURIComponent(String(query.promotionLimit))}`}
                    >
                      Inspect
                    </a>
                  </td>
                </tr>
              ))}
              {compensationQueueRuns.length === 0 ? (
                <tr>
                  <td colSpan={12} className="empty">No compensation failures in current filter.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid-4">
        <article className="panel stat">
          <p>retryable cleanup</p>
          <h3>{formatNumber(retryableCompensationRuns.length)}</h3>
        </article>
        <article className="panel stat">
          <p>manual cleanup</p>
          <h3>{formatNumber(manualCleanupCompensationRuns.length)}</h3>
        </article>
        <article className="panel stat">
          <p>engineering escalation</p>
          <h3>{formatNumber(escalateCompensationRuns.length)}</h3>
        </article>
        <article className="panel stat">
          <p>observe only</p>
          <h3>{formatNumber(observeCompensationRuns.length)}</h3>
        </article>
      </section>

      <section className="grid-3">
        <article className="panel stat">
          <p>overdue SLA</p>
          <h3>{formatNumber(overdueCompensationRuns.length)}</h3>
        </article>
        <article className="panel stat">
          <p>unassigned cleanup</p>
          <h3>{formatNumber(unassignedCompensationRuns.length)}</h3>
        </article>
        <article className="panel stat">
          <p>escalation owners set</p>
          <h3>{formatNumber(escalationOwnedCompensationRuns.length)}</h3>
        </article>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Compensation Workflow Buckets</h2>
          <StatusChip tone="skip">Prioritize By Action</StatusChip>
        </div>
        <div className="kv">
          <p>retryable cleanup</p>
          <p>Repair failed compensators, then run `compensation/retry`.</p>
          <p>manual cleanup</p>
          <p>No compensator exists. Route to manual cleanup with explicit evidence capture.</p>
          <p>owner assignment</p>
          <p>Every manual cleanup or escalation path should have a named owner and optional escalation owner.</p>
          <p>SLA</p>
          <p>Use `sla_target_at` to make overdue cleanup visible in the queue.</p>
          <p>engineering escalation</p>
          <p>Cleanup metadata or control flow is inconsistent. Escalate before retrying.</p>
          <p>observe only</p>
          <p>Cleanup is still running or otherwise should not be retried yet.</p>
        </div>
      </section>

      <section className="grid-3">
        <article className="panel">
          <div className="panel-head">
            <h2>Overdue SLA Queue</h2>
            <StatusChip tone={overdueCompensationRuns.length > 0 ? "err" : "ok"}>
              {formatNumber(overdueCompensationRuns.length)}
            </StatusChip>
          </div>
          <div className="table-wrap" style={{ marginTop: "0.7rem" }}>
            <table>
              <thead>
                <tr>
                  <th>run</th>
                  <th>owner</th>
                  <th>sla target</th>
                </tr>
              </thead>
              <tbody>
                {overdueCompensationRuns.slice(0, 8).map((item) => (
                  <tr key={`overdue:${item.run_id}`}>
                    <td className="mono">{item.run_id}</td>
                    <td>{item.compensation_workflow?.assignment?.owner || "-"}</td>
                    <td>{formatIso(item.compensation_workflow?.assignment?.sla_target_at)}</td>
                  </tr>
                ))}
                {overdueCompensationRuns.length === 0 ? (
                  <tr><td colSpan={3} className="empty">No overdue compensation SLAs.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>
        <article className="panel">
          <div className="panel-head">
            <h2>Unassigned Cleanup Queue</h2>
            <StatusChip tone={unassignedCompensationRuns.length > 0 ? "err" : "ok"}>
              {formatNumber(unassignedCompensationRuns.length)}
            </StatusChip>
          </div>
          <div className="table-wrap" style={{ marginTop: "0.7rem" }}>
            <table>
              <thead>
                <tr>
                  <th>run</th>
                  <th>class</th>
                  <th>workflow</th>
                </tr>
              </thead>
              <tbody>
                {unassignedCompensationRuns.slice(0, 8).map((item) => (
                  <tr key={`unassigned:${item.run_id}`}>
                    <td className="mono">{item.run_id}</td>
                    <td className="mono">{item.compensation_assessment?.class || "-"}</td>
                    <td>{item.compensation_workflow?.bucket || "-"}</td>
                  </tr>
                ))}
                {unassignedCompensationRuns.length === 0 ? (
                  <tr><td colSpan={3} className="empty">No unassigned compensation runs.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>
        <article className="panel">
          <div className="panel-head">
            <h2>Escalation Owner Queue</h2>
            <StatusChip tone={escalationOwnedCompensationRuns.length > 0 ? "skip" : "ok"}>
              {formatNumber(escalationOwnedCompensationRuns.length)}
            </StatusChip>
          </div>
          <div className="table-wrap" style={{ marginTop: "0.7rem" }}>
            <table>
              <thead>
                <tr>
                  <th>run</th>
                  <th>escalation owner</th>
                  <th>state</th>
                </tr>
              </thead>
              <tbody>
                {escalationOwnedCompensationRuns.slice(0, 8).map((item) => (
                  <tr key={`esc-owner:${item.run_id}`}>
                    <td className="mono">{item.run_id}</td>
                    <td>{item.compensation_workflow?.assignment?.escalation_owner || "-"}</td>
                    <td>{item.compensation_workflow?.state || "-"}</td>
                  </tr>
                ))}
                {escalationOwnedCompensationRuns.length === 0 ? (
                  <tr><td colSpan={3} className="empty">No escalation-owner assignments in current filter.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Compensation Policy Matrix</h2>
          <StatusChip tone={compensationPolicyResult.ok ? "ok" : "err"}>
            {compensationPolicyResult.ok ? `${compensationPolicyMatrix.length} classes` : `ERR ${compensationPolicyResult.status || 0}`}
          </StatusChip>
        </div>
        <p className="muted">
          Supported cleanup classes and operator rules. This table defines when retry is allowed, when observation is enough,
          and when to escalate or perform manual cleanup.
        </p>
        <div className="table-wrap" style={{ marginTop: "0.7rem" }}>
          <table>
            <thead>
              <tr>
                <th>class</th>
                <th>status</th>
                <th>retry</th>
                <th>escalation</th>
                <th>summary</th>
                <th>operator action</th>
              </tr>
            </thead>
            <tbody>
              {compensationPolicyMatrix.map((entry) => (
                <tr key={String(entry.class)}>
                  <td className="mono">{String(entry.class)}</td>
                  <td>{String(entry.status)}</td>
                  <td>{String(entry.retry_allowed)}</td>
                  <td>{String(entry.escalation || "-")}</td>
                  <td>{String(entry.summary || "-")}</td>
                  <td>{String(entry.operator_action || "-")}</td>
                </tr>
              ))}
              {compensationPolicyMatrix.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty">No compensation policy rows available.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Promotion Queue</h2>
          <StatusChip tone={promotionResult.ok ? "ok" : "err"}>
            {promotionResult.ok ? `${promotionAutomations.length} candidates` : `ERR ${promotionResult.status || 0}`}
          </StatusChip>
        </div>
        <p className="muted">
          Latest automation versions currently in `shadow` and awaiting activation review.
        </p>
        <div className="table-wrap" style={{ marginTop: "0.7rem" }}>
          <table>
            <thead>
              <tr>
                <th>updated_at</th>
                <th>automation</th>
                <th>status</th>
                <th>validation</th>
                <th>reviewer</th>
                <th>action hint</th>
                <th>open</th>
              </tr>
            </thead>
            <tbody>
              {promotionAutomations.map((item) => (
                <tr key={`${item.automation_id}:${item.version}`} className={item.automation_id === automation?.automation_id ? "focus-row" : undefined}>
                  <td>{formatIso(item.updated_at || item.version_created_at)}</td>
                  <td className="mono">{item.automation_id}@{item.version}</td>
                  <td>
                    <StatusChip tone={item.status === "shadow" ? "err" : "ok"}>{item.status}</StatusChip>
                  </td>
                  <td>{item.shadow_validation?.status || "-"}</td>
                  <td>{item.review_assignment?.reviewer || "-"}</td>
                  <td>{item.action_hint || "-"}</td>
                  <td>
                    <a
                      href={`/automations?tenant_id=${encodeURIComponent(query.tenantId)}&scope=${encodeURIComponent(query.scope || "")}&reviewer=${encodeURIComponent(query.reviewer || "")}&automation_id=${encodeURIComponent(item.automation_id)}&version=${encodeURIComponent(String(item.version))}&promotion_limit=${encodeURIComponent(String(query.promotionLimit))}&queue_limit=${encodeURIComponent(String(query.queueLimit))}`}
                    >
                      Inspect
                    </a>
                  </td>
                </tr>
              ))}
              {promotionAutomations.length === 0 ? (
                <tr>
                  <td colSpan={7} className="empty">No shadow promotion candidates in current filter.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {wantsRun && !runResult.ok ? (
        <section className="panel warning">
          <h3>Run lookup failed</h3>
          <p className="mono">{String(runResult.error || `http_${runResult.status}`)}</p>
        </section>
      ) : null}

      {run ? (
        <>
          <section className="priority-grid">
            <article className={`panel stat priority priority-${toneForLifecycle(run) === "ok" ? "ok" : toneForLifecycle(run) === "err" ? "high" : "warn"}`}>
              <p>run status</p>
              <h3>{run.status_summary}</h3>
              <StatusChip tone={toneForLifecycle(run)}>{run.lifecycle_state}</StatusChip>
            </article>
            <article className={`panel stat priority ${run.pause_reason ? "priority-high" : "priority-ok"}`}>
              <p>pause reason</p>
              <h3>{run.pause_reason || "-"}</h3>
              <StatusChip tone={run.pause_reason ? "err" : "ok"}>{run.pause_reason ? "Action Needed" : "Clear"}</StatusChip>
            </article>
            <article className={`panel stat priority ${run.compensation_status === "failed" ? "priority-high" : run.compensation_status === "running" ? "priority-warn" : "priority-ok"}`}>
              <p>compensation</p>
              <h3>{run.compensation_status}</h3>
              <StatusChip tone={run.compensation_status === "failed" ? "err" : run.compensation_status === "running" ? "skip" : "ok"}>
                {run.compensation_status}
              </StatusChip>
            </article>
            <article className={`panel stat priority ${run.execution_mode === "shadow" ? "priority-warn" : "priority-ok"}`}>
              <p>execution mode</p>
              <h3>{run.execution_mode}</h3>
              <StatusChip tone={run.execution_mode === "shadow" ? "skip" : "ok"}>{run.execution_mode}</StatusChip>
            </article>
          </section>

          <section className="grid-4">
            <article className="panel stat">
              <p>total nodes</p>
              <h3>{formatNumber(run.summary?.total_nodes)}</h3>
            </article>
            <article className="panel stat">
              <p>succeeded</p>
              <h3>{formatNumber(run.summary?.succeeded_nodes)}</h3>
            </article>
            <article className="panel stat">
              <p>paused</p>
              <h3>{formatNumber(run.summary?.paused_nodes)}</h3>
            </article>
            <article className="panel stat">
              <p>failed or rejected</p>
              <h3>{formatNumber(Number(run.summary?.failed_nodes || 0) + Number(run.summary?.rejected_nodes || 0))}</h3>
            </article>
          </section>

          <section className="grid-2">
            <article className="panel">
              <div className="panel-head">
                <h2>Run Summary</h2>
                <StatusChip tone={toneForLifecycle(run)}>{run.terminal_outcome || run.lifecycle_state}</StatusChip>
              </div>
              <div className="kv">
                <p>run_id</p>
                <p className="mono">{run.run_id}</p>
                <p>automation</p>
                <p className="mono">{run.automation_id}@{run.automation_version}</p>
                <p>requested_by</p>
                <p>{run.requested_by || "-"}</p>
                <p>root cause</p>
                <p className="mono">{run.root_cause_code || "-"}</p>
                <p>reviewer</p>
                <p>{run.review_assignment?.reviewer || "-"}</p>
                <p>root cause node</p>
                <p className="mono">{run.root_cause_node_id || "-"}</p>
                <p>started_at</p>
                <p>{formatIso(run.started_at)}</p>
                <p>paused_at</p>
                <p>{formatIso(run.paused_at)}</p>
                <p>ended_at</p>
                <p>{formatIso(run.ended_at)}</p>
              </div>
              {run.root_cause_message ? <p className="warn-line">{run.root_cause_message}</p> : null}
            </article>

            <article className="panel">
              <div className="panel-head">
                <h2>Recommended Next Actions</h2>
                <StatusChip tone={actionItems.length > 0 ? "err" : "ok"}>{actionItems.length > 0 ? "Actionable" : "Observe"}</StatusChip>
              </div>
              {actionItems.length === 0 ? (
                <p className="muted">No immediate control action is recommended from the current run state.</p>
              ) : (
                <div className="action-stack">
                  {actionItems.map((item) => (
                    <article key={item.title} className="callout">
                      <h3>{item.title}</h3>
                      <p>{item.summary}</p>
                      <pre className="replay-pre">{item.snippet}</pre>
                    </article>
                  ))}
                </div>
              )}
            </article>
          </section>

          <section className="grid-2">
            <article className="panel">
              <div className="panel-head">
                <h2>Compensation Assessment</h2>
                <StatusChip tone={toneForCompensationAssessment(run.compensation_assessment?.status)}>
                  {run.compensation_assessment?.status || "unknown"}
                </StatusChip>
              </div>
              <div className="kv">
                <p>class</p>
                <p className="mono">{run.compensation_assessment?.class || "-"}</p>
                <p>retry_allowed</p>
                <p>{String(run.compensation_assessment?.retry_allowed ?? false)}</p>
                <p>attempted_count</p>
                <p>{formatNumber(run.compensation_assessment?.attempted_count)}</p>
                <p>succeeded_count</p>
                <p>{formatNumber(run.compensation_assessment?.succeeded_count)}</p>
                <p>failed_count</p>
                <p>{formatNumber(run.compensation_assessment?.failed_count)}</p>
                <p>eligible_nodes</p>
                <p className="mono">
                  {Array.isArray(run.compensation_assessment?.eligible_nodes)
                    ? run.compensation_assessment.eligible_nodes.join(", ") || "-"
                    : "-"}
                </p>
                <p>failed_nodes</p>
                <p className="mono">
                  {Array.isArray(run.compensation_assessment?.failed_nodes)
                    ? run.compensation_assessment.failed_nodes.join(", ") || "-"
                    : "-"}
                </p>
              </div>
              <p className="muted">{run.compensation_assessment?.summary || "No compensation assessment available."}</p>
              <p className="warn-line">{run.compensation_assessment?.operator_action || "-"}</p>
            </article>

            <article className="panel">
              <div className="panel-head">
                <h2>Repeat-Action Rules</h2>
                <StatusChip tone={run.compensation_assessment?.retry_allowed ? "skip" : "ok"}>
                  {run.compensation_assessment?.retry_allowed ? "Retryable" : "Blocked"}
                </StatusChip>
              </div>
              <div className="kv">
                <p>retry_compensation</p>
                <p>
                  {run.compensation_assessment?.retry_allowed
                    ? "Allowed after remediation of the failed compensator or finalize path."
                    : "Blocked for the current run state and compensation class."}
                </p>
                <p>manual cleanup</p>
                <p>{run.compensation_assessment?.class === "manual_cleanup_required" ? "Required" : "Not primary path"}</p>
                <p>escalate to engineering</p>
                <p>
                  {["compensation_failed_without_plan", "compensation_state_unknown"].includes(String(run.compensation_assessment?.class || ""))
                    ? "Required"
                    : "Only if retry or cleanup guidance fails"}
                </p>
              </div>
            </article>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Compensation Workflow</h2>
              <StatusChip tone={toneForCompensationWorkflowState(run.compensation_workflow?.state)}>
                {run.compensation_workflow?.state || "unclaimed"}
              </StatusChip>
            </div>
            <div className="kv">
              <p>bucket</p>
              <p>{run.compensation_workflow?.bucket || compensationWorkflowBucket(run.compensation_assessment)}</p>
              <p>owner</p>
              <p>{run.compensation_workflow?.assignment?.owner || "-"}</p>
              <p>escalation owner</p>
              <p>{run.compensation_workflow?.assignment?.escalation_owner || "-"}</p>
              <p>sla target</p>
              <p>{formatIso(run.compensation_workflow?.assignment?.sla_target_at)}</p>
              <p>sla status</p>
              <p>
                <StatusChip tone={toneForSlaStatus(run.compensation_workflow?.sla_status)}>
                  {run.compensation_workflow?.sla_status || "unset"}
                </StatusChip>
              </p>
              <p>latest action</p>
              <p>{labelForCompensationWorkflowAction(run.compensation_workflow?.latest_action?.action)}</p>
              <p>latest actor</p>
              <p>{run.compensation_workflow?.latest_action?.actor || "-"}</p>
              <p>external ref</p>
              <p className="mono">{run.compensation_workflow?.latest_action?.external_ref || "-"}</p>
              <p>updated_at</p>
              <p>{formatIso(run.compensation_workflow?.updated_at)}</p>
              <p>history entries</p>
              <p>{formatNumber(run.compensation_workflow?.history_count)}</p>
            </div>
            <p className="muted">{run.compensation_workflow?.latest_action?.note || "No compensation workflow note recorded yet."}</p>
            {Array.isArray(runResult.data?.compensation_workflow_history) && runResult.data.compensation_workflow_history.length > 0 ? (
              <div className="table-wrap" style={{ marginTop: "0.7rem" }}>
                <table>
                  <thead>
                    <tr>
                      <th>recorded_at</th>
                      <th>action</th>
                      <th>actor</th>
                      <th>external ref</th>
                      <th>note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runResult.data.compensation_workflow_history.map((entry, index) => (
                      <tr key={`comp-flow:${index}:${String(entry.recorded_at || "")}`}>
                        <td>{formatIso(entry.recorded_at)}</td>
                        <td>{labelForCompensationWorkflowAction(entry.action)}</td>
                        <td>{String(entry.actor || "-")}</td>
                        <td className="mono">{String(entry.external_ref || "-")}</td>
                        <td>{String(entry.note || "-")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>

          <section className="grid-2">
            <AutomationGovernanceControls tenantId={query.tenantId} scope={query.scope} run={run} />
            <article className="panel">
              <div className="panel-head">
                <h2>Operator Notes</h2>
                <StatusChip tone="skip">Guardrails</StatusChip>
              </div>
              <div className="kv">
                <p>write scope</p>
                <p>Only current run actions are supported from UI in this phase.</p>
                <p>confirmation rule</p>
                <p>`cancel` and `reject_repair` require explicit browser confirmation.</p>
                <p>auth source</p>
                <p>Ops server forwards `AIONIS_API_KEY` or `AIONIS_AUTH_BEARER`.</p>
                <p>refresh model</p>
                <p>Use the refresh link after a control action to re-read canonical run state.</p>
              </div>
            </article>
          </section>

          {shadowEvidence ? (
            <section className="grid-4">
              <article className="panel stat">
                <p>shadow auto-approvals</p>
                <h3>{formatNumber(shadowEvidence.approvalAutoApproved)}</h3>
              </article>
              <article className="panel stat">
                <p>simulate nodes</p>
                <h3>{formatNumber(shadowEvidence.simulateNodes)}</h3>
              </article>
              <article className="panel stat">
                <p>replay-linked nodes</p>
                <h3>{formatNumber(shadowEvidence.replayLinkedNodes)}</h3>
              </article>
              <article className="panel stat">
                <p>shadow review hint</p>
                <h3>{run.terminal_outcome || run.lifecycle_state}</h3>
              </article>
            </section>
          ) : null}

          {nodes.length > 0 ? (
            <section className="panel">
              <div className="panel-head">
                <h2>Node Inspector</h2>
                <StatusChip tone="ok">{nodes.length} nodes</StatusChip>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>node</th>
                      <th>kind</th>
                      <th>status</th>
                      <th>terminal</th>
                      <th>evidence</th>
                      <th>compensation</th>
                      <th>operator hint</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nodes.map((node) => (
                      <tr key={`${node.node_id}:${node.attempt}`}>
                        <td className="mono">{node.node_id}</td>
                        <td>{node.node_kind}</td>
                        <td>
                          <StatusChip tone={toneForNode(node)}>{node.status_summary}</StatusChip>
                        </td>
                        <td className="mono">{node.terminal_outcome || "-"}</td>
                        <td className="mono">{formatNodeEvidence(node)}</td>
                        <td className="mono">{node.compensation_status}</td>
                        <td>{deriveNodeHint(node, run)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </>
      ) : null}

      {automationLookupId && !automationResult.ok ? (
        <section className="panel warning">
          <h3>Automation lookup failed</h3>
          <p className="mono">{String(automationResult.error || `http_${automationResult.status}`)}</p>
        </section>
      ) : null}

      {automation ? (
        <section className="grid-2">
          <article className="panel">
            <div className="panel-head">
              <h2>Automation Definition</h2>
              <StatusChip tone={automation.status === "active" ? "ok" : automation.status === "disabled" ? "err" : "skip"}>
                {automation.status}
              </StatusChip>
            </div>
            <div className="kv">
              <p>automation_id</p>
              <p className="mono">{automation.automation_id}</p>
              <p>name</p>
              <p>{automation.name}</p>
              <p>version</p>
              <p>{automation.version}</p>
              <p>latest_version</p>
              <p>{automation.latest_version}</p>
              <p>version status</p>
              <p>{automation.status}</p>
              <p>reviewer</p>
              <p>{automation.review_assignment?.reviewer || "-"}</p>
              <p>definition status</p>
              <p>{automation.definition_status}</p>
              <p>created_at</p>
              <p>{formatIso(automation.version_created_at)}</p>
            </div>
          </article>

          <article className="panel">
            <div className="panel-head">
              <h2>Graph Validation Snapshot</h2>
              <StatusChip tone="ok">Validated</StatusChip>
            </div>
            <div className="kv">
              <p>start nodes</p>
              <p className="mono">{Array.isArray(validation?.start_node_ids) ? validation.start_node_ids.join(", ") || "-" : "-"}</p>
              <p>topological order</p>
              <p className="mono">
                {Array.isArray(validation?.topological_order) ? validation.topological_order.join(" -> ") || "-" : "-"}
              </p>
              <p>graph nodes</p>
              <p>{formatNumber(Array.isArray(automation.graph?.nodes) ? automation.graph.nodes.length : 0)}</p>
              <p>graph edges</p>
              <p>{formatNumber(Array.isArray(automation.graph?.edges) ? automation.graph.edges.length : 0)}</p>
            </div>
          </article>
        </section>
      ) : null}

      {shadowReport ? (
        <>
          <section className="grid-4">
            <article className={`panel stat priority priority-${toneForReadiness(shadowReport.comparison?.readiness?.status) === "ok" ? "ok" : toneForReadiness(shadowReport.comparison?.readiness?.status) === "err" ? "high" : "warn"}`}>
              <p>promotion readiness</p>
              <h3>{shadowReport.comparison?.readiness?.status || "-"}</h3>
              <StatusChip tone={toneForReadiness(shadowReport.comparison?.readiness?.status)}>
                {shadowReport.comparison?.readiness?.status || "unknown"}
              </StatusChip>
            </article>
            <article className="panel stat">
              <p>shadow version</p>
              <h3>{shadowReport.versions?.shadow?.version || "-"}</h3>
            </article>
            <article className="panel stat">
              <p>active version</p>
              <h3>{shadowReport.versions?.active?.version || "-"}</h3>
            </article>
            <article className={`panel stat priority ${(Number(shadowReport.comparison?.changed_nodes || 0) > 0) ? "priority-warn" : "priority-ok"}`}>
              <p>changed nodes</p>
              <h3>{formatNumber(shadowReport.comparison?.changed_nodes)}</h3>
            </article>
          </section>

          <section className="grid-2">
            <article className="panel">
              <div className="panel-head">
                <h2>Shadow Review Report</h2>
                <StatusChip tone={toneForReadiness(shadowReport.comparison?.readiness?.status)}>
                  {shadowReport.comparison?.readiness?.status || "unknown"}
                </StatusChip>
              </div>
              <div className="kv">
                <p>shadow run</p>
                <p className="mono">{shadowReport.runs?.shadow?.run_id || "-"}</p>
                <p>active run</p>
                <p className="mono">{shadowReport.runs?.active?.run_id || "-"}</p>
                <p>shadow status</p>
                <p>{shadowReport.runs?.shadow?.status_summary || "-"}</p>
                <p>active status</p>
                <p>{shadowReport.runs?.active?.status_summary || "-"}</p>
                <p>shadow reviewer</p>
                <p>{shadowReport.versions?.shadow?.review_assignment?.reviewer || "-"}</p>
                <p>shadow reviewed by</p>
                <p>{shadowReport.versions?.shadow?.shadow_review?.reviewed_by || "-"}</p>
                <p>shadow review verdict</p>
                <p>{shadowReport.notes?.shadow_review_verdict || "-"}</p>
                <p>shadow validation status</p>
                <p>{shadowReport.notes?.shadow_validation_status || "-"}</p>
                <p>reasons</p>
                <p className="mono">
                  {Array.isArray(shadowReport.comparison?.readiness?.reasons)
                    ? shadowReport.comparison.readiness.reasons.join(", ") || "-"
                    : "-"}
                </p>
              </div>
            </article>

            <article className="panel">
              <div className="panel-head">
                <h2>Shadow Evidence Snapshot</h2>
                <StatusChip tone="skip">Compare</StatusChip>
              </div>
              <div className="kv">
                <p>shadow auto-approved</p>
                <p>{formatNumber(shadowReport.evidence?.shadow?.auto_approved_nodes)}</p>
                <p>shadow simulate nodes</p>
                <p>{formatNumber(shadowReport.evidence?.shadow?.simulate_nodes)}</p>
                <p>shadow replay-linked</p>
                <p>{formatNumber(shadowReport.evidence?.shadow?.replay_linked_nodes)}</p>
                <p>active replay-linked</p>
                <p>{formatNumber(shadowReport.evidence?.active?.replay_linked_nodes)}</p>
              </div>
            </article>
          </section>

          <section className="grid-2">
            <article className="panel">
              <div className="panel-head">
                <h2>Shadow Validation Status</h2>
                <StatusChip tone={toneForValidationStatus(shadowReport.versions?.shadow?.shadow_validation?.status)}>
                  {shadowReport.versions?.shadow?.shadow_validation?.status || "not_requested"}
                </StatusChip>
              </div>
              <div className="kv">
                <p>request_id</p>
                <p className="mono">{shadowReport.versions?.shadow?.shadow_validation?.request_id || "-"}</p>
                <p>mode</p>
                <p>{shadowReport.versions?.shadow?.shadow_validation?.mode || "-"}</p>
                <p>requested_by</p>
                <p>{shadowReport.versions?.shadow?.shadow_validation?.requested_by || "-"}</p>
                <p>requested_at</p>
                <p>{formatIso(shadowReport.versions?.shadow?.shadow_validation?.requested_at)}</p>
                <p>completed_at</p>
                <p>{formatIso(shadowReport.versions?.shadow?.shadow_validation?.completed_at)}</p>
                <p>run_id</p>
                <p className="mono">{shadowReport.versions?.shadow?.shadow_validation?.run_id || "-"}</p>
                <p>run outcome</p>
                <p>{shadowReport.versions?.shadow?.shadow_validation?.run_terminal_outcome || shadowReport.versions?.shadow?.shadow_validation?.run_status_summary || "-"}</p>
              </div>
              {shadowReport.versions?.shadow?.shadow_validation?.failure_message ? (
                <p className="warn-line">{String(shadowReport.versions.shadow.shadow_validation.failure_message)}</p>
              ) : null}
            </article>
          </section>

          <section className="grid-2">
            <article className="panel">
              <div className="panel-head">
                <h2>Review Notes</h2>
                <StatusChip tone={toneForShadowVerdict(shadowReport.notes?.shadow_review_verdict)}>
                  {shadowReport.notes?.shadow_review_verdict || "no_verdict"}
                </StatusChip>
              </div>
              <div className="kv">
                <p>shadow review verdict</p>
                <p>{shadowReport.notes?.shadow_review_verdict || "-"}</p>
                <p>shadow review note</p>
                <p>{shadowReport.notes?.shadow_review_note || "-"}</p>
                <p>shadow promotion note</p>
                <p>{shadowReport.notes?.shadow_promotion_note || "-"}</p>
                <p>active promotion note</p>
                <p>{shadowReport.notes?.active_promotion_note || "-"}</p>
              </div>
            </article>

            <article className="panel">
              <div className="panel-head">
                <h2>Version Context</h2>
                <StatusChip tone="skip">Versions</StatusChip>
              </div>
              <div className="kv">
                <p>shadow created_at</p>
                <p>{formatIso(shadowReport.versions?.shadow?.created_at)}</p>
                <p>active created_at</p>
                <p>{formatIso(shadowReport.versions?.active?.created_at)}</p>
                <p>shadow reviewer</p>
                <p>{shadowReport.versions?.shadow?.review_assignment?.reviewer || "-"}</p>
                <p>shadow review actor</p>
                <p>{shadowReport.versions?.shadow?.shadow_review?.reviewed_by || "-"}</p>
                <p>shadow compile warning count</p>
                <p>{formatNumber(Array.isArray(shadowReport.versions?.shadow?.compile_summary?.issues) ? shadowReport.versions.shadow.compile_summary.issues.length : 0)}</p>
              </div>
            </article>
            <article className="panel">
              <div className="panel-head">
                <h2>Shadow Validation History</h2>
                <StatusChip tone="skip">
                  {formatNumber(Array.isArray(shadowReport.history?.shadow_validations) ? shadowReport.history.shadow_validations.length : 0)} validations
                </StatusChip>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>completed_at</th>
                      <th>status</th>
                      <th>mode</th>
                      <th>requested_by</th>
                      <th>run_id</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(Array.isArray(shadowReport.history?.shadow_validations) ? shadowReport.history.shadow_validations : []).map((validation, idx) => (
                      <tr key={`${String(validation.request_id || idx)}:${String(validation.status || idx)}`}>
                        <td>{formatIso(String(validation.completed_at || validation.requested_at || ""))}</td>
                        <td>{String(validation.status || "-")}</td>
                        <td>{String(validation.mode || "-")}</td>
                        <td>{String(validation.requested_by || "-")}</td>
                        <td className="mono">{String(validation.run_id || "-")}</td>
                      </tr>
                    ))}
                    {(!Array.isArray(shadowReport.history?.shadow_validations) || shadowReport.history.shadow_validations.length === 0) ? (
                      <tr>
                        <td colSpan={5} className="empty">No recorded shadow validations yet.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </article>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Node Delta Report</h2>
              <StatusChip tone={Number(shadowReport.comparison?.changed_nodes || 0) > 0 ? "skip" : "ok"}>
                {formatNumber(shadowReport.comparison?.changed_nodes)} changed
              </StatusChip>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>node</th>
                    <th>reason</th>
                    <th>shadow status</th>
                    <th>active status</th>
                    <th>shadow playbook</th>
                    <th>active playbook</th>
                  </tr>
                </thead>
                <tbody>
                  {(Array.isArray(shadowReport.comparison?.node_deltas) ? shadowReport.comparison.node_deltas : []).map((delta) => (
                    <tr key={String(delta.node_id)}>
                      <td className="mono">{String(delta.node_id)}</td>
                      <td>{String(delta.reason || "-")}</td>
                      <td>{String(delta.shadow_status_summary || "-")}</td>
                      <td>{String(delta.active_status_summary || "-")}</td>
                      <td>{delta.shadow_playbook_version == null ? "-" : String(delta.shadow_playbook_version)}</td>
                      <td>{delta.active_playbook_version == null ? "-" : String(delta.active_playbook_version)}</td>
                    </tr>
                  ))}
                  {(!Array.isArray(shadowReport.comparison?.node_deltas) || shadowReport.comparison.node_deltas.length === 0) ? (
                    <tr>
                      <td colSpan={6} className="empty">No node deltas for current shadow vs active baseline.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="grid-2">
            <article className="panel">
              <div className="panel-head">
                <h2>Shadow Review History</h2>
                <StatusChip tone="skip">
                  {formatNumber(Array.isArray(shadowReport.history?.shadow_reviews) ? shadowReport.history.shadow_reviews.length : 0)} reviews
                </StatusChip>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>reviewed_at</th>
                      <th>verdict</th>
                      <th>reviewed_by</th>
                      <th>note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(Array.isArray(shadowReport.history?.shadow_reviews) ? shadowReport.history.shadow_reviews : []).map((review, idx) => (
                      <tr key={`${String(review.reviewed_at || idx)}:${String(review.verdict || idx)}`}>
                        <td>{formatIso(String(review.reviewed_at || ""))}</td>
                        <td>{String(review.verdict || "-")}</td>
                        <td>{String(review.reviewed_by || "-")}</td>
                        <td>{String(review.note || "-")}</td>
                      </tr>
                    ))}
                    {(!Array.isArray(shadowReport.history?.shadow_reviews) || shadowReport.history.shadow_reviews.length === 0) ? (
                      <tr>
                        <td colSpan={4} className="empty">No recorded shadow reviews yet.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="panel">
              <div className="panel-head">
                <h2>Recent Shadow Runs</h2>
                <StatusChip tone="skip">{formatNumber(Array.isArray(shadowReport.history?.shadow_runs) ? shadowReport.history.shadow_runs.length : 0)} runs</StatusChip>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>created_at</th>
                      <th>run_id</th>
                      <th>status</th>
                      <th>reviewer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(Array.isArray(shadowReport.history?.shadow_runs) ? shadowReport.history.shadow_runs : []).map((historyRun) => (
                      <tr key={String(historyRun.run_id)}>
                        <td>{formatIso(historyRun.created_at)}</td>
                        <td className="mono">{String(historyRun.run_id)}</td>
                          <td>{String(historyRun.status_summary || "-")}</td>
                          <td>{historyRun.review_assignment?.reviewer || "-"}</td>
                        </tr>
                    ))}
                    {(!Array.isArray(shadowReport.history?.shadow_runs) || shadowReport.history.shadow_runs.length === 0) ? (
                      <tr>
                        <td colSpan={4} className="empty">No recent shadow runs.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="panel">
              <div className="panel-head">
                <h2>Recent Active Runs</h2>
                <StatusChip tone="skip">{formatNumber(Array.isArray(shadowReport.history?.active_runs) ? shadowReport.history.active_runs.length : 0)} runs</StatusChip>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>created_at</th>
                      <th>run_id</th>
                      <th>status</th>
                      <th>root cause</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(Array.isArray(shadowReport.history?.active_runs) ? shadowReport.history.active_runs : []).map((historyRun) => (
                      <tr key={String(historyRun.run_id)}>
                        <td>{formatIso(historyRun.created_at)}</td>
                        <td className="mono">{String(historyRun.run_id)}</td>
                        <td>{String(historyRun.status_summary || "-")}</td>
                        <td className="mono">{String(historyRun.root_cause_code || "-")}</td>
                      </tr>
                    ))}
                    {(!Array.isArray(shadowReport.history?.active_runs) || shadowReport.history.active_runs.length === 0) ? (
                      <tr>
                        <td colSpan={4} className="empty">No recent active runs.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </article>
          </section>
        </>
      ) : null}

      {automation ? (
        <section className="grid-2">
          <AutomationPromotionControls tenantId={query.tenantId} scope={query.scope} automation={automation} />
          <article className="panel">
            <div className="panel-head">
              <h2>Promotion Notes</h2>
              <StatusChip tone={toneForShadowVerdict(automation.shadow_review?.verdict)}>
                {automation.shadow_review?.verdict || "no_verdict"}
              </StatusChip>
            </div>
            <div className="kv">
              <p>promotable states</p>
              <p>This phase exposes `shadow to active` and `active to disabled` from UI.</p>
              <p>shadow review verdict</p>
              <p>{automation.shadow_review?.verdict || "-"}</p>
              <p>shadow review actor</p>
              <p>{automation.shadow_review?.reviewed_by || "-"}</p>
              <p>source rule</p>
              <p>Backend still enforces latest-version-only promotion and stale source rejection.</p>
              <p>review expectation</p>
              <p>Use shadow evidence, recorded verdict, and queue context before promoting to active.</p>
              <p>remaining gap</p>
              <p>There is still no hosted validator service or full multi-stage shadow review workflow.</p>
            </div>
          </article>
        </section>
      ) : null}
    </div>
  );
}
