export const masteryPolicy = {
  confidence: {
    assessedMinimum: 0.45,
    diagnosticCeiling: 0.45,
    verifiedMinimum: 0.78,
  },
  evidence: {
    assessedMinimumObservations: 5,
    assessedMinimumSessions: 2,
    verifiedMinimumConsistency: 0.7,
    verifiedMinimumObservations: 12,
    verifiedMinimumSessions: 4,
  },
  sourceWeights: {
    ASSESSMENT: 0.4,
    DIAGNOSTIC: 0.4,
    MODULE_ASSESSMENT: 0.4,
    PRACTICE: 0.25,
    QUIZ: 0.3,
    RETENTION_CHECK: 0.35,
  },
} as const;

export type EvidenceSourceType = keyof typeof masteryPolicy.sourceWeights;
export type EvidenceState = "UNKNOWN" | "ESTIMATED" | "ASSESSED" | "VERIFIED";
