import { createRequire } from "node:module";

export type SqliteStatement = {
  run(...params: any[]): unknown;
  get<T = any>(...params: any[]): T;
  all<T = any>(...params: any[]): T[];
};

export type SqliteDatabase = {
  exec(sql: string): unknown;
  prepare(sql: string): SqliteStatement;
  close(): void;
};

type SqliteModule = {
  DatabaseSync: new (path: string) => SqliteDatabase;
};

const require = createRequire(import.meta.url);

let cachedSqliteModule: SqliteModule | null | undefined;

function loadSqliteModule(): SqliteModule | null {
  if (cachedSqliteModule !== undefined) return cachedSqliteModule;
  try {
    const mod = require("node:sqlite") as Partial<SqliteModule>;
    cachedSqliteModule = typeof mod.DatabaseSync === "function" ? mod as SqliteModule : null;
  } catch {
    cachedSqliteModule = null;
  }
  return cachedSqliteModule;
}

export function hasNodeSqliteSupport(): boolean {
  return loadSqliteModule() !== null;
}

export function nodeSqliteSupportError(): Error {
  return new Error("Lite SQLite requires Node.js with node:sqlite support (Node 22+).");
}

export function createSqliteDatabase(path: string): SqliteDatabase {
  const mod = loadSqliteModule();
  if (!mod) throw nodeSqliteSupportError();
  return new mod.DatabaseSync(path);
}
