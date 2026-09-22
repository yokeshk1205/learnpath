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

export interface GraphUnlockImpact {
  requiredMastery: number;
  skillId: string;
  skillName: string;
}

export interface GraphSkillMetrics {
  betweennessCentrality: number;
  directDependentCount: number;
  downstreamSkillCount: number;
  foundationRoute: string[];
  gatewayScore: number;
  unlockableSkills: GraphUnlockImpact[];
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
  goal: {
    id: string;
    name: string;
    outcome: string;
    slug: string;
  } | null;
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

export interface PrerequisiteServiceContract {
  analyze(
    learnerId: string,
    input?: { enrollmentId?: string; goalId?: string },
  ): Promise<GoalPrerequisiteAnalysis>;
}

export interface GraphAnalyticsClientContract {
  analyze(input: {
    edges: Array<{
      prerequisiteSkillId: string;
      relationshipType: "RECOMMENDED" | "REQUIRED";
      requiredMastery: number;
      satisfied: boolean;
      skillId: string;
    }>;
    nodes: Array<{
      isContextSkill: boolean;
      name: string;
      skillId: string;
      status: PrerequisiteSkillStatus;
    }>;
  }): Promise<{
    analyticsVersion: string;
    bottlenecks: NonNullable<GoalPrerequisiteAnalysis["analytics"]>["bottlenecks"];
    criticalPath: string[];
    edgeCount: number;
    engine: "networkx";
    generatedAt: string;
    isDag: boolean;
    nodeCount: number;
    nodes: Array<GraphSkillMetrics & { skillId: string }>;
  }>;
}
