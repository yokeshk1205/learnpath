import { apiRequest } from "../auth/api";

export interface GovernanceOverview {
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
