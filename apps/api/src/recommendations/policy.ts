import type { RecommendationDecision, RecommendationEvaluationRecord } from "./types.js";

export const recommendationEvaluationPolicy = {
  attributionWindowDays: 30,
  positiveGainThreshold: 0.05,
  version: "recommendation-outcome-attribution-v1",
} as const;

export function classifyRecommendationOutcome(
  decision: RecommendationDecision,
  learningGain: number | null,
  evidenceAfterDecision = 0,
): RecommendationEvaluationRecord["outcomeState"] {
  if (decision === "REJECTED") return "REJECTED";
  if (learningGain === null) return evidenceAfterDecision > 0 ? "OBSERVED_NO_BASELINE" : "AWAITING_EVIDENCE";
  if (learningGain >= recommendationEvaluationPolicy.positiveGainThreshold) return "IMPROVED";
  if (learningGain <= -recommendationEvaluationPolicy.positiveGainThreshold) return "DECLINED";
  return "STABLE";
}
