import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import type { AuthServiceContract } from "../src/auth/types.js";
import type { CatalogServiceContract } from "../src/catalog/types.js";
import type { DiagnosticServiceContract } from "../src/diagnostics/types.js";
import type { EnrollmentServiceContract } from "../src/enrollments/types.js";
import type { LearnerSkillServiceContract } from "../src/learner-skills/types.js";
import type {
  LearningOverview,
  LearningResourceDetail,
  LearningServiceContract,
} from "../src/learning/types.js";
import type { PracticeServiceContract } from "../src/practice/types.js";
import type { PrerequisiteServiceContract } from "../src/prerequisites/types.js";
import type { RetentionServiceContract } from "../src/retention/types.js";

const learnerId = "6f48dc49-943a-4e6d-aee9-543588698108";
const resourceId = "91000000-0000-4000-8000-000000000001";
const skillId = "30000000-0000-4000-8000-000000000005";
const courseId = "40000000-0000-4000-8000-000000000001";
const moduleId = "50000000-0000-4000-8000-000000000001";

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

function resource(): LearningResourceDetail {
  return {
    contentSections: [{ body: "Trace a small example.", heading: "Mental model" }],
    contexts: [{
      courseId, courseName: "Programming Fundamentals", isEnrolled: true,
      moduleId, moduleName: "Collections",
    }],
    difficulty: 1,
    estimatedMinutes: 20,
    externalUrl: null,
    id: resourceId,
    learningObjectives: ["Explain arrays"],
    mastery: 0.4,
    progress: null,
    resourceType: "CONCEPT_GUIDE",
    skillCategory: "Arrays & Strings",
    skillId,
    skillName: "Arrays",
    slug: "arrays-concept-guide",
    summary: "Build an arrays mental model.",
    title: "Arrays Visual Primer",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authService.authenticateAccessToken).mockResolvedValue({
    email: "ada@example.com", roles: ["LEARNER"], userId: learnerId,
  });
});

describe("learning resource and activity HTTP boundary", () => {
  it("requires authentication", async () => {
    const response = await request(app()).get("/learning/overview");

    expect(response.status).toBe(401);
    expect(learningService.getOverview).not.toHaveBeenCalled();
  });

  it("returns the real resource library using validated context filters", async () => {
    const overview: LearningOverview = {
      activity: [],
      generatedAt: "2026-08-29T00:00:00.000Z",
      resources: [resource()],
      summary: {
        availableResources: 1, completedResources: 0, eventsRecorded: 0,
        skillsCovered: 1, startedResources: 0, totalTimeSpentSeconds: 0,
      },
    };
    vi.mocked(learningService.getOverview).mockResolvedValue(overview);

    const response = await request(app())
      .get(`/learning/overview?courseId=${courseId}&moduleId=${moduleId}`)
      .set("Authorization", "Bearer access-token");

    expect(response.status).toBe(200);
    expect(response.body.summary).toMatchObject({ availableResources: 1, skillsCovered: 1 });
    expect(learningService.getOverview).toHaveBeenCalledWith(learnerId, { courseId, moduleId });
  });

  it("loads one learner-visible resource", async () => {
    vi.mocked(learningService.getResource).mockResolvedValue(resource());

    const response = await request(app()).get(`/learning/resources/${resourceId}`)
      .set("Authorization", "Bearer access-token");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: resourceId, skillName: "Arrays" });
    expect(learningService.getResource).toHaveBeenCalledWith(learnerId, resourceId);
  });

  it("records only validated resource lifecycle events", async () => {
    vi.mocked(learningService.recordResourceEvent).mockResolvedValue({
      event: {
        courseId, courseName: "Programming Fundamentals", durationSeconds: 42,
        eventType: "RESOURCE_COMPLETED", id: "92000000-0000-4000-8000-000000000001",
        metadata: {}, moduleId, moduleName: "Collections",
        occurredAt: "2026-08-29T00:00:00.000Z", resourceId,
        resourceTitle: "Arrays Visual Primer", result: {}, skillId, skillName: "Arrays",
      },
      resource: resource(),
    });

    const response = await request(app()).post(`/learning/resources/${resourceId}/events`)
      .set("Authorization", "Bearer access-token")
      .send({ courseId, durationSeconds: 42, eventType: "RESOURCE_COMPLETED", moduleId });

    expect(response.status).toBe(201);
    expect(response.body.event).toMatchObject({ eventType: "RESOURCE_COMPLETED", durationSeconds: 42 });
    expect(learningService.recordResourceEvent).toHaveBeenCalledWith(
      learnerId, resourceId,
      { courseId, durationSeconds: 42, eventType: "RESOURCE_COMPLETED", moduleId },
    );
  });

  it("rejects malformed identifiers and impossible module-only contexts", async () => {
    const malformed = await request(app()).get("/learning/overview?skillId=invalid")
      .set("Authorization", "Bearer access-token");
    const context = await request(app()).post(`/learning/resources/${resourceId}/events`)
      .set("Authorization", "Bearer access-token")
      .send({ eventType: "RESOURCE_STARTED", moduleId });

    expect(malformed.status).toBe(400);
    expect(context.status).toBe(400);
    expect(learningService.getOverview).not.toHaveBeenCalled();
    expect(learningService.recordResourceEvent).not.toHaveBeenCalled();
  });
});
