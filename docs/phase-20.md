# Phase 20 — Sample-Gated Model Monitoring and Governance

Phase 20 observes the frozen Phase 19 recommender. It does not alter prerequisite filtering, candidate
generation, the 55-feature contract, the Random Forest artifact, path construction, mastery policy, or
retention policy.

## Live monitoring

`GET /governance/overview` derives its values from persisted paths, path items, feedback, learning activity,
assessed evidence, and the current curriculum. `/governance` presents:

- prediction, recommendation, response, acceptance, completion, and assessed-outcome volume;
- the persisted benefit-probability distribution;
- course-level volume;
- acceptance, rejection, completion, and assessment-follow-through rates only after 30 responses;
- calibration only after 30 assessed outcomes;
- recent-versus-reference drift only after both windows contain 50 predictions;
- content-coverage and data-quality gates;
- retraining ineligibility until at least 100 assessed recommendation outcomes exist; and
- an explicit human-controlled promotion sequence.

With the five synthetic demo profiles, the deliberately small observational sample remains below these
thresholds. The interface displays volume but says `Withheld` for rates and conclusions. This is the intended
governance behavior, not an error.

## Frozen promotion policy

```text
Current production model
  → candidate retrained model
  → offline evaluation
  → side-by-side comparison
  → human approval
  → promote with version history
```

Automatic retraining and automatic production promotion are both disabled. Phase 20 creates no new model,
does not feed sparse feedback back into ranking, and makes no causal effectiveness claim.
