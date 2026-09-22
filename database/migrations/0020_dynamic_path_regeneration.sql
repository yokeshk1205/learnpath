ALTER TABLE personalized_paths
  DROP CONSTRAINT IF EXISTS personalized_paths_enrollment_id_key,
  DROP CONSTRAINT personalized_paths_status_allowed;

ALTER TABLE personalized_paths
  ADD COLUMN previous_path_id UUID REFERENCES personalized_paths(id) ON DELETE SET NULL,
  ADD COLUMN invalidated_at TIMESTAMPTZ,
  ADD COLUMN invalidation_reason TEXT,
  ADD COLUMN invalidated_by_skill_id UUID REFERENCES skills(id) ON DELETE SET NULL,
  ADD COLUMN superseded_at TIMESTAMPTZ,
  ADD COLUMN change_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD CONSTRAINT personalized_paths_status_allowed CHECK (
    status IN ('ACTIVE', 'STALE', 'SUPERSEDED', 'COMPLETED')
  ),
  ADD CONSTRAINT personalized_paths_change_summary_object CHECK (
    jsonb_typeof(change_summary) = 'object'
  ),
  ADD CONSTRAINT personalized_paths_enrollment_version_unique UNIQUE (enrollment_id, path_version);

CREATE UNIQUE INDEX personalized_paths_current_enrollment_idx
  ON personalized_paths(enrollment_id)
  WHERE status IN ('ACTIVE', 'STALE');

CREATE INDEX personalized_paths_enrollment_history_idx
  ON personalized_paths(enrollment_id, path_version DESC);

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
      'RECOMMENDATION_SHOWN', 'RECOMMENDATION_ACCEPTED', 'RECOMMENDATION_REJECTED',
      'RECOMMENDATION_COORDINATED', 'PATH_REGENERATED'
    )
  );

UPDATE system_metadata
SET value = value || '{"phase":18,"status":"dynamic_path_regeneration"}'::jsonb,
    updated_at = NOW()
WHERE key = 'application';
