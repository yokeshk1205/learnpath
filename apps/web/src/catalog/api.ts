import { apiRequest } from "../auth/api";

export interface CatalogStats {
  categories: number;
  courses: number;
  domains: number;
  prerequisiteEdges: number;
  skills: number;
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
  level: string;
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
  status: string;
  targetDate: string | null;
}

export interface GoalSkill {
  category: string;
  courses: { courseId: string; courseName: string }[];
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

export interface GoalDetail {
  goal: CatalogGoal;
  prerequisites: {
    prerequisiteSkillId: string;
    prerequisiteSkillName: string;
    relationshipType: "REQUIRED" | "RECOMMENDED";
    requiredMastery: number;
    skillId: string;
    skillName: string;
  }[];
  skills: GoalSkill[];
}

export interface CatalogOverview {
  courses: CatalogCourse[];
  domains: { description: string; icon: string; id: string; name: string; slug: string }[];
  goals: CatalogGoal[];
  learnerGoals: LearnerGoal[];
  stats: CatalogStats;
}

function bearer(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

export function getCatalogOverview(accessToken: string): Promise<CatalogOverview> {
  return apiRequest<CatalogOverview>("/catalog/overview", { headers: bearer(accessToken) });
}

export function getGoalDetail(accessToken: string, goalId: string): Promise<GoalDetail> {
  return apiRequest<GoalDetail>(`/catalog/goals/${goalId}`, { headers: bearer(accessToken) });
}

export function selectLearnerGoal(accessToken: string, goalId: string): Promise<{ goal: LearnerGoal }> {
  return apiRequest<{ goal: LearnerGoal }>("/catalog/learner-goals", {
    body: JSON.stringify({ goalId, priority: 1 }),
    headers: bearer(accessToken),
    method: "POST",
  });
}

export function removeLearnerGoal(accessToken: string, goalId: string): Promise<{ goal: LearnerGoal }> {
  return apiRequest<{ goal: LearnerGoal }>(`/catalog/learner-goals/${goalId}`, {
    headers: bearer(accessToken),
    method: "DELETE",
  });
}
