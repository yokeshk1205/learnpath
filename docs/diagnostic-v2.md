# Adaptive diagnostic v2

This bounded post-freeze enhancement improves how LearnPath establishes a learner's starting point. It does
not change the frozen benefit-ranking model or path policy.

## Learner workflow

1. A learner enrolls in a course and starts its knowledge check.
2. LearnPath reads the learner's one global skill state: mastery, confidence, and retention.
3. The prerequisite-aware selector prioritizes unknown gaps, uncertain estimates, retention risks, and
   gateway prerequisites that unlock several later skills.
4. Strong, high-confidence prior knowledge is normally skipped. A small number of recognized skills can be
   spot-checked so cross-course reuse remains trustworthy.
5. The selected questions and their reasons are stored as an immutable attempt snapshot.
6. Every choice is autosaved. Reloading resumes at the first unfinished question.
7. `I'm not sure` is stored as explicit uncertainty rather than a guessed option. It counts as incorrect
   evidence at submission, while its provenance remains inspectable.
8. Submission updates global mastery and confidence through the existing evidence service. The results view
   shows before/after mastery, confidence, foundations to revisit, and the action that generates the course
   path from the new evidence.

Goal diagnostics keep their fixed question policy for compatibility. Course diagnostics use
`prerequisite-aware-v2`, with at most eight selected skills and twelve questions. Selection uses no answer
correctness and reveals no correctness during autosave.

## Persistence

- `diagnostic_attempt_questions` freezes question order and selection explanations.
- `diagnostic_answer_drafts` holds one resumable answer per attempt/question.
- `assessment_answers.is_unsure` preserves the learner's honest uncertainty in submitted evidence.
- `assessment_attempts` records policy and selection counts for reviewer inspection.

Migration `0026_adaptive_diagnostic_v2.sql` also adds one application-oriented diagnostic variant per active
skill. Its correct answer and plausible distractors are derived from real lesson content rather than UI mocks.

## Verification

Unit coverage verifies prerequisite-aware selection and the HTTP/API autosave boundary. PostgreSQL
integration coverage verifies bounded course selection, uncertainty persistence, resume, final scoring,
mastery updates, and the existing cross-course lifecycle. The migration is forward-only and checksum tracked.
