import { apiRequest } from "../auth/api";

export type RetentionState = "UNKNOWN" | "STRONG" | "MODERATE" | "AT_RISK" | "CRITICAL";

export interface RetentionSkill {
  anchorAt: string | null;
  calculatedAt: string;
  category: string;
  confidence: number | null;
  courseContexts: Array<{ courseId: string; courseName: string; enrollmentId: string }>;
  daysSinceEvidence: number | null;
  decayAmount: number | null;
  effectiveLambda: number | null;
  evidenceCount: number;
  evidenceState: "UNKNOWN" | "ESTIMATED" | "ASSESSED" | "VERIFIED";
  id: string;
  mastery: number | null;
  name: string;
  nextReviewAt: string | null;
  practiceAvailable: boolean;
  reasons: string[];
  retention: number | null;
  revisionDue: boolean;
  slug: string;
  state: RetentionState;
}

export interface RetentionOverview {
  calculatedAt: string;
  skills: RetentionSkill[];
  summary: {
    atRiskSkills: number;
    averageRetention: number | null;
    criticalSkills: number;
    moderateSkills: number;
    revisionDueSkills: number;
    strongSkills: number;
    trackedSkills: number;
    unknownSkills: number;
  };
}

export function getRetentionOverview(accessToken: string): Promise<RetentionOverview> {
  return apiRequest<RetentionOverview>("/retention", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}
