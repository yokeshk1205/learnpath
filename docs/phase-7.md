# Phase 7 — Prerequisite knowledge graph

## Outcome

Phase 7 turns the curriculum graph into learner-specific progression intelligence. The engine loads
the active goal, every required goal skill, all supporting prerequisite ancestors, and the learner's
global mastery state. It returns which skills are mastered, unlocked, or locked and explains every
decision with the exact current and required mastery values.

This phase does not generate candidates or rank recommendations. Required dependencies determine
valid eligibility and order; ML ranking remains unavailable until a real model is implemented.

## Eligibility policy

- `MASTERED`: global mastery meets the skill's goal target or supporting threshold.
- `UNLOCKED`: the skill is not yet mastered, but every required prerequisite threshold is satisfied.
- `LOCKED`: at least one required prerequisite is unknown or below its threshold.
- `RECOMMENDED` relationships are displayed but never lock the skill.
- unknown mastery is not zero, but it cannot satisfy a required threshold.
- mastery is read from the global `(learner_id, skill_id)` record and therefore applies across courses.

For every prerequisite check the API returns current mastery, confidence, required mastery, shortfall,
evidence state, relationship type, satisfaction state, and all course contexts that reuse the skill.

## Goal readiness

Goal readiness is transparent rather than predictive. Each goal skill contributes its capped mastery
progress toward its own target, weighted by the curriculum's goal relevance. The score answers “how
much of the defined target is currently evidenced?” It is not a benefit probability, heuristic rank,
or ML output.

## Dependency-valid order

Required edges are topologically evaluated. Every prerequisite appears in an earlier dependency layer
than the skill it gates. The service fails explicitly if a cycle reaches the application layer, while
migration `0008_prerequisite_graph_engine.sql` prevents new cycles at the database boundary.

## Authenticated API

`GET /prerequisites/analysis` uses the active learner goal. An optional validated `goalId` restricts
the request to that active context. The response contains:

- goal identity and analysis timestamp;
- goal readiness and evidence/prerequisite coverage;
- mastered, unlocked, locked, goal-skill, and supporting-skill counts;
- a dependency-valid skill order;
- learner-specific skill states with missing-prerequisite explanations;
- global course reuse and enrollment context.

## Product demonstration

The dashboard's personalized path now shows six explicit states:

`Learning Goal → Diagnostic → Skill Gaps → Prerequisites → Personalized Path → Learn Next`

After diagnostic evidence exists, Skill Gaps completes and Prerequisites becomes the visible current
stage. The dashboard summarizes readiness and immediate locks. `/prerequisites` provides the full
responsive dependency-layer map, status filters, search, mastery-versus-target bars, threshold checks,
course reuse badges, and an explicit boundary explaining that candidate ranking is not yet present.

## Verification

Unit tests cover required versus recommended behavior, cross-course recognition, readiness,
dependency ordering, and cycle detection. HTTP tests cover authentication, validation, and service
delegation. The PostgreSQL suite verifies a real diagnostic-to-graph lifecycle, valid ordering for
every required edge, structured locked states, global course reuse, absence of fabricated ML fields,
and database rejection of a reverse edge that would create a cycle.
