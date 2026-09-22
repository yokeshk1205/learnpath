export const candidatePolicy = {
  baselineTopK: 3,
  version: "candidate-v1",
} as const;

export type CandidateKind = "LEARN" | "REVISION" | "SUPPORTING_PREREQUISITE";
export type CandidateStatus = "ELIGIBLE" | "EXCLUDED" | "LOCKED";

