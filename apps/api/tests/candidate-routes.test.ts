import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import type { AuthServiceContract } from "../src/auth/types.js";
import type { CandidateOverview, CandidateServiceContract } from "../src/candidates/types.js";
import type { CatalogServiceContract } from "../src/catalog/types.js";
import type { DiagnosticServiceContract } from "../src/diagnostics/types.js";
import type { EnrollmentServiceContract } from "../src/enrollments/types.js";
import type { LearnerSkillServiceContract } from "../src/learner-skills/types.js";
import type { LearningServiceContract } from "../src/learning/types.js";
import type { PracticeServiceContract } from "../src/practice/types.js";
import type { PrerequisiteServiceContract } from "../src/prerequisites/types.js";
import type { RetentionServiceContract } from "../src/retention/types.js";

const learnerId = "6f48dc49-943a-4e6d-aee9-543588698108";
const enrollmentId = "7f48dc49-943a-4e6d-aee9-543588698109";
const authService: AuthServiceContract = {
  authenticateAccessToken: vi.fn(), getCurrentUser: vi.fn(), login: vi.fn(),
  logout: vi.fn(), refresh: vi.fn(), register: vi.fn(),
};
const candidateService: CandidateServiceContract = { generate: vi.fn() };
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
    authService, candidateService, catalogService, diagnosticService, enrollmentService,
    learnerSkillService, learningService, practiceService, prerequisiteService,
    retentionService, probeDatabase: vi.fn(),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authService.authenticateAccessToken).mockResolvedValue({
    email: "ada@example.com", roles: ["LEARNER"], userId: learnerId,
  });
});

describe("candidate HTTP boundary", () => {
  it("requires authentication", async () => {
    const response = await request(app()).get(`/enrollments/${enrollmentId}/candidates`);
    expect(response.status).toBe(401);
    expect(candidateService.generate).not.toHaveBeenCalled();
  });

  it("validates the course enrollment identifier", async () => {
    const response = await request(app())
      .get("/enrollments/not-a-uuid/candidates")
      .set("Authorization", "Bearer token");
    expect(response.status).toBe(400);
    expect(candidateService.generate).not.toHaveBeenCalled();
  });

  it("returns the dependency-valid candidate pool", async () => {
    const overview = {
      candidates: { eligible: [{ id: "skill", status: "ELIGIBLE" }], excluded: [], locked: [] },
      context: { enrollmentId },
      policyVersion: "candidate-v1",
      summary: { eligibleSkills: 1, lockedSkills: 0 },
    } as unknown as CandidateOverview;
    vi.mocked(candidateService.generate).mockResolvedValue(overview);
    const response = await request(app())
      .get(`/enrollments/${enrollmentId}/candidates`)
      .set("Authorization", "Bearer token");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ policyVersion: "candidate-v1" });
    expect(candidateService.generate).toHaveBeenCalledWith(learnerId, enrollmentId);
  });
});

