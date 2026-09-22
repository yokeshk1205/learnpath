-- Programs coordinate bounded diagnostics across arbitrarily large curricula.
-- They do not replace assessment evidence or alter learning prerequisite gates.
CREATE TABLE assessment_programs (
  id UUID PRIMARY KEY,
  learner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  enrollment_id UUID NOT NULL REFERENCES course_enrollments(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('QUICK_PLACEMENT', 'COMPREHENSIVE')),
  status TEXT NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'BLOCKED')),
  policy_version TEXT NOT NULL DEFAULT 'course-coverage-v1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CHECK ((status = 'COMPLETED') = (completed_at IS NOT NULL))
);

CREATE UNIQUE INDEX assessment_programs_one_open_mode_idx
  ON assessment_programs(learner_id, enrollment_id, mode) WHERE status <> 'COMPLETED';
CREATE INDEX assessment_programs_enrollment_idx
  ON assessment_programs(learner_id, enrollment_id, created_at DESC);

CREATE TABLE assessment_program_sessions (
  id UUID PRIMARY KEY,
  program_id UUID NOT NULL REFERENCES assessment_programs(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  focus_skill_ids UUID[] NOT NULL CHECK (cardinality(focus_skill_ids) BETWEEN 1 AND 4),
  module_id UUID REFERENCES modules(id) ON DELETE RESTRICT,
  attempt_id UUID UNIQUE REFERENCES assessment_attempts(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (program_id, sequence)
);

ALTER TABLE assessment_attempts
  ADD COLUMN diagnostic_focus_skill_ids UUID[],
  ADD COLUMN assessment_program_id UUID REFERENCES assessment_programs(id) ON DELETE RESTRICT,
  ADD COLUMN assessment_program_session_id UUID,
  ADD COLUMN diagnostic_force_probe BOOLEAN NOT NULL DEFAULT FALSE,
  ADD CONSTRAINT assessment_attempts_focus_not_empty CHECK (
    diagnostic_focus_skill_ids IS NULL OR cardinality(diagnostic_focus_skill_ids) BETWEEN 1 AND 4
  ),
  ADD CONSTRAINT assessment_attempts_program_pair CHECK (
    (assessment_program_id IS NULL) = (assessment_program_session_id IS NULL)
  );

CREATE UNIQUE INDEX assessment_attempts_program_session_idx
  ON assessment_attempts(assessment_program_session_id) WHERE assessment_program_session_id IS NOT NULL;
CREATE INDEX assessment_attempts_program_idx
  ON assessment_attempts(assessment_program_id) WHERE assessment_program_id IS NOT NULL;

-- Keep independent-question coverage queries bounded to a learner's history.
CREATE INDEX assessment_answers_question_attempt_idx ON assessment_answers(question_id, attempt_id);
