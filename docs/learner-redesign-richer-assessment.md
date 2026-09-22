# Learner redesign: richer assessment and a non-programming course

This additive stage extends the course-wide coverage work in `learner-redesign-course-coverage.md`. It does not replace existing enrollments, saved diagnostics, mastery history, or personalized paths.

## What learners can do

The diagnostic now supports single choice, select-all-that-apply, and numeric answers. Single-choice answers retain their existing automatic save behavior. Multi-select and numeric responses use an explicit Save answer action so editing a response does not prematurely submit intermediate values. Save & exit saves valid pending edits before leaving; a failed save keeps the learner on the question. Resuming restores the saved response, including zero and negative numeric values. Unsaved edits block question navigation and submission. A per-user, per-attempt session-storage cache also recovers unsaved edits after same-tab browser Back navigation, only when the question and backend saved-answer timestamp still match. Recovered drafts are visibly marked unsaved and never automatically submitted.

Results use the actual server evaluation and explain the selected and correct responses. Diagnostic submission still updates global skill evidence and regenerates the course path. Course coverage remains separate from mastery: answering enough questions can establish a gap, not just a success. Unknown and uncertain skills remain visible.

## Scoring and evidence

Migration 0031 extends the question format and response schema while preserving legacy single-choice records. Numeric answer keys, tolerances, and option correctness are server-owned. The unfinished-attempt response exposes only the question format, display unit, prompt, and selectable options; answer keys are not sent to the learner before submission.

The same deterministic scoring function evaluates draft observations for adaptive selection and final responses for mastery updates. Multi-select requires the exact correct set, irrespective of selection order. Selecting a correct answer together with an incorrect one is not counted as a correct response. Duplicate choices and choices belonging to another question are rejected. This version does not implement partial-credit evidence; a false result means the response did not meet the item's complete criterion, not that the learner has no knowledge of the skill.

Numeric grading requires a finite number and compares it with the authored answer within an explicit absolute tolerance. Decimal integer scaling avoids rejecting decimal tolerance boundaries because of floating-point subtraction. Numeric input is not executable code or an expression. Units and rounding instructions must be supplied by the author in the prompt. Response-format validation rejects incompatible fields and prohibits combining an answer with “I'm not sure.” Database constraints provide an additional integrity layer.

Each question still contributes one bounded observation to the existing diagnostic estimator. More input formats do not by themselves prove higher measurement accuracy. The estimator uses difficulty, cognitive level, direct observations, consistency, confidence, and prior evidence; it does not infer full mastery from a single correct response. Item parameters remain author priors rather than empirical psychometric calibration.

Integration testing uncovered and fixed a coverage-policy mismatch: diagnostic-only confidence is capped at 0.45, while the original positive-coverage rule required 0.50. Coverage now also accepts the existing assessed minimum of 0.45 with at least three distinct questions, application evidence, at least two difficulty bands, and consistently correct latest independent responses. The direct-evidence query deduplicates repeated attempts by question ID. This allowance does not change mastery, confidence calculation, or prerequisite thresholds. Mixed responses below 0.50 still require confirmation unless they establish an existing confirmed-gap classification; the stronger-evidence 0.50 coverage route remains unchanged.

## Authored non-programming demonstration

Everyday Quantitative Reasoning adds six global skills in three modules: unit rates, percentages of a whole, reading data tables, percentage change, arithmetic mean, and median/range. Its diagnostic bank contains 36 distinct items: two of each supported format per skill. Each skill also has one separate single-choice practice item, one separate post-lesson assessment item, a concept guide, and a worked example. This is 48 questions and 12 learning resources in total.

The graph includes a required percentages-of-a-whole foundation for percentage change. Independent families are not artificially placed in a single prerequisite chain. Diagnostic probing can check advanced knowledge independently of a learning lock. Each question has one primary skill mapping; the engine does not silently award secondary-skill mastery from a composite question.

The new content is original demonstration material, not certified expert-reviewed content. Six diagnostic questions per skill improve available evidence but can still be exhausted before confidence is sufficient. The program must retain a confirmation/content-gap state in that case. One practice or assessment item per skill is a minimal demonstration bank, not adequate ongoing practice diversity. Rich question types are diagnostic-only in this stage; the practice selector explicitly remains single-choice.

## Ranking transparency

The course uses the existing live ML inference and dependency-aware path implementation. No recommendation probabilities, mastery values, or paths are fabricated for the demonstration. The path now includes a collapsible reliability explanation with its saved backend model, feature, inference, and source metadata.

The current ranker was trained on synthetic, principally programming-oriented learning data. Running it on quantitative-reasoning features proves software compatibility, not cross-subject predictive validity or educational effectiveness. Cross-domain evaluation, calibration on real outcomes, expert-reviewed content, and support for essay, oral, practical, and rubric-scored performance remain separate substantive work.

## Verification

Unit and UI tests exercise legacy answers, exact-set scoring, numeric boundaries, malformed responses, response serialization, saved-answer restoration, dirty-state guards, and save failures. The read-only content audit recognizes all three diagnostic formats.

`scripts/smoke-mixed-assessment.mjs` exercises the authored course through real PostgreSQL services and the live graph/ranking service: resume, private keys, graded responses, global evidence, course coverage, path generation, lesson activity, post-lesson assessment, and path version changes. Its own fixture user and every evidence/path write are enclosed in an outer transaction that always rolls back. It does not delete or reset existing learners. It validates service integration, not concurrent transaction isolation or diagnostic accuracy.

Run from the project root after configuring `.env.local` and starting PostgreSQL and the ML service:

```powershell
$env:DOTENV_CONFIG_PATH = '.env.local'
npm run db:migrate
npm run build --workspace @learnpath/api
node scripts/smoke-assessment-program.mjs
node scripts/smoke-mixed-assessment.mjs
npm run content:check
npm run test --workspace @learnpath/api
npm run test --workspace @learnpath/web
npm run typecheck
npm run lint
npm run build
```

Do not run the existing destructive authentication integration suite against a learner database. Applied migrations must not be edited; any later schema correction needs a new migration.

Final checks on September 10, 2026: 170 API tests and 58 web tests pass, with typechecking, lint, and production builds. The 120-skill rollback fixture retains 4 assessed / 0 mastered / 116 unassessed after its negative-evidence session. The new course's all-correct scenario uses 18 responses in three sessions to reach 6 assessed / 0 mastered and a completed assessment program. Its deliberately mixed scenario records all three formats and leaves 4 skills needing confirmation; lesson activity, assessment, live model inference, and three path versions are verified. Browser checks confirm demo login, new-course discovery, and legacy resume with the original ten saved answers untouched.

The subsequent `learner-redesign-immutable-assessment-history.md` stage closes the historical question gap with attempt-level database snapshots used for display, grading, and result review. Existing attempt rows were backfilled from the authored state available at migration time. A full author draft/review/publish workflow remains future work. The current frontend build also retains an existing large-bundle warning; this is not a failed build.
