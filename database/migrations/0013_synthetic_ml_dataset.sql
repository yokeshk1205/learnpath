UPDATE system_metadata
SET value = value || '{"phase":12,"status":"synthetic_ml_dataset"}'::jsonb,
    updated_at = NOW()
WHERE key = 'application';
