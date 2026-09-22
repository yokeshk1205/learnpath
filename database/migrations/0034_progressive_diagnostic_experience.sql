-- Progressive diagnostic entry, honest knowledge-boundary support, and a
-- durable assessment work queue. Self-report is deliberately isolated from
-- learner_skill_mastery and skill_evidence: it is a prioritization signal,
-- never verified proficiency evidence.

CREATE TABLE learner_course_self_reports (
  enrollment_id UUID PRIMARY KEY REFERENCES course_enrollments(id) ON DELETE CASCADE,
  learner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (enrollment_id, course_id)
    REFERENCES course_enrollments(id, course_id) ON DELETE CASCADE
);

CREATE INDEX learner_course_self_reports_learner_idx
  ON learner_course_self_reports(learner_id, updated_at DESC);

CREATE TABLE learner_module_self_reports (
  enrollment_id UUID NOT NULL REFERENCES learner_course_self_reports(enrollment_id) ON DELETE CASCADE,
  course_id UUID NOT NULL,
  module_id UUID NOT NULL,
  familiarity TEXT NOT NULL,
  confidence TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (enrollment_id, module_id),
  FOREIGN KEY (module_id, course_id) REFERENCES modules(id, course_id) ON DELETE CASCADE,
  CONSTRAINT learner_module_self_reports_familiarity_allowed CHECK (
    familiarity IN ('NEVER_LEARNED', 'KNOW_A_LITTLE', 'COMFORTABLE', 'VERY_COMFORTABLE', 'UNSURE')
  ),
  CONSTRAINT learner_module_self_reports_confidence_allowed CHECK (
    confidence IS NULL OR confidence IN ('LOW', 'MEDIUM', 'HIGH')
  )
);

CREATE TABLE learner_skill_self_reports (
  enrollment_id UUID NOT NULL REFERENCES learner_course_self_reports(enrollment_id) ON DELETE CASCADE,
  course_id UUID NOT NULL,
  skill_id UUID NOT NULL,
  familiarity TEXT NOT NULL,
  confidence TEXT,
  experience_source TEXT,
  verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (enrollment_id, skill_id),
  FOREIGN KEY (course_id, skill_id) REFERENCES course_skills(course_id, skill_id) ON DELETE CASCADE,
  CONSTRAINT learner_skill_self_reports_familiarity_allowed CHECK (
    familiarity IN ('NEVER_LEARNED', 'KNOW_A_LITTLE', 'COMFORTABLE', 'VERY_COMFORTABLE', 'UNSURE')
  ),
  CONSTRAINT learner_skill_self_reports_confidence_allowed CHECK (
    confidence IS NULL OR confidence IN ('LOW', 'MEDIUM', 'HIGH')
  ),
  CONSTRAINT learner_skill_self_reports_experience_allowed CHECK (
    experience_source IS NULL OR experience_source IN (
      'LEARNED_IN_COURSE', 'SOLVED_PROBLEMS', 'USED_IN_PROJECT', 'READ_OR_WATCHED_ONLY', 'OTHER'
    )
  ),
  CONSTRAINT learner_skill_self_reports_verification_allowed CHECK (
    verification_status IN ('UNVERIFIED', 'CONFIRMED', 'NOT_CONFIRMED')
  )
);

CREATE TABLE learner_assessment_backlog (
  learner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  enrollment_id UUID NOT NULL REFERENCES course_enrollments(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE RESTRICT,
  priority NUMERIC(6, 3) NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  last_evaluated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (enrollment_id, skill_id),
  CONSTRAINT learner_assessment_backlog_priority_valid CHECK (priority BETWEEN 0 AND 100),
  CONSTRAINT learner_assessment_backlog_reason_allowed CHECK (
    reason IN (
      'CURRENT_PATH_BLOCKER', 'PREREQUISITE_GATEWAY', 'CONTRADICTORY_EVIDENCE',
      'LOW_CONFIDENCE', 'RETENTION_RISK', 'NOT_TESTED', 'UPCOMING_MODULE',
      'STARVATION_PREVENTION', 'SUFFICIENT_EVIDENCE', 'QUESTION_BANK_BLOCKED'
    )
  ),
  CONSTRAINT learner_assessment_backlog_status_allowed CHECK (
    status IN ('PENDING', 'IN_PROGRESS', 'RESOLVED', 'BLOCKED')
  )
);

CREATE INDEX learner_assessment_backlog_priority_idx
  ON learner_assessment_backlog(learner_id, enrollment_id, status, priority DESC);

ALTER TABLE assessment_attempts
  ADD COLUMN diagnostic_intent TEXT NOT NULL DEFAULT 'PLACEMENT',
  ADD CONSTRAINT assessment_attempts_diagnostic_intent_allowed CHECK (
    diagnostic_intent IN ('PLACEMENT', 'COURSE_COVERAGE', 'KNOWLEDGE_CHECK', 'CHALLENGE')
  );

UPDATE assessment_attempts
SET diagnostic_intent = CASE
  WHEN assessment_program_id IS NOT NULL THEN 'COURSE_COVERAGE'
  ELSE 'PLACEMENT'
END;

UPDATE system_metadata
SET value = value || '{"phase":24,"status":"progressive_evidence_diagnostic","diagnosticPolicy":"progressive-evidence-v1"}'::jsonb,
    updated_at = NOW()
WHERE key = 'application';
