# Phase 6 — Questions and diagnostic assessment

## Outcome

Phase 6 converts a selected learning goal into the first defensible learner evidence. A diagnostic
contains 16 real single-choice questions across eight global skills. Every question declares its
`skill_id`, difficulty, options, correct answer, and explanation. Correctness metadata is never sent
with an in-progress attempt.

The assessment does not treat an overall percentage as learner knowledge. The API validates and
scores every answer, groups observations by the question's actual skill, and updates only those eight
global learner-skill records. The overall score is retained solely as assessment context.

## Data model

Migration `0007_diagnostic_assessment.sql` adds:

- `questions` and `question_options` with skill ownership and one seeded correct option;
- `assessments` and ordered `assessment_questions` for each seeded learning goal;
- learner-owned `assessment_attempts` with at most one active attempt per assessment;
- immutable `assessment_answers` that guarantee the option belongs to the question;
- `assessment_skill_results` with score and mastery/confidence before-and-after snapshots.

Answer history and explanations make every knowledge update inspectable. An attempt can be submitted
only once and only after every question has exactly one valid answer.

## Mastery and confidence policy

The dedicated mastery service owns all calculations:

- per-skill diagnostic score is difficulty weighted and clamped to `[0, 1]`;
- first evidence initializes mastery from that skill's own score;
- later diagnostic evidence applies `0.6 × previous mastery + 0.4 × assessment score`;
- initial diagnostic confidence uses question count, difficulty, and consistency, capped at `0.45`;
- later evidence increases confidence without exceeding `1`;
- retention is deliberately unchanged because forgetting logic belongs to Phase 10.

## Authenticated API

- `GET /diagnostics/overview` returns active goal, template, active attempt, and latest result summary.
- `POST /diagnostics/start` starts or resumes the selected goal's attempt.
- `GET /diagnostics/attempts/:attemptId` returns learner-owned questions without answer keys.
- `POST /diagnostics/attempts/:attemptId/submit` validates, scores, and persists the full attempt.
- `GET /diagnostics/attempts/:attemptId/results` returns per-skill results and answer review.

## Product demonstration

The dashboard's personalized path advances from Diagnostic to Skill Gaps only after a submitted
attempt exists. The assessment UI provides progress, keyboard-accessible option controls, responsive
navigation, and explicit loading/error states. The result UI explains that overall performance is
context only, visualizes eight separate knowledge signals, and links directly to the updated global
Skill Passport. Reloading the dashboard reads the same PostgreSQL evidence.

## Verification

Unit and HTTP tests cover the mastery formula, confidence cap, raw-answer API boundary, and validation.
The PostgreSQL integration test completes a 16-question attempt with intentionally different skill
outcomes and verifies eight distinct result rows, 16 evidence attempts, immutable history, nullable
retention, duplicate-submission rejection, and the refreshed Skill Passport summary.
