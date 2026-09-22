import { Router } from "express";
import { z } from "zod";

import type { AuthServiceContract } from "../auth/types.js";
import { requireAuthentication } from "../auth/middleware.js";
import { AppError } from "../errors.js";
import type { CatalogServiceContract } from "./types.js";

const goalIdSchema = z.string().uuid();
const selectGoalSchema = z.object({
  goalId: z.string().uuid(),
  priority: z.number().int().min(1).max(5).default(1),
  targetDate: z.iso.date().optional(),
});

export function createCatalogRouter(
  authService: AuthServiceContract,
  catalogService: CatalogServiceContract,
): Router {
  const router = Router();
  router.use(requireAuthentication(authService));

  router.get("/overview", async (request, response) => {
    response.json(await catalogService.getOverview(request.auth!.userId));
  });

  router.get("/goals/:goalId", async (request, response) => {
    const parsed = goalIdSchema.safeParse(request.params.goalId);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "A valid goal identifier is required.");
    }
    response.json(await catalogService.getGoalDetail(request.auth!.userId, parsed.data));
  });

  router.get("/learner-goals", async (request, response) => {
    response.json({ goals: await catalogService.getLearnerGoals(request.auth!.userId) });
  });

  router.post("/learner-goals", async (request, response) => {
    const parsed = selectGoalSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "The submitted goal is invalid.", {
        fields: parsed.error.flatten().fieldErrors,
      });
    }
    const goal = await catalogService.selectGoal(request.auth!.userId, parsed.data);
    response.status(201).json({ goal });
  });

  router.delete("/learner-goals/:goalId", async (request, response) => {
    const parsed = goalIdSchema.safeParse(request.params.goalId);
    if (!parsed.success) throw new AppError(400, "VALIDATION_ERROR", "A valid goal identifier is required.");
    response.json({ goal: await catalogService.removeGoal(request.auth!.userId, parsed.data) });
  });

  return router;
}
