UPDATE system_metadata
SET value = value || '{"phase":14,"status":"model_evaluated_not_deployed"}'::jsonb,
    updated_at = NOW()
WHERE key = 'application';
