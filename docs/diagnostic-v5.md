# Diagnostic v5 — evidence-driven adaptive assessment

Diagnostic v5 replaces a precomputed question quota with a traceable evidence-gathering process. It keeps the existing global learner model, prerequisite graph, candidate generator, ML ranker, and path engine unchanged.

## Runtime flow

```text
Course enrollment
  -> build prior skill state from the global Skill Passport
  -> ask high-impact foundation anchors
  -> store each answer and its evidence strength
  -> investigate uncertainty, gateways, retention risk, or misconceptions
  -> stop when path-relevant evidence is sufficient
  -> persist skill summaries and uncertainty bounds
  -> run prerequisite analysis
  -> generate candidates
  -> rank with the frozen ML model
  -> create the personalized path
```

## Question selection

Policy version: `evidence-driven-adaptive-v5`.

The first eight available regions act as anchors. Later questions are ranked using centrally declared prototype weights:

```text
0.25 information gain
+ 0.15 uncertainty
+ 0.15 prerequisite gateway importance
+ 0.15 decision impact near a threshold
+ 0.10 course relevance
+ 0.08 retention risk
+ 0.07 evidence diversity
+ 0.05 misconception value
- prior exposure penalty
- topic switch penalty
```

Each selected question stores the component values, total score, stage, and human-readable reason in `diagnostic_attempt_questions`. These values are an auditable policy prior, not claimed scientific constants.

## Evidence update

Every submitted answer becomes an immutable `assessment_answers` row and a `skill_evidence` row. Evidence strength is bounded to `[0, 1]` and combines difficulty, discrimination, cognitive level, guessing probability, and whether the learner explicitly selected “I’m not sure.”

Mastery and confidence remain separate. Mastery uses bounded weighted aggregation. Confidence grows from repeated observations, source/session diversity, difficulty coverage, cognitive diversity, consistency, and recency. A single response is always `PROBED`; it cannot produce `MASTERED`.

The configurable v5 classification policy requires:

- `MASTERED`: mastery at least 0.80, confidence at least 0.70, at least three observations, multiple cognitive levels, and a correct application/analysis item;
- `READY`: mastery at least 0.65, confidence at least 0.50, and at least two correct observations;
- `GAP`: mastery below 0.50 with at least two consistent negative observations;
- contradictory or limited evidence: `NEEDS_CONFIRMATION`;
- strong historical knowledge that fails a retention-sensitive check: `FORGOTTEN`.

## Evidence-sufficiency stopping

The stopping policy uses a minimum of 12, a normal target range of 16–22, and a hard maximum of 28 questions. A smaller bank lowers these bounds safely.

After every saved answer, the server checks:

- whether the minimum evidence count is met;
- whether at least 75% of course regions (and at least eight where available) were sampled;
- whether the three highest-impact prerequisite gateways are resolved;
- whether any high-impact contradictory evidence still needs verification; and
- whether the question bank or hard maximum has been reached.

Positive gateway evidence requires an application/analysis observation before it can support a path unlock. Two independent negative observations are sufficient to preserve a lock. This creates decision-specific evidence requirements.

## Misconceptions and explanations

Incorrect distractors map to misconception codes. V5 writes append-only `misconception_evidence` and updates a learner-skill misconception state with occurrence count and bounded confidence. The selector can prioritize a question that helps verify an existing misconception, and the result UI shows the detected pattern instead of reducing every error to a generic low score.

Each final skill summary persists difficulty coverage, cognitive coverage, misconception codes, mastery/confidence before and after, uncertainty bounds, classification, and a plain-language decision reason.

## Demonstrated behavior

The seeded demo data exercises multiple stopping points: clear learners can stop near the minimum, uncertain learners continue through the normal target range, and contradictory gateway evidence can use the full 28-question boundary. The database audit can compare estimated mastery, classifications, misconception events, and stopping points without reconstructing decisions from logs.
