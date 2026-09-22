-- Diagnostic v5 adds the audit fields required for evidence-sufficiency
-- stopping, per-answer evidence strength, explainable decision logs, and
-- persistent misconception signals. Existing attempts remain unchanged.

ALTER TABLE assessment_attempts
  ADD COLUMN diagnostic_min_question_count SMALLINT,
  ADD COLUMN diagnostic_max_question_count SMALLINT,
  ADD COLUMN diagnostic_stopping_reason TEXT,
  ADD COLUMN diagnostic_stopped_at TIMESTAMPTZ,
  ADD CONSTRAINT assessment_attempts_diagnostic_bounds_valid CHECK (
    (diagnostic_min_question_count IS NULL OR diagnostic_min_question_count > 0)
    AND (diagnostic_max_question_count IS NULL OR diagnostic_max_question_count > 0)
    AND (
      diagnostic_min_question_count IS NULL
      OR diagnostic_max_question_count IS NULL
      OR diagnostic_min_question_count <= diagnostic_max_question_count
    )
  );

ALTER TABLE diagnostic_attempt_questions
  ADD COLUMN selection_components JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD CONSTRAINT diagnostic_attempt_questions_components_object CHECK (
    jsonb_typeof(selection_components) = 'object'
  );

ALTER TABLE questions
  ADD COLUMN expected_response_seconds SMALLINT,
  ADD CONSTRAINT questions_expected_response_seconds_valid CHECK (
    expected_response_seconds IS NULL OR expected_response_seconds BETWEEN 5 AND 3600
  );

UPDATE questions
SET expected_response_seconds = CASE cognitive_level
  WHEN 'REMEMBER' THEN 35
  WHEN 'UNDERSTAND' THEN 55
  WHEN 'APPLY' THEN 90
  WHEN 'ANALYZE' THEN 120
  ELSE 60
END
WHERE expected_response_seconds IS NULL;

UPDATE question_options option
SET misconception_code = CASE
  WHEN skill.slug LIKE '%array%' THEN 'ARRAY_BOUNDARY_OR_STORAGE_CONFUSION'
  WHEN skill.slug LIKE '%recurs%' THEN 'RECURSIVE_BASE_CASE_OR_TRACE_CONFUSION'
  WHEN skill.slug LIKE '%complex%' THEN 'COMPLEXITY_GROWTH_CONFUSION'
  WHEN skill.slug LIKE '%hash%' THEN 'HASH_COLLISION_OR_LOOKUP_CONFUSION'
  WHEN skill.slug LIKE '%tree%' THEN 'TREE_TRAVERSAL_OR_STRUCTURE_CONFUSION'
  WHEN skill.slug LIKE '%graph%' THEN 'GRAPH_TRAVERSAL_OR_CONNECTIVITY_CONFUSION'
  WHEN skill.slug LIKE '%queue%' OR skill.slug LIKE '%stack%' THEN 'DATA_STRUCTURE_ORDERING_CONFUSION'
  WHEN skill.slug LIKE '%loop%' THEN 'LOOP_BOUNDARY_OR_CONTROL_FLOW_CONFUSION'
  WHEN skill.slug LIKE '%function%' THEN 'FUNCTION_SCOPE_OR_RETURN_CONFUSION'
  WHEN skill.slug LIKE '%python%' THEN 'PYTHON_SEMANTICS_CONFUSION'
  ELSE UPPER(REPLACE(skill.slug, '-', '_')) || '_CONCEPT_CONFUSION'
END
FROM questions question
JOIN skills skill ON skill.id = question.skill_id
WHERE option.question_id = question.id
  AND NOT option.is_correct
  AND (option.misconception_code IS NULL OR option.misconception_code = 'UNCLASSIFIED_DISTRACTOR');

CREATE TABLE question_skill_mappings (
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE RESTRICT,
  mapping_type TEXT NOT NULL,
  evidence_weight NUMERIC(5, 4) NOT NULL DEFAULT 1.0000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (question_id, skill_id),
  CONSTRAINT question_skill_mappings_type_allowed CHECK (
    mapping_type IN ('PRIMARY', 'SECONDARY')
  ),
  CONSTRAINT question_skill_mappings_weight_valid CHECK (
    evidence_weight > 0 AND evidence_weight <= 1
  )
);

CREATE UNIQUE INDEX question_skill_mappings_one_primary_idx
  ON question_skill_mappings(question_id) WHERE mapping_type = 'PRIMARY';

INSERT INTO question_skill_mappings (question_id, skill_id, mapping_type, evidence_weight)
SELECT id, skill_id, 'PRIMARY', 1.0000
FROM questions
ON CONFLICT (question_id, skill_id) DO NOTHING;

ALTER TABLE assessment_answers
  ADD COLUMN response_seconds INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN evidence_strength NUMERIC(5, 4),
  ADD COLUMN misconception_code TEXT,
  ADD COLUMN mastery_before NUMERIC(5, 4),
  ADD COLUMN mastery_after NUMERIC(5, 4),
  ADD COLUMN confidence_before NUMERIC(5, 4),
  ADD COLUMN confidence_after NUMERIC(5, 4),
  ADD CONSTRAINT assessment_answers_response_seconds_valid CHECK (
    response_seconds BETWEEN 0 AND 3600
  ),
  ADD CONSTRAINT assessment_answers_evidence_strength_valid CHECK (
    evidence_strength IS NULL OR evidence_strength BETWEEN 0 AND 1
  ),
  ADD CONSTRAINT assessment_answers_state_ranges_valid CHECK (
    (mastery_before IS NULL OR mastery_before BETWEEN 0 AND 1)
    AND (mastery_after IS NULL OR mastery_after BETWEEN 0 AND 1)
    AND (confidence_before IS NULL OR confidence_before BETWEEN 0 AND 1)
    AND (confidence_after IS NULL OR confidence_after BETWEEN 0 AND 1)
  );

ALTER TABLE assessment_skill_results
  ADD COLUMN difficulty_coverage JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN cognitive_coverage JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN misconception_codes TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN decision_reason TEXT,
  ADD CONSTRAINT assessment_skill_results_difficulty_coverage_object CHECK (
    jsonb_typeof(difficulty_coverage) = 'object'
  ),
  ADD CONSTRAINT assessment_skill_results_cognitive_coverage_object CHECK (
    jsonb_typeof(cognitive_coverage) = 'object'
  );

CREATE TABLE misconception_evidence (
  id UUID PRIMARY KEY,
  learner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE RESTRICT,
  attempt_id UUID NOT NULL REFERENCES assessment_attempts(id) ON DELETE CASCADE,
  answer_id UUID NOT NULL REFERENCES assessment_answers(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
  misconception_code TEXT NOT NULL,
  evidence_strength NUMERIC(5, 4) NOT NULL,
  confidence NUMERIC(5, 4) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (answer_id, misconception_code),
  CONSTRAINT misconception_evidence_strength_valid CHECK (
    evidence_strength BETWEEN 0 AND 1 AND confidence BETWEEN 0 AND 1
  )
);

CREATE INDEX misconception_evidence_learner_skill_idx
  ON misconception_evidence(learner_id, skill_id, created_at DESC);

CREATE TABLE learner_skill_misconceptions (
  learner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE RESTRICT,
  misconception_code TEXT NOT NULL,
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  confidence NUMERIC(5, 4) NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (learner_id, skill_id, misconception_code),
  CONSTRAINT learner_skill_misconceptions_occurrences_positive CHECK (
    occurrence_count > 0
  ),
  CONSTRAINT learner_skill_misconceptions_confidence_valid CHECK (
    confidence BETWEEN 0 AND 1
  )
);

ALTER TABLE skill_evidence
  ADD COLUMN evidence_strength NUMERIC(5, 4),
  ADD CONSTRAINT skill_evidence_strength_valid CHECK (
    evidence_strength IS NULL OR evidence_strength BETWEEN 0 AND 1
  );

UPDATE system_metadata
SET value = value || '{"phase":23,"status":"evidence_driven_diagnostic_v5","diagnosticPolicy":"evidence-driven-adaptive-v5"}'::jsonb,
    updated_at = NOW()
WHERE key = 'application';
