import { Router } from "express";
import { z } from "zod";

import { requireAuthentication } from "../auth/middleware.js";
import type { AuthServiceContract } from "../auth/types.js";
import { AppError } from "../errors.js";
import type { DiagnosticServiceContract } from "./types.js";

const uuid = z.string().uuid();
const contextSchema = z.object({
  enrollmentId: uuid.optional(),
  goalId: uuid.optional(),
}).refine((value) => !(value.enrollmentId && value.goalId), {
  message: "Choose either a course enrollment or a learning goal context.",
});
const startSchema = contextSchema;
const answerFields = z.object({
  isUnsure: z.boolean().optional().default(false),
  optionId: uuid.nullable().optional(),
  selectedOptionIds: z.array(uuid).min(1).max(4).refine((ids) => new Set(ids).size === ids.length, "Select each option once.").optional(),
  numericAnswer: z.number().finite().optional(),
  questionId: uuid,
  responseSeconds: z.number().int().min(0).max(3_600).optional().default(0),
}).strict();
function validResponseShape(answer: {
  isUnsure: boolean; optionId?: string | null; selectedOptionIds?: string[]; numericAnswer?: number;
}, context: z.RefinementCtx) {
  const count = Number(answer.optionId != null) + Number(answer.selectedOptionIds !== undefined) + Number(answer.numericAnswer !== undefined);
  if (answer.isUnsure ? count !== 0 : count !== 1) {
    context.addIssue({ code: "custom", message: "Provide exactly one answer format, or mark the answer as unsure without a response." });
  }
}
const answerSchema = answerFields.superRefine(validResponseShape);
const submitSchema = z.object({
  answers: z.array(answerSchema).min(1).max(100),
  durationSeconds: z.number().int().min(0).max(86_400).optional(),
});
const draftSchema = answerFields.omit({ questionId: true }).superRefine(validResponseShape);

function attemptId(value: string | undefined): string {
  const parsed = uuid.safeParse(value);
  if (!parsed.success) throw new AppError(400, "VALIDATION_ERROR", "A valid diagnostic attempt identifier is required.");
  return parsed.data;
}

export function createDiagnosticRouter(
  authService: AuthServiceContract,
  diagnosticService: DiagnosticServiceContract,
): Router {
  const router = Router();
  router.use(requireAuthentication(authService));

  router.get("/overview", async (request, response) => {
    const parsed = contextSchema.safeParse(request.query);
    if (!parsed.success) throw new AppError(400, "VALIDATION_ERROR", "The diagnostic context is invalid.");
    response.json(await diagnosticService.getOverview(request.auth!.userId, parsed.data));
  });

  router.post("/start", async (request, response) => {
    const parsed = startSchema.safeParse(request.body ?? {});
    if (!parsed.success) throw new AppError(400, "VALIDATION_ERROR", "The diagnostic context is invalid.");
    response.status(201).json(await diagnosticService.start(request.auth!.userId, parsed.data));
  });

  router.get("/attempts/:attemptId", async (request, response) => {
    response.json(await diagnosticService.getAttempt(
      request.auth!.userId, attemptId(request.params.attemptId),
    ));
  });

  router.put("/attempts/:attemptId/answers/:questionId", async (request, response) => {
    const questionId = uuid.safeParse(request.params.questionId);
    const parsed = draftSchema.safeParse(request.body);
    if (!questionId.success || !parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "The diagnostic answer is invalid.");
    }
    if (!diagnosticService.saveDraft) {
      throw new AppError(501, "DIAGNOSTIC_AUTOSAVE_UNAVAILABLE", "Diagnostic autosave is not available.");
    }
    response.json(await diagnosticService.saveDraft(
      request.auth!.userId,
      attemptId(request.params.attemptId),
      { ...parsed.data, optionId: parsed.data.optionId ?? null, questionId: questionId.data },
    ));
  });

  router.post("/attempts/:attemptId/submit", async (request, response) => {
    const parsed = submitSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "The diagnostic answers are invalid.", {
        fields: parsed.error.flatten().fieldErrors,
      });
    }
    response.json(await diagnosticService.submit(
      request.auth!.userId, attemptId(request.params.attemptId), parsed.data,
    ));
  });

  router.get("/attempts/:attemptId/results", async (request, response) => {
    response.json(await diagnosticService.getResult(
      request.auth!.userId, attemptId(request.params.attemptId),
    ));
  });

  return router;
}
