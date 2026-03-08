"use client";

import { useMemo, useState } from "react";

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

export default function AutomationAlertControls({
  tenantId,
  scope,
  automationId,
  windowHours,
  alertPreview,
}) {
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState(null);
  const canDispatch = useMemo(
    () =>
      Array.isArray(alertPreview?.alert_previews) &&
      alertPreview.alert_previews.some((item) => item.dispatch_ready === true),
    [alertPreview],
  );
  const candidateCodes = useMemo(
    () =>
      Array.isArray(alertPreview?.alert_previews)
        ? alertPreview.alert_previews
            .map((item) => String(item?.code || "").trim())
            .filter(Boolean)
        : [],
    [alertPreview],
  );
  const requestId = extractRequestId(result);

  async function runDispatch(dryRun) {
    setBusy(dryRun ? "preview" : "dispatch");
    try {
      const out = await callControl("automation_alert_dispatch", {
        tenant_id: tenantId,
        scope: scope || undefined,
        automation_id: automationId || undefined,
        window_hours: windowHours,
        incident_limit: 8,
        candidate_codes: candidateCodes,
        dry_run: dryRun,
      });
      setResult({ dryRun, ...out });
    } finally {
      setBusy("");
    }
  }

  return (
    <article className="panel">
      <div className="panel-head">
        <h2>Alert Dispatch Controls</h2>
        <span className={`status ${canDispatch ? "status-err" : "status-skip"}`}>
          {canDispatch ? "Routes Ready" : "No Ready Route"}
        </span>
      </div>
      <p className="muted">
        Use dry-run to preview concrete route fan-out for current alert candidates. Real dispatch uses the same matched
        control alert routes and records deliveries.
      </p>
      <div className="row-actions">
        <button type="button" className="secondary-ghost" onClick={() => runDispatch(true)} disabled={Boolean(busy) || candidateCodes.length === 0}>
          {busy === "preview" ? "Running..." : "Preview Dispatch"}
        </button>
        <button
          type="button"
          className="danger-ghost"
          onClick={() => {
            if (!window.confirm("Dispatch current automation alert candidates to matched control alert routes?")) return;
            runDispatch(false);
          }}
          disabled={Boolean(busy) || !canDispatch}
        >
          {busy === "dispatch" ? "Running..." : "Dispatch Alerts"}
        </button>
      </div>
      <div className="kv" style={{ marginTop: "0.75rem" }}>
        <p>candidate rows</p>
        <p>{candidateCodes.length}</p>
        <p>ready routes</p>
        <p>{canDispatch ? "yes" : "no"}</p>
      </div>
      <div className="action-result">
        <p className="kicker">Last Alert Dispatch Result</p>
        <p className="muted" style={{ marginTop: "0.35rem" }}>
          {result ? `HTTP ${result.status} ${result.ok ? "OK" : "ERR"}` : "No alert dispatch action sent yet."}
        </p>
        {requestId ? <p className="mono">request_id: {requestId}</p> : null}
        <pre>{jsonPretty(result?.data ?? {})}</pre>
      </div>
    </article>
  );
}
