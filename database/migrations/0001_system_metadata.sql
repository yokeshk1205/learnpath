CREATE TABLE system_metadata (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO system_metadata (key, value)
VALUES (
  'application',
  '{"name":"LearnPath","phase":1,"data_classification":"SYSTEM"}'::jsonb
);

