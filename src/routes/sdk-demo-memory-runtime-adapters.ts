import type { RegisterSdkDemoRoutesArgs } from "../host/http-host-sdk-demo-args.js";
import { registerSdkDemoMemoryAccessRoutes } from "./sdk-demo-memory-access.js";
import { registerSdkDemoMemoryContextRuntimeRoutes } from "./sdk-demo-memory-context-runtime.js";
import { registerSdkDemoMemoryFeedbackToolRoutes } from "./sdk-demo-memory-feedback-tools.js";
import { registerSdkDemoMemoryReplayGovernedRoutes } from "./sdk-demo-memory-replay-governed.js";
import { registerSdkDemoMemoryWriteRoutes } from "./sdk-demo-memory-write.js";
import {
  buildSdkDemoMemoryAccessRouteArgs,
  buildSdkDemoMemoryContextRuntimeRouteArgs,
  buildSdkDemoMemoryFeedbackToolRouteArgs,
  buildSdkDemoMemoryReplayGovernedRouteArgs,
  buildSdkDemoMemoryWriteRouteArgs,
} from "./sdk-demo-memory-route-deps.js";

export function registerSdkDemoMemoryWriteRuntimeAdapter(args: RegisterSdkDemoRoutesArgs) {
  registerSdkDemoMemoryWriteRoutes(buildSdkDemoMemoryWriteRouteArgs(args));
}

export function registerSdkDemoMemoryAccessRuntimeAdapter(args: RegisterSdkDemoRoutesArgs) {
  registerSdkDemoMemoryAccessRoutes(buildSdkDemoMemoryAccessRouteArgs(args));
}

export function registerSdkDemoMemoryContextRuntimeRuntimeAdapter(args: RegisterSdkDemoRoutesArgs) {
  registerSdkDemoMemoryContextRuntimeRoutes(buildSdkDemoMemoryContextRuntimeRouteArgs(args));
}

export function registerSdkDemoMemoryFeedbackToolRuntimeAdapter(args: RegisterSdkDemoRoutesArgs) {
  registerSdkDemoMemoryFeedbackToolRoutes(buildSdkDemoMemoryFeedbackToolRouteArgs(args));
}

export function registerSdkDemoMemoryReplayGovernedRuntimeAdapter(args: RegisterSdkDemoRoutesArgs) {
  registerSdkDemoMemoryReplayGovernedRoutes(buildSdkDemoMemoryReplayGovernedRouteArgs(args));
}
