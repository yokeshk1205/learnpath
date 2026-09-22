import { apiRequest } from "../auth/api";

export type CandidateKind = "LEARN" | "REVISION" | "SUPPORTING_PREREQUISITE";
export type CandidateStatus = "ELIGIBLE" | "EXCLUDED" | "LOCKED";
export type EvidenceState = "ASSESSED" | "ESTIMATED" | "UNKNOWN" | "VERIFIED";
export type RetentionState = "AT_RISK" | "CRITICAL" | "MODERATE" | "STRONG" | "UNKNOWN";

export interface CandidatePrerequisite {
  currentMastery: number | null;
  prerequisiteSkillId: string;
  prerequisiteSkillName: string;
  recognizedAcrossCourses: boolean;
  requiredMastery: number;
  shortfall: number;
}

export interface CandidateSkill {
  category: string;
  confidence: number | null;
  courseSequence: number | null;
  dependencyLevel: number;
  description: string;
  difficulty: number;
  eligibilityExplanation: string;
  evidenceCount: number;
  evidenceState: EvidenceState;
  exclusionReason: "STRONG_MASTERY" | null;
  goalRelevance: number | null;
  id: string;
  isContextSkill: boolean;
  isCore: boolean;
  kind: CandidateKind;
  mastery: number | null;
  masteryGap: number | null;
  missingPrerequisites: CandidatePrerequisite[];
  module: {
    id: string;
    name: string;
    progressStatus: "COMPLETED" | "IN_PROGRESS" | "NOT_STARTED";
    sequence: number;
  } | null;
  name: string;
  popularity: {
    activityEvents: number;
    courseContexts: number;
    evidenceObservations: number;
    observedLearners: number;
  };
  practiceAvailable: boolean;
  prerequisiteCount: number;
  resourceCount: number;
  retention: number | null;
  retentionState: RetentionState;
  revisionDue: boolean;
  slug: string;
  status: CandidateStatus;
  targetMastery: number;
}

export interface CandidateBaselineEntry {
  activityEvents: number;
  courseContexts: number;
  evidenceObservations: number;
  masteryGap: number | null;
  observedLearners: number;
  rank: number;
  skillId: string;
  skillName: string;
}

export interface CandidateOverview {
  baselines: {
    disclaimer: string;
    highestSkillGap: { description: string; ranking: CandidateBaselineEntry[] };
    popularity: { description: string; ranking: CandidateBaselineEntry[] };
    topK: number;
    topKOverlap: number;
  };
  candidates: {
    eligible: CandidateSkill[];
    excluded: CandidateSkill[];
    locked: CandidateSkill[];
  };
  context: {
    courseId: string;
    courseName: string;
    courseSlug: string;
    enrollmentId: string;
    enrollmentStatus: "ACTIVE" | "COMPLETED" | "PAUSED";
    goalId: string | null;
    goalName: string | null;
  };
  generatedAt: string;
  policyVersion: string;
  summary: {
    eligibleSkills: number;
    excludedStrongSkills: number;
    learnCandidates: number;
    lockedSkills: number;
    measurableGapCandidates: number;
    revisionCandidates: number;
    supportingCandidates: number;
    totalRelevantSkills: number;
    unknownEvidenceCandidates: number;
  };
}

export function getCandidateOverview(
  accessToken: string,
  enrollmentId: string,
): Promise<CandidateOverview> {
  return apiRequest<CandidateOverview>(`/enrollments/${enrollmentId}/candidates`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

