import type pg from "pg";

export type WriteCommitInsertArgs = {
  scope: string;
  parentCommitId: string | null;
  inputSha256: string;
  diffJson: string;
  actor: string;
  modelVersion: string | null;
  promptVersion: string | null;
  commitHash: string;
};

export interface WriteStoreAccess {
  nodeScopesByIds(ids: string[]): Promise<Map<string, string>>;
  parentCommitHash(scope: string, parentCommitId: string): Promise<string | null>;
  insertCommit(args: WriteCommitInsertArgs): Promise<string>;
}

export function createPostgresWriteStoreAccess(client: pg.PoolClient): WriteStoreAccess {
  return {
    async nodeScopesByIds(ids: string[]): Promise<Map<string, string>> {
      if (ids.length === 0) return new Map();
      const out = await client.query<{ id: string; scope: string }>(
        "SELECT id, scope FROM memory_nodes WHERE id = ANY($1::uuid[])",
        [ids],
      );
      const scopes = new Map<string, string>();
      for (const row of out.rows) scopes.set(row.id, row.scope);
      return scopes;
    },

    async parentCommitHash(scope: string, parentCommitId: string): Promise<string | null> {
      const out = await client.query<{ commit_hash: string }>(
        "SELECT commit_hash FROM memory_commits WHERE id = $1 AND scope = $2",
        [parentCommitId, scope],
      );
      if (out.rowCount !== 1) return null;
      return out.rows[0].commit_hash;
    },

    async insertCommit(args: WriteCommitInsertArgs): Promise<string> {
      const out = await client.query<{ id: string }>(
        `INSERT INTO memory_commits
          (scope, parent_id, input_sha256, diff_json, actor, model_version, prompt_version, commit_hash)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8)
         ON CONFLICT (commit_hash) DO UPDATE SET diff_json = memory_commits.diff_json
         RETURNING id`,
        [
          args.scope,
          args.parentCommitId,
          args.inputSha256,
          args.diffJson,
          args.actor,
          args.modelVersion,
          args.promptVersion,
          args.commitHash,
        ],
      );
      return out.rows[0].id;
    },
  };
}
