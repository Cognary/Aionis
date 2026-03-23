import {
  registerApplicationRoutes,
} from "./host/http-host.js";
import { startAionisRuntimeWithRouteRegistrar } from "./runtime-entry-shared.js";

export async function startAionisRuntime(): Promise<void> {
  await startAionisRuntimeWithRouteRegistrar({
    registerRoutes: registerApplicationRoutes,
  });
}
