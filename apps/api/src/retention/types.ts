import type { RetentionState } from "./policy.js";

export interface RetentionCourseContext {
  courseId: string;
  courseName: string;
  enrollmentId: string;
}

export interface RetentionProjection {
  anchorAt: string | null;
  calculatedAt: string;
  daysSinceEvidence: number | null;
  decayAmount: number | null;
  effectiveLambda: number | null;
  nextReviewAt: string | null;
  reasons: string[];
  retention: number | null;
  revisionDue: boolean;
  state: RetentionState;
}

export interface RetentionSkill extends RetentionProjection {
  category: string;
  confidence: number | null;
  courseContexts: RetentionCourseContext[];
  evidenceCount: number;
  evidenceState: "UNKNOWN" | "ESTIMATED" | "ASSESSED" | "VERIFIED";
  id: string;
  mastery: number | null;
  name: string;
  practiceAvailable: boolean;
  slug: string;
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

export interface RetentionServiceContract {
  getOverview(learnerId: string): Promise<RetentionOverview>;
}
