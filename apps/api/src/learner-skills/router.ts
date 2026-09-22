import { Router } from "express";

import { requireAuthentication } from "../auth/middleware.js";
import type { AuthServiceContract } from "../auth/types.js";
import type { LearnerSkillServiceContract } from "./types.js";

export function createLearnerSkillRouter(
  authService: AuthServiceContract,
  learnerSkillService: LearnerSkillServiceContract,
): Router {
  const router = Router();
  router.use(requireAuthentication(authService));

  router.get("/", async (request, response) => {
    response.json(await learnerSkillService.getPassport(request.auth!.userId));
  });

  return router;
}
