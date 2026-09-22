import { Router } from "express";
import { z } from "zod";

import { requireAuthentication } from "../auth/middleware.js";
import type { AuthServiceContract } from "../auth/types.js";
import { AppError } from "../errors.js";
import type { LearningServiceContract } from "./types.js";

const filterSchema = z.object({
  courseId: z.string().uuid().optional(),
  moduleId: z.string().uuid().optional(),
  skillId: z.string().uuid().optional(),
});

const jsonRecord = z.record(
  z.string().max(80),
  z.union([z.string().max(500), z.number().finite(), z.boolean(), z.null()]),
).optional();

const eventSchema = z.object({
  courseId: z.string().uuid().optional(),
  durationSeconds: z.number().int().min(0).max(86_400).default(0),
  eventType: z.enum(["RESOURCE_STARTED", "RESOURCE_COMPLETED", "RESOURCE_SKIPPED"]),
  metadata: jsonRecord,
  moduleId: z.string().uuid().optional(),
  result: jsonRecord,
}).refine((value) => !value.moduleId || value.courseId, {
  message: "A module resource event requires its course context.",
});

const parameterSchema = z.object({ resourceId: z.string().uuid() });

export function createLearningRouter(
  authService: AuthServiceContract,
  learningService: LearningServiceContract,
): Router {
  const router = Router();
  router.use(requireAuthentication(authService));

  router.get("/overview", async (request, response) => {
    const parsed = filterSchema.safeParse(request.query);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "The learning resource filters are invalid.");
    }
    response.json(await learningService.getOverview(request.auth!.userId, parsed.data));
  });

  router.get("/resources/:resourceId", async (request, response) => {
    const parsed = parameterSchema.safeParse(request.params);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "The learning resource identifier is invalid.");
    }
    response.json(await learningService.getResource(request.auth!.userId, parsed.data.resourceId));
  });

  router.post("/resources/:resourceId/events", async (request, response) => {
    const parameter = parameterSchema.safeParse(request.params);
    const body = eventSchema.safeParse(request.body);
    if (!parameter.success || !body.success) {
      throw new AppError(400, "VALIDATION_ERROR", "The resource activity event is invalid.");
    }
    response.status(201).json(await learningService.recordResourceEvent(
      request.auth!.userId,
      parameter.data.resourceId,
      body.data,
    ));
  });

  return router;
}
