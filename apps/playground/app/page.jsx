"use client";

import { useMemo, useState } from "react";
import {
  FLOW_PRESETS,
  FLOW_PRESET_MAP,
  OPERATION_LIST,
  OPERATION_MAP,
  SCENARIO_PRESETS,
  SCENARIO_PRESET_MAP,
  defaultPayloadFor
} from "@/app/lib/operations";

const DEFAULT_CONNECTION = {
  base_url: "http://127.0.0.1:3001",
  tenant_id: "default",
  scope: "default",
  api_key: "",
  bearer_token: "",
  admin_token: ""
};

const DEFAULT_SCENARIO = SCENARIO_PRESETS[0]?.key || "";
const DEFAULT_FLOW_PRESET = FLOW_PRESETS[0]?.key || "";

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepMerge(base, patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return patch;
  const next = { ...(base && typeof base === "object" && !Array.isArray(base) ? base : {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      next[key] = deepMerge(next[key], value);
    } else {
      next[key] = value;
    }
  }
  return next;
}

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
  const next = deepClone(payload);
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

function findRunId(input) {
  const seen = new Set();
  const stack = [input];
  while (stack.length > 0) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object") continue;
    if (seen.has(cur)) continue;
    seen.add(cur);
    if (typeof cur.run_id === "string" && cur.run_id.trim()) {
      return cur.run_id.trim();
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

function resolveToken(token, runtimeContext, connection) {
  if (token === "now.iso") return new Date().toISOString();
  if (token === "now.unix_ms") return String(Date.now());
  if (token.startsWith("last.")) {
    return String(runtimeContext[token.slice(5)] || "");
  }
  if (token.startsWith("connection.")) {
    return String(connection[token.slice(11)] || "");
  }
  return "";
}

function applyRuntimeVars(value, runtimeContext, connection) {
  if (Array.isArray(value)) {
    return value.map((item) => applyRuntimeVars(item, runtimeContext, connection));
  }

  if (value && typeof value === "object") {
    const next = {};
    for (const [key, inner] of Object.entries(value)) {
      next[key] = applyRuntimeVars(inner, runtimeContext, connection);
    }
    return next;
  }

  if (typeof value === "string") {
    return value.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, token) => resolveToken(String(token || "").trim(), runtimeContext, connection));
  }

  return value;
}

function parseFlowSteps(flowText) {
  const parsed = JSON.parse(flowText);
  if (!Array.isArray(parsed)) {
    throw new Error("Flow JSON must be an array");
  }

  return parsed.map((item, index) => {
    if (typeof item === "string") {
      if (!OPERATION_MAP[item]) {
        throw new Error(`flow step ${index + 1}: unknown operation '${item}'`);
      }
      return { operation: item, payload: null };
    }

    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`flow step ${index + 1}: must be string or object`);
    }

    const op = String(item.operation || "").trim();
    if (!op || !OPERATION_MAP[op]) {
      throw new Error(`flow step ${index + 1}: missing/invalid operation`);
    }

    const payload = item.payload && typeof item.payload === "object" && !Array.isArray(item.payload)
      ? deepClone(item.payload)
      : null;

    return { operation: op, payload };
  });
}

function makeFlowTextFromPreset(flowPresetKey) {
  const preset = FLOW_PRESET_MAP[flowPresetKey];
  return preset ? pretty(preset.steps) : pretty([]);
}

function collectDiff(prev, next, path = "", out = [], depth = 0) {
  if (out.length >= 80) return out;
  if (depth > 8) return out;

  const prevIsObj = prev && typeof prev === "object";
  const nextIsObj = next && typeof next === "object";

  if (!prevIsObj || !nextIsObj) {
    if (JSON.stringify(prev) !== JSON.stringify(next)) {
      out.push({ path: path || "$", before: prev, after: next });
    }
    return out;
  }

  if (Array.isArray(prev) || Array.isArray(next)) {
    if (JSON.stringify(prev) !== JSON.stringify(next)) {
      out.push({ path: path || "$", before: prev, after: next });
    }
    return out;
  }

  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  for (const key of keys) {
    if (out.length >= 80) break;
    const nextPath = path ? `${path}.${key}` : key;
    collectDiff(prev[key], next[key], nextPath, out, depth + 1);
  }
  return out;
}

function computeRuntimeContext(history) {
  const context = {
    request_id: "",
    decision_id: "",
    run_id: ""
  };

  for (const item of history) {
    if (!context.request_id && item.request_id) context.request_id = item.request_id;
    if (!context.decision_id && item.decision_id) context.decision_id = item.decision_id;
    if (!context.run_id && item.run_id) context.run_id = item.run_id;
    if (context.request_id && context.decision_id && context.run_id) break;
  }

  return context;
}

export default function PlaygroundPage() {
  const [connection, setConnection] = useState(DEFAULT_CONNECTION);
  const [scenarioPreset, setScenarioPreset] = useState(DEFAULT_SCENARIO);
  const [operation, setOperation] = useState("write");
  const [payloadText, setPayloadText] = useState(pretty(defaultPayloadFor("write")));
  const [flowPreset, setFlowPreset] = useState(DEFAULT_FLOW_PRESET);
  const [flowText, setFlowText] = useState(makeFlowTextFromPreset(DEFAULT_FLOW_PRESET));
  const [history, setHistory] = useState([]);
  const [activeId, setActiveId] = useState("");
  const [running, setRunning] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [flowError, setFlowError] = useState("");

  const runtimeContext = useMemo(() => computeRuntimeContext(history), [history]);
  const active = useMemo(() => history.find((item) => item.id === activeId) || history[0] || null, [history, activeId]);

  const metrics = useMemo(() => {
    const total = history.length;
    const success = history.filter((item) => item.ok).length;
    const failed = total - success;
    const avgLatency = total > 0
      ? Math.round(history.reduce((sum, item) => sum + (Number(item.duration_ms) || 0), 0) / total)
      : 0;
    return { total, success, failed, avgLatency };
  }, [history]);

  const previousSameOperation = useMemo(() => {
    if (!active) return null;
    const idx = history.findIndex((item) => item.id === active.id);
    if (idx < 0) return null;
    for (let i = idx + 1; i < history.length; i += 1) {
      if (history[i].operation === active.operation) return history[i];
    }
    return null;
  }, [active, history]);

  const responseDiff = useMemo(() => {
    if (!active || !previousSameOperation) return [];
    return collectDiff(previousSameOperation.data, active.data);
  }, [active, previousSameOperation]);

  function getOperationTemplate(nextOperation, nextConnection = connection, nextScenario = scenarioPreset) {
    let payload = defaultPayloadFor(nextOperation);
    const scenario = SCENARIO_PRESET_MAP[nextScenario];
    if (scenario?.payload_by_operation?.[nextOperation]) {
      payload = deepMerge(payload, scenario.payload_by_operation[nextOperation]);
    }
    return applyTenantScope(payload, nextConnection);
  }

  function materializePayload(rawPayload, runtime = runtimeContext) {
    const scoped = applyTenantScope(rawPayload, connection);
    return applyRuntimeVars(scoped, runtime, connection);
  }

  async function executeOne(nextOperation, preparedPayload) {
    const startedAt = new Date().toISOString();
    const response = await fetch("/api/playground/execute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        operation: nextOperation,
        payload: preparedPayload,
        connection
      })
    });

    const result = await response.json().catch(() => ({ ok: false, error: "invalid_json_response" }));
    const id = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const decisionId = findDecisionId(result.data) || findDecisionId(preparedPayload);
    const runId = findRunId(result.data) || findRunId(preparedPayload);

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
      payload: preparedPayload,
      data: result.data ?? null,
      error: result.error || "",
      decision_id: decisionId,
      run_id: runId
    };

    setHistory((prev) => [entry, ...prev]);
    setActiveId(entry.id);
    return entry;
  }

  async function runCurrent() {
    setErrorMessage("");
    setFlowError("");

    let payload = null;
    try {
      payload = parseJsonObject(payloadText);
      payload = materializePayload(payload);
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

  async function runFlow() {
    setErrorMessage("");
    setFlowError("");

    let steps = [];
    try {
      steps = parseFlowSteps(flowText);
    } catch (error) {
      setFlowError(error instanceof Error ? error.message : "invalid flow json");
      return;
    }

    setRunning(true);
    let flowRuntime = { ...runtimeContext };

    try {
      for (const step of steps) {
        const payloadSeed = step.payload ? deepClone(step.payload) : getOperationTemplate(step.operation);
        const preparedPayload = materializePayload(payloadSeed, flowRuntime);
        const entry = await executeOne(step.operation, preparedPayload);
        flowRuntime = {
          request_id: entry.request_id || flowRuntime.request_id,
          decision_id: entry.decision_id || flowRuntime.decision_id,
          run_id: entry.run_id || flowRuntime.run_id
        };
      }
    } catch (error) {
      setFlowError(error instanceof Error ? error.message : "flow execution failed");
    } finally {
      setRunning(false);
    }
  }

  function resetPayload(nextOperation) {
    setPayloadText(pretty(getOperationTemplate(nextOperation)));
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

  function injectRuntimeVars() {
    try {
      const payload = parseJsonObject(payloadText);
      setPayloadText(pretty(materializePayload(payload)));
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "invalid payload json");
    }
  }

  function applyScenarioPreset() {
    const scenario = SCENARIO_PRESET_MAP[scenarioPreset];
    if (!scenario) return;

    const mergedConnection = {
      ...connection,
      ...(scenario.connection || {})
    };
    const nextOperation = scenario.default_operation || operation;
    const nextFlowPreset = scenario.flow_key && FLOW_PRESET_MAP[scenario.flow_key] ? scenario.flow_key : flowPreset;

    setConnection(mergedConnection);
    setOperation(nextOperation);
    setPayloadText(pretty(getOperationTemplate(nextOperation, mergedConnection, scenarioPreset)));
    setFlowPreset(nextFlowPreset);
    setFlowText(makeFlowTextFromPreset(nextFlowPreset));
    setErrorMessage("");
    setFlowError("");
  }

  function exportSession() {
    const data = {
      exported_at: new Date().toISOString(),
      scenario: scenarioPreset,
      operation,
      flow: flowText,
      connection: {
        base_url: connection.base_url,
        tenant_id: connection.tenant_id,
        scope: connection.scope,
        api_key: maskSecret(connection.api_key),
        bearer_token: maskSecret(connection.bearer_token),
        admin_token: maskSecret(connection.admin_token)
      },
      runtime_context: runtimeContext,
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
          <h1>Aionis Playground v2</h1>
          <p className="muted">
            End-to-end surface for memory write/recall, rules, tool selection, feedback, and decision replay.
            Includes scenario presets, flow runner, runtime variable injection, and response diffs.
          </p>
        </div>
        <div className="hero-actions">
          <button type="button" onClick={runCurrent} disabled={running}>
            {running ? "Running..." : "Run Operation"}
          </button>
          <button type="button" className="ghost" onClick={runFlow} disabled={running}>
            {running ? "Running..." : "Run Flow"}
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
              setErrorMessage("");
              setFlowError("");
            }}
            disabled={history.length === 0 || running}
          >
            Clear History
          </button>
        </div>
      </section>

      <section className="status-strip">
        <article className="metric-card">
          <span>Total</span>
          <strong>{metrics.total}</strong>
        </article>
        <article className="metric-card ok">
          <span>Success</span>
          <strong>{metrics.success}</strong>
        </article>
        <article className="metric-card err">
          <span>Failed</span>
          <strong>{metrics.failed}</strong>
        </article>
        <article className="metric-card">
          <span>Avg Latency</span>
          <strong>{metrics.avgLatency} ms</strong>
        </article>
        <article className="metric-card">
          <span>last.request_id</span>
          <strong className="mono tiny-strong">{runtimeContext.request_id || "-"}</strong>
        </article>
        <article className="metric-card">
          <span>last.decision_id</span>
          <strong className="mono tiny-strong">{runtimeContext.decision_id || "-"}</strong>
        </article>
      </section>

      <section className="workspace-grid">
        <div className="left-stack">
          <article className="panel">
            <div className="panel-head">
              <h2>Connection + Scenario</h2>
              <span className="tag">runtime</span>
            </div>
            <div className="form-grid">
              <label>
                scenario preset
                <select value={scenarioPreset} onChange={(event) => setScenarioPreset(event.target.value)}>
                  {SCENARIO_PRESETS.map((item) => (
                    <option key={item.key} value={item.key}>{item.label}</option>
                  ))}
                </select>
              </label>
              <p className="muted tiny">{SCENARIO_PRESET_MAP[scenarioPreset]?.description || ""}</p>
              <button type="button" className="ghost" onClick={applyScenarioPreset} disabled={running}>Apply Scenario Preset</button>
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
                <textarea value={payloadText} onChange={(event) => setPayloadText(event.target.value)} rows={14} />
              </label>
              <div className="inline-actions">
                <button type="button" className="ghost" onClick={() => resetPayload(operation)} disabled={running}>Reset Template</button>
                <button type="button" className="ghost" onClick={injectTenantScope} disabled={running}>Inject tenant/scope</button>
                <button type="button" className="ghost" onClick={injectRuntimeVars} disabled={running}>Inject runtime vars</button>
              </div>
              {errorMessage ? <p className="error">{errorMessage}</p> : null}
            </div>
          </article>
        </div>

        <div className="mid-stack">
          <article className="panel">
            <div className="panel-head">
              <h2>Step Flow</h2>
              <span className="tag">orchestrator</span>
            </div>
            <div className="form-grid compact">
              <label>
                flow preset
                <select
                  value={flowPreset}
                  onChange={(event) => {
                    const next = event.target.value;
                    setFlowPreset(next);
                    setFlowText(makeFlowTextFromPreset(next));
                    setFlowError("");
                  }}
                >
                  {FLOW_PRESETS.map((item) => (
                    <option key={item.key} value={item.key}>{item.label}</option>
                  ))}
                </select>
              </label>
              <p className="muted tiny">{FLOW_PRESET_MAP[flowPreset]?.description || ""}</p>
              <label>
                flow JSON (string op or {`{ operation, payload }`})
                <textarea value={flowText} onChange={(event) => setFlowText(event.target.value)} rows={10} />
              </label>
              {flowError ? <p className="error">{flowError}</p> : null}
            </div>
          </article>

          <article className="panel">
            <div className="panel-head">
              <h2>Request Chain</h2>
              <span className="tag">{history.length} items</span>
            </div>
            {history.length === 0 ? (
              <p className="muted">No requests yet. Run an operation or flow.</p>
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
        </div>

        <article className="panel">
          <div className="panel-head">
            <h2>Response Inspector + Diff</h2>
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
              <details open>
                <summary>response diff vs previous same operation</summary>
                {!previousSameOperation ? (
                  <p className="muted tiny">No previous response for this operation yet.</p>
                ) : responseDiff.length === 0 ? (
                  <p className="muted tiny">No structural diff detected.</p>
                ) : (
                  <div className="diff-list">
                    {responseDiff.slice(0, 40).map((item) => (
                      <div className="diff-item" key={`${item.path}-${JSON.stringify(item.after)}`}>
                        <p className="mono tiny"><strong>{item.path}</strong></p>
                        <p className="tiny muted">before: <span className="mono">{JSON.stringify(item.before)}</span></p>
                        <p className="tiny muted">after: <span className="mono">{JSON.stringify(item.after)}</span></p>
                      </div>
                    ))}
                    {responseDiff.length > 40 ? <p className="tiny muted">...truncated to first 40 diff entries.</p> : null}
                  </div>
                )}
              </details>
            </div>
          )}
        </article>
      </section>
    </div>
  );
}
