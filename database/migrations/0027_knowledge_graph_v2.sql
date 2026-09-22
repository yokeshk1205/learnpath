UPDATE personalized_paths
SET status = 'STALE',
    invalidated_at = COALESCE(invalidated_at, NOW()),
    invalidation_reason = 'KNOWLEDGE_GRAPH_V2_POLICY_CHANGED',
    updated_at = NOW()
WHERE status = 'ACTIVE';

UPDATE system_metadata
SET value = value || '{"phase":21,"status":"knowledge_graph_v2","graphAnalytics":"networkx","prerequisitePolicy":"confidence-aware-v2"}'::jsonb,
    updated_at = NOW()
WHERE key = 'application';
