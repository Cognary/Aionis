import { spawn } from "node:child_process";
import type { AionisMcpEnv } from "../mcp/client.js";
import { createAionisAdapterSidecar, type CreateAionisAdapterSidecarArgs } from "./sidecar.js";
import type {
  SidecarIntrospectRequested,
  SidecarResponse,
} from "./sidecar-contracts.js";
import type {
  AdapterTaskStarted,
  AdapterTaskTerminalOutcome,
  AdapterToolSelectionRequested,
} from "./contracts.js";

export type CommandRunnerResult = {
  exit_code: number;
  stdout: string;
  stderr: string;
};

export type CommandRunnerArgs = {
  command: string;
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
};

export type CommandRunner = (args: CommandRunnerArgs) => Promise<CommandRunnerResult>;

export type WrapperCommandStep = {
  task_id: string;
  step_id: string;
  selected_tool: string;
  candidates: string[];
  context: unknown;
  command: string;
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  validated?: boolean;
  reverted?: boolean;
  note?: string;
};

export type CreateAionisAdapterWrapperArgs = CreateAionisAdapterSidecarArgs & {
  commandRunner?: CommandRunner;
};

export async function runLocalCommand(args: CommandRunnerArgs): Promise<CommandRunnerResult> {
  return await new Promise((resolve) => {
    const child = spawn(args.command, args.args ?? [], {
      cwd: args.cwd,
      env: args.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout?.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr?.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.on("error", (error) => {
      resolve({
        exit_code: 127,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: `${Buffer.concat(stderr).toString("utf8")}${String(error)}`,
      });
    });
    child.on("close", (code) => {
      resolve({
        exit_code: code ?? 1,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
  });
}

export class AionisAdapterWrapper {
  readonly env: AionisMcpEnv;
  readonly sidecar;
  private readonly commandRunner: CommandRunner;

  constructor(args: CreateAionisAdapterWrapperArgs) {
    this.env = args.env;
    this.sidecar = createAionisAdapterSidecar(args);
    this.commandRunner = args.commandRunner ?? runLocalCommand;
  }

  async startTask(event: AdapterTaskStarted): Promise<SidecarResponse> {
    return await this.sidecar.dispatch({
      request_id: `task_started:${event.task_id}`,
      event,
    });
  }

  async selectTool(event: AdapterToolSelectionRequested): Promise<SidecarResponse> {
    return await this.sidecar.dispatch({
      request_id: `tool_selection_requested:${event.task_id}`,
      event,
    });
  }

  async executeCommandStep(step: WrapperCommandStep): Promise<{
    execution: CommandRunnerResult;
    feedback: SidecarResponse;
  }> {
    const execution = await this.commandRunner({
      command: step.command,
      args: step.args,
      cwd: step.cwd,
      env: step.env,
    });
    const feedback = await this.sidecar.dispatch({
      request_id: `tool_executed:${step.task_id}:${step.step_id}`,
      event: {
        event_type: "tool_executed",
        task_id: step.task_id,
        step_id: step.step_id,
        selected_tool: step.selected_tool,
        candidates: step.candidates,
        context: step.context,
        command_exit_code: execution.exit_code,
        validated: step.validated,
        reverted: step.reverted,
        note: step.note,
      },
    });
    return { execution, feedback };
  }

  async finalizeTask(event: AdapterTaskTerminalOutcome): Promise<SidecarResponse> {
    return await this.sidecar.dispatch({
      request_id: `${event.event_type}:${event.task_id}`,
      event,
    });
  }

  async introspect(event: Omit<SidecarIntrospectRequested, "event_type"> = {}): Promise<SidecarResponse> {
    return await this.sidecar.dispatch({
      request_id: `introspect:${event.scope ?? this.env.AIONIS_SCOPE ?? "default"}`,
      event: {
        event_type: "introspect_requested",
        ...event,
      },
    });
  }
}

export function createAionisAdapterWrapper(args: CreateAionisAdapterWrapperArgs): AionisAdapterWrapper {
  return new AionisAdapterWrapper(args);
}
