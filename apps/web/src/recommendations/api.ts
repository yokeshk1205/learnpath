import { apiRequest } from "../auth/api";

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

const headers = (accessToken: string): HeadersInit => ({ Authorization: `Bearer ${accessToken}` });

export function getRecommendationFeedback(accessToken: string, pathId: string): Promise<{ feedback: RecommendationFeedback | null }> {
  return apiRequest(`/recommendations/paths/${pathId}/feedback`, { headers: headers(accessToken) });
}

export function respondToRecommendation(
  accessToken: string,
  pathId: string,
  input: { comment?: string; decision: RecommendationDecision; reasonCode?: RecommendationReason; resourceId?: string },
): Promise<{ created: boolean; feedback: RecommendationFeedback }> {
  return apiRequest(`/recommendations/paths/${pathId}/feedback`, {
    body: JSON.stringify(input),
    headers: { ...headers(accessToken), "Content-Type": "application/json" },
    method: "POST",
  });
}

export function getRecommendationEvaluation(accessToken: string): Promise<RecommendationEvaluationOverview> {
  return apiRequest("/recommendations/evaluation", { headers: headers(accessToken) });
}
