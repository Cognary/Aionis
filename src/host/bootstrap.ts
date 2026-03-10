import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import type { Env } from "../config.js";
import { assertRecallStoreAccessContract } from "../store/recall-access.js";
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
}) {
  const { app, store, sandboxExecutor } = args;
  app.addHook("onClose", async () => {
    sandboxExecutor.shutdown();
    await store.close();
  });
}

export async function assertBootstrapStoreContracts(args: {
  store: StoreLike;
  recallAccessForClient: (client: any) => any;
  writeAccessForClient: (client: any) => any;
}) {
  const { store, recallAccessForClient, writeAccessForClient } = args;
  await store.withClient(async (client) => {
    assertRecallStoreAccessContract(recallAccessForClient(client));
    assertWriteStoreAccessContract(writeAccessForClient(client));
  });
}

export async function listenHttpApp(app: any, env: Env) {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
}
