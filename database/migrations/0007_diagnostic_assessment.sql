CREATE TABLE questions (
  id UUID PRIMARY KEY,
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE RESTRICT,
  slug TEXT NOT NULL UNIQUE,
  prompt TEXT NOT NULL,
  question_type TEXT NOT NULL DEFAULT 'SINGLE_CHOICE',
  difficulty SMALLINT NOT NULL,
  explanation TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT questions_slug_format CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT questions_type_allowed CHECK (question_type IN ('SINGLE_CHOICE')),
  CONSTRAINT questions_difficulty_range CHECK (difficulty BETWEEN 1 AND 5),
  CONSTRAINT questions_status_allowed CHECK (status IN ('ACTIVE', 'RETIRED'))
);

CREATE TABLE question_options (
  id UUID PRIMARY KEY,
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  option_key CHAR(1) NOT NULL,
  content TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT question_options_key_allowed CHECK (option_key IN ('A', 'B', 'C', 'D')),
  UNIQUE (question_id, option_key),
  UNIQUE (id, question_id)
);

CREATE UNIQUE INDEX question_options_one_correct_idx
  ON question_options(question_id) WHERE is_correct;

CREATE TABLE assessments (
  id UUID PRIMARY KEY,
  goal_id UUID NOT NULL REFERENCES learning_goals(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  assessment_type TEXT NOT NULL DEFAULT 'DIAGNOSTIC',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  estimated_minutes SMALLINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT assessments_type_allowed CHECK (assessment_type IN ('DIAGNOSTIC')),
  CONSTRAINT assessments_status_allowed CHECK (status IN ('ACTIVE', 'RETIRED')),
  CONSTRAINT assessments_minutes_positive CHECK (estimated_minutes > 0),
  UNIQUE (goal_id, assessment_type)
);

CREATE TABLE assessment_questions (
  assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
  sequence SMALLINT NOT NULL,
  PRIMARY KEY (assessment_id, question_id),
  CONSTRAINT assessment_questions_sequence_positive CHECK (sequence > 0),
  UNIQUE (assessment_id, sequence)
);

CREATE TABLE assessment_attempts (
  id UUID PRIMARY KEY,
  assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE RESTRICT,
  learner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  learner_goal_id UUID NOT NULL REFERENCES learner_goals(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'IN_PROGRESS',
  question_count SMALLINT NOT NULL,
  correct_count SMALLINT,
  overall_score NUMERIC(5, 4),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT assessment_attempts_status_allowed CHECK (status IN ('IN_PROGRESS', 'SUBMITTED')),
  CONSTRAINT assessment_attempts_question_count_positive CHECK (question_count > 0),
  CONSTRAINT assessment_attempts_result_consistent CHECK (
    (status = 'IN_PROGRESS' AND correct_count IS NULL AND overall_score IS NULL AND submitted_at IS NULL)
    OR
    (status = 'SUBMITTED' AND correct_count BETWEEN 0 AND question_count
      AND overall_score BETWEEN 0 AND 1 AND submitted_at IS NOT NULL)
  ),
  CONSTRAINT assessment_attempts_duration_nonnegative CHECK (
    duration_seconds IS NULL OR duration_seconds >= 0
  )
);

CREATE UNIQUE INDEX assessment_attempts_one_active_idx
  ON assessment_attempts(learner_id, assessment_id)
  WHERE status = 'IN_PROGRESS';

CREATE TABLE assessment_answers (
  id UUID PRIMARY KEY,
  attempt_id UUID NOT NULL REFERENCES assessment_attempts(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
  selected_option_id UUID NOT NULL,
  is_correct BOOLEAN NOT NULL,
  answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (selected_option_id, question_id)
    REFERENCES question_options(id, question_id) ON DELETE RESTRICT,
  UNIQUE (attempt_id, question_id)
);

CREATE TABLE assessment_skill_results (
  id UUID PRIMARY KEY,
  attempt_id UUID NOT NULL REFERENCES assessment_attempts(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE RESTRICT,
  question_count SMALLINT NOT NULL,
  correct_count SMALLINT NOT NULL,
  score NUMERIC(5, 4) NOT NULL,
  mastery_before NUMERIC(5, 4),
  mastery_after NUMERIC(5, 4) NOT NULL,
  confidence_before NUMERIC(5, 4),
  confidence_after NUMERIC(5, 4) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT assessment_skill_results_counts CHECK (
    question_count > 0 AND correct_count BETWEEN 0 AND question_count
  ),
  CONSTRAINT assessment_skill_results_score_ranges CHECK (
    score BETWEEN 0 AND 1
    AND (mastery_before IS NULL OR mastery_before BETWEEN 0 AND 1)
    AND mastery_after BETWEEN 0 AND 1
    AND (confidence_before IS NULL OR confidence_before BETWEEN 0 AND 1)
    AND confidence_after BETWEEN 0 AND 1
  ),
  UNIQUE (attempt_id, skill_id)
);

CREATE INDEX questions_skill_id_idx ON questions(skill_id);
CREATE INDEX assessments_goal_id_idx ON assessments(goal_id);
CREATE INDEX assessment_attempts_learner_status_idx
  ON assessment_attempts(learner_id, status, started_at DESC);
CREATE INDEX assessment_answers_attempt_id_idx ON assessment_answers(attempt_id);
CREATE INDEX assessment_skill_results_skill_id_idx ON assessment_skill_results(skill_id);

WITH seeded(slug, skill_slug, difficulty, prompt, explanation) AS (
  VALUES
    ('q01-complexity-linear-loop', 'complexity-analysis', 1, 'A loop visits each of n elements exactly once. What is its time complexity?', 'A single pass grows linearly with the number of elements, so the complexity is O(n).'),
    ('q02-complexity-nested-loop', 'complexity-analysis', 2, 'Two nested loops each run n times. What is the resulting time complexity?', 'The inner loop runs n times for each of n outer iterations, producing n squared operations.'),
    ('q03-arrays-index-access', 'arrays', 1, 'What is the typical time complexity of reading an array element by its index?', 'Arrays use contiguous storage, so an address can be calculated directly in O(1) time.'),
    ('q04-arrays-remove-front', 'arrays', 2, 'Why is removing the first element from a standard contiguous array usually O(n)?', 'The remaining elements generally need to shift one position toward the front.'),
    ('q05-hashing-average-lookup', 'hashing', 2, 'What is the expected average lookup time in a well-designed hash table?', 'With a suitable hash function and controlled load factor, lookup is expected O(1) on average.'),
    ('q06-hashing-collision', 'hashing', 2, 'What is a hash collision?', 'A collision occurs when distinct keys map to the same table location or bucket.'),
    ('q07-queues-order', 'queues', 1, 'Which processing order defines a standard queue?', 'A queue follows first-in, first-out order: the earliest inserted item leaves first.'),
    ('q08-queues-bfs', 'queues', 2, 'Which structure is central to breadth-first traversal?', 'A queue preserves layer-by-layer exploration order in breadth-first traversal.'),
    ('q09-binary-trees-definition', 'binary-trees', 1, 'How many children can a node have in a binary tree?', 'By definition, a binary-tree node has at most two children.'),
    ('q10-binary-trees-bst-inorder', 'binary-trees', 3, 'What does an in-order traversal of a valid binary search tree produce?', 'Visiting left subtree, node, then right subtree produces values in sorted order.'),
    ('q11-heaps-min-root', 'heaps', 2, 'In a min-heap, which value is stored at the root?', 'The heap-order property places the minimum value at the root.'),
    ('q12-heaps-insert-cost', 'heaps', 3, 'What is the typical time complexity of inserting into a binary heap?', 'The new element may move along the heap height, which is O(log n).'),
    ('q13-graphs-sparse-storage', 'graph-fundamentals', 2, 'Which representation is usually space-efficient for a sparse graph?', 'An adjacency list stores existing edges and avoids a dense vertex-by-vertex matrix.'),
    ('q14-graphs-directed-edge', 'graph-fundamentals', 1, 'What distinguishes a directed edge from an undirected edge?', 'A directed edge has an orientation from one vertex to another.'),
    ('q15-bfs-shortest-path', 'breadth-first-search', 3, 'When does breadth-first search guarantee a shortest path?', 'BFS finds minimum-edge paths in unweighted graphs because it explores by distance layers.'),
    ('q16-bfs-visited', 'breadth-first-search', 2, 'Why does graph BFS maintain a visited set?', 'The visited set prevents repeated processing and infinite cycling through previously reached vertices.')
)
INSERT INTO questions (id, skill_id, slug, prompt, difficulty, explanation)
SELECT gen_random_uuid(), s.id, seeded.slug, seeded.prompt, seeded.difficulty, seeded.explanation
FROM seeded JOIN skills s ON s.slug = seeded.skill_slug;

WITH seeded(question_slug, option_key, content, is_correct) AS (
  VALUES
    ('q01-complexity-linear-loop', 'A', 'O(1)', FALSE), ('q01-complexity-linear-loop', 'B', 'O(log n)', FALSE), ('q01-complexity-linear-loop', 'C', 'O(n)', TRUE), ('q01-complexity-linear-loop', 'D', 'O(n²)', FALSE),
    ('q02-complexity-nested-loop', 'A', 'O(n²)', TRUE), ('q02-complexity-nested-loop', 'B', 'O(n)', FALSE), ('q02-complexity-nested-loop', 'C', 'O(log n)', FALSE), ('q02-complexity-nested-loop', 'D', 'O(2n)', FALSE),
    ('q03-arrays-index-access', 'A', 'O(n)', FALSE), ('q03-arrays-index-access', 'B', 'O(1)', TRUE), ('q03-arrays-index-access', 'C', 'O(log n)', FALSE), ('q03-arrays-index-access', 'D', 'O(n²)', FALSE),
    ('q04-arrays-remove-front', 'A', 'The array must be sorted first', FALSE), ('q04-arrays-remove-front', 'B', 'The remaining elements usually shift', TRUE), ('q04-arrays-remove-front', 'C', 'Every value must be hashed', FALSE), ('q04-arrays-remove-front', 'D', 'The index cannot be calculated', FALSE),
    ('q05-hashing-average-lookup', 'A', 'O(1)', TRUE), ('q05-hashing-average-lookup', 'B', 'O(log n)', FALSE), ('q05-hashing-average-lookup', 'C', 'O(n)', FALSE), ('q05-hashing-average-lookup', 'D', 'O(n²)', FALSE),
    ('q06-hashing-collision', 'A', 'A key is inserted twice', FALSE), ('q06-hashing-collision', 'B', 'Two distinct keys map to the same bucket', TRUE), ('q06-hashing-collision', 'C', 'The table becomes sorted', FALSE), ('q06-hashing-collision', 'D', 'A lookup returns in O(1)', FALSE),
    ('q07-queues-order', 'A', 'Last in, first out', FALSE), ('q07-queues-order', 'B', 'First in, first out', TRUE), ('q07-queues-order', 'C', 'Highest value first', FALSE), ('q07-queues-order', 'D', 'Random order', FALSE),
    ('q08-queues-bfs', 'A', 'Stack', FALSE), ('q08-queues-bfs', 'B', 'Queue', TRUE), ('q08-queues-bfs', 'C', 'Heap only', FALSE), ('q08-queues-bfs', 'D', 'Binary search tree', FALSE),
    ('q09-binary-trees-definition', 'A', 'Exactly one', FALSE), ('q09-binary-trees-definition', 'B', 'At most two', TRUE), ('q09-binary-trees-definition', 'C', 'At most three', FALSE), ('q09-binary-trees-definition', 'D', 'Any number', FALSE),
    ('q10-binary-trees-bst-inorder', 'A', 'Values in sorted order', TRUE), ('q10-binary-trees-bst-inorder', 'B', 'Values in insertion order', FALSE), ('q10-binary-trees-bst-inorder', 'C', 'Only leaf values', FALSE), ('q10-binary-trees-bst-inorder', 'D', 'Values in random order', FALSE),
    ('q11-heaps-min-root', 'A', 'The most recently inserted value', FALSE), ('q11-heaps-min-root', 'B', 'The minimum value', TRUE), ('q11-heaps-min-root', 'C', 'The maximum value', FALSE), ('q11-heaps-min-root', 'D', 'The median value', FALSE),
    ('q12-heaps-insert-cost', 'A', 'O(1) always', FALSE), ('q12-heaps-insert-cost', 'B', 'O(log n)', TRUE), ('q12-heaps-insert-cost', 'C', 'O(n)', FALSE), ('q12-heaps-insert-cost', 'D', 'O(n²)', FALSE),
    ('q13-graphs-sparse-storage', 'A', 'Adjacency list', TRUE), ('q13-graphs-sparse-storage', 'B', 'Full adjacency matrix', FALSE), ('q13-graphs-sparse-storage', 'C', 'Sorted array only', FALSE), ('q13-graphs-sparse-storage', 'D', 'Binary heap only', FALSE),
    ('q14-graphs-directed-edge', 'A', 'It has an orientation', TRUE), ('q14-graphs-directed-edge', 'B', 'It always has zero weight', FALSE), ('q14-graphs-directed-edge', 'C', 'It connects three vertices', FALSE), ('q14-graphs-directed-edge', 'D', 'It cannot form a cycle', FALSE),
    ('q15-bfs-shortest-path', 'A', 'In any negatively weighted graph', FALSE), ('q15-bfs-shortest-path', 'B', 'In an unweighted graph', TRUE), ('q15-bfs-shortest-path', 'C', 'Only in a binary tree', FALSE), ('q15-bfs-shortest-path', 'D', 'Only when using recursion', FALSE),
    ('q16-bfs-visited', 'A', 'To sort every vertex', FALSE), ('q16-bfs-visited', 'B', 'To prevent repeated processing and cycles', TRUE), ('q16-bfs-visited', 'C', 'To calculate edge weights', FALSE), ('q16-bfs-visited', 'D', 'To convert the graph into a tree', FALSE)
)
INSERT INTO question_options (id, question_id, option_key, content, is_correct)
SELECT gen_random_uuid(), q.id, seeded.option_key, seeded.content, seeded.is_correct
FROM seeded JOIN questions q ON q.slug = seeded.question_slug;

INSERT INTO assessments (id, goal_id, title, description, estimated_minutes)
VALUES
  ('60000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'DSA Interview Diagnostic', 'Establish an initial evidence baseline across foundational interview skills.', 14),
  ('60000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'Competitive Programming Diagnostic', 'Measure foundational readiness before advanced problem-pattern work.', 14),
  ('60000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', 'Backend Problem-Solving Diagnostic', 'Measure data-structure and graph foundations used in backend workloads.', 14);

INSERT INTO assessment_questions (assessment_id, question_id, sequence)
SELECT a.id, q.id,
       ROW_NUMBER() OVER (PARTITION BY a.id ORDER BY q.slug)::smallint
FROM assessments a CROSS JOIN questions q
WHERE a.assessment_type = 'DIAGNOSTIC' AND q.status = 'ACTIVE';

UPDATE system_metadata
SET value = value || '{"phase":6}'::jsonb,
    updated_at = NOW()
WHERE key = 'application';
