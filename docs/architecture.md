# LearnPath architecture

## System boundary

LearnPath is a React/Vite client, an Express application API, a PostgreSQL database, and a separate
FastAPI intelligence service boundary. The browser renders backend decisions; it never calculates mastery,
confidence, prerequisite eligibility, or recommendation scores. The Python service exposes checksum- and
schema-validated Random Forest benefit inference plus derived NetworkX graph analytics. It does not enforce
prerequisite gates, rank locked skills, update learner state, or create a personalized path.

## Corrected learner model

The knowledge source of truth is global and unique at `(learner_id, skill_id)`. A course enrollment
owns course/module progress. A learning goal is an optional outcome lens. Neither enrollment nor goal
owns a duplicate mastery record.

```text
learner
  ├─ course enrollment ── module progress
  ├─ optional learning goal
  └─ global skill state ── mastery + confidence + evidence state + retention
                              ▲
                              └─ immutable performance evidence
```

Consequences:

- Course enrollment, diagnostic assessment, practice, and prerequisite analysis work with zero goals.
- Removing a goal marks it dropped, unlinks it from enrollments, and preserves progress and evidence.
- Course/module completion is not proof of knowledge.
- The same global skill state is visible in every course that references the skill.
- A personalized path belongs to a learner in an enrollment context, not to a global goal path.

## Evidence and knowledge

`learner_skill_mastery.evidence_state` is explicit:

- `UNKNOWN`: no performance observation exists.
- `ESTIMATED`: evidence exists but is still sparse or narrow.
- `ASSESSED`: multiple observations/sessions meet the assessment threshold.
- `VERIFIED`: volume, sessions, consistency, confidence, and source diversity meet the strictest policy.

Mastery estimates what the learner knows. Confidence and evidence state describe how strongly the
system can defend that estimate. High mastery alone cannot produce `VERIFIED`.

All diagnostic, practice, quiz, assessment, module-assessment, and future retention observations use
one append-only `skill_evidence` ledger. Update/delete triggers reject mutation. Each row preserves the
source, score, correctness, difficulty, timing, attempt number, before/after mastery and confidence,
before/after evidence state, retention values/states, and metadata.

The centralized mastery service owns:

- difficulty-adjusted performance;
- bounded mastery updates using source-specific weights;
- confidence growth from evidence volume, sessions, diversity, consistency, and difficulty;
- the diagnostic-only confidence ceiling; and
- evidence-state transitions.

Only the affected learner-skill row is locked and updated. Resource completion updates observable
activity/time only and never invokes the mastery engine.

## Retention and forgetting

Mastery is the durable record of demonstrated knowledge. Retention is a current projection of how
much of that mastery is likely accessible now. LearnPath uses the configurable exponential model:

```text
retention = mastery × exp(-effective_lambda × days_since_evidence)
```

The latest immutable performance evidence anchors the calculation. Confidence and evidence volume
slow the effective decay rate. Passive resource or lesson completion does not move the anchor and
does not alter mastery. Retention is `UNKNOWN`, `STRONG`, `MODERATE`, `AT_RISK`, or `CRITICAL`.

Revision eligibility is narrower than low retention: the learner must previously have demonstrated
at least the configured mastery floor before an `AT_RISK` or `CRITICAL` skill is considered forgotten.
This prevents ordinary learning gaps from being mislabeled as revision needs.

Retention checks reuse real questions and server-side scoring. A check records `RETENTION_CHECK`
evidence, updates mastery/confidence through the centralized engine, and establishes a new retention
anchor. It is not a heuristic recommendation or an ML ranking.

## Course diagnostics and practice

Assessments have exactly one context: course or goal. Attempts likewise have exactly one learner
context: enrollment or learner goal. Course diagnostics are seeded from real, skill-linked questions.
The API never exposes correct-option metadata before submission.

Evidence-bounded diagnostic v3 reveals one server-selected question at a time, capped at 15 questions. Five
coverage probes establish breadth, eight confirmation slots gather repeated and application-level evidence,
and two verification slots resolve contradictions. One answer remains a probe; diagnostic mastery requires at
least three varied observations including successful application evidence. The API returns mastery intervals
and explicitly lists skills not sampled within the budget. After a course diagnostic, the learner UI requests
path generation or regeneration and opens the dependency-valid path directly.

Practice validates that the learner owns the optional enrollment context and that the skill belongs
to it. It selects an existing real question, validates the submitted option against that question on
the server, calculates difficulty-adjusted performance, records immutable evidence, and returns the
before/after knowledge state. Correct hard answers carry a stronger positive signal; incorrect easy
answers carry a stronger negative signal.

## Prerequisite readiness

The prerequisite service accepts an enrollment or optional goal context. Course context is preferred
when neither is explicitly supplied. It recursively loads context skills and supporting ancestors,
then evaluates every required edge against confidence-adjusted global mastery.

`REQUIRED` edges block progression; `RECOMMENDED` edges remain advisory. Unknown mastery never
satisfies a required edge. The service returns dependency-valid order, lock explanations, mastery
shortfalls, course reuse context, and transparent context readiness. It does not rank candidates or
claim to provide Learn Next.

Because analysis reads live global states, diagnostic or practice evidence immediately changes any
affected eligibility decision without mutating course progress or other skills.

Knowledge Graph v2 enriches this authoritative TypeScript result with NetworkX topological layers,
downstream reach, betweenness centrality, shortest foundation routes, bottlenecks, and counterfactual
unlocks. The structural analytics are derived and read-only. They cannot satisfy a required edge. If the
Python analytics boundary is unavailable, prerequisite enforcement continues in TypeScript safe mode.

## Candidate generation and baseline evaluation

Candidate generation belongs to a learner's course enrollment. It starts from the course skills and
recursively includes supporting prerequisite ancestors, so the pool is valid even when a required
foundation lives outside the direct course mapping. An optional enrollment goal can contribute
relevance metadata but is not required and does not own the result.

Each relevant skill is assigned to exactly one pool:

- eligible learning, supporting-prerequisite, or retention-revision candidate;
- locked with explicit required-prerequisite failures; or
- excluded because global mastery meets the course target and revision is not due.

The pool is derived from live mastery, confidence, evidence, retention, course/module context,
resources, questions, prerequisite checks, and observed database counts. Unknown mastery remains
unknown. Candidate generation does not write course progress, learner knowledge, or path state.

Highest Skill Gap and Observed Popularity are deterministic evaluation baselines over eligible skills.
Locked and excluded skills cannot enter either ranking. These orders provide a future comparison
surface; they are not predictions of learning benefit, Learn Next decisions, or a personalized path.

## Synthetic ML research boundary

Phase 12 keeps simulated research data physically and semantically separate from application learner
state. A curriculum-only exporter reads no user or evidence tables and produces a checksummed snapshot
of the active global skills, course mappings, and prerequisite graph. A Python simulator consumes that
snapshot with fixed seed `42` and generates sequential interactions for explicit learner archetypes.

The raw simulation models mastery, prerequisites, retention, pace, engagement, practice, time,
completion, assessment performance, feedback, and bounded realistic noise. Its benefit label is
derived from a versioned weighted outcome formula; labels are never sampled independently. The
manifest records actual distributions and calculated correlations rather than hardcoded quality
metrics.

The generated CSV is not imported into `users`, `learner_skill_mastery`, `skill_evidence`, activity,
assessment, or enrollment tables. Consequently it cannot influence the learner dashboard, Phase 11
popularity counts, readiness, or candidate pools. The ML service exposes manifest provenance and
returns unavailable rather than inventing data if the artifact is missing or mislabeled.

## Feature engineering boundary

Phase 13 converts each sequential synthetic interaction into one learner × eligible-candidate row
under the production-aligned `learner-candidate-features-v2`. The model matrix contains 55 numeric features in a fixed order
across learner, skill, mastery, performance, retention, prerequisite, and interaction categories.
Identifiers remain metadata and `beneficial` remains a separate target.

Features are classified by availability. Current-state features use only information available when
the candidate is considered. Outcome-derived features use per-learner or per-learner-skill history
shifted by one interaction before any expanding aggregation. Current completion, engagement, time,
post-assessment, mastery gain, feedback, benefit score, and label are explicitly blocked. A shared
validator enforces the same names, order, numeric finiteness, and bounds for future training and
inference vectors.

Curriculum-derived popularity is a documented course-coverage and dependency-centrality proxy; it
does not read learner activity. `goal_relevance` is explicitly a course-context proxy at this phase,
not an assertion that the learner selected a goal. Feature generation remains file-based and cannot
change application learner state, candidate eligibility, or baseline ordering.

## Offline model-evaluation boundary

Phase 14 groups all simulated interactions by learner before splitting: 70% train, 15% validation,
and 15% test with seed `42`. No learner appears in more than one group. Gradient Boosting, Random
Forest, and Logistic Regression use the same frozen feature matrix. Highest Skill Gap and Popularity
are measured as deterministic baselines on the same held-out learners.

Model selection uses validation NDCG@5, with validation ROC-AUC and F1 as tie-breakers. Classification
thresholds are also chosen on validation data. The test group is opened only for final reporting and
never changes the selected model. Metrics include Accuracy, Precision, Recall, F1, ROC-AUC,
Precision@3, Precision@5, Recall@5, and NDCG@5.

The selected Random Forest, split assignment, configuration, checksums, feature importance, and all
metrics are persisted as versioned file artifacts. The deployment state is
`EVALUATED_NOT_DEPLOYED`. These artifacts cannot mutate PostgreSQL learner evidence, candidate pools,
or course progress. The ML service exposes a read-only experiment overview but deliberately has no
candidate-ranking route.

## ML inference boundary

The current checked runtime loads the corrected Phase 14 artifact once behind `benefit-inference-v2`. Before deserialization
is trusted for serving, the runtime verifies the recorded artifact checksum, experiment gates, selected
model capability, frozen contract version, all 55 feature names and order, and positive-class interface.
The historical evaluation manifest remains immutable.

`POST /predict` accepts bounded batches of already-engineered, already-eligible candidate vectors.
The same validator used during training rejects missing, extra, non-finite, out-of-range, reordered,
or version-incompatible features. The response preserves input order and returns benefit probability
plus model, feature, and inference versions. Missing or incompatible artifacts produce HTTP 503;
invalid request schemas produce HTTP 422. No heuristic is substituted.

Inference is stateless. It does not read or write PostgreSQL learner records, update mastery, alter
course progress, generate candidates, rank them, or persist a path. Phase 16 performs those graph and
path responsibilities in the application API. The Inference Lab continues to demonstrate the narrow
probability capability independently.

## Course-path orchestration boundary

Phase 16 adds one `personalized_paths` row per course enrollment. Candidate generation first removes
already-covered skills and separates eligible from prerequisite-locked skills. Only eligible skills
receive live `learner-candidate-features-v2` vectors and cross the inference boundary. The API ranks
returned probabilities with the versioned revision policy; it never permits ML to override a lock. Knowledge
Graph v2 can add at most `0.06 x gateway_score` after eligibility, so structural leverage can resolve close
choices without becoming an alternate unlock path.

The v2 contract removes simulator-only `learner_ability` and replaces it with an observable
mastery/confidence/recent-evidence proxy. Experience, pace, and consistency are also derived from prior
observable history in both the synthetic transformer and live builder. The full experiment is retrained
as `benefit-ranking-v2`; unknown live inputs use explicit bounded imputation while knowledge remains
nullable in learner-facing state.

Path items persist recognized, current, recommended-next, upcoming, and locked states with decision-time
mastery, confidence, retention, prerequisites, explanations, reason codes, and model provenance.
Generation is idempotent. A recommendation activity event is observational only and cannot mutate
mastery or module progress.

## Cross-course coordination boundary

Phase 17 adds a learner-level decision above the independent course paths. It groups matching Learn
Next skills by global skill identity and compares only recommendations from active enrollments. The
coordination score is:

```text
min(1, best course priority
       + 0.04 × min(additional active course contexts, 2)
       + 0.06 × active-goal relevance)
```

The active goal is the learner's lowest-numbered active priority. Goal relevance is optional and
bounded; it cannot unlock a skill, create a candidate, or replace the checked course probability.
Each course path remains independently persisted. GET coordination is side-effect free; the explicit
generate action creates only missing active-course paths and records a coordination activity event.

## Dynamic path lifecycle

Phase 18 preserves each generated path as an evidence-time snapshot. Central skill evidence updates global
mastery and marks every current learner path stale in the same transaction. Stale Learn Next items remain
available for audit but are not eligible for cross-course coordination. Explicit regeneration reruns the
candidate, prerequisite, live-feature, ML inference, and path construction pipeline; supersedes the old
row; and persists an incremented version plus a structured comparison.

The database permits exactly one `ACTIVE` or `STALE` path per enrollment and any number of immutable
`SUPERSEDED` versions. This makes the visible loop causal and inspectable: performance changed knowledge,
knowledge made the path stale, and regeneration changed—or deliberately retained—the recommendation.

## Recommendation-response evaluation

Phase 19 records a learner's explicit response only against the current `ACTIVE` path and its
`RECOMMENDED_NEXT` item. Accepted responses may name the exact learning resource; declined responses require
a structured reason. The row freezes path version, skill, pre-response mastery/confidence/retention, and
model/feature/inference/policy versions. Recommendation feedback and resource activity never update mastery.

The evaluation view keeps the complete shown denominator and connects response, attributed resource
completion, and assessed evidence observed inside a 30-day window. Learning gain is computed only when a
real pre-response mastery baseline exists. Later evidence without a baseline is reported as
`OBSERVED_NO_BASELINE`; it is never converted into invented gain. These are longitudinal associations, not
causal claims, and the exact model-version groups remain inspectable.

Required prerequisite skills are now consistently usable across resource and practice scope even when they
are supporting foundations rather than direct course skills. Graph reachability still controls access.

## Implemented scope through Phase 22

- Phases 1–4: runtime foundation, database-backed identity, curriculum graph, and independent course
  enrollments/module progress.
- Phase 5: unique global learner-skill records with nullable knowledge signals.
- Phase 6: real server-scored diagnostic assessment and inspectable results.
- Phase 7: deterministic prerequisite analysis and database cycle prevention.
- Phase 8: globally reusable learning resources and immutable activity history.
- Phase 9: goal-optional course diagnostics, unified immutable performance evidence, centralized
  mastery/confidence policy, explicit evidence states, real practice, readiness refresh, cross-course
  recognition, and learner-facing UI for the complete loop.
- Phase 10: evidence-anchored forgetting, configurable decay, explicit retention states, revision
  eligibility, real delayed-recall checks, immutable retention snapshots, and retention UI.
- Phase 11: enrollment-scoped candidate generation, recursive supporting prerequisites, separated
  eligible/locked/covered pools, retention-driven revision candidates, real observed-popularity
  inputs, evaluation-only baseline orders, API, dashboard summary, and Candidate Intelligence UI.
- Phase 12: curriculum-only snapshot export, fixed-seed learner-skill simulation, 1,000 learner and
  20,000 interaction artifact, realistic noise, versioned deterministic benefit labels, checksums,
  validation manifest, ML-service overview/readiness, and Synthetic Data Lab UI.
- Phase 13: versioned 55-feature learner-candidate contract, fixed names/order/bounds, exact
  prerequisite aggregates, deterministic categorical encoding, shifted historical features,
  current-outcome leakage protection, shared training/inference validation, generated artifact,
  ML-service readiness/overview, and Feature Intelligence Lab UI.
- Phase 14: deterministic learner-disjoint 70/15/15 split; Gradient Boosting, Random Forest, and
  Logistic Regression training; validation-only selection; untouched test reporting; skill-gap and
  popularity baselines; classification and top-k ranking metrics; saved checked artifact; ML-service
  experiment overview; and Model Evaluation Lab UI.
- Phase 15: checksum-verified artifact loading, exact frozen-schema and bounds validation, versioned
  one-to-100 candidate probability inference, explicit 422/503 failures, no-heuristic fallback,
  inference readiness/overview, and an interactive Inference Lab using backend simulated vectors.
- Phase 16: production-aligned feature contract correction and retraining, live learner/candidate
  feature construction, prerequisite-gated benefit inference, revision-aware ordering, one persisted
  path per enrollment, explained Learn Next, locked-skill exclusion, provenance, API/dashboard/course
  integration, and a responsive personalized-path centerpiece.
- Phase 17: simultaneous active-course coordination over course-owned Learn Next items, shared global
  skill utility, bounded active-goal alignment, explained coordination scores, preserved path
  ownership, explicit activity provenance, API tests, integration coverage, and learner dashboard UI.
- Phase 18: evidence-triggered stale paths, explicit regeneration, immutable version history,
  prerequisite-safe re-ranking, stored before/after explanations, stale coordination exclusion, API/UI
  lifecycle surfaces, and concurrency-safe current-version ownership.
- Phase 19: exact path-version recommendation responses, structured rejection reasons, attributed resource
  completion, post-response assessed evidence, baseline-honest gain classification, model-version outcome
  monitoring, recursive prerequisite lesson/practice scope, and learner/reviewer UI.
- Phase 20: sample-gated monitoring, prediction/calibration/drift visibility, data-quality gates, retraining
  eligibility, and human-controlled model promotion governance.
- Phase 21: confidence-aware prerequisite thresholds, NetworkX structural analytics and safe fallback,
  bounded graph-aware Random Forest ordering, counterfactual unlock explanations, multi-course dependency
  projections, and the interactive Knowledge Graph v2 learner experience.
- Phase 22: evidence-bounded adaptive course diagnostics, one-question-at-a-time server selection, fixed
  coverage/confirmation/verification budget, repeated-evidence mastery gates, difficulty/discrimination-aware
  estimation, explicit contradictions and untested skills, mastery intervals, and direct path regeneration.

## Phase 20 governance boundary

Phase 20 reads the Phase 19 observational records without feeding sparse feedback directly into online
ranking or mastery. `/governance/overview` exposes real volume and prediction distributions, while minimum
sample gates withhold rates, course conclusions, calibration, and drift until they are statistically
meaningful. Retraining remains ineligible below 100 assessed recommendation outcomes, and promotion always
requires offline comparison, explicit human approval, and preserved model-version history.
