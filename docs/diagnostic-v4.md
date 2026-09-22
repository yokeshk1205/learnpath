# Diagnostic v4 — skill-wise adaptive evidence

Diagnostic v4 improves placement accuracy by expanding breadth before depth. The question bank already contains two to four diagnostic questions per skill and two to three cognitive levels per skill; v4 changes how that bank is allocated.

## Policy

- Policy version: `skill-wise-adaptive-v4`
- Hard maximum: 24 questions
- First stage: one coverage probe for every course skill that the available bank and hard maximum permit
- Middle stage: up to six targeted confirmation questions
- Final stage: up to two independent verification questions
- Per-skill evidence: normally capped at three observations, extended to four only while evidence remains mixed or application-level evidence is still missing

The dynamic budget is:

```text
target = distinct course skills
       + min(6, distinct course skills)
       + 2 verification slots

question budget = min(24, available questions, target)
```

For the current curriculum this produces bounded course diagnostics of approximately 16–23 questions rather than the previous fixed maximum of 15.

## Why this is more accurate

The previous policy reserved only five questions for breadth. That could leave a large course with many directly untested skills even though the question bank contained enough material. V4 first establishes a skill-wise evidence map, then concentrates the remaining budget on:

- mixed correct and incorrect evidence;
- low-confidence estimates;
- gateway skills with many dependents;
- application or analysis evidence needed for a strong classification;
- retention-risk confirmation.

One answer still produces only `PROBED`. `MASTERED` still requires at least three varied observations, a correct APPLY/ANALYZE observation, mastery at or above the course target, and sufficient confidence. Untested skills remain `NOT_TESTED`; they never receive invented scores.

## Flow

```text
Skill-wise coverage
  -> uncertainty-based confirmation
  -> independent verification
  -> skill mastery interval and classification
  -> global mastery/confidence evidence update
  -> prerequisite analysis
  -> personalized path generation
```

## Remaining measurement boundary

V4 improves evidence coverage, but no 24-question diagnostic can certify an entire discipline. Results remain placement estimates. Later practice, assessments, and retention checks continue updating the global learner model across sessions.
