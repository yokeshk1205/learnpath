import type { Pool } from "pg";

import type { GovernanceOverview, GovernanceServiceContract, SampleState } from "./types.js";

type Row = Record<string, unknown>;
const minimumResponses = 30;
const minimumCourseResponses = 10;
const minimumCalibrationOutcomes = 30;
const minimumDriftPredictions = 50;
const requiredRetrainingOutcomes = 100;
const attributionWindowDays = 30;

const number = (value: unknown): number => Number(value);
const nullable = (value: unknown): number | null => value === null || value === undefined ? null : Number(value);
const round = (value: number): number => Math.round(value * 10_000) / 10_000;
const rate = (numerator: number, denominator: number): number | null => denominator ? round(numerator / denominator) : null;
const state = (count: number, minimum: number): SampleState => count >= minimum ? "REPORTABLE" : "INSUFFICIENT_DATA";

export function createGovernanceService(pool: Pool): GovernanceServiceContract {
  return {
    async getOverview(): Promise<GovernanceOverview> {
      const [volumeResult, distributionResult, courseResult, calibrationResult, driftResult, coverageResult, modelResult] = await Promise.all([
        pool.query<Row>(
          `WITH shown AS (
             SELECT path.id
             FROM personalized_paths path
             JOIN personalized_path_items item ON item.path_id = path.id AND item.lane = 'RECOMMENDED_NEXT'
           ), outcomes AS (
             SELECT feedback.id, feedback.decision, feedback.baseline_mastery,
                    EXISTS (
                      SELECT 1 FROM learner_activity_events event
                      WHERE event.learner_id = feedback.learner_id
                        AND event.skill_id = feedback.skill_id
                        AND event.event_type = 'RESOURCE_COMPLETED'
                        AND event.occurred_at >= feedback.decided_at
                        AND (event.metadata->>'recommendationFeedbackId' = feedback.id::text
                          OR (event.metadata->>'pathId' = feedback.path_id::text
                            AND event.metadata->>'pathVersion' = feedback.path_version::text))
                    ) AS completed,
                    assessed.mastery_after,
                    CASE WHEN assessed.mastery_after IS NOT NULL AND feedback.baseline_mastery IS NOT NULL
                      THEN assessed.mastery_after - feedback.baseline_mastery END AS gain
             FROM recommendation_feedback feedback
             LEFT JOIN LATERAL (
               SELECT evidence.mastery_after
               FROM skill_evidence evidence
               WHERE evidence.learner_id = feedback.learner_id
                 AND evidence.skill_id = feedback.skill_id
                 AND evidence.source_type <> 'PRACTICE'
                 AND evidence.created_at > feedback.decided_at
                 AND evidence.created_at <= feedback.decided_at + ($1::text || ' days')::interval
               ORDER BY evidence.created_at DESC, evidence.id DESC LIMIT 1
             ) assessed ON TRUE
           )
           SELECT
             (SELECT COUNT(*)::int FROM personalized_path_items WHERE benefit_probability IS NOT NULL) AS predictions,
             (SELECT COUNT(*)::int FROM shown) AS recommendations,
             COUNT(*)::int AS responses,
             COUNT(*) FILTER (WHERE decision = 'ACCEPTED')::int AS accepted,
             COUNT(*) FILTER (WHERE decision = 'REJECTED')::int AS rejected,
             COUNT(*) FILTER (WHERE decision = 'ACCEPTED' AND completed)::int AS completed,
             COUNT(*) FILTER (WHERE decision = 'ACCEPTED' AND mastery_after IS NOT NULL)::int AS assessed_outcomes,
             AVG(gain) FILTER (WHERE decision = 'ACCEPTED' AND gain IS NOT NULL) AS observed_mean_gain
           FROM outcomes`,
          [attributionWindowDays],
        ),
        pool.query<Row>(
          `SELECT COUNT(*)::int AS count, MIN(benefit_probability) AS minimum,
                  MAX(benefit_probability) AS maximum, AVG(benefit_probability) AS mean,
                  PERCENTILE_CONT(0.1) WITHIN GROUP (ORDER BY benefit_probability) AS p10,
                  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY benefit_probability) AS median,
                  PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY benefit_probability) AS p90
           FROM personalized_path_items WHERE benefit_probability IS NOT NULL`,
        ),
        pool.query<Row>(
          `WITH recommendations AS (
             SELECT path.course_id, COUNT(*)::int AS recommendations
             FROM personalized_paths path
             JOIN personalized_path_items item ON item.path_id = path.id AND item.lane = 'RECOMMENDED_NEXT'
             GROUP BY path.course_id
           ), outcomes AS (
             SELECT feedback.course_id, feedback.decision, feedback.baseline_mastery,
                    assessed.mastery_after,
                    CASE WHEN assessed.mastery_after IS NOT NULL AND feedback.baseline_mastery IS NOT NULL
                      THEN assessed.mastery_after - feedback.baseline_mastery END AS gain
             FROM recommendation_feedback feedback
             LEFT JOIN LATERAL (
               SELECT evidence.mastery_after
               FROM skill_evidence evidence
               WHERE evidence.learner_id = feedback.learner_id
                 AND evidence.skill_id = feedback.skill_id
                 AND evidence.source_type <> 'PRACTICE'
                 AND evidence.created_at > feedback.decided_at
                 AND evidence.created_at <= feedback.decided_at + ($1::text || ' days')::interval
               ORDER BY evidence.created_at DESC, evidence.id DESC LIMIT 1
             ) assessed ON TRUE
           )
           SELECT course.id AS course_id, course.name AS course_name,
                  COALESCE(recommendations.recommendations, 0)::int AS recommendations,
                  COUNT(outcomes.*)::int AS responses,
                  COUNT(outcomes.*) FILTER (WHERE outcomes.decision = 'ACCEPTED')::int AS accepted,
                  COUNT(outcomes.*) FILTER (WHERE outcomes.mastery_after IS NOT NULL)::int AS assessed_outcomes,
                  AVG(outcomes.gain) FILTER (WHERE outcomes.gain IS NOT NULL) AS mean_gain
           FROM courses course
           LEFT JOIN recommendations ON recommendations.course_id = course.id
           LEFT JOIN outcomes ON outcomes.course_id = course.id
           WHERE course.is_active
           GROUP BY course.id, recommendations.recommendations
           ORDER BY course.name`,
          [attributionWindowDays],
        ),
        pool.query<Row>(
          `SELECT item.benefit_probability AS prediction,
                  CASE WHEN assessed.mastery_after IS NOT NULL AND feedback.baseline_mastery IS NOT NULL
                    THEN assessed.mastery_after - feedback.baseline_mastery END AS gain
           FROM recommendation_feedback feedback
           JOIN personalized_path_items item
             ON item.path_id = feedback.path_id AND item.skill_id = feedback.skill_id
           LEFT JOIN LATERAL (
             SELECT evidence.mastery_after
             FROM skill_evidence evidence
             WHERE evidence.learner_id = feedback.learner_id
               AND evidence.skill_id = feedback.skill_id
               AND evidence.source_type <> 'PRACTICE'
               AND evidence.created_at > feedback.decided_at
               AND evidence.created_at <= feedback.decided_at + ($1::text || ' days')::interval
             ORDER BY evidence.created_at DESC, evidence.id DESC LIMIT 1
           ) assessed ON TRUE
           WHERE feedback.decision = 'ACCEPTED' AND assessed.mastery_after IS NOT NULL`,
          [attributionWindowDays],
        ),
        pool.query<Row>(
          `SELECT
             COUNT(*) FILTER (WHERE path.generated_at >= NOW() - INTERVAL '30 days')::int AS recent_count,
             AVG(item.benefit_probability) FILTER (WHERE path.generated_at >= NOW() - INTERVAL '30 days') AS recent_mean,
             COUNT(*) FILTER (WHERE path.generated_at < NOW() - INTERVAL '30 days'
                               AND path.generated_at >= NOW() - INTERVAL '60 days')::int AS baseline_count,
             AVG(item.benefit_probability) FILTER (WHERE path.generated_at < NOW() - INTERVAL '30 days'
                                                    AND path.generated_at >= NOW() - INTERVAL '60 days') AS baseline_mean
           FROM personalized_path_items item
           JOIN personalized_paths path ON path.id = item.path_id
           WHERE item.benefit_probability IS NOT NULL`,
        ),
        pool.query<Row>(
          `WITH question_coverage AS (
             SELECT skill_id,
                    BOOL_OR(question_purpose = 'DIAGNOSTIC') AS diagnostic,
                    BOOL_OR(question_purpose = 'PRACTICE') AS practice,
                    BOOL_OR(question_purpose = 'ASSESSMENT') AS assessment
             FROM questions WHERE status = 'ACTIVE' GROUP BY skill_id
           ), resource_coverage AS (
             SELECT mapping.skill_id, BOOL_OR(resource.is_active) AS lesson
             FROM learning_resource_skills mapping
             JOIN learning_resources resource ON resource.id = mapping.resource_id
             WHERE mapping.is_primary GROUP BY mapping.skill_id
           )
           SELECT COUNT(*)::int AS total,
                  COUNT(*) FILTER (WHERE q.diagnostic AND q.practice AND q.assessment AND r.lesson)::int AS actionable
           FROM skills skill
           LEFT JOIN question_coverage q ON q.skill_id = skill.id
           LEFT JOIN resource_coverage r ON r.skill_id = skill.id
           WHERE skill.is_active`,
        ),
        pool.query<Row>(
          `SELECT model_version, feature_version, inference_version
           FROM personalized_paths ORDER BY generated_at DESC LIMIT 1`,
        ),
      ]);

      const volumeRow = volumeResult.rows[0]!;
      const distribution = distributionResult.rows[0]!;
      const drift = driftResult.rows[0]!;
      const coverage = coverageResult.rows[0]!;
      const responses = number(volumeRow.responses);
      const accepted = number(volumeRow.accepted);
      const rejected = number(volumeRow.rejected);
      const completed = number(volumeRow.completed);
      const assessedOutcomes = number(volumeRow.assessed_outcomes);
      const reportState = state(responses, minimumResponses);
      const calibrationRows = calibrationResult.rows.map((row) => ({ gain: nullable(row.gain), prediction: number(row.prediction) }));
      const calibrationState = state(calibrationRows.length, minimumCalibrationOutcomes);
      const bins = calibrationState === "REPORTABLE"
        ? [0, .2, .4, .6, .8].map((lower) => {
          const records = calibrationRows.filter((row) => row.prediction >= lower && row.prediction < lower + .2);
          return records.length ? {
            beneficialOutcomeRate: rate(records.filter((row) => (row.gain ?? 0) >= .03).length, records.length)!,
            count: records.length,
            meanPrediction: round(records.reduce((total, row) => total + row.prediction, 0) / records.length),
          } : null;
        }).filter((item): item is NonNullable<typeof item> => item !== null)
        : [];
      const recentCount = number(drift.recent_count);
      const baselineCount = number(drift.baseline_count);
      const recentMean = nullable(drift.recent_mean);
      const baselineMean = nullable(drift.baseline_mean);
      const driftState = recentCount >= minimumDriftPredictions && baselineCount >= minimumDriftPredictions ? "REPORTABLE" : "INSUFFICIENT_DATA";
      const contentCoveragePass = number(coverage.total) > 0 && number(coverage.total) === number(coverage.actionable);
      const dataQualityPass = assessedOutcomes === 0 || volumeRow.observed_mean_gain !== undefined;
      const retrainingReasons = [
        assessedOutcomes < requiredRetrainingOutcomes ? `${requiredRetrainingOutcomes - assessedOutcomes} more assessed recommendation outcomes are required.` : null,
        !contentCoveragePass ? "Recommendable skill content coverage is incomplete." : null,
        !dataQualityPass ? "Outcome data-quality checks have not passed." : null,
        "A candidate model still requires offline comparison and human approval before promotion.",
      ].filter((reason): reason is string => Boolean(reason));

      return {
        calibration: {
          bins,
          message: calibrationState === "REPORTABLE"
            ? "Predicted benefit is compared with later beneficial assessed outcomes in sample-gated bins."
            : `Calibration is withheld until at least ${minimumCalibrationOutcomes} assessed outcomes are available.`,
          minimumOutcomes: minimumCalibrationOutcomes,
          observedOutcomes: calibrationRows.length,
          state: calibrationState,
        },
        coursePerformance: courseResult.rows.map((row) => {
          const courseResponses = number(row.responses);
          const courseState = state(courseResponses, minimumCourseResponses);
          return {
            acceptanceRate: courseState === "REPORTABLE" ? rate(number(row.accepted), courseResponses) : null,
            assessedOutcomes: number(row.assessed_outcomes),
            courseId: String(row.course_id),
            courseName: String(row.course_name),
            meanObservedGain: courseState === "REPORTABLE" ? nullable(row.mean_gain) : null,
            recommendations: number(row.recommendations),
            responses: courseResponses,
            state: courseState,
          };
        }),
        currentModel: modelResult.rows[0] ? {
          featureVersion: String(modelResult.rows[0].feature_version),
          inferenceVersion: String(modelResult.rows[0].inference_version),
          modelVersion: String(modelResult.rows[0].model_version),
        } : null,
        drift: {
          baselineMeanPrediction: baselineMean,
          baselinePredictions: baselineCount,
          message: driftState === "REPORTABLE"
            ? "Recent and 30–60 day prediction distributions have enough volume for descriptive comparison."
            : `Drift is withheld until both windows contain at least ${minimumDriftPredictions} predictions.`,
          recentMeanPrediction: recentMean,
          recentPredictions: recentCount,
          relativeMeanShift: driftState === "REPORTABLE" && recentMean !== null && baselineMean
            ? round((recentMean - baselineMean) / baselineMean) : null,
          state: driftState,
        },
        generatedAt: new Date().toISOString(),
        predictionDistribution: {
          count: number(distribution.count), maximum: nullable(distribution.maximum), mean: nullable(distribution.mean),
          median: nullable(distribution.median), minimum: nullable(distribution.minimum),
          p10: nullable(distribution.p10), p90: nullable(distribution.p90),
        },
        promotion: {
          automaticPromotion: false,
          stages: ["Current production model", "Candidate retrained model", "Offline evaluation", "Side-by-side comparison", "Human approval", "Promote with version history"],
        },
        rates: {
          acceptanceRate: reportState === "REPORTABLE" ? rate(accepted, responses) : null,
          assessmentFollowThrough: reportState === "REPORTABLE" ? rate(assessedOutcomes, accepted) : null,
          completionRate: reportState === "REPORTABLE" ? rate(completed, accepted) : null,
          minimumResponses,
          rejectionRate: reportState === "REPORTABLE" ? rate(rejected, responses) : null,
          state: reportState,
        },
        retraining: {
          contentCoveragePass, dataQualityPass, eligible: false,
          observedAssessedOutcomes: assessedOutcomes, reasons: retrainingReasons,
          requiredAssessedOutcomes: requiredRetrainingOutcomes,
        },
        volume: {
          accepted, assessedOutcomes, completed,
          observedMeanGain: nullable(volumeRow.observed_mean_gain),
          predictions: number(volumeRow.predictions), recommendations: number(volumeRow.recommendations),
          rejected, responses,
        },
      };
    },
  };
}
