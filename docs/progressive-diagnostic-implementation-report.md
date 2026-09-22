# LearnPath Progressive Evidence-Based Diagnostic — Implementation Report

## Outcome

LearnPath now treats diagnosis as a progressive evidence-gathering process rather than a one-time quiz. A learner may state what feels familiar, but that statement is stored separately from the global learner model and never becomes mastery. The engine then gathers direct evidence over bounded sessions, exposes uncertainty honestly, identifies a safe knowledge boundary, and sends the resulting learner state through prerequisite analysis, candidate generation, ML ranking, and personalized-path regeneration.

The implemented loop is:

`Self-report hypothesis -> adaptive evidence collection -> mastery/confidence/coverage update -> knowledge boundary -> prerequisite-aware candidates -> ML ranking -> personalized path -> learning/practice/review -> new evidence -> path regeneration`

## Module-wise implementation

### 1. Non-authoritative course self-report

Before a genuinely new diagnostic, the learner describes familiarity at module level and can mark each individual skill as known, unknown, or unsure. Module-wide shortcuts keep the survey practical for larger courses, and unanswered skills default to unsure. Existing learners can voluntarily update these starting answers when no assessment attempt is active. Stored familiarity supports `NEW_TO_ME`, `KNOW_A_LITTLE`, `COMFORTABLE`, `VERY_COMFORTABLE`, and `NOT_SURE`; optional confidence and experience source can also be recorded.

Self-report data is kept in dedicated course, module, and skill tables. It is not written to `learner_skill_mastery` and does not create `skill_evidence`. Its only algorithmic effect is a small question-selection priority component that helps the engine decide what to verify. A learner claiming familiarity is therefore challenged sooner, but never receives credit without observed evidence.

### 2. Progressive diagnostic program

Large courses are assessed through a sequence of resumable sessions rather than one oversized examination. `QUICK_PLACEMENT` gives a partial starting estimate. `COMPREHENSIVE` progressively visits the entire course across multiple bounded sessions. The planner tracks assessed, partially assessed, and not-tested skills independently, so an unanswered topic is never shown as a failure.

Each session uses the established adaptive diagnostic engine. Selection considers information gain, current uncertainty, prerequisite importance, graph reach, starvation, contradiction, retention risk, coverage needs, and a deliberately small self-report verification signal. Question count remains bounded per session, while course-level coverage can continue over as many sessions as required.

### 3. Evidence and learner model

Submitted answers are graded on the server. They create immutable evidence records and update the global, course-independent skill passport. Mastery, confidence, evidence coverage, and classification remain separate values:

- mastery estimates demonstrated proficiency;
- confidence expresses certainty in that estimate;
- coverage says how much direct assessment evidence exists;
- classification communicates the learner-facing state.

The learner-facing classifications are `STRONG`, `READY`, `NEEDS_WORK`, `NEEDS_CONFIRMATION`, and `NOT_ASSESSED_YET`. Assessment coverage is separately classified as `NOT_TESTED`, `PARTIALLY_ASSESSED`, or `SUFFICIENT_EVIDENCE`.

Self-report disagreement is recorded as `NOT_CONFIRMED`, not punished as dishonesty. Agreement becomes `CONFIRMED`; insufficient evidence remains `UNVERIFIED`.

### 4. Knowledge boundary

The service orders course skills using curriculum position and prerequisite structure, then projects each global skill state into the course. The first skill that is not supported by sufficiently strong evidence becomes the suggested starting boundary. The UI presents the sequence horizontally with status, module context, and the first safe point to verify or learn.

This boundary is evidence-aware: an advanced skill may be strong while a basic prerequisite is weak or forgotten. The system keeps both observations, marks the contradiction or prerequisite risk, and prioritizes confirmation instead of forcing a simplistic all-or-nothing level.

### 5. Persistent assessment backlog

The engine maintains a durable per-enrollment queue of skills requiring evidence. Priority combines:

- retention risk;
- contradictory or low-confidence evidence;
- prerequisite gateway importance and dependent count;
- assessment starvation;
- partial or missing coverage.

Queue entries have explicit pending, resolved, and blocked states. This prevents “unknown” skills from silently disappearing and lets future sessions select high-impact checks without scanning a whole large course uniformly.

### 6. Just-in-time knowledge check and challenge

Course coverage rows and personalized-path cards can launch a focused diagnostic for one skill. `KNOWLEDGE_CHECK` is offered for uncertain or low-confidence path items. `CHALLENGE` is offered when the learner claims comfort and wants to prove prior knowledge. Both reuse the same server-side question selection, evidence, scoring, mastery, confidence, prerequisite, recommendation, and path-regeneration pipeline; they are not separate mock quizzes.

After submission, the focused queue item is resolved when enough evidence is obtained. The diagnostic result explains whether self-reported familiarity was confirmed. The application then generates or regenerates the personalized path from the updated learner model.

### 7. Immutable assessment history

Question wording, options, answer keys, explanations, skill mapping, difficulty, and discrimination are snapshotted into the attempt. Later author edits cannot change a learner's historical assessment. Draft responses remain editable while an attempt is in progress, but submitted answers cannot be updated or deleted. Database triggers enforce this invariant below the API layer.

### 8. UI and learner flow

The course knowledge experience now follows this sequence:

1. A new learner optionally supplies a low-friction familiarity hypothesis.
2. LearnPath starts a quick or comprehensive diagnostic session.
3. Answers are saved and the session can be resumed.
4. The result distinguishes proven strength, learning need, uncertainty, and absence of evidence.
5. The knowledge-boundary visualization explains the safe starting point.
6. The personalized path displays what to learn next and why.
7. Learners can challenge a path item, learn it, practise it, or review it.
8. New evidence updates the global skill passport and dynamically regenerates affected paths.

Existing learners are not interrupted by the setup screen. If evidence, a submitted diagnostic, or a saved attempt already exists, the UI continues directly to coverage or resume state.

## API surface

The assessment-program API now exposes:

- `GET /assessment-programs/overview?enrollmentId=...`
- `GET /assessment-programs/knowledge-map?enrollmentId=...`
- `GET /assessment-programs/backlog?enrollmentId=...`
- `PUT /assessment-programs/self-report`
- `POST /assessment-programs/focused-checks`

Focused attempts carry one of four explicit intents: `PLACEMENT`, `COURSE_COVERAGE`, `KNOWLEDGE_CHECK`, or `CHALLENGE`.

## Database changes

Migration `0034_progressive_diagnostic_experience.sql` adds isolated self-report storage, the persistent assessment backlog, and diagnostic intent support. Migration `0035_immutable_submitted_assessment_answers.sql` prevents changes to submitted answers. Both migrations are additive and preserve previously applied migration history.

## Why the result can be trusted

Trust comes from layered safeguards rather than claiming that one question proves mastery:

- self-report cannot create mastery;
- server-side grading uses frozen attempt snapshots;
- several evidence items, formats, difficulty levels, and sessions can contribute to one skill;
- mastery and confidence are separate;
- missing evidence is displayed as unknown, not weak;
- contradictory evidence triggers confirmation;
- prerequisite violations remain visible;
- retention decay can move an old result back into review;
- all question-selection decisions retain a human-readable reason and component scores;
- the ML ranker orders eligible candidates but does not bypass graph safety rules;
- submitted evidence and answers are immutable;
- end-to-end smoke tests run inside transactions and roll back their fixtures.

The model is therefore explainable and cautious: it recommends from the best available evidence while explicitly exposing uncertainty.

## Verification completed

- TypeScript type checking: passed for API and web.
- ESLint with zero warnings: passed for API and web.
- Production builds: passed for API and web.
- API tests: 33 files, 179 tests passed.
- Web tests: 23 files, 61 tests passed.
- Content readiness: 42/42 skills have lesson, diagnostic, practice, assessment, and actionable Learn Next coverage.
- Progressive diagnostic smoke: passed using all three supported response formats and live ML ranking; transaction rolled back.
- Immutable snapshot smoke: passed for frozen display, key, result text, question mutation rejection, and submitted-answer mutation rejection; transaction rolled back.
- Database migrations: all migrations through `0037` are applied.
- Browser QA: the real assessment page loads with knowledge boundary, coverage distinctions, resumable session state, and no stale-contract blank screen.

The production build reports a non-blocking bundle-size warning for the main web chunk. Code splitting is a future performance improvement and does not affect correctness.

## Local run commands

From the repository root in PowerShell:

```powershell
docker compose up -d
npm install
npm run db:migrate
npm run dev
```

The web application is available at `http://127.0.0.1:5173` and the API at `http://127.0.0.1:4000`. The ML service must also be running at the URL configured for the API; its readiness endpoint is `/health/ready`.

Before a panel demonstration, verify with:

```powershell
npm run typecheck
npm run lint
npm test
npm run content:check
npm run smoke:assessment-snapshots
npm run smoke:progressive-diagnostic
```

Commands that access the local database should use the values from `.env.local` in the current PowerShell process.

## Demonstration sequence

Use a new learner enrollment to show the full progressive flow. Explain that the opening familiarity form only changes what is verified first. Start a quick placement check, answer a mixture of items, and point out the three distinct states: sufficient evidence, partial evidence, and not tested. Show the knowledge boundary and generated path, then use “Check this skill” or “Challenge this skill” on a path item. Submit the focused check and return to the path to show the changed learner state, recommendation explanation, and regenerated sequence. Finally, open the Skill Passport or another course containing the same skill to demonstrate cross-course knowledge reuse.
