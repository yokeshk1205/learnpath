import { apiRequest } from "../auth/api";
import type { CandidateKind, CandidatePrerequisite, EvidenceState, RetentionState } from "../candidates/api";
import type { GraphSkillMetrics } from "../prerequisites/api";

export type PathLane = "RECOGNIZED" | "CURRENT" | "RECOMMENDED_NEXT" | "UPCOMING" | "LOCKED";
export type PathStatus = "ACTIVE" | "STALE" | "SUPERSEDED" | "COMPLETED";

export interface PathChangeSummary {
  explanation: string;
  laneChanges: Array<{ from: PathLane; name: string; skillId: string; to: PathLane }>;
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
  missingPrerequisites: CandidatePrerequisite[];
  module: { id: string; name: string; progressStatus: "COMPLETED" | "IN_PROGRESS" | "NOT_STARTED"; sequence: number } | null;
  name: string;
  position: number;
  practiceAvailable: boolean;
  prerequisiteState: "MISSING" | "RECOGNIZED" | "SATISFIED";
  prerequisites: CandidatePrerequisite[];
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

export interface CoordinatedLearningPlan {
  activeGoal: { goalId: string; name: string; priority: number; targetDate: string | null } | null;
  courses: CoordinatedCoursePath[];
  generatedAt: string;
  learnNext: {
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
  } | null;
  policyVersion: string;
  summary: {
    activeCourses: number;
    coordinatedCourses: number;
    coursesWithoutPaths: number;
    goalAlignedCandidates: number;
    sharedSkillContexts: number;
  };
}

const headers = (accessToken: string): HeadersInit => ({ Authorization: `Bearer ${accessToken}` });

export function getPersonalizedPath(accessToken: string, enrollmentId: string): Promise<PersonalizedPath> {
  return apiRequest<PersonalizedPath>(`/enrollments/${enrollmentId}/path`, { headers: headers(accessToken) });
}

export function generatePersonalizedPath(accessToken: string, enrollmentId: string): Promise<{ created: boolean; path: PersonalizedPath }> {
  return apiRequest<{ created: boolean; path: PersonalizedPath }>(`/enrollments/${enrollmentId}/path/generate`, {
    headers: headers(accessToken),
    method: "POST",
  });
}

export function regeneratePersonalizedPath(accessToken: string, enrollmentId: string): Promise<{
  change: PathChangeSummary;
  path: PersonalizedPath;
  previousPath: PersonalizedPath;
  regenerated: true;
}> {
  return apiRequest(`/enrollments/${enrollmentId}/path/regenerate`, {
    headers: headers(accessToken),
    method: "POST",
  });
}

export function getPersonalizedPathHistory(accessToken: string, enrollmentId: string): Promise<{ paths: PersonalizedPath[] }> {
  return apiRequest(`/enrollments/${enrollmentId}/path/history`, { headers: headers(accessToken) });
}

export function getCoordinatedLearningPlan(accessToken: string): Promise<CoordinatedLearningPlan> {
  return apiRequest<CoordinatedLearningPlan>("/enrollments/paths/coordination", {
    headers: headers(accessToken),
  });
}

export function generateCoordinatedLearningPlan(accessToken: string): Promise<{
  generatedPaths: number;
  regeneratedPaths: number;
  plan: CoordinatedLearningPlan;
}> {
  return apiRequest<{ generatedPaths: number; regeneratedPaths: number; plan: CoordinatedLearningPlan }>(
    "/enrollments/paths/coordination/generate",
    { headers: headers(accessToken), method: "POST" },
  );
}
