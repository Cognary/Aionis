import pg from "pg";
import { closeDb, createDb, type Db, type DbPoolOptions, withClient as withPgClient, withTx as withPgTx } from "../db.js";

export type MemoryStoreBackend = "postgres";

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

export type CreateMemoryStoreArgs = {
  backend: MemoryStoreBackend;
  databaseUrl: string;
  poolOptions?: DbPoolOptions;
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

export function createMemoryStore(args: CreateMemoryStoreArgs): MemoryStore {
  switch (args.backend) {
    case "postgres":
      return createPostgresMemoryStore(args.databaseUrl, args.poolOptions);
  }
}

export function asPostgresMemoryStore(store: MemoryStore): PostgresMemoryStore {
  if (store.backend !== "postgres") {
    throw new Error(`memory store backend ${String((store as any).backend)} is not postgres`);
  }
  return store as PostgresMemoryStore;
}

