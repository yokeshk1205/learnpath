import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import type { AuthServiceContract } from "../src/auth/types.js";
import type { CatalogServiceContract } from "../src/catalog/types.js";
import type { EnrollmentServiceContract } from "../src/enrollments/types.js";
import type { DiagnosticServiceContract } from "../src/diagnostics/types.js";
import type { LearnerSkillServiceContract } from "../src/learner-skills/types.js";
import type { LearningServiceContract } from "../src/learning/types.js";
import type { PracticeServiceContract } from "../src/practice/types.js";
import type { PrerequisiteServiceContract } from "../src/prerequisites/types.js";
import type { RetentionServiceContract } from "../src/retention/types.js";

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

describe("LearnPath API foundation", () => {
  it("reports the Phase 19 recommendation evaluation capability", async () => {
    const app = createApp({ authService, catalogService, diagnosticService, enrollmentService, learnerSkillService, learningService, practiceService, prerequisiteService, retentionService, probeDatabase: vi.fn() });
    const response = await request(app).get("/");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      name: "LearnPath API",
      phase: 20,
      status: "sample_gated_model_governance",
      version: "0.20.0",
    });
  });

  it("reports liveness without requiring dependencies", async () => {
    const app = createApp({ authService, catalogService, diagnosticService, enrollmentService, learnerSkillService, learningService, practiceService, prerequisiteService, retentionService, probeDatabase: vi.fn() });
    const response = await request(app).get("/health/live");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ service: "learnpath-api", status: "ok" });
  });

  it("reports readiness when PostgreSQL is reachable", async () => {
    const probeDatabase = vi.fn().mockResolvedValue(undefined);
    const app = createApp({ authService, catalogService, diagnosticService, enrollmentService, learnerSkillService, learningService, practiceService, prerequisiteService, retentionService, probeDatabase });
    const response = await request(app).get("/health/ready");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      components: { database: "up" },
      status: "ready",
    });
    expect(probeDatabase).toHaveBeenCalledOnce();
  });

  it("returns 503 instead of hiding a PostgreSQL failure", async () => {
    const probeDatabase = vi.fn().mockRejectedValue(new Error("connection refused"));
    const app = createApp({ authService, catalogService, diagnosticService, enrollmentService, learnerSkillService, learningService, practiceService, prerequisiteService, retentionService, probeDatabase });
    const response = await request(app).get("/health/ready");

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      components: { database: "down" },
      status: "not_ready",
    });
  });

  it("returns a structured 404", async () => {
    const app = createApp({ authService, catalogService, diagnosticService, enrollmentService, learnerSkillService, learningService, practiceService, prerequisiteService, retentionService, probeDatabase: vi.fn() });
    const response = await request(app).get("/does-not-exist");

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
  });
});
