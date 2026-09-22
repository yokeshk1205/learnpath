import { apiRequest } from "../auth/api";

export interface LearnerAnalyticsOverview {
  distributions: {
    mastery: { developing: number; needsWork: number; strong: number; unknown: number };
    retention: { atRisk: number; healthy: number; reviewSoon: number; unknown: number };
  };
  evidenceCoverage: Array<{ evidenceCount: number; skillCount: number; sourceType: string }>;
  generatedAt: string;
  methodology: { averageMastery: string; disclaimer: string; retention: string };
  summary: {
    activePaths: number;
    assessedSkills: number;
    averageMastery: number | null;
    averageRetention: number | null;
    enrolledCourses: number;
    evidenceCoveragePercent: number;
    evidenceCount: number;
    lessonsCompleted: number;
    revisionDueSkills: number;
    trackedSkills: number;
  };
  timeline: Array<{
    confidenceAfter: number;
    createdAt: string;
    masteryAfter: number;
    masteryBefore: number | null;
    portfolioAverage: number;
    skillId: string;
    skillName: string;
    sourceType: string;
  }>;
}

export function getLearnerAnalytics(accessToken: string): Promise<LearnerAnalyticsOverview> {
  return apiRequest("/analytics/overview", { headers: { Authorization: `Bearer ${accessToken}` } });
}
