import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import type { AuthServiceContract } from "../src/auth/types.js";
import type { CatalogServiceContract } from "../src/catalog/types.js";
import type { EnrollmentServiceContract, EnrollmentSummary } from "../src/enrollments/types.js";
import type { LearnerSkillServiceContract } from "../src/learner-skills/types.js";
import type { LearningServiceContract } from "../src/learning/types.js";
import type { DiagnosticServiceContract } from "../src/diagnostics/types.js";
import type { PracticeServiceContract } from "../src/practice/types.js";
import type { PrerequisiteServiceContract } from "../src/prerequisites/types.js";
import type { RetentionServiceContract } from "../src/retention/types.js";

const learnerId = "6f48dc49-943a-4e6d-aee9-543588698108";
const enrollmentId = "71000000-0000-4000-8000-000000000001";
const courseId = "40000000-0000-4000-8000-000000000001";
const moduleId = "50000000-0000-4000-8000-000000000001";
const authService: AuthServiceContract = {
  authenticateAccessToken: vi.fn(), getCurrentUser: vi.fn(), login: vi.fn(),
  logout: vi.fn(), refresh: vi.fn(), register: vi.fn(),
};
const catalogService: CatalogServiceContract = {
  getGoalDetail: vi.fn(), getLearnerGoals: vi.fn(), getOverview: vi.fn(), removeGoal: vi.fn(), selectGoal: vi.fn(),
};
const enrollmentService: EnrollmentServiceContract = {
  enroll: vi.fn(), getEnrollment: vi.fn(), listEnrollments: vi.fn(),
  setStatus: vi.fn(), updateModuleProgress: vi.fn(),
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

const summary: EnrollmentSummary = {
  completedModules: 0,
  courseDescription: "Course description",
  courseId,
  courseLevel: "BEGINNER",
  courseName: "Programming Fundamentals",
  courseSlug: "programming-fundamentals",
  enrolledAt: "2026-08-29T00:00:00.000Z",
  id: enrollmentId,
  lastAccessedAt: "2026-08-29T00:00:00.000Z",
  learningGoalId: null,
  learningGoalName: null,
  progressPercentage: 0,
  status: "ACTIVE",
  totalModules: 3,
};

function app() {
  return createApp({ authService, catalogService, diagnosticService, enrollmentService, learnerSkillService, learningService, practiceService, prerequisiteService, retentionService, probeDatabase: vi.fn() });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authService.authenticateAccessToken).mockResolvedValue({
    email: "ada@example.com", roles: ["LEARNER"], userId: learnerId,
  });
});

describe("course enrollment HTTP boundary", () => {
  it("requires authentication", async () => {
    const response = await request(app()).get("/enrollments");
    expect(response.status).toBe(401);
    expect(enrollmentService.listEnrollments).not.toHaveBeenCalled();
  });

  it("returns independent learner enrollments", async () => {
    vi.mocked(enrollmentService.listEnrollments).mockResolvedValue([summary]);
    const response = await request(app())
      .get("/enrollments")
      .set("Authorization", "Bearer access-token");
    expect(response.status).toBe(200);
    expect(response.body.enrollments[0]).toMatchObject({ courseId, progressPercentage: 0 });
    expect(enrollmentService.listEnrollments).toHaveBeenCalledWith(learnerId);
  });

  it("validates and creates an enrollment", async () => {
    vi.mocked(enrollmentService.enroll).mockResolvedValue({
      enrollment: summary, modules: [], skills: [],
    });
    const response = await request(app())
      .post("/enrollments")
      .set("Authorization", "Bearer access-token")
      .send({ courseId });
    expect(response.status).toBe(201);
    expect(response.body.enrollment.id).toBe(enrollmentId);
    expect(enrollmentService.enroll).toHaveBeenCalledWith(learnerId, { courseId });
  });

  it("rejects malformed enrollment input", async () => {
    const response = await request(app())
      .post("/enrollments")
      .set("Authorization", "Bearer access-token")
      .send({ courseId: "invalid" });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("updates module progress through the learner-owned enrollment", async () => {
    vi.mocked(enrollmentService.updateModuleProgress).mockResolvedValue({
      enrollment: { ...summary, completedModules: 1, progressPercentage: 33.33 },
      modules: [], skills: [],
    });
    const response = await request(app())
      .post(`/enrollments/${enrollmentId}/modules/${moduleId}/progress`)
      .set("Authorization", "Bearer access-token")
      .send({ status: "COMPLETED" });
    expect(response.status).toBe(200);
    expect(response.body.enrollment.progressPercentage).toBe(33.33);
    expect(enrollmentService.updateModuleProgress).toHaveBeenCalledWith(
      learnerId, enrollmentId, moduleId, "COMPLETED",
    );
  });
});
