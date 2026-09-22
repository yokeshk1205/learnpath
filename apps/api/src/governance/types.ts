export type SampleState = "INSUFFICIENT_DATA" | "REPORTABLE";

export interface GovernanceOverview {
  diagnosticQuality: {
    cohort: {
      meanQuestions: number | null;
      medianQuestions: number | null;
      p90Questions: number | null;
      selfReportClaims: number;
      submittedAttempts: number;
      totalResponses: number;
      uniqueLearners: number;
    };
    evidence: {
      classificationCounts: Record<string, number>;
      confidenceIntervalsRecorded: number;
      mixedEvidenceSkills: number;
      skillDecisions: number;
    };
    items: Array<{
      absoluteCalibrationError: number | null;
      authorCalibrationState: "CALIBRATED" | "EXPERT_PRIOR" | "FIELD_TEST";
      authorDiscrimination: number;
      authorExpectedCorrectRate: number;
      cognitiveLevel: "ANALYZE" | "APPLY" | "REMEMBER" | "UNDERSTAND";
      configuredDifficulty: number;
      constructCode: string;
      contentVersion: number;
      correctRate: number | null;
      diagnosticRole: "ANCHOR" | "CHALLENGE" | "VERIFICATION";
      difficultyEstimate: number | null;
      empiricalDiscrimination: number | null;
      expectedResponseSeconds: number | null;
      id: string;
      meanConfidenceChange: number | null;
      meanMasteryChange: number | null;
      meanResponseSeconds: number | null;
      responseCount: number;
      sampleState: "UNOBSERVED" | "FIELD_TEST" | "REPORTABLE";
      skillName: string;
      slug: string;
      unsureRate: number | null;
      warnings: string[];
    }>;
    minimumResponsesPerItem: number;
    policyVersion: string;
    stopReasons: Array<{ count: number; reason: string }>;
    studyReadiness: Array<{
      detail: string;
      key: string;
      label: string;
      status: "COLLECTING_DATA" | "IMPLEMENTED" | "REQUIRES_STUDY";
    }>;
    summary: {
      activeItems: number;
      flaggedReportableItems: number;
      meanAbsoluteCalibrationError: number | null;
      meanEmpiricalDiscrimination: number | null;
      observedItems: number;
      reportableItems: number;
    };
  };
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
