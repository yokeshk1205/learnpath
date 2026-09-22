import { Router } from "express";
import { z } from "zod";

import { requireAuthentication } from "../auth/middleware.js";
import type { AuthServiceContract } from "../auth/types.js";
import { AppError } from "../errors.js";
import type { PathServiceContract } from "./types.js";

const uuid = z.string().uuid();

export function createPathRouter(authService: AuthServiceContract, pathService: PathServiceContract): Router {
  const router = Router();
  router.use(requireAuthentication(authService));
  router.get("/paths/coordination", async (request, response) => {
    const result = await pathService.coordinate(request.auth!.userId);
    response.json(result.plan);
  });
  router.post("/paths/coordination/generate", async (request, response) => {
    const result = await pathService.coordinate(request.auth!.userId, true);
    response.status(result.generatedPaths || result.regeneratedPaths ? 201 : 200).json(result);
  });
  router.get("/:enrollmentId/path", async (request, response) => {
    const enrollmentId = uuid.safeParse(request.params.enrollmentId);
    if (!enrollmentId.success) throw new AppError(400, "VALIDATION_ERROR", "A valid enrollment identifier is required.");
    const path = await pathService.get(request.auth!.userId, enrollmentId.data);
    if (!path) throw new AppError(404, "PATH_NOT_GENERATED", "Generate this course's personalized path to see Learn Next.");
    response.json(path);
  });
  router.post("/:enrollmentId/path/generate", async (request, response) => {
    const enrollmentId = uuid.safeParse(request.params.enrollmentId);
    if (!enrollmentId.success) throw new AppError(400, "VALIDATION_ERROR", "A valid enrollment identifier is required.");
    const result = await pathService.generate(request.auth!.userId, enrollmentId.data);
    response.status(result.created ? 201 : 200).json(result);
  });
  router.post("/:enrollmentId/path/regenerate", async (request, response) => {
    const enrollmentId = uuid.safeParse(request.params.enrollmentId);
    if (!enrollmentId.success) throw new AppError(400, "VALIDATION_ERROR", "A valid enrollment identifier is required.");
    response.status(201).json(await pathService.regenerate(request.auth!.userId, enrollmentId.data));
  });
  router.get("/:enrollmentId/path/history", async (request, response) => {
    const enrollmentId = uuid.safeParse(request.params.enrollmentId);
    if (!enrollmentId.success) throw new AppError(400, "VALIDATION_ERROR", "A valid enrollment identifier is required.");
    response.json({ paths: await pathService.history(request.auth!.userId, enrollmentId.data) });
  });
  return router;
}
