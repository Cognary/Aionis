"use client";

import { useMemo, useState } from "react";
import { analyticsEvents } from "@/lib/analytics";

type ActionId = "write" | "recall_text" | "rules_evaluate";

type ActionDef = {
  id: ActionId;
  title: string;
  endpoint: string;
  description: string;
};

type RunResult = {
  status: number | null;
  durationMs: number;
  responseText: string;
  requestId?: string;
  curl: string;
  error?: string;
};

const actions: ActionDef[] = [
  {
    id: "write",
    title: "write",
    endpoint: "/v1/memory/write",
    description: "Write memory facts and commit lineage.",
  },
  {
    id: "recall_text",
    title: "recall_text",
    endpoint: "/v1/memory/recall_text",
    description: "Retrieve LLM-ready memory context text.",
  },
  {
    id: "rules_evaluate",
    title: "rules/evaluate",
    endpoint: "/v1/memory/rules/evaluate",
    description: "Evaluate active/shadow rule effects.",
  },
];

const defaultPayloads: Record<ActionId, string> = {
  write: JSON.stringify(
    {
      input_text: "User asked to track launch planning status.",
      nodes: [
        {
          client_id: "evt_launch_001",
          type: "event",
          text_summary: "Launch planning kickoff completed with PM and engineering.",
        },
      ],
    },
    null,
    2,
  ),
  recall_text: JSON.stringify(
    {
      query_text: "launch planning status",
      limit: 5,
    },
    null,
    2,
  ),
  rules_evaluate: JSON.stringify(
    {
      context: {
        version: 1,
        run: { id: "run_playground_001", mode: "playground" },
        intent: "json",
        provider: "minimax",
        tool: { name: "psql" },
        agent: { id: "agent_a", team_id: "team_default" },
        input: { content_type: "text", pii_redaction_enabled: true },
        tags: ["playground"],
      },
      include_shadow: true,
      limit: 50,
    },
    null,
    2,
  ),
};

const trimSlash = (value: string) => value.replace(/\/+$/g, "");
const shellQuote = (value: string) => `'${value.replace(/'/g, `'\"'\"'`)}'`;

function buildCurl(baseUrl: string, endpoint: string, headers: Record<string, string>, body: unknown) {
  const url = `${trimSlash(baseUrl)}${endpoint}`;
  const headerLines = Object.entries(headers)
    .map(([key, val]) => `  -H ${shellQuote(`${key}: ${val}`)} \\`)
    .join("\n");
  const bodyText = JSON.stringify(body);
  return [`curl -sS ${shellQuote(url)} \\`, headerLines, `  -d ${shellQuote(bodyText)}`].join("\n");
}

export function PlaygroundConsole() {
  const [baseUrl, setBaseUrl] = useState(process.env.NEXT_PUBLIC_AIONIS_API_BASE ?? "http://localhost:3001");
  const [apiKey, setApiKey] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [activeAction, setActiveAction] = useState<ActionId>("write");
  const [payloadByAction, setPayloadByAction] = useState<Record<ActionId, string>>(defaultPayloads);
  const [running, setRunning] = useState(false);
  const [copyHint, setCopyHint] = useState("");
  const [result, setResult] = useState<RunResult | null>(null);

  const action = useMemo(() => actions.find((item) => item.id === activeAction) ?? actions[0], [activeAction]);
  const activePayload = payloadByAction[activeAction];

  const updatePayload = (nextValue: string) => {
    setPayloadByAction((prev) => ({ ...prev, [activeAction]: nextValue }));
  };

  const runAction = async () => {
    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(activePayload);
    } catch {
      setResult({
        status: null,
        durationMs: 0,
        responseText: "",
        curl: "",
        error: "Payload is not valid JSON. Fix JSON format and try again.",
      });
      return;
    }

    const url = `${trimSlash(baseUrl)}${action.endpoint}`;
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (apiKey.trim()) headers["X-Api-Key"] = apiKey.trim();
    if (tenantId.trim()) headers["X-Tenant-Id"] = tenantId.trim();
    const curl = buildCurl(baseUrl, action.endpoint, headers, parsedBody);

    const startedAt = performance.now();
    setRunning(true);
    setCopyHint("");
    setResult(null);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(parsedBody),
      });
      const rawText = await response.text();
      let prettyText = rawText;
      try {
        const json = JSON.parse(rawText);
        prettyText = JSON.stringify(json, null, 2);
      } catch {
        // keep raw text when response is not json
      }
      setResult({
        status: response.status,
        durationMs: performance.now() - startedAt,
        responseText: prettyText,
        requestId: response.headers.get("x-request-id") ?? undefined,
        curl,
      });
    } catch (error) {
      setResult({
        status: null,
        durationMs: performance.now() - startedAt,
        responseText: "",
        curl,
        error: error instanceof Error ? error.message : "Network request failed.",
      });
    } finally {
      setRunning(false);
    }
  };

  const copyCurl = async () => {
    if (!result?.curl) return;
    try {
      await navigator.clipboard.writeText(result.curl);
      setCopyHint("curl copied");
    } catch {
      setCopyHint("copy failed");
    }
  };

  return (
    <section className="section" style={{ paddingTop: 0 }}>
      <div className="playground-config card">
        <h3>Connection</h3>
        <div className="playground-grid">
          <label>
            API base URL
            <input className="form-input" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
          </label>
          <label>
            X-Api-Key (optional)
            <input
              className="form-input"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="your-api-key"
            />
          </label>
          <label>
            X-Tenant-Id (optional)
            <input
              className="form-input"
              value={tenantId}
              onChange={(event) => setTenantId(event.target.value)}
              placeholder="tenant-a"
            />
          </label>
        </div>
      </div>

      <div className="playground-layout">
        <article className="card">
          <h3>Action</h3>
          <div className="playground-tabs">
            {actions.map((item) => (
              <button
                key={item.id}
                className={`btn ${item.id === activeAction ? "btn-solid" : "btn-ghost"}`}
                type="button"
                onClick={() => setActiveAction(item.id)}
              >
                {item.title}
              </button>
            ))}
          </div>
          <p className="copy">{action.description}</p>
          <p className="playground-endpoint">
            Endpoint: <code>{action.endpoint}</code>
          </p>
          <label className="playground-editor-label">
            JSON payload
            <textarea
              className="form-input playground-editor"
              value={activePayload}
              onChange={(event) => updatePayload(event.target.value)}
            />
          </label>
          <div className="hero-cta">
            <button
              className="btn btn-solid"
              type="button"
              onClick={runAction}
              disabled={running}
              data-analytics-event={analyticsEvents.PLAYGROUND_RUN_CLICK}
            >
              {running ? "Running..." : "Run request"}
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => updatePayload(defaultPayloads[activeAction])}>
              Reset payload
            </button>
          </div>
        </article>

        <article className="card">
          <h3>Result</h3>
          {result ? (
            <>
              <div className="playground-meta">
                <span className={`playground-badge ${result.status && result.status < 400 ? "ok" : "warn"}`}>
                  {result.status ? `HTTP ${result.status}` : "Request error"}
                </span>
                <span>{result.durationMs.toFixed(0)}ms</span>
                {result.requestId ? <span>request-id: {result.requestId}</span> : null}
              </div>
              {result.error ? <p className="playground-error">{result.error}</p> : null}
              <pre className="code-block">{result.responseText || "No response body."}</pre>
              <div className="hero-cta" style={{ marginTop: 12 }}>
                <button className="btn btn-ghost" type="button" onClick={copyCurl}>
                  Copy curl
                </button>
                {copyHint ? <span className="copy">{copyHint}</span> : null}
              </div>
              <pre className="code-block">{result.curl}</pre>
            </>
          ) : (
            <p className="copy">Run an action to see status, latency, response payload, and reproducible curl command.</p>
          )}
        </article>
      </div>
    </section>
  );
}
