import { Router } from "express";

import { requireAuthentication } from "../auth/middleware.js";
import type { AuthServiceContract } from "../auth/types.js";
import type { GovernanceServiceContract } from "./types.js";

export function createGovernanceRouter(authService: AuthServiceContract, governanceService: GovernanceServiceContract): Router {
  const router = Router();
  router.use(requireAuthentication(authService));
  router.get("/overview", async (_request, response) => response.json(await governanceService.getOverview()));
  return router;
}
