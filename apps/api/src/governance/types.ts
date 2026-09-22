export type SampleState = "INSUFFICIENT_DATA" | "REPORTABLE";

export interface GovernanceOverview {
  calibration: {
    bins: Array<{ beneficialOutcomeRate: number; count: number; meanPrediction: number }>;
    message: string;
    minimumOutcomes: number;
    observedOutcomes: number;
    state: SampleState;
  };
  coursePerformance: Array<{
    acceptanceRate: number | null;
    assessedOutcomes: number;
    courseId: string;
    courseName: string;
    meanObservedGain: number | null;
    recommendations: number;
    responses: number;
    state: SampleState;
  }>;
  currentModel: {
    featureVersion: string;
    inferenceVersion: string;
    modelVersion: string;
  } | null;
  drift: {
    baselineMeanPrediction: number | null;
    baselinePredictions: number;
    message: string;
    recentMeanPrediction: number | null;
    recentPredictions: number;
    relativeMeanShift: number | null;
    state: SampleState;
  };
  generatedAt: string;
  predictionDistribution: {
    count: number;
    maximum: number | null;
    mean: number | null;
    median: number | null;
    minimum: number | null;
    p10: number | null;
    p90: number | null;
  };
  promotion: {
    automaticPromotion: false;
    stages: string[];
  };
  rates: {
    acceptanceRate: number | null;
    assessmentFollowThrough: number | null;
    completionRate: number | null;
    minimumResponses: number;
    rejectionRate: number | null;
    state: SampleState;
  };
  retraining: {
    contentCoveragePass: boolean;
    dataQualityPass: boolean;
    eligible: false;
    observedAssessedOutcomes: number;
    reasons: string[];
    requiredAssessedOutcomes: number;
  };
  volume: {
    accepted: number;
    assessedOutcomes: number;
    completed: number;
    observedMeanGain: number | null;
    predictions: number;
    recommendations: number;
    rejected: number;
    responses: number;
  };
}

export interface GovernanceServiceContract {
  getOverview(): Promise<GovernanceOverview>;
}
