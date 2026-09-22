-- Separate the diagnostic, guided-practice, and post-lesson assessment pools.
ALTER TABLE questions
  ADD COLUMN question_purpose TEXT NOT NULL DEFAULT 'DIAGNOSTIC';

ALTER TABLE questions
  ADD CONSTRAINT questions_purpose_allowed CHECK (
    question_purpose IN ('DIAGNOSTIC', 'PRACTICE', 'ASSESSMENT')
  );

CREATE INDEX questions_skill_purpose_active_idx
  ON questions(skill_id, question_purpose, difficulty, slug)
  WHERE status = 'ACTIVE';

ALTER TABLE practice_attempts DROP CONSTRAINT practice_attempts_kind_allowed;
ALTER TABLE practice_attempts
  ADD CONSTRAINT practice_attempts_kind_allowed CHECK (
    attempt_kind IN ('PRACTICE', 'ASSESSMENT', 'RETENTION_CHECK')
  );

ALTER TABLE learner_activity_events DROP CONSTRAINT learner_activity_events_type_allowed;
ALTER TABLE learner_activity_events
  ADD CONSTRAINT learner_activity_events_type_allowed CHECK (
    event_type IN (
      'LESSON_STARTED', 'LESSON_COMPLETED',
      'RESOURCE_STARTED', 'RESOURCE_COMPLETED', 'RESOURCE_SKIPPED',
      'PRACTICE_STARTED', 'PRACTICE_COMPLETED',
      'ASSESSMENT_STARTED', 'ASSESSMENT_COMPLETED', 'ASSESSMENT_SUBMITTED',
      'RETENTION_CHECK_STARTED', 'RETENTION_CHECK_COMPLETED',
      'QUIZ_STARTED', 'QUIZ_COMPLETED',
      'RECOMMENDATION_SHOWN', 'RECOMMENDATION_ACCEPTED',
      'RECOMMENDATION_REJECTED', 'RECOMMENDATION_COORDINATED',
      'PATH_REGENERATED'
    )
  );

CREATE TEMP TABLE final_skill_content (
  skill_slug TEXT PRIMARY KEY,
  definition TEXT NOT NULL,
  application TEXT NOT NULL,
  mastery_check TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO final_skill_content (skill_slug, definition, application, mastery_check) VALUES
  ('arrays', 'An array stores an ordered collection whose elements are accessed by index.', 'Use an array when position matters and indexed access or sequential traversal fits the problem.', 'A correct solution checks index bounds and explains the cost of access, insertion, deletion, and traversal.'),
  ('backtracking', 'Backtracking explores a decision tree by choosing, recursing, and undoing choices that cannot lead to a valid result.', 'Use backtracking for constrained search problems such as permutations, subsets, and board placement.', 'A correct design defines the state, valid choices, stopping condition, and the exact undo operation.'),
  ('basic-sorting', 'Basic sorting methods repeatedly compare or select elements to place them in order.', 'Use insertion sort for small or nearly sorted inputs and trace swaps or shifts to verify ordering.', 'A correct analysis distinguishes stability, in-place behavior, and the usual quadratic time cost.'),
  ('binary-search', 'Binary search repeatedly halves a sorted search interval by comparing its midpoint with the target.', 'Use binary search only when the search space is ordered and the interval update preserves the target invariant.', 'A correct implementation states the interval convention, updates both boundaries safely, and handles absence.'),
  ('binary-search-trees', 'A binary search tree orders keys so smaller keys are in the left subtree and larger keys are in the right subtree.', 'Use the ordering invariant to guide search, insertion, and deletion along one root-to-leaf path.', 'A correct analysis distinguishes balanced logarithmic height from worst-case linear height.'),
  ('binary-trees', 'A binary tree is a hierarchical structure in which each node has at most two children.', 'Model hierarchical relationships with nodes, child references, a root, and explicit empty subtrees.', 'A correct solution handles the empty tree, leaf nodes, internal nodes, and height or depth consistently.'),
  ('bit-manipulation', 'Bit manipulation uses AND, OR, XOR, shifts, and masks to inspect or change individual binary positions.', 'Use a mask to test, set, clear, or toggle a chosen bit without changing unrelated bits.', 'A correct explanation tracks binary positions and accounts for signed values and shift behavior.'),
  ('breadth-first-search', 'Breadth-first search explores a graph level by level using a queue.', 'Use BFS for unweighted shortest-path distance or when all nodes at depth d must be processed before depth d plus one.', 'A correct traversal marks discovery consistently so a node is not queued repeatedly.'),
  ('complexity-analysis', 'Complexity analysis describes how time or memory usage grows as input size increases.', 'Count dominant operations, discard constant factors, and state assumptions using asymptotic notation.', 'A correct analysis separates best, average, and worst cases when their behavior differs.'),
  ('control-flow', 'Control flow chooses which statements execute and how often through conditions and loops.', 'Use branches for mutually exclusive decisions and loops for repeated state changes with a clear termination condition.', 'A correct trace identifies the condition, executed branch, loop invariant, and final state.'),
  ('depth-first-search', 'Depth-first search follows one graph branch deeply before backtracking, using recursion or an explicit stack.', 'Use DFS for reachability, connected components, cycle reasoning, and dependency exploration.', 'A correct traversal tracks visited state and explains how recursion or stack order affects traversal order.'),
  ('divide-and-conquer', 'Divide and conquer splits a problem into smaller independent subproblems, solves them, and combines their results.', 'Use it when subproblems have the same form and their results can be combined efficiently.', 'A correct analysis identifies the base case, split size, combine cost, and resulting recurrence.'),
  ('dynamic-programming-foundations', 'Dynamic programming solves overlapping subproblems once and reuses their results when optimal substructure exists.', 'Define the state, transition, base cases, and evaluation order before implementing memoization or tabulation.', 'A correct solution proves that each state contains enough information and that transitions cover every valid choice.'),
  ('efficient-sorting', 'Efficient comparison sorting organizes elements in roughly O(n log n) time using structured splitting or a heap.', 'Choose merge sort for stable predictable performance or quicksort when partitioning is effective and constraints permit.', 'A correct comparison covers time, extra space, stability, and worst-case behavior.'),
  ('functions', 'A function packages a named operation with inputs, a body, and an optional returned result.', 'Use functions to separate responsibilities, reuse logic, and make inputs and outputs explicit.', 'A correct function has a clear contract, handles edge cases, and returns a value consistent with that contract.'),
  ('graph-fundamentals', 'A graph represents entities as vertices and relationships as edges, which may be directed or weighted.', 'Choose an adjacency list for sparse graphs and define whether direction, weights, or parallel edges matter.', 'A correct model states vertex and edge semantics and selects a representation that supports required operations.'),
  ('hashing', 'Hashing maps a key through a hash function into a table location for expected constant-time lookup.', 'Use a hash map for key-based membership or association while handling collisions and capacity growth.', 'A correct analysis distinguishes expected O(1) operations from collision-driven worst cases.'),
  ('heaps', 'A heap is a complete tree that maintains an order relation between every parent and its children.', 'Use a min-heap or max-heap when repeated access to the smallest or largest remaining item is required.', 'A correct implementation preserves both completeness and heap order after insertion or removal.'),
  ('knapsack-patterns', 'Knapsack patterns choose items under a capacity or budget while optimizing value.', 'Define a state over item position and remaining capacity, then compare taking and skipping each valid item.', 'A correct solution identifies whether items are reusable and chooses dimensions that avoid using an item incorrectly.'),
  ('linear-search', 'Linear search checks elements one by one until it finds the target or exhausts the collection.', 'Use it for small or unsorted data when no index or ordering supports a faster method.', 'A correct trace handles the first element, duplicates, and the not-found result in O(n) worst-case time.'),
  ('linked-lists', 'A linked list stores a sequence in nodes connected by references rather than contiguous indices.', 'Use a linked list when local insertion or removal through known node references matters more than indexed access.', 'A correct update preserves all required links and handles empty, head, tail, and single-node cases.'),
  ('longest-common-subsequence', 'Longest common subsequence finds the longest ordered sequence present in two sequences without requiring contiguous positions.', 'Use a two-dimensional dynamic-programming state over prefixes and compare matching versus skipped elements.', 'A correct recurrence distinguishes subsequences from substrings and initializes empty-prefix base cases.'),
  ('memoization', 'Memoization caches results of recursive subproblems so repeated states return immediately.', 'Use a cache keyed by the complete recursive state before expanding the same state again.', 'A correct solution separates base cases from cached cases and ensures the cache key uniquely identifies a subproblem.'),
  ('minimum-spanning-trees', 'A minimum spanning tree connects every vertex of a weighted undirected graph with minimum total edge weight and no cycles.', 'Use Kruskal with disjoint sets or Prim with a priority queue when the graph is connected and undirected.', 'A correct result has exactly n minus one edges, spans all vertices, contains no cycle, and has minimum total weight.'),
  ('programming-variables', 'A variable associates a name with a value that a program can read and, when allowed, update.', 'Choose descriptive names, initialize values before use, and trace assignments in execution order.', 'A correct trace distinguishes assigning a new value from comparing or merely reading the current value.'),
  ('queues', 'A queue processes elements in first-in, first-out order.', 'Use enqueue at the rear and dequeue at the front for scheduling, buffering, and breadth-first traversal.', 'A correct implementation handles empty-state checks and does not accidentally remove from the rear.'),
  ('recursion', 'Recursion solves a problem by calling the same operation on a smaller state until a base case stops expansion.', 'Use recursion when the input has a naturally recursive structure and every call makes measurable progress.', 'A correct design proves termination and combines the recursive result without losing or duplicating state.'),
  ('shortest-paths', 'Shortest-path algorithms find a minimum-cost route between vertices under stated edge-weight assumptions.', 'Use BFS for unweighted edges, Dijkstra for nonnegative weights, and other methods when negative edges are possible.', 'A correct choice states the weight assumptions and reconstructs or reports unreachable paths safely.'),
  ('sliding-window', 'A sliding window maintains information about a contiguous range while moving its boundaries.', 'Use it when a condition or aggregate over contiguous elements can be updated as items enter and leave the range.', 'A correct solution states when each boundary moves and keeps the window invariant true after every update.'),
  ('stacks', 'A stack processes elements in last-in, first-out order.', 'Use push and pop for nested structure, undo behavior, expression processing, or explicit depth-first traversal.', 'A correct implementation checks the empty state and explains why the most recently added item is removed first.'),
  ('strings', 'A string is an ordered sequence of characters with language-specific indexing and immutability behavior.', 'Trace character positions, boundaries, and encoding assumptions when searching, slicing, or transforming text.', 'A correct solution handles empty text, repeated characters, and the cost of creating modified strings.'),
  ('tabulation', 'Tabulation evaluates dynamic-programming states iteratively from known base cases toward the target.', 'Choose an order in which every dependency is already available before a state is computed.', 'A correct table defines its meaning, dimensions, initialization, transition, and final answer location.'),
  ('topological-sorting', 'Topological sorting orders a directed acyclic graph so every prerequisite appears before the item that depends on it.', 'Use indegrees with a queue or DFS finishing order to schedule dependency-constrained work.', 'A correct algorithm detects a cycle when not all vertices can be placed in the ordering.'),
  ('tree-traversal', 'Tree traversal visits every node in a defined order such as preorder, inorder, postorder, or level order.', 'Choose traversal order based on whether work must happen before children, between children, after children, or by depth.', 'A correct traversal handles an empty root and visits each reachable node exactly once.'),
  ('tries', 'A trie stores keys by sharing prefixes along character-labeled paths.', 'Use a trie for prefix search, autocomplete, or dictionary operations where common prefixes should share structure.', 'A correct implementation distinguishes a complete key marker from a path that is only a prefix.'),
  ('two-pointers', 'The two-pointers pattern moves two indices through data while preserving a relationship between them.', 'Use opposing or same-direction pointers when ordering or window invariants let the search space shrink safely.', 'A correct solution states why each pointer movement cannot discard a valid answer.');

-- Replace repeated template text with concept-specific, concise lesson content.
UPDATE learning_resources resource
SET learning_objectives = ARRAY[
      'Explain: ' || content.definition,
      'Apply: ' || content.application,
      'Verify: ' || content.mastery_check
    ],
    content_sections = jsonb_build_array(
      jsonb_build_object('heading', 'Concept', 'body', content.definition),
      jsonb_build_object('heading', 'Worked application', 'body', content.application),
      jsonb_build_object('heading', 'Key takeaways', 'body', content.mastery_check)
    ),
    updated_at = NOW()
FROM learning_resource_skills resource_skill
JOIN skills skill ON skill.id = resource_skill.skill_id
JOIN final_skill_content content ON content.skill_slug = skill.slug
WHERE resource.id = resource_skill.resource_id
  AND resource_skill.is_primary
  AND resource.resource_type = 'CONCEPT_GUIDE';

UPDATE learning_resources resource
SET content_sections = jsonb_build_array(
      jsonb_build_object('heading', '1. Frame the problem', 'body', content.definition || ' Identify the input, required output, and preconditions before choosing an approach.'),
      jsonb_build_object('heading', '2. Apply the idea', 'body', content.application || ' Trace a small concrete example and record each state change.'),
      jsonb_build_object('heading', '3. Verify the result', 'body', content.mastery_check || ' Check boundary cases and state the time and space costs.' )
    ),
    updated_at = NOW()
FROM learning_resource_skills resource_skill
JOIN skills skill ON skill.id = resource_skill.skill_id
JOIN final_skill_content content ON content.skill_slug = skill.slug
WHERE resource.id = resource_skill.resource_id
  AND resource_skill.is_primary
  AND resource.resource_type = 'WORKED_EXAMPLE';

-- Create three distinct, purpose-labelled questions for every active global
-- skill. Options are server-owned and each question has one validated answer.
INSERT INTO questions (
  id, skill_id, slug, prompt, question_type, difficulty, explanation, status,
  question_purpose
)
SELECT
  gen_random_uuid(),
  skill.id,
  'final-' || skill.slug || '-' || lower(purpose.question_purpose),
  CASE purpose.question_purpose
    WHEN 'DIAGNOSTIC' THEN 'Which description best matches ' || skill.name || '?'
    WHEN 'PRACTICE' THEN 'Which approach correctly applies ' || skill.name || ' in a solution?'
    ELSE 'Which statement demonstrates reliable understanding of ' || skill.name || '?'
  END,
  'SINGLE_CHOICE',
  skill.difficulty,
  CASE purpose.question_purpose
    WHEN 'DIAGNOSTIC' THEN content.definition
    WHEN 'PRACTICE' THEN content.application
    ELSE content.mastery_check
  END,
  'ACTIVE',
  purpose.question_purpose
FROM skills skill
JOIN final_skill_content content ON content.skill_slug = skill.slug
CROSS JOIN (VALUES ('DIAGNOSTIC'), ('PRACTICE'), ('ASSESSMENT')) AS purpose(question_purpose)
WHERE skill.is_active
ON CONFLICT (slug) DO NOTHING;

INSERT INTO question_options (id, question_id, option_key, content, is_correct)
SELECT gen_random_uuid(), question.id, option.option_key, option.content, option.is_correct
FROM questions question
JOIN skills skill ON skill.id = question.skill_id
JOIN final_skill_content content ON content.skill_slug = skill.slug
CROSS JOIN LATERAL (
  VALUES
    (
      'A'::char(1),
      CASE question.question_purpose
        WHEN 'DIAGNOSTIC' THEN content.definition
        WHEN 'PRACTICE' THEN content.application
        ELSE content.mastery_check
      END,
      TRUE
    ),
    ('B'::char(1), 'Ignore input constraints, skip boundary cases, and assume every operation has constant cost.', FALSE),
    ('C'::char(1), 'Replace the required state changes with random output so no invariant needs to be maintained.', FALSE),
    ('D'::char(1), 'Opening a lesson is sufficient proof of mastery, so no answer or result needs validation.', FALSE)
) AS option(option_key, content, is_correct)
WHERE question.slug = 'final-' || skill.slug || '-' || lower(question.question_purpose)
ON CONFLICT (question_id, option_key) DO NOTHING;

-- Course diagnostics use only diagnostic-purpose questions. Add the new
-- coverage after existing immutable attempts; submitted attempts are unchanged.
WITH additions AS (
  SELECT
    assessment.id AS assessment_id,
    question.id AS question_id,
    ROW_NUMBER() OVER (
      PARTITION BY assessment.id ORDER BY course_skill.module_id, course_skill.sequence, question.slug
    )::smallint AS offset_sequence
  FROM assessments assessment
  JOIN course_skills course_skill ON course_skill.course_id = assessment.course_id
  JOIN questions question
    ON question.skill_id = course_skill.skill_id
   AND question.status = 'ACTIVE'
   AND question.question_purpose = 'DIAGNOSTIC'
  WHERE assessment.status = 'ACTIVE'
    AND assessment.assessment_type = 'DIAGNOSTIC'
    AND NOT EXISTS (
      SELECT 1 FROM assessment_questions existing
      WHERE existing.assessment_id = assessment.id AND existing.question_id = question.id
    )
), maxima AS (
  SELECT assessment.id AS assessment_id, COALESCE(MAX(existing.sequence), 0)::smallint AS maximum_sequence
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

UPDATE assessments assessment
SET estimated_minutes = GREATEST(5, CEIL(question_totals.question_count * 0.75))::smallint,
    updated_at = NOW()
FROM (
  SELECT assessment_id, COUNT(*) AS question_count
  FROM assessment_questions
  GROUP BY assessment_id
) question_totals
WHERE assessment.id = question_totals.assessment_id
  AND assessment.status = 'ACTIVE';

UPDATE system_metadata
SET value = value || '{"contentCoverage":"complete-skill-workflows-v1"}'::jsonb,
    updated_at = NOW()
WHERE key = 'application';
