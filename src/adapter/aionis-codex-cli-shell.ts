import { loadAionisMcpEnv } from "../mcp/client.js";
import { createAionisCodexCliShellBridge } from "./codex-cli-shell-bridge.js";
import { CodexCliShellRunRequestSchema } from "./codex-cli-shell-contracts.js";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  const env = loadAionisMcpEnv(process.env);
  const bridge = createAionisCodexCliShellBridge({ env });
  const raw = (await readStdin()).trim();
  if (!raw) {
    process.stdout.write(JSON.stringify({ ok: false, error: "empty_request" }) + "\n");
    process.exitCode = 1;
    return;
  }
  try {
    const request = CodexCliShellRunRequestSchema.parse(JSON.parse(raw));
    const result = await bridge.run(request);
    process.stdout.write(JSON.stringify({ ok: true, result }) + "\n");
  } catch (error) {
    process.stdout.write(JSON.stringify({
      ok: false,
      error: "codex_cli_shell_failed",
      details: String(error),
    }) + "\n");
    process.exitCode = 1;
  }
}

await main();
