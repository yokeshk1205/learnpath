import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import type { AuthServiceContract } from "../src/auth/types.js";
import type { CatalogOverview, CatalogServiceContract } from "../src/catalog/types.js";
import type { EnrollmentServiceContract } from "../src/enrollments/types.js";
import type { DiagnosticServiceContract } from "../src/diagnostics/types.js";
import type { LearnerSkillServiceContract } from "../src/learner-skills/types.js";
import type { LearningServiceContract } from "../src/learning/types.js";
import type { PracticeServiceContract } from "../src/practice/types.js";
import type { PrerequisiteServiceContract } from "../src/prerequisites/types.js";
import type { RetentionServiceContract } from "../src/retention/types.js";

const learnerId = "6f48dc49-943a-4e6d-aee9-543588698108";
const goalId = "20000000-0000-4000-8000-000000000001";
const authService: AuthServiceContract = {
  authenticateAccessToken: vi.fn(),
  getCurrentUser: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  refresh: vi.fn(),
  register: vi.fn(),
};
const catalogService: CatalogServiceContract = {
  getGoalDetail: vi.fn(),
  getLearnerGoals: vi.fn(),
  getOverview: vi.fn(),
  removeGoal: vi.fn(),
  selectGoal: vi.fn(),
};
const enrollmentService: EnrollmentServiceContract = {
  enroll: vi.fn(),
  getEnrollment: vi.fn(),
  listEnrollments: vi.fn(),
  setStatus: vi.fn(),
  updateModuleProgress: vi.fn(),
};
const learnerSkillService: LearnerSkillServiceContract = { getPassport: vi.fn() };
const learningService: LearningServiceContract = {
  getOverview: vi.fn(), getResource: vi.fn(), recordResourceEvent: vi.fn(),
};
const diagnosticService: DiagnosticServiceContract = {
  getAttempt: vi.fn(), getOverview: vi.fn(), getResult: vi.fn(), start: vi.fn(), submit: vi.fn(),
};
const practiceService: PracticeServiceContract = { getAttempt: vi.fn(), start: vi.fn(), submit: vi.fn() };
const prerequisiteService: PrerequisiteServiceContract = { analyze: vi.fn() };
const retentionService: RetentionServiceContract = { getOverview: vi.fn() };

function app() {
  return createApp({ authService, catalogService, diagnosticService, enrollmentService, learnerSkillService, learningService, practiceService, prerequisiteService, retentionService, probeDatabase: vi.fn() });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authService.authenticateAccessToken).mockResolvedValue({
    email: "ada@example.com",
    roles: ["LEARNER"],
    userId: learnerId,
  });
});

describe("curriculum catalog HTTP boundary", () => {
  it("requires authentication for the curriculum overview", async () => {
    const response = await request(app()).get("/catalog/overview");
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
    expect(catalogService.getOverview).not.toHaveBeenCalled();
  });

  it("returns the learner-specific catalog overview", async () => {
    const overview: CatalogOverview = {
      courses: [],
      domains: [],
      goals: [],
      learnerGoals: [],
      stats: { categories: 8, courses: 4, domains: 1, prerequisiteEdges: 86, skills: 36 },
    };
    vi.mocked(catalogService.getOverview).mockResolvedValue(overview);
    const response = await request(app())
      .get("/catalog/overview")
      .set("Authorization", "Bearer access-token");
    expect(response.status).toBe(200);
    expect(response.body.stats).toEqual(overview.stats);
    expect(catalogService.getOverview).toHaveBeenCalledWith(learnerId);
  });

  it("validates goal selection and delegates it to the learner model", async () => {
    vi.mocked(catalogService.selectGoal).mockResolvedValue({
      estimatedWeeks: 12,
      goalId,
      id: "70000000-0000-4000-8000-000000000001",
      level: "INTERMEDIATE",
      name: "DSA Interview Preparation",
      outcome: "Prepare for interviews",
      priority: 1,
      selectedAt: "2026-08-28T00:00:00.000Z",
      slug: "dsa-interview-preparation",
      status: "ACTIVE",
      targetDate: null,
    });
    const response = await request(app())
      .post("/catalog/learner-goals")
      .set("Authorization", "Bearer access-token")
      .send({ goalId, priority: 1 });
    expect(response.status).toBe(201);
    expect(response.body.goal.goalId).toBe(goalId);
    expect(catalogService.selectGoal).toHaveBeenCalledWith(learnerId, {
      goalId,
      priority: 1,
    });
  });

  it("rejects malformed goal identifiers before querying the service", async () => {
    const response = await request(app())
      .get("/catalog/goals/not-a-uuid")
      .set("Authorization", "Bearer access-token");
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("removes an optional goal without deleting learner history", async () => {
    vi.mocked(catalogService.removeGoal).mockResolvedValue({
      estimatedWeeks: 12,
      goalId,
      id: "70000000-0000-4000-8000-000000000001",
      level: "INTERMEDIATE",
      name: "DSA Interview Preparation",
      outcome: "Prepare for interviews",
      priority: 1,
      selectedAt: "2026-08-28T00:00:00.000Z",
      slug: "dsa-interview-preparation",
      status: "DROPPED",
      targetDate: null,
    });
    const response = await request(app())
      .delete(`/catalog/learner-goals/${goalId}`)
      .set("Authorization", "Bearer access-token");
    expect(response.status).toBe(200);
    expect(response.body.goal).toMatchObject({ goalId, status: "DROPPED" });
    expect(catalogService.removeGoal).toHaveBeenCalledWith(learnerId, goalId);
  });
});
