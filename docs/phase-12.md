# Phase 12 — Synthetic ML Dataset

## Objective

Phase 12 creates a reproducible learner-skill interaction dataset for future model research without
mixing simulated rows into LearnPath's real learner evidence. The generator models causal
relationships and bounded noise first, produces simulated outcomes second, and derives the
`beneficial` label from a documented formula last.

Every row and every public summary is explicitly marked `SYNTHETIC / SIMULATED DATA`.

## Curriculum provenance

`scripts/export-ml-curriculum.ts` reads only active curriculum tables: courses, modules, course-skill
mappings, global skills, and prerequisite edges. It never queries users, enrollments, mastery,
activity, attempts, or evidence. The stable `curriculum_v1.json` snapshot contains:

- 36 active skills;
- 86 prerequisite relationships; and
- four real course contexts.

Its SHA-256 is recorded in the dataset manifest so regenerated data can be tied to the exact graph.

## Reproducible simulator

The default `SimulationConfig` is centrally defined and versioned:

- fixed random seed `42`;
- 1,000 simulated learners;
- 20 interactions per learner;
- 20,000 total interactions;
- dataset version `synthetic-interactions-v2`; and
- generator version `learner-skill-simulator-v2`.

Version 2 preserves the Phase 12 simulation policy while exposing learner interaction sequence,
simulated elapsed days, prerequisite satisfaction ratio, and minimum prerequisite mastery as
decision-time inputs required by the Phase 13 contract.

Synthetic identifiers such as `sim-learner-000001` are deterministic and contain no user data. CSV
serialization is stable, and the current artifact checksum is recorded in `manifest.json`.

## Modeled relationships

The simulator combines:

- learner starting level, pace, consistency, ability, engagement, and practice propensity;
- current mastery, confidence, evidence age, retention, and prerequisite readiness;
- skill difficulty, expected time, course context, and candidate purpose;
- engagement, practice attempts, time spent, completion, and assessment performance; and
- guessing, disengagement, skipped content, inconsistent performance, difficulty mismatch, and
  bounded outcome noise.

Candidates are prerequisite-valid within a course context and may include recursive supporting
prerequisites, matching the Phase 11 boundary. State changes across sequential interactions so later
rows reflect simulated learning and forgetting rather than independent random samples.

The manifest calculates actual generated-data relationships. It does not hardcode favorable metrics.
Generation tests verify that engagement is positively related to completion and mastery gain,
practice is positively related to assessment improvement, prerequisite mastery is positively related
to later performance, and absolute difficulty mismatch is negatively related to mastery gain.

## Deterministic beneficial outcome

The versioned `benefit-v1` policy is:

```text
benefit_score =
  0.40 × mastery_gain
  + 0.25 × completion_rate
  + 0.25 × assessment_improvement
  + 0.10 × learner_feedback
```

`beneficial` is true when `benefit_score >= 0.27`. Outcomes contain realistic randomness; the label
does not. Manifest validation recalculates every score from the stored components before the artifact
is accepted. The current generated artifact contains both label classes.

## Artifact and service boundary

- `services/ml/data/synthetic/synthetic-interactions-v2.csv` is the current generated artifact. Version
  2 adds decision-time sequence and exact prerequisite aggregates consumed by Phase 13.
- `services/ml/data/synthetic/manifest.json` contains provenance, configuration, checksums,
  distributions, measured relationships, noise counts, validations, schema roles, and sample rows.
- `GET /datasets/synthetic/overview` exposes that manifest from the ML service.
- ML readiness is HTTP 503 if the manifest is missing, unreadable, or not explicitly synthetic.
- `/synthetic-data` is the reviewer-facing Synthetic Data Lab backed by the live manifest.

## Verification

Automated checks cover byte-for-byte regeneration, curriculum references, unique interaction IDs,
finite numeric values, explicit synthetic classification, minimum learner/interaction counts, all
required archetype dimensions, realistic noise, benefit-formula equality, label derivation, artifact
checksum, and the no-real-data/no-model boundary.

Regenerate with:

```text
npm run ml:data:export
cd services/ml
python -m app.synthetic.generate
```

## Deferred

Phase 12 itself does not define the learner-candidate feature contract, create train/validation/test
splits, train or evaluate a model, expose predictions, rank candidates, claim Learn Next, or generate
paths. Phase 13 consumes this raw simulated interaction boundary without changing that separation.
