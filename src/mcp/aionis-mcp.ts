import { createInterface } from "node:readline";
import { loadAionisMcpEnv, resolveServerVersion } from "./client.js";
import { createAionisMcpTools } from "./tools.js";

const SERVER_VERSION = resolveServerVersion();

function send(message: unknown) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function ok(id: string | number | null, result: unknown) {
  send({ jsonrpc: "2.0", id, result });
}

function err(id: string | number | null, code: number, message: string, data?: unknown) {
  send({ jsonrpc: "2.0", id, error: { code, message, data } });
}

async function main() {
  const env = loadAionisMcpEnv();
  const tools = createAionisMcpTools({ env });
  const readline = createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });

  readline.on("line", async (line) => {
    if (!line.trim()) return;
    let request: any;
    try {
      request = JSON.parse(line);
    } catch (error: any) {
      console.error("mcp_parse_error", error?.message ?? String(error));
      err(null, -32700, "Parse error");
      return;
    }

    const id = request?.id ?? null;
    try {
      switch (request?.method) {
        case "initialize":
          ok(id, {
            protocolVersion: "2024-11-05",
            serverInfo: {
              name: "aionis-mcp",
              version: SERVER_VERSION,
            },
            capabilities: {
              tools: {},
            },
          });
          return;
        case "tools/list":
          ok(id, { tools: tools.definitions });
          return;
        case "tools/call": {
          const toolName = String(request?.params?.name ?? "");
          const result = await tools.callTool(toolName, request?.params?.arguments ?? {});
          ok(id, result);
          return;
        }
        case "shutdown":
          ok(id, {});
          return;
        case "exit":
          ok(id, {});
          process.exit(0);
          return;
        default:
          err(id, -32601, "Method not found", { method: request?.method ?? null });
      }
    } catch (error: any) {
      console.error("mcp_fatal", error?.stack ?? String(error));
      err(id, -32000, "Internal error", { message: error?.message ?? String(error) });
    }
  });
}

main().catch((error) => {
  console.error("mcp_boot_error", error?.stack ?? String(error));
  process.exit(1);
});

