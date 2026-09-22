import express, { type ErrorRequestHandler } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createAssessmentProgramRouter } from "../src/assessment-programs/router.js";
import type { AssessmentProgramServiceContract } from "../src/assessment-programs/types.js";
import type { AuthServiceContract } from "../src/auth/types.js";
import { AppError } from "../src/errors.js";

const learnerId = "6f48dc49-943a-4e6d-aee9-543588698108";
const enrollmentId = "e1000000-0000-4000-8000-000000000001";
const programId = "a1000000-0000-4000-8000-000000000001";
const moduleId = "a2000000-0000-4000-8000-000000000001";
const skillId = "a3000000-0000-4000-8000-000000000001";
const auth: AuthServiceContract = {
  authenticateAccessToken: vi.fn(), getCurrentUser: vi.fn(), login: vi.fn(), logout: vi.fn(), refresh: vi.fn(), register: vi.fn(),
};
const service: AssessmentProgramServiceContract = {
  create: vi.fn(), getOverview: vi.fn(), getProgram: vi.fn(), saveSelfReport: vi.fn(),
  startFocusedCheck: vi.fn(), startSession: vi.fn(),
};

function app() {
  const application = express();
  application.use(express.json());
  application.use("/assessment-programs", createAssessmentProgramRouter(auth, service));
  const handler: ErrorRequestHandler = (error, _request, response, _next) => {
    void _next;
    response.status(error instanceof AppError ? error.statusCode : 500).json({ error: { code: error.code } });
  };
  application.use(handler);
  return application;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(auth.authenticateAccessToken).mockResolvedValue({ userId: learnerId, email: "learner@example.com", roles: ["LEARNER"] });
});

describe("assessment program routes", () => {
  it("requires authentication", async () => {
    const response = await request(app()).get(`/assessment-programs/overview?enrollmentId=${enrollmentId}`);
    expect(response.status).toBe(401);
    expect(service.getOverview).not.toHaveBeenCalled();
  });

  it("loads the entire coverage overview in the authenticated learner's enrollment context", async () => {
    const response = await request(app()).get(`/assessment-programs/overview?enrollmentId=${enrollmentId}`).auth("token", { type: "bearer" });
    expect(response.status).toBe(200);
    expect(service.getOverview).toHaveBeenCalledWith(learnerId, { enrollmentId });
  });

  it("defaults a newly requested program to comprehensive assessment", async () => {
    const response = await request(app()).post("/assessment-programs").auth("token", { type: "bearer" }).send({ enrollmentId });
    expect(response.status).toBe(201);
    expect(service.create).toHaveBeenCalledWith(learnerId, { enrollmentId, mode: "COMPREHENSIVE" });
  });

  it("accepts explicit quick placement", async () => {
    const response = await request(app()).post("/assessment-programs").auth("token", { type: "bearer" }).send({ enrollmentId, mode: "QUICK_PLACEMENT" });
    expect(response.status).toBe(201);
    expect(service.create).toHaveBeenCalledWith(learnerId, { enrollmentId, mode: "QUICK_PLACEMENT" });
  });

  it("stores self-report as a separate hypothesis and starts focused verification", async () => {
    const saved = await request(app()).put("/assessment-programs/self-report").auth("token", { type: "bearer" }).send({
      enrollmentId,
      modules: [{ moduleId, familiarity: "COMFORTABLE", confidence: "HIGH" }],
      skills: [{ skillId, familiarity: "COMFORTABLE", confidence: "HIGH", experienceSource: "LEARNED_IN_COURSE" }],
    });
    expect(saved.status).toBe(200);
    expect(service.saveSelfReport).toHaveBeenCalledWith(learnerId, expect.objectContaining({ enrollmentId }));

    const focused = await request(app()).post("/assessment-programs/focused-checks").auth("token", { type: "bearer" }).send({
      enrollmentId, skillId, intent: "CHALLENGE",
    });
    expect(focused.status).toBe(201);
    expect(service.startFocusedCheck).toHaveBeenCalledWith(learnerId, { enrollmentId, skillId, intent: "CHALLENGE" });
  });

  it("rejects self-report fields that could masquerade as mastery evidence", async () => {
    const response = await request(app()).put("/assessment-programs/self-report").auth("token", { type: "bearer" }).send({
      enrollmentId, modules: [{ moduleId, familiarity: "COMFORTABLE", mastery: 1 }],
    });
    expect(response.status).toBe(400);
    expect(service.saveSelfReport).not.toHaveBeenCalled();
  });

  it("does not allow a client to supply another learner or choose arbitrary session focus", async () => {
    expect((await request(app()).post("/assessment-programs").auth("token", { type: "bearer" }).send({ enrollmentId, learnerId: "someone-else" })).status).toBe(400);
    expect((await request(app()).post(`/assessment-programs/${programId}/sessions`).auth("token", { type: "bearer" }).send({ focusSkillIds: ["arbitrary"] })).status).toBe(400);
    expect(service.create).not.toHaveBeenCalled();
    expect(service.startSession).not.toHaveBeenCalled();
  });

  it("rejects invalid scope, mode, and program identifiers", async () => {
    expect((await request(app()).get("/assessment-programs/overview").auth("token", { type: "bearer" })).status).toBe(400);
    expect((await request(app()).post("/assessment-programs").auth("token", { type: "bearer" }).send({ enrollmentId, mode: "ALL_MASTERED" })).status).toBe(400);
    expect((await request(app()).get("/assessment-programs/invalid").auth("token", { type: "bearer" })).status).toBe(400);
  });

  it("resumes the session using authenticated ownership and preserves bank-blocked errors", async () => {
    vi.mocked(service.startSession).mockRejectedValue(new AppError(409, "ASSESSMENT_BANK_BLOCKED", "Missing questions"));
    const response = await request(app()).post(`/assessment-programs/${programId}/sessions`).auth("token", { type: "bearer" }).send({});
    expect(service.startSession).toHaveBeenCalledWith(learnerId, programId);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("ASSESSMENT_BANK_BLOCKED");
  });
});
