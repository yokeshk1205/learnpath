-- The original concept-discrimination item is the anchor even when an advanced
-- skill carries a high course difficulty. Application and boundary items then
-- confirm that initial probe with different evidence.
UPDATE questions
SET diagnostic_role = 'ANCHOR',
    construct_code = 'FOUNDATION',
    updated_at = NOW()
WHERE status = 'ACTIVE'
  AND question_purpose = 'DIAGNOSTIC'
  AND slug LIKE 'final-%-diagnostic';

UPDATE system_metadata
SET value = value || '{"diagnosticAnchorCorrection":true}'::jsonb,
    updated_at = NOW()
WHERE key = 'application';
