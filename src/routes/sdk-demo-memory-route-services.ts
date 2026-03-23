import type { RegisterSdkDemoRoutesArgs } from "../host/http-host-sdk-demo-args.js";
import {
  registerSdkDemoMemoryAccessRuntimeAdapter,
  registerSdkDemoMemoryContextRuntimeRuntimeAdapter,
  registerSdkDemoMemoryFeedbackToolRuntimeAdapter,
  registerSdkDemoMemoryReplayGovernedRuntimeAdapter,
  registerSdkDemoMemoryWriteRuntimeAdapter,
} from "./sdk-demo-memory-runtime-adapters.js";

export function registerSdkDemoMemoryWriteService(args: RegisterSdkDemoRoutesArgs) {
  registerSdkDemoMemoryWriteRuntimeAdapter(args);
}

export function registerSdkDemoMemoryAccessService(args: RegisterSdkDemoRoutesArgs) {
  registerSdkDemoMemoryAccessRuntimeAdapter(args);
}

export function registerSdkDemoMemoryContextRuntimeService(args: RegisterSdkDemoRoutesArgs) {
  registerSdkDemoMemoryContextRuntimeRuntimeAdapter(args);
}

export function registerSdkDemoMemoryFeedbackToolService(args: RegisterSdkDemoRoutesArgs) {
  registerSdkDemoMemoryFeedbackToolRuntimeAdapter(args);
}

export function registerSdkDemoMemoryReplayGovernedService(args: RegisterSdkDemoRoutesArgs) {
  registerSdkDemoMemoryReplayGovernedRuntimeAdapter(args);
}
