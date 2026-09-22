CREATE TABLE domains (
  id UUID PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  icon TEXT NOT NULL,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT domains_slug_format CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

CREATE TABLE skills (
  id UUID PRIMARY KEY,
  domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE RESTRICT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  difficulty SMALLINT NOT NULL,
  estimated_minutes SMALLINT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT skills_slug_format CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT skills_difficulty_range CHECK (difficulty BETWEEN 1 AND 5),
  CONSTRAINT skills_estimated_minutes_positive CHECK (estimated_minutes > 0),
  UNIQUE (domain_id, name)
);

CREATE TABLE learning_goals (
  id UUID PRIMARY KEY,
  domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE RESTRICT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  outcome TEXT NOT NULL,
  level TEXT NOT NULL,
  estimated_weeks SMALLINT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT learning_goals_slug_format CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT learning_goals_level_allowed CHECK (level IN ('BEGINNER', 'INTERMEDIATE', 'ADVANCED')),
  CONSTRAINT learning_goals_weeks_positive CHECK (estimated_weeks > 0),
  UNIQUE (domain_id, name)
);

CREATE TABLE goal_skills (
  goal_id UUID NOT NULL REFERENCES learning_goals(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE RESTRICT,
  relevance NUMERIC(4, 3) NOT NULL,
  required_mastery NUMERIC(4, 3) NOT NULL,
  is_core BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (goal_id, skill_id),
  CONSTRAINT goal_skills_relevance_range CHECK (relevance BETWEEN 0 AND 1),
  CONSTRAINT goal_skills_mastery_range CHECK (required_mastery BETWEEN 0 AND 1)
);

CREATE TABLE courses (
  id UUID PRIMARY KEY,
  domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE RESTRICT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  level TEXT NOT NULL,
  estimated_hours NUMERIC(5, 1) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT courses_slug_format CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT courses_level_allowed CHECK (level IN ('BEGINNER', 'INTERMEDIATE', 'ADVANCED')),
  CONSTRAINT courses_estimated_hours_positive CHECK (estimated_hours > 0),
  UNIQUE (domain_id, name)
);

CREATE TABLE modules (
  id UUID PRIMARY KEY,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  sequence SMALLINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT modules_slug_format CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT modules_sequence_positive CHECK (sequence > 0),
  UNIQUE (course_id, slug),
  UNIQUE (course_id, sequence),
  UNIQUE (id, course_id)
);

CREATE TABLE course_skills (
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  module_id UUID NOT NULL,
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE RESTRICT,
  sequence SMALLINT NOT NULL,
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (course_id, skill_id),
  FOREIGN KEY (module_id, course_id) REFERENCES modules(id, course_id) ON DELETE CASCADE,
  CONSTRAINT course_skills_sequence_positive CHECK (sequence > 0),
  UNIQUE (module_id, skill_id),
  UNIQUE (module_id, sequence)
);

CREATE TABLE skill_prerequisites (
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  prerequisite_skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE RESTRICT,
  required_mastery NUMERIC(4, 3) NOT NULL,
  relationship_type TEXT NOT NULL DEFAULT 'REQUIRED',
  PRIMARY KEY (skill_id, prerequisite_skill_id),
  CONSTRAINT skill_prerequisites_not_self CHECK (skill_id <> prerequisite_skill_id),
  CONSTRAINT skill_prerequisites_mastery_range CHECK (required_mastery BETWEEN 0 AND 1),
  CONSTRAINT skill_prerequisites_type_allowed CHECK (
    relationship_type IN ('REQUIRED', 'RECOMMENDED')
  )
);

CREATE TABLE learner_goals (
  id UUID PRIMARY KEY,
  learner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id UUID NOT NULL REFERENCES learning_goals(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  priority SMALLINT NOT NULL DEFAULT 1,
  target_date DATE,
  selected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT learner_goals_status_allowed CHECK (status IN ('ACTIVE', 'PAUSED', 'COMPLETED', 'DROPPED')),
  CONSTRAINT learner_goals_priority_range CHECK (priority BETWEEN 1 AND 5),
  UNIQUE (learner_id, goal_id)
);

CREATE INDEX skills_domain_id_idx ON skills(domain_id);
CREATE INDEX skills_category_idx ON skills(category);
CREATE INDEX learning_goals_domain_id_idx ON learning_goals(domain_id);
CREATE INDEX goal_skills_skill_id_idx ON goal_skills(skill_id);
CREATE INDEX courses_domain_id_idx ON courses(domain_id);
CREATE INDEX modules_course_id_idx ON modules(course_id);
CREATE INDEX course_skills_skill_id_idx ON course_skills(skill_id);
CREATE INDEX skill_prerequisites_prerequisite_idx ON skill_prerequisites(prerequisite_skill_id);
CREATE INDEX learner_goals_learner_status_idx ON learner_goals(learner_id, status);
CREATE INDEX learner_goals_goal_id_idx ON learner_goals(goal_id);

UPDATE system_metadata
SET value = value || '{"phase":3}'::jsonb,
    updated_at = NOW()
WHERE key = 'application';

