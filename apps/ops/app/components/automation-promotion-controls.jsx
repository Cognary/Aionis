"use client";

import { useState } from "react";

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

export default function AutomationPromotionControls({ tenantId, scope, automation }) {
  const [actor, setActor] = useState("ops");
  const [reviewer, setReviewer] = useState("");
  const [note, setNote] = useState("");
  const [verdict, setVerdict] = useState(() => {
    const current = String(automation?.shadow_review?.verdict || "").trim();
    return current || "approved";
  });
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState(null);

  async function promote(targetStatus) {
    if (!automation?.automation_id) return;
    const proceed = window.confirm(`Promote ${automation.automation_id}@${automation.version} to ${targetStatus}?`);
    if (!proceed) return;
    setBusy(targetStatus);
    try {
      const out = await callAutomationControl("automation_promote", {
        tenant_id: tenantId,
        scope,
        automation_id: automation.automation_id,
        actor: actor.trim() || undefined,
        target_status: targetStatus,
        note: note.trim() || undefined,
      });
      setResult({ targetStatus, ...out });
    } finally {
      setBusy("");
    }
  }

  async function assignReviewer() {
    if (!automation?.automation_id || !reviewer.trim()) return;
    setBusy("assign");
    try {
      const out = await callAutomationControl("automation_assign_reviewer", {
        tenant_id: tenantId,
        scope,
        automation_id: automation.automation_id,
        actor: actor.trim() || undefined,
        reviewer: reviewer.trim(),
        note: note.trim() || undefined,
      });
      setResult({ targetStatus: "assign", ...out });
    } finally {
      setBusy("");
    }
  }

  async function recordShadowReview() {
    if (!automation?.automation_id || automation?.status !== "shadow" || !verdict) return;
    const actionLabel =
      verdict === "approved"
        ? "approve"
        : verdict === "needs_changes"
          ? "mark as needs changes"
          : "reject";
    const proceed = window.confirm(
      `Record shadow review for ${automation.automation_id}@${automation.version} and ${actionLabel}?`,
    );
    if (!proceed) return;
    setBusy("shadow_review");
    try {
      const out = await callAutomationControl("automation_shadow_review", {
        tenant_id: tenantId,
        scope,
        automation_id: automation.automation_id,
        shadow_version: automation.version,
        actor: actor.trim() || undefined,
        verdict,
        note: note.trim() || undefined,
      });
      setResult({ targetStatus: "shadow_review", ...out });
    } finally {
      setBusy("");
    }
  }

  async function requestShadowValidation(mode) {
    if (!automation?.automation_id || automation?.status !== "shadow") return;
    const proceed = window.confirm(
      `${mode === "inline" ? "Run" : "Enqueue"} shadow validation for ${automation.automation_id}@${automation.version}?`,
    );
    if (!proceed) return;
    setBusy(`shadow_validate_${mode}`);
    try {
      const out = await callAutomationControl("automation_shadow_validate", {
        tenant_id: tenantId,
        scope,
        automation_id: automation.automation_id,
        shadow_version: automation.version,
        actor: actor.trim() || undefined,
        mode,
        note: note.trim() || undefined,
      });
      setResult({ targetStatus: `shadow_validate_${mode}`, ...out });
    } finally {
      setBusy("");
    }
  }

  async function dispatchQueuedShadowValidation() {
    if (!automation?.automation_id || automation?.status !== "shadow") return;
    const proceed = window.confirm(`Dispatch queued shadow validation for ${automation.automation_id}@${automation.version}?`);
    if (!proceed) return;
    setBusy("shadow_validate_dispatch");
    try {
      const out = await callAutomationControl("automation_shadow_validate_dispatch", {
        tenant_id: tenantId,
        scope,
        automation_id: automation.automation_id,
        actor: actor.trim() || undefined,
        limit: 1,
      });
      setResult({ targetStatus: "shadow_validate_dispatch", ...out });
    } finally {
      setBusy("");
    }
  }

  if (!automation) return null;

  const currentVerdict = String(automation.shadow_review?.verdict || "").trim();
  const currentReviewer = String(automation.shadow_review?.reviewed_by || "").trim();
  const canReview = automation.status === "shadow";
  const canActivate = automation.status === "shadow" && currentVerdict === "approved";
  const canDisable = automation.status === "active";
  const requestId = extractRequestId(result);

  return (
    <article className="panel">
      <div className="panel-head">
        <h2>Promotion Controls</h2>
        <span className={`status ${canActivate || canDisable ? "status-err" : "status-skip"}`}>
          {canActivate || canDisable ? "Writable" : "No Action"}
        </span>
      </div>
      <p className="muted">
        Latest-version promotion control for the selected automation. Shadow review verdicts are recorded explicitly and
        promotion stays gated on an approved shadow review.
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
          shadow review verdict
          <select value={verdict} onChange={(event) => setVerdict(event.target.value)} disabled={!canReview}>
            <option value="approved">approved</option>
            <option value="needs_changes">needs_changes</option>
            <option value="rejected">rejected</option>
          </select>
        </label>
        <label>
          note
          <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={1000} />
        </label>
      </form>

      <div className="kv" style={{ marginTop: "0.75rem" }}>
        <p>current shadow verdict</p>
        <p>{currentVerdict || "-"}</p>
        <p>current shadow reviewer</p>
        <p>{currentReviewer || "-"}</p>
        <p>promotion gate</p>
        <p>{canActivate ? "approved for active promotion" : canReview ? "awaiting approved shadow review" : "not a shadow version"}</p>
      </div>

      <div className="row-actions">
        <button type="button" className="secondary-ghost" onClick={assignReviewer} disabled={!reviewer.trim() || Boolean(busy)}>
          {busy === "assign" ? "Running..." : "Assign Reviewer"}
        </button>
        <button type="button" className="secondary-ghost" onClick={() => requestShadowValidation("enqueue")} disabled={!canReview || Boolean(busy)}>
          {busy === "shadow_validate_enqueue" ? "Running..." : "Enqueue Shadow Validation"}
        </button>
        <button type="button" className="secondary-ghost" onClick={() => requestShadowValidation("inline")} disabled={!canReview || Boolean(busy)}>
          {busy === "shadow_validate_inline" ? "Running..." : "Run Shadow Validation"}
        </button>
        <button type="button" className="secondary-ghost" onClick={dispatchQueuedShadowValidation} disabled={!canReview || Boolean(busy)}>
          {busy === "shadow_validate_dispatch" ? "Running..." : "Dispatch Queued Validation"}
        </button>
        <button type="button" className="secondary-ghost" onClick={recordShadowReview} disabled={!canReview || Boolean(busy)}>
          {busy === "shadow_review" ? "Running..." : "Record Shadow Review"}
        </button>
        <button type="button" className="secondary-ghost" onClick={() => promote("active")} disabled={!canActivate || Boolean(busy)}>
          {busy === "active" ? "Running..." : "Promote To Active"}
        </button>
        <button type="button" className="danger-ghost" onClick={() => promote("disabled")} disabled={!canDisable || Boolean(busy)}>
          {busy === "disabled" ? "Running..." : "Disable Latest"}
        </button>
      </div>

      <div className="action-result">
        <p className="kicker">Last Governance Result</p>
        <p className="muted" style={{ marginTop: "0.35rem" }}>
          {result ? `HTTP ${result.status} ${result.ok ? "OK" : "ERR"}` : "No promotion action sent yet."}
        </p>
        {requestId ? <p className="mono">request_id: {requestId}</p> : null}
        <pre>{jsonPretty(result?.data ?? {})}</pre>
      </div>
    </article>
  );
}
