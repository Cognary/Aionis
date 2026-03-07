"use client";

import { useMemo, useState } from "react";

function jsonPretty(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

async function callAutomationControl(op, payload) {
  const response = await fetch("/api/automation/execute", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ op, payload }),
  });
  const data = await response.json().catch(() => ({ error: "invalid_json_response" }));
  return {
    ok: response.ok,
    status: response.status,
    data,
    requestId: response.headers.get("x-request-id") || "",
  };
}

function extractRequestId(result) {
  const direct = String(result?.requestId || "").trim();
  if (direct) return direct;
  return String(result?.data?.__ops?.request_id || "").trim();
}

function inferAllowedOps(run) {
  if (!run) return [];
  if (run.lifecycle_state === "paused" && run.pause_reason === "repair_required") {
    return [
      "automation_run_approve_repair",
      "automation_run_reject_repair",
      "automation_run_cancel",
    ];
  }
  if (run.lifecycle_state === "paused" && run.pause_reason === "approval_required") {
    return [
      "automation_run_resume",
      "automation_run_cancel",
    ];
  }
  if (
    run.lifecycle_state === "terminal" &&
    (run.terminal_outcome === "failed" || run.terminal_outcome === "cancelled") &&
    run.compensation_status === "failed"
  ) {
    return ["automation_run_compensation_retry"];
  }
  if (run.lifecycle_state === "running") {
    return ["automation_run_cancel"];
  }
  return [];
}

function inferCompensationWorkflowOps(run) {
  const assessment = run?.compensation_assessment;
  if (!assessment || run?.lifecycle_state !== "terminal") return [];
  const blocked = new Set([
    "shadow_run_not_compensable",
    "run_not_terminal",
    "already_compensated",
    "outcome_not_compensable",
    "compensation_succeeded",
  ]);
  if (blocked.has(String(assessment.class || ""))) return [];
  const ops = [
    { op: "automation_run_compensation_record_action", action: "observation_noted" },
    { op: "automation_run_compensation_record_action", action: "engineering_escalated" },
  ];
  if (new Set([
    "manual_cleanup_required",
    "compensation_failed_without_plan",
    "compensation_state_unknown",
    "compensation_not_attempted",
  ]).has(String(assessment.class || ""))) {
    ops.unshift(
      { op: "automation_run_compensation_record_action", action: "manual_cleanup_started" },
      { op: "automation_run_compensation_record_action", action: "manual_cleanup_completed" },
    );
  }
  return ops;
}

function opLabel(op) {
  switch (op) {
    case "automation_run_resume":
      return "Resume Run";
    case "automation_run_cancel":
      return "Cancel Run";
    case "automation_run_approve_repair":
      return "Approve Repair";
    case "automation_run_reject_repair":
      return "Reject Repair";
    case "automation_run_compensation_retry":
      return "Retry Compensation";
    default:
      return op;
  }
}

function compensationActionLabel(action) {
  switch (action) {
    case "manual_cleanup_started":
      return "Manual Cleanup Started";
    case "manual_cleanup_completed":
      return "Manual Cleanup Completed";
    case "engineering_escalated":
      return "Escalate Engineering";
    case "observation_noted":
      return "Note Observation";
    default:
      return action;
  }
}

function opHint(op) {
  switch (op) {
    case "automation_run_resume":
      return "Continue an approval-paused run after external approval is complete.";
    case "automation_run_cancel":
      return "Force the run to stop. May trigger compensation for completed nodes.";
    case "automation_run_approve_repair":
      return "Approve a repaired playbook lineage and continue the run.";
    case "automation_run_reject_repair":
      return "Reject the repair attempt and move the run toward failed or compensated terminal state.";
    case "automation_run_compensation_retry":
      return "Retry failed compensation after fixing the compensator or environment.";
    default:
      return "";
  }
}

function compensationActionHint(action) {
  switch (action) {
    case "manual_cleanup_started":
      return "Record that cleanup is now being handled manually outside automation compensation.";
    case "manual_cleanup_completed":
      return "Record that manual cleanup completed and evidence has been captured.";
    case "engineering_escalated":
      return "Record that this compensation failure has been escalated to engineering.";
    case "observation_noted":
      return "Record a no-op observation while cleanup is being watched or triaged.";
    default:
      return "";
  }
}

function requiresDangerConfirm(op) {
  return op === "automation_run_cancel" || op === "automation_run_reject_repair";
}

export default function AutomationGovernanceControls({ tenantId, scope, run }) {
  const [actor, setActor] = useState("ops");
  const [reviewer, setReviewer] = useState("");
  const [owner, setOwner] = useState(run?.compensation_workflow?.assignment?.owner || "");
  const [escalationOwner, setEscalationOwner] = useState(run?.compensation_workflow?.assignment?.escalation_owner || "");
  const [slaTargetAt, setSlaTargetAt] = useState(run?.compensation_workflow?.assignment?.sla_target_at || "");
  const [reason, setReason] = useState("");
  const [externalRef, setExternalRef] = useState("");
  const [busyOp, setBusyOp] = useState("");
  const [result, setResult] = useState(null);
  const allowedOps = useMemo(() => inferAllowedOps(run), [run]);
  const compensationWorkflowOps = useMemo(() => inferCompensationWorkflowOps(run), [run]);
  const requestId = extractRequestId(result);

  async function runOp(op) {
    if (!run?.run_id) return;
    if (requiresDangerConfirm(op)) {
      const proceed = window.confirm(`${opLabel(op)} for run ${run.run_id}?`);
      if (!proceed) return;
    }
    setBusyOp(op);
    try {
      const out = await callAutomationControl(op, {
        tenant_id: tenantId,
        scope,
        run_id: run.run_id,
        actor: actor.trim() || undefined,
        reason: reason.trim() || undefined,
      });
      setResult({
        op,
        ...out,
      });
    } finally {
      setBusyOp("");
    }
  }

  async function runCompensationWorkflowAction(action) {
    if (!run?.run_id) return;
    const op = "automation_run_compensation_record_action";
    setBusyOp(`${op}:${action}`);
    try {
      const out = await callAutomationControl(op, {
        tenant_id: tenantId,
        scope,
        run_id: run.run_id,
        actor: actor.trim() || undefined,
        action,
        reason: reason.trim() || undefined,
        external_ref: externalRef.trim() || undefined,
      });
      setResult({
        op,
        action,
        ...out,
      });
    } finally {
      setBusyOp("");
    }
  }

  async function assignReviewer() {
    if (!run?.run_id || !reviewer.trim()) return;
    setBusyOp("automation_run_assign_reviewer");
    try {
      const out = await callAutomationControl("automation_run_assign_reviewer", {
        tenant_id: tenantId,
        scope,
        run_id: run.run_id,
        actor: actor.trim() || undefined,
        reviewer: reviewer.trim(),
        reason: reason.trim() || undefined,
      });
      setResult({
        op: "automation_run_assign_reviewer",
        ...out,
      });
    } finally {
      setBusyOp("");
    }
  }

  async function assignCompensationWorkflow() {
    if (!run?.run_id) return;
    setBusyOp("automation_run_compensation_assign");
    try {
      const out = await callAutomationControl("automation_run_compensation_assign", {
        tenant_id: tenantId,
        scope,
        run_id: run.run_id,
        actor: actor.trim() || undefined,
        owner: owner.trim() || undefined,
        escalation_owner: escalationOwner.trim() || undefined,
        sla_target_at: slaTargetAt.trim() || undefined,
        reason: reason.trim() || undefined,
      });
      setResult({
        op: "automation_run_compensation_assign",
        ...out,
      });
    } finally {
      setBusyOp("");
    }
  }

  if (!run) return null;

  return (
    <article className="panel">
      <div className="panel-head">
        <h2>Governance Controls</h2>
        <span className={`status ${allowedOps.length > 0 ? "status-err" : "status-skip"}`}>
          {allowedOps.length > 0 ? "Writable" : "No Action"}
        </span>
      </div>
      <p className="muted">
        Server-side memory-auth forwarded controls for the current run. These actions mutate runtime state.
      </p>

      <form
        className="action-form"
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <label>
          actor
          <input value={actor} onChange={(event) => setActor(event.target.value)} maxLength={256} />
        </label>
        <label>
          reviewer
          <input value={reviewer} onChange={(event) => setReviewer(event.target.value)} maxLength={256} placeholder="alice" />
        </label>
        <label>
          compensation owner
          <input value={owner} onChange={(event) => setOwner(event.target.value)} maxLength={256} placeholder="cleanup-owner" />
        </label>
        <label>
          escalation owner
          <input value={escalationOwner} onChange={(event) => setEscalationOwner(event.target.value)} maxLength={256} placeholder="eng-oncall" />
        </label>
        <label>
          sla target at
          <input value={slaTargetAt} onChange={(event) => setSlaTargetAt(event.target.value)} maxLength={64} placeholder="2026-03-08T09:00:00Z" />
        </label>
        <label>
          reason
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} maxLength={1000} />
        </label>
        <label>
          external ref
          <input
            value={externalRef}
            onChange={(event) => setExternalRef(event.target.value)}
            maxLength={512}
            placeholder="incident-123 / cleanup-ticket"
          />
        </label>
      </form>

      <div className="row-actions" style={{ marginBottom: "0.8rem" }}>
        <button
          type="button"
          className="secondary-ghost"
          onClick={assignReviewer}
          disabled={!reviewer.trim() || Boolean(busyOp)}
        >
          {busyOp === "automation_run_assign_reviewer" ? "Running..." : "Assign Reviewer"}
        </button>
        <button
          type="button"
          className="secondary-ghost"
          onClick={assignCompensationWorkflow}
          disabled={Boolean(busyOp) || (!owner.trim() && !escalationOwner.trim() && !slaTargetAt.trim() && !reason.trim())}
        >
          {busyOp === "automation_run_compensation_assign" ? "Running..." : "Set Compensation Ownership"}
        </button>
      </div>

      {allowedOps.length === 0 ? (
        <p className="muted">This run has no supported direct control action from the current state.</p>
      ) : (
        <div className="action-stack">
          {allowedOps.map((op) => (
            <article key={op} className="callout">
              <h3>{opLabel(op)}</h3>
              <p>{opHint(op)}</p>
              <div className="row-actions" style={{ marginTop: "0.7rem" }}>
                <button
                  type="button"
                  className={requiresDangerConfirm(op) ? "danger-ghost" : "secondary-ghost"}
                  onClick={() => runOp(op)}
                  disabled={Boolean(busyOp)}
                >
                  {busyOp === op ? "Running..." : opLabel(op)}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {compensationWorkflowOps.length > 0 ? (
        <div className="action-stack" style={{ marginTop: "1rem" }}>
          {compensationWorkflowOps.map((item) => {
            const key = `${item.op}:${item.action}`;
            return (
              <article key={key} className="callout">
                <h3>{compensationActionLabel(item.action)}</h3>
                <p>{compensationActionHint(item.action)}</p>
                <div className="row-actions" style={{ marginTop: "0.7rem" }}>
                  <button
                    type="button"
                    className="secondary-ghost"
                    onClick={() => runCompensationWorkflowAction(item.action)}
                    disabled={Boolean(busyOp)}
                  >
                    {busyOp === key ? "Running..." : compensationActionLabel(item.action)}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}

      <div className="action-result">
        <p className="kicker">Last Control Result</p>
        <p className="muted" style={{ marginTop: "0.35rem" }}>
          {result ? `HTTP ${result.status} ${result.ok ? "OK" : "ERR"}` : "No control action sent yet."}
        </p>
        {requestId ? <p className="mono">request_id: {requestId}</p> : null}
        {run?.run_id ? (
          <div className="action-links">
            <a href={`/automations?tenant_id=${encodeURIComponent(tenantId || "default")}&scope=${encodeURIComponent(scope || "")}&run_id=${encodeURIComponent(run.run_id)}`}>
              Refresh run inspector
            </a>
          </div>
        ) : null}
        <pre>{jsonPretty(result?.data ?? {})}</pre>
      </div>
    </article>
  );
}
