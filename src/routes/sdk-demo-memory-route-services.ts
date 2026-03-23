import type { RegisterSdkDemoRoutesArgs } from "../host/http-host-sdk-demo-args.js";
import { registerMemoryAccessRoutes } from "./memory-access.js";
import { registerMemoryContextRuntimeRoutes } from "./memory-context-runtime.js";
import { registerMemoryFeedbackToolRoutes } from "./memory-feedback-tools.js";
import { registerMemoryReplayGovernedRoutes } from "./memory-replay-governed.js";
import { registerMemoryWriteRoutes } from "./memory-write.js";
import {
  buildSdkDemoMemoryAccessRouteArgs,
  buildSdkDemoMemoryContextRuntimeRouteArgs,
  buildSdkDemoMemoryFeedbackToolRouteArgs,
  buildSdkDemoMemoryReplayGovernedRouteArgs,
  buildSdkDemoMemoryWriteRouteArgs,
} from "./sdk-demo-memory-route-deps.js";

export function registerSdkDemoMemoryWriteService(args: RegisterSdkDemoRoutesArgs) {
  registerMemoryWriteRoutes(buildSdkDemoMemoryWriteRouteArgs(args));
}

export function registerSdkDemoMemoryAccessService(args: RegisterSdkDemoRoutesArgs) {
  registerMemoryAccessRoutes(buildSdkDemoMemoryAccessRouteArgs(args));
}

export function registerSdkDemoMemoryContextRuntimeService(args: RegisterSdkDemoRoutesArgs) {
  registerMemoryContextRuntimeRoutes(buildSdkDemoMemoryContextRuntimeRouteArgs(args));
}

export function registerSdkDemoMemoryFeedbackToolService(args: RegisterSdkDemoRoutesArgs) {
  registerMemoryFeedbackToolRoutes(buildSdkDemoMemoryFeedbackToolRouteArgs(args));
}

export function registerSdkDemoMemoryReplayGovernedService(args: RegisterSdkDemoRoutesArgs) {
  registerMemoryReplayGovernedRoutes(buildSdkDemoMemoryReplayGovernedRouteArgs(args));
}
