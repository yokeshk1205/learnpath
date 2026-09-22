import { apiRequest } from "../auth/api";

export interface GovernanceOverview {
  diagnosticQuality: {
    cohort: { meanQuestions: number | null; medianQuestions: number | null; p90Questions: number | null; selfReportClaims: number; submittedAttempts: number; totalResponses: number; uniqueLearners: number };
    evidence: { classificationCounts: Record<string, number>; confidenceIntervalsRecorded: number; mixedEvidenceSkills: number; skillDecisions: number };
    items: Array<{
      absoluteCalibrationError: number | null; authorCalibrationState: "CALIBRATED" | "EXPERT_PRIOR" | "FIELD_TEST";
      authorDiscrimination: number; authorExpectedCorrectRate: number; cognitiveLevel: "ANALYZE" | "APPLY" | "REMEMBER" | "UNDERSTAND";
      configuredDifficulty: number; constructCode: string; contentVersion: number; correctRate: number | null;
      diagnosticRole: "ANCHOR" | "CHALLENGE" | "VERIFICATION"; difficultyEstimate: number | null;
      empiricalDiscrimination: number | null; expectedResponseSeconds: number | null; id: string;
      meanConfidenceChange: number | null; meanMasteryChange: number | null; meanResponseSeconds: number | null;
      responseCount: number; sampleState: "UNOBSERVED" | "FIELD_TEST" | "REPORTABLE"; skillName: string;
      slug: string; unsureRate: number | null; warnings: string[];
    }>;
    minimumResponsesPerItem: number;
    policyVersion: string;
    stopReasons: Array<{ count: number; reason: string }>;
    studyReadiness: Array<{ detail: string; key: string; label: string; status: "COLLECTING_DATA" | "IMPLEMENTED" | "REQUIRES_STUDY" }>;
    summary: { activeItems: number; flaggedReportableItems: number; meanAbsoluteCalibrationError: number | null; meanEmpiricalDiscrimination: number | null; observedItems: number; reportableItems: number };
  };
  calibration: { bins: Array<{ beneficialOutcomeRate: number; count: number; meanPrediction: number }>; message: string; minimumOutcomes: number; observedOutcomes: number; state: "INSUFFICIENT_DATA" | "REPORTABLE" };
  coursePerformance: Array<{ acceptanceRate: number | null; assessedOutcomes: number; courseId: string; courseName: string; meanObservedGain: number | null; recommendations: number; responses: number; state: "INSUFFICIENT_DATA" | "REPORTABLE" }>;
  currentModel: { featureVersion: string; inferenceVersion: string; modelVersion: string } | null;
  drift: { baselineMeanPrediction: number | null; baselinePredictions: number; message: string; recentMeanPrediction: number | null; recentPredictions: number; relativeMeanShift: number | null; state: "INSUFFICIENT_DATA" | "REPORTABLE" };
  generatedAt: string;
  predictionDistribution: { count: number; maximum: number | null; mean: number | null; median: number | null; minimum: number | null; p10: number | null; p90: number | null };
  promotion: { automaticPromotion: false; stages: string[] };
  rates: { acceptanceRate: number | null; assessmentFollowThrough: number | null; completionRate: number | null; minimumResponses: number; rejectionRate: number | null; state: "INSUFFICIENT_DATA" | "REPORTABLE" };
  retraining: { contentCoveragePass: boolean; dataQualityPass: boolean; eligible: false; observedAssessedOutcomes: number; reasons: string[]; requiredAssessedOutcomes: number };
  volume: { accepted: number; assessedOutcomes: number; completed: number; observedMeanGain: number | null; predictions: number; recommendations: number; rejected: number; responses: number };
}

export function getGovernanceOverview(accessToken: string): Promise<GovernanceOverview> {
  return apiRequest("/governance/overview", { headers: { Authorization: `Bearer ${accessToken}` } });
}
