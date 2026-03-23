import type { RegisterSdkDemoRoutesArgs } from "../host/http-host-sdk-demo-args.js";
import {
  registerSdkDemoMemoryAccessImplementation,
  registerSdkDemoMemoryContextRuntimeImplementation,
  registerSdkDemoMemoryFeedbackToolImplementation,
  registerSdkDemoMemoryReplayGovernedImplementation,
  registerSdkDemoMemoryWriteImplementation,
} from "./sdk-demo-memory-route-implementations.js";

export function registerSdkDemoMemoryWriteRoute(args: RegisterSdkDemoRoutesArgs) {
  registerSdkDemoMemoryWriteImplementation(args);
}

export function registerSdkDemoMemoryAccessRoute(args: RegisterSdkDemoRoutesArgs) {
  registerSdkDemoMemoryAccessImplementation(args);
}

export function registerSdkDemoMemoryContextRuntimeRoute(args: RegisterSdkDemoRoutesArgs) {
  registerSdkDemoMemoryContextRuntimeImplementation(args);
}

export function registerSdkDemoMemoryFeedbackToolRoute(args: RegisterSdkDemoRoutesArgs) {
  registerSdkDemoMemoryFeedbackToolImplementation(args);
}

export function registerSdkDemoMemoryReplayGovernedRoute(args: RegisterSdkDemoRoutesArgs) {
  registerSdkDemoMemoryReplayGovernedImplementation(args);
}
