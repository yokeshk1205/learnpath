import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import type { AuthServiceContract } from "../src/auth/types.js";
import type { CatalogServiceContract } from "../src/catalog/types.js";
import type { EnrollmentServiceContract } from "../src/enrollments/types.js";
import type { LearnerSkillServiceContract, SkillPassport } from "../src/learner-skills/types.js";
import type { LearningServiceContract } from "../src/learning/types.js";
import type { DiagnosticServiceContract } from "../src/diagnostics/types.js";
import type { PracticeServiceContract } from "../src/practice/types.js";
import type { PrerequisiteServiceContract } from "../src/prerequisites/types.js";
import type { RetentionServiceContract } from "../src/retention/types.js";

const learnerId = "6f48dc49-943a-4e6d-aee9-543588698108";
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

function app() {
  return createApp({
    authService, catalogService, diagnosticService, enrollmentService, learnerSkillService, learningService, practiceService, prerequisiteService, retentionService, probeDatabase: vi.fn(),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authService.authenticateAccessToken).mockResolvedValue({
    email: "ada@example.com", roles: ["LEARNER"], userId: learnerId,
  });
});

describe("global learner skill HTTP boundary", () => {
  it("requires authentication", async () => {
    const response = await request(app()).get("/learner-skills");
    expect(response.status).toBe(401);
    expect(learnerSkillService.getPassport).not.toHaveBeenCalled();
  });

  it("returns nullable evidence without inventing scores", async () => {
    const passport: SkillPassport = {
      skills: [{
        attemptCount: 0, category: "Foundations", confidence: null, correctAttempts: 0,
        courseContexts: [], description: "Array fundamentals", difficulty: 1,
        domainName: "Data Structures & Algorithms", evidenceCount: 0,
        evidenceState: "UNKNOWN", evidenceStatus: "UNASSESSED",
        goalContexts: [], id: "30000000-0000-4000-8000-000000000001",
        incorrectAttempts: 0, lastAssessedAt: null, lastPracticedAt: null,
        mastery: null, name: "Arrays", practiceAvailable: false, retention: null,
        retentionAnchorAt: null, retentionCalculatedAt: null, retentionState: "UNKNOWN", revisionDue: false, slug: "arrays",
        totalTimeSpentSeconds: 0, updatedAt: "2026-08-29T00:00:00.000Z",
      }],
      summary: {
        assessedSkills: 0, assessedStateSkills: 0, averageConfidence: null, averageMastery: null,
        averageRetention: null, evidenceCoverage: 0, sharedAcrossCourses: 0,
        estimatedSkills: 0, totalAttempts: 0, trackedSkills: 1, unassessedSkills: 1, verifiedSkills: 0,
        atRiskSkills: 0, criticalSkills: 0, revisionDueSkills: 0, strongRetentionSkills: 0,
      },
    };
    vi.mocked(learnerSkillService.getPassport).mockResolvedValue(passport);

    const response = await request(app())
      .get("/learner-skills")
      .set("Authorization", "Bearer access-token");

    expect(response.status).toBe(200);
    expect(response.body.skills[0]).toMatchObject({
      evidenceStatus: "UNASSESSED", mastery: null, confidence: null, retention: null,
    });
    expect(learnerSkillService.getPassport).toHaveBeenCalledWith(learnerId);
  });
});
