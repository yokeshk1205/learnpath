-- Keep the Phase 19 accepted-recommendation demo fully evidence-driven: the
-- Functions skill can be assessed through both diagnostics and practice.
INSERT INTO questions (
  id, skill_id, slug, prompt, question_type, difficulty, explanation, status
)
SELECT
  gen_random_uuid(),
  skill.id,
  'q18-functions-return-value',
  'What value is returned by add(2, 3) when add(a, b) returns a + b?',
  'SINGLE_CHOICE',
  2,
  'The arguments 2 and 3 are assigned to a and b, and the function returns their sum: 5.',
  'ACTIVE'
FROM skills skill
WHERE skill.slug = 'functions'
ON CONFLICT (slug) DO NOTHING;

WITH seeded(option_key, content, is_correct) AS (
  VALUES
    ('A', '2', FALSE),
    ('B', '3', FALSE),
    ('C', '5', TRUE),
    ('D', 'No value', FALSE)
)
INSERT INTO question_options (id, question_id, option_key, content, is_correct)
SELECT gen_random_uuid(), question.id, seeded.option_key, seeded.content, seeded.is_correct
FROM seeded
JOIN questions question ON question.slug = 'q18-functions-return-value'
ON CONFLICT (question_id, option_key) DO NOTHING;

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
JOIN skills skill ON skill.id = course_skill.skill_id AND skill.slug = 'functions'
JOIN questions question ON question.slug = 'q18-functions-return-value'
WHERE assessment.assessment_type = 'DIAGNOSTIC'
  AND assessment.status = 'ACTIVE'
ON CONFLICT (assessment_id, question_id) DO NOTHING;

UPDATE system_metadata
SET value = value || '{"learnerUx":"recommendation-outcome-coverage-v1"}'::jsonb,
    updated_at = NOW()
WHERE key = 'application';
