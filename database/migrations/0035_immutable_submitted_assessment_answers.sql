-- Draft answers remain editable while an attempt is in progress. Once the
-- parent attempt is submitted, its scored answers become immutable history.
CREATE OR REPLACE FUNCTION prevent_submitted_assessment_answer_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  parent_status TEXT;
BEGIN
  SELECT status INTO parent_status
  FROM assessment_attempts
  WHERE id = COALESCE(OLD.attempt_id, NEW.attempt_id);

  IF parent_status = 'SUBMITTED' THEN
    RAISE EXCEPTION 'Submitted assessment answers are immutable'
      USING ERRCODE = '55000',
            DETAIL = 'Create a new assessment attempt instead of changing scored history.';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER assessment_answers_immutable_after_submit_update
BEFORE UPDATE ON assessment_answers
FOR EACH ROW EXECUTE FUNCTION prevent_submitted_assessment_answer_mutation();

CREATE TRIGGER assessment_answers_immutable_after_submit_delete
BEFORE DELETE ON assessment_answers
FOR EACH ROW EXECUTE FUNCTION prevent_submitted_assessment_answer_mutation();

UPDATE system_metadata
SET value = value || '{"assessmentAnswerHistory":"immutable-after-submit-v1"}'::jsonb,
    updated_at = NOW()
WHERE key = 'application';
