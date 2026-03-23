import {
  registerSdkDemoRoutes,
} from "./host/http-host.js";
import { startAionisRuntimeWithRouteRegistrar } from "./runtime-entry-shared.js";

export async function startAionisSdkDemoRuntime(): Promise<void> {
  await startAionisRuntimeWithRouteRegistrar(registerSdkDemoRoutes);
}
