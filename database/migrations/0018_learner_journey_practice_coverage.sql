-- Ensure the first prerequisite skill in the learner journey can complete the
-- lesson -> practice -> mastery update loop with validated, server-owned data.
INSERT INTO questions (
  id, skill_id, slug, prompt, question_type, difficulty, explanation, status
)
SELECT
  gen_random_uuid(),
  skill.id,
  'q17-programming-variables-update',
  'After the statements "let count = 2" and "count = count + 3" run, what value does count hold?',
  'SINGLE_CHOICE',
  1,
  'The second statement reads the current value 2, adds 3, and stores the result 5 back in count.',
  'ACTIVE'
FROM skills skill
WHERE skill.slug = 'programming-variables'
ON CONFLICT (slug) DO NOTHING;

WITH seeded(option_key, content, is_correct) AS (
  VALUES
    ('A', '2', FALSE),
    ('B', '3', FALSE),
    ('C', '5', TRUE),
    ('D', 'The variable has no value', FALSE)
)
INSERT INTO question_options (id, question_id, option_key, content, is_correct)
SELECT gen_random_uuid(), question.id, seeded.option_key, seeded.content, seeded.is_correct
FROM seeded
JOIN questions question ON question.slug = 'q17-programming-variables-update'
ON CONFLICT (question_id, option_key) DO NOTHING;

-- Include the same global-skill question in each active course diagnostic that
-- teaches Programming Variables. Existing submitted attempts remain immutable.
INSERT INTO assessment_questions (assessment_id, question_id, sequence)
SELECT
  assessment.id,
  question.id,
  (
    SELECT COALESCE(MAX(existing.sequence), 0) + 1
    FROM assessment_questions existing
    WHERE existing.assessment_id = assessment.id
  )::smallint
FROM assessments assessment
JOIN course_skills course_skill ON course_skill.course_id = assessment.course_id
JOIN skills skill ON skill.id = course_skill.skill_id AND skill.slug = 'programming-variables'
JOIN questions question ON question.slug = 'q17-programming-variables-update'
WHERE assessment.assessment_type = 'DIAGNOSTIC'
  AND assessment.status = 'ACTIVE'
ON CONFLICT (assessment_id, question_id) DO NOTHING;

UPDATE system_metadata
SET value = value || '{"learnerUx":"practice-coverage-v1"}'::jsonb,
    updated_at = NOW()
WHERE key = 'application';
