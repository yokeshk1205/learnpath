# Phase 18 — Evidence-Triggered Dynamic Path Regeneration

Phase 18 closes the adaptive loop after a learner performs. Practice, diagnostics, learning assessment,
and retention checks update the one global learner-skill state. The same evidence transaction now marks
every current path for that learner `STALE`, because one global skill can change prerequisites, candidate
eligibility, live features, ranking, and coordination in several courses.

## Lifecycle

```text
ACTIVE path
  → performance evidence changes global mastery
STALE path (old recommendation is paused and excluded from coordination)
  → learner explicitly chooses Update my path
SUPERSEDED immutable old version + new ACTIVE version
```

An enrollment can have one current `ACTIVE` or `STALE` row and multiple `SUPERSEDED` rows. PostgreSQL
enforces unique `(enrollment_id, path_version)` values and a partial unique index for the current row.
Regeneration locks the stale version and writes the new path, items, recommendation event, and
`PATH_REGENERATED` event in one transaction.

## Regeneration pipeline

The regenerated version reruns the production decision pipeline; it never edits old path items:

1. Generate candidates from current global mastery, retention, course context, and prerequisites.
2. Keep graph-locked skills outside ML ranking.
3. Build the frozen 55-feature live vectors for eligible candidates.
4. Request probabilities from the checksum-verified trained model.
5. Apply the versioned dependency-aware path policy.
6. Compare old and new items by global skill identity.
7. Persist the new version and structured change summary.

The summary records previous/current Learn Next, lane changes, newly recognized and unlocked skills, and
changed mastery snapshots. It is returned by the API and stored with the new path for later review.

## API and UI

- `GET /enrollments/:enrollmentId/path` returns the newest path with freshness metadata.
- `POST /enrollments/:enrollmentId/path/regenerate` accepts only a stale current path.
- `GET /enrollments/:enrollmentId/path/history` returns immutable versions newest first.
- The course path screen displays a prominent stale warning and pauses its recommendation.
- After regeneration it displays before/after Learn Next, material changes, and version history.
- Cross-course coordination ignores stale paths; its explicit action refreshes them before comparing.

There is deliberately no silent regeneration on GET. Learners and reviewers can see that evidence made a
path outdated, request the update, and inspect what changed. Recommendations remain observational:
generation and regeneration never update mastery or course progress.
