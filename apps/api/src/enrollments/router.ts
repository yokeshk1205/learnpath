import { Router } from "express";
import { z } from "zod";

import { requireAuthentication } from "../auth/middleware.js";
import type { AuthServiceContract } from "../auth/types.js";
import { AppError } from "../errors.js";
import type { EnrollmentServiceContract } from "./types.js";

const uuid = z.string().uuid();
const enrollSchema = z.object({
  courseId: uuid,
  learningGoalId: uuid.optional(),
});
const statusSchema = z.object({
  status: z.enum(["ACTIVE", "PAUSED", "DROPPED"]),
});
const moduleProgressSchema = z.object({
  status: z.enum(["IN_PROGRESS", "COMPLETED"]),
});

function validId(value: string | undefined, label: string): string {
  const result = uuid.safeParse(value);
  if (!result.success) {
    throw new AppError(400, "VALIDATION_ERROR", `A valid ${label} identifier is required.`);
  }
  return result.data;
}

export function createEnrollmentRouter(
  authService: AuthServiceContract,
  enrollmentService: EnrollmentServiceContract,
): Router {
  const router = Router();
  router.use(requireAuthentication(authService));

  router.get("/", async (request, response) => {
    response.json({ enrollments: await enrollmentService.listEnrollments(request.auth!.userId) });
  });

  router.post("/", async (request, response) => {
    const input = enrollSchema.safeParse(request.body);
    if (!input.success) {
      throw new AppError(400, "VALIDATION_ERROR", "The submitted enrollment is invalid.", {
        fields: input.error.flatten().fieldErrors,
      });
    }
    const enrollment = await enrollmentService.enroll(request.auth!.userId, input.data);
    response.status(201).json(enrollment);
  });

  router.get("/:enrollmentId", async (request, response) => {
    const enrollmentId = validId(request.params.enrollmentId, "enrollment");
    response.json(await enrollmentService.getEnrollment(request.auth!.userId, enrollmentId));
  });

  router.post("/:enrollmentId/status", async (request, response) => {
    const enrollmentId = validId(request.params.enrollmentId, "enrollment");
    const input = statusSchema.safeParse(request.body);
    if (!input.success) {
      throw new AppError(400, "VALIDATION_ERROR", "The enrollment status is invalid.");
    }
    response.json({
      enrollment: await enrollmentService.setStatus(
        request.auth!.userId,
        enrollmentId,
        input.data.status,
      ),
    });
  });

  router.post("/:enrollmentId/modules/:moduleId/progress", async (request, response) => {
    const enrollmentId = validId(request.params.enrollmentId, "enrollment");
    const moduleId = validId(request.params.moduleId, "module");
    const input = moduleProgressSchema.safeParse(request.body);
    if (!input.success) {
      throw new AppError(400, "VALIDATION_ERROR", "The module progress state is invalid.");
    }
    response.json(
      await enrollmentService.updateModuleProgress(
        request.auth!.userId,
        enrollmentId,
        moduleId,
        input.data.status,
      ),
    );
  });

  return router;
}
