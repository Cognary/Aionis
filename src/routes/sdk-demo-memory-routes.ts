import type { RegisterSdkDemoRoutesArgs } from "../host/http-host-sdk-demo-args.js";
import {
  registerSdkDemoMemoryAccessRoute,
  registerSdkDemoMemoryContextRuntimeRoute,
  registerSdkDemoMemoryFeedbackToolRoute,
  registerSdkDemoMemoryReplayGovernedRoute,
  registerSdkDemoMemoryWriteRoute,
} from "./sdk-demo-memory-route-registrars.js";

export function registerSdkDemoMemoryRoutes(args: RegisterSdkDemoRoutesArgs) {
  registerSdkDemoMemoryWriteRoute(args);
  registerSdkDemoMemoryAccessRoute(args);
  registerSdkDemoMemoryContextRuntimeRoute(args);
  registerSdkDemoMemoryFeedbackToolRoute(args);
  registerSdkDemoMemoryReplayGovernedRoute(args);
}
