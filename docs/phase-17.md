# Phase 17 — Cross-Course and Goal-Aware Coordination

Phase 17 answers a learner-level question that Phase 16 deliberately left open: when several active
courses each have a valid Learn Next, which one should the learner act on now?

```text
independent active course paths
  → one graph-valid Learn Next per course
  → group matching global skill identities
  → optional shared-course utility
  → optional active-goal alignment
  → one explained coordinated Learn Next
```

## Preserved boundaries

- Every course enrollment still owns exactly one Phase 16 path snapshot.
- The coordinator never reads locked or upcoming items as competing recommendations.
- A goal never satisfies a prerequisite and never creates mastery.
- Course progress remains independent, and global mastery remains unique at
  `(learner_id, skill_id)`.
- `GET /enrollments/paths/coordination` is read-only.
- `POST /enrollments/paths/coordination/generate` is explicit and creates only missing paths.

## Coordination policy

For a skill recommended by one or more active course paths:

```text
base priority = maximum saved course-path priority for that skill
shared bonus  = 0.04 × min(additional active course contexts, 2)
goal bonus    = 0.06 × active-goal relevance, or zero without alignment
score         = min(1, base priority + shared bonus + goal bonus)
```

Only the learner's highest-priority active goal is considered. The returned explanation exposes each
component and names every independent course path represented by the skill. Deterministic tie-breaks
prefer revision urgency, goal relevance, base priority, wider course utility, then skill name.

## Visible learner experience

With two or more active enrollments, the dashboard replaces the single-course hero with an Across My
Courses panel. It shows:

- the coordinated next skill and plain-language reason;
- best course priority and final coordination score;
- shared-course and goal-alignment bonuses;
- the active goal, when present;
- each course-owned path and its independent score;
- honest waiting states for courses whose paths do not yet exist.

No frontend fallback creates a recommendation. If checked inference cannot generate a missing path,
the coordination request fails explicitly.

## Verification

Unit tests cover active-course filtering, shared-skill grouping, path ownership, bounded goal
alignment, ranking, and HTTP semantics. The PostgreSQL scenario registers a learner, selects a goal,
enrolls in two courses, creates both paths, coordinates them, verifies two persisted enrollment paths,
and verifies one `RECOMMENDATION_COORDINATED` activity event.

## Deferred

An existing Phase 16 path remains an immutable version-1 decision snapshot. Evidence-triggered
invalidation, stale-path status, regeneration, and path history are Phase 18 work.
