import { Router } from "express";

import { requireAuthentication } from "../auth/middleware.js";
import type { AuthServiceContract } from "../auth/types.js";
import type { RetentionServiceContract } from "./types.js";

export function createRetentionRouter(
  authService: AuthServiceContract,
  retentionService: RetentionServiceContract,
) {
  const router = Router();
  router.use(requireAuthentication(authService));
  router.get("/", async (request, response) => {
    response.json(await retentionService.getOverview(request.auth!.userId));
  });
  return router;
}
