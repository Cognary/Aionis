"use client";

import { useEffect, useMemo, useState } from "react";

function jsonPretty(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

async function callControl(op, payload) {
  const response = await fetch("/api/control/execute", {
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

export default function AutomationAlertDeliveryControls({
  deliveries = [],
  title = "Failed Alert Replay",
  description = "Replay a failed alert delivery using the recorded payload snapshot. Override target is optional and useful for route recovery or dry-run validation.",
  initialDeliveryId = "",
  queueLabel = "current queue",
}) {
  const [selectedId, setSelectedId] = useState("");
  const [overrideTarget, setOverrideTarget] = useState("");
  const [owner, setOwner] = useState("");
  const [escalationOwner, setEscalationOwner] = useState("");
  const [slaTargetAt, setSlaTargetAt] = useState("");
  const [workflowState, setWorkflowState] = useState("replay_backlog");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    const preferred = String(initialDeliveryId || "").trim();
    if (preferred && deliveries.some((item) => String(item?.delivery_id || "").trim() === preferred)) {
      setSelectedId(preferred);
      return;
    }
    if (!selectedId && deliveries.length > 0) {
      const first = String(deliveries[0]?.delivery_id || "").trim();
      if (first) setSelectedId(first);
    }
  }, [deliveries, initialDeliveryId, selectedId]);

  const selectedDelivery = useMemo(
    () => deliveries.find((item) => String(item?.delivery_id || "").trim() === selectedId) || null,
    [deliveries, selectedId],
  );

  useEffect(() => {
    const workflow =
      selectedDelivery?.metadata?.alert_workflow && typeof selectedDelivery.metadata.alert_workflow === "object"
        ? selectedDelivery.metadata.alert_workflow
        : {};
    setOwner(String(workflow?.owner || ""));
    setEscalationOwner(String(workflow?.escalation_owner || ""));
    setSlaTargetAt(String(workflow?.sla_target_at || ""));
    setWorkflowState(String(workflow?.state || (selectedDelivery?.metadata?.payload_snapshot != null ? "replay_backlog" : "manual_review")));
    setNote(String(workflow?.note || ""));
  }, [selectedDelivery?.delivery_id]);

  const requestId = extractRequestId(result);
  const queueIds = useMemo(
    () => deliveries.map((item) => String(item?.delivery_id || "").trim()).filter(Boolean),
    [deliveries],
  );

  async function runReplay(dryRun) {
    if (!selectedId) return;
    setBusy(dryRun ? "preview" : "replay");
    try {
      const out = await callControl("alert_delivery_replay", {
        ids: [selectedId],
        dry_run: dryRun,
        override_target: overrideTarget.trim() || undefined,
      });
      setResult({ dryRun, ...out });
    } finally {
      setBusy("");
    }
  }

  async function saveAssignment() {
    if (!selectedId) return;
    setBusy("assign");
    try {
      const out = await callControl("alert_delivery_assign", {
        ids: [selectedId],
        owner,
        escalation_owner: escalationOwner,
        sla_target_at: slaTargetAt || null,
        workflow_state: workflowState || null,
        note: note || null,
        actor: "ops_console",
      });
      setResult({ assignment: true, ...out });
    } finally {
      setBusy("");
    }
  }

  async function runReplayBatchPreview() {
    if (queueIds.length === 0) return;
    setBusy("preview-batch");
    try {
      const out = await callControl("alert_delivery_replay", {
        ids: queueIds,
        dry_run: true,
        override_target: overrideTarget.trim() || undefined,
      });
      setResult({ batch: true, dryRun: true, ...out });
    } finally {
      setBusy("");
    }
  }

  async function runReplayBatchExecute() {
    if (queueIds.length === 0) return;
    setBusy("replay-batch");
    try {
      const out = await callControl("alert_delivery_replay", {
        ids: queueIds,
        dry_run: false,
        override_target: overrideTarget.trim() || undefined,
      });
      setResult({ batch: true, dryRun: false, ...out });
    } finally {
      setBusy("");
    }
  }

  async function saveAssignmentBatch() {
    if (queueIds.length === 0) return;
    setBusy("assign-batch");
    try {
      const out = await callControl("alert_delivery_assign", {
        ids: queueIds,
        owner,
        escalation_owner: escalationOwner,
        sla_target_at: slaTargetAt || null,
        workflow_state: workflowState || null,
        note: note || null,
        actor: "ops_console",
      });
      setResult({ batch: true, assignment: true, ...out });
    } finally {
      setBusy("");
    }
  }

  return (
    <article className="panel">
      <div className="panel-head">
        <h2>{title}</h2>
        <span className={`status ${deliveries.length > 0 ? "status-err" : "status-skip"}`}>
          {deliveries.length > 0 ? `${deliveries.length} failed` : "No Failed Deliveries"}
        </span>
      </div>
      <p className="muted">
        {description}
      </p>
      <p className="muted" style={{ marginTop: "0.35rem" }}>
        Batch targets: {queueIds.length} in {queueLabel}.
      </p>
      <div className="filters" style={{ marginTop: "0.75rem" }}>
        <label>
          failed delivery
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} disabled={deliveries.length === 0 || Boolean(busy)}>
            {deliveries.length === 0 ? <option value="">No failed deliveries</option> : null}
            {deliveries.map((item) => {
              const deliveryId = String(item?.delivery_id || "");
              const routeLabel = String(item?.metadata?.route_snapshot?.label || item?.route_id || "unknown").trim();
              const automationId = String(item?.metadata?.automation_id || "-").trim();
              return (
                <option key={deliveryId} value={deliveryId}>
                  {deliveryId} · {routeLabel} · {automationId}
                </option>
              );
            })}
          </select>
        </label>
        <label>
          override target (optional)
          <input
            type="text"
            value={overrideTarget}
            onChange={(e) => setOverrideTarget(e.target.value)}
            placeholder="https://postman-echo.com/post"
            disabled={Boolean(busy)}
          />
        </label>
      </div>
      {selectedDelivery ? (
        <div className="kv" style={{ marginTop: "0.75rem" }}>
          <p>route</p>
          <p>{String(selectedDelivery?.metadata?.route_snapshot?.label || selectedDelivery?.route_id || "-")}</p>
          <p>automation</p>
          <p className="mono">{String(selectedDelivery?.metadata?.automation_id || "-")}</p>
          <p>response</p>
          <p>{selectedDelivery?.response_code == null ? "-" : String(selectedDelivery.response_code)}</p>
          <p>payload snapshot</p>
          <p>{selectedDelivery?.metadata?.payload_snapshot != null ? "available" : "missing"}</p>
          <p>owner</p>
          <p>{String(selectedDelivery?.metadata?.alert_workflow?.owner || "-")}</p>
          <p>escalation owner</p>
          <p>{String(selectedDelivery?.metadata?.alert_workflow?.escalation_owner || "-")}</p>
          <p>SLA target</p>
          <p>{String(selectedDelivery?.metadata?.alert_workflow?.sla_target_at || "-")}</p>
          <p>workflow state</p>
          <p>{String(selectedDelivery?.metadata?.alert_workflow?.state || (selectedDelivery?.metadata?.payload_snapshot != null ? "replay_backlog" : "manual_review"))}</p>
        </div>
      ) : null}
      <div className="filters" style={{ marginTop: "0.75rem" }}>
        <label>
          owner
          <input type="text" value={owner} onChange={(e) => setOwner(e.target.value)} disabled={Boolean(busy)} placeholder="ops-oncall" />
        </label>
        <label>
          escalation owner
          <input
            type="text"
            value={escalationOwner}
            onChange={(e) => setEscalationOwner(e.target.value)}
            disabled={Boolean(busy)}
            placeholder="engineering-oncall"
          />
        </label>
        <label>
          SLA target at
          <input
            type="text"
            value={slaTargetAt}
            onChange={(e) => setSlaTargetAt(e.target.value)}
            disabled={Boolean(busy)}
            placeholder="2026-03-08T09:00:00.000Z"
          />
        </label>
        <label>
          workflow state
          <select value={workflowState} onChange={(e) => setWorkflowState(e.target.value)} disabled={Boolean(busy)}>
            <option value="replay_backlog">replay_backlog</option>
            <option value="manual_review">manual_review</option>
            <option value="dead_letter">dead_letter</option>
          </select>
        </label>
        <label>
          note
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} disabled={Boolean(busy)} placeholder="why this replay matters" />
        </label>
      </div>
      <div className="row-actions" style={{ marginTop: "0.75rem" }}>
        <button type="button" className="secondary-ghost" onClick={saveAssignment} disabled={Boolean(busy) || !selectedId}>
          {busy === "assign" ? "Saving..." : "Save Workflow"}
        </button>
        <button type="button" className="secondary-ghost" onClick={saveAssignmentBatch} disabled={Boolean(busy) || queueIds.length === 0}>
          {busy === "assign-batch" ? "Saving..." : "Save Workflow To Queue"}
        </button>
        <button type="button" className="secondary-ghost" onClick={() => runReplay(true)} disabled={Boolean(busy) || !selectedId}>
          {busy === "preview" ? "Running..." : "Preview Replay"}
        </button>
        <button type="button" className="secondary-ghost" onClick={runReplayBatchPreview} disabled={Boolean(busy) || queueIds.length === 0}>
          {busy === "preview-batch" ? "Running..." : "Preview Queue Replay"}
        </button>
        <button
          type="button"
          className="danger-ghost"
          onClick={() => {
            if (!window.confirm(`Replay ${queueIds.length} deliveries from ${queueLabel}?`)) return;
            runReplayBatchExecute();
          }}
          disabled={Boolean(busy) || queueIds.length === 0}
        >
          {busy === "replay-batch" ? "Running..." : "Replay Queue"}
        </button>
        <button
          type="button"
          className="danger-ghost"
          onClick={() => {
            if (!window.confirm("Replay the selected failed alert delivery?")) return;
            runReplay(false);
          }}
          disabled={Boolean(busy) || !selectedId}
        >
          {busy === "replay" ? "Running..." : "Replay Delivery"}
        </button>
      </div>
      <div className="action-result">
        <p className="kicker">Last Replay Result</p>
        <p className="muted" style={{ marginTop: "0.35rem" }}>
          {result ? `HTTP ${result.status} ${result.ok ? "OK" : "ERR"}` : "No replay action sent yet."}
        </p>
        {requestId ? <p className="mono">request_id: {requestId}</p> : null}
        <pre>{jsonPretty(result?.data ?? {})}</pre>
      </div>
    </article>
  );
}
