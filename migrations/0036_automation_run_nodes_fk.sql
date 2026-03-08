BEGIN;

DO $$ BEGIN
  ALTER TABLE automation_run_nodes
    ADD CONSTRAINT automation_run_nodes_run_id_fkey
    FOREIGN KEY (run_id)
    REFERENCES automation_runs (run_id)
    ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMIT;
