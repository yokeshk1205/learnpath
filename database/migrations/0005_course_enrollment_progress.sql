CREATE TABLE course_enrollments (
  id UUID PRIMARY KEY,
  learner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  learning_goal_id UUID REFERENCES learning_goals(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT course_enrollments_status_allowed CHECK (
    status IN ('ACTIVE', 'PAUSED', 'COMPLETED', 'DROPPED')
  ),
  CONSTRAINT course_enrollments_completion_consistent CHECK (
    (status = 'COMPLETED' AND completed_at IS NOT NULL)
    OR (status <> 'COMPLETED')
  ),
  UNIQUE (learner_id, course_id),
  UNIQUE (id, course_id)
);

CREATE TABLE learner_course_progress (
  id UUID PRIMARY KEY,
  enrollment_id UUID NOT NULL UNIQUE REFERENCES course_enrollments(id) ON DELETE CASCADE,
  completed_modules SMALLINT NOT NULL DEFAULT 0,
  total_modules SMALLINT NOT NULL,
  progress_percentage NUMERIC(5, 2) NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT learner_course_progress_module_counts CHECK (
    completed_modules >= 0 AND total_modules > 0 AND completed_modules <= total_modules
  ),
  CONSTRAINT learner_course_progress_percentage CHECK (
    progress_percentage BETWEEN 0 AND 100
  )
);

CREATE TABLE learner_module_progress (
  id UUID PRIMARY KEY,
  enrollment_id UUID NOT NULL,
  course_id UUID NOT NULL,
  module_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'NOT_STARTED',
  started_at TIMESTAMPTZ,
  last_accessed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  time_spent_seconds INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (enrollment_id, course_id)
    REFERENCES course_enrollments(id, course_id) ON DELETE CASCADE,
  FOREIGN KEY (module_id, course_id)
    REFERENCES modules(id, course_id) ON DELETE CASCADE,
  CONSTRAINT learner_module_progress_status_allowed CHECK (
    status IN ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED')
  ),
  CONSTRAINT learner_module_progress_completion_consistent CHECK (
    (status = 'COMPLETED' AND completed_at IS NOT NULL)
    OR (status <> 'COMPLETED' AND completed_at IS NULL)
  ),
  CONSTRAINT learner_module_progress_time_nonnegative CHECK (time_spent_seconds >= 0),
  UNIQUE (enrollment_id, module_id)
);

CREATE INDEX course_enrollments_learner_status_idx
  ON course_enrollments(learner_id, status);
CREATE INDEX course_enrollments_course_id_idx
  ON course_enrollments(course_id);
CREATE INDEX learner_module_progress_enrollment_status_idx
  ON learner_module_progress(enrollment_id, status);
CREATE INDEX learner_module_progress_module_id_idx
  ON learner_module_progress(module_id);

UPDATE system_metadata
SET value = value || '{"phase":4}'::jsonb,
    updated_at = NOW()
WHERE key = 'application';
