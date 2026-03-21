import { loadAionisMcpEnv } from "../mcp/client.js";
import {
  CodexHookInputSchema,
  createContinueOutput,
  parseHookEventName,
} from "./codex-cli-hook-contracts.js";
import { createAionisCodexCliHookBridge } from "./codex-cli-hook-bridge.js";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  const env = loadAionisMcpEnv(process.env);
  const bridge = createAionisCodexCliHookBridge({ env });
  const raw = (await readStdin()).trim();
  const guessedEvent = raw ? parseHookEventName((JSON.parse(raw) as Record<string, unknown>).hook_event_name) : null;

  try {
    if (!raw) {
      process.stdout.write(JSON.stringify(createContinueOutput({ suppressOutput: true })) + "\n");
      return;
    }
    const input = CodexHookInputSchema.parse(JSON.parse(raw));
    let output;
    switch (input.hook_event_name) {
      case "SessionStart":
        output = await bridge.onSessionStart(input);
        break;
      case "UserPromptSubmit":
        output = await bridge.onUserPromptSubmit(input);
        break;
      case "Stop":
        output = await bridge.onStop(input);
        break;
    }
    process.stdout.write(JSON.stringify(output) + "\n");
  } catch {
    process.stdout.write(JSON.stringify(createContinueOutput({
      eventName: guessedEvent ?? undefined,
      suppressOutput: true,
    })) + "\n");
  }
}

await main();
