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
import type { RecommendationServiceContract } from "../src/recommendations/types.js";
import type { RetentionServiceContract } from "../src/retention/types.js";

const learnerId = "6f48dc49-943a-4e6d-aee9-543588698108";
const pathId = "7f48dc49-943a-4e6d-aee9-543588698109";
const authService = { authenticateAccessToken: vi.fn(), getCurrentUser: vi.fn(), login: vi.fn(), logout: vi.fn(), refresh: vi.fn(), register: vi.fn() } as AuthServiceContract;
const recommendationService = { evaluate: vi.fn(), getFeedback: vi.fn(), respond: vi.fn() } as RecommendationServiceContract;
const catalogService = { getGoalDetail: vi.fn(), getLearnerGoals: vi.fn(), getOverview: vi.fn(), removeGoal: vi.fn(), selectGoal: vi.fn() } as CatalogServiceContract;
const diagnosticService = { getAttempt: vi.fn(), getOverview: vi.fn(), getResult: vi.fn(), start: vi.fn(), submit: vi.fn() } as DiagnosticServiceContract;
const enrollmentService = { enroll: vi.fn(), getEnrollment: vi.fn(), listEnrollments: vi.fn(), setStatus: vi.fn(), updateModuleProgress: vi.fn() } as EnrollmentServiceContract;
const learnerSkillService = { getPassport: vi.fn() } as LearnerSkillServiceContract;
const learningService = { getOverview: vi.fn(), getResource: vi.fn(), recordResourceEvent: vi.fn() } as LearningServiceContract;
const practiceService = { getAttempt: vi.fn(), start: vi.fn(), submit: vi.fn() } as PracticeServiceContract;
const prerequisiteService = { analyze: vi.fn() } as PrerequisiteServiceContract;
const retentionService = { getOverview: vi.fn() } as RetentionServiceContract;

function app() {
  return createApp({ authService, catalogService, diagnosticService, enrollmentService, learnerSkillService, learningService, practiceService, prerequisiteService, recommendationService, retentionService, probeDatabase: vi.fn() });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authService.authenticateAccessToken).mockResolvedValue({ email: "ada@example.com", roles: ["LEARNER"], userId: learnerId });
});

describe("recommendation feedback HTTP boundary", () => {
  it("records a structured response against the exact path", async () => {
    vi.mocked(recommendationService.respond).mockResolvedValue({
      created: true,
      feedback: { id: "feedback", decision: "REJECTED", reasonCode: "ALREADY_KNOW", pathId } as never,
    });
    const response = await request(app()).post(`/recommendations/paths/${pathId}/feedback`)
      .set("Authorization", "Bearer token")
      .send({ decision: "REJECTED", reasonCode: "ALREADY_KNOW" });
    expect(response.status).toBe(201);
    expect(response.body.feedback.reasonCode).toBe("ALREADY_KNOW");
    expect(recommendationService.respond).toHaveBeenCalledWith(
      learnerId, pathId, { decision: "REJECTED", reasonCode: "ALREADY_KNOW" },
    );
  });

  it("requires a reason for rejection", async () => {
    const response = await request(app()).post(`/recommendations/paths/${pathId}/feedback`)
      .set("Authorization", "Bearer token")
      .send({ decision: "REJECTED" });
    expect(response.status).toBe(400);
    expect(recommendationService.respond).not.toHaveBeenCalled();
  });

  it("returns learner-scoped longitudinal evaluation", async () => {
    vi.mocked(recommendationService.evaluate).mockResolvedValue({
      summary: { shown: 3, responded: 2, accepted: 1 },
    } as never);
    const response = await request(app()).get("/recommendations/evaluation")
      .set("Authorization", "Bearer token");
    expect(response.status).toBe(200);
    expect(response.body.summary.shown).toBe(3);
    expect(recommendationService.evaluate).toHaveBeenCalledWith(learnerId);
  });
});
