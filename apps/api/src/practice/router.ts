import { Router } from "express";
import { z } from "zod";

import { requireAuthentication } from "../auth/middleware.js";
import type { AuthServiceContract } from "../auth/types.js";
import { AppError } from "../errors.js";
import type { PracticeServiceContract } from "./types.js";

const uuid = z.string().uuid();
const startSchema = z.object({
  enrollmentId: uuid.optional(),
  mode: z.enum(["PRACTICE", "ASSESSMENT", "RETENTION_CHECK"]).optional(),
  skillId: uuid,
});
const submitSchema = z.object({
  durationSeconds: z.number().int().min(0).max(86_400),
  hintsUsed: z.number().int().min(0).max(100).default(0),
  optionId: uuid,
});

function attemptId(value: string | undefined): string {
  const parsed = uuid.safeParse(value);
  if (!parsed.success) throw new AppError(400, "VALIDATION_ERROR", "A valid practice attempt identifier is required.");
  return parsed.data;
}

export function createPracticeRouter(
  authService: AuthServiceContract,
  practiceService: PracticeServiceContract,
): Router {
  const router = Router();
  router.use(requireAuthentication(authService));

  router.post("/start", async (request, response) => {
    const input = startSchema.safeParse(request.body);
    if (!input.success) throw new AppError(400, "VALIDATION_ERROR", "The practice context is invalid.");
    response.status(201).json(await practiceService.start(request.auth!.userId, input.data));
  });

  router.get("/attempts/:attemptId", async (request, response) => {
    response.json(await practiceService.getAttempt(
      request.auth!.userId,
      attemptId(request.params.attemptId),
    ));
  });

  router.post("/attempts/:attemptId/submit", async (request, response) => {
    const input = submitSchema.safeParse(request.body);
    if (!input.success) throw new AppError(400, "VALIDATION_ERROR", "The practice answer is invalid.");
    response.json(await practiceService.submit(
      request.auth!.userId,
      attemptId(request.params.attemptId),
      input.data,
    ));
  });

  return router;
}
