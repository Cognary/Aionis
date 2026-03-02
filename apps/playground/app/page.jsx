"use client";

import { useMemo, useState } from "react";
import { OPERATION_LIST, OPERATION_MAP, defaultPayloadFor } from "@/app/lib/operations";

const DEFAULT_CONNECTION = {
  base_url: "http://127.0.0.1:3001",
  tenant_id: "default",
  scope: "default",
  api_key: "",
  bearer_token: "",
  admin_token: ""
};

function pretty(value) {
  return JSON.stringify(value, null, 2);
}

function parseJsonObject(text) {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Payload must be a JSON object");
  }
  return parsed;
}

function applyTenantScope(payload, connection) {
  const next = JSON.parse(JSON.stringify(payload));
  const tenantId = String(connection.tenant_id || "").trim();
  const scope = String(connection.scope || "").trim();
  if (tenantId && !next.tenant_id) next.tenant_id = tenantId;
  if (scope && !next.scope) next.scope = scope;
  return next;
}

function findDecisionId(input) {
  const seen = new Set();
  const stack = [input];
  while (stack.length > 0) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object") continue;
    if (seen.has(cur)) continue;
    seen.add(cur);
    if (typeof cur.decision_id === "string" && cur.decision_id.trim()) {
      return cur.decision_id.trim();
    }
    for (const value of Object.values(cur)) {
      if (value && typeof value === "object") stack.push(value);
    }
  }
  return "";
}

function maskSecret(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.length <= 8) return "********";
  return `${raw.slice(0, 4)}...${raw.slice(-4)}`;
}

export default function PlaygroundPage() {
  const [connection, setConnection] = useState(DEFAULT_CONNECTION);
  const [operation, setOperation] = useState("write");
  const [payloadText, setPayloadText] = useState(pretty(defaultPayloadFor("write")));
  const [history, setHistory] = useState([]);
  const [activeId, setActiveId] = useState("");
  const [running, setRunning] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [lastDecisionId, setLastDecisionId] = useState("");

  const active = useMemo(() => history.find((item) => item.id === activeId) || history[0] || null, [history, activeId]);

  async function executeOne(nextOperation, payloadObject) {
    const startedAt = new Date().toISOString();
    const response = await fetch("/api/playground/execute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        operation: nextOperation,
        payload: payloadObject,
        connection
      })
    });

    const result = await response.json().catch(() => ({ ok: false, error: "invalid_json_response" }));
    const id = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const entry = {
      id,
      at: startedAt,
      operation: nextOperation,
      method: result.method || OPERATION_MAP[nextOperation]?.method || "POST",
      path: result.path || OPERATION_MAP[nextOperation]?.path || "",
      ok: result.ok === true,
      status: Number(result.status || 0),
      request_id: String(result.request_id || ""),
      duration_ms: Number(result.duration_ms || 0),
      payload: payloadObject,
      data: result.data ?? null,
      error: result.error || ""
    };

    setHistory((prev) => [entry, ...prev]);
    setActiveId(entry.id);

    const detected = findDecisionId(result.data);
    if (detected) setLastDecisionId(detected);

    return entry;
  }

  async function runCurrent() {
    setErrorMessage("");
    let payload = null;
    try {
      payload = parseJsonObject(payloadText);
      payload = applyTenantScope(payload, connection);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "invalid payload json");
      return;
    }

    setRunning(true);
    try {
      await executeOne(operation, payload);
    } finally {
      setRunning(false);
    }
  }

  async function runQuickFlow() {
    setErrorMessage("");
    setRunning(true);
    try {
      const steps = ["write", "recall_text", "rules_evaluate", "tools_select"];
      for (const step of steps) {
        const payload = applyTenantScope(defaultPayloadFor(step), connection);
        await executeOne(step, payload);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "quick flow failed");
    } finally {
      setRunning(false);
    }
  }

  function resetPayload(nextOperation) {
    const payload = applyTenantScope(defaultPayloadFor(nextOperation), connection);
    setPayloadText(pretty(payload));
  }

  function injectTenantScope() {
    try {
      const payload = parseJsonObject(payloadText);
      setPayloadText(pretty(applyTenantScope(payload, connection)));
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "invalid payload json");
    }
  }

  function useLastDecisionId() {
    if (!lastDecisionId) return;
    try {
      const payload = parseJsonObject(payloadText);
      payload.decision_id = lastDecisionId;
      setPayloadText(pretty(payload));
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "invalid payload json");
    }
  }

  function exportSession() {
    const data = {
      exported_at: new Date().toISOString(),
      operation: operation,
      connection: {
        base_url: connection.base_url,
        tenant_id: connection.tenant_id,
        scope: connection.scope,
        api_key: maskSecret(connection.api_key),
        bearer_token: maskSecret(connection.bearer_token),
        admin_token: maskSecret(connection.admin_token)
      },
      history
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `aionis-playground-${Date.now()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="pg-page">
      <section className="panel hero">
        <div>
          <p className="kicker">Interactive API Lab</p>
          <h1>Aionis Playground</h1>
          <p className="muted">
            End-to-end surface for memory write/recall, rules, tool selection, feedback, and decision replay.
            Every request is traced with status, duration, and request_id.
          </p>
        </div>
        <div className="hero-actions">
          <button type="button" onClick={runCurrent} disabled={running}>
            {running ? "Running..." : "Run Operation"}
          </button>
          <button type="button" className="ghost" onClick={runQuickFlow} disabled={running}>
            {running ? "Running..." : "Run Quick Flow"}
          </button>
          <button type="button" className="ghost" onClick={exportSession} disabled={history.length === 0 || running}>
            Export Session JSON
          </button>
          <button
            type="button"
            className="ghost danger"
            onClick={() => {
              setHistory([]);
              setActiveId("");
            }}
            disabled={history.length === 0 || running}
          >
            Clear History
          </button>
        </div>
      </section>

      <section className="grid-2">
        <article className="panel">
          <div className="panel-head">
            <h2>Connection</h2>
            <span className="tag">runtime</span>
          </div>
          <div className="form-grid">
            <label>
              base_url
              <input
                value={connection.base_url}
                onChange={(event) => setConnection((prev) => ({ ...prev, base_url: event.target.value }))}
                placeholder="http://127.0.0.1:3001"
              />
            </label>
            <label>
              tenant_id (default)
              <input
                value={connection.tenant_id}
                onChange={(event) => setConnection((prev) => ({ ...prev, tenant_id: event.target.value }))}
              />
            </label>
            <label>
              scope (default)
              <input
                value={connection.scope}
                onChange={(event) => setConnection((prev) => ({ ...prev, scope: event.target.value }))}
              />
            </label>
            <label>
              x-api-key (optional)
              <input
                value={connection.api_key}
                onChange={(event) => setConnection((prev) => ({ ...prev, api_key: event.target.value }))}
                placeholder="ak_live_..."
              />
            </label>
            <label>
              bearer token (optional)
              <input
                value={connection.bearer_token}
                onChange={(event) => setConnection((prev) => ({ ...prev, bearer_token: event.target.value }))}
                placeholder="Bearer ... or raw token"
              />
            </label>
            <label>
              x-admin-token (optional)
              <input
                value={connection.admin_token}
                onChange={(event) => setConnection((prev) => ({ ...prev, admin_token: event.target.value }))}
              />
            </label>
          </div>
        </article>

        <article className="panel">
          <div className="panel-head">
            <h2>Operation + Payload</h2>
            <span className="tag">request builder</span>
          </div>
          <div className="form-grid compact">
            <label>
              operation
              <select
                value={operation}
                onChange={(event) => {
                  const next = event.target.value;
                  setOperation(next);
                  resetPayload(next);
                }}
              >
                {OPERATION_LIST.map((item) => (
                  <option key={item.key} value={item.key}>{item.label} ({item.method} {item.path})</option>
                ))}
              </select>
            </label>
            <p className="muted tiny">{OPERATION_MAP[operation]?.description || ""}</p>
            <label>
              payload JSON
              <textarea value={payloadText} onChange={(event) => setPayloadText(event.target.value)} rows={16} />
            </label>
            <div className="inline-actions">
              <button type="button" className="ghost" onClick={() => resetPayload(operation)} disabled={running}>Reset Template</button>
              <button type="button" className="ghost" onClick={injectTenantScope} disabled={running}>Inject tenant/scope</button>
              <button type="button" className="ghost" onClick={useLastDecisionId} disabled={!lastDecisionId || running}>Use last decision_id</button>
            </div>
            {lastDecisionId ? <p className="muted tiny">Last decision_id: <span className="mono">{lastDecisionId}</span></p> : null}
            {errorMessage ? <p className="error">{errorMessage}</p> : null}
          </div>
        </article>
      </section>

      <section className="grid-2">
        <article className="panel">
          <div className="panel-head">
            <h2>Request Chain</h2>
            <span className="tag">{history.length} items</span>
          </div>
          {history.length === 0 ? (
            <p className="muted">No requests yet. Run an operation or launch quick flow.</p>
          ) : (
            <div className="chain-list">
              {history.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={`chain-item ${active?.id === item.id ? "active" : ""}`}
                  onClick={() => setActiveId(item.id)}
                >
                  <div>
                    <p className="mono">{item.operation}</p>
                    <p className="tiny muted">{item.method} {item.path}</p>
                  </div>
                  <div className="chain-meta">
                    <span className={`status ${item.ok ? "ok" : "err"}`}>{item.status || "ERR"}</span>
                    <span className="mono tiny">{item.duration_ms} ms</span>
                    <span className="mono tiny">{item.request_id || "no-request-id"}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </article>

        <article className="panel">
          <div className="panel-head">
            <h2>Response Inspector</h2>
            {active ? <span className={`status ${active.ok ? "ok" : "err"}`}>{active.status || "ERR"}</span> : <span className="tag">idle</span>}
          </div>
          {!active ? (
            <p className="muted">Select a request in the chain to inspect payload and response.</p>
          ) : (
            <div className="inspect-block">
              <p className="tiny muted">request_id: <span className="mono">{active.request_id || "-"}</span></p>
              <p className="tiny muted">operation: <span className="mono">{active.operation}</span></p>
              <p className="tiny muted">timestamp: <span className="mono">{active.at}</span></p>
              {active.error ? <p className="error">error: {active.error}</p> : null}
              <details open>
                <summary>request payload</summary>
                <pre>{pretty(active.payload)}</pre>
              </details>
              <details open>
                <summary>response body</summary>
                <pre>{pretty(active.data)}</pre>
              </details>
            </div>
          )}
        </article>
      </section>
    </div>
  );
}
