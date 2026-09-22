import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import type { AuthServiceContract } from "../src/auth/types.js";
import type { CatalogServiceContract } from "../src/catalog/types.js";
import type {
  DiagnosticAttempt,
  DiagnosticOverview,
  DiagnosticServiceContract,
} from "../src/diagnostics/types.js";
import type { EnrollmentServiceContract } from "../src/enrollments/types.js";
import type { LearnerSkillServiceContract } from "../src/learner-skills/types.js";
import type { LearningServiceContract } from "../src/learning/types.js";
import type { PracticeServiceContract } from "../src/practice/types.js";
import type { PrerequisiteServiceContract } from "../src/prerequisites/types.js";
import type { RetentionServiceContract } from "../src/retention/types.js";

const learnerId = "6f48dc49-943a-4e6d-aee9-543588698108";
const goalId = "20000000-0000-4000-8000-000000000001";
const attemptId = "a1000000-0000-4000-8000-000000000001";
const questionId = "a3000000-0000-4000-8000-000000000001";
const optionId = "a4000000-0000-4000-8000-000000000001";

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
  getAttempt: vi.fn(), getOverview: vi.fn(), getResult: vi.fn(), saveDraft: vi.fn(), start: vi.fn(), submit: vi.fn(),
};
const practiceService: PracticeServiceContract = { getAttempt: vi.fn(), start: vi.fn(), submit: vi.fn() };
const prerequisiteService: PrerequisiteServiceContract = { analyze: vi.fn() };
const retentionService: RetentionServiceContract = { getOverview: vi.fn() };

function app() {
  return createApp({
    authService, catalogService, diagnosticService, enrollmentService, learnerSkillService, learningService, practiceService, prerequisiteService, retentionService, probeDatabase: vi.fn(),
  });
}

function diagnosticAttempt(): DiagnosticAttempt {
  return {
    assessmentDescription: "Find the learner's skill-specific starting point.",
    assessmentTitle: "DSA diagnostic",
    context: { enrollmentId: null, id: goalId, name: "DSA Interview Preparation", slug: "dsa-interview-preparation", type: "GOAL" },
    estimatedMinutes: 14,
    goal: { id: goalId, name: "DSA Interview Preparation", slug: "dsa-interview-preparation" },
    id: attemptId,
    questions: [],
    savedAnswers: [],
    selection: {
      answeredCount: 0, canComplete: false, currentStage: "LEGACY",
      maximumQuestionCount: 0, minimumQuestionCount: 0,
      policyVersion: "diagnostic-fixed-v1", questionBudget: 0, recognizedSkillCount: 0,
      selectedQuestionCount: 0, selectedSkillCount: 0, skippedSkillCount: 0,
      stoppingReason: null, templateQuestionCount: 0,
    },
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

describe("diagnostic HTTP boundary", () => {
  it("requires authentication before exposing assessment state", async () => {
    const response = await request(app()).get("/diagnostics/overview");

    expect(response.status).toBe(401);
    expect(diagnosticService.getOverview).not.toHaveBeenCalled();
  });

  it("returns the learner's real goal-specific diagnostic overview", async () => {
    const overview: DiagnosticOverview = {
      activeGoal: { id: goalId, name: "DSA Interview Preparation", slug: "dsa-interview-preparation" },
      context: { enrollmentId: null, id: goalId, name: "DSA Interview Preparation", slug: "dsa-interview-preparation", type: "GOAL" },
      assessment: {
        description: "Assess eight skills", estimatedMinutes: 14, id: "a0000000-0000-4000-8000-000000000001",
        questionCount: 16, skillCount: 8, title: "DSA diagnostic",
      },
      inProgressAttempt: null,
      latestAttempt: null,
    };
    vi.mocked(diagnosticService.getOverview).mockResolvedValue(overview);

    const response = await request(app()).get("/diagnostics/overview").set("Authorization", "Bearer access-token");

    expect(response.status).toBe(200);
    expect(response.body.assessment).toMatchObject({ questionCount: 16, skillCount: 8 });
    expect(diagnosticService.getOverview).toHaveBeenCalledWith(learnerId, {});
  });

  it("starts or resumes the selected goal's diagnostic", async () => {
    vi.mocked(diagnosticService.start).mockResolvedValue(diagnosticAttempt());

    const response = await request(app()).post("/diagnostics/start")
      .set("Authorization", "Bearer access-token").send({ goalId });

    expect(response.status).toBe(201);
    expect(response.body.id).toBe(attemptId);
    expect(diagnosticService.start).toHaveBeenCalledWith(learnerId, { goalId });
  });

  it("rejects malformed submissions before invoking mastery updates", async () => {
    const response = await request(app()).post(`/diagnostics/attempts/${attemptId}/submit`)
      .set("Authorization", "Bearer access-token").send({ answers: [] });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(diagnosticService.submit).not.toHaveBeenCalled();
  });

  it("autosaves uncertainty without exposing correctness", async () => {
    vi.mocked(diagnosticService.saveDraft!).mockResolvedValue({
      answeredCount: 1,
      questionCount: 8,
      savedAnswer: {
        isUnsure: true, optionId: null, questionId, responseSeconds: 12,
        savedAt: "2026-08-29T00:00:12.000Z",
      },
    });

    const response = await request(app()).put(`/diagnostics/attempts/${attemptId}/answers/${questionId}`)
      .set("Authorization", "Bearer access-token")
      .send({ isUnsure: true, optionId: null, responseSeconds: 12 });

    expect(response.status).toBe(200);
    expect(response.body).not.toHaveProperty("isCorrect");
    expect(diagnosticService.saveDraft).toHaveBeenCalledWith(learnerId, attemptId, {
      isUnsure: true, optionId: null, questionId, responseSeconds: 12,
    });
  });

  it("delegates raw question-option evidence without calculating scores in the router", async () => {
    vi.mocked(diagnosticService.submit).mockResolvedValue({
      answers: [],
      attempt: {
        contextName: "DSA Interview Preparation", contextType: "GOAL", enrollmentId: null,
        correctCount: 1, durationSeconds: 30, goalName: "DSA Interview Preparation", id: attemptId,
        overallScore: 1, questionCount: 1, startedAt: "2026-08-29T00:00:00.000Z",
        submittedAt: "2026-08-29T00:00:30.000Z", title: "DSA diagnostic",
      },
      skillResults: [], untestedSkills: [],
    });

    const response = await request(app()).post(`/diagnostics/attempts/${attemptId}/submit`)
      .set("Authorization", "Bearer access-token")
      .send({ answers: [{ optionId, questionId }], durationSeconds: 30 });

    expect(response.status).toBe(200);
    expect(diagnosticService.submit).toHaveBeenCalledWith(learnerId, attemptId, {
      answers: [{ isUnsure: false, optionId, questionId, responseSeconds: 0 }], durationSeconds: 30,
    });
  });

  it("accepts numeric zero and a distinct multi-select set without exposing answer keys", async () => {
    const numeric = await request(app()).put(`/diagnostics/attempts/${attemptId}/answers/${questionId}`)
      .set("Authorization", "Bearer access-token").send({ numericAnswer: 0 });
    expect(numeric.status).toBe(200);
    expect(diagnosticService.saveDraft).toHaveBeenLastCalledWith(learnerId, attemptId, {
      isUnsure: false, optionId: null, numericAnswer: 0, questionId, responseSeconds: 0,
    });
    const multi = await request(app()).put(`/diagnostics/attempts/${attemptId}/answers/${questionId}`)
      .set("Authorization", "Bearer access-token").send({ selectedOptionIds: [optionId, "a4000000-0000-4000-8000-000000000002"] });
    expect(multi.status).toBe(200);
    expect(diagnosticService.saveDraft).toHaveBeenLastCalledWith(learnerId, attemptId, {
      isUnsure: false, optionId: null, selectedOptionIds: [optionId, "a4000000-0000-4000-8000-000000000002"], questionId, responseSeconds: 0,
    });
  });

  it("rejects answer tampering, incompatible formats, empty or repeated options, and nonnumeric payloads", async () => {
    const payloads = [
      { optionId, isCorrect: true }, { optionId, numericAnswer: 3 },
      { selectedOptionIds: [] }, { selectedOptionIds: [optionId, optionId] },
      { numericAnswer: "3" }, { numericAnswer: null }, { numericAnswer: 3, numericTolerance: 1 },
      { isUnsure: true, numericAnswer: 0 }, { isUnsure: true, selectedOptionIds: [optionId] },
    ];
    for (const payload of payloads) {
      const response = await request(app()).put(`/diagnostics/attempts/${attemptId}/answers/${questionId}`)
        .set("Authorization", "Bearer access-token").send(payload);
      expect(response.status).toBe(400);
    }
    expect(diagnosticService.saveDraft).not.toHaveBeenCalled();
  });
});
