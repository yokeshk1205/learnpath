# Phase 3 — Global curriculum and prerequisite graph

## Outcome

Phase 3 establishes the real curriculum substrate needed to determine what a learner should learn
next. The same global skill record is reused by goals, courses, and prerequisite edges, so future
mastery evidence can transfer across course boundaries.

## Implemented data model

- domains and globally identifiable skills
- learning goals with relevance and required-mastery mappings
- courses, ordered modules, and course-to-skill mappings
- normalized required/recommended prerequisite edges with mastery thresholds
- persisted learner goal selection with one active current goal and paused history
- deterministic DSA demonstration data: 36 skills, 8 categories, 86 prerequisite edges, 3 goals,
  4 courses, and 12 modules

The seed deliberately maps skills such as Arrays, Strings, Hashing, Recursion, Binary Search, and
Topological Sorting into multiple courses without cloning their identity.

## Authenticated APIs

- `GET /catalog/overview` — catalog counts, domains, goals, courses, and learner goal state
- `GET /catalog/goals/:goalId` — goal skills, real prerequisite edges, and course context
- `GET /catalog/learner-goals` — active and historical learner goals
- `POST /catalog/learner-goals` — select/switch the current goal transactionally

## Learner experience

The protected dashboard now presents:

- a current-goal hero backed by PostgreSQL
- the adaptive pipeline as the primary visual hierarchy
- honest locked states for diagnostic, gaps, path generation, and Learn Next
- goal cards with real skill counts and persisted selection
- a horizontally navigable prerequisite skill map
- direct prerequisite and course-reuse counts per skill
- visible cross-course knowledge reuse examples
- real course/module/skill totals
- loading, failure, no-goal, and unassessed-evidence states

No mastery, confidence, retention, gap, ML score, or recommendation value is fabricated. The UI says
`Not assessed`, `No evidence`, or `Pending diagnostic` until later phases provide those facts.

## Verification

- migrations applied successfully to PostgreSQL 18
- seed counts and uniqueness checked directly in PostgreSQL
- API unit tests cover authorization, validation, overview, and goal selection
- PostgreSQL integration tests cover graph queries, cross-course reuse, goal persistence, and current
  goal switching
- frontend tests cover authenticated catalog requests and persisted goal selection
- repository typecheck, lint, unit tests, production build, and ML tests remain green
- browser QA covered landing-page contrast, authentication, unloaded evidence, persisted goal refresh,
  real skill graph rendering, and responsive learner-path layouts

## Deliberately deferred

- course enrollment and independent progress (Phase 4)
- global learner mastery/confidence records (Phase 5)
- diagnostic question delivery and evidence capture (Phase 6)
- prerequisite eligibility decisions based on learner mastery
- ML candidate ranking and generated personalized paths

The prerequisite graph was established early because the user made it a core priority, but Phase 3
does not yet claim learner-specific locked/unlocked decisions.
