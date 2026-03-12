import type { MemoryStore } from "./memory-store.js";

export function createLiteHostStore(): MemoryStore {
  return {
    backend: "embedded",
    async withClient<T>(fn: (client: any) => Promise<T>): Promise<T> {
      return fn({});
    },
    async withTx<T>(fn: (client: any) => Promise<T>): Promise<T> {
      return fn({});
    },
    async close(): Promise<void> {
      return;
    },
  };
}
