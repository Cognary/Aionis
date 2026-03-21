import type { AionisExecutionAdapter } from "./aionis-adapter.js";
import type {
  AdapterTaskStarted,
  AdapterTaskTerminalOutcome,
  AdapterToolExecuted,
  AdapterToolSelectionRequested,
} from "./contracts.js";

export class AionisClaudeCodeBridge {
  constructor(private readonly adapter: AionisExecutionAdapter) {}

  async onTaskStart(event: AdapterTaskStarted) {
    return await this.adapter.beginTask(event);
  }

  async beforeToolUse(event: AdapterToolSelectionRequested) {
    return await this.adapter.beforeToolUse(event);
  }

  async onToolExecuted(event: AdapterToolExecuted) {
    return await this.adapter.recordToolOutcome(event);
  }

  async onTaskTerminal(event: AdapterTaskTerminalOutcome) {
    return await this.adapter.finalizeTask(event);
  }
}
