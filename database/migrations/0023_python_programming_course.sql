-- A fifth compact course that deliberately reuses existing global skills.
-- Knowledge remains learner × skill; only the course path and module context
-- are new.
INSERT INTO courses (
  id, domain_id, slug, name, description, level, estimated_hours
) VALUES (
  '40000000-0000-4000-8000-000000000005',
  '10000000-0000-4000-8000-000000000001',
  'python-programming',
  'Python Programming',
  'Apply transferable programming foundations in Python, from variables and control flow to collections, recursion, and complexity-aware problem solving.',
  'BEGINNER',
  20.0
);

INSERT INTO modules (id, course_id, slug, name, description, sequence) VALUES
  ('50000000-0000-4000-8000-000000000013', '40000000-0000-4000-8000-000000000005', 'python-foundations', 'Python Foundations', 'Reuse variables and strings while learning Python expression and data conventions.', 1),
  ('50000000-0000-4000-8000-000000000014', '40000000-0000-4000-8000-000000000005', 'python-control-flow', 'Python Control Flow', 'Apply branching and iteration patterns to make programs respond to data.', 2),
  ('50000000-0000-4000-8000-000000000015', '40000000-0000-4000-8000-000000000005', 'functions-collections', 'Functions & Collections', 'Compose reusable functions and work effectively with Python collection structures.', 3),
  ('50000000-0000-4000-8000-000000000016', '40000000-0000-4000-8000-000000000005', 'recursive-problem-solving', 'Recursive Problem Solving', 'Recognize recursive structure and define safe base and recursive cases.', 4),
  ('50000000-0000-4000-8000-000000000017', '40000000-0000-4000-8000-000000000005', 'efficient-python', 'Efficient Python Thinking', 'Reason about time and space costs before selecting an implementation.', 5);

INSERT INTO course_skills (course_id, module_id, skill_id, sequence, is_required) VALUES
  ('40000000-0000-4000-8000-000000000005', '50000000-0000-4000-8000-000000000013', '30000000-0000-4000-8000-000000000001', 1, TRUE),
  ('40000000-0000-4000-8000-000000000005', '50000000-0000-4000-8000-000000000013', '30000000-0000-4000-8000-000000000006', 2, TRUE),
  ('40000000-0000-4000-8000-000000000005', '50000000-0000-4000-8000-000000000014', '30000000-0000-4000-8000-000000000002', 1, TRUE),
  ('40000000-0000-4000-8000-000000000005', '50000000-0000-4000-8000-000000000015', '30000000-0000-4000-8000-000000000003', 1, TRUE),
  ('40000000-0000-4000-8000-000000000005', '50000000-0000-4000-8000-000000000015', '30000000-0000-4000-8000-000000000005', 2, TRUE),
  ('40000000-0000-4000-8000-000000000005', '50000000-0000-4000-8000-000000000015', '30000000-0000-4000-8000-000000000016', 3, TRUE),
  ('40000000-0000-4000-8000-000000000005', '50000000-0000-4000-8000-000000000016', '30000000-0000-4000-8000-000000000009', 1, TRUE),
  ('40000000-0000-4000-8000-000000000005', '50000000-0000-4000-8000-000000000017', '30000000-0000-4000-8000-000000000004', 1, TRUE);

INSERT INTO assessments (
  id, course_id, title, description, assessment_type, status, estimated_minutes
) VALUES (
  '61000000-0000-4000-8000-000000000005',
  '40000000-0000-4000-8000-000000000005',
  'Python Programming Course Diagnostic',
  'Establish a global-skill evidence baseline before generating the learner''s Python course path.',
  'DIAGNOSTIC',
  'ACTIVE',
  10
);

-- Reuse the same global learning resources in their new course context.
INSERT INTO learning_resource_contexts (resource_id, course_id, module_id)
SELECT resource_skill.resource_id, course_skill.course_id, course_skill.module_id
FROM course_skills course_skill
JOIN learning_resource_skills resource_skill
  ON resource_skill.skill_id = course_skill.skill_id AND resource_skill.is_primary
WHERE course_skill.course_id = '40000000-0000-4000-8000-000000000005'
ON CONFLICT DO NOTHING;

UPDATE system_metadata
SET value = value || '{"catalogVersion":"five-course-v1"}'::jsonb,
    updated_at = NOW()
WHERE key = 'application';
