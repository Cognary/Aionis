import { registerSdkDemoMemoryRoutes } from "../routes/sdk-demo-memory-routes.js";
import { registerLiteServerOnlyRoutes } from "./lite-edition.js";
import type { RegisterSdkDemoRoutesArgs } from "./http-host-sdk-demo-args.js";

export function registerSdkDemoRoutes(args: RegisterSdkDemoRoutesArgs) {
  registerLiteServerOnlyRoutes(args.app);
  registerSdkDemoMemoryRoutes(args);
}
