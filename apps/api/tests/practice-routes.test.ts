import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import type { AuthServiceContract } from "../src/auth/types.js";
import type { CatalogServiceContract } from "../src/catalog/types.js";
import type { DiagnosticServiceContract } from "../src/diagnostics/types.js";
import type { EnrollmentServiceContract } from "../src/enrollments/types.js";
import type { LearnerSkillServiceContract } from "../src/learner-skills/types.js";
import type { LearningServiceContract } from "../src/learning/types.js";
import type { PracticeAttempt, PracticeServiceContract } from "../src/practice/types.js";
import type { PrerequisiteServiceContract } from "../src/prerequisites/types.js";
import type { RetentionServiceContract } from "../src/retention/types.js";

const learnerId = "6f48dc49-943a-4e6d-aee9-543588698108";
const skillId = "30000000-0000-4000-8000-000000000001";
const enrollmentId = "71000000-0000-4000-8000-000000000001";
const attemptId = "a5000000-0000-4000-8000-000000000001";
const optionId = "a4000000-0000-4000-8000-000000000001";

const authService: AuthServiceContract = {
  authenticateAccessToken: vi.fn(), getCurrentUser: vi.fn(), login: vi.fn(),
  logout: vi.fn(), refresh: vi.fn(), register: vi.fn(),
};
const catalogService: CatalogServiceContract = {
  getGoalDetail: vi.fn(), getLearnerGoals: vi.fn(), getOverview: vi.fn(),
  removeGoal: vi.fn(), selectGoal: vi.fn(),
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
const practiceService: PracticeServiceContract = {
  getAttempt: vi.fn(), start: vi.fn(), submit: vi.fn(),
};
const prerequisiteService: PrerequisiteServiceContract = { analyze: vi.fn() };
const retentionService: RetentionServiceContract = { getOverview: vi.fn() };

function app() {
  return createApp({
    authService, catalogService, diagnosticService, enrollmentService,
    learnerSkillService, learningService, practiceService, prerequisiteService, retentionService,
    probeDatabase: vi.fn(),
  });
}

function attempt(): PracticeAttempt {
  return {
    attemptNumber: 1,
    context: {
      courseId: "40000000-0000-4000-8000-000000000001",
      courseName: "Algorithms",
      enrollmentId,
      moduleId: "50000000-0000-4000-8000-000000000001",
      moduleName: "Foundations",
    },
    id: attemptId,
    mode: "PRACTICE",
    question: {
      difficulty: 3,
      id: "a3000000-0000-4000-8000-000000000001",
      options: [{ content: "A learner-visible option", id: optionId, key: "A" }],
      prompt: "Which operation preserves the invariant?",
    },
    skill: { category: "Foundations", id: skillId, name: "Arrays", slug: "arrays" },
    startedAt: "2026-08-29T00:00:00.000Z",
    status: "IN_PROGRESS",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authService.authenticateAccessToken).mockResolvedValue({
    email: "ada@example.com", roles: ["LEARNER"], userId: learnerId,
  });
});

describe("practice HTTP boundary", () => {
  it("requires authentication before exposing a question", async () => {
    const response = await request(app()).post("/practice/start").send({ skillId });
    expect(response.status).toBe(401);
    expect(practiceService.start).not.toHaveBeenCalled();
  });

  it("starts course-scoped practice without exposing correctness", async () => {
    vi.mocked(practiceService.start).mockResolvedValue(attempt());
    const response = await request(app()).post("/practice/start")
      .set("Authorization", "Bearer access-token").send({ enrollmentId, skillId });

    expect(response.status).toBe(201);
    expect(response.body.question.options[0]).toEqual({
      content: "A learner-visible option", id: optionId, key: "A",
    });
    expect(JSON.stringify(response.body.question)).not.toContain("isCorrect");
    expect(practiceService.start).toHaveBeenCalledWith(learnerId, { enrollmentId, skillId });
  });

  it("starts a retention check through the same validated question boundary", async () => {
    vi.mocked(practiceService.start).mockResolvedValue({ ...attempt(), mode: "RETENTION_CHECK" });
    const response = await request(app()).post("/practice/start")
      .set("Authorization", "Bearer access-token")
      .send({ enrollmentId, mode: "RETENTION_CHECK", skillId });

    expect(response.status).toBe(201);
    expect(response.body.mode).toBe("RETENTION_CHECK");
    expect(practiceService.start).toHaveBeenCalledWith(
      learnerId,
      { enrollmentId, mode: "RETENTION_CHECK", skillId },
    );
  });

  it("starts a separately scored post-lesson assessment", async () => {
    vi.mocked(practiceService.start).mockResolvedValue({ ...attempt(), mode: "ASSESSMENT" });
    const response = await request(app()).post("/practice/start")
      .set("Authorization", "Bearer access-token")
      .send({ enrollmentId, mode: "ASSESSMENT", skillId });

    expect(response.status).toBe(201);
    expect(response.body.mode).toBe("ASSESSMENT");
    expect(practiceService.start).toHaveBeenCalledWith(
      learnerId,
      { enrollmentId, mode: "ASSESSMENT", skillId },
    );
  });

  it("rejects malformed answers before invoking the evidence engine", async () => {
    const response = await request(app()).post(`/practice/attempts/${attemptId}/submit`)
      .set("Authorization", "Bearer access-token")
      .send({ durationSeconds: -1, hintsUsed: 0, optionId: "invalid" });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(practiceService.submit).not.toHaveBeenCalled();
  });

  it("delegates the selected option to server-side scoring", async () => {
    vi.mocked(practiceService.submit).mockResolvedValue({
      attempt: { attemptNumber: 1, durationSeconds: 42, id: attemptId, submittedAt: "2026-08-29T00:00:42.000Z" },
      evidence: {
        confidenceAfter: 0.32, confidenceBefore: null, evidenceCount: 1,
        evidenceStateAfter: "ESTIMATED", evidenceStateBefore: "UNKNOWN",
        masteryAfter: 0.9, masteryBefore: null,
        retentionAfter: 0.9, retentionBefore: null,
        retentionStateAfter: "STRONG", retentionStateBefore: "UNKNOWN",
      },
      feedback: {
        correctOptionContent: "A learner-visible option", explanation: "It preserves the invariant.",
        isCorrect: true, score: 0.9, selectedOptionContent: "A learner-visible option",
      },
      skill: { id: skillId, name: "Arrays" },
    });
    const input = { durationSeconds: 42, hintsUsed: 0, optionId };
    const response = await request(app()).post(`/practice/attempts/${attemptId}/submit`)
      .set("Authorization", "Bearer access-token").send(input);

    expect(response.status).toBe(200);
    expect(response.body.evidence).toMatchObject({ evidenceStateAfter: "ESTIMATED", masteryAfter: 0.9 });
    expect(practiceService.submit).toHaveBeenCalledWith(learnerId, attemptId, input);
  });
});
