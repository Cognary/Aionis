import {
  registerSdkDemoRoutes,
} from "./host/http-host-sdk-demo.js";
import { buildSdkDemoRouteArgs } from "./host/http-host-sdk-demo-args.js";
import { selectSdkDemoRuntimeServices } from "./app/runtime-services-sdk-demo.js";
import { startAionisRuntimeWithRouteRegistrar } from "./runtime-entry-shared.js";

export async function startAionisSdkDemoRuntime(): Promise<void> {
  await startAionisRuntimeWithRouteRegistrar({
    selectServices: selectSdkDemoRuntimeServices,
    selectRouteArgs: buildSdkDemoRouteArgs,
    registerRoutes: registerSdkDemoRoutes,
  });
}
