# Database migrations

LearnPath uses forward-only, checksum-protected SQL migrations. The migration runner creates
`schema_migrations`, applies files in lexical order, and refuses to continue if an already-applied
migration was edited.

Migration 0001 adds `system_metadata`. Migration 0002 adds normalized users, roles, role assignments,
and hashed refresh sessions. Migration 0003 adds domains, learning goals, courses, modules, global
skills, goal/course mappings, prerequisite edges, and learner goal selection. Migration 0004 seeds a
deterministic DSA curriculum with 36 global skills, 86 prerequisite edges, three goals, and four courses.
Migration 0005 adds course enrollments plus independent learner course/module progress. Migration
0006 adds the global `learner_skill_mastery` source of truth, uniqueness at
`(learner_id, skill_id)`, nullable mastery/confidence/retention, evidence counts, timestamps, and time
spent. It backfills relevant learner-skill relationships from existing goals and enrollments without
inventing assessment evidence. Migration 0007 adds skill-linked diagnostic questions and options,
goal-specific assessment templates, learner-owned attempts, immutable answers, per-skill result
snapshots, and 16 seeded questions across eight foundational DSA skills. Correct options remain
server-side. Migration 0008 adds a graph-integrity
trigger that rejects any prerequisite relationship capable of creating a cycle. Phase 7 analysis uses
the existing normalized edge thresholds without duplicating learner knowledge or course state.
Migration 0009 adds reusable learning resources, global resource-to-skill mappings, course/module
placements, learner-owned resource history, and an immutable activity event stream. It seeds 72
resources for the 36-skill curriculum, records module transitions through a database trigger, and
keeps activity duration separate from mastery, confidence, and retention.
Migration 0010 corrects goal coupling and introduces the Phase 9 evidence-driven learner model. It
adds explicit evidence states, course-scoped diagnostics, enrollment-scoped attempts, real practice
attempts, and an immutable unified `skill_evidence` ledger. It preserves the unique global
`(learner_id, skill_id)` source of truth and keeps course progress independent from knowledge.
Migration 0011 activates retention and forgetting with evidence anchors, configurable decay,
explicit retention states, immutable before/after retention snapshots, real retention-check
attempts, and retention activity events. Time changes retention but never overwrites mastery.
Migration 0012 records the Phase 11 candidate-generation boundary and adds a learner-aware evidence
lookup index for real observed-popularity counts. Candidate pools and baseline orders remain computed
views; no recommendation score or personalized path is persisted.
Migration 0013 records the Phase 12 synthetic-dataset boundary in system metadata. The generated
artifact remains file-based inside the ML service and is never inserted into learner, mastery,
evidence, activity, or enrollment tables.
Migration 0014 records the Phase 13 feature-engineering boundary. Feature contracts and engineered
synthetic rows also remain file-based and cannot mutate application learner state.
Migration 0015 records the Phase 14 offline-evaluation boundary as evaluated but not deployed. Model,
split, and metric artifacts remain file-based in the ML service and cannot alter live candidates.
Migration 0016 records the Phase 15 inference-service boundary. Probability responses remain
stateless and are not persisted as learner evidence, candidate order, or course progress.
Migration 0017 adds exactly one persisted personalized path per course enrollment and normalized path
items for recognized, current, recommended-next, upcoming, and locked skills. It records the checked
model, feature-contract, inference, and path-policy versions without duplicating global mastery or
changing independent module progress. Locked skills remain unscored.

Run `npm run db:migrate` after setting `DATABASE_URL`. Use `npm run db:status` to inspect pending
migrations without changing application tables.
