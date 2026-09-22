-- Diagnostic v2 keeps submitted evidence immutable while personalizing new attempts.
ALTER TABLE assessment_attempts
  ADD COLUMN selection_policy_version TEXT NOT NULL DEFAULT 'diagnostic-fixed-v1',
  ADD COLUMN diagnostic_template_question_count SMALLINT,
  ADD COLUMN diagnostic_selected_skill_count SMALLINT,
  ADD COLUMN diagnostic_recognized_skill_count SMALLINT,
  ADD COLUMN diagnostic_skipped_skill_count SMALLINT,
  ADD CONSTRAINT assessment_attempts_diagnostic_counts_nonnegative CHECK (
    (diagnostic_template_question_count IS NULL OR diagnostic_template_question_count >= 0)
    AND (diagnostic_selected_skill_count IS NULL OR diagnostic_selected_skill_count >= 0)
    AND (diagnostic_recognized_skill_count IS NULL OR diagnostic_recognized_skill_count >= 0)
    AND (diagnostic_skipped_skill_count IS NULL OR diagnostic_skipped_skill_count >= 0)
  );

CREATE TABLE diagnostic_attempt_questions (
  attempt_id UUID NOT NULL REFERENCES assessment_attempts(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
  sequence SMALLINT NOT NULL,
  selection_reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (attempt_id, question_id),
  UNIQUE (attempt_id, sequence),
  CONSTRAINT diagnostic_attempt_questions_sequence_positive CHECK (sequence > 0)
);

-- Preserve any attempt that was already in progress before this migration.
INSERT INTO diagnostic_attempt_questions (attempt_id, question_id, sequence, selection_reason)
SELECT attempt.id, question.question_id, question.sequence, 'Existing fixed diagnostic preserved'
FROM assessment_attempts attempt
JOIN assessment_questions question ON question.assessment_id = attempt.assessment_id
WHERE attempt.status = 'IN_PROGRESS'
ON CONFLICT (attempt_id, question_id) DO NOTHING;

CREATE TABLE diagnostic_answer_drafts (
  attempt_id UUID NOT NULL,
  question_id UUID NOT NULL,
  selected_option_id UUID,
  is_unsure BOOLEAN NOT NULL DEFAULT FALSE,
  response_seconds INTEGER NOT NULL DEFAULT 0,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (attempt_id, question_id),
  FOREIGN KEY (attempt_id, question_id)
    REFERENCES diagnostic_attempt_questions(attempt_id, question_id) ON DELETE CASCADE,
  FOREIGN KEY (selected_option_id, question_id)
    REFERENCES question_options(id, question_id) ON DELETE RESTRICT,
  CONSTRAINT diagnostic_answer_drafts_choice CHECK (
    (is_unsure AND selected_option_id IS NULL)
    OR (NOT is_unsure AND selected_option_id IS NOT NULL)
  ),
  CONSTRAINT diagnostic_answer_drafts_duration CHECK (
    response_seconds BETWEEN 0 AND 3600
  )
);

ALTER TABLE assessment_answers
  ALTER COLUMN selected_option_id DROP NOT NULL;
ALTER TABLE assessment_answers
  ADD COLUMN is_unsure BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE assessment_answers
  ADD CONSTRAINT assessment_answers_choice CHECK (
    (is_unsure AND selected_option_id IS NULL)
    OR (NOT is_unsure AND selected_option_id IS NOT NULL)
  );

-- Add an application-oriented diagnostic variant for every active skill. The
-- correct choice comes from the skill's real primary lesson. Distractors come
-- from other real skills, avoiding the repeated obviously-wrong placeholders.
WITH source AS (
  SELECT DISTINCT ON (skill.id)
    skill.id AS skill_id,
    skill.slug AS skill_slug,
    skill.name AS skill_name,
    LEAST(5, skill.difficulty + 1)::smallint AS difficulty,
    COALESCE(
      resource.content_sections -> 1 ->> 'body',
      correct_option.content
    ) AS application
  FROM skills skill
  JOIN questions canonical
    ON canonical.skill_id = skill.id
   AND canonical.question_purpose = 'DIAGNOSTIC'
   AND canonical.status = 'ACTIVE'
  JOIN question_options correct_option
    ON correct_option.question_id = canonical.id
   AND correct_option.is_correct
  LEFT JOIN learning_resource_skills resource_skill
    ON resource_skill.skill_id = skill.id
   AND resource_skill.is_primary
  LEFT JOIN learning_resources resource
    ON resource.id = resource_skill.resource_id
   AND resource.is_active
  WHERE skill.is_active
  ORDER BY skill.id,
           CASE WHEN canonical.slug LIKE 'final-%-diagnostic' THEN 0 ELSE 1 END,
           resource.updated_at DESC NULLS LAST,
           canonical.difficulty
)
INSERT INTO questions (
  id, skill_id, slug, prompt, question_type, difficulty, explanation,
  status, question_purpose
)
SELECT
  gen_random_uuid(), source.skill_id,
  'adaptive-' || source.skill_slug || '-application-v2',
  'Which approach best demonstrates reliable use of ' || source.skill_name || '?',
  'SINGLE_CHOICE', source.difficulty, source.application,
  'ACTIVE', 'DIAGNOSTIC'
FROM source
ON CONFLICT (slug) DO NOTHING;

WITH applications AS (
  SELECT DISTINCT ON (skill.id)
    skill.id AS skill_id,
    skill.category,
    COALESCE(
      resource.content_sections -> 1 ->> 'body',
      correct_option.content
    ) AS application
  FROM skills skill
  JOIN questions canonical
    ON canonical.skill_id = skill.id
   AND canonical.question_purpose = 'DIAGNOSTIC'
   AND canonical.status = 'ACTIVE'
  JOIN question_options correct_option
    ON correct_option.question_id = canonical.id
   AND correct_option.is_correct
  LEFT JOIN learning_resource_skills resource_skill
    ON resource_skill.skill_id = skill.id
   AND resource_skill.is_primary
  LEFT JOIN learning_resources resource
    ON resource.id = resource_skill.resource_id
   AND resource.is_active
  WHERE skill.is_active
  ORDER BY skill.id,
           CASE WHEN canonical.slug LIKE 'final-%-diagnostic' THEN 0 ELSE 1 END,
           resource.updated_at DESC NULLS LAST,
           canonical.difficulty
), option_pool AS (
  SELECT question.id AS question_id, own.application AS content, TRUE AS is_correct
  FROM questions question
  JOIN applications own ON own.skill_id = question.skill_id
  WHERE question.slug LIKE 'adaptive-%-application-v2'
  UNION ALL
  SELECT question.id, distractor.application, FALSE
  FROM questions question
  JOIN applications own ON own.skill_id = question.skill_id
  CROSS JOIN LATERAL (
    SELECT candidate.application
    FROM applications candidate
    WHERE candidate.skill_id <> own.skill_id
      AND candidate.application <> own.application
    ORDER BY (candidate.category = own.category) DESC,
             md5(question.slug || candidate.skill_id::text)
    LIMIT 3
  ) distractor
  WHERE question.slug LIKE 'adaptive-%-application-v2'
), ordered_options AS (
  SELECT question_id, content, is_correct,
         ROW_NUMBER() OVER (
           PARTITION BY question_id ORDER BY md5(question_id::text || content)
         ) AS option_number
  FROM option_pool
)
INSERT INTO question_options (id, question_id, option_key, content, is_correct)
SELECT gen_random_uuid(), question_id,
       CHR(64 + option_number::integer)::char(1), content, is_correct
FROM ordered_options
ON CONFLICT (question_id, option_key) DO NOTHING;

WITH additions AS (
  SELECT assessment.id AS assessment_id, question.id AS question_id,
         ROW_NUMBER() OVER (
           PARTITION BY assessment.id ORDER BY course_skill.sequence, question.slug
         )::smallint AS offset_sequence
  FROM assessments assessment
  JOIN course_skills course_skill ON course_skill.course_id = assessment.course_id
  JOIN questions question
    ON question.skill_id = course_skill.skill_id
   AND question.slug LIKE 'adaptive-%-application-v2'
  WHERE assessment.status = 'ACTIVE'
    AND assessment.assessment_type = 'DIAGNOSTIC'
    AND NOT EXISTS (
      SELECT 1 FROM assessment_questions existing
      WHERE existing.assessment_id = assessment.id
        AND existing.question_id = question.id
    )
), maxima AS (
  SELECT assessment.id AS assessment_id,
         COALESCE(MAX(existing.sequence), 0)::smallint AS maximum_sequence
  FROM assessments assessment
  LEFT JOIN assessment_questions existing ON existing.assessment_id = assessment.id
  GROUP BY assessment.id
)
INSERT INTO assessment_questions (assessment_id, question_id, sequence)
SELECT additions.assessment_id, additions.question_id,
       (maxima.maximum_sequence + additions.offset_sequence)::smallint
FROM additions
JOIN maxima ON maxima.assessment_id = additions.assessment_id
ON CONFLICT (assessment_id, question_id) DO NOTHING;

UPDATE system_metadata
SET value = value || '{"diagnosticPolicy":"prerequisite-aware-v2","diagnosticDrafts":true}'::jsonb,
    updated_at = NOW()
WHERE key = 'application';
