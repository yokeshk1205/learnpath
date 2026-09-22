# Learner redesign: immutable assessment history

Implemented September 10, 2026. This stage closes a trust gap in active diagnostic grading and historical answer review. It is additive and preserves existing learners, saved answers, mastery evidence, and path history.

## The problem

LearnPath already saved the list of question IDs selected for an attempt, but it continued reading each question's live prompt, answer key, numeric tolerance, options, and explanation. An author edit could therefore change the question shown when an unfinished attempt resumed, change how that attempt was graded, or change the explanation displayed for an already submitted result. Stored correctness and mastery were not recalculated, but the visible historical record could disagree with them.

## The snapshot contract

Migration 0033 adds one immutable JSON snapshot to every `diagnostic_attempt_questions` row. It captures the question ID, prompt, format, difficulty, explanation, cognitive level, discrimination, guessing prior, numeric answer and tolerance, display unit, skill ID/name/category, and ordered options with their IDs, labels, content, correctness, and misconception codes.

The snapshot is created by a database trigger at the moment a question is inserted into an attempt. This covers initial fixed questions and later questions appended by the adaptive selector without relying on each application call site to remember the rule. A second trigger rejects changes to the snapshot or its question ID. Deleting an attempt still removes its snapshots through the existing attempt lifecycle.

Existing attempt-question rows were backfilled once from their authored state at migration time. That is the strongest recoverable baseline because earlier versions did not store the content the learner originally saw. Future attempts preserve the exact selected version from the start.

## Runtime behavior

The public unfinished-attempt response now renders prompts, skill labels, units, and options from the snapshot. It still excludes option correctness, numeric answers, and tolerances. Draft validation and adaptive observations use the snapshotted answer key. Multi-select option IDs are checked against the attempt snapshot, which means a later authoring edit cannot invalidate a previously presented option set.

Final submission also uses the same snapshotted scoring parameters. Historical answer review derives the selected answer, correct answer, prompt, difficulty, and explanation from that same snapshot. The stored `assessment_answers.is_correct` value remains the authoritative evaluated outcome and the displayed content now describes the same version.

New attempts continue to use the current active question bank. Retiring or improving a question therefore affects future selection while existing attempts remain reproducible. This is attempt-level immutability, not a general content-authoring version-control interface.

## Verification

`scripts/smoke-question-snapshots.mjs` creates a rollback-only learner and assessment session using real PostgreSQL services. After the first question is presented, it edits the live prompt and answer key, reloads the attempt, submits the original correct answer, and loads the result again. It verifies that the original display, original grading key, and original result text remain intact. It also tries to modify the snapshot directly and verifies that the database rejects the change. The outer transaction always rolls back the fixture, author edits, answers, and results.

Run from the project root with PostgreSQL configured:

```powershell
$env:DOTENV_CONFIG_PATH = '.env.local'
npm run db:migrate
npm run build --workspace @learnpath/api
node scripts/smoke-question-snapshots.mjs
npm run test --workspace @learnpath/api
npm run typecheck
npm run lint
```

Do not modify migration 0033 after it has been applied. A later schema correction must use a new migration. The destructive authentication integration suite still requires a separate disposable test database.

## Remaining boundary

This snapshot protects diagnostic question history. It does not yet provide author accounts, draft/publish workflows, reviewer approvals, explicit content-version entities, or content diff views. Changes to course names, assessment titles, and other surrounding catalog labels can still appear in contextual headers because those are not part of the question-scoring contract. Those are separate governance features rather than grading reproducibility.
