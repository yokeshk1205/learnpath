# Phase 4 — Multiple course enrollment and independent progress

## Outcome

Phase 4 lets a learner study multiple courses simultaneously without confusing enrollment progress
with knowledge. Every enrollment has independent course/module state, but every course continues to
reference the same globally identifiable skills.

## Implemented data model

- `course_enrollments` with learner/course uniqueness, optional learning-goal context, lifecycle
  status, enrollment time, and last access
- `learner_course_progress` with module counts, percentage, and start/completion timestamps
- `learner_module_progress` with enrollment-scoped status and timestamps
- composite foreign keys that prevent a module progress row from referencing a module in a different
  course than its enrollment
- transactional initialization of course and all module progress records

Statuses are `ACTIVE`, `PAUSED`, `COMPLETED`, and `DROPPED` for enrollments, and `NOT_STARTED`,
`IN_PROGRESS`, and `COMPLETED` for modules.

## Authenticated APIs

- `GET /enrollments` — list the learner's independent course progress records
- `POST /enrollments` — enroll once in a course and initialize progress transactionally
- `GET /enrollments/:enrollmentId` — load the course workspace, modules, and global skill references
- `POST /enrollments/:enrollmentId/status` — pause, resume, or drop an enrollment
- `POST /enrollments/:enrollmentId/modules/:moduleId/progress` — start/complete an accessible module

Duplicate enrollment returns `409 ALREADY_ENROLLED`. Later modules return `409 MODULE_LOCKED` until
all earlier modules in that course are complete. Completing all modules marks the course complete.

## Learner experience

- an active-course area on the real-data dashboard
- simultaneous enrollment from the connected course catalog
- goal context shown on each enrollment
- real module counts and progress percentages
- a dedicated responsive course workspace
- ordered locked/unlocked module presentation
- start, complete, pause, and resume interactions backed by PostgreSQL
- global skill chips grouped into their course modules
- an explicit “Progress ≠ knowledge” explanation
- honest `Awaiting mastery evidence` state for cross-course knowledge matching

## Critical boundary

Module completion changes only the owning course enrollment. It does not create, copy, reset, or
update learner mastery. Phase 5 will add one global knowledge record per `(learner_id, skill_id)`.

## Verification

- Phase 4 migration applied successfully
- API tests cover authentication, validation, creation, and module progress routing
- PostgreSQL integration tests cover multiple simultaneous enrollments, duplicate prevention,
  locked modules, ordered progression, and progress isolation between courses
- frontend tests cover list, enrollment, and module-progress requests
- browser QA completed goal selection, two course enrollments, course workspace navigation,
  module start/completion, 33.33% progress, ordered unlocking, pause/resume, and responsive layout

## Deliberately deferred

- learner mastery, confidence, retention, and knowledge evidence (Phase 5)
- diagnostic assessment and question scoring (Phase 6)
- learner-specific prerequisite satisfaction
- learning resources and activity-derived automatic completion
- ML ranking and personalized path generation
