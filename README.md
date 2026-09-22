# LearnPath

**AI-Based Adaptive Personalized Learning Path Recommender for E-Learning Platforms**

LearnPath is designed to answer what a learner should learn next by combining global skill knowledge,
multiple course contexts, optional goals, performance evidence, prerequisite dependencies, retention,
measured ML evaluation, and checked benefit-probability inference.

This repository is a **complete local demonstration through Phase 23**. The frozen recommendation model and
governance boundary remain unchanged: LearnPath attributes response, lesson completion, and later assessed
evidence to immutable path/model versions, then explicitly regenerates stale paths. See
[the architecture](docs/architecture.md), [the final audit](docs/final-completion-audit.md),
[the demo runbook](docs/demo-runbook.md), [Knowledge Graph v2](docs/knowledge-graph-v2.md), and the
[evidence-driven adaptive diagnostic v5](docs/diagnostic-v5.md).

## Repository layout

```text
apps/
  api/          Express + TypeScript application API
  web/          React + TypeScript + Vite client
database/
  migrations/   Forward-only PostgreSQL migrations
docs/           Architecture and phase notes
scripts/        Database migration tooling
services/
  ml/           FastAPI/scikit-learn service boundary
```

## Prerequisites

- Node.js 22 or later and npm 10 or later
- Python 3.11 or later
- PostgreSQL 16 or later
- Docker with Compose (optional, for the containerized workflow)

## Local setup

1. Copy `.env.example` to `.env` and adjust values if needed.
2. Install JavaScript dependencies with `npm install`.
3. Create a Python virtual environment and install `services/ml/requirements-dev.txt`.
4. Start PostgreSQL and create the configured database/user.
5. Run `npm run db:migrate`.
6. Start the API and web client with `npm run dev`.
7. In another terminal, start the ML service:

   ```bash
   python -m uvicorn app.main:app --app-dir services/ml --reload --port 8000
   ```

For the presentation-ready dataset, run `npm run demo:seed` after API, PostgreSQL, and ML are healthy.
The login page then provides one-click access to five synthetic learner stories. Run `npm run content:check`
to enforce complete lessons and purpose-distinct diagnostic/practice/assessment coverage for every
recommendable skill.

Open `http://localhost:5173`. The web screen makes real liveness requests to both backend services.

### VS Code quick start

Open this repository in VS Code, choose **Terminal → Run Task**, and run
**LearnPath: Run full stack**. The checked-in workspace task starts the local PostgreSQL data directory,
the web/API development processes, and the Python ML service. This task targets the Windows development
environment used for this project (PostgreSQL 18 and the local `.venv`).

To regenerate the Phase 12 source data, Phase 13 features, and Phase 14 experiment:

```bash
npm run ml:data:export
npm run ml:synthetic:generate
npm run ml:features:generate
npm run ml:train:evaluate
```

## Containerized setup

```bash
docker compose up --build
```

After PostgreSQL becomes healthy, apply migrations from the host with `npm run db:migrate` or from a
one-off Node environment configured with the same `DATABASE_URL`. Automated migration execution will
be introduced when deployment infrastructure is added.

## Verification commands

```bash
npm run typecheck
npm run lint
npm test
npm run build
python -m pytest services/ml
```

With services running:

```bash
curl http://localhost:4000/health/live
curl http://localhost:4000/health/ready
curl http://localhost:8000/health/live
curl http://localhost:8000/health/ready
```

The API readiness route returns HTTP 503 when PostgreSQL cannot be reached. The liveness route remains
available so infrastructure can distinguish a running process from a service ready to accept work.

Authentication is available at `/register` and `/login`. `AUTH_ACCESS_TOKEN_SECRET` is mandatory; use
a securely generated value of at least 32 characters and never commit it.

After authentication, `/dashboard` loads real courses, optional goals, global skills, prerequisite
relationships, diagnostic state, and evidence summaries. Its evidence-to-readiness centerpiece works
from an enrollment without requiring a goal and shows what is unknown, locked, unlocked, or mastered.

`/diagnostic/:attemptId` delivers course- or goal-scoped questions without exposing correctness metadata.
Course diagnostics reveal one server-selected question at a time and stop when path-relevant evidence is
sufficient, normally after 12–22 questions and never after more than 28. Submission is all-or-nothing and
server-scored. Results show classifications, mastery intervals, difficulty/cognitive coverage, misconception
signals, explicit untested skills, cautious confidence, and an inspectable per-answer audit trail.

`/practice/:skillId` serves real questions and records immutable practice evidence. `mode=assessment` uses a
separate post-lesson question pool and assessed evidence weight. Correctness is
validated on the server; difficulty, evidence history, source diversity, and sessions feed the
central mastery/confidence policy. The result shows mastery and evidence strength before and after.

`/prerequisites` visualizes course or optional-goal readiness, dependency-valid layers,
mastered/unlocked/locked skills, and every threshold check. Unknown mastery never satisfies an edge;
mastery earned anywhere in the learner's global profile is recognized across all course contexts.

The dashboard also supports simultaneous enrollment in multiple courses. `/my-courses/:enrollmentId`
shows independent module progress, ordered module unlocking, pause/resume state, and the global skills
referenced by that course. Completing a module updates course progress only; it does not create or
change learner mastery.

`/skill-passport` reads the authenticated learner's global skill states from PostgreSQL. It separates
the mastery estimate from evidence confidence and exposes `UNKNOWN`, `ESTIMATED`, `ASSESSED`, and
`VERIFIED` states, current retention, revision flags, timestamps, practice actions, and cross-course reuse.

`/retention` calculates retained knowledge from the latest immutable performance evidence. It shows
historical mastery beside current retention, decay explanations, next-review timing, and real
retention checks. `RETENTION_BASE_LAMBDA` configures the base daily forgetting rate.

`/analytics` is learner-scoped and uses real persisted evidence to show assessed-only average mastery,
mastery progression, mastery and retention distributions, evidence-source coverage, completed lessons,
and observational recommendation outcomes. Unknown mastery is shown separately and never averaged as zero.

`/my-courses/:enrollmentId/candidates` generates the live enrollment candidate pool. It visualizes
eligible learning, supporting-prerequisite and revision candidates; prerequisite-locked skills;
already-covered skills; the source signals behind every classification; and two evaluation-only
baseline orders. Candidate generation works without a goal and never turns a baseline into Learn Next.

`/synthetic-data` reads the generated manifest from the ML service. It shows curriculum provenance,
seed and artifact checksum, learner archetype distributions, real measured simulator relationships,
noise counts, benefit weights and threshold, label balance, validation gates, and sample synthetic
rows. Every surface clearly states that the artifact contains simulated—not real learner—data.

`/feature-lab` reads the Phase 13 feature manifest from the ML service. It exposes all 55 features in
their frozen order, category coverage, source columns, current-state versus shifted-history timing,
observed ranges, anti-leakage policy, real generated sample vectors, checksums, and validation gates.

`/model-evaluation` reads the checked Phase 14 experiment manifest. It shows the actual learner split,
validation-only model selection, held-out classification and ranking metrics, baseline lift, selected
model feature importance, confusion matrix, and experiment gates. Every surface states that the data
is simulated and that the trained artifact is not deployed.

`/inference-lab` loads the checked Phase 15 runtime and submits complete 55-feature simulated examples
to `POST /predict`. It visualizes the returned probability, lets reviewers vary decision-time signals,
shows checksum/schema gates and model versions, and clearly separates inference from course ranking.

`/governance` is the Phase 20 reviewer surface. It reports real prediction/recommendation/outcome volume,
but withholds rates, calibration, course conclusions, and drift until documented sample gates are met.
Retraining requires 100 assessed recommendation outcomes plus coverage/data-quality gates, and model
promotion always requires offline comparison and human approval.

`/my-courses/:enrollmentId/path` is the adaptive visual centerpiece. It loads or creates the current
version owned by that enrollment, highlights Learn Next, groups recognized/current/recommended/upcoming/
locked skills, and shows mastery, confidence, retention, prerequisites, and model provenance. New evidence
pauses a stale recommendation; regeneration then shows before/after Learn Next and immutable history.

When the learner has multiple active enrollments, `/dashboard` promotes a coordinated
Learn Next. `GET /enrollments/paths/coordination` reads the existing independent paths without side
effects. An explicit learner action calls `POST /enrollments/paths/coordination/generate`, creates missing
paths, regenerates stale paths, and records the explained coordinated recommendation.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `API_PORT` | `4000` | Express listen port |
| `WEB_ORIGIN` | `http://localhost:5173` | Allowed browser origin; both loopback forms are accepted outside production |
| `DATABASE_URL` | local `learnpath` PostgreSQL URL | API and migration connection |
| `DATABASE_SSL` | `false` | Require verified PostgreSQL TLS when `true` |
| `AUTH_ACCESS_TOKEN_SECRET` | none | Mandatory access-token signing secret, 32+ characters |
| `AUTH_ACCESS_TOKEN_TTL_MINUTES` | `15` | Access-token lifetime |
| `AUTH_REFRESH_TOKEN_TTL_DAYS` | `30` | Refresh-session lifetime |
| `AUTH_REFRESH_COOKIE_NAME` | `learnpath_refresh` | HttpOnly refresh-cookie name |
| `RETENTION_BASE_LAMBDA` | `0.025` | Base daily exponential forgetting rate |
| `ML_SERVICE_URL` | `http://127.0.0.1:8000` | Checked benefit-inference service used by the path pipeline |
| `ML_SERVICE_TIMEOUT_MS` | `5000` | Explicit path-generation inference timeout |
| `ML_PORT` | `8000` | Documented ML service port |
| `MODEL_DIRECTORY` | `services/ml/models` | Versioned model artifact root |
| `SYNTHETIC_DATA_DIRECTORY` | `services/ml/data/synthetic` | Phase 12 generated dataset manifest location |
| `FEATURE_DATA_DIRECTORY` | `services/ml/data/features` | Phase 13 feature contract and dataset manifest location |
| `EXPERIMENT_DIRECTORY` | `services/ml/models/benefit-ranking-v2` | Production-aligned checked model and evaluation manifest location |
| `VITE_API_BASE_URL` | `/api` | Browser API base path |
| `VITE_ML_BASE_URL` | `/ml` | Browser ML health base path |

## Data integrity conventions

- Migrations are append-only and checksum protected.
- Application secrets stay server-side and `.env` is ignored.
- PostgreSQL failures are surfaced; they are not hidden by in-memory persistence.
- ML inference refuses checksum or schema drift and never falls back to a heuristic.
- The ML service returns benefit probabilities; the API alone combines them with graph validity and
  the versioned path policy to make a Learn Next decision.
- One course enrollment owns one current path and any number of immutable historical versions. Global
  mastery remains unique per learner and skill, while course/module progress remains independent.
- Coordination never merges or overwrites course paths. It compares only fresh, prerequisite-valid Learn
  Next items with bounded, versioned shared-skill and active-goal signals.
- Evidence invalidation and mastery update share one transaction. Explicit regeneration never changes
  mastery merely because a recommendation changed.
- Synthetic and engineered artifacts are reproducible and explicitly labeled as simulated.
- Synthetic rows never enter PostgreSQL learner evidence or application popularity counts.
- Current interaction outcomes and labels never enter the Phase 13 feature matrix.

## PostgreSQL integration test

Apply migrations to an isolated PostgreSQL database, then run:

```bash
TEST_DATABASE_URL=postgresql://... npm run test:integration --workspace @learnpath/api
```

The suite truncates learner/authentication data in the target database and verifies registration,
session rotation, seeded curriculum queries, goal selection, simultaneous enrollment, duplicate
prevention, ordered module access, progress isolation, learner-skill uniqueness, nullable evidence,
cross-course knowledge-state reuse, diagnostic answer validation, per-skill scoring, evidence
history, prerequisite ordering, structured lock explanations, graph cycle rejection, goal-optional
course diagnostics, practice updates, confidence growth, limited-evidence safeguards, immutable
evidence, readiness refresh, cross-course reuse, independent progress, and isolation between
activity and mastery. Never point it at shared or production data.
The Phase 10 scenario additionally verifies time decay, unchanged mastery, passive-activity isolation,
revision eligibility, real retention evidence, retention refresh, and independent course progress.
The Phase 11 scenario verifies goal-optional enrollment context, separated eligible and locked pools,
retention-driven revision, real popularity observations, baseline eligibility, and unchanged progress.
Phase 12 adds a separate Python verification suite for dataset reproducibility, provenance, checksum,
archetype coverage, simulator relationships, noise, and deterministic outcome labels.
Phase 13 adds contract-order, category, bounds, checksum, exact prerequisite-input, shifted-history,
training/inference parity, and current-outcome leakage tests.
Phase 14 adds exact learner-disjoint split, reproducible training, validation-only selection, held-out
metric recomputation, model/baseline comparison, artifact checksum, and deployment-boundary tests.
Phase 15 adds artifact-load/checksum failures, exact schema and bounds rejection, batch validation,
serialized-model probability parity, model/version response, explicit HTTP 422/503, and UI API tests.
Phase 16 adds production-aligned live-feature construction, graph-gated inference, one-path-per-
enrollment persistence, revision-aware ordering, locked-skill exclusion, idempotent generation,
provenance, recommendation activity, API/UI tests, and an end-to-end PostgreSQL path lifecycle.
Phase 17 adds active-course coordination, shared-skill grouping, highest-priority active-goal
relevance, bounded bonuses, independent-path preservation, explicit coordination activity, dashboard
UI, route/unit coverage, and an end-to-end simultaneous-enrollment lifecycle.
Phase 18 adds evidence-triggered stale state, explicit regeneration, immutable path versions,
before/after comparison, stale-path coordination exclusion, lifecycle provenance, and UI/API tests.
Phase 19 adds versioned accept/decline feedback, attributed lesson completion, later assessed outcome
evidence, honest missing-baseline handling, model-version funnels, prerequisite-resource practice scope,
and learner/reviewer UI coverage.
Phase 20 adds global volume monitoring, prediction distributions, course slices, minimum sample gates,
calibration/drift readiness, retraining eligibility, content/data-quality checks, and explicit
human-controlled promotion without modifying the frozen recommender.
Knowledge Graph v2 adds NetworkX structural analytics without replacing PostgreSQL authority. Evidence-bounded
diagnostic v3 adds server-driven coverage/confirmation/verification, repeated-evidence mastery gates, explicit
uncertainty and untested skills, mastery intervals, and immediate post-diagnostic path regeneration while
leaving the frozen recommender and governance policy unchanged.
Diagnostic v5 adds configurable weighted question value, answer-level evidence strength, persistent
misconception evidence, decision-specific prerequisite verification, and evidence-sufficiency stopping.

## Final readiness

The [Paper 1 implementation audit](docs/paper-1-implementation-audit.md) maps every diagnostic capability to live code and separates implemented instrumentation from conclusions that still require a consented real-learner study.

The strict content audit passes for 36/36 active skills across five courses and five demo learners. See
`docs/final-completion-audit.md` for the final automated/browser verification record and documented limits.
