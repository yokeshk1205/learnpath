CREATE INDEX skill_evidence_skill_learner_idx
  ON skill_evidence(skill_id, learner_id);

UPDATE system_metadata
SET value = value || '{"phase":11,"status":"candidate_generation_and_baselines"}'::jsonb,
    updated_at = NOW()
WHERE key = 'application';

