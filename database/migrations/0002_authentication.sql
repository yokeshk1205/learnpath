CREATE TABLE roles (
  id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT roles_code_format CHECK (code = UPPER(code) AND code ~ '^[A-Z][A-Z_]*$')
);

CREATE TABLE users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  email_verified_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_email_normalized CHECK (email = LOWER(BTRIM(email))),
  CONSTRAINT users_display_name_length CHECK (CHAR_LENGTH(display_name) BETWEEN 2 AND 80),
  CONSTRAINT users_status_allowed CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DEACTIVATED'))
);

CREATE TABLE user_roles (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id SMALLINT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE refresh_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  replaced_by_session_id UUID REFERENCES refresh_sessions(id) ON DELETE SET NULL,
  user_agent TEXT,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT refresh_sessions_expiry CHECK (expires_at > created_at)
);

CREATE INDEX user_roles_role_id_idx ON user_roles(role_id);
CREATE INDEX refresh_sessions_user_id_idx ON refresh_sessions(user_id);
CREATE INDEX refresh_sessions_active_user_idx
  ON refresh_sessions(user_id, expires_at)
  WHERE revoked_at IS NULL;

INSERT INTO roles (code, name, description)
VALUES
  ('LEARNER', 'Learner', 'Uses LearnPath to pursue learning goals and enrolled courses.'),
  ('ADMIN', 'Administrator', 'Manages curriculum, learners, analytics, and model operations.')
ON CONFLICT (code) DO NOTHING;

UPDATE system_metadata
SET value = value || '{"phase":2}'::jsonb,
    updated_at = NOW()
WHERE key = 'application';

