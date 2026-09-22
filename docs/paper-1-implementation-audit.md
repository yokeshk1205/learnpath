# Paper 1 implementation audit

This audit maps the diagnostic-system claims proposed for Paper 1 to executable LearnPath behavior. It distinguishes implemented software from empirical claims that require a prospective study. The application must never convert a missing study into a simulated accuracy claim.

| Paper 1 capability | Implementation | Verification surface | Status |
| --- | --- | --- | --- |
| Learner self-portrait | Course setup records module and skill familiarity, confidence, and experience source. Self-report is a selection prior only and is separately marked confirmed or not confirmed. | Course Assessment and Diagnostic Results | Implemented |
| Large-course diagnosis | A course-wide assessment program maintains a persistent backlog and schedules bounded sessions across modules instead of attempting every skill in one quiz. | Course Assessment coverage map | Implemented |
| Broad placement before depth | Quick placement samples separated course regions; comprehensive mode works through module groups. | Assessment approach selector and session plan | Implemented |
| Multiple observations per skill | A single observation is classified `PROBED`; sufficient positive mastery requires repeated evidence, application evidence, and cognitive variety. | Diagnostic Results evidence cards | Implemented |
| Anchor, verification, and challenge items | Every active diagnostic item carries a role, construct, cognitive level, difficulty, discrimination prior, and content version. | Diagnostic Quality Lab item audit | Implemented |
| Difficulty and cognitive coverage | Skill results persist easy/medium/hard and remember/understand/apply/analyze coverage. | Diagnostic Results | Implemented |
| Contradiction detection | Mixed positive and negative evidence becomes `NEEDS_CONFIRMATION`; gateway contradictions can force another question. | Results and Diagnostic Quality Lab | Implemented |
| Advanced strength with weak basics | Later skills can be probed independently, but weak required prerequisites remain visible and cannot be bypassed. A strong advanced response does not fabricate foundational mastery. | Course Assessment, prerequisite graph, path locks | Implemented |
| Explicit unknown state | Unsampled skills remain `NOT_TESTED`; one-question skills remain `PROBED`; missing evidence is never converted to zero mastery. | Coverage map, results, Skill Passport | Implemented |
| Mastery and confidence separation | Every decision stores mastery, confidence, evidence state, observation count, and a mastery interval. | Results and Skill Passport | Implemented |
| Adaptive stopping | The engine evaluates minimum evidence, course-region coverage, gateway resolution, contradictions, bank exhaustion, and the hard maximum. The exact stop reason is persisted. | Diagnostic Quality Lab stop-reason audit | Implemented |
| Misconception evidence | Distractors can carry misconception codes; answer-level and learner-skill misconception records are append-only. | Diagnostic Results | Implemented |
| Immutable audit history | The exact question, options, answer key, difficulty, and cognitive metadata used by an attempt are snapshotted; submitted answers are immutable. | Database constraints and automated tests | Implemented |
| Knowledge-boundary output | Coverage and evidence are converted into strong, ready, needs-work, needs-confirmation, and not-assessed regions, with a conservative starting skill. | Course Assessment | Implemented |
| Path integration | Submitted evidence updates the global Skill Passport, invalidates affected paths, and regenerates a prerequisite-safe course path. | Dashboard and Personalized Path | Implemented |
| Empirical item monitoring | Real submitted responses produce sample-gated correct rate, empirical difficulty, point-biserial discrimination, unsure rate, response time, mastery/confidence change, and author-prior error. | Reviewer Governance → Diagnostic Quality Lab | Implemented; collecting data |
| External diagnostic accuracy | The software exposes evidence and calibration readiness, but accuracy against an independent reference assessment needs consented participants and cannot be generated from demo profiles. | Diagnostic Quality Lab readiness cards | Requires prospective study |
| Subgroup fairness | LearnPath does not collect sensitive demographics. A subgroup audit requires ethics approval, consent, a declared grouping policy, and minimum cohort sizes. | Diagnostic Quality Lab readiness cards | Requires prospective study |

## Sample gates

An item is `UNOBSERVED` before any submitted response, `FIELD_TEST` below 20 responses, and `REPORTABLE` at 20 or more responses. Empirical discrimination and author-prior calibration error are withheld below the gate. Correct and unsure rates may be shown descriptively, but the interface labels the sample state.

The current five-point author difficulty scale is mapped transparently to expected correct rates of 0.90, 0.75, 0.60, 0.45, and 0.30. This mapping is an inspectable engineering prior, not an IRT claim. A difference greater than 0.20 after the sample gate raises an author-prior mismatch warning. The lab also flags reportable items that are extremely easy, extremely difficult, weakly discriminating, unusually uncertain, or suspiciously fast.

## Trust boundary

The learner-facing diagnostic can place and prioritize learning now. It cannot certify expertise or prove educational effectiveness. Paper 1 can accurately claim the implemented architecture, policies, audit trail, and data-collection instrumentation. Calibration, reference-test validity, delayed retention validity, and subgroup fairness must be reported only after an approved real-learner study produces sufficient data.
