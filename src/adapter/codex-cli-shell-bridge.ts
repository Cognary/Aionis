import type { AionisMcpEnv } from "../mcp/client.js";
import { postAionisJson } from "../mcp/client.js";
import {
  runLocalCommand,
  type CommandRunner,
  type CommandRunnerResult,
} from "./wrapper.js";
import { AionisHostCapabilityRegistry } from "./host-capability-registry.js";
import { createCodexCliCapabilityHandlers } from "./codex-cli-capabilities.js";
import type {
  HostCapabilityOutput,
  HostExecutionContext,
} from "./host-integration-contracts.js";
import type { CodexCliShellRunRequest } from "./codex-cli-shell-contracts.js";

type PostJsonLike = <TResponse = unknown>(env: AionisMcpEnv, path: string, body: unknown) => Promise<TResponse>;

export type CreateAionisCodexCliShellBridgeArgs = {
  env: AionisMcpEnv;
  postJson?: PostJsonLike;
  commandRunner?: CommandRunner;
};

function buildExecutionContext(
  env: AionisMcpEnv,
  request: CodexCliShellRunRequest,
): HostExecutionContext {
  return {
    host_name: "codex_cli",
    host_version: null,
    session_id: request.session_id,
    task_id: `codex:${request.session_id}:${request.turn_id}`,
    turn_id: request.turn_id,
    cwd: request.cwd,
    scope: request.scope ?? env.AIONIS_SCOPE,
    prompt: request.prompt,
    task_kind: request.task_kind ?? null,
    goal: request.goal ?? request.prompt,
    tool_candidates: request.candidates,
    selected_tool: request.selected_tool ?? "bash",
    host_metadata: {
      model: request.model,
      permission_mode: request.permission_mode,
      transcript_path: request.transcript_path ?? null,
    },
  };
}

function buildDefaultSelectionContext(request: CodexCliShellRunRequest) {
  return {
    task_kind: request.task_kind ?? "codex_cli_shell_task",
    goal: request.goal ?? request.prompt,
    prompt: request.prompt,
    cwd: request.cwd,
    codex: {
      model: request.model,
      permission_mode: request.permission_mode,
      transcript_path: request.transcript_path ?? null,
    },
  };
}

export type CodexCliShellRunResult = {
  selection: HostCapabilityOutput[];
  execution: CommandRunnerResult;
  feedback: HostCapabilityOutput[];
  finalization: HostCapabilityOutput[];
  introspection: unknown | null;
};

export class AionisCodexCliShellBridge {
  readonly env: AionisMcpEnv;
  private readonly registry: AionisHostCapabilityRegistry;
  private readonly postJson: PostJsonLike;
  private readonly commandRunner: CommandRunner;

  constructor(args: CreateAionisCodexCliShellBridgeArgs) {
    this.env = args.env;
    this.postJson = args.postJson ?? postAionisJson;
    this.registry = new AionisHostCapabilityRegistry(
      {
        env: this.env,
        postJson: this.postJson,
      },
      createCodexCliCapabilityHandlers(),
    );
    this.commandRunner = args.commandRunner ?? runLocalCommand;
  }

  async run(request: CodexCliShellRunRequest): Promise<CodexCliShellRunResult> {
    const context = buildExecutionContext(this.env, request);
    const selectionContext = request.selection_context ?? buildDefaultSelectionContext(request);

    const selection = await this.registry.dispatch({
      event_type: "tool_selection_requested",
      context,
      candidates: request.candidates,
      selection_context: selectionContext,
      include_shadow: request.include_shadow,
      rules_limit: request.rules_limit,
      strict: request.strict,
      reorder_candidates: request.reorder_candidates,
    });

    const execution = await this.commandRunner({
      command: request.command,
      args: request.args,
      cwd: request.cwd,
      env: request.env,
    });

    const feedback = await this.registry.dispatch({
      event_type: "tool_executed",
      context,
      selected_tool: request.selected_tool ?? "bash",
      candidates: request.candidates,
      execution_context: selectionContext,
      command_exit_code: execution.exit_code,
      validated: request.validated,
      reverted: request.reverted,
      note: request.note,
    });

    const finalization = await this.registry.dispatch({
      event_type: "task_terminal",
      context,
      outcome: request.finalization?.outcome ?? "completed",
      last_assistant_message: null,
      selected_tool: request.selected_tool ?? "bash",
      candidates: request.candidates,
      terminal_context: request.finalization?.context ?? selectionContext,
      note: request.finalization?.note ?? request.note,
    });

    const introspection = request.introspect
      ? await this.postJson(this.env, "/v1/memory/execution/introspect", {
          scope: context.scope,
          limit: request.introspect.limit,
        })
      : null;

    return {
      selection,
      execution,
      feedback,
      finalization,
      introspection,
    };
  }
}

export function createAionisCodexCliShellBridge(args: CreateAionisCodexCliShellBridgeArgs) {
  return new AionisCodexCliShellBridge(args);
}
