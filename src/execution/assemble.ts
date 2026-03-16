import { buildExecutionPacketV1 } from "./packet.js";
import {
  ExecutionPacketV1Schema,
  ExecutionStateV1Schema,
  type ExecutionPacketV1,
  type ExecutionStateV1,
} from "./types.js";

export type ExecutionPacketAssemblyMode = "none" | "packet_input" | "state_first";

export function resolveExecutionPacketAssembly(input: {
  execution_packet_v1?: ExecutionPacketV1 | null;
  execution_state_v1?: ExecutionStateV1 | null;
}): {
  packet: ExecutionPacketV1 | null;
  source_mode: ExecutionPacketAssemblyMode;
} {
  if (input.execution_packet_v1) {
    return {
      packet: ExecutionPacketV1Schema.parse(input.execution_packet_v1),
      source_mode: "packet_input",
    };
  }
  if (input.execution_state_v1) {
    const state = ExecutionStateV1Schema.parse(input.execution_state_v1);
    return {
      packet: buildExecutionPacketV1({ state }),
      source_mode: "state_first",
    };
  }
  return {
    packet: null,
    source_mode: "none",
  };
}
