import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import type { AuthServiceContract } from "../src/auth/types.js";
import type { CatalogServiceContract } from "../src/catalog/types.js";
import type { DiagnosticServiceContract } from "../src/diagnostics/types.js";
import type { EnrollmentServiceContract } from "../src/enrollments/types.js";
import type { LearnerSkillServiceContract } from "../src/learner-skills/types.js";
import type { LearningServiceContract } from "../src/learning/types.js";
import type { PracticeServiceContract } from "../src/practice/types.js";
import type { PrerequisiteServiceContract } from "../src/prerequisites/types.js";
import type { RetentionOverview, RetentionServiceContract } from "../src/retention/types.js";

const learnerId = "6f48dc49-943a-4e6d-aee9-543588698108";
const authService: AuthServiceContract = {
  authenticateAccessToken: vi.fn(), getCurrentUser: vi.fn(), login: vi.fn(),
  logout: vi.fn(), refresh: vi.fn(), register: vi.fn(),
};
const catalogService: CatalogServiceContract = {
  getGoalDetail: vi.fn(), getLearnerGoals: vi.fn(), getOverview: vi.fn(), removeGoal: vi.fn(), selectGoal: vi.fn(),
};
const diagnosticService: DiagnosticServiceContract = {
  getAttempt: vi.fn(), getOverview: vi.fn(), getResult: vi.fn(), start: vi.fn(), submit: vi.fn(),
};
const enrollmentService: EnrollmentServiceContract = {
  enroll: vi.fn(), getEnrollment: vi.fn(), listEnrollments: vi.fn(), setStatus: vi.fn(), updateModuleProgress: vi.fn(),
};
const learnerSkillService: LearnerSkillServiceContract = { getPassport: vi.fn() };
const learningService: LearningServiceContract = { getOverview: vi.fn(), getResource: vi.fn(), recordResourceEvent: vi.fn() };
const practiceService: PracticeServiceContract = { getAttempt: vi.fn(), start: vi.fn(), submit: vi.fn() };
const prerequisiteService: PrerequisiteServiceContract = { analyze: vi.fn() };
const retentionService: RetentionServiceContract = { getOverview: vi.fn() };

function app() {
  return createApp({
    authService, catalogService, diagnosticService, enrollmentService, learnerSkillService,
    learningService, practiceService, prerequisiteService, retentionService, probeDatabase: vi.fn(),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authService.authenticateAccessToken).mockResolvedValue({
    email: "ada@example.com", roles: ["LEARNER"], userId: learnerId,
  });
});

describe("retention HTTP boundary", () => {
  it("requires authentication", async () => {
    const response = await request(app()).get("/retention");
    expect(response.status).toBe(401);
    expect(retentionService.getOverview).not.toHaveBeenCalled();
  });

  it("returns real retention states and revision eligibility", async () => {
    const overview: RetentionOverview = {
      calculatedAt: "2026-08-30T00:00:00.000Z",
      skills: [{
        anchorAt: "2026-05-01T00:00:00.000Z", calculatedAt: "2026-08-30T00:00:00.000Z",
        category: "Foundations", confidence: 0.7, courseContexts: [], daysSinceEvidence: 121,
        decayAmount: 0.45, effectiveLambda: 0.01, evidenceCount: 8, evidenceState: "ASSESSED",
        id: "30000000-0000-4000-8000-000000000001", mastery: 0.82, name: "Arrays",
        nextReviewAt: "2026-06-01T00:00:00.000Z", practiceAvailable: true,
        reasons: ["Previously demonstrated mastery has decayed."], retention: 0.37,
        revisionDue: true, slug: "arrays", state: "AT_RISK",
      }],
      summary: {
        atRiskSkills: 1, averageRetention: 0.37, criticalSkills: 0, moderateSkills: 0,
        revisionDueSkills: 1, strongSkills: 0, trackedSkills: 1, unknownSkills: 0,
      },
    };
    vi.mocked(retentionService.getOverview).mockResolvedValue(overview);
    const response = await request(app()).get("/retention").set("Authorization", "Bearer token");
    expect(response.status).toBe(200);
    expect(response.body.skills[0]).toMatchObject({ revisionDue: true, state: "AT_RISK" });
    expect(retentionService.getOverview).toHaveBeenCalledWith(learnerId);
  });
});
