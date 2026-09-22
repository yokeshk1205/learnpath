# Phase 5 — Global learner skill model

## Outcome

Phase 5 gives each learner one reusable knowledge state for every relevant global skill. A skill can
appear in several courses and goals, but PostgreSQL stores exactly one record for that learner-skill
pair. This establishes the durable source of truth that later diagnostics, practice, retention, and
recommendation phases will update.

## Implemented data model

`learner_skill_mastery` tracks:

- `learner_id` and `skill_id`, protected by `UNIQUE (learner_id, skill_id)`
- nullable `mastery`, `confidence`, and `retention` scores in the range 0–1
- total, correct, and incorrect attempt counts
- last assessment and practice timestamps
- total time spent in seconds
- creation and update timestamps

Goal selection and course enrollment transactionally create missing learner-skill rows. Existing
Phase 4 data is backfilled by migration 0006. Conflict-safe inserts reuse an existing row whenever a
second course or goal references the same skill.

## Evidence semantics

The existence of a learner-skill row means the skill is relevant to the learner's selected context;
it does not mean the learner knows it. Until an evidence-producing assessment exists:

- mastery is `NULL`
- confidence is `NULL`
- retention is `NULL`
- attempts and time spent remain zero
- the API reports `UNASSESSED`

This preserves the distinction between unknown knowledge and measured zero mastery. Completing a
course module still does not change any learner-skill score.

## Authenticated API

- `GET /learner-skills` — returns the learner's Skill Passport

The response includes each global skill state, its active course and goal contexts, evidence status,
and a real summary: tracked skills, assessed skills, evidence coverage, cross-course reuse, attempts,
and averages calculated only from non-null evidence.

## Learner experience

- a real-data Global Skill Passport summary on the dashboard
- dedicated responsive `/skill-passport` experience
- separate mastery, confidence, and retention indicators
- explicit dashes and “Not assessed” states when evidence is absent
- search and evidence/cross-course filters
- real goal and enrolled-course context on every skill card
- cross-course badges derived from overlapping active enrollments
- course module skill chips linked to the same global passport states
- a visible `Progress ≠ knowledge` boundary with live linked-record counts

## Verification

- migration 0006 applied after migrations 0001–0005
- route tests verify authentication and nullable evidence serialization
- client tests verify the authenticated Skill Passport request
- PostgreSQL integration proves one record per learner/skill across a goal and two overlapping courses
- integration verifies module completion leaves global mastery `NULL`
- browser QA verified a 23-skill passport, four real cross-course skills, 0% honest evidence coverage,
  filtering, responsive layout, and 11/11 global state linkage inside a course workspace
- typecheck, lint, unit tests, integration tests, and production builds pass

## Deliberately deferred

- diagnostic questions, delivery, and per-skill scoring (Phase 6)
- evidence-based prerequisite satisfaction
- mastery/confidence update formulas (Phase 9)
- retention decay and revision logic (Phase 10)
- candidate generation, ML ranking, and personalized path generation
