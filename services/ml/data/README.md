# Phase 12 synthetic data

This directory contains no real learner records.

- `input/curriculum_v1.json` is a stable export of active curriculum-only PostgreSQL tables.
- `synthetic/synthetic-interactions-v2.csv` contains reproducible simulated learner-skill interactions
  with decision-time sequence and exact prerequisite aggregates required by Phase 13.
- `synthetic/manifest.json` records provenance, checksum, configuration, benefit-label policy,
  distributions, validation results, and sample rows.
- `features/learner-candidate-features-v2.json` freezes feature names, order, sources, availability,
  types, bounds, label isolation, and leakage policy.
- `features/engineered-features-v2.csv` contains the production-aligned 55-feature learner × eligible-candidate matrix.
- `features/manifest.json` records source and artifact checksums, category counts, observed ranges,
  real sample vectors, validation gates, and the Phase 14 boundary.
- `splits/learner-disjoint-split-v1.csv` assigns all 1,000 simulated learners to exactly one 70/15/15
  train, validation, or test group. The test group is not used for model or threshold selection.
- `../models/benefit-ranking-v2/model.joblib` stores the selected Random Forest pipeline.
- `../models/benefit-ranking-v2/manifest.json` records configuration, model and dataset versions,
  checksums, validation and test metrics, baseline comparison, and `EVALUATED_NOT_DEPLOYED` status.

Regenerate from the repository root after configuring `DATABASE_URL`:

```text
npm run ml:data:export
npm run ml:synthetic:generate
npm run ml:features:generate
npm run ml:train:evaluate
```

The generator always uses seed `42` by default and labels every row `SYNTHETIC / SIMULATED DATA`.
The `beneficial` field is derived from the versioned benefit formula; it is never randomly assigned.
The label and identifiers are not feature columns. Outcome-derived history is shifted before use.
