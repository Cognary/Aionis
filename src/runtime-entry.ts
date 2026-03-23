import {
  registerApplicationRoutes,
} from "./host/http-host.js";
import { startAionisRuntimeWithRouteRegistrar } from "./runtime-entry-shared.js";
import { selectRuntimeBootstrapServices } from "./app/runtime-services.js";

export async function startAionisRuntime(): Promise<void> {
  await startAionisRuntimeWithRouteRegistrar({
    selectServices: selectRuntimeBootstrapServices,
    registerRoutes: registerApplicationRoutes,
  });
}
