UPDATE system_metadata
SET value = value || '{"phase":15,"status":"ml_inference_available_not_ranked"}'::jsonb,
    updated_at = NOW()
WHERE key = 'application';
