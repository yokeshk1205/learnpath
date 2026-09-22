import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import type { AuthServiceContract } from "../src/auth/types.js";
import type { CatalogServiceContract } from "../src/catalog/types.js";
import type { DiagnosticServiceContract } from "../src/diagnostics/types.js";
import type { EnrollmentServiceContract } from "../src/enrollments/types.js";
import type { LearnerSkillServiceContract } from "../src/learner-skills/types.js";
import type { LearningServiceContract } from "../src/learning/types.js";
import type { PathServiceContract, PersonalizedPath } from "../src/paths/types.js";
import type { PracticeServiceContract } from "../src/practice/types.js";
import type { PrerequisiteServiceContract } from "../src/prerequisites/types.js";
import type { RetentionServiceContract } from "../src/retention/types.js";

const learnerId = "6f48dc49-943a-4e6d-aee9-543588698108";
const enrollmentId = "7f48dc49-943a-4e6d-aee9-543588698109";
const authService: AuthServiceContract = { authenticateAccessToken: vi.fn(), getCurrentUser: vi.fn(), login: vi.fn(), logout: vi.fn(), refresh: vi.fn(), register: vi.fn() };
const catalogService = { getGoalDetail: vi.fn(), getLearnerGoals: vi.fn(), getOverview: vi.fn(), removeGoal: vi.fn(), selectGoal: vi.fn() } as CatalogServiceContract;
const diagnosticService = { getAttempt: vi.fn(), getOverview: vi.fn(), getResult: vi.fn(), start: vi.fn(), submit: vi.fn() } as DiagnosticServiceContract;
const enrollmentService = { enroll: vi.fn(), getEnrollment: vi.fn(), listEnrollments: vi.fn(), setStatus: vi.fn(), updateModuleProgress: vi.fn() } as EnrollmentServiceContract;
const learnerSkillService = { getPassport: vi.fn() } as LearnerSkillServiceContract;
const learningService = { getOverview: vi.fn(), getResource: vi.fn(), recordResourceEvent: vi.fn() } as LearningServiceContract;
const pathService: PathServiceContract = { coordinate: vi.fn(), generate: vi.fn(), get: vi.fn(), history: vi.fn(), regenerate: vi.fn() };
const practiceService = { getAttempt: vi.fn(), start: vi.fn(), submit: vi.fn() } as PracticeServiceContract;
const prerequisiteService = { analyze: vi.fn() } as PrerequisiteServiceContract;
const retentionService = { getOverview: vi.fn() } as RetentionServiceContract;

function app() {
  return createApp({ authService, catalogService, diagnosticService, enrollmentService, learnerSkillService, learningService, pathService, practiceService, prerequisiteService, retentionService, probeDatabase: vi.fn() });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authService.authenticateAccessToken).mockResolvedValue({ email: "ada@example.com", roles: ["LEARNER"], userId: learnerId });
});

describe("personalized path HTTP boundary", () => {
  it("returns the coordinated recommendation across course-owned paths", async () => {
    vi.mocked(pathService.coordinate).mockResolvedValue({
      generatedPaths: 0,
      regeneratedPaths: 0,
      plan: {
        activeGoal: null,
        courses: [],
        generatedAt: "2026-08-31T00:00:00.000Z",
        learnNext: null,
        policyVersion: "cross-course-coordination-v1",
        summary: {
          activeCourses: 0, coordinatedCourses: 0, coursesWithoutPaths: 0,
          goalAlignedCandidates: 0, sharedSkillContexts: 0,
        },
      },
    });
    const response = await request(app()).get("/enrollments/paths/coordination")
      .set("Authorization", "Bearer token");
    expect(response.status).toBe(200);
    expect(response.body.policyVersion).toBe("cross-course-coordination-v1");
    expect(pathService.coordinate).toHaveBeenCalledWith(learnerId);
  });

  it("generates missing course paths before coordinating on explicit request", async () => {
    vi.mocked(pathService.coordinate).mockResolvedValue({
      generatedPaths: 2,
      regeneratedPaths: 0,
      plan: {
        activeGoal: null,
        courses: [],
        generatedAt: "2026-08-31T00:00:00.000Z",
        learnNext: null,
        policyVersion: "cross-course-coordination-v1",
        summary: {
          activeCourses: 2, coordinatedCourses: 2, coursesWithoutPaths: 0,
          goalAlignedCandidates: 0, sharedSkillContexts: 0,
        },
      },
    });
    const response = await request(app()).post("/enrollments/paths/coordination/generate")
      .set("Authorization", "Bearer token");
    expect(response.status).toBe(201);
    expect(response.body.generatedPaths).toBe(2);
    expect(pathService.coordinate).toHaveBeenCalledWith(learnerId, true);
  });

  it("returns an honest empty-state error before generation", async () => {
    vi.mocked(pathService.get).mockResolvedValue(null);
    const response = await request(app()).get(`/enrollments/${enrollmentId}/path`).set("Authorization", "Bearer token");
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("PATH_NOT_GENERATED");
  });

  it("creates once and returns model provenance", async () => {
    const path = {
      id: "path", context: { enrollmentId }, learnNext: { skillId: "skill" },
      provenance: { modelVersion: "benefit-ranking-v2", featureVersion: "learner-candidate-features-v2" },
    } as unknown as PersonalizedPath;
    vi.mocked(pathService.generate).mockResolvedValue({ created: true, path });
    const response = await request(app()).post(`/enrollments/${enrollmentId}/path/generate`).set("Authorization", "Bearer token");
    expect(response.status).toBe(201);
    expect(response.body.path.provenance.modelVersion).toBe("benefit-ranking-v2");
    expect(pathService.generate).toHaveBeenCalledWith(learnerId, enrollmentId);
  });

  it("explicitly regenerates a stale path and exposes immutable history", async () => {
    const previous = { id: "old-path", pathVersion: 1, status: "SUPERSEDED" } as PersonalizedPath;
    const path = { id: "new-path", pathVersion: 2, status: "ACTIVE" } as PersonalizedPath;
    const change = { explanation: "Updated", laneChanges: [], learnNextChanged: true, masterySnapshotsChanged: 1, newLearnNext: null, previousLearnNext: null, recognizedAdded: 1, unlockedAdded: 0 };
    vi.mocked(pathService.regenerate).mockResolvedValue({ change, path, previousPath: previous, regenerated: true });
    vi.mocked(pathService.history).mockResolvedValue([path, previous]);

    const regenerated = await request(app()).post(`/enrollments/${enrollmentId}/path/regenerate`).set("Authorization", "Bearer token");
    const history = await request(app()).get(`/enrollments/${enrollmentId}/path/history`).set("Authorization", "Bearer token");

    expect(regenerated.status).toBe(201);
    expect(regenerated.body.path.pathVersion).toBe(2);
    expect(history.body.paths).toHaveLength(2);
    expect(pathService.regenerate).toHaveBeenCalledWith(learnerId, enrollmentId);
  });
});
