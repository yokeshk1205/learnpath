ALTER TABLE learner_skill_mastery
  ADD COLUMN evidence_state TEXT NOT NULL DEFAULT 'UNKNOWN';

ALTER TABLE learner_skill_mastery
  ADD CONSTRAINT learner_skill_mastery_evidence_state_allowed CHECK (
    evidence_state IN ('UNKNOWN', 'ESTIMATED', 'ASSESSED', 'VERIFIED')
  );

UPDATE learner_skill_mastery
SET evidence_state = CASE WHEN mastery IS NULL THEN 'UNKNOWN' ELSE 'ESTIMATED' END;

CREATE INDEX learner_skill_mastery_evidence_state_idx
  ON learner_skill_mastery(learner_id, evidence_state, updated_at DESC);

ALTER TABLE assessment_skill_results
  ADD COLUMN evidence_state_before TEXT NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN evidence_state_after TEXT NOT NULL DEFAULT 'ESTIMATED';

UPDATE assessment_skill_results
SET evidence_state_before = CASE WHEN mastery_before IS NULL THEN 'UNKNOWN' ELSE 'ESTIMATED' END,
    evidence_state_after = 'ESTIMATED';

ALTER TABLE assessment_skill_results
  ADD CONSTRAINT assessment_skill_results_evidence_states CHECK (
    evidence_state_before IN ('UNKNOWN', 'ESTIMATED', 'ASSESSED', 'VERIFIED')
    AND evidence_state_after IN ('UNKNOWN', 'ESTIMATED', 'ASSESSED', 'VERIFIED')
  );

-- Diagnostics can be owned by either an optional goal or a course.
ALTER TABLE assessments
  ALTER COLUMN goal_id DROP NOT NULL,
  ADD COLUMN course_id UUID REFERENCES courses(id) ON DELETE RESTRICT;

ALTER TABLE assessments
  DROP CONSTRAINT assessments_goal_id_assessment_type_key;

ALTER TABLE assessments
  ADD CONSTRAINT assessments_one_context CHECK (num_nonnulls(goal_id, course_id) = 1);

CREATE UNIQUE INDEX assessments_goal_type_unique_idx
  ON assessments(goal_id, assessment_type) WHERE goal_id IS NOT NULL;
CREATE UNIQUE INDEX assessments_course_type_unique_idx
  ON assessments(course_id, assessment_type) WHERE course_id IS NOT NULL;
CREATE INDEX assessments_course_id_idx ON assessments(course_id) WHERE course_id IS NOT NULL;

ALTER TABLE assessment_attempts
  ALTER COLUMN learner_goal_id DROP NOT NULL,
  ADD COLUMN enrollment_id UUID REFERENCES course_enrollments(id) ON DELETE RESTRICT;

ALTER TABLE assessment_attempts
  ADD CONSTRAINT assessment_attempts_one_context CHECK (
    num_nonnulls(learner_goal_id, enrollment_id) = 1
  );

CREATE INDEX assessment_attempts_enrollment_idx
  ON assessment_attempts(enrollment_id, started_at DESC) WHERE enrollment_id IS NOT NULL;

-- Each active course gets a real diagnostic assembled only from existing questions
-- that assess skills in that course. No goal is required to use it.
INSERT INTO assessments (
  id, course_id, title, description, assessment_type, estimated_minutes
)
SELECT
  gen_random_uuid(), c.id, c.name || ' Course Diagnostic',
  'Establish an initial global-skill evidence baseline for ' || c.name || '.',
  'DIAGNOSTIC',
  GREATEST(5, LEAST(20, CEIL(COUNT(DISTINCT q.id) * 0.9)))::smallint
FROM courses c
JOIN course_skills cs ON cs.course_id = c.id
JOIN questions q ON q.skill_id = cs.skill_id AND q.status = 'ACTIVE'
WHERE c.is_active
GROUP BY c.id, c.name;

INSERT INTO assessment_questions (assessment_id, question_id, sequence)
SELECT assessment_id, question_id,
       ROW_NUMBER() OVER (PARTITION BY assessment_id ORDER BY difficulty, slug)::smallint
FROM (
  SELECT DISTINCT a.id AS assessment_id, q.id AS question_id, q.difficulty, q.slug
  FROM assessments a
  JOIN course_skills cs ON cs.course_id = a.course_id
  JOIN questions q ON q.skill_id = cs.skill_id AND q.status = 'ACTIVE'
  WHERE a.course_id IS NOT NULL AND a.assessment_type = 'DIAGNOSTIC'
) course_questions;

ALTER TABLE questions
  ADD CONSTRAINT questions_id_skill_unique UNIQUE (id, skill_id);

CREATE TABLE practice_attempts (
  id UUID PRIMARY KEY,
  learner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE RESTRICT,
  enrollment_id UUID REFERENCES course_enrollments(id) ON DELETE RESTRICT,
  question_id UUID NOT NULL,
  selected_option_id UUID,
  status TEXT NOT NULL DEFAULT 'IN_PROGRESS',
  attempt_number INTEGER NOT NULL,
  hints_used SMALLINT NOT NULL DEFAULT 0,
  duration_seconds INTEGER,
  is_correct BOOLEAN,
  score NUMERIC(5, 4),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (question_id, skill_id)
    REFERENCES questions(id, skill_id) ON DELETE RESTRICT,
  FOREIGN KEY (selected_option_id, question_id)
    REFERENCES question_options(id, question_id) ON DELETE RESTRICT,
  CONSTRAINT practice_attempts_status_allowed CHECK (status IN ('IN_PROGRESS', 'SUBMITTED')),
  CONSTRAINT practice_attempts_attempt_positive CHECK (attempt_number > 0),
  CONSTRAINT practice_attempts_hints_nonnegative CHECK (hints_used >= 0),
  CONSTRAINT practice_attempts_duration_nonnegative CHECK (
    duration_seconds IS NULL OR duration_seconds >= 0
  ),
  CONSTRAINT practice_attempts_result_consistent CHECK (
    (status = 'IN_PROGRESS' AND selected_option_id IS NULL AND is_correct IS NULL
      AND score IS NULL AND submitted_at IS NULL)
    OR
    (status = 'SUBMITTED' AND selected_option_id IS NOT NULL AND is_correct IS NOT NULL
      AND score BETWEEN 0 AND 1 AND submitted_at IS NOT NULL)
  ),
  UNIQUE (learner_id, skill_id, attempt_number)
);

CREATE UNIQUE INDEX practice_attempts_one_active_idx
  ON practice_attempts(learner_id, skill_id) WHERE status = 'IN_PROGRESS';
CREATE INDEX practice_attempts_learner_time_idx
  ON practice_attempts(learner_id, started_at DESC);
CREATE INDEX practice_attempts_enrollment_idx
  ON practice_attempts(enrollment_id, started_at DESC) WHERE enrollment_id IS NOT NULL;

CREATE TABLE skill_evidence (
  id UUID PRIMARY KEY,
  learner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE RESTRICT,
  source_type TEXT NOT NULL,
  source_id UUID,
  score NUMERIC(5, 4),
  correct BOOLEAN,
  difficulty SMALLINT,
  attempt_number INTEGER,
  hints_used SMALLINT,
  time_taken_seconds INTEGER,
  mastery_before NUMERIC(5, 4),
  mastery_after NUMERIC(5, 4) NOT NULL,
  confidence_before NUMERIC(5, 4),
  confidence_after NUMERIC(5, 4) NOT NULL,
  evidence_state_before TEXT NOT NULL,
  evidence_state_after TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT skill_evidence_source_allowed CHECK (
    source_type IN (
      'DIAGNOSTIC', 'PRACTICE', 'QUIZ', 'ASSESSMENT',
      'MODULE_ASSESSMENT', 'RETENTION_CHECK'
    )
  ),
  CONSTRAINT skill_evidence_score_range CHECK (score IS NULL OR score BETWEEN 0 AND 1),
  CONSTRAINT skill_evidence_difficulty_range CHECK (
    difficulty IS NULL OR difficulty BETWEEN 1 AND 5
  ),
  CONSTRAINT skill_evidence_attempt_positive CHECK (
    attempt_number IS NULL OR attempt_number > 0
  ),
  CONSTRAINT skill_evidence_hints_nonnegative CHECK (hints_used IS NULL OR hints_used >= 0),
  CONSTRAINT skill_evidence_time_nonnegative CHECK (
    time_taken_seconds IS NULL OR time_taken_seconds >= 0
  ),
  CONSTRAINT skill_evidence_state_ranges CHECK (
    (mastery_before IS NULL OR mastery_before BETWEEN 0 AND 1)
    AND mastery_after BETWEEN 0 AND 1
    AND (confidence_before IS NULL OR confidence_before BETWEEN 0 AND 1)
    AND confidence_after BETWEEN 0 AND 1
  ),
  CONSTRAINT skill_evidence_state_names CHECK (
    evidence_state_before IN ('UNKNOWN', 'ESTIMATED', 'ASSESSED', 'VERIFIED')
    AND evidence_state_after IN ('UNKNOWN', 'ESTIMATED', 'ASSESSED', 'VERIFIED')
  ),
  CONSTRAINT skill_evidence_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX skill_evidence_learner_skill_time_idx
  ON skill_evidence(learner_id, skill_id, created_at DESC);
CREATE INDEX skill_evidence_source_idx
  ON skill_evidence(source_type, source_id) WHERE source_id IS NOT NULL;

-- Preserve existing diagnostic observations in the unified ledger.
INSERT INTO skill_evidence (
  id, learner_id, skill_id, source_type, source_id, score, correct, difficulty,
  attempt_number, time_taken_seconds, mastery_before, mastery_after,
  confidence_before, confidence_after, evidence_state_before, evidence_state_after,
  metadata, created_at
)
SELECT
  gen_random_uuid(), aa.learner_id, q.skill_id, 'DIAGNOSTIC', aa.id,
  CASE WHEN answer.is_correct THEN 1 ELSE 0 END,
  answer.is_correct, q.difficulty,
  ROW_NUMBER() OVER (
    PARTITION BY aa.learner_id, q.skill_id ORDER BY answer.answered_at, answer.id
  )::int,
  NULL,
  result.mastery_before, result.mastery_after,
  result.confidence_before, result.confidence_after,
  CASE WHEN result.mastery_before IS NULL THEN 'UNKNOWN' ELSE 'ESTIMATED' END,
  'ESTIMATED',
  jsonb_build_object('questionId', q.id, 'backfilled', TRUE),
  answer.answered_at
FROM assessment_answers answer
JOIN assessment_attempts aa ON aa.id = answer.attempt_id
JOIN questions q ON q.id = answer.question_id
JOIN assessment_skill_results result
  ON result.attempt_id = answer.attempt_id AND result.skill_id = q.skill_id;

CREATE OR REPLACE FUNCTION prevent_skill_evidence_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Skill evidence is immutable'
    USING ERRCODE = '55000',
          DETAIL = 'Insert a new evidence observation instead of changing history.';
END;
$$;

CREATE TRIGGER skill_evidence_immutable_update
BEFORE UPDATE ON skill_evidence
FOR EACH ROW EXECUTE FUNCTION prevent_skill_evidence_mutation();

CREATE TRIGGER skill_evidence_immutable_delete
BEFORE DELETE ON skill_evidence
FOR EACH ROW EXECUTE FUNCTION prevent_skill_evidence_mutation();

UPDATE system_metadata
SET value = value || '{"phase":9,"status":"evidence_driven_learner_model"}'::jsonb,
    updated_at = NOW()
WHERE key = 'application';
