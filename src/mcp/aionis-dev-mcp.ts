import { createInterface } from "node:readline";
import { z } from "zod";
import { loadEnv, resolveServerVersion } from "./dev/client.js";
import { TOOL_DEFINITIONS, invokeTool } from "./dev/tools.js";

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

const SERVER_VERSION = resolveServerVersion();

function send(message: JsonRpcResponse): void {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function ok(id: JsonRpcId, result: unknown): void {
  send({ jsonrpc: "2.0", id, result });
}

function fail(id: JsonRpcId, code: number, message: string, data?: unknown): void {
  send({ jsonrpc: "2.0", id, error: { code, message, data } });
}

async function handle(request: JsonRpcRequest): Promise<void> {
  const env = loadEnv();
  const id = request.id ?? null;
  const method = request.method;
  const isNotification = request.id === undefined;

  if (request.jsonrpc !== "2.0" || !method) {
    if (!isNotification) fail(id, -32600, "Invalid Request");
    return;
  }

  if (method === "initialize") {
    const parsed = z.object({ protocolVersion: z.string().min(1).optional() }).safeParse(request.params);
    const protocolVersion = parsed.success && parsed.data.protocolVersion ? parsed.data.protocolVersion : "2024-11-05";

    if (!isNotification) {
      ok(id, {
        protocolVersion,
        capabilities: {
          tools: {
            listChanged: false,
          },
        },
        serverInfo: {
          name: "aionis-dev-mcp",
          version: SERVER_VERSION,
        },
      });
    }
    return;
  }

  if (method === "tools/list") {
    if (!isNotification) {
      ok(id, {
        tools: TOOL_DEFINITIONS.map((tool) => ({
          name: tool.name,
          title: tool.title,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
      });
    }
    return;
  }

  if (method === "tools/call") {
    const parsed = z
      .object({
        name: z.string().min(1),
        arguments: z.unknown().optional(),
      })
      .strict()
      .safeParse(request.params);

    if (!parsed.success) {
      if (!isNotification) {
        ok(id, {
          isError: true,
          content: [
            {
              type: "text",
              text: `invalid_params: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(", ")}`,
            },
          ],
        });
      }
      return;
    }

    const result = await invokeTool(env, parsed.data.name, parsed.data.arguments);
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

  if (!isNotification) fail(id, -32601, "Method not found", { method });
}

async function main(): Promise<void> {
  loadEnv();

  const lineReader = createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });

  lineReader.on("line", (line) => {
    void (async () => {
      const trimmed = line.trim();
      if (!trimmed) return;

      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch (error) {
        fail(null, -32700, "Parse error");
        console.error("mcp_parse_error", (error as Error).message);
        return;
      }

      const messages = Array.isArray(parsed) ? parsed : [parsed];
      for (const message of messages) {
        await handle(message as JsonRpcRequest);
      }
    })().catch((error) => {
      console.error("mcp_fatal", (error as Error).stack ?? String(error));
    });
  });
}

main().catch((error) => {
  console.error("mcp_boot_error", (error as Error).stack ?? String(error));
  process.exit(1);
});
