# Phase 10 — Retention and Forgetting

## Objective

Phase 10 models how much previously demonstrated knowledge is likely accessible now without silently
erasing historical mastery. It turns elapsed time and real evidence quality into explicit retention
states and revision signals, while preserving the Phase 9 evidence boundary.

## Retention model

The baseline is the documented exponential forgetting function:

```text
retention = mastery × exp(-effective_lambda × days_since_evidence)
```

`RETENTION_BASE_LAMBDA` is configurable and defaults to `0.025`. Confidence and evidence volume
reduce the effective decay rate in a bounded, explainable way. The anchor is the newest immutable
performance-evidence timestamp. Resource or lesson completion may record study activity, but it does
not reset validated retention.

Mastery remains unchanged as time passes. Retention is recalculated from mastery and the evidence
anchor whenever the learner opens the Retention view or Skill Passport.

## States and revision eligibility

- `UNKNOWN`: no performance evidence exists.
- `STRONG`: retention is at least `0.75`.
- `MODERATE`: retention is at least `0.55`.
- `AT_RISK`: retention is at least `0.30` but below `0.55`.
- `CRITICAL`: retention is below `0.30`.

A revision signal requires both previously demonstrated mastery (`>= 0.65`) and an `AT_RISK` or
`CRITICAL` retention state. This prevents a never-learned skill from being mislabeled as forgotten.
Phase 10 exposes revision eligibility, not general candidate ranking or Learn Next.

## Persistence and auditability

Migration `0011_retention_and_forgetting.sql` activates the existing retention aggregate and adds:

- retention state, evidence anchor, and calculation timestamp on the global learner-skill state;
- before/after retention values and states on immutable skill evidence;
- `PRACTICE` versus `RETENTION_CHECK` attempt kinds; and
- retention-check activity event types.

The Phase 9 evidence update/delete triggers remain active. The migration temporarily suspends only
the update trigger for its controlled historical backfill and restores it inside the same transaction.

## Real retention checks

The existing practice pipeline accepts `mode: RETENTION_CHECK` only after performance evidence exists.
It selects a real skill-linked question, hides correct-answer metadata, validates the selected option
on the server, records immutable `RETENTION_CHECK` evidence, updates mastery and confidence centrally,
and resets the retention anchor to the new observation.

## API and UI

- `GET /retention` returns current per-skill retention, state, decay, evidence age, effective lambda,
  next review time, explanations, course contexts, and revision eligibility.
- `/retention` visualizes historical mastery against current retained knowledge and provides real
  delayed-recall actions.
- The dashboard exposes retention health and real revision-due skills.
- The Skill Passport shows mastery, confidence, retention, evidence state, and retention checks
  together without conflating them.
- Practice results show before/after retention and the refreshed evidence anchor.

## Verified invariants

- Time decay changes retention, not mastery.
- Higher confidence and repeated evidence slow decay.
- Passive learning activity does not reset the performance-evidence anchor.
- Low mastery alone does not create a revision-due signal.
- A real retention check produces immutable evidence and refreshes retention.
- Cross-course global skill identity and independent course progress remain unchanged.

## Deferred

Phase 10 does not implement general candidate generation, evaluation baselines, ML features, ML
ranking, Learn Next, personalized course paths, path versioning, or dynamic regeneration. Phase 11
should consume retention and revision eligibility when generating dependency-valid candidate sets.
