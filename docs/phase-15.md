# Phase 15 — ML Inference Service

Phase 15 activates the evaluated Random Forest for one capability only: predicting the probability
that an already-eligible learner-skill interaction will be beneficial. It does not generate candidates,
rank a course, select Learn Next, or update learner state.

## Checked artifact loading

The current inference runtime loads `benefit-ranking-v2/model.joblib` only when all of these checks pass:

- the Phase 14 experiment classification and validation gates are valid;
- the artifact has `EVALUATED_NOT_DEPLOYED` evaluation status;
- its SHA-256 digest matches the stored manifest;
- the selected estimator exposes positive-class probability inference;
- the trained feature version is `learner-candidate-features-v2`;
- all 55 learned feature names and their order match the serving contract; and
- the Phase 13 contract certifies training/inference parity.

Missing or unreadable files return HTTP 503. Corrupt checksums, incompatible versions, schema drift,
or invalid probability interfaces also return HTTP 503. The service never silently selects a baseline.

## API contract

`POST /predict` accepts:

```json
{
  "feature_version": "learner-candidate-features-v2",
  "candidates": [
    {
      "skill_id": "skill-id",
      "features": { "all_55_frozen_features": 0.0 }
    }
  ]
}
```

The batch contains one to 100 unique skill IDs. Feature keys must match exactly; all values must be
finite numbers within their documented bounds. A contract version mismatch, missing/extra feature,
duplicate skill, or bounds violation returns HTTP 422 with an explicit detail.

A successful response contains `model_version`, `feature_version`, `inference_version`,
`serving_status`, `prediction_count`, `generated_at`, and one `benefit_probability` in `[0, 1]` per
input skill. Order is preserved.

`GET /inference/overview` exposes serving status, model checksum, contract identity, decision threshold,
runtime gates, model feature importance, and simulated candidate examples for the frontend lab.

## UI demonstration

`/inference-lab` uses only ML-service data. It submits one complete simulated candidate vector on load,
shows the real returned probability, and lets a reviewer change a small set of decision-time features
before running the same serialized model again. Current mastery changes also update mastery gap;
retention changes preserve the retention-state one-hot encoding.

The UI labels every example as simulated and explains that feature importance is not causality. It
also visualizes the full request path: exact-schema validation → checked Random Forest → versioned
probability response.

## Phase boundary

Phase 15 sets `predictionAvailable` and `benefitProbabilityAvailable` to true. It keeps
`candidateRankingIntegrated`, `learnNextAvailable`, `personalizedPathAvailable`, and
`pathRegenerationAvailable` false. No inference request writes PostgreSQL, learner evidence, mastery,
course progress, or candidate order.

Phase 16 now owns the course-enrollment path and combines prerequisite-valid candidates with these
probabilities while preserving global mastery and independent course progress. The ML service itself
remains stateless and does not enforce prerequisites or persist paths.
