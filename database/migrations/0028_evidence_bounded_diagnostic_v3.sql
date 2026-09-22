-- Diagnostic v3 turns each course diagnostic into a bounded, server-driven
-- adaptive sequence. Historical attempts retain their original policy and
-- immutable question snapshots.
ALTER TABLE questions
  ADD COLUMN discrimination NUMERIC(4, 3) NOT NULL DEFAULT 1.000,
  ADD COLUMN guess_probability NUMERIC(4, 3) NOT NULL DEFAULT 0.250,
  ADD COLUMN cognitive_level TEXT NOT NULL DEFAULT 'UNDERSTAND',
  ADD COLUMN calibration_state TEXT NOT NULL DEFAULT 'EXPERT_PRIOR',
  ADD CONSTRAINT questions_discrimination_range CHECK (
    discrimination BETWEEN 0.250 AND 2.500
  ),
  ADD CONSTRAINT questions_guess_probability_range CHECK (
    guess_probability BETWEEN 0 AND 0.500
  ),
  ADD CONSTRAINT questions_cognitive_level_allowed CHECK (
    cognitive_level IN ('REMEMBER', 'UNDERSTAND', 'APPLY', 'ANALYZE')
  ),
  ADD CONSTRAINT questions_calibration_state_allowed CHECK (
    calibration_state IN ('EXPERT_PRIOR', 'FIELD_TEST', 'CALIBRATED')
  );

UPDATE questions
SET cognitive_level = CASE
      WHEN slug LIKE 'adaptive-%-application-v2' THEN 'APPLY'
      WHEN difficulty >= 4 THEN 'ANALYZE'
      WHEN difficulty = 1 THEN 'REMEMBER'
      ELSE 'UNDERSTAND'
    END,
    discrimination = CASE
      WHEN slug LIKE 'adaptive-%-application-v2' THEN 1.150
      WHEN difficulty >= 4 THEN 1.100
      ELSE 1.000
    END;

ALTER TABLE question_options
  ADD COLUMN misconception_code TEXT;

UPDATE question_options
SET misconception_code = 'UNCLASSIFIED_DISTRACTOR'
WHERE NOT is_correct AND misconception_code IS NULL;

ALTER TABLE assessment_attempts
  ADD COLUMN diagnostic_question_budget SMALLINT,
  ADD CONSTRAINT assessment_attempts_diagnostic_budget_positive CHECK (
    diagnostic_question_budget IS NULL OR diagnostic_question_budget > 0
  );

UPDATE assessment_attempts
SET diagnostic_question_budget = question_count
WHERE diagnostic_question_budget IS NULL;

ALTER TABLE diagnostic_attempt_questions
  ADD COLUMN selection_stage TEXT NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN selection_score NUMERIC(10, 4),
  ADD CONSTRAINT diagnostic_attempt_questions_stage_allowed CHECK (
    selection_stage IN ('LEGACY', 'COVERAGE', 'CONFIRMATION', 'VERIFICATION')
  );

ALTER TABLE assessment_skill_results
  ADD COLUMN diagnostic_classification TEXT NOT NULL DEFAULT 'NEEDS_CONFIRMATION',
  ADD COLUMN mastery_lower_bound NUMERIC(5, 4),
  ADD COLUMN mastery_upper_bound NUMERIC(5, 4),
  ADD COLUMN direct_observation_count SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN application_observation_count SMALLINT NOT NULL DEFAULT 0,
  ADD CONSTRAINT assessment_skill_results_diagnostic_classification_allowed CHECK (
    diagnostic_classification IN (
      'MASTERED', 'READY', 'GAP', 'FORGOTTEN', 'FRAGILE_FOUNDATION',
      'NEEDS_CONFIRMATION', 'PROBED', 'NOT_TESTED'
    )
  ),
  ADD CONSTRAINT assessment_skill_results_mastery_interval_valid CHECK (
    (mastery_lower_bound IS NULL AND mastery_upper_bound IS NULL)
    OR (
      mastery_lower_bound BETWEEN 0 AND 1
      AND mastery_upper_bound BETWEEN 0 AND 1
      AND mastery_lower_bound <= mastery_upper_bound
    )
  ),
  ADD CONSTRAINT assessment_skill_results_observation_counts_valid CHECK (
    direct_observation_count >= 0
    AND application_observation_count >= 0
    AND application_observation_count <= direct_observation_count
  );

UPDATE system_metadata
SET value = value || '{"phase":22,"status":"evidence_bounded_diagnostic_v3","diagnosticPolicy":"evidence-bounded-adaptive-v3"}'::jsonb,
    updated_at = NOW()
WHERE key = 'application';
