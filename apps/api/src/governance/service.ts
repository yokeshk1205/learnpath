import type { Pool } from "pg";

import { describeDiagnosticItemCalibration } from "../diagnostics/calibration.js";
import { diagnosticSelectionPolicyVersion } from "../diagnostics/selection.js";
import type { GovernanceOverview, GovernanceServiceContract, SampleState } from "./types.js";

type Row = Record<string, unknown>;
const minimumResponses = 30;
const minimumCourseResponses = 10;
const minimumCalibrationOutcomes = 30;
const minimumDriftPredictions = 50;
const requiredRetrainingOutcomes = 100;
const attributionWindowDays = 30;
const minimumDiagnosticItemResponses = 20;

const number = (value: unknown): number => Number(value);
const nullable = (value: unknown): number | null => value === null || value === undefined ? null : Number(value);
const round = (value: number): number => Math.round(value * 10_000) / 10_000;
const rate = (numerator: number, denominator: number): number | null => denominator ? round(numerator / denominator) : null;
const state = (count: number, minimum: number): SampleState => count >= minimum ? "REPORTABLE" : "INSUFFICIENT_DATA";

export function createGovernanceService(pool: Pool): GovernanceServiceContract {
  return {
    async getOverview(): Promise<GovernanceOverview> {
      const [
        volumeResult, distributionResult, courseResult, calibrationResult, driftResult,
        coverageResult, modelResult, diagnosticItemsResult, diagnosticSessionsResult,
        diagnosticStopsResult, diagnosticEvidenceResult, diagnosticSelfReportsResult,
      ] = await Promise.all([
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
        pool.query<Row>(
          `WITH submitted_answers AS (
             SELECT answer.question_id, answer.is_correct, answer.is_unsure,
                    answer.response_seconds, answer.mastery_before, answer.mastery_after,
                    answer.confidence_before, answer.confidence_after,
                    SUM(CASE WHEN answer.is_correct THEN 1 ELSE 0 END)
                      OVER (PARTITION BY answer.attempt_id) AS attempt_correct,
                    COUNT(*) OVER (PARTITION BY answer.attempt_id) AS attempt_questions
             FROM assessment_answers answer
             JOIN assessment_attempts attempt ON attempt.id = answer.attempt_id
             WHERE attempt.status = 'SUBMITTED'
           )
           SELECT question.id, question.slug, skill.name AS skill_name,
                  question.difficulty, question.discrimination, question.cognitive_level,
                  question.diagnostic_role, question.construct_code, question.content_version,
                  question.calibration_state, question.expected_response_seconds,
                  COUNT(answer.question_id)::int AS response_count,
                  AVG(CASE WHEN answer.is_correct THEN 1.0 ELSE 0.0 END) AS correct_rate,
                  AVG(CASE WHEN answer.is_unsure THEN 1.0 ELSE 0.0 END) AS unsure_rate,
                  AVG(answer.response_seconds) AS mean_response_seconds,
                  CORR(
                    CASE WHEN answer.is_correct THEN 1.0 ELSE 0.0 END,
                    CASE WHEN answer.attempt_questions > 1
                      THEN (answer.attempt_correct - CASE WHEN answer.is_correct THEN 1 ELSE 0 END)::double precision
                        / (answer.attempt_questions - 1)
                    END
                  ) AS empirical_discrimination,
                  AVG(answer.mastery_after - answer.mastery_before)
                    FILTER (WHERE answer.mastery_before IS NOT NULL AND answer.mastery_after IS NOT NULL)
                    AS mean_mastery_change,
                  AVG(answer.confidence_after - answer.confidence_before)
                    FILTER (WHERE answer.confidence_before IS NOT NULL AND answer.confidence_after IS NOT NULL)
                    AS mean_confidence_change
           FROM questions question
           JOIN skills skill ON skill.id = question.skill_id
           LEFT JOIN submitted_answers answer ON answer.question_id = question.id
           WHERE question.status = 'ACTIVE' AND question.question_purpose = 'DIAGNOSTIC'
           GROUP BY question.id, skill.name
           ORDER BY COUNT(answer.question_id) DESC, skill.name, question.slug`,
        ),
        pool.query<Row>(
          `WITH submitted AS (
             SELECT attempt.id, attempt.learner_id, attempt.question_count
             FROM assessment_attempts attempt
             JOIN assessments assessment ON assessment.id = attempt.assessment_id
             WHERE attempt.status = 'SUBMITTED' AND assessment.assessment_type = 'DIAGNOSTIC'
           )
           SELECT COUNT(*)::int AS submitted_attempts,
                  COUNT(DISTINCT learner_id)::int AS unique_learners,
                  COALESCE(SUM(question_count), 0)::int AS total_responses,
                  AVG(question_count) AS mean_questions,
                  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY question_count) AS median_questions,
                  PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY question_count) AS p90_questions
           FROM submitted`,
        ),
        pool.query<Row>(
          `SELECT COALESCE(attempt.diagnostic_stopping_reason, 'SUBMITTED_COMPLETE') AS reason,
                  COUNT(*)::int AS count
           FROM assessment_attempts attempt
           JOIN assessments assessment ON assessment.id = attempt.assessment_id
           WHERE attempt.status = 'SUBMITTED' AND assessment.assessment_type = 'DIAGNOSTIC'
           GROUP BY COALESCE(attempt.diagnostic_stopping_reason, 'SUBMITTED_COMPLETE')
           ORDER BY COUNT(*) DESC, reason`,
        ),
        pool.query<Row>(
          `SELECT result.diagnostic_classification AS classification,
                  COUNT(*)::int AS count,
                  COUNT(*) FILTER (
                    WHERE result.correct_count > 0 AND result.correct_count < result.question_count
                  )::int AS mixed_count,
                  COUNT(*) FILTER (
                    WHERE result.mastery_lower_bound IS NOT NULL AND result.mastery_upper_bound IS NOT NULL
                  )::int AS interval_count
           FROM assessment_skill_results result
           JOIN assessment_attempts attempt ON attempt.id = result.attempt_id
           WHERE attempt.status = 'SUBMITTED'
           GROUP BY result.diagnostic_classification`,
        ),
        pool.query<Row>(
          `SELECT (
             (SELECT COUNT(*) FROM learner_skill_self_reports)
             + (SELECT COUNT(*) FROM learner_module_self_reports)
           )::int AS claim_count`,
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
      const diagnosticItems = diagnosticItemsResult.rows.map((row) => {
        const responseCount = number(row.response_count);
        const correctRate = nullable(row.correct_rate);
        const unsureRate = nullable(row.unsure_rate);
        const expectedResponseSeconds = nullable(row.expected_response_seconds);
        const meanResponseSeconds = nullable(row.mean_response_seconds);
        const item = describeDiagnosticItemCalibration({
          configuredDifficulty: number(row.difficulty),
          correctRate,
          empiricalDiscrimination: nullable(row.empirical_discrimination),
          expectedResponseSeconds,
          meanResponseSeconds,
          responseCount,
          unsureRate,
        }, minimumDiagnosticItemResponses);
        return {
          ...item,
          authorCalibrationState: String(row.calibration_state) as "CALIBRATED" | "EXPERT_PRIOR" | "FIELD_TEST",
          authorDiscrimination: number(row.discrimination),
          cognitiveLevel: String(row.cognitive_level) as "ANALYZE" | "APPLY" | "REMEMBER" | "UNDERSTAND",
          configuredDifficulty: number(row.difficulty),
          constructCode: String(row.construct_code),
          contentVersion: number(row.content_version),
          correctRate,
          diagnosticRole: String(row.diagnostic_role) as "ANCHOR" | "CHALLENGE" | "VERIFICATION",
          expectedResponseSeconds,
          id: String(row.id),
          meanConfidenceChange: nullable(row.mean_confidence_change),
          meanMasteryChange: nullable(row.mean_mastery_change),
          meanResponseSeconds,
          responseCount,
          skillName: String(row.skill_name),
          slug: String(row.slug),
          unsureRate,
        };
      });
      const reportableDiagnosticItems = diagnosticItems.filter((item) => item.sampleState === "REPORTABLE");
      const empiricalDiscriminations = reportableDiagnosticItems
        .map((item) => item.empiricalDiscrimination)
        .filter((value): value is number => value !== null);
      const calibrationErrors = reportableDiagnosticItems
        .map((item) => item.absoluteCalibrationError)
        .filter((value): value is number => value !== null);
      const diagnosticSession = diagnosticSessionsResult.rows[0] ?? {};
      const classificationCounts = Object.fromEntries(diagnosticEvidenceResult.rows.map((row) => [
        String(row.classification), number(row.count),
      ]));
      const diagnosticSkillDecisions = diagnosticEvidenceResult.rows.reduce((total, row) => total + number(row.count), 0);
      const mixedEvidenceSkills = diagnosticEvidenceResult.rows.reduce((total, row) => total + number(row.mixed_count), 0);
      const confidenceIntervalsRecorded = diagnosticEvidenceResult.rows.reduce((total, row) => total + number(row.interval_count), 0);

      return {
        diagnosticQuality: {
          cohort: {
            meanQuestions: nullable(diagnosticSession.mean_questions),
            medianQuestions: nullable(diagnosticSession.median_questions),
            p90Questions: nullable(diagnosticSession.p90_questions),
            selfReportClaims: number(diagnosticSelfReportsResult.rows[0]?.claim_count ?? 0),
            submittedAttempts: number(diagnosticSession.submitted_attempts ?? 0),
            totalResponses: number(diagnosticSession.total_responses ?? 0),
            uniqueLearners: number(diagnosticSession.unique_learners ?? 0),
          },
          evidence: {
            classificationCounts,
            confidenceIntervalsRecorded,
            mixedEvidenceSkills,
            skillDecisions: diagnosticSkillDecisions,
          },
          items: diagnosticItems,
          minimumResponsesPerItem: minimumDiagnosticItemResponses,
          policyVersion: diagnosticSelectionPolicyVersion,
          stopReasons: diagnosticStopsResult.rows.map((row) => ({
            count: number(row.count), reason: String(row.reason),
          })),
          studyReadiness: [
            {
              detail: "Self-portrait claims, adaptive selection, multiple observations, contradictions, uncertainty intervals, and decision-specific stopping are persisted and test-covered.",
              key: "adaptive-engine", label: "Evidence-bounded diagnostic engine", status: "IMPLEMENTED",
            },
            {
              detail: `Item difficulty, response time, uncertainty, discrimination, and author-prior error are collected. Empirical conclusions require ${minimumDiagnosticItemResponses} responses per item.`,
              key: "item-calibration", label: "Empirical item calibration", status: reportableDiagnosticItems.length
                ? "IMPLEMENTED" : "COLLECTING_DATA",
            },
            {
              detail: "Reference-test accuracy and delayed retention validity require consented learners and an independent outcome measure; the application does not manufacture these results.",
              key: "external-validity", label: "External diagnostic validity", status: "REQUIRES_STUDY",
            },
            {
              detail: "No sensitive demographic attributes are collected. Subgroup fairness reporting requires an approved study design, consent, and minimum cohort sizes.",
              key: "fairness", label: "Subgroup fairness audit", status: "REQUIRES_STUDY",
            },
          ],
          summary: {
            activeItems: diagnosticItems.length,
            flaggedReportableItems: reportableDiagnosticItems.filter((item) => item.warnings.length > 0).length,
            meanAbsoluteCalibrationError: calibrationErrors.length
              ? round(calibrationErrors.reduce((total, value) => total + value, 0) / calibrationErrors.length) : null,
            meanEmpiricalDiscrimination: empiricalDiscriminations.length
              ? round(empiricalDiscriminations.reduce((total, value) => total + value, 0) / empiricalDiscriminations.length) : null,
            observedItems: diagnosticItems.filter((item) => item.responseCount > 0).length,
            reportableItems: reportableDiagnosticItems.length,
          },
        },
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
