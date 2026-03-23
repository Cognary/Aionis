import type { RegisterSdkDemoRoutesArgs } from "../host/http-host-sdk-demo-args.js";
import {
  registerSdkDemoMemoryAccessService,
  registerSdkDemoMemoryContextRuntimeService,
  registerSdkDemoMemoryFeedbackToolService,
  registerSdkDemoMemoryReplayGovernedService,
  registerSdkDemoMemoryWriteService,
} from "./sdk-demo-memory-route-services.js";

export function registerSdkDemoMemoryWriteImplementation(args: RegisterSdkDemoRoutesArgs) {
  registerSdkDemoMemoryWriteService(args);
}

export function registerSdkDemoMemoryAccessImplementation(args: RegisterSdkDemoRoutesArgs) {
  registerSdkDemoMemoryAccessService(args);
}

export function registerSdkDemoMemoryContextRuntimeImplementation(args: RegisterSdkDemoRoutesArgs) {
  registerSdkDemoMemoryContextRuntimeService(args);
}

export function registerSdkDemoMemoryFeedbackToolImplementation(args: RegisterSdkDemoRoutesArgs) {
  registerSdkDemoMemoryFeedbackToolService(args);
}

export function registerSdkDemoMemoryReplayGovernedImplementation(args: RegisterSdkDemoRoutesArgs) {
  registerSdkDemoMemoryReplayGovernedService(args);
}
