import type { CandidateKind } from "../candidates/policy.js";
import type { CandidateModuleContext } from "../candidates/types.js";
import type { EvidenceState } from "../mastery/policy.js";
import type { GraphSkillMetrics, PrerequisiteCheck } from "../prerequisites/types.js";
import type { RetentionState } from "../retention/policy.js";

export type PathLane = "RECOGNIZED" | "CURRENT" | "RECOMMENDED_NEXT" | "UPCOMING" | "LOCKED";
export type PathStatus = "ACTIVE" | "STALE" | "SUPERSEDED" | "COMPLETED";

export interface PathLaneChange {
  from: PathLane;
  name: string;
  skillId: string;
  to: PathLane;
}

export interface PathChangeSummary {
  explanation: string;
  laneChanges: PathLaneChange[];
  learnNextChanged: boolean;
  masterySnapshotsChanged: number;
  newLearnNext: { name: string; skillId: string } | null;
  previousLearnNext: { name: string; skillId: string } | null;
  recognizedAdded: number;
  unlockedAdded: number;
}

export interface PathItem {
  benefitProbability: number | null;
  candidateKind: CandidateKind;
  category: string;
  confidence: number | null;
  dependencyLevel: number;
  description: string;
  difficulty: number;
  evidenceState: EvidenceState;
  explanation: string;
  goalRelevance: number | null;
  graphMetrics?: GraphSkillMetrics;
  isContextSkill: boolean;
  isCore: boolean;
  lane: PathLane;
  mastery: number | null;
  missingPrerequisites: PrerequisiteCheck[];
  module: CandidateModuleContext | null;
  name: string;
  position: number;
  practiceAvailable: boolean;
  prerequisiteState: "MISSING" | "RECOGNIZED" | "SATISFIED";
  prerequisites: PrerequisiteCheck[];
  priorityScore: number | null;
  reasonCodes: string[];
  resourceCount: number;
  retention: number | null;
  retentionState: RetentionState;
  revisionDue: boolean;
  skillId: string;
  slug: string;
  targetMastery: number;
}

export interface PersonalizedPath {
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
  id: string;
  invalidatedAt: string | null;
  invalidatedBySkillId: string | null;
  invalidationReason: string | null;
  items: PathItem[];
  learnNext: PathItem | null;
  pathVersion: number;
  policyVersion: string;
  previousPathId: string | null;
  provenance: {
    featureVersion: string;
    inferenceVersion: string;
    modelVersion: string;
    sourceClassification: string;
  };
  status: PathStatus;
  supersededAt: string | null;
  changeSummary: PathChangeSummary | null;
  summary: {
    eligibleRanked: number;
    locked: number;
    recognizedFromGlobalMastery: number;
    revisions: number;
    total: number;
  };
}

export interface PathGenerationResult {
  created: boolean;
  path: PersonalizedPath;
}

export interface CoordinatedCoursePath {
  courseId: string;
  courseName: string;
  courseSlug: string;
  enrollmentId: string;
  enrollmentStatus: "ACTIVE" | "COMPLETED" | "PAUSED";
  generatedAt: string | null;
  lastAccessedAt: string;
  learnNext: PathItem | null;
  pathId: string | null;
  pathState: "NO_ELIGIBLE_NEXT" | "NOT_GENERATED" | "READY" | "STALE";
  pathVersion: number | null;
  progressPercentage: number;
}

export interface CoordinatedRecommendation {
  basePriority: number;
  coordinationScore: number;
  courseContexts: Array<{
    courseId: string;
    courseName: string;
    courseSlug: string;
    enrollmentId: string;
    pathId: string;
    priorityScore: number;
  }>;
  crossCourseBonus: number;
  explanation: string;
  goalBonus: number;
  goalRelevance: number | null;
  item: PathItem;
  primaryCourse: {
    courseId: string;
    courseName: string;
    courseSlug: string;
    enrollmentId: string;
    pathId: string;
  };
  reasonCodes: string[];
}

export interface CoordinatedLearningPlan {
  activeGoal: {
    goalId: string;
    name: string;
    priority: number;
    targetDate: string | null;
  } | null;
  courses: CoordinatedCoursePath[];
  generatedAt: string;
  learnNext: CoordinatedRecommendation | null;
  policyVersion: string;
  summary: {
    activeCourses: number;
    coordinatedCourses: number;
    coursesWithoutPaths: number;
    goalAlignedCandidates: number;
    sharedSkillContexts: number;
  };
}

export interface CoordinationResult {
  generatedPaths: number;
  regeneratedPaths: number;
  plan: CoordinatedLearningPlan;
}

export interface PathRegenerationResult {
  change: PathChangeSummary;
  path: PersonalizedPath;
  previousPath: PersonalizedPath;
  regenerated: true;
}

export interface PathServiceContract {
  coordinate(learnerId: string, generateMissing?: boolean): Promise<CoordinationResult>;
  generate(learnerId: string, enrollmentId: string): Promise<PathGenerationResult>;
  get(learnerId: string, enrollmentId: string): Promise<PersonalizedPath | null>;
  history(learnerId: string, enrollmentId: string): Promise<PersonalizedPath[]>;
  regenerate(learnerId: string, enrollmentId: string): Promise<PathRegenerationResult>;
}

export interface BenefitPrediction {
  benefitProbability: number;
  skillId: string;
}

export interface InferenceResult {
  featureVersion: string;
  generatedAt: string;
  inferenceVersion: string;
  modelVersion: string;
  predictions: BenefitPrediction[];
  servingStatus: string;
}

export interface InferenceClientContract {
  provenance(): Promise<Omit<InferenceResult, "predictions">>;
  predict(candidates: Array<{ features: Record<string, number>; skillId: string }>): Promise<InferenceResult>;
}
