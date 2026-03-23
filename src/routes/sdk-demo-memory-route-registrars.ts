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

export function registerSdkDemoMemoryWriteRoute(args: RegisterSdkDemoRoutesArgs) {
  registerMemoryWriteRoutes(buildSdkDemoMemoryWriteRouteArgs(args));
}

export function registerSdkDemoMemoryAccessRoute(args: RegisterSdkDemoRoutesArgs) {
  registerMemoryAccessRoutes(buildSdkDemoMemoryAccessRouteArgs(args));
}

export function registerSdkDemoMemoryContextRuntimeRoute(args: RegisterSdkDemoRoutesArgs) {
  registerMemoryContextRuntimeRoutes(buildSdkDemoMemoryContextRuntimeRouteArgs(args));
}

export function registerSdkDemoMemoryFeedbackToolRoute(args: RegisterSdkDemoRoutesArgs) {
  registerMemoryFeedbackToolRoutes(buildSdkDemoMemoryFeedbackToolRouteArgs(args));
}

export function registerSdkDemoMemoryReplayGovernedRoute(args: RegisterSdkDemoRoutesArgs) {
  registerMemoryReplayGovernedRoutes(buildSdkDemoMemoryReplayGovernedRouteArgs(args));
}
