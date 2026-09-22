# Phase 13 — Feature Engineering

Phase 13 defines the frozen numerical interface between LearnPath candidate generation and future ML
training. It converts each Phase 12 interaction into a learner × eligible-candidate row without using
real learner data and without allowing the current outcome to leak into the feature matrix.

## Artifacts

- Contract: `services/ml/data/features/learner-candidate-features-v2.json`
- Dataset: `services/ml/data/features/engineered-features-v2.csv`
- Manifest: `services/ml/data/features/manifest.json`
- Source: `services/ml/data/synthetic/synthetic-interactions-v2.csv`

The checked artifact contains 20,000 rows for 1,000 simulated learners. Every row carries explicit
synthetic provenance. The six metadata columns and `beneficial` target are outside the 55-column
numeric feature matrix.

Phase 16 supersedes the original v1 contract after identifying a simulator-only latent ability input.
The v2 contract replaces it with `learner_performance_proxy`, computed from observable mastery,
confidence, and recent assessment evidence. Experience, pace, and consistency also use prior observable
history so the synthetic transformer and live API can calculate the same semantics.

## Frozen feature contract

The ordered schema covers all required categories:

| Category | Count | Examples |
| --- | ---: | --- |
| Learner | 11 | experience, overall mastery, pace, activity, consistency |
| Skill | 7 | difficulty, course-context relevance, curriculum popularity |
| Mastery | 5 | mastery, confidence, gap, evidence strength |
| Performance | 8 | recent/average score, trend, attempts, correct rate |
| Retention | 6 | days since practice, retention, state, revision due |
| Prerequisite | 6 | count, satisfied ratio, minimum/average mastery, readiness |
| Interaction | 12 | previous interaction, time, completion, response, candidate kind |

Every contract entry records its one-based order, name, category, description, source, availability,
numeric type, and allowed bounds. `validate_feature_frame` and `validate_feature_record` enforce the
same schema for future training batches and inference vectors.

## Leakage policy

Current learner state and curriculum context are available at candidate-decision time. Historical
outcomes are permitted only after grouping and shifting by learner before expanding aggregation.
Learner-skill history uses the same rule. Cold-start values are explicit and accompanied by a
`learner_cold_start` indicator.

The current row's completion, engagement, practice, time spent, post-assessment, mastery gain,
feedback, benefit score, and `beneficial` label are blocked from the feature matrix. Identifiers are
metadata only. Tests verify the second interaction's prior features equal the first interaction's
outcomes and never its own outcomes.

`goal_relevance` is a documented course-context proxy in Phase 13: direct course skills score `1.0`
and supporting prerequisites score `0.72`. It does not claim that a learner selected a goal.
Popularity is based only on curriculum course coverage and prerequisite centrality, not learner
behavior or future outcomes.

## Generation

From the repository root:

```text
npm run ml:data:export
npm run ml:synthetic:generate
npm run ml:features:generate
```

Generation validates fixed order, all seven categories, at least 30 features, finite numeric values,
bounds, target and identifier isolation, source row parity, synthetic provenance, leakage rules, and
the shared training/inference schema. Artifacts include SHA-256 checksums and regenerate byte-for-byte
from the same ordered inputs.

## Service and UI

- `GET /datasets/features/overview` returns the checked Phase 13 manifest.
- ML readiness requires both the Phase 12 source artifact and Phase 13 feature artifact.
- `/feature-lab` visualizes the real manifest: categories, every ordered feature, sources, timing,
  observed ranges, leakage rules, sample vectors, checksums, and validation gates.

## Deferred

Phase 13 itself does not split learners, train models, or calculate evaluation metrics. Phase 14 now
consumes this contract through learner-disjoint training and held-out model/baseline evaluation.
Inference, live candidate ranking, Learn Next, and personalized paths remain closed.
