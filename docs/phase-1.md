# Phase 1 — Project foundation

## Implemented

- npm workspace containing React/Vite and Express/TypeScript applications
- isolated Python/FastAPI ML service
- PostgreSQL connection pool and fail-closed readiness probe
- forward-only, checksum-protected SQL migration runner
- local environment template and Docker Compose topology
- branded web foundation screen backed by real service liveness calls
- automated web, API, and ML health tests
- TypeScript build, type-check, and lint configuration

## Deliberately deferred

The following belong to later phases and are not mocked: authentication, course or skill data,
learner mastery, assessments, prerequisites, recommendation ranking, learning paths, ML training,
model inference, and evaluation metrics.

## Phase exit criteria

Phase 1 is complete when dependencies install, TypeScript services build, automated tests pass, the
two runtime health endpoints respond, PostgreSQL accepts the migration, and the API readiness endpoint
reports `ready`. Any criterion not exercised in a particular environment must be reported as not
verified.

