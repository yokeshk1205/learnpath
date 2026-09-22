import type { EvidenceState } from "../mastery/policy.js";
import type { GraphSkillMetrics, PrerequisiteCheck, PrerequisiteSkillAnalysis } from "../prerequisites/types.js";
import type { RetentionState } from "../retention/policy.js";
import type { CandidateKind, CandidateStatus } from "./policy.js";

export interface CandidatePopularity {
  activityEvents: number;
  courseContexts: number;
  evidenceObservations: number;
  observedLearners: number;
}

export interface CandidateModuleContext {
  id: string;
  name: string;
  progressStatus: "COMPLETED" | "IN_PROGRESS" | "NOT_STARTED";
  sequence: number;
}

export interface CandidateSkillSource {
  courseSequence: number | null;
  evidenceCount: number;
  evidenceState: EvidenceState;
  goalRelevance: number | null;
  module: CandidateModuleContext | null;
  popularity: CandidatePopularity;
  practiceAvailable: boolean;
  prerequisite: PrerequisiteSkillAnalysis;
  resourceCount: number;
  retention: number | null;
  retentionState: RetentionState;
  revisionDue: boolean;
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
  graphMetrics?: GraphSkillMetrics;
  id: string;
  isContextSkill: boolean;
  isCore: boolean;
  kind: CandidateKind;
  mastery: number | null;
  masteryGap: number | null;
  missingPrerequisites: PrerequisiteCheck[];
  module: CandidateModuleContext | null;
  popularity: CandidatePopularity;
  practiceAvailable: boolean;
  prerequisiteCount: number;
  prerequisites: PrerequisiteCheck[];
  resourceCount: number;
  retention: number | null;
  retentionState: RetentionState;
  revisionDue: boolean;
  slug: string;
  status: CandidateStatus;
  targetMastery: number;
  name: string;
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
    highestSkillGap: {
      description: string;
      ranking: CandidateBaselineEntry[];
    };
    popularity: {
      description: string;
      ranking: CandidateBaselineEntry[];
    };
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

export interface CandidateServiceContract {
  generate(learnerId: string, enrollmentId: string): Promise<CandidateOverview>;
}
