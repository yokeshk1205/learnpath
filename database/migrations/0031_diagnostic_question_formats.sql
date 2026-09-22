-- Add deterministic authored formats while preserving existing single-choice
-- questions, saved drafts, and submitted responses.
ALTER TABLE questions DROP CONSTRAINT questions_type_allowed;
ALTER TABLE questions
  ADD COLUMN numeric_answer DOUBLE PRECISION,
  ADD COLUMN numeric_tolerance DOUBLE PRECISION,
  ADD COLUMN numeric_unit TEXT,
  ADD CONSTRAINT questions_type_allowed CHECK (question_type IN ('SINGLE_CHOICE', 'MULTI_SELECT', 'NUMERIC')),
  ADD CONSTRAINT questions_numeric_key CHECK (
    (question_type = 'NUMERIC'
      AND numeric_answer IS NOT NULL AND numeric_answer > '-Infinity'::double precision AND numeric_answer < 'Infinity'::double precision
      AND numeric_tolerance IS NOT NULL AND numeric_tolerance >= 0 AND numeric_tolerance < 'Infinity'::double precision)
    OR (question_type <> 'NUMERIC' AND numeric_answer IS NULL AND numeric_tolerance IS NULL AND numeric_unit IS NULL)
  ),
  ADD CONSTRAINT questions_rich_diagnostic_only CHECK (question_type = 'SINGLE_CHOICE' OR question_purpose = 'DIAGNOSTIC');

DROP INDEX question_options_one_correct_idx;

-- Deferred validation lets authors insert a question and all of its options
-- in one transaction; the final answer key must be valid when it commits.
CREATE FUNCTION validate_question_answer_key() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target_id UUID;
  target_ids UUID[];
  format TEXT;
  option_count INTEGER;
  correct_count INTEGER;
BEGIN
  IF TG_TABLE_NAME = 'questions' THEN
    target_ids := ARRAY[NEW.id];
  ELSIF TG_OP = 'UPDATE' THEN
    target_ids := ARRAY[NEW.question_id, OLD.question_id];
  ELSIF TG_OP = 'DELETE' THEN
    target_ids := ARRAY[OLD.question_id];
  ELSE
    target_ids := ARRAY[NEW.question_id];
  END IF;
  FOREACH target_id IN ARRAY target_ids LOOP
  SELECT question_type INTO format FROM questions WHERE id = target_id;
  IF NOT FOUND THEN CONTINUE; END IF;
  SELECT COUNT(*), COUNT(*) FILTER (WHERE is_correct) INTO option_count, correct_count
    FROM question_options WHERE question_id = target_id;
  IF (format = 'SINGLE_CHOICE' AND (option_count < 2 OR correct_count <> 1))
     OR (format = 'MULTI_SELECT' AND (option_count < 2 OR correct_count < 1 OR correct_count >= option_count))
     OR (format = 'NUMERIC' AND option_count <> 0) THEN
    RAISE EXCEPTION 'Question % has an invalid % answer key', target_id, format USING ERRCODE = '23514';
  END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER questions_answer_key_valid
  AFTER INSERT OR UPDATE ON questions DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION validate_question_answer_key();
CREATE CONSTRAINT TRIGGER question_options_answer_key_valid
  AFTER INSERT OR UPDATE OR DELETE ON question_options DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION validate_question_answer_key();

ALTER TABLE diagnostic_answer_drafts
  DROP CONSTRAINT diagnostic_answer_drafts_choice,
  ADD COLUMN selected_option_ids UUID[] NOT NULL DEFAULT ARRAY[]::uuid[],
  ADD COLUMN numeric_answer DOUBLE PRECISION,
  ADD CONSTRAINT diagnostic_answer_drafts_numeric_finite CHECK (
    numeric_answer IS NULL OR (numeric_answer > '-Infinity'::double precision AND numeric_answer < 'Infinity'::double precision)
  );
ALTER TABLE assessment_answers
  DROP CONSTRAINT assessment_answers_choice,
  ADD COLUMN selected_option_ids UUID[] NOT NULL DEFAULT ARRAY[]::uuid[],
  ADD COLUMN numeric_answer DOUBLE PRECISION,
  ADD CONSTRAINT assessment_answers_numeric_finite CHECK (
    numeric_answer IS NULL OR (numeric_answer > '-Infinity'::double precision AND numeric_answer < 'Infinity'::double precision)
  );

CREATE FUNCTION validate_diagnostic_response() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  format TEXT;
  selected_count INTEGER;
  owned_count INTEGER;
BEGIN
  SELECT question_type INTO format FROM questions WHERE id = NEW.question_id;
  selected_count := cardinality(NEW.selected_option_ids);
  IF NEW.is_unsure THEN
    IF NEW.selected_option_id IS NOT NULL OR selected_count <> 0 OR NEW.numeric_answer IS NOT NULL THEN
      RAISE EXCEPTION 'Unsure response cannot contain an answer' USING ERRCODE = '23514';
    END IF;
  ELSIF format = 'SINGLE_CHOICE' THEN
    IF NEW.selected_option_id IS NULL OR selected_count <> 0 OR NEW.numeric_answer IS NOT NULL THEN
      RAISE EXCEPTION 'Single-choice response requires exactly one option' USING ERRCODE = '23514';
    END IF;
  ELSIF format = 'MULTI_SELECT' THEN
    SELECT COUNT(DISTINCT id) INTO owned_count FROM question_options
      WHERE question_id = NEW.question_id AND id = ANY(NEW.selected_option_ids);
    IF NEW.selected_option_id IS NOT NULL OR NEW.numeric_answer IS NOT NULL
       OR selected_count < 1 OR selected_count <> owned_count THEN
      RAISE EXCEPTION 'Multi-select response requires unique options from this question' USING ERRCODE = '23514';
    END IF;
  ELSIF format = 'NUMERIC' THEN
    IF NEW.selected_option_id IS NOT NULL OR selected_count <> 0 OR NEW.numeric_answer IS NULL THEN
      RAISE EXCEPTION 'Numeric response requires one finite number' USING ERRCODE = '23514';
    END IF;
  ELSE
    RAISE EXCEPTION 'Response question does not exist' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER diagnostic_answer_drafts_format_valid
  BEFORE INSERT OR UPDATE ON diagnostic_answer_drafts
  FOR EACH ROW EXECUTE FUNCTION validate_diagnostic_response();
CREATE TRIGGER assessment_answers_format_valid
  BEFORE INSERT OR UPDATE ON assessment_answers
  FOR EACH ROW EXECUTE FUNCTION validate_diagnostic_response();
