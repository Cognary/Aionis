import { registerMemoryContextRuntimeRoutesSelected } from "./memory-context-runtime.js";

export function registerSdkDemoMemoryContextRuntimeRoutes(
  args: Parameters<typeof registerMemoryContextRuntimeRoutesSelected>[0],
) {
  registerMemoryContextRuntimeRoutesSelected(args, ["planning_context", "context_assemble"]);
}
