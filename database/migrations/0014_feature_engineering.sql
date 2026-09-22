UPDATE system_metadata
SET value = value || '{"phase":13,"status":"feature_engineering_ready"}'::jsonb,
    updated_at = NOW()
WHERE key = 'application';
