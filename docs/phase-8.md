# Phase 8 — Learning resources and activity tracking

## Outcome

Phase 8 gives the learner something real to study and makes that study behavior observable. Every
resource is mapped to a globally identifiable skill and may be reused in several course/module
contexts. Starting, completing, or skipping a resource creates an immutable activity event and
updates the learner's resource history and measured study time.

This phase deliberately does not select the next skill, rank resources as recommendations, or change
mastery/confidence from self-reported completion. Candidate generation begins in Phase 11, resource
selection follows an actual skill recommendation in a later phase, and Phase 9 adds knowledge updates
from defensible performance evidence.

## Normalized resource model

Migration `0009_learning_resources_activity.sql` adds:

- `learning_resources` for reusable resource content, format, difficulty, duration, objectives, and
  structured sections;
- `learning_resource_skills` for global skill mappings and an explicit primary skill;
- `learning_resource_contexts` for optional reuse in course/module placements;
- `learner_learning_history` for the learner/resource aggregate lifecycle and measured time;
- `learner_activity_events` for immutable event-level history.

The deterministic seed creates two internal resources for every active DSA skill: a visual concept
primer and a guided worked example. The current curriculum therefore contains 72 resources, 72
primary global-skill mappings, and 96 course/module placements. A shared resource is one identity even
when several courses use it.

## Activity semantics

The activity stream supports the event vocabulary defined by the master architecture. Phase 8 writes:

- `RESOURCE_STARTED`, `RESOURCE_COMPLETED`, and `RESOURCE_SKIPPED` from focused study sessions;
- `LESSON_STARTED` and `LESSON_COMPLETED` from module-progress transitions;
- `ASSESSMENT_SUBMITTED` from a completed diagnostic.

Every event stores learner identity, optional course/module/skill/resource context, timestamp,
duration, result, and metadata. Resource lifecycle calls are validated against the learner's active
goal or enrolled-course context. Completing or skipping before a start event fails explicitly.

Resource completion updates `total_time_spent_seconds` and `last_practiced_at` on the existing global
learner-skill record. It does not alter mastery, confidence, attempt counts, or retention.

## Authenticated API

- `GET /learning/overview` returns learner-visible resources, aggregate activity statistics, and the
  recent event stream. Optional `skillId`, `courseId`, and `moduleId` filters are UUID-validated.
- `GET /learning/resources/:resourceId` returns structured resource content, global skill state,
  course reuse contexts, and learner-owned history.
- `POST /learning/resources/:resourceId/events` records a validated resource start, completion, or
  skip with measured duration and optional bounded result/metadata values.

List responses omit the full resource body; content is loaded only for the focused study page.

## Learner experience

`/learning-library` is a responsive learning studio backed entirely by the authenticated API. It
shows available resources, covered skills, completion counts, measured study time, search, format and
activity filters, global course reuse, mastery context, and the latest immutable activity events.

`/learn/:resourceId` provides objectives, structured learning sections, study context, a measured
session timer, and real start/complete/skip controls. The result immediately updates the resource
history and activity UI while displaying that mastery remains unchanged.

The dashboard now summarizes the real resource/activity state, course modules link to their filtered
resource context, and unlocked or mastered prerequisite nodes link to resources for that skill.

## Verification

HTTP tests cover authentication, filter validation, resource detail loading, lifecycle event
validation, and service delegation. The PostgreSQL suite verifies seeded resource reuse across
multiple enrolled courses, start-before-complete enforcement, immutable resource events, history and
duration aggregation, unchanged nullable mastery/confidence, global time updates, module activity
events, diagnostic submission events, and course/module filters.

## Next boundary

Phase 9 adds the general mastery and confidence update system. Learning activity may become an input
or context, but resource completion alone must never be treated as proof of knowledge.
