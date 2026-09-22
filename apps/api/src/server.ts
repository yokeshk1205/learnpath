import { createServer } from "node:http";

import { createAnalyticsService } from "./analytics/service.js";
import { createAssessmentProgramService } from "./assessment-programs/service.js";
import { createApp } from "./app.js";
import { createAuthService } from "./auth/service.js";
import { createCandidateService } from "./candidates/service.js";
import { config } from "./config.js";
import { createCatalogService } from "./catalog/service.js";
import { createDiagnosticService } from "./diagnostics/service.js";
import { createEnrollmentService } from "./enrollments/service.js";
import { createGovernanceService } from "./governance/service.js";
import { createLearnerSkillService } from "./learner-skills/service.js";
import { createLearningService } from "./learning/service.js";
import { closeDatabase, pool, probeDatabase } from "./database.js";
import { logger } from "./logger.js";
import { createPracticeService } from "./practice/service.js";
import { createInferenceClient } from "./paths/ml-client.js";
import { createPathService } from "./paths/service.js";
import { createPrerequisiteService } from "./prerequisites/service.js";
import { createGraphAnalyticsClient } from "./prerequisites/analytics-client.js";
import { createRetentionService } from "./retention/service.js";
import { createRecommendationService } from "./recommendations/service.js";

const prerequisiteService = createPrerequisiteService(
  pool,
  createGraphAnalyticsClient(config.mlServiceUrl, config.mlServiceTimeoutMs),
);
const retentionService = createRetentionService(pool);
const candidateService = createCandidateService(pool, prerequisiteService, retentionService);
const diagnosticService = createDiagnosticService(pool);
const app = createApp({
  assessmentProgramService: createAssessmentProgramService(pool, diagnosticService),
  analyticsService: createAnalyticsService(pool),
  authService: createAuthService(pool),
  candidateService,
  catalogService: createCatalogService(pool),
  diagnosticService,
  enrollmentService: createEnrollmentService(pool),
  governanceService: createGovernanceService(pool),
  learnerSkillService: createLearnerSkillService(pool),
  learningService: createLearningService(pool),
  practiceService: createPracticeService(pool),
  pathService: createPathService(
    pool,
    candidateService,
    createInferenceClient(config.mlServiceUrl, config.mlServiceTimeoutMs),
  ),
  prerequisiteService,
  recommendationService: createRecommendationService(pool),
  retentionService,
  probeDatabase,
});
const server = createServer(app);

server.listen(config.port, () => {
  logger.info({ port: config.port }, "LearnPath API listening");
});

async function shutdown(signal: string) {
  logger.info({ signal }, "Shutting down LearnPath API");
  server.close(async (error) => {
    await closeDatabase().catch((databaseError: unknown) => {
      logger.error({ error: databaseError }, "Failed to close PostgreSQL pool");
    });
    process.exit(error ? 1 : 0);
  });
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
