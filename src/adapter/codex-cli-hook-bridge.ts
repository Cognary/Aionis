import type { AionisMcpEnv } from "../mcp/client.js";
import { postAionisJson } from "../mcp/client.js";
import { AionisHostCapabilityRegistry } from "./host-capability-registry.js";
import { createCodexCliCapabilityHandlers } from "./codex-cli-capabilities.js";
import type {
  CodexHookOutput,
  CodexSessionStartInput,
  CodexStopInput,
  CodexUserPromptSubmitInput,
} from "./codex-cli-hook-contracts.js";
import { createContinueOutput } from "./codex-cli-hook-contracts.js";
import type { HostCapabilityOutput, HostExecutionContext } from "./host-integration-contracts.js";

type PostJsonLike = <TResponse = unknown>(env: AionisMcpEnv, path: string, body: unknown) => Promise<TResponse>;

export type CreateAionisCodexCliHookBridgeArgs = {
  env: AionisMcpEnv;
  postJson?: PostJsonLike;
};

function buildExecutionContext(
  env: AionisMcpEnv,
  input: CodexSessionStartInput | CodexUserPromptSubmitInput | CodexStopInput,
): HostExecutionContext {
  return {
    host_name: "codex_cli",
    host_version: null,
    session_id: input.session_id,
    task_id: "turn_id" in input ? `codex:${input.session_id}:${input.turn_id}` : null,
    turn_id: "turn_id" in input ? input.turn_id : null,
    cwd: input.cwd,
    scope: env.AIONIS_SCOPE,
    prompt: "prompt" in input ? input.prompt : null,
    host_metadata: {
      model: input.model,
      permission_mode: input.permission_mode,
      transcript_path: input.transcript_path ?? null,
      ...(input.hook_event_name === "SessionStart" ? { source: input.source } : {}),
    },
  };
}

function mapOutputsToHookOutput(
  eventName: "SessionStart" | "UserPromptSubmit" | "Stop",
  outputs: HostCapabilityOutput[],
): CodexHookOutput {
  const contextText = outputs
    .filter((output) => output.channel === "context_injection")
    .map((output) => output.text.trim())
    .filter(Boolean)
    .join("\n\n");
  const warningText = outputs
    .filter((output) => output.channel === "warning")
    .map((output) => output.text.trim())
    .filter(Boolean)
    .join("\n");
  return createContinueOutput({
    eventName,
    additionalContext: contextText || null,
    systemMessage: warningText || undefined,
  });
}

export class AionisCodexCliHookBridge {
  readonly env: AionisMcpEnv;
  private readonly registry: AionisHostCapabilityRegistry;

  constructor(args: CreateAionisCodexCliHookBridgeArgs) {
    this.env = args.env;
    this.registry = new AionisHostCapabilityRegistry(
      {
        env: this.env,
        postJson: args.postJson ?? postAionisJson,
      },
      createCodexCliCapabilityHandlers(),
    );
  }

  async onSessionStart(input: CodexSessionStartInput): Promise<CodexHookOutput> {
    const outputs = await this.registry.dispatch({
      event_type: "session_started",
      context: buildExecutionContext(this.env, input),
      source: input.source,
    });
    return mapOutputsToHookOutput("SessionStart", outputs);
  }

  async onUserPromptSubmit(input: CodexUserPromptSubmitInput): Promise<CodexHookOutput> {
    const outputs = await this.registry.dispatch({
      event_type: "prompt_submitted",
      context: buildExecutionContext(this.env, input),
      prompt: input.prompt,
    });
    return mapOutputsToHookOutput("UserPromptSubmit", outputs);
  }

  async onStop(input: CodexStopInput): Promise<CodexHookOutput> {
    const outputs = await this.registry.dispatch({
      event_type: "task_terminal",
      context: buildExecutionContext(this.env, input),
      outcome: "stopped",
      last_assistant_message: input.last_assistant_message ?? null,
    });
    return mapOutputsToHookOutput("Stop", outputs);
  }
}

export function createAionisCodexCliHookBridge(args: CreateAionisCodexCliHookBridgeArgs) {
  return new AionisCodexCliHookBridge(args);
}
