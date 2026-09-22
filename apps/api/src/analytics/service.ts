import type { Pool } from "pg";

import { refreshLearnerRetention } from "../retention/service.js";
import type { AnalyticsServiceContract, LearnerAnalyticsOverview } from "./types.js";

type Row = Record<string, unknown>;

const numeric = (value: unknown): number => Number(value);
const nullableNumeric = (value: unknown): number | null => value === null || value === undefined ? null : Number(value);

export function createAnalyticsService(pool: Pool): AnalyticsServiceContract {
  return {
    async getOverview(learnerId): Promise<LearnerAnalyticsOverview> {
      await refreshLearnerRetention(pool, learnerId);
      const [summaryResult, evidenceResult, timelineResult] = await Promise.all([
        pool.query<Row>(
          `WITH learner_skills AS (
             SELECT mastery, retention, retention_state, evidence_state,
                    (mastery >= 0.65 AND retention_state IN ('AT_RISK', 'CRITICAL')) AS revision_due
             FROM learner_skill_mastery
             WHERE learner_id = $1
           )
           SELECT
             (SELECT COUNT(*)::int FROM course_enrollments
              WHERE learner_id = $1 AND status <> 'DROPPED') AS enrolled_courses,
             (SELECT COUNT(*)::int FROM personalized_paths
              WHERE learner_id = $1 AND status IN ('ACTIVE', 'STALE')) AS active_paths,
             (SELECT COUNT(*)::int FROM skill_evidence WHERE learner_id = $1) AS evidence_count,
             (SELECT COUNT(*)::int FROM learner_activity_events
              WHERE learner_id = $1 AND event_type = 'RESOURCE_COMPLETED') AS lessons_completed,
             COUNT(*)::int AS tracked_skills,
             COUNT(*) FILTER (WHERE evidence_state <> 'UNKNOWN')::int AS assessed_skills,
             COUNT(*) FILTER (WHERE revision_due)::int AS revision_due_skills,
             AVG(mastery) AS average_mastery,
             AVG(retention) AS average_retention,
             COUNT(*) FILTER (WHERE mastery >= 0.8)::int AS mastery_strong,
             COUNT(*) FILTER (WHERE mastery >= 0.5 AND mastery < 0.8)::int AS mastery_developing,
             COUNT(*) FILTER (WHERE mastery < 0.5)::int AS mastery_needs_work,
             COUNT(*) FILTER (WHERE mastery IS NULL)::int AS mastery_unknown,
             COUNT(*) FILTER (WHERE retention_state = 'STRONG')::int AS retention_healthy,
             COUNT(*) FILTER (WHERE retention_state = 'MODERATE')::int AS retention_review_soon,
             COUNT(*) FILTER (WHERE retention_state IN ('AT_RISK', 'CRITICAL'))::int AS retention_at_risk,
             COUNT(*) FILTER (WHERE retention_state = 'UNKNOWN')::int AS retention_unknown
           FROM learner_skills`,
          [learnerId],
        ),
        pool.query<Row>(
          `SELECT source_type, COUNT(*)::int AS evidence_count,
                  COUNT(DISTINCT skill_id)::int AS skill_count
           FROM skill_evidence
           WHERE learner_id = $1
           GROUP BY source_type
           ORDER BY evidence_count DESC, source_type`,
          [learnerId],
        ),
        pool.query<Row>(
          `WITH ordered AS (
             SELECT evidence.*, skill.name AS skill_name,
                    ROW_NUMBER() OVER (ORDER BY evidence.created_at, evidence.id) AS sequence
             FROM skill_evidence evidence
             JOIN skills skill ON skill.id = evidence.skill_id
             WHERE evidence.learner_id = $1
           ), points AS (
             SELECT current.sequence, current.skill_id, current.skill_name,
                    current.source_type, current.mastery_before, current.mastery_after,
                    current.confidence_after, current.created_at,
                    (
                      SELECT AVG(latest.mastery_after)
                      FROM (
                        SELECT DISTINCT ON (prior.skill_id) prior.mastery_after
                        FROM ordered prior
                        WHERE prior.sequence <= current.sequence
                        ORDER BY prior.skill_id, prior.sequence DESC
                      ) latest
                    ) AS portfolio_average
             FROM ordered current
           )
           SELECT * FROM points
           ORDER BY sequence DESC
           LIMIT 24`,
          [learnerId],
        ),
      ]);

      const row = summaryResult.rows[0]!;
      const trackedSkills = numeric(row.tracked_skills);
      const assessedSkills = numeric(row.assessed_skills);
      return {
        distributions: {
          mastery: {
            developing: numeric(row.mastery_developing),
            needsWork: numeric(row.mastery_needs_work),
            strong: numeric(row.mastery_strong),
            unknown: numeric(row.mastery_unknown),
          },
          retention: {
            atRisk: numeric(row.retention_at_risk),
            healthy: numeric(row.retention_healthy),
            reviewSoon: numeric(row.retention_review_soon),
            unknown: numeric(row.retention_unknown),
          },
        },
        evidenceCoverage: evidenceResult.rows.map((item) => ({
          evidenceCount: numeric(item.evidence_count),
          skillCount: numeric(item.skill_count),
          sourceType: String(item.source_type),
        })),
        generatedAt: new Date().toISOString(),
        methodology: {
          averageMastery: "Mean across assessed skills only; unknown mastery is excluded rather than treated as zero.",
          disclaimer: "These are descriptive educational analytics for this learner, not causal claims about recommendation effectiveness.",
          retention: "Current recall estimates are grouped from the persisted retention state after evidence-based decay refreshes.",
        },
        summary: {
          activePaths: numeric(row.active_paths),
          assessedSkills,
          averageMastery: nullableNumeric(row.average_mastery),
          averageRetention: nullableNumeric(row.average_retention),
          enrolledCourses: numeric(row.enrolled_courses),
          evidenceCoveragePercent: trackedSkills ? Math.round((assessedSkills / trackedSkills) * 10_000) / 100 : 0,
          evidenceCount: numeric(row.evidence_count),
          lessonsCompleted: numeric(row.lessons_completed),
          revisionDueSkills: numeric(row.revision_due_skills),
          trackedSkills,
        },
        timeline: timelineResult.rows.reverse().map((item) => ({
          confidenceAfter: numeric(item.confidence_after),
          createdAt: new Date(String(item.created_at)).toISOString(),
          masteryAfter: numeric(item.mastery_after),
          masteryBefore: nullableNumeric(item.mastery_before),
          portfolioAverage: numeric(item.portfolio_average),
          skillId: String(item.skill_id),
          skillName: String(item.skill_name),
          sourceType: String(item.source_type),
        })),
      };
    },
  };
}
