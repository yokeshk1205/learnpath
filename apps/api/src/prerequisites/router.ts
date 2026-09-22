import { Router } from "express";
import { z } from "zod";

import { requireAuthentication } from "../auth/middleware.js";
import type { AuthServiceContract } from "../auth/types.js";
import { AppError } from "../errors.js";
import type { PrerequisiteServiceContract } from "./types.js";

const querySchema = z.object({
  enrollmentId: z.string().uuid().optional(),
  goalId: z.string().uuid().optional(),
}).refine((value) => !(value.enrollmentId && value.goalId), {
  message: "Choose either an enrollment or goal readiness context.",
});

export function createPrerequisiteRouter(
  authService: AuthServiceContract,
  prerequisiteService: PrerequisiteServiceContract,
): Router {
  const router = Router();
  router.use(requireAuthentication(authService));

  router.get("/analysis", async (request, response) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "The prerequisite analysis context is invalid.");
    }
    response.json(await prerequisiteService.analyze(request.auth!.userId, parsed.data));
  });

  return router;
}
