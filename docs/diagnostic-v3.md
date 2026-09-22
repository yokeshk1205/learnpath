# Evidence-bounded adaptive diagnostic v3

Diagnostic v3 estimates a learner's starting point without treating one multiple-choice answer as proof of
skill mastery. It is a bounded, server-driven placement process that updates the same global learner-skill
state used by prerequisites, retention, candidate generation, and personalized paths.

## Learner flow

1. The course opens with one diagnostic question, not a precomputed quiz.
2. Saving the answer causes the server to select and reveal exactly one next question.
3. The sequence stops at a fixed maximum of 15 questions: five coverage probes, eight confirmation slots,
   and two final verification slots.
4. Correctness remains hidden until submission, so the adaptive sequence does not coach later answers.
5. Submission updates global skill evidence, labels each tested skill, and immediately asks the path engine
   to generate or regenerate the enrollment's personalized path.
6. Skills outside the evidence budget are returned explicitly as not tested. Existing strong cross-course
   evidence can be recognized, but the diagnostic never invents mastery for an unobserved skill.

## Selection policy

The selector scores only active diagnostic questions that belong to the course. It combines:

- unknown mastery and distance from the course mastery target;
- current confidence and retention risk;
- prerequisite gateway value, measured by required downstream dependents;
- question discrimination and difficulty fit;
- cognitive-level novelty and the need for application evidence;
- inconsistent earlier answers that need a final independent check.

Coverage prefers different high-value skills. Confirmation prefers a second or third independent observation
for a probed or contradictory skill. Verification uses the final two slots for unresolved contradictions or
missing application evidence. A skill receives at most three direct observations in one session.

## Evidence-bounded estimation

Each answer is converted to a difficulty-aware performance signal and weighted by question discrimination.
Diagnostic reliability grows with independent observations, cognitive-level variety, application evidence,
and consistent results, but is capped because a single placement session is not certification.

For a skill with no prior evidence, the update starts from a neutral 0.5 rather than zero or the raw answer:

```text
effective_weight = source_weight x diagnostic_reliability
mastery_after = mastery_before_or_0.5 x (1 - effective_weight)
              + measured_performance x effective_weight
```

Consequently, one correct answer creates an initial `PROBED` estimate and cannot create mastery. Diagnostic
`MASTERED` requires at least three varied observations, at least one correct application/analyze item, mastery
at the target, and sufficient confidence. Mixed evidence remains `NEEDS_CONFIRMATION`.

The result classifications are:

- `MASTERED`: repeated, varied, application-supported evidence meets the course target;
- `READY`: positive evidence supports proceeding, but is not strong enough to certify mastery;
- `GAP`: repeated evidence indicates a missing foundation;
- `FORGOTTEN`: prior strong mastery plus retention risk conflicts with weak current evidence;
- `FRAGILE_FOUNDATION`: advanced performance is strong while a tested required prerequisite is weak;
- `NEEDS_CONFIRMATION`: answers conflict or remain insufficient;
- `PROBED`: exactly one direct observation;
- `NOT_TESTED`: no direct observation in the bounded session.

Every tested result includes a mastery interval, before/after mastery and confidence, evidence state, direct
observation count, and application observation count. Response time and uncertainty are preserved as evidence
metadata but do not independently determine mastery.

## Persistence and compatibility

- `diagnostic_attempt_questions` remains an immutable, ordered snapshot and now records selection stage/score.
- `diagnostic_answer_drafts` continues to support autosave and exact resume.
- `assessment_attempts.diagnostic_question_budget` separates the fixed session cap from currently revealed
  questions.
- `assessment_skill_results` stores classification, mastery bounds, and observation counts.
- question metadata now includes cognitive level, discrimination, guessing prior, calibration state, and
  optional misconception codes for future calibrated item analysis.

Historical attempts and fixed goal diagnostics keep their previous policies. Diagnostic v3 changes neither
the frozen ML benefit model nor prerequisite enforcement.

## Verification

Unit tests cover selection stages, contradictory evidence, mastery bounds, and the rule that one correct answer
cannot create mastery. API/UI type checks, lint, builds, and test suites pass. A live PostgreSQL run verifies the
complete 15-question flow, including one-question-at-a-time revelation, autosave, submission, classifications,
mastery intervals, and explicit untested skills.
