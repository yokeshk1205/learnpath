UPDATE system_metadata
SET value = value || jsonb_build_object(
      'phase', 20,
      'status', 'sample_gated_model_governance',
      'architectureFrozenAtPhase', 19
    ),
    updated_at = NOW()
WHERE key = 'application';
