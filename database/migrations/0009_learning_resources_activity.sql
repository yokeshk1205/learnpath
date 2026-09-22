CREATE TABLE learning_resources (
  id UUID PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  difficulty SMALLINT NOT NULL,
  estimated_minutes SMALLINT NOT NULL,
  learning_objectives TEXT[] NOT NULL,
  content_sections JSONB NOT NULL,
  external_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT learning_resources_slug_format CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT learning_resources_type_allowed CHECK (
    resource_type IN ('CONCEPT_GUIDE', 'WORKED_EXAMPLE', 'VIDEO', 'INTERACTIVE', 'REFERENCE')
  ),
  CONSTRAINT learning_resources_difficulty_range CHECK (difficulty BETWEEN 1 AND 5),
  CONSTRAINT learning_resources_duration_positive CHECK (estimated_minutes > 0),
  CONSTRAINT learning_resources_objectives_present CHECK (cardinality(learning_objectives) > 0),
  CONSTRAINT learning_resources_sections_array CHECK (jsonb_typeof(content_sections) = 'array')
);

CREATE TABLE learning_resource_skills (
  resource_id UUID NOT NULL REFERENCES learning_resources(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE RESTRICT,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (resource_id, skill_id)
);

CREATE UNIQUE INDEX learning_resource_primary_skill_idx
  ON learning_resource_skills(resource_id)
  WHERE is_primary;
CREATE INDEX learning_resource_skills_skill_idx
  ON learning_resource_skills(skill_id, resource_id);

CREATE TABLE learning_resource_contexts (
  resource_id UUID NOT NULL REFERENCES learning_resources(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  module_id UUID NOT NULL,
  PRIMARY KEY (resource_id, course_id, module_id),
  FOREIGN KEY (module_id, course_id) REFERENCES modules(id, course_id) ON DELETE CASCADE
);

CREATE INDEX learning_resource_contexts_course_module_idx
  ON learning_resource_contexts(course_id, module_id, resource_id);

CREATE TABLE learner_learning_history (
  id UUID PRIMARY KEY,
  learner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resource_id UUID NOT NULL REFERENCES learning_resources(id) ON DELETE RESTRICT,
  status TEXT NOT NULL,
  first_started_at TIMESTAMPTZ NOT NULL,
  last_started_at TIMESTAMPTZ NOT NULL,
  last_completed_at TIMESTAMPTZ,
  last_skipped_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ NOT NULL,
  total_time_spent_seconds INTEGER NOT NULL DEFAULT 0,
  session_count INTEGER NOT NULL DEFAULT 1,
  completion_count INTEGER NOT NULL DEFAULT 0,
  skip_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT learner_learning_history_status_allowed CHECK (
    status IN ('IN_PROGRESS', 'COMPLETED', 'SKIPPED')
  ),
  CONSTRAINT learner_learning_history_counts_nonnegative CHECK (
    total_time_spent_seconds >= 0
    AND session_count >= 0
    AND completion_count >= 0
    AND skip_count >= 0
  ),
  UNIQUE (learner_id, resource_id)
);

CREATE INDEX learner_learning_history_learner_activity_idx
  ON learner_learning_history(learner_id, last_activity_at DESC);
CREATE INDEX learner_learning_history_resource_idx
  ON learner_learning_history(resource_id);

CREATE TABLE learner_activity_events (
  id UUID PRIMARY KEY,
  learner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id UUID REFERENCES courses(id) ON DELETE SET NULL,
  module_id UUID REFERENCES modules(id) ON DELETE SET NULL,
  skill_id UUID REFERENCES skills(id) ON DELETE SET NULL,
  resource_id UUID REFERENCES learning_resources(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT learner_activity_events_type_allowed CHECK (
    event_type IN (
      'LESSON_STARTED', 'LESSON_COMPLETED',
      'RESOURCE_STARTED', 'RESOURCE_COMPLETED', 'RESOURCE_SKIPPED',
      'PRACTICE_STARTED', 'PRACTICE_COMPLETED',
      'QUIZ_STARTED', 'QUIZ_COMPLETED',
      'ASSESSMENT_SUBMITTED',
      'RECOMMENDATION_SHOWN', 'RECOMMENDATION_ACCEPTED', 'RECOMMENDATION_REJECTED'
    )
  ),
  CONSTRAINT learner_activity_events_duration_nonnegative CHECK (duration_seconds >= 0),
  CONSTRAINT learner_activity_events_result_object CHECK (jsonb_typeof(result) = 'object'),
  CONSTRAINT learner_activity_events_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX learner_activity_events_learner_time_idx
  ON learner_activity_events(learner_id, occurred_at DESC);
CREATE INDEX learner_activity_events_skill_time_idx
  ON learner_activity_events(skill_id, occurred_at DESC)
  WHERE skill_id IS NOT NULL;
CREATE INDEX learner_activity_events_resource_time_idx
  ON learner_activity_events(resource_id, occurred_at DESC)
  WHERE resource_id IS NOT NULL;
CREATE INDEX learner_activity_events_course_time_idx
  ON learner_activity_events(course_id, occurred_at DESC)
  WHERE course_id IS NOT NULL;

WITH resource_seed AS (
  SELECT
    gen_random_uuid() AS id,
    s.id AS skill_id,
    s.slug || '-concept-guide' AS slug,
    s.name || ' Visual Primer' AS title,
    'Build a durable mental model for ' || lower(s.name) || ' before applying it.' AS summary,
    'CONCEPT_GUIDE'::text AS resource_type,
    s.difficulty,
    GREATEST(8, ROUND(s.estimated_minutes * 0.30))::smallint AS estimated_minutes,
    ARRAY[
      'Explain the core idea behind ' || lower(s.name) || '.',
      'Recognize when ' || lower(s.name) || ' is useful.',
      'Identify the most common correctness and complexity trade-offs.'
    ]::text[] AS learning_objectives,
    jsonb_build_array(
      jsonb_build_object(
        'heading', 'Mental model',
        'body', s.description || ' Start by naming the state, operation, or invariant that must remain true.'
      ),
      jsonb_build_object(
        'heading', 'Reasoning checklist',
        'body', 'Trace one small example, identify the boundary conditions, and then describe the time and space costs before writing code.'
      ),
      jsonb_build_object(
        'heading', 'Knowledge check',
        'body', 'Explain the idea in your own words and contrast it with a simpler alternative. Activity here records study behavior, not mastery evidence.'
      )
    ) AS content_sections
  FROM skills s
  WHERE s.is_active

  UNION ALL

  SELECT
    gen_random_uuid(),
    s.id,
    s.slug || '-worked-example',
    s.name || ' Guided Walkthrough',
    'Follow a worked problem from constraints to a checked ' || lower(s.name) || ' solution.',
    'WORKED_EXAMPLE',
    s.difficulty,
    GREATEST(12, ROUND(s.estimated_minutes * 0.45))::smallint,
    ARRAY[
      'Translate a problem statement into a ' || lower(s.name) || ' strategy.',
      'Trace the strategy on a concrete input.',
      'Check correctness, edge cases, and complexity.'
    ]::text[],
    jsonb_build_array(
      jsonb_build_object(
        'heading', '1. Read the constraints',
        'body', 'List the input size, required output, ordering assumptions, and edge cases. These constraints should justify the chosen approach.'
      ),
      jsonb_build_object(
        'heading', '2. Trace the approach',
        'body', 'Walk through a small input and record how state changes at every important step. If an invariant breaks, revise the approach before implementation.'
      ),
      jsonb_build_object(
        'heading', '3. Verify the result',
        'body', 'Test empty, minimal, typical, and adversarial inputs. State the final time and space complexity and the assumptions behind them.'
      )
    )
  FROM skills s
  WHERE s.is_active
), inserted_resources AS (
  INSERT INTO learning_resources (
    id, slug, title, summary, resource_type, difficulty,
    estimated_minutes, learning_objectives, content_sections
  )
  SELECT
    id, slug, title, summary, resource_type, difficulty,
    estimated_minutes, learning_objectives, content_sections
  FROM resource_seed
  RETURNING id, slug
)
INSERT INTO learning_resource_skills (resource_id, skill_id, is_primary)
SELECT inserted.id, skill.id, TRUE
FROM inserted_resources inserted
JOIN skills skill ON inserted.slug IN (
  skill.slug || '-concept-guide', skill.slug || '-worked-example'
);

INSERT INTO learning_resource_contexts (resource_id, course_id, module_id)
SELECT resource_skill.resource_id, course_skill.course_id, course_skill.module_id
FROM learning_resource_skills resource_skill
JOIN course_skills course_skill ON course_skill.skill_id = resource_skill.skill_id;

CREATE OR REPLACE FUNCTION learner_module_progress_record_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  learner UUID;
  activity_type TEXT;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  activity_type := CASE NEW.status
    WHEN 'IN_PROGRESS' THEN 'LESSON_STARTED'
    WHEN 'COMPLETED' THEN 'LESSON_COMPLETED'
    ELSE NULL
  END;
  IF activity_type IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT ce.learner_id INTO learner
  FROM course_enrollments ce
  WHERE ce.id = NEW.enrollment_id;

  INSERT INTO learner_activity_events (
    id, learner_id, course_id, module_id, event_type, occurred_at, result, metadata
  )
  VALUES (
    gen_random_uuid(), learner, NEW.course_id, NEW.module_id, activity_type,
    NOW(), jsonb_build_object('moduleStatus', NEW.status),
    jsonb_build_object('source', 'module_progress')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER learner_module_progress_activity_event
AFTER UPDATE OF status ON learner_module_progress
FOR EACH ROW
EXECUTE FUNCTION learner_module_progress_record_activity();

UPDATE system_metadata
SET value = value || '{"phase":8}'::jsonb,
    updated_at = NOW()
WHERE key = 'application';
