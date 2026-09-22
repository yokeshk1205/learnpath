CREATE TABLE personalized_paths (
  id UUID PRIMARY KEY,
  enrollment_id UUID NOT NULL UNIQUE REFERENCES course_enrollments(id) ON DELETE CASCADE,
  learner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  path_version INTEGER NOT NULL DEFAULT 1,
  model_version TEXT NOT NULL,
  feature_version TEXT NOT NULL,
  inference_version TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  source_classification TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT personalized_paths_status_allowed CHECK (status IN ('ACTIVE', 'COMPLETED')),
  CONSTRAINT personalized_paths_version_positive CHECK (path_version > 0),
  UNIQUE (id, learner_id)
);

CREATE TABLE personalized_path_items (
  id UUID PRIMARY KEY,
  path_id UUID NOT NULL REFERENCES personalized_paths(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE RESTRICT,
  position INTEGER NOT NULL,
  lane TEXT NOT NULL,
  candidate_kind TEXT NOT NULL,
  benefit_probability NUMERIC(7, 6),
  priority_score NUMERIC(7, 6),
  mastery_snapshot NUMERIC(5, 4),
  confidence_snapshot NUMERIC(5, 4),
  retention_snapshot NUMERIC(5, 4),
  prerequisite_state TEXT NOT NULL,
  explanation TEXT NOT NULL,
  reason_codes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  prerequisite_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  context_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT personalized_path_items_position_positive CHECK (position > 0),
  CONSTRAINT personalized_path_items_lane_allowed CHECK (
    lane IN ('RECOGNIZED', 'CURRENT', 'RECOMMENDED_NEXT', 'UPCOMING', 'LOCKED')
  ),
  CONSTRAINT personalized_path_items_kind_allowed CHECK (
    candidate_kind IN ('LEARN', 'REVISION', 'SUPPORTING_PREREQUISITE')
  ),
  CONSTRAINT personalized_path_items_probability_range CHECK (
    benefit_probability IS NULL OR benefit_probability BETWEEN 0 AND 1
  ),
  CONSTRAINT personalized_path_items_priority_range CHECK (
    priority_score IS NULL OR priority_score BETWEEN 0 AND 1
  ),
  CONSTRAINT personalized_path_items_snapshot_ranges CHECK (
    (mastery_snapshot IS NULL OR mastery_snapshot BETWEEN 0 AND 1)
    AND (confidence_snapshot IS NULL OR confidence_snapshot BETWEEN 0 AND 1)
    AND (retention_snapshot IS NULL OR retention_snapshot BETWEEN 0 AND 1)
  ),
  CONSTRAINT personalized_path_items_prerequisite_state_allowed CHECK (
    prerequisite_state IN ('SATISFIED', 'MISSING', 'RECOGNIZED')
  ),
  CONSTRAINT personalized_path_items_prerequisites_array CHECK (
    jsonb_typeof(prerequisite_snapshot) = 'array'
  ),
  CONSTRAINT personalized_path_items_context_object CHECK (
    jsonb_typeof(context_snapshot) = 'object'
  ),
  UNIQUE (path_id, skill_id),
  UNIQUE (path_id, position)
);

CREATE INDEX personalized_paths_learner_course_idx
  ON personalized_paths(learner_id, course_id, generated_at DESC);
CREATE INDEX personalized_path_items_path_lane_idx
  ON personalized_path_items(path_id, lane, position);
CREATE INDEX personalized_path_items_skill_idx
  ON personalized_path_items(skill_id);

UPDATE system_metadata
SET value = value || '{"phase":16,"status":"course_personalized_paths"}'::jsonb,
    updated_at = NOW()
WHERE key = 'application';
