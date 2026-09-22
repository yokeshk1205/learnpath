import type { Pool } from "pg";

import { config } from "../config.js";
import { retentionPolicy, type RetentionState } from "./policy.js";
import type {
  RetentionCourseContext,
  RetentionOverview,
  RetentionProjection,
  RetentionServiceContract,
} from "./types.js";

type DatabaseRow = Record<string, unknown>;

export interface CalculateRetentionInput {
  anchorAt: Date | null;
  asOf?: Date;
  baseLambda?: number;
  confidence: number | null;
  evidenceCount: number;
  mastery: number | null;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

export function classifyRetention(retention: number | null): RetentionState {
  if (retention === null) return "UNKNOWN";
  if (retention >= retentionPolicy.thresholds.strong) return "STRONG";
  if (retention >= retentionPolicy.thresholds.atRisk) return "MODERATE";
  if (retention >= retentionPolicy.thresholds.critical) return "AT_RISK";
  return "CRITICAL";
}

export function calculateRetention(input: CalculateRetentionInput): RetentionProjection {
  const asOf = input.asOf ?? new Date();
  if (input.mastery === null || input.anchorAt === null || input.evidenceCount === 0) {
    return {
      anchorAt: input.anchorAt?.toISOString() ?? null,
      calculatedAt: asOf.toISOString(),
      daysSinceEvidence: null,
      decayAmount: null,
      effectiveLambda: null,
      nextReviewAt: null,
      reasons: ["No performance evidence exists yet, so retention is unknown."],
      retention: null,
      revisionDue: false,
      state: "UNKNOWN",
    };
  }

  const confidence = clamp(input.confidence ?? 0);
  const baseLambda = input.baseLambda ?? retentionPolicy.baseLambda;
  const confidenceFactor = 1.15 - confidence * 0.5;
  const repetitionFactor = 1 / (1 + Math.min(Math.log1p(input.evidenceCount) * 0.12, 0.45));
  const effectiveLambda = baseLambda * confidenceFactor * repetitionFactor;
  const elapsedMilliseconds = Math.max(0, asOf.getTime() - input.anchorAt.getTime());
  const daysSinceEvidence = elapsedMilliseconds / 86_400_000;
  const retention = round(clamp(input.mastery * Math.exp(-effectiveLambda * daysSinceEvidence)));
  const state = classifyRetention(retention);
  const revisionDue = input.mastery >= retentionPolicy.revisionMasteryFloor
    && (state === "AT_RISK" || state === "CRITICAL");
  const reviewTarget = retentionPolicy.thresholds.atRisk;
  const daysToReview = input.mastery > reviewTarget
    ? Math.log(input.mastery / reviewTarget) / effectiveLambda
    : null;
  const nextReviewAt = daysToReview === null
    ? null
    : new Date(input.anchorAt.getTime() + daysToReview * 86_400_000).toISOString();
  const roundedDays = Math.round(daysSinceEvidence * 10) / 10;
  const reasons = [
    `Last validated by performance evidence ${roundedDays} day${roundedDays === 1 ? "" : "s"} ago.`,
    `${input.evidenceCount} observation${input.evidenceCount === 1 ? "" : "s"} and ${Math.round(confidence * 100)}% confidence adjust the decay rate.`,
  ];
  if (revisionDue) reasons.push("Previously demonstrated mastery has decayed below the revision threshold.");
  else if (state === "STRONG") reasons.push("Current retained knowledge remains above the strong threshold.");
  else if (state === "MODERATE") reasons.push("Retention is usable, but a future check is approaching.");
  else reasons.push("This is primarily a learning gap until sufficient mastery has first been demonstrated.");

  return {
    anchorAt: input.anchorAt.toISOString(),
    calculatedAt: asOf.toISOString(),
    daysSinceEvidence: round(daysSinceEvidence),
    decayAmount: round(Math.max(0, input.mastery - retention)),
    effectiveLambda: round(effectiveLambda),
    nextReviewAt,
    reasons,
    retention,
    revisionDue,
    state,
  };
}

function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function mean(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null);
  if (!present.length) return null;
  return round(present.reduce((total, value) => total + value, 0) / present.length);
}

function courseContexts(value: unknown): RetentionCourseContext[] {
  return Array.isArray(value) ? value as RetentionCourseContext[] : [];
}

function databaseDate(value: unknown): Date | null {
  if (!value) return null;
  return value instanceof Date ? value : new Date(String(value));
}

export async function refreshLearnerRetention(
  pool: Pool,
  learnerId: string,
  asOf = new Date(),
): Promise<Map<string, RetentionProjection>> {
  const result = await pool.query(
    `SELECT state.skill_id, state.mastery, state.confidence,
            COUNT(evidence.id)::int AS evidence_count,
            MAX(evidence.created_at) AS evidence_anchor_at
     FROM learner_skill_mastery state
     LEFT JOIN skill_evidence evidence
       ON evidence.learner_id = state.learner_id AND evidence.skill_id = state.skill_id
     WHERE state.learner_id = $1
     GROUP BY state.skill_id, state.mastery, state.confidence`,
    [learnerId],
  );
  const projections = new Map<string, RetentionProjection>();
  for (const row of result.rows as DatabaseRow[]) {
    const skillId = String(row.skill_id);
    const anchorAt = databaseDate(row.evidence_anchor_at);
    const projection = calculateRetention({
      anchorAt,
      asOf,
      baseLambda: config.retentionBaseLambda,
      confidence: nullableNumber(row.confidence),
      evidenceCount: Number(row.evidence_count),
      mastery: nullableNumber(row.mastery),
    });
    projections.set(skillId, projection);
    await pool.query(
      `UPDATE learner_skill_mastery
       SET retention = $3, retention_state = $4,
           retention_anchor_at = (
             SELECT MAX(current_evidence.created_at)
             FROM skill_evidence current_evidence
             WHERE current_evidence.learner_id = $1
               AND current_evidence.skill_id = $2
           ),
           retention_calculated_at = $6
       WHERE learner_id = $1 AND skill_id = $2
         AND (
           SELECT COUNT(*)::int
           FROM skill_evidence current_evidence
           WHERE current_evidence.learner_id = $1
             AND current_evidence.skill_id = $2
         ) = $5`,
      [
        learnerId, skillId, projection.retention, projection.state,
        Number(row.evidence_count), asOf,
      ],
    );
  }
  return projections;
}

export function createRetentionService(pool: Pool): RetentionServiceContract {
  return {
    async getOverview(learnerId): Promise<RetentionOverview> {
      const asOf = new Date();
      const projections = await refreshLearnerRetention(pool, learnerId, asOf);
      const result = await pool.query(
        `SELECT state.skill_id, state.mastery, state.confidence, state.evidence_state,
                skill.slug, skill.name, skill.category,
                COUNT(evidence.id)::int AS evidence_count,
                EXISTS (
                  SELECT 1 FROM questions question
                  WHERE question.skill_id = state.skill_id AND question.status = 'ACTIVE'
                ) AS practice_available,
                COALESCE((
                  SELECT jsonb_agg(jsonb_build_object(
                    'courseId', context.course_id,
                    'courseName', context.course_name,
                    'enrollmentId', context.enrollment_id
                  ) ORDER BY context.course_name)
                  FROM (
                    SELECT DISTINCT course.id AS course_id, course.name AS course_name,
                           enrollment.id AS enrollment_id
                    FROM course_enrollments enrollment
                    JOIN courses course ON course.id = enrollment.course_id
                    JOIN course_skills course_skill ON course_skill.course_id = course.id
                    WHERE enrollment.learner_id = state.learner_id
                      AND enrollment.status <> 'DROPPED'
                      AND course_skill.skill_id = state.skill_id
                  ) context
                ), '[]'::jsonb) AS course_contexts
         FROM learner_skill_mastery state
         JOIN skills skill ON skill.id = state.skill_id
         LEFT JOIN skill_evidence evidence
           ON evidence.learner_id = state.learner_id AND evidence.skill_id = state.skill_id
         WHERE state.learner_id = $1 AND skill.is_active
         GROUP BY state.skill_id, state.mastery, state.confidence, state.evidence_state,
                  state.learner_id, skill.slug, skill.name, skill.category
         ORDER BY skill.category, skill.name`,
        [learnerId],
      );
      const skills = (result.rows as DatabaseRow[]).map((row) => ({
        ...(projections.get(String(row.skill_id)) ?? calculateRetention({
          anchorAt: null, asOf, confidence: null, evidenceCount: 0, mastery: null,
        })),
        category: String(row.category),
        confidence: nullableNumber(row.confidence),
        courseContexts: courseContexts(row.course_contexts),
        evidenceCount: Number(row.evidence_count),
        evidenceState: String(row.evidence_state) as "UNKNOWN" | "ESTIMATED" | "ASSESSED" | "VERIFIED",
        id: String(row.skill_id),
        mastery: nullableNumber(row.mastery),
        name: String(row.name),
        practiceAvailable: Boolean(row.practice_available),
        slug: String(row.slug),
      })).sort((left, right) => (
        Number(right.revisionDue) - Number(left.revisionDue)
        || (left.retention ?? 2) - (right.retention ?? 2)
        || left.name.localeCompare(right.name)
      ));
      return {
        calculatedAt: asOf.toISOString(),
        skills,
        summary: {
          atRiskSkills: skills.filter((skill) => skill.state === "AT_RISK").length,
          averageRetention: mean(skills.map((skill) => skill.retention)),
          criticalSkills: skills.filter((skill) => skill.state === "CRITICAL").length,
          moderateSkills: skills.filter((skill) => skill.state === "MODERATE").length,
          revisionDueSkills: skills.filter((skill) => skill.revisionDue).length,
          strongSkills: skills.filter((skill) => skill.state === "STRONG").length,
          trackedSkills: skills.length,
          unknownSkills: skills.filter((skill) => skill.state === "UNKNOWN").length,
        },
      };
    },
  };
}
