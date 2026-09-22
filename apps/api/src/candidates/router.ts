import { Router } from "express";
import { z } from "zod";

import { requireAuthentication } from "../auth/middleware.js";
import type { AuthServiceContract } from "../auth/types.js";
import { AppError } from "../errors.js";
import type { CandidateServiceContract } from "./types.js";

const uuid = z.string().uuid();

export function createCandidateRouter(
  authService: AuthServiceContract,
  candidateService: CandidateServiceContract,
): Router {
  const router = Router();
  router.use(requireAuthentication(authService));
  router.get("/:enrollmentId/candidates", async (request, response) => {
    const enrollmentId = uuid.safeParse(request.params.enrollmentId);
    if (!enrollmentId.success) {
      throw new AppError(400, "VALIDATION_ERROR", "A valid enrollment identifier is required.");
    }
    response.json(await candidateService.generate(request.auth!.userId, enrollmentId.data));
  });
  return router;
}

