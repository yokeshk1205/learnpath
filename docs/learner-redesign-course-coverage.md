# Learner redesign: course-wide knowledge coverage

Implemented September 9, 2026. This is an additive redesign stage, not a claim that every subject's assessments or the entire product redesign are complete. Existing enrollments, question drafts, global mastery, prerequisite graph, trained ranker, and path history remain in place.

## Learner flow

Home shows the selected course and its personalized next step. My courses is now a dedicated library with active, paused, and completed enrollments plus course discovery. New enrollment leads to the course knowledge check. Returning to a course with an existing path opens that path directly.

Each course has consistent Path, Knowledge check, and Knowledge graph navigation. The knowledge view shows the whole mapped curriculum by module, with search and evidence-status filters. Full course is the default assessment mode. Quick starting point is explicitly a partial placement option. An unfinished legacy quiz takes priority over creating a new program so existing answers are not lost.

The quiz saves each answer. Save & exit returns to the same course, and Resume restores the same attempt. The progress bar describes answered items as a share of the session's maximum question budget, not a fabricated percentage of all-course completion. Submission updates real global evidence and refreshes the path, but keeps the result summary visible. The learner can continue on the path or return to course coverage.

Recommendation feedback and cross-course comparison details are collapsed by default, keeping the path and immediate learning action prominent. Practice retains the course return link; its result emphasizes the assessment or course path as the next action.

## Engine implementation

Migration 0030 adds assessment_programs and assessment_program_sessions and nullable scope fields to existing assessment_attempts. Programs are owned by a learner and enrollment. Session reservations are durable before the diagnostic attempt starts, allowing retries after interrupted requests. Program row locks and diagnostic advisory locks serialize competing starts. At most one unfinished diagnostic remains active per learner and assessment. Public diagnostic requests cannot set internal focus, force-probe, or program identifiers.

Comprehensive planning maintains a backlog over all active mapped course skills. Each session focuses on at most four skills in a module and has at most 28 questions, further limited by its real bank. The program itself has no 28-question or fixed session ceiling. Unassessed skills take priority over repeated confirmation, so advanced modules are not indefinitely hidden behind uncertain foundations. Quick placement samples course regions, including later modules in large courses.

Diagnostic focus is persisted and reapplied on reload and adaptive question selection. A program excludes question IDs already submitted in its own sessions. Selection keeps the existing mastery estimates as priors but does not silently recognize a skill that this session explicitly needs to check. Assessment probing does not bypass or modify learning prerequisite gates: it can test advanced knowledge even while a foundational learning gate remains locked.

Coverage is derived from global submitted question-level evidence, not course completion or the number of times a session was repeated. Distinct question counts include diagnostic and practice evidence. Repeated attempts at one question do not become multiple independent observations. Valid evidence is reusable when the same skill appears in another course.

## Coverage is not mastery

UNASSESSED means no recorded direct evidence. NEEDS_CONFIRMATION means evidence exists but is not yet sufficient under the coverage policy. ASSESSED means sufficient current evidence to describe understanding, which can establish a gap rather than mastery. NEEDS_REFRESH marks old evidence whose retention is at risk. Missing or exhausted question banks are independently labeled BLOCKED; limited banks are labeled LIMITED. Neither is interpreted as a learner failure or a completed assessment.

Current coverage rules accept diverse evidence from at least three distinct questions, including application and two difficulty bands, with confidence at least 0.5. The richer-assessment stage corrects a boundary mismatch: diagnostic-only confidence is capped at 0.45, so diverse evidence at that existing assessed minimum may establish coverage when every latest independent question response is correct. Responses are deduplicated by question ID; one lucky latest answer cannot override a different incorrect question. Mixed evidence below 0.5 remains uncertain unless it establishes a confirmed gap. Verified existing evidence needs at least three distinct questions. An existing GAP or FORGOTTEN classification with at least two distinct observations may establish a known gap. Mastery additionally uses the diagnostic engine's mastery and confidence thresholds; coverage never writes mastery itself.

A newly measured weak skill can have low retention immediately. To avoid incorrectly treating a fresh negative diagnosis as expired evidence, this coverage policy uses a 24-hour freshness window before retention risk forces reassessment. This is a configurable policy assumption, not a clinically or psychometrically validated forgetting constant. Lesson completion still does not establish mastery.

## What “subject-neutral” means here

The planner, curriculum hierarchy, ownership, resume logic, coverage accounting, and prerequisite handling use skill and module IDs without programming-specific rules. They can host authored history, language, science, or other curricula. The regression fixture uses a non-programming 120-skill, 30-module curriculum; it is structural test data, never published course content.

At this stage the supplied course catalog and trained ML model were principally programming-oriented. The subsequent `learner-redesign-richer-assessment.md` stage adds numeric and multi-select diagnostics plus an authored quantitative-reasoning demonstration course. Neither stage supplies validated question banks for every subject, essay/oral/performance assessment, or evidence that the existing model generalizes across subjects. Expert-reviewed content, per-domain validation, and model calibration remain substantive follow-up work. Current coverage thresholds are transparent engineering rules, not a proven measurement accuracy claim.

Existing demo profiles may have high model estimates but limited independent question evidence. The new coverage view intentionally does not treat those estimates as proof of comprehensive assessment. Its totals can therefore differ from older Skill Passport evidence summaries or recognized path lanes.

## Verification and recovery

API regression tests cover program ownership, resume, scope persistence, distinct-question handling, large-course planning, and separation of coverage and mastery. Web regression tests cover default comprehensive mode, partial placement labels, legacy resume without duplicate creation, session launch, and error handling. Existing API and frontend tests were rerun alongside the new tests.

The rollback-only PostgreSQL smoke script creates a 120-skill fixture, resumes a saved attempt, submits 12 unsure responses for four skills, verifies 4 assessed / 0 mastered / 116 unassessed, checks advanced probing despite weak prerequisites, and checks cross-course evidence reuse. It always rolls its fixture back; it never truncates or resets user data. It checks real SQL and service flow, not concurrent transaction isolation or educational effectiveness.

Run from the repository root in PowerShell after configuring the local database:

```powershell
$env:DOTENV_CONFIG_PATH = '.env.local'
npm run db:migrate
npm run build --workspace @learnpath/api
node scripts/smoke-assessment-program.mjs
npm run test --workspace @learnpath/api
npm run test --workspace @learnpath/web
npm run typecheck
npm run lint
npm run build
```

Do not run the existing auth integration suite against the learner database: it requires a disposable TEST_DATABASE_URL and truncates its test users. The new smoke script does not use that workflow.

A pre-redesign source snapshot is saved beside the project as learnpath-before-redesign-20260908.zip. It is a source archive, not a database backup. No existing learner records were deleted or reset for this stage. Migration 0030 is additive and should not be edited after application.
