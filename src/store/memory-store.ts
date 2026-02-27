import pg from "pg";
import { closeDb, createDb, type Db, type DbPoolOptions, withClient as withPgClient, withTx as withPgTx } from "../db.js";

export type MemoryStoreBackend = "postgres" | "embedded";

export interface MemoryStore {
  readonly backend: MemoryStoreBackend;
  withClient<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T>;
  withTx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export type PostgresMemoryStore = MemoryStore & {
  readonly backend: "postgres";
  readonly db: Db;
};

export type EmbeddedExperimentalMemoryStore = MemoryStore & {
  readonly backend: "embedded";
  readonly db: Db;
  readonly mode: "postgres_delegated";
};

export type CreateMemoryStoreArgs = {
  backend: MemoryStoreBackend;
  databaseUrl: string;
  poolOptions?: DbPoolOptions;
  embeddedExperimentalEnabled?: boolean;
};

export function createPostgresMemoryStore(databaseUrl: string, poolOptions: DbPoolOptions = {}): PostgresMemoryStore {
  const db = createDb(databaseUrl, poolOptions);
  return {
    backend: "postgres",
    db,
    withClient: async <T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> => {
      return withPgClient(db, fn);
    },
    withTx: async <T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> => {
      return withPgTx(db, fn);
    },
    close: async (): Promise<void> => {
      await closeDb(db);
    },
  };
}

export function createEmbeddedExperimentalMemoryStore(
  databaseUrl: string,
  poolOptions: DbPoolOptions = {},
): EmbeddedExperimentalMemoryStore {
  const db = createDb(databaseUrl, poolOptions);
  return {
    backend: "embedded",
    mode: "postgres_delegated",
    db,
    withClient: async <T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> => {
      return withPgClient(db, fn);
    },
    withTx: async <T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> => {
      return withPgTx(db, fn);
    },
    close: async (): Promise<void> => {
      await closeDb(db);
    },
  };
}

export function createMemoryStore(args: CreateMemoryStoreArgs): MemoryStore {
  switch (args.backend) {
    case "postgres":
      return createPostgresMemoryStore(args.databaseUrl, args.poolOptions);
    case "embedded":
      if (!args.embeddedExperimentalEnabled) {
        throw new Error("MEMORY_STORE_BACKEND=embedded requires MEMORY_STORE_EMBEDDED_EXPERIMENTAL_ENABLED=true");
      }
      return createEmbeddedExperimentalMemoryStore(args.databaseUrl, args.poolOptions);
  }
}

export function asPostgresMemoryStore(store: MemoryStore): PostgresMemoryStore | EmbeddedExperimentalMemoryStore {
  if (!(store as any).db?.pool) {
    throw new Error(`memory store backend ${String((store as any).backend)} is not db-backed`);
  }
  return store as PostgresMemoryStore | EmbeddedExperimentalMemoryStore;
}
