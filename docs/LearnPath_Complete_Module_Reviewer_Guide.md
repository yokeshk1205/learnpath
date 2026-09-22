# LearnPath — Complete Module-by-Module Reviewer Explanation

This guide explains every important LearnPath module at two levels:

- **Nontechnical:** what the feature means to a learner or reviewer.
- **Technical:** how the feature is implemented, which algorithm or rule it uses, what data it reads and writes, and why its output can be trusted.

The central idea is not merely to deliver online lessons. LearnPath continually answers one question:

> **Given what this learner currently knows, what should they learn next, and why?**

The complete loop is:

```text
Learner evidence
  -> global mastery and confidence
  -> retention estimate
  -> skill gaps
  -> prerequisite graph gate
  -> eligible candidates
  -> ML benefit prediction
  -> dependency-aware path
  -> learning and assessment
  -> new evidence
  -> mastery update and path regeneration
```

The main trust principle is **separation of responsibility**. PostgreSQL stores durable truth. The TypeScript API applies authoritative educational rules and performs all writes. The Python service performs bounded ML inference and NetworkX graph analytics, but cannot bypass prerequisites or mutate learner records. The React interface explains the resulting decisions using real API data.

---

## 1. Authentication and Learner Identity

### What it does

Authentication identifies the learner so that courses, assessments, mastery, retention, and recommendations belong to the correct person.

### Nontechnical explanation

LearnPath first needs to know **whose knowledge model it is updating**. Two learners can take the same course but receive different paths because their evidence histories are different.

### Technical implementation

The Express API owns registration, login, session validation, and access control. Passwords are not stored as plain text. Protected endpoints resolve the authenticated learner on the server rather than trusting a learner ID supplied by the browser.

The learner identity is then used as the root key for:

- enrollments;
- diagnostic attempts;
- assessment evidence;
- the global skill passport;
- personalized paths;
- recommendation feedback.

Primary implementation: `apps/api/src/auth/service.ts` and `apps/api/src/auth/router.ts`.

### Trust boundary

The frontend may request data, but it does not decide which learner owns it. The server verifies identity and scopes queries. Authentication is intentionally sufficient for the project without allowing security infrastructure to dominate the adaptive-learning objective.

### Panel-ready answer

> Authentication is the ownership layer. It ensures that every assessment, mastery update, and recommendation is attached to the correct global learner model. The server derives that identity from the authenticated session rather than trusting the browser.

---

## 2. Curriculum, Courses, Modules, and Skills

### What it does

The curriculum module converts a course from a simple list of lessons into a structured collection of skills, targets, resources, assessments, and prerequisite relationships.

### Nontechnical explanation

A normal LMS asks, “Which lesson comes next in the course?” LearnPath asks, “Which **skill** does the learner need next?” A course provides context, but skill knowledge is the unit of intelligence.

### Technical implementation

PostgreSQL stores:

- courses and modules;
- global skills;
- mappings from course modules to global skills;
- course-specific target mastery values;
- learning resources and questions;
- prerequisite edges between skills.

A global skill can appear in several courses. Each course may require a different target. For example, Python loops may be required at 65% mastery in an introductory course and 80% in an algorithms course.

The curriculum database is the source of truth. It is not reconstructed from frontend constants or from ML output.

### Important distinction

```text
Course progress = what course material the learner has completed
Skill mastery   = what the evidence suggests the learner knows
```

Completing a lesson does not automatically prove mastery. Conversely, prior assessed knowledge can satisfy a skill requirement in a newly enrolled course without falsely marking its lesson as completed.

### Trust boundary

Course authors define skill mappings, required mastery, and prerequisite relationships. ML does not invent curriculum structure.

### Panel-ready answer

> Our curriculum is skill-centric. Courses provide learning context, but knowledge is represented as reusable global skills. This lets LearnPath reason across courses instead of treating every course as an isolated sequence of pages.

---

## 3. Multiple Enrollment and Cross-Course Knowledge Reuse

### What it does

This module lets a learner enroll in multiple courses while maintaining one global state for each skill.

### Nontechnical explanation

If a learner demonstrates recursion in Course A, Course B should recognize that knowledge. The learner should not be treated as a beginner simply because the same concept appears in another course.

### Technical implementation

The `learner_skill_mastery` table has one learner-skill record, unique by:

```text
(learner_id, skill_id)
```

It is deliberately **not** duplicated per course, goal, or enrollment. Enrollment tables separately record which courses the learner is taking and their course activity.

When a path is generated for a course, the candidate engine joins:

- that course's required skills and targets;
- the learner's global mastery and confidence;
- current retention;
- prerequisite state.

If global mastery already meets the new course's target, the path places the skill in the `RECOGNIZED` lane. This means “knowledge reused,” not “course module completed.”

Primary implementation: `apps/api/src/enrollments/service.ts`, the global mastery tables, candidate generation, and path construction.

### Example

```text
Course A assessment: Recursion mastery becomes 0.82
Course B requirement: Recursion target is 0.75
Result: Course B recognizes the skill and may unlock Trees
```

If confidence is insufficient or retention is at risk, recognition may be withheld or revision may be recommended. Mastery alone is not blindly trusted.

### Trust boundary

Cross-course reuse is based on persisted evidence-derived knowledge, not course-title similarity or a hardcoded demo state.

### Panel-ready answer

> We separate enrollment progress from knowledge. A learner can have several course paths, but only one evidence-based mastery state per global skill. That is what enables safe cross-course prerequisite reuse.

---

## 4. Evidence Ledger

### What it does

The evidence ledger records the events that justify every learner knowledge estimate.

### Nontechnical explanation

LearnPath should never say “mastery is 78%” without being able to answer, “Based on what?” The ledger is that answer.

### Technical implementation

`skill_evidence` is an append-only PostgreSQL ledger. Each record can preserve:

- learner and skill;
- source type, such as diagnostic, practice, assessment, or retention check;
- score and correctness;
- difficulty and cognitive level;
- attempt/session context;
- mastery before and after;
- timestamp and provenance.

Database triggers reject updates and deletes on the ledger. Corrections must be represented as additional auditable events rather than silently rewriting history.

The API writes evidence and updates the affected learner-skill state transactionally. It locks only the relevant learner-skill row to prevent concurrent updates from losing evidence.

### Why activity is not evidence

Opening a lesson, watching a resource, or clicking “complete” records activity and progress. It does not directly increase mastery. Only scored or otherwise qualified learning evidence updates knowledge.

### Evidence states

LearnPath communicates the strength of its claim with four states:

```text
UNKNOWN -> ESTIMATED -> ASSESSED -> VERIFIED
```

These states depend on evidence volume, source diversity, session diversity, consistency, confidence, and retention evidence.

### Trust boundary

Every knowledge change is traceable to evidence. The system never treats an interface click or ML score as proof of mastery.

### Panel-ready answer

> Mastery is not an editable profile value. It is a derived state supported by an immutable evidence ledger. That makes recommendations explainable and prevents lesson completion from being confused with actual knowledge.

---

## 5. Global Mastery and Confidence Engine

### What it does

This engine converts new assessment evidence into an updated mastery estimate and a separate confidence estimate.

### Nontechnical explanation

Mastery answers, “How well does the learner appear to know the skill?” Confidence answers, “How certain are we about that estimate?” A score of 80% from one easy question should not be treated like 80% supported by varied evidence across several sessions.

### Technical implementation

For the simple assessment update, the code uses a weighted moving update:

```text
new_mastery = 0.60 * previous_mastery + 0.40 * assessment_score
```

If there is no previous state, the first qualified assessment initializes mastery from the bounded score. The general evidence update varies the weight by evidence source:

```text
starting_mastery = previous_mastery, or 0.50 when absent
effective_weight = policy weight for the evidence source
new_mastery = starting_mastery * (1 - effective_weight)
            + performance * effective_weight
```

Question performance is adjusted by difficulty before aggregation. Strong performance on a more difficult item contributes more information than the same binary outcome on an easy item.

Confidence is computed separately. The implementation combines:

```text
base signal
+ evidence-count signal
+ source-diversity signal
+ session-diversity signal
+ difficulty signal
+ consistency signal
+ retention-evidence signal
```

The count component uses diminishing returns:

```text
count_signal = 0.45 * (1 - exp(-evidence_count / 6))
```

This means early observations add useful confidence, but many repeated observations cannot increase confidence without limit. Diagnostic confidence is also capped so a short diagnostic cannot claim permanent verification.

Primary implementation: `apps/api/src/mastery/service.ts`.

### Why mastery and confidence are separate

Consider two learners:

```text
Learner A: mastery 0.80, confidence 0.25
Learner B: mastery 0.80, confidence 0.86
```

They have the same point estimate but not the same certainty. Learner A may need confirmation; Learner B may safely receive advanced work.

### Trust boundary and limitations

Mastery is an interpretable estimate, not a claim of perfect psychological measurement. The UI shows confidence and evidence state so uncertainty remains visible.

### Panel-ready answer

> We do not update mastery from one click or treat one score as certainty. New evidence produces a bounded weighted update, while confidence grows separately from evidence count, diversity, difficulty, consistency, and repeated sessions.

---

## 6. Adaptive Diagnostic Engine

### What it does

The diagnostic engine efficiently estimates relevant prior knowledge, detects gaps, verifies surprising claims, and clearly labels untested skills.

### Nontechnical explanation

The diagnostic is not a fixed 20-question exam that pretends to measure an entire subject. It asks the **next most informative question** based on what is already known. A first answer is a probe, not a final verdict.

### Technical implementation

The server selects one question at a time, with a maximum budget of 15. The budget is divided conceptually into:

- up to 5 broad coverage probes;
- confirmation questions for uncertain or important skills;
- the final 2 slots for independent verification where needed.

Candidate priority includes:

```text
unknown-skill priority
+ mastery gap
+ uncertainty (1 - confidence)
+ retention risk
+ graph importance / dependent count
+ difficulty fit
+ information gain
+ verification need
+ limited continuity
```

The desired difficulty adapts to current mastery: lower estimates receive easier confirmation; stronger estimates receive harder application or analysis items.

Question performance is weighted by item discrimination and difficulty. Diagnostic reliability grows from:

- number of observations;
- diversity of cognitive levels;
- response consistency;
- independent evidence rather than repeated variants of the same item.

The reported interval is:

```text
width = 0.06 + (1 - confidence) * 0.22 / sqrt(observation_count)
interval = [mastery - width, mastery + width], clamped to [0, 1]
```

More evidence and greater confidence narrow the range.

Diagnostic classifications include concepts such as:

- `PROBED`: one observation; useful but not certified;
- `READY`: enough positive evidence for current use;
- `GAP`: strong evidence of missing knowledge;
- `MASTERED`: requires at least three varied observations and higher-order success;
- `REVISION`: prior mastery exists but retention is at risk;
- `UNTESTED`: no direct observation was collected.

Primary implementation: `apps/api/src/diagnostics/service.ts`, `selection.ts`, and `estimation.ts`.

### Handling the rare “advanced but weak in basics” learner

LearnPath does not assume a perfectly monotonic learner. If someone answers an advanced question correctly but misses a prerequisite:

1. the result is treated as surprising evidence;
2. the engine asks a confirmation question at the disputed prerequisite or applies another advanced item;
3. the prerequisite remains governed by its own mastery and confidence state;
4. the system can recommend targeted revision without erasing the learner's advanced evidence.

This prevents one contradictory response from either unlocking everything or forcing the learner through an entire beginner course.

### After completion

The diagnostic result updates mastery and confidence through evidence, marks affected paths stale, regenerates the selected course path, and takes the learner directly to the personalized path. There should be no unnecessary “at a glance” intermediate screen.

### Trust boundary and limitations

A short diagnostic cannot measure every skill. The engine explicitly reports untested skills and wide uncertainty instead of inventing precision. A single question can update a belief, but cannot establish verified mastery.

### Panel-ready answer

> Our diagnostic is an adaptive evidence-gathering process. It starts with broad coverage, confirms uncertainty, and verifies surprising answers. One question creates a probe, not mastery. The result includes confidence intervals and openly reports skills that were not tested.

---

## 7. Knowledge Graph v2

### What it does

The knowledge graph represents which skills depend on which other skills and uses that structure to decide readiness, explain locks, find gateway skills, and order learning.

### Nontechnical explanation

The graph is LearnPath's map of the subject. It stops the recommender from suggesting an attractive advanced topic before the learner is ready. It also identifies a foundational skill whose improvement can unlock several later topics.

### Graph representation

```text
Node = global skill
Edge = prerequisite relationship
```

Each edge stores:

- prerequisite skill;
- dependent skill;
- relationship type: `REQUIRED` or `RECOMMENDED`;
- required mastery threshold;
- strength and rationale;
- active/version metadata.

PostgreSQL is the graph source of truth. The project intentionally uses a relational adjacency-list representation because the graph is curriculum-sized, transactions and joins with learner evidence are important, and Neo4j would add operational complexity without being necessary for the demonstrated scale.

### Three graph layers

**1. PostgreSQL — durable graph truth**

The database stores nodes, edges, thresholds, and curriculum mappings. Constraints and a recursive cycle-detection trigger prevent invalid circular prerequisite chains.

**2. TypeScript — authoritative learner-specific gate**

For every required prerequisite, the API compares confidence-adjusted current knowledge with the edge's required mastery:

```text
known mastery + sufficient confidence + acceptable retention
    -> prerequisite satisfied

unknown, low-confidence, or decayed knowledge
    -> prerequisite not safely satisfied
```

Only `REQUIRED` edges block eligibility. `RECOMMENDED` edges are advisory. Unknown knowledge never silently passes.

**3. Python NetworkX — derived analytics**

The API sends a course graph snapshot to the stateless Python service. NetworkX validates acyclicity, computes topological order and depth, counts downstream reach, and calculates a gateway score. Gateway skills can receive a bounded priority bonus because improving them opens more future options.

NetworkX does not own the graph, update learner state, unlock skills, or create a path. If it is unavailable, the API falls back to safe deterministic graph behavior; it never ignores required prerequisites.

### Why not Neo4j?

Neo4j is a valid future option for a much larger, highly connected, multi-domain knowledge graph with exploratory traversals at scale. In this project:

- PostgreSQL is already the transactional system of record;
- recursive CTEs are sufficient for 36 active skills and their ancestors;
- the API needs strong joins with enrollments, mastery, evidence, and courses;
- NetworkX provides the graph algorithms needed for novelty and demonstration.

Therefore the decision is architectural proportionality, not a lack of graph technology.

### Trust boundary

The graph can constrain ML; ML cannot override the graph. This is the key safety property:

```text
prerequisite gate first -> ML ranking second
```

Primary implementation: `database/migrations/0003_curriculum_graph.sql`, `0008_prerequisite_graph_engine.sql`, `apps/api/src/prerequisites/engine.ts`, `apps/api/src/prerequisites/service.ts`, and `services/ml/app/graph/service.py`.

### Panel-ready answer

> Knowledge Graph v2 is a hybrid graph architecture. PostgreSQL stores the authoritative curriculum graph, TypeScript applies confidence-aware prerequisite rules per learner, and NetworkX computes topology and gateway analytics. The graph filters unsafe choices before ML ranks the remaining skills.

---

## 8. Retention and Forgetting Engine

### What it does

The retention engine estimates whether previously demonstrated knowledge is still likely to be usable and identifies genuine revision needs.

### Nontechnical explanation

Mastery is not permanent. A learner who performed well three months ago may need a short review today. LearnPath distinguishes “never learned” from “learned before but becoming rusty.”

### Technical implementation

Retention follows an exponential forgetting model:

```text
retention = mastery * exp(-effective_lambda * days_since_evidence)
```

The effective decay rate is personalized by confidence and repetition:

```text
confidence_factor = 1.15 - 0.50 * confidence
repetition_factor = 1 / (1 + bounded(0.12 * log(1 + evidence_count)))
effective_lambda = base_lambda * confidence_factor * repetition_factor
```

Therefore high-confidence knowledge with repeated evidence decays more slowly than a fragile estimate based on little evidence.

Retention states are:

```text
UNKNOWN -> STRONG -> MODERATE -> AT_RISK -> CRITICAL
```

Revision is recommended only when:

1. the learner previously demonstrated at least the policy's mastery floor; and
2. the projected retention is now `AT_RISK` or `CRITICAL`.

This avoids calling an unlearned skill “forgotten.” It remains a learning gap instead.

Primary implementation: `apps/api/src/retention/service.ts` and retention policy configuration.

### Verification

The learner can take a real retention check. The server scores it and records `RETENTION_CHECK` evidence. That evidence can restore or reduce confidence and mastery and trigger a new path.

### Trust boundary and limitations

Retention is a model-based estimate, not direct observation. That is why the interface exposes the state and offers a check. The decay parameters are policy values and should later be calibrated with longitudinal real-learner data.

### Panel-ready answer

> We model forgetting with exponential decay, slowed by confidence and repeated evidence. We only label a skill for revision when it was previously demonstrated and has since decayed. A real retention check can then replace prediction with fresh evidence.

---

## 9. Skill-Gap Detection

### What it does

Skill-gap detection compares the learner's usable knowledge with each course's required target.

### Nontechnical explanation

A gap is not simply “the lesson is incomplete.” It means the learner's evidence-backed mastery is below what this course expects, or knowledge is still unknown.

### Technical implementation

For a measured skill:

```text
mastery_gap = max(0, target_mastery - current_mastery)
```

Unknown mastery remains `null` rather than being presented as a confident zero. The engine also considers:

- confidence;
- evidence state;
- retention state;
- whether the skill is a required prerequisite;
- whether current global mastery already satisfies the course target.

The diagnostic results and Skill Passport visualize gaps, readiness, untested areas, and recognized prior knowledge.

### Trust boundary

Gap status comes from course targets plus global evidence. It is not generated by the recommendation model and is not inferred from course completion alone.

### Panel-ready answer

> A gap is a difference between the course target and the learner's current usable, evidence-backed mastery. Unknown knowledge stays unknown, and confidence and retention are shown alongside the point estimate.

---

## 10. Candidate Skill Generation

### What it does

Candidate generation determines which skills may safely be considered for the next recommendation.

### Nontechnical explanation

Before asking ML to choose the best next skill, LearnPath creates a safe shortlist. It includes relevant gaps and revision needs, includes supporting prerequisites, and separates locked or already covered skills.

### Technical implementation

The generator starts with the selected course's skills and recursively adds required prerequisite ancestors. Every skill is assigned to one of three pools:

```text
ELIGIBLE = relevant and prerequisite-ready
LOCKED   = relevant but missing required prerequisites
EXCLUDED = already covered by strong current knowledge
```

Eligible candidate kinds are:

- `LEARN`: a direct course skill with a knowledge gap;
- `SUPPORTING_PREREQUISITE`: an ancestor needed to make later learning possible;
- `REVISION`: previously demonstrated knowledge whose retention is at risk.

Each candidate carries live signals such as:

- mastery and mastery gap;
- confidence and evidence state;
- retention and revision status;
- prerequisite satisfaction details;
- course/module context;
- available resources and questions;
- dependency depth and graph metrics.

Two deterministic baselines are also calculated over **eligible candidates only**:

- Highest Skill Gap;
- Observed Popularity / curriculum coverage.

These baselines support evaluation. They are not presented as ML and do not bypass eligibility.

Primary implementation: `apps/api/src/candidates/engine.ts` and its service/query layer.

### Trust boundary

Locked skills are never sent to ML. A model score cannot turn an ineligible skill into Learn Next.

### Panel-ready answer

> Candidate generation is the safety and relevance stage. It combines the course, global knowledge, retention, and the prerequisite graph to produce eligible, locked, and covered pools. Only the eligible pool is passed to ML.

---

## 11. Synthetic Data Simulator

### What it does

The simulator creates realistic training interactions when real institutional learner data is unavailable.

### Nontechnical explanation

A final-year project usually cannot collect thousands of real, longitudinal student interactions. Instead of pretending otherwise, LearnPath creates a documented synthetic population with different abilities and behaviors, then clearly labels the model as synthetically trained.

### Technical implementation

The curriculum-only exporter sends no real users or evidence into the simulator. With a fixed seed of 42, the simulator creates:

- 1,000 synthetic learners;
- 20,000 sequential learner-skill interactions;
- different ability, pace, engagement, persistence, and forgetting archetypes;
- prerequisite readiness, practice history, time spent, assessment outcome, completion, and feedback noise.

Each row represents a decision-time feature state and a later observed outcome. The `beneficial` target is produced by a versioned weighted outcome rule combining signals such as learning gain, successful completion, engagement, and feedback.

The generated CSV is used only for offline experimentation. It is never imported as if it were real application evidence.

### Why a fixed seed matters

Seed 42 makes the experiment reproducible. Another reviewer can regenerate the same dataset, split, model comparison, and metrics.

### Trust boundary and limitations

Synthetic data validates pipeline behavior and supports an initial prototype; it does **not** prove real educational effectiveness. Real deployment would require consented learner data, bias checks, recalibration, and prospective evaluation.

### Panel-ready answer

> We use a reproducible curriculum-grounded simulator because real longitudinal data is unavailable. It trains and tests the pipeline, but we explicitly label synthetic performance as engineering evidence, not proof of real-world learning impact.

---

## 12. Feature Engineering and Data-Leakage Prevention

### What it does

Feature engineering converts each eligible learner-skill pair into the exact numeric representation expected by the ML model.

### Nontechnical explanation

The model does not receive a learner's name or an arbitrary course label. It receives a structured description of readiness: mastery, confidence, retention, history, prerequisite state, and skill context.

### Technical implementation

The versioned contract is:

```text
learner-candidate-features-v2
```

It contains exactly 55 numeric features in a fixed order. Major groups are:

- learner state and experience;
- global and candidate mastery;
- confidence and evidence strength;
- recent performance and trend;
- retention and revision status;
- prerequisite counts and readiness;
- dependency depth and downstream importance;
- course/context coverage;
- activity, pace, engagement, and expected time.

At runtime the TypeScript API builds these vectors from current PostgreSQL data. During training the Python pipeline applies the same names, order, numeric bounds, and validation rules.

Identifiers are metadata, not predictive numeric inputs. The target label is kept separate from the feature matrix.

### Leakage prevention

For each simulated interaction, historical features are shifted so that they include only events available **before** that recommendation. Current or future outcome fields are blocked, including:

- current completion;
- post-assessment result;
- current learning gain;
- current feedback;
- computed benefit score;
- the `beneficial` target itself.

Without this rule, the model could appear highly accurate by seeing the answer it was meant to predict.

Primary implementation: `services/ml/app/features/contract.py` and `apps/api/src/paths/features.ts`.

### Trust boundary

Inference fails if feature count, names, order, bounds, or contract version differ. It does not silently fill an incompatible vector.

### Panel-ready answer

> We use a versioned 55-feature contract shared by training and live inference. Features describe only information available at recommendation time, and the pipeline explicitly blocks post-outcome fields to prevent data leakage.

---

## 13. Offline ML Training and Model Selection

### What it does

This module trains several models, compares them fairly, and selects one based on ranking quality rather than choosing a favorite algorithm in advance.

### Nontechnical explanation

ML is used for one bounded question:

> Among skills that are already relevant and safe to learn, which one is most likely to benefit this learner now?

It does not decide prerequisites, generate mastery, or invent curriculum.

### Technical implementation

The experiment compares:

- Random Forest;
- Gradient Boosting;
- Logistic Regression;
- Highest Skill Gap baseline;
- Popularity baseline.

Learners, not rows, are divided into deterministic 70/15/15 train, validation, and test sets. This prevents the same synthetic learner's behavior from appearing in both training and test data.

Model selection uses validation `NDCG@5`, with ROC-AUC and F1 as tie-breakers. The classification threshold is also chosen on validation data. The test set remains untouched until the final evaluation.

Metrics include:

- Accuracy, Precision, Recall, F1;
- ROC-AUC;
- Precision@3 and Precision@5;
- Recall@5;
- NDCG@5.

The selected artifact is a Random Forest. Recorded results include:

```text
Validation NDCG@5: Random Forest 0.581021
Validation NDCG@5: Highest Gap  0.576408
Test NDCG@5:       Random Forest 0.578463
Test NDCG@5:       Highest Gap  0.581229
Test ROC-AUC:       Random Forest 0.801410
Test Precision@5:   Random Forest 0.525333
```

### How to explain the mixed result honestly

Random Forest won the predefined selection rule on validation data, so it was frozen before test evaluation. The gap baseline slightly exceeded it on test NDCG@5. That is not hidden. It demonstrates why a model must be compared with simple baselines and why synthetic results are not sufficient evidence for deployment claims.

### Why Random Forest is reasonable here

Random Forest handles nonlinear feature interactions, requires little feature scaling, tolerates heterogeneous signals, and remains easier to inspect and operate than a deep model for this dataset size.

### Trust boundary and limitations

The model predicts a synthetic benefit label. It is a prototype ranking component, not a causal proof that its top-ranked skill will improve every real learner.

Primary implementation: `services/ml/app/training/experiment.py` and saved model manifests/artifacts.

### Panel-ready answer

> We trained three ML models and two deterministic baselines using learner-disjoint splits. Random Forest won our predefined validation ranking metric, although Highest Gap was slightly better on test NDCG@5. We report that honestly and treat the model as a validated prototype, not proven real-world pedagogy.

---

## 14. Checked ML Inference Service

### What it does

The inference service converts eligible feature vectors into predicted learning-benefit probabilities while enforcing compatibility with the trained model.

### Nontechnical explanation

The live app does not simply call a Python function and hope the inputs match. It verifies that the deployed model and current feature contract belong together. If they do not, path generation fails visibly instead of producing fake recommendations.

### Technical implementation

The FastAPI `/predict` endpoint is stateless. At startup or request time it validates:

- model and contract version;
- artifact checksum;
- exact 55 feature names;
- exact feature order;
- finite numeric values;
- allowed value ranges;
- manifest compatibility.

It returns a benefit probability for each already-eligible skill. It performs no database writes.

Failure behavior is explicit:

```text
503 = model missing or incompatible
422 = invalid feature payload
```

There is no silent heuristic fallback presented as ML. A deterministic baseline can still be shown separately in an evaluation view, but it is never mislabeled as a model result.

Primary implementation: `services/ml/app/inference/service.py` and the API inference client.

### Trust boundary

The service cannot receive locked candidates in the intended flow, cannot override prerequisite status, and cannot mutate mastery or paths.

### Panel-ready answer

> Our inference service is fail-closed. It checks artifact checksum, model version, and the exact 55-feature schema before scoring. If the contract is incompatible, the API returns an explicit error rather than fabricating a ranking.

---

## 15. Dependency-Aware Personalized Path Engine

### What it does

The path engine turns recognized, eligible, and locked skills into a clear learning journey centered on one actionable Learn Next recommendation.

### Nontechnical explanation

The path tells the learner:

```text
what is already recognized
-> what they are currently doing
-> what to learn next
-> what comes later
-> what remains locked and why
```

### Technical implementation

One path belongs to one course enrollment. There is no ambiguous single global course path.

Only eligible candidates are scored by ML. Final candidate priority is:

```text
priority = min(
  1,
  ML benefit probability
  + 0.08 if revision is due
  + 0.06 * NetworkX gateway score
)
```

The graph bonus is bounded and transparent. It can help prioritize a skill that unlocks more future learning, but it cannot make a locked skill eligible.

The path uses five lanes:

- `RECOGNIZED`: global knowledge already meets the course target;
- `CURRENT`: learning already in progress;
- `RECOMMENDED_NEXT`: highest-priority eligible action;
- `UPCOMING`: other eligible skills in ranked order;
- `LOCKED`: prerequisites not yet satisfied.

Each item stores a decision-time snapshot:

- mastery, confidence, and retention;
- prerequisite readiness;
- ML probability and final priority;
- course context;
- reason codes and human explanation;
- model, feature contract, and graph provenance.

Path generation is idempotent. Repeating the same request does not create uncontrolled duplicate active paths. Merely showing a recommendation does not alter mastery or course progress.

Primary implementation: `apps/api/src/paths/engine.ts`, `features.ts`, and `service.ts`.

### Trust boundary

The path is an auditable snapshot, not an opaque live calculation in the browser. Locked items explain exactly which required prerequisites are missing and are not sent to ML.

### Panel-ready answer

> The path combines deterministic safety with probabilistic ranking. The knowledge graph first creates the safe eligible set; ML estimates benefit within that set; bounded retention and gateway bonuses refine priority; then the API persists an explainable five-lane path snapshot.

---

## 16. Dynamic Path Regeneration and Change Explanation

### What it does

This module ensures that the path changes after relevant new evidence and shows the learner what changed.

### Nontechnical explanation

A personalized path is not a one-time generated playlist. If the learner performs better or worse than expected, the recommendation should adapt.

### Technical implementation

When qualified evidence updates a learner-skill record, the same database transaction marks every affected current path for that learner as `STALE`.

Stale paths are excluded from active cross-course coordination. On explicit regeneration, LearnPath reruns:

```text
retention refresh
-> graph readiness
-> candidate generation
-> live feature building
-> ML prediction
-> path construction
```

The previous path becomes immutable `SUPERSEDED`, and the new version becomes `ACTIVE`. A database rule allows only one current `ACTIVE` or `STALE` path per enrollment while preserving historical versions.

The comparison endpoint explains:

- previous versus current Learn Next;
- lane changes;
- newly recognized skills;
- newly unlocked skills;
- mastery/confidence/retention snapshot changes.

### Demonstration sequence

```text
Learner takes assessment for Recursion
-> Recursion evidence changes mastery/confidence
-> all dependent paths become stale
-> regeneration rechecks Trees prerequisites
-> Trees moves from LOCKED to RECOMMENDED_NEXT
-> UI shows the path change and reason
```

### Trust boundary

Historical paths are preserved. The system can explain a changed recommendation without rewriting the earlier decision.

### Panel-ready answer

> New evidence invalidates old recommendations transactionally. Regeneration creates a new version, preserves the superseded path, and reports exactly which skills moved, unlocked, or became recognized.

---

## 17. Learning Resources and “Start Learning” Flow

### What it does

This module converts Learn Next from an explanation into an actual learning action.

### Nontechnical explanation

When the learner presses Start Learning, the application should open the exact resource attached to the recommendation—not a generic course overview or a dead button.

### Technical implementation

The path item carries skill and course context. The API resolves an actionable study resource for that skill. Starting the resource records activity, while completing it records resource/course progress.

The resource screen returns the learner to the next appropriate action: practice, assessment, or the regenerated path depending on the workflow.

Resource activity is intentionally separated from mastery evidence:

```text
resource opened/completed -> activity and progress
scored practice/assessment -> knowledge evidence
```

### Trust boundary

The button navigation is tied to an API-backed path item. It must not hardcode a demo skill or mutate mastery merely because a learner viewed content.

### Panel-ready answer

> Start Learning operationalizes the recommendation by resolving a real resource for the selected path item. Viewing content changes activity and progress, while only scored evidence can change mastery.

---

## 18. Practice, Assessment, and Scoring

### What it does

Practice and assessment generate the fresh evidence that closes the adaptive loop.

### Nontechnical explanation

The learner studies a recommended skill, answers real questions, and receives feedback. Their path changes only if the resulting evidence changes what the system believes.

### Technical implementation

Question selection uses the skill, course context, assessment type, difficulty, and prior attempts. Answers are scored on the server. The browser does not send a trusted mastery value.

The attempt transaction records:

- selected question and answer;
- correctness/score;
- difficulty and cognitive level;
- evidence source;
- mastery before and after;
- updated confidence/evidence state;
- path invalidation where required.

Practice can provide repeated low-stakes evidence. A formal assessment carries an appropriate source weight. Retention checks are recorded with a distinct source type.

Primary implementation: `apps/api/src/practice/service.ts`, assessment services, and mastery evidence integration.

### Trust boundary

The server owns answer keys and scoring. The UI cannot award itself mastery. Where a question format requires rubric-based evaluation, the rubric and evidence strength must be explicit.

### Panel-ready answer

> Learning becomes adaptation through server-scored evidence. The assessment service records an auditable attempt, the mastery engine updates only the affected skill, and current paths become stale so the next recommendation can be recomputed.

---

## 19. Cross-Course Recommendation Coordination

### What it does

This module helps a learner with several active courses decide which course-level Learn Next deserves attention now.

### Nontechnical explanation

Each course keeps its own path, but the dashboard should not always show whichever course was loaded first. It compares the active course recommendations and highlights the best current action while still allowing course switching.

### Technical implementation

Coordination reads independent active paths. It groups recommendations that refer to the same global skill across courses and applies the bounded score:

```text
coordination_score = min(
  1,
  best_course_priority
  + 0.04 * min(additional_course_contexts, 2)
  + 0.06 * active_goal_relevance
)
```

A skill useful in several current courses can therefore receive a small, explainable coordination bonus. An active goal is an optional lens; it cannot unlock a skill, create a candidate, or bypass a course's graph.

The normal coordination read is read-only. An explicit generation action creates only missing course paths rather than silently replacing existing history.

### Trust boundary

Coordination selects among valid course recommendations. It does not merge all curricula into an unsafe universal sequence.

### Panel-ready answer

> Every enrollment owns an independent dependency-aware path. The dashboard then coordinates their valid Learn Next items using bounded cross-course reuse and goal relevance, so multiple enrollments remain visible and one hardcoded course cannot dominate.

---

## 20. Recommendation Explanation and Feedback

### What it does

This module explains why a skill was selected and records whether the learner accepts or declines the recommendation.

### Nontechnical explanation

The learner should see more than “AI recommends Trees.” LearnPath explains the evidence gap, prerequisite readiness, retention need, model benefit estimate, and graph importance behind the choice.

### Technical implementation

Each persisted path item contains reason codes and a generated explanation, for example:

- `PREREQUISITES_SATISFIED`;
- `ML_HIGHEST_PRIORITY`;
- `MASTERY_GAP`;
- `RETENTION_REVISION`;
- `NETWORKX_GATEWAY_PRIORITY`;
- `GLOBAL_MASTERY_REUSED`.

Feedback is accepted only for the current active path and its `RECOMMENDED_NEXT` item. Acceptance can bind the exact chosen resource. Decline requires a structured reason rather than an ambiguous click.

The feedback record freezes:

- path version and skill;
- model/contract version;
- pre-recommendation state;
- acceptance or decline reason;
- later observation status.

The system observes outcomes for up to 30 days. Learning gain is calculated only when a real pre-recommendation baseline exists; otherwise the record is labeled `OBSERVED_NO_BASELINE` rather than manufacturing a gain value.

### Trust boundary

Feedback and later outcomes are associations, not automatically causal effects. “The learner improved after accepting” does not prove that the recommendation alone caused the improvement.

### Panel-ready answer

> Explanations are persisted with the decision, not invented later in the UI. Feedback is tied to an exact active path version, and later outcomes are measured only when a valid baseline exists. We describe them as observational, not causal.

---

## 21. Global Skill Passport

### What it does

The Skill Passport gives a course-independent view of everything LearnPath currently knows—and does not know—about the learner.

### Nontechnical explanation

It is a living knowledge profile. The learner can see which skills are strong, uncertain, forgotten, untested, or reusable in other courses.

### Technical implementation

The page combines:

- global mastery;
- confidence;
- evidence state;
- retention state;
- evidence count and recent evidence;
- course contexts in which the skill is used;
- prerequisite and dependent relationships.

Values come from API endpoints backed by the same learner-skill state and evidence ledger used by recommendation generation. The page does not maintain a second, frontend-only knowledge model.

### Trust boundary

Unknown and low-confidence states remain visible. The passport is not a gamified badge system that converts course completion into certified knowledge.

### Panel-ready answer

> The Skill Passport is the learner-facing projection of our global knowledge model. It makes mastery, confidence, retention, evidence strength, and cross-course reuse visible in one place.

---

## 22. Learner Dashboard and Core UI Flow

### What it does

The dashboard turns the system's intelligence into an understandable next action.

### Nontechnical explanation

Within a few seconds, a learner or reviewer should understand:

```text
What do I know?
What am I missing?
What should I learn next?
Why was it chosen?
What is locked, and what unlocks it?
```

### Intended learner flow

```text
Login
-> Dashboard with all active courses
-> choose course
-> take diagnostic if no reliable starting state exists
-> personalized path opens directly
-> Start Learning on Learn Next
-> practice / assessment
-> mastery and retention update
-> path regenerates
-> learner sees what changed
```

### Technical implementation

The React frontend consumes real endpoints for dashboard coordination, course paths, diagnostic state, graph readiness, passport data, retention, activity, and path history.

The personalized path is the visual centerpiece. It uses status, mastery, confidence, retention, prerequisites, explanation, and course context from the persisted API response. The browser does not recalculate priority or inject demo values.

Important pages include:

- `LearnerDashboardPage.tsx`;
- `CourseWorkspacePage.tsx`;
- `DiagnosticPage.tsx`;
- `PersonalizedPathPage.tsx`;
- `PrerequisiteGraphPage.tsx`;
- `SkillPassportPage.tsx`;
- `RetentionPage.tsx`;
- `PracticePage.tsx`;
- `StudyResourcePage.tsx`.

### UX principles

- Keep one dominant action: Learn Next.
- Show all active courses and remember the selected course.
- Open the generated path directly after diagnosis.
- Explain locked skills inline.
- Keep technical labs and reviewer tools out of the normal learner navigation.
- Provide loading, error, empty, and stale-path states.
- Use accessible buttons and real navigation targets.

### Trust boundary

The interface visualizes server decisions. It cannot generate fake mastery, ML probability, or path items for appearance.

### Panel-ready answer

> Our UI is an explanation layer for the adaptive engine. The main flow moves directly from diagnosis to a five-lane personalized path, then from Learn Next to real content and evidence. Every displayed mastery, lock, reason, and recommendation comes from the backend.

---

## 23. Reviewer, Inference Lab, and Governance Views

### What it does

These views make the system auditable without cluttering the learner workflow.

### Nontechnical explanation

A learner needs a simple next action. A reviewer needs proof of how that action was produced. LearnPath separates those needs.

### Technical implementation

Reviewer-oriented pages expose:

- candidate pools and exclusion reasons;
- graph structure and gateway metrics;
- the exact feature contract and inference provenance;
- path versions and change history;
- feedback outcomes;
- model-health and governance status.

Governance metrics are computed from persisted paths, predictions, feedback, activity, evidence, and curriculum data—not from hardcoded cards.

Minimum evidence thresholds prevent misleading statistics:

```text
response rates:             at least 30 feedback responses
calibration:                at least 30 assessed outcomes
drift comparison:           at least 50 predictions per window
retraining eligibility:     at least 100 assessed outcomes
```

Below a threshold, the UI deliberately displays **Withheld / Insufficient evidence**.

There is no automatic model retraining or promotion. A human-controlled workflow reviews data, experiments, metrics, limitations, and version changes before deployment.

### Trust boundary

Sparse demo data is not padded to produce attractive charts. Model monitoring is conservative and model promotion remains a deliberate human decision.

### Panel-ready answer

> We separate learner simplicity from reviewer transparency. Technical views expose candidates, graph analytics, model provenance, and path history. Governance metrics are withheld until sample thresholds are met, and no model is automatically retrained or promoted.

---

## 24. Testing, Validation, and Why the System Is Trustworthy

### What it does

Testing verifies the boundaries where adaptive systems commonly fail: prerequisites, evidence updates, feature compatibility, path versioning, and frontend/API consistency.

### Technical validation

The final recorded verification includes:

```text
API unit tests:                  90 passing
Web tests:                       40 passing
PostgreSQL integration tests:    17 passing
ML/Python tests:                 35 passing
Typecheck, lint, and production build: passing
```

Coverage includes:

- prerequisite satisfaction and unknown-state behavior;
- graph route and NetworkX analytics integration;
- candidate eligible/locked/excluded partitioning;
- feature contract enforcement;
- path construction and provenance;
- cross-course coordination;
- path change comparison;
- mastery and evidence rules;
- UI API integration.

The final content audit records:

```text
5 courses
36 active skills
36/36 lesson coverage
36/36 diagnostic coverage
36/36 practice coverage
36/36 separate assessment coverage
36/36 actionable Learn Next coverage
5 demonstration learners
```

### The complete trust model

LearnPath is trustworthy not because it claims perfect intelligence, but because it makes uncertainty and boundaries explicit:

1. **Evidence before knowledge claims** — mastery changes have an auditable cause.
2. **Confidence separate from mastery** — one answer cannot masquerade as certainty.
3. **Graph before ML** — an attractive model score cannot bypass prerequisites.
4. **Versioned contracts** — incompatible feature/model deployments fail closed.
5. **Immutable path history** — recommendation changes remain explainable.
6. **No fake fallback** — missing ML is reported, not disguised.
7. **Unknown remains unknown** — the system does not fill missing knowledge with invented precision.
8. **Synthetic limitation disclosed** — offline metrics are not overstated as real-world benefit.
9. **Human model governance** — retraining and promotion are not automatic.
10. **Real backend UI data** — demonstrations exercise the actual intelligence loop.

### Known limitations

- The selected Random Forest was trained on synthetic data.
- The current domain contains 5 courses and 36 active skills.
- Forgetting parameters need calibration with longitudinal real learners.
- Recommendation outcomes are observational, not causal.
- Course progress and global mastery are intentionally separate and may differ.
- Governance panels may withhold metrics in a small demo dataset.
- Automatic retraining and model promotion are not implemented by design.

### Panel-ready answer

> We trust the system through traceability, conservative uncertainty, separation of rules from ML, fail-closed contracts, versioned decisions, and automated tests. We also state what is not yet proven: synthetic model performance is not the same as real educational effectiveness.

---

## 25. Complete End-to-End Example

Assume a learner enrolls in **Data Structures** and **Algorithmic Problem Solving**.

### Step 1 — Existing global knowledge

The Skill Passport contains:

```text
Arrays:     mastery 0.84, confidence 0.82, retention STRONG
Recursion:  mastery 0.72, confidence 0.38, retention MODERATE
Trees:      unknown
Graphs:     unknown
```

### Step 2 — Course targets

Data Structures requires:

```text
Arrays 0.70 -> Recursion 0.70 -> Trees 0.75 -> Graphs 0.75
```

### Step 3 — Diagnostic

Arrays is recognized. Recursion has enough mastery but weak confidence, so the diagnostic asks confirmation questions. The learner answers one easy item correctly, one application item correctly, and an analysis item incorrectly.

The engine does not declare perfect mastery. It updates Recursion to a moderate estimate with a bounded confidence interval.

### Step 4 — Graph gate

Trees requires Recursion at 0.70 with sufficient confidence. If confidence is still below the gate, Trees remains locked and Recursion becomes an eligible confirmation/revision candidate. If confirmation raises confidence enough, Trees unlocks.

### Step 5 — Candidate generation

The pools may become:

```text
RECOGNIZED: Arrays
ELIGIBLE:   Recursion confirmation, Trees
LOCKED:     Graphs
EXCLUDED:   none
```

### Step 6 — ML ranking

Only Recursion and Trees receive 55-feature vectors. Suppose the model returns:

```text
Recursion benefit probability: 0.63
Trees benefit probability:     0.78
```

Trees also has gateway score 0.50, producing:

```text
Trees priority = min(1, 0.78 + 0.06 * 0.50) = 0.81
```

Trees becomes Learn Next.

### Step 7 — Learner UI

The path displays:

```text
RECOGNIZED        CURRENT        RECOMMENDED NEXT        LOCKED
Arrays            —              Trees                   Graphs
```

The explanation says that required prerequisites are satisfied, predicted benefit is 78%, and gateway analysis adds 3 percentage points because Trees supports later skills.

### Step 8 — Learning and assessment

The learner presses Start Learning, completes a real Trees resource, and then takes an assessment. Resource completion changes progress only. The scored assessment adds evidence and updates Trees mastery and confidence.

### Step 9 — Regeneration

The old path becomes stale. Regeneration preserves it as superseded, rechecks Graphs, reruns eligible features through ML, and creates a new active path.

### Step 10 — Visible intelligence

The UI now shows:

```text
Trees: RECOMMENDED_NEXT -> RECOGNIZED or CURRENT/covered
Graphs: LOCKED -> RECOMMENDED_NEXT
```

If Algorithmic Problem Solving also needs Trees, that course immediately recognizes the same global evidence. This single demonstration proves the complete LearnPath idea:

```text
assessment
-> evidence
-> mastery/confidence
-> cross-course reuse
-> prerequisite unlock
-> ML re-ranking
-> visible path change
```

---

## 26. Short Answers to Common Panel Questions

### “Where exactly is ML used?”

> ML ranks only prerequisite-eligible learner-skill candidates by predicted learning benefit. It does not calculate mastery, decide prerequisites, score assessments, or create curriculum.

### “Why do you need rules if you already have ML?”

> Educational safety and curriculum validity are deterministic constraints. ML is appropriate for ranking uncertain alternatives, not for overriding required prerequisites or evidence rules.

### “Can one question determine mastery?”

> No. One answer is one noisy observation. It can update an estimate and select a better next question, but diagnostic mastery requires repeated, varied, higher-order evidence and remains confidence-bounded.

### “How do 10–15 questions assess a large course?”

> They do not claim full coverage. The adaptive engine prioritizes gateways, gaps, uncertainty, and confirmation, then explicitly labels untested skills. Later practice and assessments continue refining the model.

### “What is novel?”

> The novelty is the integrated closed loop: one global cross-course knowledge state, confidence-aware prerequisite graph reasoning, retention-aware candidate generation, bounded ML ranking, and explainable path regeneration after real evidence.

### “Why NetworkX and not only database queries?”

> PostgreSQL is best for durable transactional truth and learner joins. NetworkX adds graph-specific topology, depth, downstream reach, and gateway analysis. The TypeScript API remains the authoritative gate between them.

### “Why not Neo4j?”

> Neo4j would be reasonable at larger graph scale, but PostgreSQL recursive queries plus NetworkX cover our present workload with fewer operational systems and stronger integration with evidence and enrollments.

### “How do you know the recommendation is correct?”

> We do not claim certainty. We prove that it is safe, reproducible, evidence-based, contract-valid, and better justified than an opaque suggestion. Real educational effectiveness still requires longitudinal learner evaluation.

### “What happens if the ML service fails?”

> The system returns an explicit failure and does not present a heuristic as ML. Prerequisite and learner data remain safe because the Python service is stateless and has no write authority.

### “What happens when knowledge is forgotten?”

> Retention decays from the last evidence anchor. If previously demonstrated mastery falls into an at-risk state, revision becomes an eligible candidate and can be verified with a real retention check.

### “How is the same skill reused across courses?”

> Both courses map to the same global skill ID. Evidence updates one learner-skill record, and every course compares that state with its own target and prerequisite thresholds.

### “Why is your result explainable?”

> Each path item persists its mastery, confidence, retention, prerequisite result, ML probability, graph bonus, reason codes, and model/contract version at decision time.

---

## 27. One-Minute Project Explanation

> LearnPath is an adaptive learning system that maintains one global, evidence-based knowledge model for each learner. A short adaptive diagnostic probes relevant skills but keeps mastery and confidence separate, so one answer cannot create false certainty. A prerequisite knowledge graph then divides skills into recognized, eligible, and locked groups. Only safe eligible candidates are converted into a versioned 55-feature representation and scored by a checked Random Forest model for predicted learning benefit. The path engine combines that probability with bounded retention and graph-gateway signals to create an explainable course-specific path. After the learner studies and completes a server-scored assessment, new evidence updates mastery and retention, invalidates the old path, and produces a versioned new recommendation. Because mastery is global, evidence from one course can satisfy prerequisites in another. The main contribution is therefore not a generic LMS or an isolated classifier; it is a visible, auditable closed loop from learner evidence to adaptive next action.

---

## 28. Final Technical Summary

| Layer | Responsibility | Must not do |
|---|---|---|
| React frontend | Visualize real state, collect answers, navigate learning flow | Calculate trusted mastery or invent recommendations |
| Express/TypeScript API | Authentication, scoring, mastery, retention, graph gate, candidates, paths, writes | Treat ML as authority over prerequisites |
| PostgreSQL | Durable curriculum, evidence, learner state, path history, integrity rules | Act as an opaque recommendation model |
| Python FastAPI | Checked Random Forest inference and NetworkX analytics | Write learner data, unlock skills, or create paths |
| Offline training pipeline | Synthetic simulation, leakage-safe feature engineering, model comparison | Claim synthetic metrics prove real-world learning benefit |

The architectural rule that best summarizes LearnPath is:

```text
Evidence establishes knowledge.
The graph establishes readiness.
ML ranks safe choices.
The path explains the decision.
New evidence changes the path.
```
