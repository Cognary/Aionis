import type { RegisterSdkDemoRoutesArgs } from "../host/http-host-sdk-demo-args.js";
import { registerMemoryContextRuntimeRoutes } from "./memory-context-runtime.js";
import { registerMemoryReplayGovernedRoutes } from "./memory-replay-governed.js";
import { registerMemoryWriteRoutes } from "./memory-write.js";
import { registerSdkDemoMemoryAccessRoutes } from "./sdk-demo-memory-access.js";
import { registerSdkDemoMemoryFeedbackToolRoutes } from "./sdk-demo-memory-feedback-tools.js";
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
  registerSdkDemoMemoryAccessRoutes(buildSdkDemoMemoryAccessRouteArgs(args));
}

export function registerSdkDemoMemoryContextRuntimeRuntimeAdapter(args: RegisterSdkDemoRoutesArgs) {
  registerMemoryContextRuntimeRoutes(buildSdkDemoMemoryContextRuntimeRouteArgs(args));
}

export function registerSdkDemoMemoryFeedbackToolRuntimeAdapter(args: RegisterSdkDemoRoutesArgs) {
  registerSdkDemoMemoryFeedbackToolRoutes(buildSdkDemoMemoryFeedbackToolRouteArgs(args));
}

export function registerSdkDemoMemoryReplayGovernedRuntimeAdapter(args: RegisterSdkDemoRoutesArgs) {
  registerMemoryReplayGovernedRoutes(buildSdkDemoMemoryReplayGovernedRouteArgs(args));
}
