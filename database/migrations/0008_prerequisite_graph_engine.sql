CREATE OR REPLACE FUNCTION prevent_skill_prerequisite_cycle()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  cycle_found BOOLEAN;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.skill_id = OLD.skill_id
     AND NEW.prerequisite_skill_id = OLD.prerequisite_skill_id THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    WITH RECURSIVE prerequisite_chain(skill_id) AS (
      SELECT NEW.prerequisite_skill_id
      UNION
      SELECT sp.prerequisite_skill_id
      FROM skill_prerequisites sp
      JOIN prerequisite_chain chain ON chain.skill_id = sp.skill_id
      WHERE NOT (
        sp.skill_id = OLD.skill_id
        AND sp.prerequisite_skill_id = OLD.prerequisite_skill_id
      )
    )
    SELECT EXISTS (
      SELECT 1 FROM prerequisite_chain WHERE skill_id = NEW.skill_id
    ) INTO cycle_found;
  ELSE
    WITH RECURSIVE prerequisite_chain(skill_id) AS (
      SELECT NEW.prerequisite_skill_id
      UNION
      SELECT sp.prerequisite_skill_id
      FROM skill_prerequisites sp
      JOIN prerequisite_chain chain ON chain.skill_id = sp.skill_id
    )
    SELECT EXISTS (
      SELECT 1 FROM prerequisite_chain WHERE skill_id = NEW.skill_id
    ) INTO cycle_found;
  END IF;

  IF cycle_found THEN
    RAISE EXCEPTION 'Prerequisite relationship would create a cycle'
      USING ERRCODE = '23514',
            DETAIL = 'The global skill prerequisite graph must remain acyclic.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER skill_prerequisites_prevent_cycle
BEFORE INSERT OR UPDATE OF skill_id, prerequisite_skill_id
ON skill_prerequisites
FOR EACH ROW
EXECUTE FUNCTION prevent_skill_prerequisite_cycle();

UPDATE system_metadata
SET value = value || '{"phase":7}'::jsonb,
    updated_at = NOW()
WHERE key = 'application';
