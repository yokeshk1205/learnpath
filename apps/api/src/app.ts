import cors from "cors";
import cookieParser from "cookie-parser";
import express, { type ErrorRequestHandler } from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";

import { createAnalyticsRouter } from "./analytics/router.js";
import type { AnalyticsServiceContract } from "./analytics/types.js";
import { createAssessmentProgramRouter } from "./assessment-programs/router.js";
import type { AssessmentProgramServiceContract } from "./assessment-programs/types.js";
import { requireAuthentication, requireRole } from "./auth/middleware.js";
import { createAuthRouter } from "./auth/router.js";
import type { AuthServiceContract } from "./auth/types.js";
import { createCandidateRouter } from "./candidates/router.js";
import type { CandidateServiceContract } from "./candidates/types.js";
import { createCatalogRouter } from "./catalog/router.js";
import type { CatalogServiceContract } from "./catalog/types.js";
import { config } from "./config.js";
import { AppError } from "./errors.js";
import { createGovernanceRouter } from "./governance/router.js";
import type { GovernanceServiceContract } from "./governance/types.js";
import { createDiagnosticRouter } from "./diagnostics/router.js";
import type { DiagnosticServiceContract } from "./diagnostics/types.js";
import { createEnrollmentRouter } from "./enrollments/router.js";
import type { EnrollmentServiceContract } from "./enrollments/types.js";
import { createLearnerSkillRouter } from "./learner-skills/router.js";
import type { LearnerSkillServiceContract } from "./learner-skills/types.js";
import { createLearningRouter } from "./learning/router.js";
import type { LearningServiceContract } from "./learning/types.js";
import { logger } from "./logger.js";
import { createPracticeRouter } from "./practice/router.js";
import type { PracticeServiceContract } from "./practice/types.js";
import { createPathRouter } from "./paths/router.js";
import type { PathServiceContract } from "./paths/types.js";
import { createPrerequisiteRouter } from "./prerequisites/router.js";
import type { PrerequisiteServiceContract } from "./prerequisites/types.js";
import { createRecommendationRouter } from "./recommendations/router.js";
import type { RecommendationServiceContract } from "./recommendations/types.js";
import { createRetentionRouter } from "./retention/router.js";
import type { RetentionServiceContract } from "./retention/types.js";

export type ReadinessProbe = () => Promise<void>;

export interface AppDependencies {
  assessmentProgramService?: AssessmentProgramServiceContract;
  analyticsService?: AnalyticsServiceContract;
  authService: AuthServiceContract;
  candidateService?: CandidateServiceContract;
  catalogService: CatalogServiceContract;
  enrollmentService: EnrollmentServiceContract;
  governanceService?: GovernanceServiceContract;
  diagnosticService: DiagnosticServiceContract;
  learnerSkillService: LearnerSkillServiceContract;
  learningService: LearningServiceContract;
  practiceService: PracticeServiceContract;
  pathService?: PathServiceContract;
  prerequisiteService: PrerequisiteServiceContract;
  recommendationService?: RecommendationServiceContract;
  retentionService: RetentionServiceContract;
  probeDatabase: ReadinessProbe;
}

export function createApp({ assessmentProgramService, analyticsService, authService, candidateService, catalogService, diagnosticService, enrollmentService, governanceService, learnerSkillService, learningService, practiceService, pathService, prerequisiteService, recommendationService, retentionService, probeDatabase }: AppDependencies) {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: config.webOrigins, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use(pinoHttp({ logger }));

  app.get("/", (_request, response) => {
    response.json({
      name: "LearnPath API",
      phase: 20,
      status: "sample_gated_model_governance",
      version: "0.20.0",
    });
  });

  app.get("/health/live", (_request, response) => {
    response.json({
      service: "learnpath-api",
      status: "ok",
      timestamp: new Date().toISOString(),
      version: "0.20.0",
    });
  });

  app.get("/health/ready", async (_request, response) => {
    try {
      await probeDatabase();
      response.json({
        components: { database: "up" },
        service: "learnpath-api",
        status: "ready",
        timestamp: new Date().toISOString(),
        version: "0.20.0",
      });
    } catch {
      response.status(503).json({
        components: { database: "down" },
        service: "learnpath-api",
        status: "not_ready",
        timestamp: new Date().toISOString(),
        version: "0.20.0",
      });
    }
  });

  app.use("/auth", createAuthRouter(authService));
  if (analyticsService) app.use("/analytics", createAnalyticsRouter(authService, analyticsService));
  app.use("/catalog", createCatalogRouter(authService, catalogService));
  app.use("/diagnostics", createDiagnosticRouter(authService, diagnosticService));
  if (assessmentProgramService) app.use("/assessment-programs", createAssessmentProgramRouter(authService, assessmentProgramService));
  if (candidateService) app.use("/enrollments", createCandidateRouter(authService, candidateService));
  if (pathService) app.use("/enrollments", createPathRouter(authService, pathService));
  app.use("/enrollments", createEnrollmentRouter(authService, enrollmentService));
  if (governanceService) app.use("/governance", createGovernanceRouter(authService, governanceService));
  app.use("/learner-skills", createLearnerSkillRouter(authService, learnerSkillService));
  app.use("/learning", createLearningRouter(authService, learningService));
  app.use("/practice", createPracticeRouter(authService, practiceService));
  app.use("/prerequisites", createPrerequisiteRouter(authService, prerequisiteService));
  if (recommendationService) app.use("/recommendations", createRecommendationRouter(authService, recommendationService));
  app.use("/retention", createRetentionRouter(authService, retentionService));

  app.get(
    "/admin/access-check",
    requireAuthentication(authService),
    requireRole("ADMIN"),
    (request, response) => {
      response.json({ authorized: true, userId: request.auth!.userId });
    },
  );

  app.use((_request, response) => {
    response.status(404).json({
      error: { code: "NOT_FOUND", message: "The requested route does not exist." },
    });
  });

  const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
    void _next;
    if (error instanceof AppError) {
      response.status(error.statusCode).json({
        error: {
          code: error.code,
          details: error.details,
          message: error.message,
        },
      });
      return;
    }
    logger.error({ error }, "Unhandled request error");
    response.status(500).json({
      error: { code: "INTERNAL_SERVER_ERROR", message: "An unexpected error occurred." },
    });
  };
  app.use(errorHandler);

  return app;
}
