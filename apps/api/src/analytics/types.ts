export interface AnalyticsDistribution {
  atRisk: number;
  developing: number;
  healthy: number;
  needsWork: number;
  reviewSoon: number;
  strong: number;
  unknown: number;
}

export interface EvidenceCoverageItem {
  evidenceCount: number;
  sourceType: string;
  skillCount: number;
}

export interface MasteryTimelinePoint {
  confidenceAfter: number;
  createdAt: string;
  masteryAfter: number;
  masteryBefore: number | null;
  portfolioAverage: number;
  skillId: string;
  skillName: string;
  sourceType: string;
}

export interface LearnerAnalyticsOverview {
  distributions: {
    mastery: Pick<AnalyticsDistribution, "developing" | "needsWork" | "strong" | "unknown">;
    retention: Pick<AnalyticsDistribution, "atRisk" | "healthy" | "reviewSoon" | "unknown">;
  };
  evidenceCoverage: EvidenceCoverageItem[];
  generatedAt: string;
  methodology: {
    averageMastery: string;
    disclaimer: string;
    retention: string;
  };
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
  timeline: MasteryTimelinePoint[];
}

export interface AnalyticsServiceContract {
  getOverview(learnerId: string): Promise<LearnerAnalyticsOverview>;
}
