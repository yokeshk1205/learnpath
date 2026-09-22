import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import type { AnalyticsServiceContract, LearnerAnalyticsOverview } from "../src/analytics/types.js";
import type { AuthServiceContract } from "../src/auth/types.js";
import type { CatalogServiceContract } from "../src/catalog/types.js";
import type { DiagnosticServiceContract } from "../src/diagnostics/types.js";
import type { EnrollmentServiceContract } from "../src/enrollments/types.js";
import type { LearnerSkillServiceContract } from "../src/learner-skills/types.js";
import type { LearningServiceContract } from "../src/learning/types.js";
import type { PracticeServiceContract } from "../src/practice/types.js";
import type { PrerequisiteServiceContract } from "../src/prerequisites/types.js";
import type { RetentionServiceContract } from "../src/retention/types.js";

const learnerId = "6f48dc49-943a-4e6d-aee9-543588698108";
const authService: AuthServiceContract = {
  authenticateAccessToken: vi.fn(), getCurrentUser: vi.fn(), login: vi.fn(),
  logout: vi.fn(), refresh: vi.fn(), register: vi.fn(),
};
const analyticsService: AnalyticsServiceContract = { getOverview: vi.fn() };
const catalogService = { getGoalDetail: vi.fn(), getLearnerGoals: vi.fn(), getOverview: vi.fn(), removeGoal: vi.fn(), selectGoal: vi.fn() } as CatalogServiceContract;
const diagnosticService = { getAttempt: vi.fn(), getOverview: vi.fn(), getResult: vi.fn(), start: vi.fn(), submit: vi.fn() } as DiagnosticServiceContract;
const enrollmentService = { enroll: vi.fn(), getEnrollment: vi.fn(), listEnrollments: vi.fn(), setStatus: vi.fn(), updateModuleProgress: vi.fn() } as EnrollmentServiceContract;
const learnerSkillService = { getPassport: vi.fn() } as LearnerSkillServiceContract;
const learningService = { getOverview: vi.fn(), getResource: vi.fn(), recordResourceEvent: vi.fn() } as LearningServiceContract;
const practiceService = { getAttempt: vi.fn(), start: vi.fn(), submit: vi.fn() } as PracticeServiceContract;
const prerequisiteService = { analyze: vi.fn() } as PrerequisiteServiceContract;
const retentionService = { getOverview: vi.fn() } as RetentionServiceContract;

const overview: LearnerAnalyticsOverview = {
  distributions: { mastery: { developing: 1, needsWork: 0, strong: 0, unknown: 1 }, retention: { atRisk: 0, healthy: 1, reviewSoon: 0, unknown: 1 } },
  evidenceCoverage: [{ evidenceCount: 1, skillCount: 1, sourceType: "DIAGNOSTIC" }],
  generatedAt: "2026-08-31T00:00:00.000Z",
  methodology: { averageMastery: "Assessed only", disclaimer: "Descriptive", retention: "Persisted" },
  summary: { activePaths: 1, assessedSkills: 1, averageMastery: .6, averageRetention: .58, enrolledCourses: 1, evidenceCoveragePercent: 50, evidenceCount: 1, lessonsCompleted: 0, revisionDueSkills: 0, trackedSkills: 2 },
  timeline: [],
};

function app() {
  return createApp({ analyticsService, authService, catalogService, diagnosticService, enrollmentService, learnerSkillService, learningService, practiceService, prerequisiteService, retentionService, probeDatabase: vi.fn() });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authService.authenticateAccessToken).mockResolvedValue({ email: "ada@example.com", roles: ["LEARNER"], userId: learnerId });
});

describe("learner analytics HTTP boundary", () => {
  it("returns only the authenticated learner's analytics", async () => {
    vi.mocked(analyticsService.getOverview).mockResolvedValue(overview);
    const response = await request(app()).get("/analytics/overview").set("Authorization", "Bearer token");
    expect(response.status).toBe(200);
    expect(response.body.summary).toMatchObject({ assessedSkills: 1, averageMastery: .6 });
    expect(analyticsService.getOverview).toHaveBeenCalledWith(learnerId);
  });
});
