# Phase 16 — Course-Specific Personalized Paths

Phase 16 converts the live adaptive-learning state into one inspectable path for each course
enrollment. The pipeline is:

```text
global mastery + confidence + evidence + retention
  → enrollment candidate generation
  → required-prerequisite gate
  → production-aligned 55-feature vectors for eligible skills only
  → checked benefit inference
  → revision-aware ranking
  → recognized / current / recommended next / upcoming / locked path
  → one persisted enrollment-owned snapshot
```

## Architecture boundary

- `CourseEnrollment -> PersonalizedPath` is one-to-one in Phase 16.
- There is no global path, goal path, or module path.
- `learner_skill_mastery` remains globally unique at `(learner_id, skill_id)`.
- Course and module progress remain independent from knowledge and path state.
- An optional learning goal is preserved as context but does not control Phase 16 ordering. Goal
  relevance across simultaneous courses is deferred to Phase 17.
- Phase 16 creates an immutable first path snapshot. Version history, invalidation, and automatic
  regeneration after new evidence are deferred to Phase 18.

## Training-serving correction

The Phase 13 v1 contract contained a latent simulator-only `learner_ability` input. A real learner has
no such field, so serving it would require invented data and create training-serving skew. Phase 16
supersedes that contract with `learner-candidate-features-v2`:

- `learner_performance_proxy` is computed from observable overall mastery, candidate confidence, and
  recent assessment evidence;
- learner experience comes from prior evidence volume;
- learning pace comes from observed time relative to expected resource time; and
- consistency comes from prior assessment-score volatility.

The same formulas are used by the synthetic feature transformer and the live TypeScript builder. The
corrected `engineered-features-v2` dataset was regenerated and the complete experiment was rerun. The
selected artifact is `benefit-ranking-v2`; the runtime is `benefit-inference-v2`.

Unknown production inputs follow an explicit policy. Knowledge stays nullable in the UI and database.
Only the numeric model vector uses bounded neutral/default values, paired with cold-start, evidence,
and confidence features. These imputed values are never displayed as learner mastery.

## Graph-gated ranking

The candidate service first separates skills into eligible, locked, and already-covered sets. Only
eligible candidates are sent to `POST /predict`. A missing or invalid ML response returns HTTP 503;
the API never substitutes a gap, popularity, or heuristic order.

Eligible candidates receive checked benefit probabilities. The path policy adds a documented `0.08`
priority bonus to an already-eligible retention revision. It does not unlock a skill or override a
prerequisite. Deterministic dependency level, course sequence, and name ordering resolve ties.

Path lanes mean:

- `RECOGNIZED`: global mastery already meets the course target; module completion is not implied.
- `CURRENT`: recent activity belongs to an in-progress module and is kept in view.
- `RECOMMENDED_NEXT`: highest path-policy priority among prerequisite-eligible skills.
- `UPCOMING`: other eligible, model-ranked skills.
- `LOCKED`: missing required mastery; visible but never scored by ML.

## Persistence and provenance

Migration `0017_course_personalized_paths.sql` adds:

- `personalized_paths`, unique by `enrollment_id`; and
- `personalized_path_items`, unique by path/skill and path/position.

Every path records model, feature, inference, and path-policy versions plus the explicit
`MODEL INFERENCE — SYNTHETICALLY TRAINED` classification. Items store the decision-time mastery,
confidence, retention, prerequisite, explanation, reason-code, and course-context snapshots. Creating
the path records one `RECOMMENDATION_SHOWN` activity event without changing mastery or progress.

`POST /enrollments/:enrollmentId/path/generate` is idempotent. A repeated request returns the same
path rather than silently overwriting it. `GET /enrollments/:enrollmentId/path` returns an explicit
`PATH_NOT_GENERATED` 404 until generation.

## UI demonstration

The dashboard promotes Learn Next above candidate diagnostics. The course workspace can generate and
open its path. `/my-courses/:enrollmentId/path` shows:

- a prominent Learn Next action and explanation;
- predicted benefit, mastery, confidence, and retention;
- global cross-course recognition without false course completion;
- every missing prerequisite threshold for locked skills;
- the complete lane-based journey; and
- saved model/feature/inference provenance and the synthetic-training disclosure.

The page uses only API data. Empty, loading, explicit ML-error, cold-start, no-eligible-candidate, and
locked states are represented without fake scores.

## Verification

Phase 16 adds unit coverage for ranking, revision policy, locked-skill exclusion, route states, and web
API calls. The PostgreSQL integration scenario verifies all 55 live features, removal of latent
`learner_ability`, one-path uniqueness, idempotent generation, unscored locks, provenance, and exactly
one recommendation activity event.

