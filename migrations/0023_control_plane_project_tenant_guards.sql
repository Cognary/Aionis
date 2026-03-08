BEGIN;

CREATE OR REPLACE FUNCTION control_projects_prevent_tenant_reassign()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.tenant_id IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'control project tenant reassignment is not allowed'
      USING ERRCODE = '23514',
            DETAIL = format(
              'project_id=%s old_tenant_id=%s new_tenant_id=%s',
              NEW.project_id,
              OLD.tenant_id,
              NEW.tenant_id
            );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS control_projects_prevent_tenant_reassign ON control_projects;

CREATE TRIGGER control_projects_prevent_tenant_reassign
BEFORE UPDATE OF tenant_id ON control_projects
FOR EACH ROW
EXECUTE FUNCTION control_projects_prevent_tenant_reassign();

CREATE OR REPLACE FUNCTION control_api_keys_enforce_project_tenant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.project_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM 1
  FROM control_projects p
  WHERE p.project_id = NEW.project_id
    AND p.tenant_id = NEW.tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'control api key project tenant mismatch'
      USING ERRCODE = '23514',
            DETAIL = format('tenant_id=%s project_id=%s', NEW.tenant_id, NEW.project_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS control_api_keys_enforce_project_tenant ON control_api_keys;

CREATE TRIGGER control_api_keys_enforce_project_tenant
BEFORE INSERT OR UPDATE OF tenant_id, project_id ON control_api_keys
FOR EACH ROW
EXECUTE FUNCTION control_api_keys_enforce_project_tenant();

COMMIT;
