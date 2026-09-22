import { apiRequest } from "../auth/api";

export interface SkillCourseContext {
  courseId: string;
  courseName: string;
  enrollmentId: string;
  enrollmentStatus: "ACTIVE" | "PAUSED" | "COMPLETED";
  usageType: "COURSE_SKILL" | "PREREQUISITE";
}

export interface SkillGoalContext {
  goalId: string;
  goalName: string;
  goalStatus: "ACTIVE" | "PAUSED" | "COMPLETED";
  requiredMastery: number;
}

export interface LearnerSkillState {
  attemptCount: number;
  category: string;
  confidence: number | null;
  correctAttempts: number;
  courseContexts: SkillCourseContext[];
  description: string;
  difficulty: number;
  domainName: string;
  evidenceCount: number;
  evidenceState: "ASSESSED" | "ESTIMATED" | "UNKNOWN" | "VERIFIED";
  evidenceStatus: "ASSESSED" | "UNASSESSED";
  goalContexts: SkillGoalContext[];
  id: string;
  incorrectAttempts: number;
  lastAssessedAt: string | null;
  lastPracticedAt: string | null;
  mastery: number | null;
  name: string;
  practiceAvailable: boolean;
  retention: number | null;
  retentionAnchorAt: string | null;
  retentionCalculatedAt: string | null;
  retentionState: "UNKNOWN" | "STRONG" | "MODERATE" | "AT_RISK" | "CRITICAL";
  revisionDue: boolean;
  slug: string;
  totalTimeSpentSeconds: number;
  updatedAt: string;
}

export interface SkillPassportSummary {
  assessedStateSkills: number;
  assessedSkills: number;
  averageConfidence: number | null;
  averageMastery: number | null;
  averageRetention: number | null;
  evidenceCoverage: number;
  estimatedSkills: number;
  sharedAcrossCourses: number;
  totalAttempts: number;
  trackedSkills: number;
  unassessedSkills: number;
  verifiedSkills: number;
  atRiskSkills: number;
  criticalSkills: number;
  revisionDueSkills: number;
  strongRetentionSkills: number;
}

export interface SkillPassport {
  skills: LearnerSkillState[];
  summary: SkillPassportSummary;
}

export function getSkillPassport(accessToken: string): Promise<SkillPassport> {
  return apiRequest<SkillPassport>("/learner-skills", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}
