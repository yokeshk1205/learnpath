# Phase 19 — Recommendation Feedback and Observational Evaluation

Phase 19 measures what happens after LearnPath recommends a skill. It does not treat a recommendation as
successful merely because it was generated, and it never turns clicks or lesson completion into mastery.

## Learner response loop

```text
ACTIVE path + RECOMMENDED_NEXT
  → learner accepts or declines
  → accepted lesson carries feedback/path/version attribution
  → resource completion is observed
  → later diagnostic, practice, assessment, or retention evidence is observed
  → outcome is grouped by the exact served model version
```

`POST /recommendations/paths/:pathId/feedback` accepts only the learner's current active path. Acceptance
can bind a resource that teaches the recommended skill. Rejection requires one of six structured reasons.
Repeating the same response is idempotent; changing it creates a new feedback version and activity event.

## Evidence boundaries

- Feedback freezes the path, skill, baseline knowledge state, and model/feature/inference/policy versions.
- Lesson events require exact feedback or path/version metadata for completion attribution.
- The observation window is 30 days after the learner response.
- Later assessed evidence is counted even when no baseline existed.
- Learning gain is calculated only when both a real baseline and later assessed mastery exist.
- `OBSERVED_NO_BASELINE` keeps useful later evidence visible without manufacturing improvement.
- Results are associations, not causal estimates, and do not automatically retrain or promote a model.

## UI

The personalized path pauses Learn Next until the learner accepts it or records a decline reason. Accepted
lessons preserve attribution through the study flow. `/recommendation-evaluation` then shows the complete
shown → responded → accepted → completed → outcome-evidence funnel, structured rejection reasons,
record-level provenance, honest missing-baseline states, and model-version summaries using real API data.

Supporting prerequisite skills use the same recursive course graph for lesson and practice access, so a
graph-valid recommendation is also actionable even when the skill is not directly listed in the course.
