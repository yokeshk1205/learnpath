ALTER TABLE learner_skill_mastery
  ADD COLUMN retention_state TEXT NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN retention_anchor_at TIMESTAMPTZ,
  ADD COLUMN retention_calculated_at TIMESTAMPTZ;

ALTER TABLE learner_skill_mastery
  ADD CONSTRAINT learner_skill_mastery_retention_state_allowed CHECK (
    retention_state IN ('UNKNOWN', 'STRONG', 'MODERATE', 'AT_RISK', 'CRITICAL')
  );

UPDATE learner_skill_mastery state
SET retention_anchor_at = evidence.latest_evidence_at,
    retention_calculated_at = NOW(),
    retention = state.mastery,
    retention_state = CASE
      WHEN state.mastery IS NULL THEN 'UNKNOWN'
      WHEN state.mastery >= 0.75 THEN 'STRONG'
      WHEN state.mastery >= 0.55 THEN 'MODERATE'
      WHEN state.mastery >= 0.30 THEN 'AT_RISK'
      ELSE 'CRITICAL'
    END
FROM (
  SELECT learner_id, skill_id, MAX(created_at) AS latest_evidence_at
  FROM skill_evidence
  GROUP BY learner_id, skill_id
) evidence
WHERE state.learner_id = evidence.learner_id
  AND state.skill_id = evidence.skill_id;

CREATE INDEX learner_skill_mastery_retention_state_idx
  ON learner_skill_mastery(learner_id, retention_state, retention)
  WHERE retention IS NOT NULL;

ALTER TABLE skill_evidence
  ADD COLUMN retention_before NUMERIC(5, 4),
  ADD COLUMN retention_after NUMERIC(5, 4),
  ADD COLUMN retention_state_before TEXT NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN retention_state_after TEXT NOT NULL DEFAULT 'UNKNOWN';

-- The Phase 9 ledger remains immutable at runtime. Migration-owned backfill is the
-- only controlled exception, and the trigger is restored before this transaction commits.
ALTER TABLE skill_evidence DISABLE TRIGGER skill_evidence_immutable_update;

UPDATE skill_evidence
SET retention_before = mastery_before,
    retention_after = mastery_after,
    retention_state_before = CASE
      WHEN mastery_before IS NULL THEN 'UNKNOWN'
      WHEN mastery_before >= 0.75 THEN 'STRONG'
      WHEN mastery_before >= 0.55 THEN 'MODERATE'
      WHEN mastery_before >= 0.30 THEN 'AT_RISK'
      ELSE 'CRITICAL'
    END,
    retention_state_after = CASE
      WHEN mastery_after >= 0.75 THEN 'STRONG'
      WHEN mastery_after >= 0.55 THEN 'MODERATE'
      WHEN mastery_after >= 0.30 THEN 'AT_RISK'
      ELSE 'CRITICAL'
    END;

ALTER TABLE skill_evidence ENABLE TRIGGER skill_evidence_immutable_update;

ALTER TABLE skill_evidence
  ALTER COLUMN retention_after SET NOT NULL,
  ADD CONSTRAINT skill_evidence_retention_ranges CHECK (
    (retention_before IS NULL OR retention_before BETWEEN 0 AND 1)
    AND retention_after BETWEEN 0 AND 1
  ),
  ADD CONSTRAINT skill_evidence_retention_states CHECK (
    retention_state_before IN ('UNKNOWN', 'STRONG', 'MODERATE', 'AT_RISK', 'CRITICAL')
    AND retention_state_after IN ('UNKNOWN', 'STRONG', 'MODERATE', 'AT_RISK', 'CRITICAL')
  );

ALTER TABLE practice_attempts
  ADD COLUMN attempt_kind TEXT NOT NULL DEFAULT 'PRACTICE';

ALTER TABLE practice_attempts
  ADD CONSTRAINT practice_attempts_kind_allowed CHECK (
    attempt_kind IN ('PRACTICE', 'RETENTION_CHECK')
  );

ALTER TABLE learner_activity_events
  DROP CONSTRAINT learner_activity_events_type_allowed;

ALTER TABLE learner_activity_events
  ADD CONSTRAINT learner_activity_events_type_allowed CHECK (
    event_type IN (
      'LESSON_STARTED', 'LESSON_COMPLETED',
      'RESOURCE_STARTED', 'RESOURCE_COMPLETED', 'RESOURCE_SKIPPED',
      'PRACTICE_STARTED', 'PRACTICE_COMPLETED',
      'RETENTION_CHECK_STARTED', 'RETENTION_CHECK_COMPLETED',
      'QUIZ_STARTED', 'QUIZ_COMPLETED',
      'ASSESSMENT_SUBMITTED',
      'RECOMMENDATION_SHOWN', 'RECOMMENDATION_ACCEPTED', 'RECOMMENDATION_REJECTED'
    )
  );

UPDATE system_metadata
SET value = value || '{"phase":10,"status":"retention_and_forgetting"}'::jsonb,
    updated_at = NOW()
WHERE key = 'application';
