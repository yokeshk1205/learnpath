-- Freeze authored question content and answer keys when a question enters an
-- attempt. Later authoring changes affect new attempts only; submitted result
-- displays and unfinished-attempt grading keep the version the learner saw.

ALTER TABLE diagnostic_attempt_questions
  ADD COLUMN question_snapshot JSONB;

CREATE FUNCTION diagnostic_question_snapshot(target_question_id UUID) RETURNS JSONB
LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'version', 1,
    'id', question.id,
    'prompt', question.prompt,
    'questionType', question.question_type,
    'difficulty', question.difficulty,
    'explanation', question.explanation,
    'cognitiveLevel', question.cognitive_level,
    'discrimination', question.discrimination,
    'guessProbability', question.guess_probability,
    'numericAnswer', question.numeric_answer,
    'numericTolerance', question.numeric_tolerance,
    'numericUnit', question.numeric_unit,
    'skill', jsonb_build_object(
      'id', skill.id,
      'name', skill.name,
      'category', skill.category
    ),
    'options', COALESCE(options.items, '[]'::jsonb)
  )
  FROM questions question
  JOIN skills skill ON skill.id = question.skill_id
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object(
      'id', option.id,
      'key', option.option_key,
      'content', option.content,
      'isCorrect', option.is_correct,
      'misconceptionCode', option.misconception_code
    ) ORDER BY option.option_key) AS items
    FROM question_options option
    WHERE option.question_id = question.id
  ) options ON TRUE
  WHERE question.id = target_question_id
$$;

UPDATE diagnostic_attempt_questions snapshot
SET question_snapshot = diagnostic_question_snapshot(snapshot.question_id);

ALTER TABLE diagnostic_attempt_questions
  ALTER COLUMN question_snapshot SET NOT NULL,
  ADD CONSTRAINT diagnostic_question_snapshot_object CHECK (
    jsonb_typeof(question_snapshot) = 'object'
    AND question_snapshot->>'version' = '1'
    AND question_snapshot->>'id' = question_id::text
    AND jsonb_typeof(question_snapshot->'skill') = 'object'
    AND jsonb_typeof(question_snapshot->'options') = 'array'
  );

CREATE FUNCTION capture_diagnostic_question_snapshot() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.question_snapshot IS NULL THEN
    NEW.question_snapshot := diagnostic_question_snapshot(NEW.question_id);
  END IF;
  IF NEW.question_snapshot IS NULL THEN
    RAISE EXCEPTION 'Question % cannot be snapshotted', NEW.question_id USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER diagnostic_question_snapshot_on_insert
  BEFORE INSERT ON diagnostic_attempt_questions
  FOR EACH ROW EXECUTE FUNCTION capture_diagnostic_question_snapshot();

CREATE FUNCTION prevent_diagnostic_question_snapshot_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.question_id IS DISTINCT FROM OLD.question_id
     OR NEW.question_snapshot IS DISTINCT FROM OLD.question_snapshot THEN
    RAISE EXCEPTION 'Diagnostic question snapshots are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER diagnostic_question_snapshot_immutable
  BEFORE UPDATE ON diagnostic_attempt_questions
  FOR EACH ROW EXECUTE FUNCTION prevent_diagnostic_question_snapshot_mutation();

-- Rich multi-select responses refer to an array of option IDs, so validate
-- those IDs against the attempt snapshot rather than mutable authoring rows.
CREATE OR REPLACE FUNCTION validate_diagnostic_response() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  format TEXT;
  selected_count INTEGER;
  owned_count INTEGER;
BEGIN
  SELECT COALESCE(snapshot.question_snapshot->>'questionType', question.question_type)
    INTO format
  FROM questions question
  LEFT JOIN diagnostic_attempt_questions snapshot
    ON snapshot.attempt_id = NEW.attempt_id AND snapshot.question_id = NEW.question_id
  WHERE question.id = NEW.question_id;
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
    SELECT COUNT(DISTINCT option->>'id') INTO owned_count
    FROM diagnostic_attempt_questions snapshot
    CROSS JOIN LATERAL jsonb_array_elements(snapshot.question_snapshot->'options') option
    WHERE snapshot.attempt_id = NEW.attempt_id AND snapshot.question_id = NEW.question_id
      AND (option->>'id')::uuid = ANY(NEW.selected_option_ids);
    IF NEW.selected_option_id IS NOT NULL OR NEW.numeric_answer IS NOT NULL
       OR selected_count < 1 OR selected_count <> owned_count THEN
      RAISE EXCEPTION 'Multi-select response requires unique options from this attempt question' USING ERRCODE = '23514';
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

INSERT INTO system_metadata (key, value) VALUES (
  'diagnostic_question_snapshot_contract',
  jsonb_build_object(
    'version', 1,
    'capturedAt', 'QUESTION_SELECTED',
    'purpose', 'Immutable grading and historical result rendering',
    'legacyBackfill', 'Current authored state at migration time'
  )
);
