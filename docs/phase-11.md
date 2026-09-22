# Phase 11 — Candidate Generation and Evaluation Baselines

## Objective

Phase 11 converts live learner knowledge, retention, course context, and prerequisite analysis into a
dependency-valid candidate pool. It answers which skills are allowed to enter later recommendation
evaluation. It deliberately does not claim which skill will produce the greatest learning benefit.

Candidate generation is computed for one authenticated learner and one course enrollment. A learning
goal is optional context metadata; it is not required and does not own the pool. No candidate snapshot
or goal-owned path is persisted.

## Candidate boundary

`GET /enrollments/:enrollmentId/candidates` recursively collects the enrollment's course skills and
their supporting prerequisite ancestors, then classifies each skill from current backend data:

- `ELIGIBLE`: required prerequisite thresholds are satisfied and learning or revision is still useful.
- `LOCKED`: one or more required prerequisite thresholds are not satisfied. Every missing edge and
  shortfall remains visible.
- `EXCLUDED`: global mastery already meets the course target and no retention revision signal is active.

Eligible candidates have one of three purposes:

- `LEARN`: a course skill with a current knowledge gap or unknown evidence.
- `SUPPORTING_PREREQUISITE`: an ancestor needed for dependency-valid movement into the course.
- `REVISION`: previously demonstrated mastery whose real evidence-anchored retention is at risk.

Revision eligibility overrides strong-mastery exclusion. Unknown mastery stays `null`; it is never
converted to a fabricated zero or treated as satisfying a required prerequisite.

## Real source signals

Each candidate carries the live global mastery/confidence/evidence state, retention projection,
revision status, target and measurable gap, course/module placement, module progress, prerequisite
checks, resource/question availability, optional goal relevance, and real observed usage counts.
Course progress remains independent and resource completion still cannot create mastery.

## Evaluation baselines

Phase 11 exposes two deterministic orders over eligible candidates only:

1. **Highest Skill Gap** orders measurable mastery shortfalls first. Unknown mastery follows measurable
   gaps and remains unknown.
2. **Observed Popularity** orders real unique observed learners, immutable evidence count, activity
   count, and curriculum prevalence. It does not invent synthetic popularity.

The top-k overlap is an ordering diagnostic, not a quality score. Baselines never receive locked or
already-covered skills. The response and UI explicitly label them as evaluation baselines—not ML
predictions, benefit probabilities, Learn Next, or a personalized path.

## API and UI

- `GET /enrollments/:enrollmentId/candidates` returns the context, separated pools, source signals,
  explanations, baseline rankings, and a transparent summary.
- `/my-courses/:enrollmentId/candidates` is the Candidate Intelligence workspace. It presents the
  eligibility funnel, filterable skill cards, mastery targets, missing prerequisites, revision reasons,
  real popularity inputs, and side-by-side baseline orders.
- The course workspace links directly to its candidate pool.
- The learner dashboard shows the current enrollment's live pool summary while keeping later ranking
  and path generation visibly outside the implemented boundary.

## Persistence

Migration `0012_candidate_generation_baselines.sql` adds the evidence lookup index needed for observed
learner counts and records Phase 11 system metadata. Candidate pools remain derived views of the
current source of truth, so assessment, practice, retention, or prerequisite changes are reflected on
the next request without stale candidate ownership.

## Verified invariants

- Candidate generation works with an enrollment and no learning goal.
- Required prerequisite failures stay locked and never enter a baseline.
- Global strong mastery excludes a skill unless real retention makes revision due.
- A historical evidence anchor can turn a previously demonstrated skill into a revision candidate.
- Baseline rankings contain every and only eligible candidate.
- Popularity exposes observed database counts, not a hardcoded score.
- Candidate calculation does not alter mastery or independent course progress.

## Deferred

Phase 11 does not generate synthetic training data, engineer the ML feature contract, train or serve a
model, claim a Learn Next decision, persist personalized paths, or regenerate paths dynamically. Phase
12 should create the reproducible synthetic interaction dataset used to evaluate later ranking work.
