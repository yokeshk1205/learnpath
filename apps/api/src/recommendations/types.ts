export type RecommendationDecision = "ACCEPTED" | "REJECTED";
export type RecommendationReason =
  | "ALREADY_KNOW"
  | "NOT_RELEVANT"
  | "PREFER_DIFFERENT"
  | "TOO_DIFFICULT"
  | "TOO_EASY"
  | "OTHER";

export interface RecommendationFeedback {
  baseline: { confidence: number | null; mastery: number | null; retention: number | null };
  comment: string | null;
  courseId: string;
  courseName: string;
  decidedAt: string;
  decision: RecommendationDecision;
  enrollmentId: string;
  feedbackVersion: number;
  id: string;
  pathId: string;
  pathVersion: number;
  provenance: {
    featureVersion: string;
    inferenceVersion: string;
    modelVersion: string;
    policyVersion: string;
  };
  reasonCode: RecommendationReason | null;
  resourceId: string | null;
  skillId: string;
  skillName: string;
}

export interface RecommendationResponseInput {
  comment?: string;
  decision: RecommendationDecision;
  reasonCode?: RecommendationReason;
  resourceId?: string;
}

export interface RecommendationEvaluationRecord extends RecommendationFeedback {
  completion: { completedAt: string; resourceId: string | null } | null;
  currentMastery: number | null;
  evidenceAfterDecision: number;
  latestEvidenceAt: string | null;
  learningGain: number | null;
  outcomeState: "AWAITING_EVIDENCE" | "DECLINED" | "IMPROVED" | "OBSERVED_NO_BASELINE" | "REJECTED" | "STABLE";
}

export interface RecommendationEvaluationOverview {
  generatedAt: string;
  methodology: {
    attributionWindowDays: number;
    disclaimer: string;
    positiveGainThreshold: number;
  };
  modelVersions: Array<{
    acceptanceRate: number | null;
    accepted: number;
    completed: number;
    meanLearningGain: number | null;
    modelVersion: string;
    responded: number;
    shown: number;
  }>;
  reasons: Array<{ count: number; reasonCode: RecommendationReason }>;
  records: RecommendationEvaluationRecord[];
  summary: {
    acceptanceRate: number | null;
    accepted: number;
    completed: number;
    completionRate: number | null;
    meanLearningGain: number | null;
    outcomeEvidence: number;
    positiveGainRate: number | null;
    rejected: number;
    responded: number;
    responseRate: number | null;
    shown: number;
  };
}

export interface RecommendationServiceContract {
  evaluate(learnerId: string): Promise<RecommendationEvaluationOverview>;
  getFeedback(learnerId: string, pathId: string): Promise<RecommendationFeedback | null>;
  respond(learnerId: string, pathId: string, input: RecommendationResponseInput): Promise<{
    created: boolean;
    feedback: RecommendationFeedback;
  }>;
}
