import { Router } from "express";
import { z } from "zod";

import { requireAuthentication } from "../auth/middleware.js";
import type { AuthServiceContract } from "../auth/types.js";
import { AppError } from "../errors.js";
import type { RecommendationServiceContract } from "./types.js";

const pathParameter = z.object({ pathId: z.string().uuid() });
const responseSchema = z.object({
  comment: z.string().trim().max(500).optional(),
  decision: z.enum(["ACCEPTED", "REJECTED"]),
  reasonCode: z.enum([
    "ALREADY_KNOW", "NOT_RELEVANT", "PREFER_DIFFERENT",
    "TOO_DIFFICULT", "TOO_EASY", "OTHER",
  ]).optional(),
  resourceId: z.string().uuid().optional(),
}).superRefine((value, context) => {
  if (value.decision === "REJECTED" && !value.reasonCode) {
    context.addIssue({ code: "custom", message: "A rejection reason is required.", path: ["reasonCode"] });
  }
  if (value.decision === "ACCEPTED" && value.reasonCode) {
    context.addIssue({ code: "custom", message: "Accepted recommendations cannot have a rejection reason.", path: ["reasonCode"] });
  }
});

export function createRecommendationRouter(
  authService: AuthServiceContract,
  recommendationService: RecommendationServiceContract,
): Router {
  const router = Router();
  router.use(requireAuthentication(authService));

  router.get("/evaluation", async (request, response) => {
    response.json(await recommendationService.evaluate(request.auth!.userId));
  });

  router.get("/paths/:pathId/feedback", async (request, response) => {
    const parameter = pathParameter.safeParse(request.params);
    if (!parameter.success) throw new AppError(400, "VALIDATION_ERROR", "A valid path identifier is required.");
    response.json({ feedback: await recommendationService.getFeedback(request.auth!.userId, parameter.data.pathId) });
  });

  router.post("/paths/:pathId/feedback", async (request, response) => {
    const parameter = pathParameter.safeParse(request.params);
    const body = responseSchema.safeParse(request.body);
    if (!parameter.success || !body.success) {
      throw new AppError(400, "VALIDATION_ERROR", "The recommendation response is invalid.");
    }
    const result = await recommendationService.respond(request.auth!.userId, parameter.data.pathId, body.data);
    response.status(result.created ? 201 : 200).json(result);
  });

  return router;
}
