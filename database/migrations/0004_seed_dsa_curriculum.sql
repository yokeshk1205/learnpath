INSERT INTO domains (id, slug, name, description, icon, sort_order)
VALUES (
  '10000000-0000-4000-8000-000000000001',
  'data-structures-algorithms',
  'Data Structures & Algorithms',
  'Build durable problem-solving knowledge across programming foundations, data structures, algorithms, graphs, and dynamic programming.',
  'Network',
  1
);

INSERT INTO skills (
  id, domain_id, slug, name, description, category, difficulty, estimated_minutes
)
VALUES
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'programming-variables', 'Programming Variables', 'Represent, update, and reason about typed values and program state.', 'Foundations', 1, 45),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'control-flow', 'Control Flow', 'Use conditions and loops to express decision-making and repetition.', 'Foundations', 1, 60),
  ('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'functions', 'Functions', 'Decompose programs into reusable units with clear inputs and outputs.', 'Foundations', 1, 60),
  ('30000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 'complexity-analysis', 'Complexity Analysis', 'Compare time and space growth using asymptotic reasoning.', 'Foundations', 2, 90),
  ('30000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', 'arrays', 'Arrays', 'Index, traverse, update, and transform contiguous collections.', 'Arrays & Strings', 1, 90),
  ('30000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000001', 'strings', 'Strings', 'Apply indexing, parsing, comparison, and transformation techniques to text.', 'Arrays & Strings', 2, 90),
  ('30000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000001', 'two-pointers', 'Two Pointers', 'Coordinate moving indices to reduce nested iteration.', 'Arrays & Strings', 2, 105),
  ('30000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000001', 'sliding-window', 'Sliding Window', 'Maintain efficient state over contiguous ranges.', 'Arrays & Strings', 3, 120),
  ('30000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000001', 'recursion', 'Recursion', 'Define solutions through smaller instances with safe base cases.', 'Recursion & Backtracking', 2, 120),
  ('30000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000001', 'backtracking', 'Backtracking', 'Search decision spaces while undoing invalid partial choices.', 'Recursion & Backtracking', 4, 150),
  ('30000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000001', 'divide-and-conquer', 'Divide and Conquer', 'Split problems, solve subproblems, and combine their results.', 'Recursion & Backtracking', 3, 120),
  ('30000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000001', 'bit-manipulation', 'Bit Manipulation', 'Use bitwise representations and operations for compact computation.', 'Recursion & Backtracking', 3, 105),
  ('30000000-0000-4000-8000-000000000013', '10000000-0000-4000-8000-000000000001', 'linked-lists', 'Linked Lists', 'Navigate and mutate pointer-linked sequences safely.', 'Linear Structures', 2, 105),
  ('30000000-0000-4000-8000-000000000014', '10000000-0000-4000-8000-000000000001', 'stacks', 'Stacks', 'Apply last-in-first-out structure to parsing and state reversal.', 'Linear Structures', 2, 75),
  ('30000000-0000-4000-8000-000000000015', '10000000-0000-4000-8000-000000000001', 'queues', 'Queues', 'Apply first-in-first-out processing and deque variants.', 'Linear Structures', 2, 75),
  ('30000000-0000-4000-8000-000000000016', '10000000-0000-4000-8000-000000000001', 'hashing', 'Hashing', 'Design fast lookup and counting strategies with hash-based collections.', 'Linear Structures', 2, 105),
  ('30000000-0000-4000-8000-000000000017', '10000000-0000-4000-8000-000000000001', 'binary-trees', 'Binary Trees', 'Model hierarchical data with parent-child relationships.', 'Trees', 3, 120),
  ('30000000-0000-4000-8000-000000000018', '10000000-0000-4000-8000-000000000001', 'tree-traversal', 'Tree Traversal', 'Traverse trees using depth-first and breadth-first strategies.', 'Trees', 3, 120),
  ('30000000-0000-4000-8000-000000000019', '10000000-0000-4000-8000-000000000001', 'binary-search-trees', 'Binary Search Trees', 'Maintain ordered tree invariants for search and update operations.', 'Trees', 3, 120),
  ('30000000-0000-4000-8000-000000000020', '10000000-0000-4000-8000-000000000001', 'heaps', 'Heaps', 'Use priority ordering for incremental minimum or maximum access.', 'Trees', 3, 120),
  ('30000000-0000-4000-8000-000000000021', '10000000-0000-4000-8000-000000000001', 'tries', 'Tries', 'Represent prefixes for efficient string lookup and completion.', 'Trees', 4, 120),
  ('30000000-0000-4000-8000-000000000022', '10000000-0000-4000-8000-000000000001', 'linear-search', 'Linear Search', 'Locate values through sequential inspection and reason about its cost.', 'Sorting & Searching', 1, 45),
  ('30000000-0000-4000-8000-000000000023', '10000000-0000-4000-8000-000000000001', 'binary-search', 'Binary Search', 'Exploit monotonic structure to repeatedly halve a search space.', 'Sorting & Searching', 3, 120),
  ('30000000-0000-4000-8000-000000000024', '10000000-0000-4000-8000-000000000001', 'basic-sorting', 'Basic Sorting', 'Implement and compare elementary comparison-based sorts.', 'Sorting & Searching', 2, 90),
  ('30000000-0000-4000-8000-000000000025', '10000000-0000-4000-8000-000000000001', 'efficient-sorting', 'Efficient Sorting', 'Apply merge sort, quicksort, and stable sorting tradeoffs.', 'Sorting & Searching', 3, 135),
  ('30000000-0000-4000-8000-000000000026', '10000000-0000-4000-8000-000000000001', 'graph-fundamentals', 'Graph Fundamentals', 'Represent vertices, edges, direction, weight, and connectivity.', 'Graphs', 3, 120),
  ('30000000-0000-4000-8000-000000000027', '10000000-0000-4000-8000-000000000001', 'breadth-first-search', 'Breadth-First Search', 'Explore graph layers and unweighted shortest paths with a queue.', 'Graphs', 3, 120),
  ('30000000-0000-4000-8000-000000000028', '10000000-0000-4000-8000-000000000001', 'depth-first-search', 'Depth-First Search', 'Explore graph branches for connectivity, cycles, and components.', 'Graphs', 3, 120),
  ('30000000-0000-4000-8000-000000000029', '10000000-0000-4000-8000-000000000001', 'shortest-paths', 'Shortest Paths', 'Compute minimum-cost routes using BFS, Dijkstra, and relaxation.', 'Graphs', 4, 165),
  ('30000000-0000-4000-8000-000000000030', '10000000-0000-4000-8000-000000000001', 'minimum-spanning-trees', 'Minimum Spanning Trees', 'Connect all vertices with minimum total edge cost.', 'Graphs', 4, 150),
  ('30000000-0000-4000-8000-000000000031', '10000000-0000-4000-8000-000000000001', 'topological-sorting', 'Topological Sorting', 'Order directed acyclic dependencies and detect cycles.', 'Graphs', 4, 135),
  ('30000000-0000-4000-8000-000000000032', '10000000-0000-4000-8000-000000000001', 'dynamic-programming-foundations', 'Dynamic Programming Foundations', 'Recognize overlapping subproblems and optimal substructure.', 'Dynamic Programming', 4, 150),
  ('30000000-0000-4000-8000-000000000033', '10000000-0000-4000-8000-000000000001', 'memoization', 'Memoization', 'Cache recursive subproblem results to remove repeated work.', 'Dynamic Programming', 4, 135),
  ('30000000-0000-4000-8000-000000000034', '10000000-0000-4000-8000-000000000001', 'tabulation', 'Tabulation', 'Build bottom-up dynamic programming states in dependency order.', 'Dynamic Programming', 4, 135),
  ('30000000-0000-4000-8000-000000000035', '10000000-0000-4000-8000-000000000001', 'knapsack-patterns', 'Knapsack Patterns', 'Model choose-or-skip decisions under capacity constraints.', 'Dynamic Programming', 5, 180),
  ('30000000-0000-4000-8000-000000000036', '10000000-0000-4000-8000-000000000001', 'longest-common-subsequence', 'Longest Common Subsequence', 'Apply two-dimensional DP to sequence alignment problems.', 'Dynamic Programming', 5, 180);

WITH edge(skill_slug, prerequisite_slug, mastery, relationship_type) AS (
  VALUES
    ('control-flow', 'programming-variables', 0.60, 'REQUIRED'),
    ('functions', 'programming-variables', 0.60, 'REQUIRED'),
    ('functions', 'control-flow', 0.60, 'RECOMMENDED'),
    ('complexity-analysis', 'control-flow', 0.60, 'REQUIRED'),
    ('complexity-analysis', 'functions', 0.60, 'RECOMMENDED'),
    ('arrays', 'control-flow', 0.60, 'REQUIRED'),
    ('arrays', 'functions', 0.60, 'RECOMMENDED'),
    ('strings', 'arrays', 0.65, 'REQUIRED'),
    ('strings', 'functions', 0.60, 'REQUIRED'),
    ('two-pointers', 'arrays', 0.70, 'REQUIRED'),
    ('two-pointers', 'strings', 0.65, 'RECOMMENDED'),
    ('two-pointers', 'complexity-analysis', 0.60, 'REQUIRED'),
    ('sliding-window', 'arrays', 0.70, 'REQUIRED'),
    ('sliding-window', 'two-pointers', 0.65, 'REQUIRED'),
    ('sliding-window', 'complexity-analysis', 0.65, 'REQUIRED'),
    ('recursion', 'functions', 0.70, 'REQUIRED'),
    ('recursion', 'control-flow', 0.65, 'REQUIRED'),
    ('backtracking', 'recursion', 0.75, 'REQUIRED'),
    ('backtracking', 'arrays', 0.65, 'REQUIRED'),
    ('backtracking', 'complexity-analysis', 0.60, 'RECOMMENDED'),
    ('divide-and-conquer', 'recursion', 0.70, 'REQUIRED'),
    ('divide-and-conquer', 'complexity-analysis', 0.65, 'REQUIRED'),
    ('bit-manipulation', 'programming-variables', 0.65, 'REQUIRED'),
    ('bit-manipulation', 'control-flow', 0.60, 'REQUIRED'),
    ('linked-lists', 'functions', 0.65, 'REQUIRED'),
    ('linked-lists', 'complexity-analysis', 0.60, 'RECOMMENDED'),
    ('stacks', 'arrays', 0.65, 'REQUIRED'),
    ('stacks', 'linked-lists', 0.60, 'RECOMMENDED'),
    ('queues', 'arrays', 0.65, 'REQUIRED'),
    ('queues', 'linked-lists', 0.60, 'RECOMMENDED'),
    ('hashing', 'arrays', 0.70, 'REQUIRED'),
    ('hashing', 'strings', 0.60, 'RECOMMENDED'),
    ('hashing', 'complexity-analysis', 0.60, 'REQUIRED'),
    ('binary-trees', 'recursion', 0.70, 'REQUIRED'),
    ('binary-trees', 'linked-lists', 0.65, 'REQUIRED'),
    ('tree-traversal', 'binary-trees', 0.70, 'REQUIRED'),
    ('tree-traversal', 'recursion', 0.70, 'REQUIRED'),
    ('tree-traversal', 'queues', 0.60, 'RECOMMENDED'),
    ('binary-search-trees', 'binary-trees', 0.70, 'REQUIRED'),
    ('binary-search-trees', 'tree-traversal', 0.70, 'REQUIRED'),
    ('heaps', 'binary-trees', 0.65, 'REQUIRED'),
    ('heaps', 'arrays', 0.70, 'REQUIRED'),
    ('tries', 'binary-trees', 0.60, 'RECOMMENDED'),
    ('tries', 'strings', 0.70, 'REQUIRED'),
    ('linear-search', 'arrays', 0.60, 'REQUIRED'),
    ('linear-search', 'complexity-analysis', 0.55, 'RECOMMENDED'),
    ('binary-search', 'arrays', 0.70, 'REQUIRED'),
    ('binary-search', 'complexity-analysis', 0.65, 'REQUIRED'),
    ('binary-search', 'divide-and-conquer', 0.60, 'RECOMMENDED'),
    ('basic-sorting', 'arrays', 0.65, 'REQUIRED'),
    ('basic-sorting', 'complexity-analysis', 0.60, 'REQUIRED'),
    ('efficient-sorting', 'arrays', 0.70, 'REQUIRED'),
    ('efficient-sorting', 'complexity-analysis', 0.70, 'REQUIRED'),
    ('efficient-sorting', 'divide-and-conquer', 0.65, 'REQUIRED'),
    ('graph-fundamentals', 'hashing', 0.65, 'REQUIRED'),
    ('graph-fundamentals', 'queues', 0.60, 'RECOMMENDED'),
    ('graph-fundamentals', 'complexity-analysis', 0.70, 'REQUIRED'),
    ('breadth-first-search', 'graph-fundamentals', 0.70, 'REQUIRED'),
    ('breadth-first-search', 'queues', 0.70, 'REQUIRED'),
    ('breadth-first-search', 'hashing', 0.65, 'REQUIRED'),
    ('depth-first-search', 'graph-fundamentals', 0.70, 'REQUIRED'),
    ('depth-first-search', 'stacks', 0.65, 'REQUIRED'),
    ('depth-first-search', 'recursion', 0.70, 'REQUIRED'),
    ('shortest-paths', 'graph-fundamentals', 0.75, 'REQUIRED'),
    ('shortest-paths', 'breadth-first-search', 0.70, 'REQUIRED'),
    ('shortest-paths', 'heaps', 0.65, 'REQUIRED'),
    ('minimum-spanning-trees', 'graph-fundamentals', 0.75, 'REQUIRED'),
    ('minimum-spanning-trees', 'heaps', 0.65, 'REQUIRED'),
    ('minimum-spanning-trees', 'efficient-sorting', 0.65, 'REQUIRED'),
    ('topological-sorting', 'graph-fundamentals', 0.75, 'REQUIRED'),
    ('topological-sorting', 'depth-first-search', 0.70, 'REQUIRED'),
    ('topological-sorting', 'queues', 0.65, 'REQUIRED'),
    ('dynamic-programming-foundations', 'recursion', 0.75, 'REQUIRED'),
    ('dynamic-programming-foundations', 'complexity-analysis', 0.70, 'REQUIRED'),
    ('dynamic-programming-foundations', 'arrays', 0.70, 'REQUIRED'),
    ('memoization', 'dynamic-programming-foundations', 0.70, 'REQUIRED'),
    ('memoization', 'recursion', 0.75, 'REQUIRED'),
    ('memoization', 'hashing', 0.65, 'REQUIRED'),
    ('tabulation', 'dynamic-programming-foundations', 0.70, 'REQUIRED'),
    ('tabulation', 'arrays', 0.70, 'REQUIRED'),
    ('knapsack-patterns', 'memoization', 0.75, 'REQUIRED'),
    ('knapsack-patterns', 'tabulation', 0.75, 'REQUIRED'),
    ('knapsack-patterns', 'complexity-analysis', 0.70, 'REQUIRED'),
    ('longest-common-subsequence', 'strings', 0.75, 'REQUIRED'),
    ('longest-common-subsequence', 'memoization', 0.75, 'REQUIRED'),
    ('longest-common-subsequence', 'tabulation', 0.75, 'REQUIRED')
)
INSERT INTO skill_prerequisites (
  skill_id, prerequisite_skill_id, required_mastery, relationship_type
)
SELECT skill.id, prerequisite.id, edge.mastery, edge.relationship_type
FROM edge
JOIN skills skill ON skill.slug = edge.skill_slug
JOIN skills prerequisite ON prerequisite.slug = edge.prerequisite_slug;

INSERT INTO learning_goals (
  id, domain_id, slug, name, description, outcome, level, estimated_weeks
)
VALUES
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'dsa-interview-preparation', 'DSA Interview Preparation', 'Build the reusable patterns needed for technical interviews, from arrays through graph and dynamic programming problems.', 'Solve and explain common interview problems with valid complexity analysis and prerequisite-aware progression.', 'INTERMEDIATE', 16),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'competitive-programming-foundations', 'Competitive Programming Foundations', 'Develop fast pattern recognition across algorithms, implementation, and advanced problem decomposition.', 'Select and implement efficient algorithms under time and memory constraints.', 'ADVANCED', 20),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'backend-problem-solving', 'Backend Problem-Solving', 'Strengthen the data-structure and algorithm skills most relevant to reliable backend systems.', 'Choose appropriate collections, queues, graphs, and search strategies for backend workloads.', 'BEGINNER', 10);

INSERT INTO goal_skills (goal_id, skill_id, relevance, required_mastery, is_core)
SELECT
  '20000000-0000-4000-8000-000000000001',
  id,
  CASE
    WHEN slug IN ('arrays', 'strings', 'hashing', 'binary-search', 'tree-traversal', 'breadth-first-search', 'depth-first-search', 'dynamic-programming-foundations') THEN 1.000
    WHEN difficulty >= 4 THEN 0.850
    ELSE 0.750
  END,
  CASE WHEN difficulty >= 4 THEN 0.700 ELSE 0.750 END,
  slug NOT IN ('programming-variables', 'control-flow', 'linear-search')
FROM skills
WHERE slug NOT IN ('programming-variables');

INSERT INTO goal_skills (goal_id, skill_id, relevance, required_mastery, is_core)
SELECT
  '20000000-0000-4000-8000-000000000002',
  id,
  CASE WHEN difficulty >= 4 THEN 1.000 ELSE 0.800 END,
  CASE WHEN difficulty >= 4 THEN 0.750 ELSE 0.800 END,
  TRUE
FROM skills
WHERE slug NOT IN ('programming-variables', 'linear-search', 'tries');

WITH required(slug, relevance, mastery) AS (
  VALUES
    ('complexity-analysis', 0.900, 0.700),
    ('arrays', 0.850, 0.700),
    ('strings', 0.750, 0.650),
    ('stacks', 0.700, 0.650),
    ('queues', 0.950, 0.750),
    ('hashing', 1.000, 0.800),
    ('binary-trees', 0.650, 0.650),
    ('heaps', 0.850, 0.700),
    ('binary-search', 0.750, 0.700),
    ('graph-fundamentals', 0.900, 0.700),
    ('breadth-first-search', 0.850, 0.700),
    ('topological-sorting', 0.800, 0.700)
)
INSERT INTO goal_skills (goal_id, skill_id, relevance, required_mastery, is_core)
SELECT '20000000-0000-4000-8000-000000000003', skills.id, required.relevance, required.mastery, TRUE
FROM required
JOIN skills ON skills.slug = required.slug;

INSERT INTO courses (
  id, domain_id, slug, name, description, level, estimated_hours
)
VALUES
  ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'programming-fundamentals', 'Programming Fundamentals', 'Build the programming and reasoning foundation reused throughout every later course.', 'BEGINNER', 18),
  ('40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'data-structures', 'Data Structures', 'Learn how linear, hashed, and hierarchical structures organize data and enable efficient operations.', 'INTERMEDIATE', 28),
  ('40000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'algorithms', 'Algorithms', 'Apply searching, sorting, graph, and dynamic programming methods with rigorous complexity analysis.', 'ADVANCED', 42),
  ('40000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 'interview-patterns', 'Interview Problem Patterns', 'Combine globally learned skills into reusable technical-interview problem patterns.', 'INTERMEDIATE', 30);

INSERT INTO modules (id, course_id, slug, name, description, sequence)
VALUES
  ('50000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'building-blocks', 'Programming Building Blocks', 'Variables, control flow, functions, and complexity reasoning.', 1),
  ('50000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001', 'working-with-data', 'Working with Data', 'Arrays, strings, and compact representations.', 2),
  ('50000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000001', 'recursive-thinking', 'Recursive Thinking', 'Recursion and divide-and-conquer problem decomposition.', 3),
  ('50000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000002', 'linear-structures', 'Linear Structures', 'Linked lists, stacks, queues, and hashing.', 1),
  ('50000000-0000-4000-8000-000000000005', '40000000-0000-4000-8000-000000000002', 'tree-structures', 'Tree Structures', 'Binary trees, traversals, ordered trees, heaps, and tries.', 2),
  ('50000000-0000-4000-8000-000000000006', '40000000-0000-4000-8000-000000000002', 'structure-applications', 'Structure Applications', 'Apply global array, string, recursion, and complexity knowledge to structure design.', 3),
  ('50000000-0000-4000-8000-000000000007', '40000000-0000-4000-8000-000000000003', 'searching-sorting', 'Searching & Sorting', 'Search-space reduction and efficient ordering algorithms.', 1),
  ('50000000-0000-4000-8000-000000000008', '40000000-0000-4000-8000-000000000003', 'graph-algorithms', 'Graph Algorithms', 'Traversal, shortest paths, spanning trees, and dependency ordering.', 2),
  ('50000000-0000-4000-8000-000000000009', '40000000-0000-4000-8000-000000000003', 'dynamic-programming', 'Dynamic Programming', 'Top-down and bottom-up optimization patterns.', 3),
  ('50000000-0000-4000-8000-000000000010', '40000000-0000-4000-8000-000000000004', 'array-patterns', 'Array & String Patterns', 'Two pointers, windows, hashing, and search patterns.', 1),
  ('50000000-0000-4000-8000-000000000011', '40000000-0000-4000-8000-000000000004', 'recursive-tree-patterns', 'Recursive & Tree Patterns', 'Backtracking and hierarchical interview patterns.', 2),
  ('50000000-0000-4000-8000-000000000012', '40000000-0000-4000-8000-000000000004', 'advanced-patterns', 'Advanced Synthesis', 'Graph and dynamic programming patterns that combine earlier knowledge.', 3);

WITH mapping(course_id, module_id, skill_slug, sequence, is_required) AS (
  VALUES
    ('40000000-0000-4000-8000-000000000001'::UUID, '50000000-0000-4000-8000-000000000001'::UUID, 'programming-variables', 1, TRUE),
    ('40000000-0000-4000-8000-000000000001'::UUID, '50000000-0000-4000-8000-000000000001'::UUID, 'control-flow', 2, TRUE),
    ('40000000-0000-4000-8000-000000000001'::UUID, '50000000-0000-4000-8000-000000000001'::UUID, 'functions', 3, TRUE),
    ('40000000-0000-4000-8000-000000000001'::UUID, '50000000-0000-4000-8000-000000000001'::UUID, 'complexity-analysis', 4, TRUE),
    ('40000000-0000-4000-8000-000000000001'::UUID, '50000000-0000-4000-8000-000000000002'::UUID, 'arrays', 1, TRUE),
    ('40000000-0000-4000-8000-000000000001'::UUID, '50000000-0000-4000-8000-000000000002'::UUID, 'strings', 2, TRUE),
    ('40000000-0000-4000-8000-000000000001'::UUID, '50000000-0000-4000-8000-000000000002'::UUID, 'bit-manipulation', 3, FALSE),
    ('40000000-0000-4000-8000-000000000001'::UUID, '50000000-0000-4000-8000-000000000003'::UUID, 'recursion', 1, TRUE),
    ('40000000-0000-4000-8000-000000000001'::UUID, '50000000-0000-4000-8000-000000000003'::UUID, 'divide-and-conquer', 2, TRUE),
    ('40000000-0000-4000-8000-000000000002'::UUID, '50000000-0000-4000-8000-000000000004'::UUID, 'linked-lists', 1, TRUE),
    ('40000000-0000-4000-8000-000000000002'::UUID, '50000000-0000-4000-8000-000000000004'::UUID, 'stacks', 2, TRUE),
    ('40000000-0000-4000-8000-000000000002'::UUID, '50000000-0000-4000-8000-000000000004'::UUID, 'queues', 3, TRUE),
    ('40000000-0000-4000-8000-000000000002'::UUID, '50000000-0000-4000-8000-000000000004'::UUID, 'hashing', 4, TRUE),
    ('40000000-0000-4000-8000-000000000002'::UUID, '50000000-0000-4000-8000-000000000005'::UUID, 'binary-trees', 1, TRUE),
    ('40000000-0000-4000-8000-000000000002'::UUID, '50000000-0000-4000-8000-000000000005'::UUID, 'tree-traversal', 2, TRUE),
    ('40000000-0000-4000-8000-000000000002'::UUID, '50000000-0000-4000-8000-000000000005'::UUID, 'binary-search-trees', 3, TRUE),
    ('40000000-0000-4000-8000-000000000002'::UUID, '50000000-0000-4000-8000-000000000005'::UUID, 'heaps', 4, TRUE),
    ('40000000-0000-4000-8000-000000000002'::UUID, '50000000-0000-4000-8000-000000000005'::UUID, 'tries', 5, FALSE),
    ('40000000-0000-4000-8000-000000000002'::UUID, '50000000-0000-4000-8000-000000000006'::UUID, 'arrays', 1, TRUE),
    ('40000000-0000-4000-8000-000000000002'::UUID, '50000000-0000-4000-8000-000000000006'::UUID, 'recursion', 2, TRUE),
    ('40000000-0000-4000-8000-000000000003'::UUID, '50000000-0000-4000-8000-000000000007'::UUID, 'linear-search', 1, TRUE),
    ('40000000-0000-4000-8000-000000000003'::UUID, '50000000-0000-4000-8000-000000000007'::UUID, 'binary-search', 2, TRUE),
    ('40000000-0000-4000-8000-000000000003'::UUID, '50000000-0000-4000-8000-000000000007'::UUID, 'basic-sorting', 3, TRUE),
    ('40000000-0000-4000-8000-000000000003'::UUID, '50000000-0000-4000-8000-000000000007'::UUID, 'efficient-sorting', 4, TRUE),
    ('40000000-0000-4000-8000-000000000003'::UUID, '50000000-0000-4000-8000-000000000008'::UUID, 'graph-fundamentals', 1, TRUE),
    ('40000000-0000-4000-8000-000000000003'::UUID, '50000000-0000-4000-8000-000000000008'::UUID, 'breadth-first-search', 2, TRUE),
    ('40000000-0000-4000-8000-000000000003'::UUID, '50000000-0000-4000-8000-000000000008'::UUID, 'depth-first-search', 3, TRUE),
    ('40000000-0000-4000-8000-000000000003'::UUID, '50000000-0000-4000-8000-000000000008'::UUID, 'shortest-paths', 4, TRUE),
    ('40000000-0000-4000-8000-000000000003'::UUID, '50000000-0000-4000-8000-000000000008'::UUID, 'minimum-spanning-trees', 5, TRUE),
    ('40000000-0000-4000-8000-000000000003'::UUID, '50000000-0000-4000-8000-000000000008'::UUID, 'topological-sorting', 6, TRUE),
    ('40000000-0000-4000-8000-000000000003'::UUID, '50000000-0000-4000-8000-000000000009'::UUID, 'dynamic-programming-foundations', 1, TRUE),
    ('40000000-0000-4000-8000-000000000003'::UUID, '50000000-0000-4000-8000-000000000009'::UUID, 'memoization', 2, TRUE),
    ('40000000-0000-4000-8000-000000000003'::UUID, '50000000-0000-4000-8000-000000000009'::UUID, 'tabulation', 3, TRUE),
    ('40000000-0000-4000-8000-000000000003'::UUID, '50000000-0000-4000-8000-000000000009'::UUID, 'knapsack-patterns', 4, TRUE),
    ('40000000-0000-4000-8000-000000000003'::UUID, '50000000-0000-4000-8000-000000000009'::UUID, 'longest-common-subsequence', 5, TRUE),
    ('40000000-0000-4000-8000-000000000004'::UUID, '50000000-0000-4000-8000-000000000010'::UUID, 'arrays', 1, TRUE),
    ('40000000-0000-4000-8000-000000000004'::UUID, '50000000-0000-4000-8000-000000000010'::UUID, 'strings', 2, TRUE),
    ('40000000-0000-4000-8000-000000000004'::UUID, '50000000-0000-4000-8000-000000000010'::UUID, 'two-pointers', 3, TRUE),
    ('40000000-0000-4000-8000-000000000004'::UUID, '50000000-0000-4000-8000-000000000010'::UUID, 'sliding-window', 4, TRUE),
    ('40000000-0000-4000-8000-000000000004'::UUID, '50000000-0000-4000-8000-000000000010'::UUID, 'hashing', 5, TRUE),
    ('40000000-0000-4000-8000-000000000004'::UUID, '50000000-0000-4000-8000-000000000011'::UUID, 'backtracking', 1, TRUE),
    ('40000000-0000-4000-8000-000000000004'::UUID, '50000000-0000-4000-8000-000000000011'::UUID, 'tree-traversal', 2, TRUE),
    ('40000000-0000-4000-8000-000000000004'::UUID, '50000000-0000-4000-8000-000000000011'::UUID, 'binary-search-trees', 3, TRUE),
    ('40000000-0000-4000-8000-000000000004'::UUID, '50000000-0000-4000-8000-000000000012'::UUID, 'binary-search', 1, TRUE),
    ('40000000-0000-4000-8000-000000000004'::UUID, '50000000-0000-4000-8000-000000000012'::UUID, 'shortest-paths', 2, TRUE),
    ('40000000-0000-4000-8000-000000000004'::UUID, '50000000-0000-4000-8000-000000000012'::UUID, 'topological-sorting', 3, TRUE),
    ('40000000-0000-4000-8000-000000000004'::UUID, '50000000-0000-4000-8000-000000000012'::UUID, 'knapsack-patterns', 4, TRUE),
    ('40000000-0000-4000-8000-000000000004'::UUID, '50000000-0000-4000-8000-000000000012'::UUID, 'longest-common-subsequence', 5, TRUE)
)
INSERT INTO course_skills (course_id, module_id, skill_id, sequence, is_required)
SELECT mapping.course_id, mapping.module_id, skills.id, mapping.sequence, mapping.is_required
FROM mapping
JOIN skills ON skills.slug = mapping.skill_slug;

