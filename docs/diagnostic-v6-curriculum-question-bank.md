# Diagnostic v6 — Curriculum and Question-Bank Reframe

## Problem corrected

The earlier adaptive engine had strong evidence handling but weak input content for many programming skills. Twenty-six skills had only two diagnostic items, and 36 generated application items used generic wording rather than authentic tasks. This made the learner estimate sensitive to recognition, guessing, and shallow definitions, which then produced paths that did not reliably match learner need.

## New curriculum evidence model

Every active global skill now has a versioned diagnostic blueprint with three distinct objectives:

1. `ANCHOR`: distinguish the essential concept or invariant from common misconceptions.
2. `VERIFICATION`: apply the skill in a representative scenario.
3. `CHALLENGE`: identify the boundary conditions where the method works, fails, or must change.

The blueprint requires at least three direct observations, at least two cognitive levels, at least two difficulty bands, and application evidence before diagnostic confidence can be considered sufficient.

## Question-bank changes

- Added 72 manually authored programming questions: one application verification and one boundary challenge for each of 36 programming skills.
- Retired 36 generic generated application templates without deleting historical records.
- Preserved the six-skill quantitative-reasoning bank, which already contains six questions per skill and three response formats.
- Increased the active diagnostic bank to 162 questions across 42 global skills.
- Added misconception-specific distractor codes to every new incorrect option.
- Registered every new item with all relevant course diagnostics and the global skill mapping.
- Historical attempts remain frozen through immutable question snapshots.

## Adaptive selection order

The selection policy is now `curriculum-evidence-adaptive-v6`:

`ANCHOR -> VERIFICATION -> CHALLENGE`

Coverage normally begins with an anchor. Confirmation prefers an independent application item. Mixed evidence and unresolved boundaries prefer challenge items. Existing information-gain, uncertainty, prerequisite gateway, retention, misconception, exposure, and self-report components still determine priority inside each role.

## Learner-known/unknown skill routing

Before the first knowledge check, the learner is asked about each skill in the course: **I know this**, **I don't know this**, or **Not sure**. A module-level answer provides context first; module-wide shortcuts and a scrollable skill list keep the flow usable for larger courses. Unmarked skills default to **Not sure** rather than being silently inferred from a broad module claim. The learner may also skip the survey and let the diagnostic discover the boundary. Existing learners are not interrupted; they can voluntarily open or update the same survey from the course knowledge page when no assessment attempt is active.

These responses are stored as self-report hypotheses in the isolated skill self-report table. They do not write learner mastery or direct evidence. In quick placement, claimed-known skills are sampled within each module so the engine can verify the claimed upper boundary. For a claimed-known skill, the first question prefers an application verification item rather than an easy definition; an unknown or unsure skill starts with an anchor item. The existing information-gain policy still ranks the available skills, and correct or incorrect answers—not the claim—drive mastery and path updates. The assessment page separately shows the counts of known, unknown, and unsure claims beside measured evidence.

## Quality gate

`npm run content:diagnostic-check` performs a database-backed audit of every active skill. It rejects a release when a skill has:

- fewer than three active diagnostic items;
- only one response format;
- fewer than two cognitive levels;
- fewer than two difficulty bands;
- a missing anchor, verification, or challenge role;
- fewer than two misconception-mapped items;
- an active generic application template;
- no versioned diagnostic blueprint.

The normal `npm run content:check` command now includes this gate.

## Verification result

All 42 active skills pass the diagnostic question quality gate. The automated suite passes with 179 API tests and 61 web tests. The progressive diagnostic smoke test also passes using single-choice, multi-select, and numeric responses, immutable server grading, live ML ranking, and path regeneration.

## Important interpretation

Three questions are the minimum bank structure, not an automatic mastery certificate. The adaptive engine can leave the skill as `PROBED` or `NEEDS_CONFIRMATION`, request another session, or use future practice and retention evidence. An unanswered skill remains `NOT_TESTED`; it is not converted into a knowledge gap.
