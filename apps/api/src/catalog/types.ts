export interface CatalogStats {
  categories: number;
  courses: number;
  domains: number;
  prerequisiteEdges: number;
  skills: number;
}

export interface CatalogDomain {
  description: string;
  icon: string;
  id: string;
  name: string;
  slug: string;
}

export interface CatalogGoal {
  coreSkillCount: number;
  description: string;
  domainName: string;
  estimatedWeeks: number;
  id: string;
  isSelected: boolean;
  level: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  name: string;
  outcome: string;
  skillCount: number;
  slug: string;
}

export interface CatalogCourse {
  description: string;
  estimatedHours: number;
  id: string;
  level: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  moduleCount: number;
  name: string;
  skillCount: number;
  slug: string;
}

export interface LearnerGoal {
  estimatedWeeks: number;
  goalId: string;
  id: string;
  level: string;
  name: string;
  outcome: string;
  priority: number;
  selectedAt: string;
  slug: string;
  status: "ACTIVE" | "PAUSED" | "COMPLETED" | "DROPPED";
  targetDate: string | null;
}

export interface GoalSkillCourseContext {
  courseId: string;
  courseName: string;
}

export interface GoalSkill {
  category: string;
  courses: GoalSkillCourseContext[];
  description: string;
  difficulty: number;
  estimatedMinutes: number;
  id: string;
  isCore: boolean;
  name: string;
  relevance: number;
  requiredMastery: number;
  slug: string;
}

export interface PrerequisiteEdge {
  prerequisiteSkillId: string;
  prerequisiteSkillName: string;
  relationshipType: "REQUIRED" | "RECOMMENDED";
  requiredMastery: number;
  skillId: string;
  skillName: string;
}

export interface GoalDetail {
  goal: CatalogGoal;
  prerequisites: PrerequisiteEdge[];
  skills: GoalSkill[];
}

export interface CatalogOverview {
  courses: CatalogCourse[];
  domains: CatalogDomain[];
  goals: CatalogGoal[];
  learnerGoals: LearnerGoal[];
  stats: CatalogStats;
}

export interface CatalogServiceContract {
  getGoalDetail(learnerId: string, goalId: string): Promise<GoalDetail>;
  getLearnerGoals(learnerId: string): Promise<LearnerGoal[]>;
  getOverview(learnerId: string): Promise<CatalogOverview>;
  removeGoal(learnerId: string, goalId: string): Promise<LearnerGoal>;
  selectGoal(
    learnerId: string,
    input: { goalId: string; priority: number; targetDate?: string },
  ): Promise<LearnerGoal>;
}
