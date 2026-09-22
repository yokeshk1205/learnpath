CREATE TABLE recommendation_feedback (
  id UUID PRIMARY KEY,
  path_id UUID NOT NULL REFERENCES personalized_paths(id) ON DELETE CASCADE,
  learner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  enrollment_id UUID NOT NULL REFERENCES course_enrollments(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE RESTRICT,
  resource_id UUID REFERENCES learning_resources(id) ON DELETE SET NULL,
  path_version INTEGER NOT NULL,
  decision TEXT NOT NULL,
  reason_code TEXT,
  comment TEXT,
  baseline_mastery NUMERIC(5, 4),
  baseline_confidence NUMERIC(5, 4),
  baseline_retention NUMERIC(5, 4),
  model_version TEXT NOT NULL,
  feature_version TEXT NOT NULL,
  inference_version TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  feedback_version INTEGER NOT NULL DEFAULT 1,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT recommendation_feedback_decision_allowed CHECK (
    decision IN ('ACCEPTED', 'REJECTED')
  ),
  CONSTRAINT recommendation_feedback_reason_allowed CHECK (
    reason_code IS NULL OR reason_code IN (
      'ALREADY_KNOW', 'NOT_RELEVANT', 'PREFER_DIFFERENT',
      'TOO_DIFFICULT', 'TOO_EASY', 'OTHER'
    )
  ),
  CONSTRAINT recommendation_feedback_rejection_reason_required CHECK (
    (decision = 'ACCEPTED' AND reason_code IS NULL)
    OR (decision = 'REJECTED' AND reason_code IS NOT NULL)
  ),
  CONSTRAINT recommendation_feedback_path_version_positive CHECK (path_version > 0),
  CONSTRAINT recommendation_feedback_version_positive CHECK (feedback_version > 0),
  CONSTRAINT recommendation_feedback_baseline_ranges CHECK (
    (baseline_mastery IS NULL OR baseline_mastery BETWEEN 0 AND 1)
    AND (baseline_confidence IS NULL OR baseline_confidence BETWEEN 0 AND 1)
    AND (baseline_retention IS NULL OR baseline_retention BETWEEN 0 AND 1)
  ),
  CONSTRAINT recommendation_feedback_comment_length CHECK (
    comment IS NULL OR char_length(comment) <= 500
  ),
  UNIQUE (path_id, learner_id)
);

CREATE INDEX recommendation_feedback_learner_time_idx
  ON recommendation_feedback(learner_id, decided_at DESC);
CREATE INDEX recommendation_feedback_path_idx
  ON recommendation_feedback(path_id);
CREATE INDEX recommendation_feedback_skill_time_idx
  ON recommendation_feedback(skill_id, decided_at DESC);
CREATE INDEX recommendation_feedback_model_idx
  ON recommendation_feedback(model_version, decided_at DESC);

UPDATE system_metadata
SET value = value || '{"phase":19,"status":"recommendation_feedback_evaluation"}'::jsonb,
    updated_at = NOW()
WHERE key = 'application';
