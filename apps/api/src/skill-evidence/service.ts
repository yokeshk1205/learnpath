import { randomUUID } from "node:crypto";

import type { PoolClient } from "pg";

import { AppError } from "../errors.js";
import {
  calculateConfidence,
  classifyEvidenceState,
  updateMasteryFromEvidence,
  type EvidenceSummary,
} from "../mastery/service.js";
import type { EvidenceSourceType, EvidenceState } from "../mastery/policy.js";
import { config } from "../config.js";
import { calculateRetention, classifyRetention } from "../retention/service.js";
import type { RetentionState } from "../retention/policy.js";

type DatabaseRow = Record<string, unknown>;

export interface SkillEvidenceObservation {
  attemptNumber?: number;
  correct: boolean;
  difficulty: number;
  evidenceStrength?: number;
  hintsUsed?: number;
  metadata?: Record<string, unknown>;
  score: number;
  timeTakenSeconds?: number;
}

export interface SkillEvidenceUpdate {
  confidenceAfter: number;
  confidenceBefore: number | null;
  correctAttempts: number;
  evidenceCount: number;
  evidenceStateAfter: EvidenceState;
  evidenceStateBefore: EvidenceState;
  incorrectAttempts: number;
  masteryAfter: number;
  masteryBefore: number | null;
  retentionAfter: number;
  retentionBefore: number | null;
  retentionStateAfter: RetentionState;
  retentionStateBefore: RetentionState;
  skillId: string;
  totalAttempts: number;
}

export interface RecordSkillEvidenceInput {
  learnerId: string;
  observations: SkillEvidenceObservation[];
  performanceScore: number;
  reliability?: number;
  skillId: string;
  sourceId: string;
  sourceType: EvidenceSourceType;
}

function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function databaseDate(value: unknown): Date | null {
  if (!value) return null;
  return value instanceof Date ? value : new Date(String(value));
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function evidenceSummary(rows: DatabaseRow[]): EvidenceSummary {
  const scores = rows.map((row) => nullableNumber(row.score)).filter((score): score is number => score !== null);
  const difficulties = rows
    .map((row) => nullableNumber(row.difficulty))
    .filter((difficulty): difficulty is number => difficulty !== null);
  const meanScore = scores.length ? scores.reduce((total, score) => total + score, 0) / scores.length : 0;
  const variance = scores.length > 1
    ? scores.reduce((total, score) => total + (score - meanScore) ** 2, 0) / scores.length
    : 0;
  const sources = [...new Set(rows.map((row) => String(row.source_type) as EvidenceSourceType))];
  return {
    averageDifficulty: difficulties.length
      ? difficulties.reduce((total, difficulty) => total + difficulty, 0) / difficulties.length
      : 0,
    consistency: scores.length ? clamp(1 - Math.sqrt(variance) * 2) : 0,
    evidenceCount: rows.length,
    hasRetentionEvidence: sources.includes("RETENTION_CHECK"),
    sessionCount: new Set(rows.map((row) => `${row.source_type}:${row.source_id ?? row.id}`)).size,
    sourceDiversity: sources.length,
    sources,
  };
}

function assessedSource(sourceType: EvidenceSourceType): boolean {
  return sourceType !== "PRACTICE";
}

export async function recordSkillEvidence(
  client: PoolClient,
  input: RecordSkillEvidenceInput,
): Promise<SkillEvidenceUpdate> {
  if (!input.observations.length) {
    throw new AppError(400, "EVIDENCE_REQUIRED", "At least one performance observation is required.");
  }
  const stateResult = await client.query(
    `SELECT mastery, confidence, evidence_state, retention_anchor_at, attempt_count,
            correct_attempts, incorrect_attempts
     FROM learner_skill_mastery
     WHERE learner_id = $1 AND skill_id = $2
     FOR UPDATE`,
    [input.learnerId, input.skillId],
  );
  const state = stateResult.rows[0] as DatabaseRow | undefined;
  if (!state) {
    throw new AppError(409, "LEARNER_SKILL_STATE_MISSING", "The learner skill state is unavailable.");
  }

  const historyResult = await client.query(
    `SELECT id, source_type, source_id, score, difficulty
     FROM skill_evidence
     WHERE learner_id = $1 AND skill_id = $2
     ORDER BY created_at, id`,
    [input.learnerId, input.skillId],
  );
  const pendingRows: DatabaseRow[] = input.observations.map((observation, index) => ({
    difficulty: observation.difficulty,
    id: `pending-${index}`,
    score: observation.score,
    source_id: input.sourceId,
    source_type: input.sourceType,
  }));
  const summary = evidenceSummary([...(historyResult.rows as DatabaseRow[]), ...pendingRows]);
  const masteryBefore = nullableNumber(state.mastery);
  const confidenceBefore = nullableNumber(state.confidence);
  const evidenceStateBefore = String(state.evidence_state) as EvidenceState;
  const calculatedAt = new Date();
  const retentionBeforeProjection = calculateRetention({
    anchorAt: databaseDate(state.retention_anchor_at),
    asOf: calculatedAt,
    baseLambda: config.retentionBaseLambda,
    confidence: confidenceBefore,
    evidenceCount: historyResult.rows.length,
    mastery: masteryBefore,
  });
  const masteryAfter = updateMasteryFromEvidence(
    masteryBefore,
    input.performanceScore,
    input.sourceType,
    input.reliability,
  );
  const confidenceAfter = calculateConfidence(summary);
  const evidenceStateAfter = classifyEvidenceState(summary, confidenceAfter);
  const retentionAfter = masteryAfter;
  const retentionStateAfter = classifyRetention(retentionAfter);
  const correct = input.observations.filter((observation) => observation.correct).length;
  const incorrect = input.observations.length - correct;
  const timeSpent = input.observations.reduce(
    (total, observation) => total + (observation.timeTakenSeconds ?? 0),
    0,
  );

  for (const observation of input.observations) {
    await client.query(
      `INSERT INTO skill_evidence (
         id, learner_id, skill_id, source_type, source_id, score, correct,
         difficulty, attempt_number, hints_used, time_taken_seconds,
         mastery_before, mastery_after, confidence_before, confidence_after,
         evidence_state_before, evidence_state_after, metadata
         , created_at, retention_before, retention_after, retention_state_before, retention_state_after,
         evidence_strength
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7,
         $8, $9, $10, $11,
         $12, $13, $14, $15,
         $16, $17, $18::jsonb
         , $19, $20, $21, $22, $23, $24
       )`,
      [
        randomUUID(), input.learnerId, input.skillId, input.sourceType, input.sourceId,
        observation.score, observation.correct, observation.difficulty,
        observation.attemptNumber ?? null, observation.hintsUsed ?? null,
        observation.timeTakenSeconds ?? null, masteryBefore, masteryAfter,
        confidenceBefore, confidenceAfter, evidenceStateBefore, evidenceStateAfter,
        JSON.stringify(observation.metadata ?? {}),
        calculatedAt,
        retentionBeforeProjection.retention, retentionAfter,
        retentionBeforeProjection.state, retentionStateAfter,
        observation.evidenceStrength ?? null,
      ],
    );
  }

  await client.query(
    `UPDATE learner_skill_mastery
     SET mastery = $3, confidence = $4, evidence_state = $5,
         attempt_count = attempt_count + $6,
         correct_attempts = correct_attempts + $7,
         incorrect_attempts = incorrect_attempts + $8,
         total_time_spent_seconds = total_time_spent_seconds + $9,
         last_assessed_at = CASE WHEN $10 THEN NOW() ELSE last_assessed_at END,
         last_practiced_at = CASE WHEN $10 THEN last_practiced_at ELSE NOW() END,
         retention = $11, retention_state = $12,
         retention_anchor_at = $13, retention_calculated_at = $13,
         updated_at = NOW()
     WHERE learner_id = $1 AND skill_id = $2`,
    [
      input.learnerId, input.skillId, masteryAfter, confidenceAfter, evidenceStateAfter,
      input.observations.length, correct, incorrect, timeSpent, assessedSource(input.sourceType),
      retentionAfter, retentionStateAfter, calculatedAt,
    ],
  );

  // Global mastery is shared across courses, so one evidence update can change
  // candidate eligibility, prerequisite locks, ranking, or retention priority in
  // every active course path. Preserve the snapshots and mark them for an
  // explicit learner-visible regeneration in the same transaction.
  await client.query(
    `UPDATE personalized_paths
     SET status = 'STALE',
         invalidated_at = COALESCE(invalidated_at, NOW()),
         invalidation_reason = 'PERFORMANCE_EVIDENCE_CHANGED',
         invalidated_by_skill_id = $2,
         updated_at = NOW()
     WHERE learner_id = $1 AND status = 'ACTIVE'`,
    [input.learnerId, input.skillId],
  );

  return {
    confidenceAfter,
    confidenceBefore,
    correctAttempts: Number(state.correct_attempts) + correct,
    evidenceCount: summary.evidenceCount,
    evidenceStateAfter,
    evidenceStateBefore,
    incorrectAttempts: Number(state.incorrect_attempts) + incorrect,
    masteryAfter,
    masteryBefore,
    retentionAfter,
    retentionBefore: retentionBeforeProjection.retention,
    retentionStateAfter,
    retentionStateBefore: retentionBeforeProjection.state,
    skillId: input.skillId,
    totalAttempts: Number(state.attempt_count) + input.observations.length,
  };
}
