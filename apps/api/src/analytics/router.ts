import { Router } from "express";

import { requireAuthentication } from "../auth/middleware.js";
import type { AuthServiceContract } from "../auth/types.js";
import type { AnalyticsServiceContract } from "./types.js";

export function createAnalyticsRouter(
  authService: AuthServiceContract,
  analyticsService: AnalyticsServiceContract,
): Router {
  const router = Router();
  router.use(requireAuthentication(authService));
  router.get("/overview", async (request, response) => {
    response.json(await analyticsService.getOverview(request.auth!.userId));
  });
  return router;
}
