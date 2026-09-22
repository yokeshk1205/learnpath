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
      'RECOMMENDATION_COORDINATED'
    )
  );

UPDATE system_metadata
SET value = value || '{"phase":17,"status":"cross_course_goal_coordination"}'::jsonb,
    updated_at = NOW()
WHERE key = 'application';
