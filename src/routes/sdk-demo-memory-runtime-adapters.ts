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

export function registerSdkDemoMemoryWriteRuntimeAdapter(args: RegisterSdkDemoRoutesArgs) {
  registerMemoryWriteRoutes(buildSdkDemoMemoryWriteRouteArgs(args));
}

export function registerSdkDemoMemoryAccessRuntimeAdapter(args: RegisterSdkDemoRoutesArgs) {
  registerMemoryAccessRoutes(buildSdkDemoMemoryAccessRouteArgs(args));
}

export function registerSdkDemoMemoryContextRuntimeRuntimeAdapter(args: RegisterSdkDemoRoutesArgs) {
  registerMemoryContextRuntimeRoutes(buildSdkDemoMemoryContextRuntimeRouteArgs(args));
}

export function registerSdkDemoMemoryFeedbackToolRuntimeAdapter(args: RegisterSdkDemoRoutesArgs) {
  registerMemoryFeedbackToolRoutes(buildSdkDemoMemoryFeedbackToolRouteArgs(args));
}

export function registerSdkDemoMemoryReplayGovernedRuntimeAdapter(args: RegisterSdkDemoRoutesArgs) {
  registerMemoryReplayGovernedRoutes(buildSdkDemoMemoryReplayGovernedRouteArgs(args));
}
