CREATE TABLE learner_skill_mastery (
  id UUID PRIMARY KEY,
  learner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE RESTRICT,
  mastery NUMERIC(5, 4),
  confidence NUMERIC(5, 4),
  retention NUMERIC(5, 4),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  correct_attempts INTEGER NOT NULL DEFAULT 0,
  incorrect_attempts INTEGER NOT NULL DEFAULT 0,
  last_assessed_at TIMESTAMPTZ,
  last_practiced_at TIMESTAMPTZ,
  total_time_spent_seconds INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT learner_skill_mastery_score_ranges CHECK (
    (mastery IS NULL OR mastery BETWEEN 0 AND 1)
    AND (confidence IS NULL OR confidence BETWEEN 0 AND 1)
    AND (retention IS NULL OR retention BETWEEN 0 AND 1)
  ),
  CONSTRAINT learner_skill_mastery_attempt_counts CHECK (
    attempt_count >= 0
    AND correct_attempts >= 0
    AND incorrect_attempts >= 0
    AND correct_attempts + incorrect_attempts <= attempt_count
  ),
  CONSTRAINT learner_skill_mastery_time_nonnegative CHECK (total_time_spent_seconds >= 0),
  UNIQUE (learner_id, skill_id)
);

CREATE INDEX learner_skill_mastery_learner_idx
  ON learner_skill_mastery(learner_id);
CREATE INDEX learner_skill_mastery_skill_idx
  ON learner_skill_mastery(skill_id);
CREATE INDEX learner_skill_mastery_assessed_idx
  ON learner_skill_mastery(learner_id, updated_at DESC)
  WHERE mastery IS NOT NULL;

-- A learner-skill relationship is materialized by curriculum context, not by assumed knowledge.
-- Scores remain NULL until a later evidence-producing phase assesses the learner.
INSERT INTO learner_skill_mastery (id, learner_id, skill_id)
SELECT gen_random_uuid(), context.learner_id, context.skill_id
FROM (
  SELECT DISTINCT ce.learner_id, cs.skill_id
  FROM course_enrollments ce
  JOIN course_skills cs ON cs.course_id = ce.course_id
  WHERE ce.status <> 'DROPPED'

  UNION

  SELECT DISTINCT lg.learner_id, gs.skill_id
  FROM learner_goals lg
  JOIN goal_skills gs ON gs.goal_id = lg.goal_id
  WHERE lg.status <> 'DROPPED'
) context
ON CONFLICT (learner_id, skill_id) DO NOTHING;

UPDATE system_metadata
SET value = value || '{"phase":5}'::jsonb,
    updated_at = NOW()
WHERE key = 'application';
