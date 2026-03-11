import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import type { Env } from "../config.js";
import { assertRecallStoreAccessContract } from "../store/recall-access.js";
import { assertReplayStoreAccessContract } from "../store/replay-access.js";
import { assertWriteStoreAccessContract } from "../store/write-access.js";

type StoreLike = {
  withClient: <T>(fn: (client: any) => Promise<T>) => Promise<T>;
  close: () => Promise<void>;
};

export function createHttpApp(env: Env) {
  return Fastify({
    logger: true,
    bodyLimit: 5 * 1024 * 1024,
    trustProxy: env.TRUST_PROXY,
    genReqId: (req) => {
      const hdr = (req.headers["x-request-id"] ?? req.headers["X-Request-Id"]) as any;
      if (typeof hdr === "string" && hdr.trim().length > 0) return hdr.trim();
      return randomUUID();
    },
  });
}

export function registerBootstrapLifecycle(args: {
  app: any;
  store: StoreLike;
  sandboxExecutor: { shutdown: () => void };
  liteRecallStore?: { close: () => Promise<void> } | null;
  liteReplayStore?: { close: () => Promise<void> } | null;
  liteWriteStore?: { close: () => Promise<void> } | null;
}) {
  const { app, store, sandboxExecutor, liteRecallStore, liteReplayStore, liteWriteStore } = args;
  app.addHook("onClose", async () => {
    sandboxExecutor.shutdown();
    if (liteRecallStore) await liteRecallStore.close();
    if (liteReplayStore) await liteReplayStore.close();
    if (liteWriteStore) await liteWriteStore.close();
    await store.close();
  });
}

export async function assertBootstrapStoreContracts(args: {
  store: StoreLike;
  recallAccessForClient: (client: any) => any;
  replayAccessForClient: (client: any) => any;
  writeAccessForClient: (client: any) => any;
  liteWriteStore?: any;
}) {
  const { store, recallAccessForClient, replayAccessForClient, writeAccessForClient, liteWriteStore } = args;
  await store.withClient(async (client) => {
    assertRecallStoreAccessContract(recallAccessForClient(client));
    assertReplayStoreAccessContract(replayAccessForClient(client));
    assertWriteStoreAccessContract(writeAccessForClient(client));
  });
  if (liteWriteStore) {
    assertWriteStoreAccessContract(liteWriteStore);
  }
}

export async function listenHttpApp(app: any, env: Env) {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
}
