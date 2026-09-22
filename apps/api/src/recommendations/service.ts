import { randomUUID } from "node:crypto";

import type { Pool, PoolClient } from "pg";

import { AppError } from "../errors.js";
import { classifyRecommendationOutcome, recommendationEvaluationPolicy } from "./policy.js";
import type {
  RecommendationEvaluationOverview,
  RecommendationEvaluationRecord,
  RecommendationFeedback,
  RecommendationReason,
  RecommendationServiceContract,
} from "./types.js";

type DatabaseClient = Pool | PoolClient;
type DatabaseRow = Record<string, unknown>;

const { attributionWindowDays, positiveGainThreshold } = recommendationEvaluationPolicy;

function numeric(value: unknown): number {
  return Number(value ?? 0);
}

function nullableNumeric(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function iso(value: unknown): string {
  return new Date(String(value)).toISOString();
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function rate(numerator: number, denominator: number): number | null {
  return denominator ? round(numerator / denominator) : null;
}

function mapFeedback(row: DatabaseRow): RecommendationFeedback {
  return {
    baseline: {
      confidence: nullableNumeric(row.baseline_confidence),
      mastery: nullableNumeric(row.baseline_mastery),
      retention: nullableNumeric(row.baseline_retention),
    },
    comment: row.comment ? String(row.comment) : null,
    courseId: String(row.course_id),
    courseName: String(row.course_name),
    decidedAt: iso(row.decided_at),
    decision: String(row.decision) as RecommendationFeedback["decision"],
    enrollmentId: String(row.enrollment_id),
    feedbackVersion: numeric(row.feedback_version),
    id: String(row.id),
    pathId: String(row.path_id),
    pathVersion: numeric(row.path_version),
    provenance: {
      featureVersion: String(row.feature_version),
      inferenceVersion: String(row.inference_version),
      modelVersion: String(row.model_version),
      policyVersion: String(row.policy_version),
    },
    reasonCode: row.reason_code ? String(row.reason_code) as RecommendationReason : null,
    resourceId: row.resource_id ? String(row.resource_id) : null,
    skillId: String(row.skill_id),
    skillName: String(row.skill_name),
  };
}

async function loadFeedback(
  client: DatabaseClient,
  learnerId: string,
  pathId: string,
): Promise<RecommendationFeedback | null> {
  const result = await client.query(
    `SELECT feedback.*, course.name AS course_name, skill.name AS skill_name
     FROM recommendation_feedback feedback
     JOIN courses course ON course.id = feedback.course_id
     JOIN skills skill ON skill.id = feedback.skill_id
     WHERE feedback.learner_id = $1 AND feedback.path_id = $2`,
    [learnerId, pathId],
  );
  return result.rows[0] ? mapFeedback(result.rows[0] as DatabaseRow) : null;
}

function sameResponse(
  row: DatabaseRow,
  input: { comment?: string; decision: string; reasonCode?: string; resourceId?: string },
): boolean {
  return String(row.decision) === input.decision
    && (row.reason_code ? String(row.reason_code) : null) === (input.reasonCode ?? null)
    && (row.resource_id ? String(row.resource_id) : null) === (input.resourceId ?? null)
    && (row.comment ? String(row.comment) : null) === (input.comment?.trim() || null);
}

export function createRecommendationService(pool: Pool): RecommendationServiceContract {
  return {
    async getFeedback(learnerId, pathId) {
      return loadFeedback(pool, learnerId, pathId);
    },

    async respond(learnerId, pathId, input) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const pathResult = await client.query(
          `SELECT path.id, path.enrollment_id, path.course_id, path.path_version,
                  path.status, path.model_version, path.feature_version,
                  path.inference_version, path.policy_version,
                  item.skill_id, item.mastery_snapshot, item.confidence_snapshot,
                  item.retention_snapshot
           FROM personalized_paths path
           JOIN personalized_path_items item
             ON item.path_id = path.id AND item.lane = 'RECOMMENDED_NEXT'
           WHERE path.id = $1 AND path.learner_id = $2
           FOR SHARE OF path`,
          [pathId, learnerId],
        );
        const path = pathResult.rows[0] as DatabaseRow | undefined;
        if (!path) {
          throw new AppError(404, "RECOMMENDATION_NOT_FOUND", "This path does not contain a recommendation for the learner.");
        }
        if (String(path.status) !== "ACTIVE") {
          throw new AppError(409, "RECOMMENDATION_NOT_CURRENT", "Update the stale path before responding to its recommendation.");
        }
        if (input.resourceId) {
          const resource = await client.query(
            `SELECT 1
             FROM learning_resources resource
             JOIN learning_resource_skills resource_skill
               ON resource_skill.resource_id = resource.id
              AND resource_skill.skill_id = $2 AND resource_skill.is_primary
             WHERE resource.id = $1 AND resource.is_active
             LIMIT 1`,
            [input.resourceId, path.skill_id],
          );
          if (!resource.rows[0]) {
            throw new AppError(400, "RECOMMENDATION_RESOURCE_MISMATCH", "The selected resource does not teach this recommendation in its course context.");
          }
        }

        const existingResult = await client.query(
          `SELECT * FROM recommendation_feedback
           WHERE path_id = $1 AND learner_id = $2
           FOR UPDATE`,
          [pathId, learnerId],
        );
        const existing = existingResult.rows[0] as DatabaseRow | undefined;
        if (existing && sameResponse(existing, input)) {
          const feedback = await loadFeedback(client, learnerId, pathId);
          await client.query("COMMIT");
          return { created: false, feedback: feedback! };
        }

        const feedbackId = existing ? String(existing.id) : randomUUID();
        if (existing) {
          await client.query(
            `UPDATE recommendation_feedback
             SET decision = $3, reason_code = $4, comment = $5, resource_id = $6,
                 feedback_version = feedback_version + 1, decided_at = NOW(), updated_at = NOW()
             WHERE path_id = $1 AND learner_id = $2`,
            [pathId, learnerId, input.decision, input.reasonCode ?? null,
              input.comment?.trim() || null, input.resourceId ?? null],
          );
        } else {
          await client.query(
            `INSERT INTO recommendation_feedback (
               id, path_id, learner_id, enrollment_id, course_id, skill_id, resource_id,
               path_version, decision, reason_code, comment,
               baseline_mastery, baseline_confidence, baseline_retention,
               model_version, feature_version, inference_version, policy_version
             ) VALUES (
               $1, $2, $3, $4, $5, $6, $7,
               $8, $9, $10, $11,
               $12, $13, $14,
               $15, $16, $17, $18
             )`,
            [
              feedbackId, pathId, learnerId, path.enrollment_id, path.course_id,
              path.skill_id, input.resourceId ?? null, path.path_version, input.decision,
              input.reasonCode ?? null, input.comment?.trim() || null,
              path.mastery_snapshot, path.confidence_snapshot, path.retention_snapshot,
              path.model_version, path.feature_version, path.inference_version, path.policy_version,
            ],
          );
        }
        await client.query(
          `INSERT INTO learner_activity_events (
             id, learner_id, course_id, skill_id, resource_id, event_type, result, metadata
           ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)`,
          [
            randomUUID(), learnerId, path.course_id, path.skill_id, input.resourceId ?? null,
            input.decision === "ACCEPTED" ? "RECOMMENDATION_ACCEPTED" : "RECOMMENDATION_REJECTED",
            JSON.stringify({ decision: input.decision, reasonCode: input.reasonCode ?? null }),
            JSON.stringify({
              feedbackId, pathId, pathVersion: numeric(path.path_version),
              feedbackVersion: numeric(existing?.feedback_version) + 1,
              modelVersion: String(path.model_version), source: "recommendation_response",
            }),
          ],
        );
        const feedback = await loadFeedback(client, learnerId, pathId);
        await client.query("COMMIT");
        return { created: !existing, feedback: feedback! };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async evaluate(learnerId) {
      const shownResult = await pool.query(
        `SELECT path.id, path.model_version
         FROM personalized_paths path
         JOIN personalized_path_items item
           ON item.path_id = path.id AND item.lane = 'RECOMMENDED_NEXT'
         WHERE path.learner_id = $1
         ORDER BY path.generated_at DESC`,
        [learnerId],
      );
      const result = await pool.query(
        `SELECT feedback.*, course.name AS course_name, skill.name AS skill_name,
                mastery.mastery AS current_mastery,
                evidence.evidence_count, evidence.latest_evidence_at, evidence.mastery_after,
                completion.completed_at, completion.completed_resource_id
         FROM recommendation_feedback feedback
         JOIN courses course ON course.id = feedback.course_id
         JOIN skills skill ON skill.id = feedback.skill_id
         LEFT JOIN learner_skill_mastery mastery
           ON mastery.learner_id = feedback.learner_id AND mastery.skill_id = feedback.skill_id
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int AS evidence_count,
                  MAX(observed.created_at) AS latest_evidence_at,
                  (ARRAY_AGG(observed.mastery_after ORDER BY observed.created_at DESC, observed.id DESC))[1] AS mastery_after
           FROM skill_evidence observed
            WHERE observed.learner_id = feedback.learner_id
              AND observed.skill_id = feedback.skill_id
              AND observed.source_type <> 'PRACTICE'
              AND observed.created_at > feedback.decided_at
             AND observed.created_at <= feedback.decided_at + ($2::text || ' days')::interval
         ) evidence ON TRUE
         LEFT JOIN LATERAL (
           SELECT event.occurred_at AS completed_at, event.resource_id AS completed_resource_id
           FROM learner_activity_events event
           WHERE event.learner_id = feedback.learner_id
             AND event.skill_id = feedback.skill_id
             AND event.event_type = 'RESOURCE_COMPLETED'
             AND event.occurred_at >= feedback.decided_at
             AND (
               event.metadata->>'recommendationFeedbackId' = feedback.id::text
               OR (
                 event.metadata->>'pathId' = feedback.path_id::text
                 AND event.metadata->>'pathVersion' = feedback.path_version::text
               )
             )
           ORDER BY event.occurred_at, event.id
           LIMIT 1
         ) completion ON TRUE
         WHERE feedback.learner_id = $1
         ORDER BY feedback.decided_at DESC, feedback.id DESC`,
        [learnerId, attributionWindowDays],
      );
      const records: RecommendationEvaluationRecord[] = (result.rows as DatabaseRow[]).map((row) => {
        const feedback = mapFeedback(row);
        const latestMastery = nullableNumeric(row.mastery_after);
        const evidenceAfterDecision = numeric(row.evidence_count);
        const learningGain = latestMastery === null || feedback.baseline.mastery === null
          ? null : round(latestMastery - feedback.baseline.mastery);
        const outcomeState = classifyRecommendationOutcome(feedback.decision, learningGain, evidenceAfterDecision);
        return {
          ...feedback,
          completion: row.completed_at ? {
            completedAt: iso(row.completed_at),
            resourceId: row.completed_resource_id ? String(row.completed_resource_id) : null,
          } : null,
          currentMastery: nullableNumeric(row.current_mastery),
          evidenceAfterDecision,
          latestEvidenceAt: row.latest_evidence_at ? iso(row.latest_evidence_at) : null,
          learningGain,
          outcomeState,
        };
      });
      const shown = shownResult.rowCount ?? 0;
      const responded = records.length;
      const acceptedRecords = records.filter((record) => record.decision === "ACCEPTED");
      const rejectedRecords = records.filter((record) => record.decision === "REJECTED");
      const completedRecords = acceptedRecords.filter((record) => record.completion);
      const evidenceRecords = acceptedRecords.filter((record) => record.evidenceAfterDecision > 0);
      const gainRecords = acceptedRecords.filter((record) => record.learningGain !== null);
      const positiveRecords = gainRecords.filter((record) => (record.learningGain ?? 0) >= positiveGainThreshold);
      const meanLearningGain = gainRecords.length
        ? round(gainRecords.reduce((total, record) => total + record.learningGain!, 0) / gainRecords.length)
        : null;

      const reasons = new Map<RecommendationReason, number>();
      for (const record of rejectedRecords) {
        if (record.reasonCode) reasons.set(record.reasonCode, (reasons.get(record.reasonCode) ?? 0) + 1);
      }
      const models = new Map<string, { records: RecommendationEvaluationRecord[]; shown: number }>();
      for (const row of shownResult.rows as DatabaseRow[]) {
        const modelVersion = String(row.model_version);
        const model = models.get(modelVersion) ?? { records: [], shown: 0 };
        model.shown += 1;
        models.set(modelVersion, model);
      }
      for (const record of records) {
        const model = models.get(record.provenance.modelVersion) ?? { records: [], shown: 0 };
        model.records.push(record);
        models.set(record.provenance.modelVersion, model);
      }
      return {
        generatedAt: new Date().toISOString(),
        methodology: {
          attributionWindowDays,
          disclaimer: "Observed post-recommendation outcomes describe association, not causal model impact. Practice is excluded from outcome gain; only later assessed evidence is attributed.",
          positiveGainThreshold,
        },
        modelVersions: [...models.entries()].map(([modelVersion, model]) => {
          const accepted = model.records.filter((record) => record.decision === "ACCEPTED");
          const gains = accepted.filter((record) => record.learningGain !== null);
          return {
            acceptanceRate: rate(accepted.length, model.records.length),
            accepted: accepted.length,
            completed: accepted.filter((record) => record.completion).length,
            meanLearningGain: gains.length
              ? round(gains.reduce((total, record) => total + record.learningGain!, 0) / gains.length)
              : null,
            modelVersion,
            responded: model.records.length,
            shown: model.shown,
          };
        }).sort((left, right) => right.shown - left.shown || left.modelVersion.localeCompare(right.modelVersion)),
        reasons: [...reasons.entries()].map(([reasonCode, count]) => ({ count, reasonCode }))
          .sort((left, right) => right.count - left.count || left.reasonCode.localeCompare(right.reasonCode)),
        records,
        summary: {
          acceptanceRate: rate(acceptedRecords.length, responded),
          accepted: acceptedRecords.length,
          completed: completedRecords.length,
          completionRate: rate(completedRecords.length, acceptedRecords.length),
          meanLearningGain,
          outcomeEvidence: evidenceRecords.length,
          positiveGainRate: rate(positiveRecords.length, gainRecords.length),
          rejected: rejectedRecords.length,
          responded,
          responseRate: rate(responded, shown),
          shown,
        },
      } satisfies RecommendationEvaluationOverview;
    },
  };
}
