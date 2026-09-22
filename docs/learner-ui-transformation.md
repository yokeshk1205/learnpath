# Learner UI transformation

LearnPath now presents the adaptive-learning workflow as a learner journey instead of a collection of research and CRUD screens.

## Primary journey

1. `/dashboard` is the learner's **Today** view. It gives one prominent next action and places a real lane-based preview of the personalized path before supporting metrics, courses, skills, and memory guidance. When several courses are enrolled, a course switcher changes the entire dashboard context—diagnostic, recommendation, explanation, lesson action, and path preview—and remembers the learner's selection for the session.
2. A persistent learner workspace keeps Today, My Courses, Skill Passport, Review, and Progress consistent on desktop and mobile. Diagnostic, lesson, practice, and assessment screens intentionally remain distraction-free focus modes.
3. A course workspace introduces the knowledge check before path creation. After personalization, one next-action panel becomes the primary control; module resources and progress remain secondary and no longer expose competing practice actions for every skill.
4. Diagnostic results summarize skills that are already strong, ready to build, or need foundations first, then link to the correct enrolled-course path.
5. The personalized path is the visual centerpiece: already known, in progress, Learn Next, upcoming, and locked skills are separated into understandable lanes. Large recognized and locked groups are collapsed so the current decision stays dominant.
6. A recommended path item resolves a real skill-mapped learning resource and opens the Learning Studio.
7. Completing the resource creates real activity events and hands the learner to a validated practice question and then a distinct post-lesson assessment.
8. Practice and assessment update global mastery, confidence, retention, evidence, and prerequisite readiness through backend services. New assessed evidence marks the saved path stale instead of silently changing it.
9. A stale path presents one update action, preserves the previous version, recalculates graph eligibility and ML ranking, and shows the before/after decision. The paused recommendation is explicitly labeled as previous rather than current.
10. The Skill Passport, retention, analytics, course contexts, and cross-course paths immediately reuse the updated global learner state. The coordinated Learn Next remains a separate learner-level decision and is not confused with the course currently selected for inspection.

## Learner and reviewer boundaries

Learner screens use plain explanations by default. Model versions, candidate counts, probabilities, feature provenance, mastery-policy details, and retention calculations remain available in collapsed technical details. The original technical dashboard remains available at `/reviewer`, and the candidate, inference, feature, synthetic-data, model-evaluation, and architecture labs remain routed for demonstrations.

## Real-data boundary

No mastery, confidence, retention, recommendation, lesson, or lock state is hardcoded in the learner UI. The dashboard and path resolve current API data, mapped learning resources, enrollment context, and persisted personalized paths.

Practice and assessment evidence recalculate mastery and prerequisite readiness immediately. Personalized paths are immutable, versioned snapshots. New evidence explicitly invalidates the current snapshot; learner-triggered regeneration creates a new version and retains history for explanation and evaluation.

Five repeatable learner personas and their credentials are documented in [demo-profiles.md](./demo-profiles.md).
