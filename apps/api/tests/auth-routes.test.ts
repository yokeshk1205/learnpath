import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import type { AuthResult, AuthServiceContract, PublicUser } from "../src/auth/types.js";
import type { CatalogServiceContract } from "../src/catalog/types.js";
import type { EnrollmentServiceContract } from "../src/enrollments/types.js";
import type { DiagnosticServiceContract } from "../src/diagnostics/types.js";
import { AppError } from "../src/errors.js";
import type { LearnerSkillServiceContract } from "../src/learner-skills/types.js";
import type { LearningServiceContract } from "../src/learning/types.js";
import type { PracticeServiceContract } from "../src/practice/types.js";
import type { PrerequisiteServiceContract } from "../src/prerequisites/types.js";
import type { RetentionServiceContract } from "../src/retention/types.js";

const user: PublicUser = {
  createdAt: "2026-08-28T00:00:00.000Z",
  displayName: "Ada Learner",
  email: "ada@example.com",
  emailVerifiedAt: null,
  id: "6f48dc49-943a-4e6d-aee9-543588698108",
  lastLoginAt: null,
  roles: ["LEARNER"],
  status: "ACTIVE",
};

const authResult: AuthResult = {
  accessToken: "signed-access-token",
  accessTokenExpiresInSeconds: 900,
  refreshToken: "opaque-refresh-token",
  refreshTokenExpiresAt: new Date("2026-09-27T00:00:00.000Z"),
  user,
};

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
  return createApp({
    authService,
    catalogService,
    diagnosticService,
    enrollmentService,
    learnerSkillService,
    learningService,
    practiceService,
    prerequisiteService,
    retentionService,
    probeDatabase: vi.fn().mockResolvedValue(undefined),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("authentication HTTP boundary", () => {
  it("validates registration before invoking the service", async () => {
    const response = await request(app()).post("/auth/register").send({
      displayName: "A",
      email: "not-an-email",
      password: "short",
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(authService.register).not.toHaveBeenCalled();
  });

  it("rejects state-changing requests from an untrusted browser origin", async () => {
    const response = await request(app())
      .post("/auth/login")
      .set("Origin", "https://attacker.example")
      .send({ email: "ada@example.com", password: "correct-horse-battery-staple" });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("UNTRUSTED_ORIGIN");
    expect(authService.login).not.toHaveBeenCalled();
  });

  it("returns an access token and keeps the refresh token in an HttpOnly cookie", async () => {
    vi.mocked(authService.register).mockResolvedValue(authResult);
    const response = await request(app()).post("/auth/register").send({
      displayName: "Ada Learner",
      email: "ADA@EXAMPLE.COM",
      password: "correct-horse-battery-staple",
    });

    expect(response.status).toBe(201);
    expect(response.body.accessToken).toBe("signed-access-token");
    expect(response.body.refreshToken).toBeUndefined();
    expect(response.headers["set-cookie"]![0]).toContain("HttpOnly");
    expect(response.headers["set-cookie"]![0]).toContain("SameSite=Lax");
    expect(authService.register).toHaveBeenCalledWith(
      expect.objectContaining({ email: "ada@example.com" }),
      expect.any(Object),
    );
  });

  it("preserves safe authentication errors", async () => {
    vi.mocked(authService.login).mockRejectedValue(
      new AppError(401, "INVALID_CREDENTIALS", "Email or password is incorrect."),
    );
    const response = await request(app()).post("/auth/login").send({
      email: "ada@example.com",
      password: "wrong-password",
    });

    expect(response.status).toBe(401);
    expect(response.body.error).toMatchObject({
      code: "INVALID_CREDENTIALS",
      message: "Email or password is incorrect.",
    });
  });

  it("loads the current user for a valid bearer token", async () => {
    vi.mocked(authService.authenticateAccessToken).mockResolvedValue({
      email: user.email,
      roles: user.roles,
      userId: user.id,
    });
    vi.mocked(authService.getCurrentUser).mockResolvedValue(user);
    const response = await request(app())
      .get("/auth/me")
      .set("Authorization", "Bearer signed-access-token");

    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe(user.email);
  });

  it("denies the admin boundary to a learner", async () => {
    vi.mocked(authService.authenticateAccessToken).mockResolvedValue({
      email: user.email,
      roles: ["LEARNER"],
      userId: user.id,
    });
    const response = await request(app())
      .get("/admin/access-check")
      .set("Authorization", "Bearer signed-access-token");

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("INSUFFICIENT_ROLE");
  });

  it("allows the admin boundary only with the admin role", async () => {
    vi.mocked(authService.authenticateAccessToken).mockResolvedValue({
      email: user.email,
      roles: ["ADMIN"],
      userId: user.id,
    });
    const response = await request(app())
      .get("/admin/access-check")
      .set("Authorization", "Bearer signed-access-token");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ authorized: true, userId: user.id });
  });
});
