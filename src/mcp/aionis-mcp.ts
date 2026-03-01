import { createInterface } from "node:readline";
import { z } from "zod";

type JsonRpcId = string | number | null;

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: unknown;
};

type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: JsonRpcId; result: unknown }
  | { jsonrpc: "2.0"; id: JsonRpcId; error: { code: number; message: string; data?: unknown } };

const EnvSchema = z.object({
  AIONIS_BASE_URL: z.string().default("http://localhost:3001"),
  AIONIS_SCOPE: z.string().min(1).default("default"),
  AIONIS_ADMIN_TOKEN: z.string().optional(),
  AIONIS_API_KEY: z.string().optional(),
  AIONIS_AUTH_BEARER: z.string().optional(),
  AIONIS_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  AIONIS_MAX_TOOL_TEXT_CHARS: z.coerce.number().int().positive().default(8000),
});

type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment:\n${msg}`);
  }
  return parsed.data;
}

class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`HTTP ${status}`);
  }
}

function send(msg: JsonRpcResponse) {
  process.stdout.write(`${JSON.stringify(msg)}\n`);
}

function ok(id: JsonRpcId, result: unknown) {
  send({ jsonrpc: "2.0", id, result });
}

function err(id: JsonRpcId, code: number, message: string, data?: unknown) {
  send({ jsonrpc: "2.0", id, error: { code, message, data } });
}

function clipText(text: string, maxChars: number) {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n[truncated: ${text.length - maxChars} chars]`;
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

async function postJson(env: Env, path: string, body: unknown) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), env.AIONIS_TIMEOUT_MS);
  try {
    const url = `${normalizeBaseUrl(env.AIONIS_BASE_URL)}${path}`;
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (env.AIONIS_ADMIN_TOKEN) headers["X-Admin-Token"] = env.AIONIS_ADMIN_TOKEN;
    if (env.AIONIS_API_KEY) headers["X-Api-Key"] = env.AIONIS_API_KEY;
    if (env.AIONIS_AUTH_BEARER) {
      headers.Authorization = env.AIONIS_AUTH_BEARER.toLowerCase().startsWith("bearer ")
        ? env.AIONIS_AUTH_BEARER
        : `Bearer ${env.AIONIS_AUTH_BEARER}`;
    }

    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: ctrl.signal });
    const raw = await res.text();
    const json = raw ? (JSON.parse(raw) as unknown) : null;
    if (!res.ok) throw new HttpError(res.status, json);
    return json;
  } finally {
    clearTimeout(t);
  }
}

const ToolRememberArgs = z.object({
  scope: z.string().min(1).optional(),
  client_id: z.string().min(1).optional(),
  type: z.enum(["event", "entity", "topic", "rule"]).default("event"),
  memory_lane: z.enum(["private", "shared"]).optional(),
  producer_agent_id: z.string().min(1).optional(),
  owner_agent_id: z.string().min(1).optional(),
  owner_team_id: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  text: z.string().min(1),
  slots: z.record(z.unknown()).optional(),
  auto_embed: z.boolean().optional(),
  force_reembed: z.boolean().optional(),
  trigger_topic_cluster: z.boolean().optional(),
  topic_cluster_async: z.boolean().optional(),
});

const ToolRecallTextArgs = z.object({
  scope: z.string().min(1).optional(),
  query_text: z.string().min(1),
  consumer_agent_id: z.string().min(1).optional(),
  consumer_team_id: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  neighborhood_hops: z.coerce.number().int().min(1).max(2).optional(),
  max_nodes: z.coerce.number().int().min(1).max(200).optional(),
  max_edges: z.coerce.number().int().min(0).max(100).optional(),
  min_edge_weight: z.coerce.number().min(0).max(1).optional(),
  min_edge_confidence: z.coerce.number().min(0).max(1).optional(),
});

type ToolDef = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

const TOOLS: ToolDef[] = [
  {
    name: "memory_remember",
    title: "Remember (Write Memory)",
    description:
      "Write a single memory node (default type=event) into Aionis Memory Graph. Embeddings are derived (async) and do not block the write.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        scope: { type: "string", description: "Optional. Defaults to AIONIS_SCOPE." },
        client_id: { type: "string", description: "Optional idempotency key (recommended if you may retry)." },
        type: { type: "string", enum: ["event", "entity", "topic", "rule"], default: "event" },
        memory_lane: { type: "string", enum: ["private", "shared"], default: "private", description: "Optional. Private/shared memory lane." },
        producer_agent_id: { type: "string", description: "Optional producer agent id (write audit)." },
        owner_agent_id: { type: "string", description: "Optional owner agent id (private lane visibility)." },
        owner_team_id: { type: "string", description: "Optional owner team id (team-private visibility)." },
        title: { type: "string", description: "Optional display title (recommended for entity/topic/rule)." },
        text: { type: "string", description: "Required. Stored as node.text_summary." },
        slots: { type: "object", description: "Optional JSON object; stored as node.slots." },
        auto_embed: { type: "boolean", description: "Optional. If true, enqueue embedding backfill if needed." },
        force_reembed: { type: "boolean", description: "Optional. If true, re-embed even if already READY." },
        trigger_topic_cluster: { type: "boolean", description: "Optional. If true, enqueue topic clustering." },
        topic_cluster_async: { type: "boolean", description: "Optional. If true, clustering runs via outbox." },
      },
      required: ["text"],
    },
  },
  {
    name: "memory_recall_text",
    title: "Recall (Text Context)",
    description: "Recall relevant memory as a compact, LLM-friendly text context (no embeddings returned).",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        scope: { type: "string", description: "Optional. Defaults to AIONIS_SCOPE." },
        query_text: { type: "string", description: "Required recall query." },
        consumer_agent_id: { type: "string", description: "Optional consumer agent id (lane visibility + recall audit)." },
        consumer_team_id: { type: "string", description: "Optional consumer team id." },
        limit: { type: "integer", minimum: 1, maximum: 200, default: 24 },
        neighborhood_hops: { type: "integer", minimum: 1, maximum: 2, default: 2 },
        max_nodes: { type: "integer", minimum: 1, maximum: 200, default: 60 },
        max_edges: { type: "integer", minimum: 0, maximum: 100, default: 80 },
        min_edge_weight: { type: "number", minimum: 0, maximum: 1, default: 0.2 },
        min_edge_confidence: { type: "number", minimum: 0, maximum: 1, default: 0.2 },
      },
      required: ["query_text"],
    },
  },
];

async function toolRemember(env: Env, rawArgs: unknown) {
  const parsed = ToolRememberArgs.safeParse(rawArgs);
  if (!parsed.success) {
    return {
      isError: true,
      content: [{ type: "text", text: `invalid_args: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}` }],
    };
  }

  const a = parsed.data;
  const body: any = {
    input_text: a.text,
    auto_embed: a.auto_embed ?? true,
    force_reembed: a.force_reembed ?? false,
    nodes: [
      {
        client_id: a.client_id,
        type: a.type,
        memory_lane: a.memory_lane ?? "private",
        producer_agent_id: a.producer_agent_id,
        owner_agent_id: a.owner_agent_id,
        owner_team_id: a.owner_team_id,
        title: a.title,
        text_summary: a.text,
        slots: a.slots ?? {},
      },
    ],
  };
  if (typeof a.trigger_topic_cluster === "boolean") body.trigger_topic_cluster = a.trigger_topic_cluster;
  if (typeof a.topic_cluster_async === "boolean") body.topic_cluster_async = a.topic_cluster_async;
  if (a.scope) body.scope = a.scope;
  if (a.memory_lane) body.memory_lane = a.memory_lane;
  if (a.producer_agent_id) body.producer_agent_id = a.producer_agent_id;
  if (a.owner_agent_id) body.owner_agent_id = a.owner_agent_id;
  if (a.owner_team_id) body.owner_team_id = a.owner_team_id;

  try {
    const res: any = await postJson(env, "/v1/memory/write", body);
    const node = Array.isArray(res?.nodes) ? res.nodes[0] : null;
    const text = [
      `ok: wrote ${a.type}`,
      node?.id ? `node_id: ${node.id}` : null,
      res?.commit_id ? `commit_id: ${res.commit_id}` : null,
      res?.commit_hash ? `commit_hash: ${res.commit_hash}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    return { content: [{ type: "text", text: clipText(text, env.AIONIS_MAX_TOOL_TEXT_CHARS) }] };
  } catch (e) {
    const he = e as unknown;
    if (he instanceof HttpError) {
      return {
        isError: true,
        content: [{ type: "text", text: `aionis_http_error: ${he.status}\n${JSON.stringify(he.body)}` }],
      };
    }
    return { isError: true, content: [{ type: "text", text: `aionis_error: ${(e as Error).message}` }] };
  }
}

async function toolRecallText(env: Env, rawArgs: unknown) {
  const parsed = ToolRecallTextArgs.safeParse(rawArgs);
  if (!parsed.success) {
    return {
      isError: true,
      content: [{ type: "text", text: `invalid_args: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}` }],
    };
  }

  const a = parsed.data;
  const body: any = {
    query_text: a.query_text,
  };
  if (a.scope) body.scope = a.scope;
  if (a.consumer_agent_id) body.consumer_agent_id = a.consumer_agent_id;
  if (a.consumer_team_id) body.consumer_team_id = a.consumer_team_id;
  if (typeof a.limit === "number") body.limit = a.limit;
  if (typeof a.neighborhood_hops === "number") body.neighborhood_hops = a.neighborhood_hops;
  if (typeof a.max_nodes === "number") body.max_nodes = a.max_nodes;
  if (typeof a.max_edges === "number") body.max_edges = a.max_edges;
  if (typeof a.min_edge_weight === "number") body.min_edge_weight = a.min_edge_weight;
  if (typeof a.min_edge_confidence === "number") body.min_edge_confidence = a.min_edge_confidence;

  try {
    const res: any = await postJson(env, "/v1/memory/recall_text", body);
    const text = typeof res?.context?.text === "string" ? res.context.text : JSON.stringify(res);
    return { content: [{ type: "text", text: clipText(text, env.AIONIS_MAX_TOOL_TEXT_CHARS) }] };
  } catch (e) {
    const he = e as unknown;
    if (he instanceof HttpError) {
      return {
        isError: true,
        content: [{ type: "text", text: `aionis_http_error: ${he.status}\n${JSON.stringify(he.body)}` }],
      };
    }
    return { isError: true, content: [{ type: "text", text: `aionis_error: ${(e as Error).message}` }] };
  }
}

async function toolsCall(env: Env, params: unknown) {
  const p = z
    .object({
      name: z.string().min(1),
      arguments: z.unknown().optional(),
    })
    .safeParse(params);
  if (!p.success) {
    return {
      isError: true,
      content: [{ type: "text", text: `invalid_params: ${p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}` }],
    };
  }

  switch (p.data.name) {
    case "memory_remember":
      return toolRemember(env, p.data.arguments);
    case "memory_recall_text":
      return toolRecallText(env, p.data.arguments);
    default:
      return { isError: true, content: [{ type: "text", text: `unknown_tool: ${p.data.name}` }] };
  }
}

async function handle(env: Env, msg: JsonRpcRequest) {
  const id = msg.id ?? null;
  const method = msg.method;

  // Notifications (no id) should not get a response.
  const isNotification = msg.id === undefined;

  if (!method || msg.jsonrpc !== "2.0") {
    if (!isNotification) err(id, -32600, "Invalid Request");
    return;
  }

  if (method === "initialize") {
    // Accept the client's protocolVersion and echo it back for compatibility.
    const proto = z
      .object({ protocolVersion: z.string().min(1).optional() })
      .safeParse(msg.params).success
      ? (msg.params as any).protocolVersion
      : undefined;
    const protocolVersion = typeof proto === "string" && proto.length > 0 ? proto : "2024-11-05";

    if (!isNotification) {
      ok(id, {
        protocolVersion,
        capabilities: {
          tools: { listChanged: false },
        },
        serverInfo: {
          name: "aionis-memory-graph",
          version: "0.2.1",
        },
      });
    }
    return;
  }

  if (method === "tools/list") {
    if (!isNotification) ok(id, { tools: TOOLS });
    return;
  }

  if (method === "tools/call") {
    const result = await toolsCall(env, msg.params);
    if (!isNotification) ok(id, result);
    return;
  }

  if (method === "shutdown") {
    if (!isNotification) ok(id, null);
    return;
  }

  if (method === "exit") {
    process.exit(0);
  }

  // Unknown method
  if (!isNotification) err(id, -32601, "Method not found", { method });
}

async function main() {
  const env = loadEnv();

  // MCP stdio transport: newline-delimited JSON-RPC 2.0 messages. No stdout logging.
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on("line", (line) => {
    void (async () => {
      const trimmed = line.trim();
      if (!trimmed) return;

      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch (e) {
        // Parse error: no id to reply with reliably.
        console.error("mcp_parse_error", (e as Error).message);
        return;
      }

      const msgs = Array.isArray(parsed) ? parsed : [parsed];
      for (const m of msgs) {
        await handle(env, m as JsonRpcRequest);
      }
    })().catch((e) => {
      console.error("mcp_fatal", (e as Error).stack ?? String(e));
    });
  });
}

main().catch((e) => {
  console.error("mcp_boot_error", (e as Error).stack ?? String(e));
  process.exit(1);
});
