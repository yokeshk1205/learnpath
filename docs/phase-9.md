# Phase 9 — Evidence-Driven Mastery, Confidence, and Evidence State

## Objective

Phase 9 makes the global learner model evolve from real performance evidence. It corrects the earlier
goal-first workflow while preserving every working Phase 1–8 boundary.

## Architecture amendment

- Learning goals are optional.
- Knowledge remains unique at `(learner_id, skill_id)`.
- Course and module progress remain enrollment-specific.
- Future personalized paths are owned by learner + course enrollment.
- There is no goal-level path spanning courses.
- Diagnostic, practice, Skill Passport, and prerequisite readiness work from an enrollment with no
  selected goal.
- Resource and lesson completion are activity, not mastery evidence.

## Implemented data model

Migration `0010_evidence_driven_learner_model.sql` adds:

- `learner_skill_mastery.evidence_state` with `UNKNOWN`, `ESTIMATED`, `ASSESSED`, and `VERIFIED`;
- nullable goal ownership and explicit course ownership for diagnostic assessments;
- enrollment ownership for course diagnostic attempts;
- real `practice_attempts`;
- immutable `skill_evidence` with source, score, correctness, difficulty, attempt/timing data, and
  before/after aggregate snapshots;
- course diagnostic templates built from the existing real question bank; and
- update/delete triggers that protect evidence history.

The migration is forward-only, preserves existing learner data, and backfills historical diagnostic
answers into the unified evidence ledger.

## Mastery and confidence policy

The dedicated mastery module clamps every value to `[0, 1]` and applies centrally configured source
weights. Difficulty adjustment rewards correct hard answers more strongly and treats incorrect easy
answers as stronger negative evidence without allowing a single practice item to dominate history.

Confidence is independent from mastery. It considers evidence count, source diversity, sessions,
consistency, difficulty coverage, and future retention evidence. Diagnostic-only confidence is capped.
Verification requires minimum observations, sessions, consistency, confidence, and either retention
evidence or sufficient source/session diversity. A high mastery score alone is never verified.

## Runtime workflow

```text
course enrollment (goal optional)
  → course diagnostic
  → immutable per-skill evidence
  → mastery + confidence + evidence-state update
  → global Skill Passport
  → prerequisite readiness
  → real practice question
  → new immutable evidence
  → same global skill update
  → readiness refresh in every course
```

Only the affected skill is updated. A cross-course knowledge change never changes another enrollment's
completion percentage.

## API and UI

- Diagnostics accept `enrollmentId` or `goalId` and prefer course context by default.
- Prerequisite analysis accepts the same optional contexts and exposes generic context readiness.
- `POST /practice/start`, `GET /practice/attempts/:id`, and
  `POST /practice/attempts/:id/submit` provide server-validated practice.
- `DELETE /catalog/learner-goals/:goalId` removes an optional goal while preserving history.
- The dashboard uses a course-first evidence-to-readiness loop.
- Course workspaces start diagnostics and expose skill practice.
- The Skill Passport distinguishes knowledge estimate from evidence strength and links to real
  practice.
- Diagnostic/practice result screens show state changes backed by PostgreSQL data.

## Verification coverage

The automated suite covers goal-optional enrollment/diagnostic/practice, diagnostic initialization,
resource-completion invariance, correct and incorrect updates, confidence growth, limited-evidence
verification safeguards, evidence immutability, unrelated-skill isolation, cross-course reuse,
course-progress isolation, readiness refresh, bounds, authentication, enrollment, diagnostics,
prerequisites, resources, activity, and graph integrity.

## Phase plan

- Phase 9 — Evidence-Driven Mastery, Confidence, and Evidence State
- Phase 10 — Retention and Forgetting
- Phase 11 — Candidate Skill Generation + Evaluation Baselines
- Phase 12 — Synthetic ML Dataset
- Phase 13 — Feature Engineering
- Phase 14 — ML Training and Evaluation
- Phase 15 — ML Inference Service
- Phase 16 — Course-Specific Personalized Path Generation
- Phase 17 — Multi-Course Coordination + Optional Goal Relevance
- Phase 18 — Path Versioning and Dynamic Regeneration
- Phase 19+ — continue the existing roadmap as appropriate

There is no separate goal-level personalized-path phase.

## Explicitly deferred

Retention decay, forgetting, candidate generation, evaluation baselines, synthetic ML data, feature
engineering, model training, inference, Learn Next, course-specific path generation, and dynamic path
regeneration are not part of Phase 9.
