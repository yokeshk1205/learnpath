import { Router } from "express";
import { z } from "zod";

import { requireAuthentication } from "../auth/middleware.js";
import type { AuthServiceContract } from "../auth/types.js";
import { AppError } from "../errors.js";
import type { AssessmentProgramServiceContract } from "./types.js";

const uuid = z.string().uuid();
const overviewSchema = z.object({ enrollmentId: uuid }).strict();
const createSchema = overviewSchema.extend({ mode: z.enum(["QUICK_PLACEMENT", "COMPREHENSIVE"]).default("COMPREHENSIVE") });
const familiarity = z.enum(["NEVER_LEARNED", "KNOW_A_LITTLE", "COMFORTABLE", "VERY_COMFORTABLE", "UNSURE"]);
const confidence = z.enum(["LOW", "MEDIUM", "HIGH"]);
const experienceSource = z.enum(["LEARNED_IN_COURSE", "SOLVED_PROBLEMS", "USED_IN_PROJECT", "READ_OR_WATCHED_ONLY", "OTHER"]);
const selfReportSchema = overviewSchema.extend({
  modules: z.array(z.object({ moduleId: uuid, familiarity, confidence: confidence.nullable().optional() }).strict()).min(1),
  skills: z.array(z.object({
    skillId: uuid, familiarity, confidence: confidence.nullable().optional(),
    experienceSource: experienceSource.nullable().optional(),
  }).strict()).optional(),
}).strict();
const focusedCheckSchema = overviewSchema.extend({
  skillId: uuid,
  intent: z.enum(["KNOWLEDGE_CHECK", "CHALLENGE"]),
}).strict();

function programId(value: string | undefined): string {
  const parsed = uuid.safeParse(value);
  if (!parsed.success) throw new AppError(400, "VALIDATION_ERROR", "A valid assessment program identifier is required.");
  return parsed.data;
}

export function createAssessmentProgramRouter(authService: AuthServiceContract, service: AssessmentProgramServiceContract): Router {
  const router = Router();
  router.use(requireAuthentication(authService));
  router.get("/overview", async (request, response) => {
    const parsed = overviewSchema.safeParse(request.query);
    if (!parsed.success) throw new AppError(400, "VALIDATION_ERROR", "A valid course enrollment is required.");
    response.json(await service.getOverview(request.auth!.userId, parsed.data));
  });
  router.get("/knowledge-map", async (request, response) => {
    const parsed = overviewSchema.safeParse(request.query);
    if (!parsed.success) throw new AppError(400, "VALIDATION_ERROR", "A valid course enrollment is required.");
    const overview = await service.getOverview(request.auth!.userId, parsed.data);
    response.json({ context: overview.context, coverage: overview.coverage, knowledgeBoundary: overview.knowledgeBoundary });
  });
  router.get("/backlog", async (request, response) => {
    const parsed = overviewSchema.safeParse(request.query);
    if (!parsed.success) throw new AppError(400, "VALIDATION_ERROR", "A valid course enrollment is required.");
    const overview = await service.getOverview(request.auth!.userId, parsed.data);
    response.json({ context: overview.context, items: overview.backlog });
  });
  router.put("/self-report", async (request, response) => {
    const parsed = selfReportSchema.safeParse(request.body);
    if (!parsed.success) throw new AppError(400, "VALIDATION_ERROR", "Choose familiarity for every module before continuing.", {
      fields: parsed.error.flatten().fieldErrors,
    });
    if (!service.saveSelfReport) throw new AppError(501, "SELF_REPORT_UNAVAILABLE", "Course knowledge setup is not available.");
    response.json(await service.saveSelfReport(request.auth!.userId, parsed.data));
  });
  router.post("/focused-checks", async (request, response) => {
    const parsed = focusedCheckSchema.safeParse(request.body);
    if (!parsed.success) throw new AppError(400, "VALIDATION_ERROR", "Choose an enrolled course skill to verify.");
    if (!service.startFocusedCheck) throw new AppError(501, "FOCUSED_CHECK_UNAVAILABLE", "Focused knowledge checks are not available.");
    response.status(201).json(await service.startFocusedCheck(request.auth!.userId, parsed.data));
  });
  router.post("/", async (request, response) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) throw new AppError(400, "VALIDATION_ERROR", "Choose a course enrollment and assessment mode.");
    response.status(201).json(await service.create(request.auth!.userId, parsed.data));
  });
  router.get("/:programId", async (request, response) => {
    response.json(await service.getProgram(request.auth!.userId, programId(request.params.programId)));
  });
  router.post("/:programId/sessions", async (request, response) => {
    if (!z.object({}).strict().safeParse(request.body ?? {}).success) {
      throw new AppError(400, "VALIDATION_ERROR", "Session scope is chosen by the assessment program.");
    }
    response.status(201).json(await service.startSession(request.auth!.userId, programId(request.params.programId)));
  });
  return router;
}
