import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import type { AuthServiceContract } from "../src/auth/types.js";
import type { CatalogServiceContract } from "../src/catalog/types.js";
import type { DiagnosticServiceContract } from "../src/diagnostics/types.js";
import type { EnrollmentServiceContract } from "../src/enrollments/types.js";
import type { LearnerSkillServiceContract } from "../src/learner-skills/types.js";
import type { LearningServiceContract } from "../src/learning/types.js";
import type {
  GoalPrerequisiteAnalysis,
  PrerequisiteServiceContract,
} from "../src/prerequisites/types.js";
import type { PracticeServiceContract } from "../src/practice/types.js";
import type { RetentionServiceContract } from "../src/retention/types.js";

const learnerId = "6f48dc49-943a-4e6d-aee9-543588698108";
const goalId = "20000000-0000-4000-8000-000000000001";
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
  enroll: vi.fn(), getEnrollment: vi.fn(), listEnrollments: vi.fn(),
  setStatus: vi.fn(), updateModuleProgress: vi.fn(),
};
const learnerSkillService: LearnerSkillServiceContract = { getPassport: vi.fn() };
const learningService: LearningServiceContract = {
  getOverview: vi.fn(), getResource: vi.fn(), recordResourceEvent: vi.fn(),
};
const practiceService: PracticeServiceContract = { getAttempt: vi.fn(), start: vi.fn(), submit: vi.fn() };
const prerequisiteService: PrerequisiteServiceContract = { analyze: vi.fn() };
const retentionService: RetentionServiceContract = { getOverview: vi.fn() };

function app() {
  return createApp({
    authService, catalogService, diagnosticService, enrollmentService,
    learnerSkillService, learningService, practiceService, prerequisiteService, retentionService, probeDatabase: vi.fn(),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authService.authenticateAccessToken).mockResolvedValue({
    email: "ada@example.com", roles: ["LEARNER"], userId: learnerId,
  });
});

describe("prerequisite analysis HTTP boundary", () => {
  it("requires authentication", async () => {
    const response = await request(app()).get("/prerequisites/analysis");

    expect(response.status).toBe(401);
    expect(prerequisiteService.analyze).not.toHaveBeenCalled();
  });

  it("returns structured learner-specific graph analysis", async () => {
    const analysis: GoalPrerequisiteAnalysis = {
      analyzedAt: "2026-08-29T00:00:00.000Z",
      context: { enrollmentId: null, id: goalId, name: "DSA", outcome: "Solve problems", slug: "dsa", type: "GOAL" },
      goal: { id: goalId, name: "DSA", outcome: "Solve problems", slug: "dsa" },
      skills: [],
      summary: {
        evidenceCoverage: 0.5, contextReadiness: 0.4, contextSkills: 8,
        courseReadiness: null, courseSkills: null, goalReadiness: 0.4, goalSkills: 8, lockedSkills: 3,
        masteredSkills: 2, prerequisiteCoverage: 0.6, requiredEdges: 10,
        satisfiedRequiredEdges: 6, supportingSkills: 4, unlockedSkills: 3,
      },
      validOrder: [],
    };
    vi.mocked(prerequisiteService.analyze).mockResolvedValue(analysis);

    const response = await request(app()).get(`/prerequisites/analysis?goalId=${goalId}`)
      .set("Authorization", "Bearer access-token");

    expect(response.status).toBe(200);
    expect(response.body.summary).toMatchObject({ goalReadiness: 0.4, lockedSkills: 3 });
    expect(prerequisiteService.analyze).toHaveBeenCalledWith(learnerId, { goalId });
  });

  it("rejects malformed goal identifiers", async () => {
    const response = await request(app()).get("/prerequisites/analysis?goalId=invalid")
      .set("Authorization", "Bearer access-token");

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(prerequisiteService.analyze).not.toHaveBeenCalled();
  });
});
