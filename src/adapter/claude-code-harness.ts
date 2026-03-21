import type { AionisMcpEnv } from "../mcp/client.js";
import { postAionisJson } from "../mcp/client.js";
import { AionisClaudeCodeBridge } from "./claude-code-bridge.js";
import { createAionisExecutionAdapter, type CreateAionisExecutionAdapterArgs } from "./aionis-adapter.js";
import type {
  AdapterTaskStarted,
  AdapterTaskTerminalOutcome,
  AdapterToolExecuted,
  AdapterToolSelectionRequested,
} from "./contracts.js";

type PostJsonLike = <TResponse = unknown>(env: AionisMcpEnv, path: string, body: unknown) => Promise<TResponse>;

export type AdapterIntrospectionRequest = {
  tenant_id?: string;
  scope?: string;
  consumer_agent_id?: string;
  consumer_team_id?: string;
  limit?: number;
};

export type CreateAionisClaudeCodeHarnessArgs = CreateAionisExecutionAdapterArgs;

export class AionisClaudeCodeHarness {
  readonly env: AionisMcpEnv;
  readonly adapter;
  readonly bridge;
  private readonly postJson: PostJsonLike;

  constructor(args: CreateAionisClaudeCodeHarnessArgs) {
    this.env = args.env;
    this.adapter = createAionisExecutionAdapter(args);
    this.bridge = new AionisClaudeCodeBridge(this.adapter);
    this.postJson = args.postJson ?? postAionisJson;
  }

  async startTask(event: AdapterTaskStarted) {
    return await this.bridge.onTaskStart(event);
  }

  async selectTool(event: AdapterToolSelectionRequested) {
    return await this.bridge.beforeToolUse(event);
  }

  async recordStep(event: AdapterToolExecuted) {
    return await this.bridge.onToolExecuted(event);
  }

  async finalizeTask(event: AdapterTaskTerminalOutcome) {
    return await this.bridge.onTaskTerminal(event);
  }

  async introspect(request: AdapterIntrospectionRequest = {}) {
    return await this.postJson<any>(this.env, "/v1/memory/execution/introspect", {
      ...request,
      scope: request.scope ?? this.env.AIONIS_SCOPE,
    });
  }
}

export function createAionisClaudeCodeHarness(args: CreateAionisClaudeCodeHarnessArgs): AionisClaudeCodeHarness {
  return new AionisClaudeCodeHarness(args);
}
