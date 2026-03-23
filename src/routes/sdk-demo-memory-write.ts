import { registerMemoryWriteRoute, type RegisterMemoryWriteRoutesArgs } from "./memory-write-shared.js";

export function registerSdkDemoMemoryWriteRoutes(args: RegisterMemoryWriteRoutesArgs) {
  registerMemoryWriteRoute(args);
}
