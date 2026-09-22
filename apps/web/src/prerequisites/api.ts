import { apiRequest } from "../auth/api";

export type PrerequisiteSkillStatus = "LOCKED" | "MASTERED" | "UNLOCKED";

export interface PrerequisiteCourseContext {
  courseId: string;
  courseName: string;
  isEnrolled: boolean;
}

export interface PrerequisiteCheck {
  confidence: number | null;
  courseContexts: PrerequisiteCourseContext[];
  currentMastery: number | null;
  effectiveMastery?: number | null;
  evidenceStatus: "KNOWN" | "UNKNOWN";
  prerequisiteSkillId: string;
  prerequisiteSkillName: string;
  recognizedAcrossCourses: boolean;
  relationshipType: "RECOMMENDED" | "REQUIRED";
  requiredMastery: number;
  satisfied: boolean;
  shortfall: number;
  uncertaintyPenalty?: number;
}

export interface GraphSkillMetrics {
  betweennessCentrality: number;
  directDependentCount: number;
  downstreamSkillCount: number;
  foundationRoute: string[];
  gatewayScore: number;
  unlockableSkills: Array<{ requiredMastery: number; skillId: string; skillName: string }>;
}

export interface PrerequisiteSkillAnalysis {
  category: string;
  confidence: number | null;
  contextGap: number | null;
  courseContexts: PrerequisiteCourseContext[];
  currentMastery: number | null;
  effectiveMastery?: number | null;
  dependencyLevel: number;
  description: string;
  difficulty: number;
  explanation: string;
  goalGap: number | null;
  graphMetrics?: GraphSkillMetrics;
  id: string;
  isCore: boolean;
  isContextSkill: boolean;
  isGoalSkill: boolean;
  missingPrerequisites: PrerequisiteCheck[];
  name: string;
  prerequisites: PrerequisiteCheck[];
  relevance: number | null;
  slug: string;
  status: PrerequisiteSkillStatus;
  targetMastery: number;
}

export interface GoalPrerequisiteAnalysis {
  analyzedAt: string;
  context: {
    enrollmentId: string | null;
    id: string;
    name: string;
    outcome: string;
    slug: string;
    type: "COURSE" | "GOAL";
  };
  goal: { id: string; name: string; outcome: string; slug: string } | null;
  analytics?: {
    bottlenecks: Array<{
      blockedContextSkillCount: number;
      gatewayScore: number;
      skillId: string;
      skillName: string;
    }>;
    criticalPath: string[];
    edgeCount: number;
    engine: "networkx" | "typescript";
    generatedAt: string;
    isDag: boolean;
    nodeCount: number;
    status: "AVAILABLE" | "NOT_CONFIGURED" | "UNAVAILABLE";
    version: string;
  };
  skills: PrerequisiteSkillAnalysis[];
  summary: {
    evidenceCoverage: number;
    contextReadiness: number;
    contextSkills: number;
    courseReadiness: number | null;
    courseSkills: number | null;
    goalReadiness: number | null;
    goalSkills: number | null;
    lockedSkills: number;
    masteredSkills: number;
    prerequisiteCoverage: number;
    requiredEdges: number;
    satisfiedRequiredEdges: number;
    supportingSkills: number;
    unlockedSkills: number;
  };
  validOrder: string[];
}

export function getPrerequisiteAnalysis(
  accessToken: string,
  context: { enrollmentId?: string; goalId?: string } = {},
): Promise<GoalPrerequisiteAnalysis> {
  const query = context.enrollmentId
    ? `?enrollmentId=${encodeURIComponent(context.enrollmentId)}`
    : context.goalId ? `?goalId=${encodeURIComponent(context.goalId)}` : "";
  return apiRequest<GoalPrerequisiteAnalysis>(`/prerequisites/analysis${query}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}
