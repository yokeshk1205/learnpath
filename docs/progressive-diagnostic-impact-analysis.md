# Progressive diagnostic impact analysis

## Existing architecture discovered

LearnPath already has the core pipeline required by the brief. PostgreSQL stores one global `learner_skill_mastery` row per learner and skill, plus an immutable `skill_evidence` ledger. Course modules reuse global skills through `course_skills`. Required and recommended prerequisite edges are evaluated by the Knowledge Graph v2 service before candidates enter the ML ranking and personalized-path services.

The diagnostic implementation is already evidence driven. It selects questions one at a time, records why each question was selected, scores difficulty/cognitive metadata, separates mastery from confidence, detects mapped misconceptions, stops with evidence-aware bounds, preserves untested skills, and snapshots question content so an attempt remains historically reproducible. Multi-session assessment programs already support bounded quick placement and comprehensive course coverage.

The learner frontend already contains real diagnostic, course-coverage, Skill Passport, prerequisite, path, practice, retention, and assessment views. Diagnostic submission already updates the global learner state and refreshes the personalized path.

## Reused without replacement

- `learner_skill_mastery` and the immutable `skill_evidence` ledger remain the only learner knowledge model.
- Existing diagnostic estimation, rich response scoring, adaptive selection, stopping, misconception, and snapshot logic remain authoritative.
- Assessment programs remain responsible for scaling assessment across large courses.
- Knowledge Graph v2 remains the prerequisite gate.
- Existing candidate generation, ML ranking, and path generation remain separate downstream stages.
- Existing practice, retention, cross-course reuse, and path-regeneration workflows remain intact.

## Extensions required

- A pre-diagnostic module/skill self-report persisted separately from mastery and evidence.
- Self-report used only as a configurable question-priority signal.
- An explicit course knowledge map with coverage, learner classification, and a safe starting boundary.
- A durable assessment backlog with a reason and priority for every unresolved course skill.
- Focused just-in-time checks and challenge-to-skip entry points that reuse the existing diagnostic engine.
- Learner UI that gathers self-report before a new assessment and clearly distinguishes unknown knowledge from confirmed gaps.

## Database impact

Migration `0034` adds course self-report, module self-report, skill self-report, and assessment-backlog tables plus a diagnostic intent column. It does not modify any applied migration or duplicate skills, mastery, evidence, questions, attempts, or paths.

## Known limitations retained

The numeric thresholds and selection weights are configurable prototype policy, not scientifically calibrated claims. Diagnostic accuracy depends on authored question quality and coverage. The current ML ranker was trained on synthetic interactions and therefore remains a prototype until it is evaluated on representative real learner outcomes.
