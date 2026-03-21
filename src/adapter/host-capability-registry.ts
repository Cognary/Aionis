import type {
  HostCapabilityHandler,
  HostCapabilityOutput,
  HostCapabilityRuntime,
  HostIntegrationEvent,
} from "./host-integration-contracts.js";

export class AionisHostCapabilityRegistry {
  constructor(
    private readonly runtime: HostCapabilityRuntime,
    private readonly handlers: HostCapabilityHandler[],
  ) {}

  async dispatch(event: HostIntegrationEvent): Promise<HostCapabilityOutput[]> {
    const outputs: HostCapabilityOutput[] = [];
    for (const handler of this.handlers) {
      if (!handler.subscribed_events.includes(event.event_type)) continue;
      const next = await handler.handle(event, this.runtime);
      if (next.length > 0) outputs.push(...next);
    }
    return outputs;
  }
}
