export type RetentionState = "UNKNOWN" | "STRONG" | "MODERATE" | "AT_RISK" | "CRITICAL";

export const retentionPolicy = {
  baseLambda: 0.025,
  revisionMasteryFloor: 0.65,
  thresholds: {
    atRisk: 0.55,
    critical: 0.3,
    strong: 0.75,
  },
} as const;
