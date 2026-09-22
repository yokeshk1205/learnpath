import { randomUUID } from "node:crypto";

import pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createAnalyticsService } from "../src/analytics/service.js";
import { createApp } from "../src/app.js";
import { createAuthService } from "../src/auth/service.js";
import { createCatalogService } from "../src/catalog/service.js";
import { createCandidateService } from "../src/candidates/service.js";
import { createEnrollmentService } from "../src/enrollments/service.js";
import { createGovernanceService } from "../src/governance/service.js";
import { createDiagnosticService } from "../src/diagnostics/service.js";
import { createLearnerSkillService } from "../src/learner-skills/service.js";
import { createLearningService } from "../src/learning/service.js";
import { createPracticeService } from "../src/practice/service.js";
import { createPathService } from "../src/paths/service.js";
import type { InferenceClientContract } from "../src/paths/types.js";
import { createPrerequisiteService } from "../src/prerequisites/service.js";
import { createRetentionService } from "../src/retention/service.js";
import { createRecommendationService } from "../src/recommendations/service.js";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error("TEST_DATABASE_URL is required for authentication integration tests.");
}

const { Pool } = pg;
const pool = new Pool({ connectionString, max: 5 });
const authService = createAuthService(pool);
const prerequisiteService = createPrerequisiteService(pool);
const retentionService = createRetentionService(pool);
const candidateService = createCandidateService(pool, prerequisiteService, retentionService);
let receivedFeatureBatches: Array<Array<{ features: Record<string, number>; skillId: string }>> = [];
const inferenceClient: InferenceClientContract = {
  async predict(candidates) {
    receivedFeatureBatches.push(candidates);
    return {
      featureVersion: "learner-candidate-features-v2",
      generatedAt: new Date().toISOString(),
      inferenceVersion: "integration-inference-v2",
      modelVersion: "integration-benefit-ranking-v2",
      predictions: candidates.map((candidate, index) => ({
        benefitProbability: 0.75 - index * 0.01,
        skillId: candidate.skillId,
      })),
      servingStatus: "INTEGRATION_TEST",
    };
  },
  async provenance() {
    return {
      featureVersion: "learner-candidate-features-v2",
      generatedAt: new Date().toISOString(),
      inferenceVersion: "integration-inference-v2",
      modelVersion: "integration-benefit-ranking-v2",
      servingStatus: "INTEGRATION_TEST",
    };
  },
};
const app = createApp({
  analyticsService: createAnalyticsService(pool),
  authService,
  candidateService,
  catalogService: createCatalogService(pool),
  diagnosticService: createDiagnosticService(pool),
  enrollmentService: createEnrollmentService(pool),
  governanceService: createGovernanceService(pool),
  learnerSkillService: createLearnerSkillService(pool),
  learningService: createLearningService(pool),
  practiceService: createPracticeService(pool),
  pathService: createPathService(pool, candidateService, inferenceClient),
  prerequisiteService,
  recommendationService: createRecommendationService(pool),
  retentionService,
  probeDatabase: async () => void (await pool.query("SELECT 1")),
});

function cookiePair(response: request.Response): string {
  const header = response.headers["set-cookie"] as unknown as string[] | undefined;
  if (!header?.[0]) throw new Error("Expected a refresh cookie.");
  return header[0].split(";", 1)[0]!;
}

beforeAll(async () => {
  const migration = await pool.query(
    "SELECT 1 FROM schema_migrations WHERE version = '0024_complete_skill_learning_workflows.sql'",
  );
  if (migration.rowCount !== 1) {
    throw new Error("Migration 0024_complete_skill_learning_workflows.sql must be applied before integration tests.");
  }
});

beforeEach(async () => {
  receivedFeatureBatches = [];
  await pool.query("TRUNCATE TABLE refresh_sessions, user_roles, users CASCADE");
});

afterAll(async () => {
  await pool.end();
});

describe("PostgreSQL authentication lifecycle", () => {
  it("registers a normalized learner, hashes its password, and blocks admin access", async () => {
    const agent = request.agent(app);
    const registration = await agent.post("/auth/register").send({
      displayName: "  Ada Learner  ",
      email: "ADA@Example.COM",
      password: "correct-horse-battery-staple",
    });

    expect(registration.status).toBe(201);
    expect(registration.body.user).toMatchObject({
      displayName: "Ada Learner",
      email: "ada@example.com",
      roles: ["LEARNER"],
    });
    expect(registration.body.refreshToken).toBeUndefined();
    expect(registration.headers["set-cookie"]![0]).toContain("HttpOnly");

    const storedUser = await pool.query<{ email: string; password_hash: string }>(
      "SELECT email, password_hash FROM users WHERE email = $1",
      ["ada@example.com"],
    );
    expect(storedUser.rows[0]?.email).toBe("ada@example.com");
    expect(storedUser.rows[0]?.password_hash).toMatch(/^\$argon2id\$/);

    const me = await agent
      .get("/auth/me")
      .set("Authorization", `Bearer ${registration.body.accessToken}`);
    expect(me.status).toBe(200);

    const admin = await agent
      .get("/admin/access-check")
      .set("Authorization", `Bearer ${registration.body.accessToken}`);
    expect(admin.status).toBe(403);

    const duplicate = await request(app).post("/auth/register").send({
      displayName: "Another Ada",
      email: "ada@example.com",
      password: "another-correct-secure-password",
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe("EMAIL_ALREADY_REGISTERED");
  });

  it("logs in, rotates refresh credentials, and revokes the chain on token reuse", async () => {
    await request(app).post("/auth/register").send({
      displayName: "Grace Learner",
      email: "grace@example.com",
      password: "correct-horse-battery-staple",
    });

    const invalid = await request(app).post("/auth/login").send({
      email: "grace@example.com",
      password: "incorrect-password",
    });
    expect(invalid.status).toBe(401);
    expect(invalid.body.error.code).toBe("INVALID_CREDENTIALS");

    const login = await request(app).post("/auth/login").send({
      email: "grace@example.com",
      password: "correct-horse-battery-staple",
    });
    expect(login.status).toBe(200);
    const originalCookie = cookiePair(login);

    const refreshed = await request(app).post("/auth/refresh").set("Cookie", originalCookie);
    expect(refreshed.status).toBe(200);
    const replacementCookie = cookiePair(refreshed);
    expect(replacementCookie).not.toBe(originalCookie);

    const reuse = await request(app).post("/auth/refresh").set("Cookie", originalCookie);
    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe("REFRESH_TOKEN_REUSED");

    const revokedReplacement = await request(app)
      .post("/auth/refresh")
      .set("Cookie", replacementCookie);
    expect(revokedReplacement.status).toBe(401);
  });

  it("allows an explicitly assigned administrator and revokes logout sessions", async () => {
    const registration = await request(app).post("/auth/register").send({
      displayName: "Admin User",
      email: "admin@example.com",
      password: "correct-horse-battery-staple",
    });
    const userId = registration.body.user.id as string;
    await pool.query(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT $1, id FROM roles WHERE code = 'ADMIN'`,
      [userId],
    );

    const login = await request(app).post("/auth/login").send({
      email: "admin@example.com",
      password: "correct-horse-battery-staple",
    });
    expect(login.body.user.roles).toEqual(["ADMIN", "LEARNER"]);
    const cookie = cookiePair(login);

    const access = await request(app)
      .get("/admin/access-check")
      .set("Authorization", `Bearer ${login.body.accessToken}`);
    expect(access.status).toBe(200);

    const logout = await request(app).post("/auth/logout").set("Cookie", cookie);
    expect(logout.status).toBe(204);
    const refresh = await request(app).post("/auth/refresh").set("Cookie", cookie);
    expect(refresh.status).toBe(401);
  });
});

describe("PostgreSQL curriculum and learner-goal lifecycle", () => {
  it("returns the real seeded graph and global cross-course skill mappings", async () => {
    const registration = await request(app).post("/auth/register").send({
      displayName: "Graph Learner",
      email: "graph@example.com",
      password: "correct-horse-battery-staple",
    });
    const authorization = `Bearer ${registration.body.accessToken}`;

    const overview = await request(app).get("/catalog/overview").set("Authorization", authorization);
    expect(overview.status).toBe(200);
    expect(overview.body.stats).toEqual({
      categories: 8,
      courses: 5,
      domains: 1,
      prerequisiteEdges: 86,
      skills: 36,
    });
    expect(overview.body.goals).toHaveLength(3);

    const goalId = overview.body.goals[0].id as string;
    const detail = await request(app)
      .get(`/catalog/goals/${goalId}`)
      .set("Authorization", authorization);
    expect(detail.status).toBe(200);
    expect(detail.body.skills.length).toBeGreaterThan(10);
    expect(detail.body.prerequisites.length).toBeGreaterThan(10);
    expect(
      detail.body.skills.some((skill: { courses: unknown[] }) => skill.courses.length > 1),
    ).toBe(true);
  });

  it("persists goal selection and reflects it in the next overview", async () => {
    const registration = await request(app).post("/auth/register").send({
      displayName: "Goal Learner",
      email: "goal@example.com",
      password: "correct-horse-battery-staple",
    });
    const authorization = `Bearer ${registration.body.accessToken}`;
    const before = await request(app).get("/catalog/overview").set("Authorization", authorization);
    const goalId = before.body.goals[0].id as string;

    const selection = await request(app)
      .post("/catalog/learner-goals")
      .set("Authorization", authorization)
      .send({ goalId, priority: 1 });
    expect(selection.status).toBe(201);
    expect(selection.body.goal).toMatchObject({ goalId, priority: 1, status: "ACTIVE" });

    const after = await request(app).get("/catalog/overview").set("Authorization", authorization);
    expect(after.body.learnerGoals).toHaveLength(1);
    expect(after.body.goals.find((goal: { id: string }) => goal.id === goalId).isSelected).toBe(true);

    const secondGoalId = before.body.goals[1].id as string;
    await request(app)
      .post("/catalog/learner-goals")
      .set("Authorization", authorization)
      .send({ goalId: secondGoalId, priority: 1 });
    const switched = await request(app).get("/catalog/overview").set("Authorization", authorization);
    expect(switched.body.goals.filter((goal: { isSelected: boolean }) => goal.isSelected)).toHaveLength(1);
    expect(switched.body.goals.find((goal: { id: string }) => goal.id === secondGoalId).isSelected).toBe(true);
    expect(switched.body.learnerGoals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ goalId, status: "PAUSED" }),
        expect.objectContaining({ goalId: secondGoalId, status: "ACTIVE" }),
      ]),
    );
  });
});

describe("PostgreSQL multiple-enrollment and independent-progress lifecycle", () => {
  it("supports simultaneous courses, prevents duplicates, and isolates module progress", async () => {
    const registration = await request(app).post("/auth/register").send({
      displayName: "Multi Course Learner",
      email: "multi-course@example.com",
      password: "correct-horse-battery-staple",
    });
    const authorization = `Bearer ${registration.body.accessToken}`;
    const catalog = await request(app).get("/catalog/overview").set("Authorization", authorization);
    const firstCourseId = catalog.body.courses[0].id as string;
    const secondCourseId = catalog.body.courses[1].id as string;

    const first = await request(app)
      .post("/enrollments")
      .set("Authorization", authorization)
      .send({ courseId: firstCourseId });
    const second = await request(app)
      .post("/enrollments")
      .set("Authorization", authorization)
      .send({ courseId: secondCourseId });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.enrollment).toMatchObject({ progressPercentage: 0, status: "ACTIVE" });
    expect(second.body.enrollment).toMatchObject({ progressPercentage: 0, status: "ACTIVE" });

    const duplicate = await request(app)
      .post("/enrollments")
      .set("Authorization", authorization)
      .send({ courseId: firstCourseId });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe("ALREADY_ENROLLED");

    const firstEnrollmentId = first.body.enrollment.id as string;
    const firstModuleId = first.body.modules[0].id as string;
    const secondModuleId = first.body.modules[1].id as string;
    const locked = await request(app)
      .post(`/enrollments/${firstEnrollmentId}/modules/${secondModuleId}/progress`)
      .set("Authorization", authorization)
      .send({ status: "IN_PROGRESS" });
    expect(locked.status).toBe(409);
    expect(locked.body.error.code).toBe("MODULE_LOCKED");

    const started = await request(app)
      .post(`/enrollments/${firstEnrollmentId}/modules/${firstModuleId}/progress`)
      .set("Authorization", authorization)
      .send({ status: "IN_PROGRESS" });
    expect(started.status).toBe(200);
    expect(started.body.modules[0].status).toBe("IN_PROGRESS");
    const completed = await request(app)
      .post(`/enrollments/${firstEnrollmentId}/modules/${firstModuleId}/progress`)
      .set("Authorization", authorization)
      .send({ status: "COMPLETED" });
    expect(completed.status).toBe(200);
    expect(completed.body.enrollment).toMatchObject({ completedModules: 1, progressPercentage: 33.33 });
    expect(completed.body.modules[1].isAccessible).toBe(true);

    const enrollments = await request(app).get("/enrollments").set("Authorization", authorization);
    expect(enrollments.body.enrollments).toHaveLength(2);
    expect(
      enrollments.body.enrollments.find(
        (enrollment: { id: string }) => enrollment.id === second.body.enrollment.id,
      ).progressPercentage,
    ).toBe(0);
  });
});

describe("PostgreSQL global learner skill model", () => {
  it("uses one evidence-aware skill state across goals and overlapping courses", async () => {
    const registration = await request(app).post("/auth/register").send({
      displayName: "Skill Passport Learner",
      email: "skill-passport@example.com",
      password: "correct-horse-battery-staple",
    });
    const learnerId = registration.body.user.id as string;
    const authorization = `Bearer ${registration.body.accessToken}`;
    const catalog = await request(app).get("/catalog/overview").set("Authorization", authorization);
    const goalId = catalog.body.goals[0].id as string;

    await request(app)
      .post("/catalog/learner-goals")
      .set("Authorization", authorization)
      .send({ goalId, priority: 1 });

    const overlapping = await pool.query<{
      first_course_id: string;
      second_course_id: string;
      skill_id: string;
    }>(
      `SELECT first.course_id AS first_course_id,
              second.course_id AS second_course_id,
              first.skill_id
       FROM course_skills first
       JOIN course_skills second
         ON second.skill_id = first.skill_id
        AND second.course_id > first.course_id
       ORDER BY first.skill_id
       LIMIT 1`,
    );
    const pair = overlapping.rows[0]!;
    const first = await request(app)
      .post("/enrollments")
      .set("Authorization", authorization)
      .send({ courseId: pair.first_course_id, learningGoalId: goalId });
    await request(app)
      .post("/enrollments")
      .set("Authorization", authorization)
      .send({ courseId: pair.second_course_id, learningGoalId: goalId });

    const passport = await request(app)
      .get("/learner-skills")
      .set("Authorization", authorization);
    expect(passport.status).toBe(200);
    expect(passport.body.summary.trackedSkills).toBeGreaterThan(0);
    expect(passport.body.summary).toMatchObject({
      assessedSkills: 0,
      averageConfidence: null,
      averageMastery: null,
      averageRetention: null,
      evidenceCoverage: 0,
      totalAttempts: 0,
    });

    const shared = passport.body.skills.find(
      (skill: { id: string }) => skill.id === pair.skill_id,
    );
    expect(shared).toMatchObject({
      evidenceStatus: "UNASSESSED",
      mastery: null,
      confidence: null,
      retention: null,
    });
    expect(shared.courseContexts).toHaveLength(2);

    const uniqueness = await pool.query<{ distinct_skills: string; records: string }>(
      `SELECT COUNT(*)::text AS records,
              COUNT(DISTINCT skill_id)::text AS distinct_skills
       FROM learner_skill_mastery WHERE learner_id = $1`,
      [learnerId],
    );
    expect(uniqueness.rows[0]!.records).toBe(uniqueness.rows[0]!.distinct_skills);

    await request(app)
      .post(`/enrollments/${first.body.enrollment.id}/modules/${first.body.modules[0].id}/progress`)
      .set("Authorization", authorization)
      .send({ status: "COMPLETED" });
    const afterCompletion = await pool.query<{ mastery: string | null }>(
      "SELECT mastery FROM learner_skill_mastery WHERE learner_id = $1 AND skill_id = $2",
      [learnerId, pair.skill_id],
    );
    expect(afterCompletion.rows[0]!.mastery).toBeNull();
  });
});

describe("PostgreSQL diagnostic assessment lifecycle", () => {
  it("scores each tested skill independently and persists inspectable evidence", async () => {
    const registration = await request(app).post("/auth/register").send({
      displayName: "Diagnostic Learner",
      email: "diagnostic@example.com",
      password: "correct-horse-battery-staple",
    });
    const learnerId = registration.body.user.id as string;
    const authorization = `Bearer ${registration.body.accessToken}`;
    const catalog = await request(app).get("/catalog/overview").set("Authorization", authorization);
    const goalId = catalog.body.goals[0].id as string;

    await request(app).post("/catalog/learner-goals")
      .set("Authorization", authorization).send({ goalId, priority: 1 });

    const overview = await request(app).get("/diagnostics/overview").set("Authorization", authorization);
    expect(overview.status).toBe(200);
    expect(overview.body.assessment).toMatchObject({ questionCount: 16, skillCount: 8 });
    expect(overview.body.latestAttempt).toBeNull();

    const started = await request(app).post("/diagnostics/start")
      .set("Authorization", authorization).send({ goalId });
    expect(started.status).toBe(201);
    expect(started.body.questions).toHaveLength(16);
    expect(started.body.questions.every(
      (question: { options: Array<Record<string, unknown>> }) => question.options.every(
        (option) => !("isCorrect" in option),
      ),
    )).toBe(true);

    const attemptId = started.body.id as string;
    const questions = started.body.questions as Array<{
      id: string;
      options: Array<{ id: string }>;
    }>;
    const incomplete = await request(app).post(`/diagnostics/attempts/${attemptId}/submit`)
      .set("Authorization", authorization)
      .send({ answers: [{ questionId: questions[0]!.id, optionId: questions[0]!.options[0]!.id }] });
    expect(incomplete.status).toBe(400);
    expect(incomplete.body.error.code).toBe("INCOMPLETE_DIAGNOSTIC");

    const optionRows = await pool.query<{ id: string; is_correct: boolean; question_id: string }>(
      `SELECT id, question_id, is_correct
       FROM question_options
       WHERE question_id = ANY($1::uuid[])
       ORDER BY question_id, option_key`,
      [questions.map((question) => question.id)],
    );
    const optionsByQuestion = new Map<string, Array<{ id: string; isCorrect: boolean }>>();
    for (const option of optionRows.rows) {
      const options = optionsByQuestion.get(option.question_id) ?? [];
      options.push({ id: option.id, isCorrect: option.is_correct });
      optionsByQuestion.set(option.question_id, options);
    }
    const answers = questions.map((question, index) => {
      const options = optionsByQuestion.get(question.id)!;
      const selected = options.find((option) => option.isCorrect === (index < 8))!;
      return { optionId: selected.id, questionId: question.id };
    });

    const submitted = await request(app).post(`/diagnostics/attempts/${attemptId}/submit`)
      .set("Authorization", authorization)
      .send({ answers, durationSeconds: 240 });
    expect(submitted.status).toBe(200);
    expect(submitted.body.attempt).toMatchObject({
      correctCount: 8, durationSeconds: 240, overallScore: 0.5, questionCount: 16,
    });
    expect(submitted.body.skillResults).toHaveLength(8);
    expect(submitted.body.skillResults.map((result: { score: number }) => result.score)).toEqual(
      expect.arrayContaining([0, 1]),
    );
    expect(submitted.body.skillResults.every(
      (result: { confidenceAfter: number; masteryAfter: number }) => (
        result.masteryAfter >= 0 && result.masteryAfter <= 1
        && result.confidenceAfter > 0 && result.confidenceAfter <= 0.45
      ),
    )).toBe(true);
    expect(submitted.body.answers).toHaveLength(16);
    expect(submitted.body.answers.every(
      (answer: { correctOptionContent: string; explanation: string }) => (
        answer.correctOptionContent.length > 0 && answer.explanation.length > 0
      ),
    )).toBe(true);

    const diagnosticActivity = await request(app).get("/learning/overview")
      .set("Authorization", authorization);
    expect(diagnosticActivity.status).toBe(200);
    expect(diagnosticActivity.body.activity[0]).toMatchObject({
      durationSeconds: 240,
      eventType: "ASSESSMENT_SUBMITTED",
      result: { correctCount: 8, overallScore: 0.5, questionCount: 16 },
    });

    const assessedStates = await pool.query<{ retention: string | null; retention_state: string }>(
      `SELECT retention, retention_state FROM learner_skill_mastery
       WHERE learner_id = $1 AND last_assessed_at IS NOT NULL`,
      [learnerId],
    );
    expect(assessedStates.rows).toHaveLength(8);
    expect(assessedStates.rows.every((state) => state.retention !== null && state.retention_state !== "UNKNOWN")).toBe(true);

    const passport = await request(app).get("/learner-skills").set("Authorization", authorization);
    expect(passport.body.summary).toMatchObject({ assessedSkills: 8, totalAttempts: 16 });
    expect(passport.body.summary.averageMastery).not.toBeNull();
    expect(passport.body.summary.averageConfidence).not.toBeNull();

    const prerequisiteAnalysis = await request(app)
      .get("/prerequisites/analysis").set("Authorization", authorization);
    expect(prerequisiteAnalysis.status).toBe(200);
    expect(prerequisiteAnalysis.body.summary.goalReadiness).toBeGreaterThan(0);
    expect(prerequisiteAnalysis.body.summary.goalReadiness).toBeLessThan(1);
    expect(
      prerequisiteAnalysis.body.summary.masteredSkills
      + prerequisiteAnalysis.body.summary.unlockedSkills
      + prerequisiteAnalysis.body.summary.lockedSkills,
    ).toBe(prerequisiteAnalysis.body.summary.goalSkills);
    expect(prerequisiteAnalysis.body.summary.requiredEdges).toBeGreaterThan(0);
    expect(prerequisiteAnalysis.body.validOrder).toHaveLength(prerequisiteAnalysis.body.skills.length);
    const position = new Map<string, number>(
      prerequisiteAnalysis.body.validOrder.map((skillId: string, index: number) => [skillId, index]),
    );
    for (const skill of prerequisiteAnalysis.body.skills as Array<{
      id: string;
      prerequisites: Array<{ prerequisiteSkillId: string; relationshipType: string }>;
    }>) {
      for (const prerequisite of skill.prerequisites.filter(
        (check) => check.relationshipType === "REQUIRED",
      )) {
        expect(position.get(prerequisite.prerequisiteSkillId)).toBeLessThan(position.get(skill.id)!);
      }
    }
    const locked = prerequisiteAnalysis.body.skills.find(
      (skill: { status: string }) => skill.status === "LOCKED",
    );
    expect(locked.missingPrerequisites.length).toBeGreaterThan(0);
    expect(locked.explanation).toMatch(/required prerequisite/i);
    expect(prerequisiteAnalysis.body.skills.some(
      (skill: { courseContexts: unknown[]; currentMastery: number | null }) => (
        skill.currentMastery !== null && skill.courseContexts.length > 1
      ),
    )).toBe(true);
    expect(JSON.stringify(prerequisiteAnalysis.body)).not.toMatch(/benefitProbability|modelScore|mlScore/);

    const history = await request(app)
      .get(`/diagnostics/attempts/${attemptId}/results`).set("Authorization", authorization);
    expect(history.status).toBe(200);
    expect(history.body.skillResults).toEqual(submitted.body.skillResults);

    const duplicate = await request(app).post(`/diagnostics/attempts/${attemptId}/submit`)
      .set("Authorization", authorization).send({ answers });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe("DIAGNOSTIC_ALREADY_SUBMITTED");
  });
});

describe("PostgreSQL Phase 9 evidence-driven learner model", () => {
  it("runs diagnostic, practice, cross-course reuse, and readiness without a learning goal", async () => {
    const context = await pool.query<{
      course_id: string;
      dependent_skill_id: string;
      required_mastery: string;
      second_course_id: string;
      skill_id: string;
    }>(
      `SELECT DISTINCT a.course_id, q.skill_id,
              shared.course_id AS second_course_id,
              sp.skill_id AS dependent_skill_id,
              sp.required_mastery
       FROM assessments a
       JOIN assessment_questions aq ON aq.assessment_id = a.id
       JOIN questions q ON q.id = aq.question_id
       JOIN skill_prerequisites sp
         ON sp.prerequisite_skill_id = q.skill_id
        AND sp.relationship_type = 'REQUIRED'
       JOIN course_skills dependent
         ON dependent.course_id = a.course_id
        AND dependent.skill_id = sp.skill_id
       JOIN course_skills shared
         ON shared.skill_id = q.skill_id
        AND shared.course_id <> a.course_id
       WHERE a.assessment_type = 'DIAGNOSTIC'
         AND a.course_id IS NOT NULL
         AND (
           SELECT COUNT(*) FROM skill_prerequisites all_prerequisites
           WHERE all_prerequisites.skill_id = sp.skill_id
             AND all_prerequisites.relationship_type = 'REQUIRED'
         ) = 1
       ORDER BY a.course_id, q.skill_id, shared.course_id
       LIMIT 1`,
    );
    const selectedContext = context.rows[0]!;
    const registration = await request(app).post("/auth/register").send({
      displayName: "Goal Optional Learner",
      email: "goal-optional@example.com",
      password: "correct-horse-battery-staple",
    });
    const learnerId = registration.body.user.id as string;
    const authorization = `Bearer ${registration.body.accessToken}`;

    const initialCatalog = await request(app).get("/catalog/overview").set("Authorization", authorization);
    expect(initialCatalog.body.learnerGoals).toHaveLength(0);
    expect(initialCatalog.body.goals.every((goal: { isSelected: boolean }) => !goal.isSelected)).toBe(true);

    const firstEnrollment = await request(app).post("/enrollments")
      .set("Authorization", authorization).send({ courseId: selectedContext.course_id });
    expect(firstEnrollment.status).toBe(201);
    expect(firstEnrollment.body.enrollment).toMatchObject({
      learningGoalId: null, progressPercentage: 0, status: "ACTIVE",
    });
    const firstEnrollmentId = firstEnrollment.body.enrollment.id as string;

    const overview = await request(app)
      .get(`/diagnostics/overview?enrollmentId=${firstEnrollmentId}`)
      .set("Authorization", authorization);
    expect(overview.status).toBe(200);
    expect(overview.body.context).toMatchObject({
      enrollmentId: firstEnrollmentId, type: "COURSE",
    });
    expect(overview.body.activeGoal).toBeNull();
    expect(overview.body.assessment.questionCount).toBeGreaterThan(0);

    const started = await request(app).post("/diagnostics/start")
      .set("Authorization", authorization).send({ enrollmentId: firstEnrollmentId });
    expect(started.status).toBe(201);
    expect(started.body.context.type).toBe("COURSE");
    expect(started.body.goal).toBeNull();
    const questions = started.body.questions as Array<{ id: string; skillId: string }>;
    expect(started.body.selection).toMatchObject({
      currentStage: "COVERAGE",
      policyVersion: "evidence-driven-adaptive-v5",
      questionBudget: expect.any(Number),
      selectedQuestionCount: 1,
    });
    expect(questions).toHaveLength(1);
    expect(started.body.selection.questionBudget).toBeLessThanOrEqual(28);
    const savedDraft = await request(app)
      .put(`/diagnostics/attempts/${started.body.id}/answers/${questions[0]!.id}`)
      .set("Authorization", authorization)
      .send({ isUnsure: true, optionId: null, responseSeconds: 11 });
    expect(savedDraft.status).toBe(200);
    expect(savedDraft.body.savedAnswer).toMatchObject({
      isUnsure: true, optionId: null, questionId: questions[0]!.id, responseSeconds: 11,
    });
    const resumed = await request(app)
      .get(`/diagnostics/attempts/${started.body.id}`)
      .set("Authorization", authorization);
    expect(resumed.status).toBe(200);
    expect(resumed.body.savedAnswers).toEqual([
      expect.objectContaining({ isUnsure: true, optionId: null, questionId: questions[0]!.id }),
    ]);
    expect(resumed.body.questions).toHaveLength(2);
    let adaptiveAttempt = resumed.body;
    while (adaptiveAttempt.savedAnswers.length < adaptiveAttempt.selection.questionBudget) {
      const answeredIds = new Set(adaptiveAttempt.savedAnswers.map(
        (answer: { questionId: string }) => answer.questionId,
      ));
      const question = adaptiveAttempt.questions.find(
        (candidate: { id: string }) => !answeredIds.has(candidate.id),
      ) as { id: string; skillId: string } | undefined;
      expect(question).toBeDefined();
      if (!question) throw new Error("Adaptive diagnostic did not reveal the next question.");
      const shouldBeCorrect = question.skillId !== selectedContext.skill_id
        && question.skillId !== selectedContext.dependent_skill_id;
      const option = await pool.query<{ id: string }>(
        `SELECT id FROM question_options
         WHERE question_id = $1 AND is_correct = $2 LIMIT 1`,
        [question.id, shouldBeCorrect],
      );
      const saved = await request(app)
        .put(`/diagnostics/attempts/${started.body.id}/answers/${question.id}`)
        .set("Authorization", authorization)
        .send({ isUnsure: false, optionId: option.rows[0]!.id, responseSeconds: 12 });
      expect(saved.status).toBe(200);
      adaptiveAttempt = saved.body.attempt;
    }
    expect(adaptiveAttempt.questions).toHaveLength(adaptiveAttempt.selection.questionBudget);
    expect(adaptiveAttempt.questions.at(-1).selectionStage).toBe("VERIFICATION");
    const diagnosticAnswers = adaptiveAttempt.savedAnswers.map((answer: {
      isUnsure: boolean;
      optionId: string | null;
      questionId: string;
      responseSeconds: number;
    }) => ({
      isUnsure: answer.isUnsure,
      optionId: answer.optionId,
      questionId: answer.questionId,
      responseSeconds: answer.responseSeconds,
    }));
    const diagnostic = await request(app)
      .post(`/diagnostics/attempts/${started.body.id}/submit`)
      .set("Authorization", authorization)
      .send({ answers: diagnosticAnswers, durationSeconds: 180 });
    expect(diagnostic.status).toBe(200);
    const targetDiagnostic = diagnostic.body.skillResults.find(
      (skill: { skillId: string }) => skill.skillId === selectedContext.skill_id,
    );
    expect(targetDiagnostic).toMatchObject({ evidenceStateAfter: "ESTIMATED" });
    expect(targetDiagnostic.masteryAfter).toBeGreaterThan(0);
    expect(targetDiagnostic.masteryAfter).toBeLessThan(0.5);
    expect(targetDiagnostic.confidenceAfter).toBeLessThanOrEqual(0.45);
    expect(diagnostic.body.untestedSkills).toEqual(expect.any(Array));

    const beforeReadiness = await request(app)
      .get(`/prerequisites/analysis?enrollmentId=${firstEnrollmentId}`)
      .set("Authorization", authorization);
    expect(beforeReadiness.status).toBe(200);
    expect(beforeReadiness.body.context.type).toBe("COURSE");
    const dependentBefore = beforeReadiness.body.skills.find(
      (skill: { id: string }) => skill.id === selectedContext.dependent_skill_id,
    );
    expect(dependentBefore.status).toBe("LOCKED");

    const beforePassport = await request(app).get("/learner-skills").set("Authorization", authorization);
    const unrelatedBefore = beforePassport.body.skills.find((skill: { id: string }) => (
      skill.id !== selectedContext.skill_id && skill.id !== selectedContext.dependent_skill_id
    ));
    const unrelatedSnapshot = {
      confidence: unrelatedBefore.confidence,
      evidenceCount: unrelatedBefore.evidenceCount,
      evidenceState: unrelatedBefore.evidenceState,
      mastery: unrelatedBefore.mastery,
    };

    const answerPractice = async (correct: boolean) => {
      const practice = await request(app).post("/practice/start")
        .set("Authorization", authorization)
        .send({ enrollmentId: firstEnrollmentId, skillId: selectedContext.skill_id });
      expect(practice.status).toBe(201);
      expect(JSON.stringify(practice.body.question)).not.toContain("isCorrect");
      const option = await pool.query<{ id: string }>(
        `SELECT id FROM question_options
         WHERE question_id = $1 AND is_correct = $2 LIMIT 1`,
        [practice.body.question.id, correct],
      );
      return request(app).post(`/practice/attempts/${practice.body.id}/submit`)
        .set("Authorization", authorization)
        .send({ durationSeconds: 30, hintsUsed: 0, optionId: option.rows[0]!.id });
    };

    const correctPractice = await answerPractice(true);
    expect(correctPractice.status).toBe(200);
    expect(correctPractice.body.evidence.masteryAfter).toBeGreaterThan(targetDiagnostic.masteryAfter);
    const incorrectPractice = await answerPractice(false);
    expect(incorrectPractice.body.evidence.masteryAfter)
      .toBeLessThan(correctPractice.body.evidence.masteryAfter);

    let latestPractice = incorrectPractice;
    const requiredMastery = Number(selectedContext.required_mastery);
    for (let index = 0; index < 9 && latestPractice.body.evidence.masteryAfter < requiredMastery; index += 1) {
      latestPractice = await answerPractice(true);
      expect(latestPractice.status).toBe(200);
    }
    expect(latestPractice.body.evidence.masteryAfter).toBeGreaterThanOrEqual(requiredMastery);
    expect(latestPractice.body.evidence.confidenceAfter).toBeGreaterThan(targetDiagnostic.confidenceAfter);
    expect(latestPractice.body.evidence.evidenceStateAfter).not.toBe("VERIFIED");

    const afterReadiness = await request(app)
      .get(`/prerequisites/analysis?enrollmentId=${firstEnrollmentId}`)
      .set("Authorization", authorization);
    const dependentAfter = afterReadiness.body.skills.find(
      (skill: { id: string }) => skill.id === selectedContext.dependent_skill_id,
    );
    expect(dependentAfter.status).toBe("UNLOCKED");
    expect(afterReadiness.body.summary.contextReadiness).toBeGreaterThanOrEqual(
      beforeReadiness.body.summary.contextReadiness,
    );

    const secondEnrollment = await request(app).post("/enrollments")
      .set("Authorization", authorization).send({ courseId: selectedContext.second_course_id });
    expect(secondEnrollment.status).toBe(201);
    const afterPassport = await request(app).get("/learner-skills").set("Authorization", authorization);
    const shared = afterPassport.body.skills.find(
      (skill: { id: string }) => skill.id === selectedContext.skill_id,
    );
    expect(shared.courseContexts).toHaveLength(2);
    expect(shared).toMatchObject({
      evidenceState: latestPractice.body.evidence.evidenceStateAfter,
      mastery: latestPractice.body.evidence.masteryAfter,
    });
    expect(shared.lastAssessedAt).not.toBeNull();
    expect(shared.lastPracticedAt).not.toBeNull();

    const unrelatedAfter = afterPassport.body.skills.find(
      (skill: { id: string }) => skill.id === unrelatedBefore.id,
    );
    expect({
      confidence: unrelatedAfter.confidence,
      evidenceCount: unrelatedAfter.evidenceCount,
      evidenceState: unrelatedAfter.evidenceState,
      mastery: unrelatedAfter.mastery,
    }).toEqual(unrelatedSnapshot);

    const progress = await request(app).get("/enrollments").set("Authorization", authorization);
    expect(progress.body.enrollments).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: firstEnrollmentId, progressPercentage: 0 }),
      expect.objectContaining({ id: secondEnrollment.body.enrollment.id, progressPercentage: 0 }),
    ]));

    const evidence = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM skill_evidence
       WHERE learner_id = $1 AND skill_id = $2`,
      [learnerId, selectedContext.skill_id],
    );
    expect(Number(evidence.rows[0]!.count)).toBeGreaterThan(2);
    await expect(pool.query(
      `UPDATE skill_evidence SET score = score
       WHERE learner_id = $1 AND skill_id = $2`,
      [learnerId, selectedContext.skill_id],
    )).rejects.toMatchObject({ code: "55000" });
  });
});

describe("PostgreSQL Phase 10 retention and forgetting", () => {
  it("decays retained knowledge, preserves mastery, ignores passive activity, and records a real retention check", async () => {
    const contextResult = await pool.query<{
      course_id: string;
      module_id: string;
      resource_id: string;
      skill_id: string;
    }>(
      `SELECT course_skill.course_id, course_skill.module_id, course_skill.skill_id,
              resource.id AS resource_id
       FROM course_skills course_skill
       JOIN questions question
         ON question.skill_id = course_skill.skill_id AND question.status = 'ACTIVE'
       JOIN learning_resource_skills resource_skill
         ON resource_skill.skill_id = course_skill.skill_id AND resource_skill.is_primary
       JOIN learning_resources resource
         ON resource.id = resource_skill.resource_id AND resource.is_active
       JOIN learning_resource_contexts resource_context
         ON resource_context.resource_id = resource.id
        AND resource_context.course_id = course_skill.course_id
        AND resource_context.module_id = course_skill.module_id
       ORDER BY course_skill.course_id, course_skill.skill_id
       LIMIT 1`,
    );
    const context = contextResult.rows[0]!;
    const registration = await request(app).post("/auth/register").send({
      displayName: "Retention Learner",
      email: "retention@example.com",
      password: "correct-horse-battery-staple",
    });
    const learnerId = registration.body.user.id as string;
    const authorization = `Bearer ${registration.body.accessToken}`;
    const enrollment = await request(app).post("/enrollments")
      .set("Authorization", authorization).send({ courseId: context.course_id });
    expect(enrollment.status).toBe(201);

    await pool.query(
      `INSERT INTO skill_evidence (
         id, learner_id, skill_id, source_type, source_id, score, correct, difficulty,
         attempt_number, mastery_before, mastery_after, confidence_before, confidence_after,
         evidence_state_before, evidence_state_after, metadata, created_at,
         retention_before, retention_after, retention_state_before, retention_state_after
       ) VALUES (
         gen_random_uuid(), $1, $2, 'ASSESSMENT', NULL, 0.85, TRUE, 3,
         1, NULL, 0.85, NULL, 0.72,
         'UNKNOWN', 'ASSESSED', '{"integration":"historical_retention"}'::jsonb,
         NOW() - INTERVAL '120 days', NULL, 0.85, 'UNKNOWN', 'STRONG'
       )`,
      [learnerId, context.skill_id],
    );
    await pool.query(
      `UPDATE learner_skill_mastery
       SET mastery = 0.85, confidence = 0.72, evidence_state = 'ASSESSED',
           attempt_count = 1, correct_attempts = 1,
           last_assessed_at = NOW() - INTERVAL '120 days',
           retention = 0.85, retention_state = 'STRONG',
           retention_anchor_at = NOW() - INTERVAL '120 days',
           retention_calculated_at = NOW() - INTERVAL '120 days'
       WHERE learner_id = $1 AND skill_id = $2`,
      [learnerId, context.skill_id],
    );

    const before = await request(app).get("/retention").set("Authorization", authorization);
    expect(before.status).toBe(200);
    const forgotten = before.body.skills.find((skill: { id: string }) => skill.id === context.skill_id);
    expect(forgotten.mastery).toBe(0.85);
    expect(forgotten.retention).toBeLessThan(0.55);
    expect(["AT_RISK", "CRITICAL"]).toContain(forgotten.state);
    expect(forgotten.revisionDue).toBe(true);
    const passportBeforeRevision = await request(app)
      .get("/learner-skills")
      .set("Authorization", authorization);
    const passportForgotten = passportBeforeRevision.body.skills.find(
      (skill: { id: string }) => skill.id === context.skill_id,
    );
    expect(passportForgotten.mastery).toBe(0.85);
    expect(passportForgotten.retention).toBeCloseTo(forgotten.retention, 4);
    expect(passportForgotten.retentionState).toBe(forgotten.state);
    expect(passportForgotten.revisionDue).toBe(true);
    expect(passportBeforeRevision.body.summary.revisionDueSkills).toBeGreaterThan(0);
    const retentionBeforeActivity = Number(forgotten.retention);
    const anchorBeforeActivity = forgotten.anchorAt as string;

    const startedResource = await request(app)
      .post(`/learning/resources/${context.resource_id}/events`)
      .set("Authorization", authorization)
      .send({
        courseId: context.course_id, durationSeconds: 0,
        eventType: "RESOURCE_STARTED", moduleId: context.module_id,
      });
    expect(startedResource.status).toBe(201);
    const completedResource = await request(app)
      .post(`/learning/resources/${context.resource_id}/events`)
      .set("Authorization", authorization)
      .send({
        courseId: context.course_id, durationSeconds: 120,
        eventType: "RESOURCE_COMPLETED", moduleId: context.module_id,
      });
    expect(completedResource.status).toBe(201);
    const afterActivity = await request(app).get("/retention").set("Authorization", authorization);
    const stillForgotten = afterActivity.body.skills.find(
      (skill: { id: string }) => skill.id === context.skill_id,
    );
    expect(stillForgotten.mastery).toBe(0.85);
    expect(stillForgotten.anchorAt).toBe(anchorBeforeActivity);
    expect(Number(stillForgotten.retention)).toBeCloseTo(retentionBeforeActivity, 3);
    expect(stillForgotten.revisionDue).toBe(true);

    const startedCheck = await request(app).post("/practice/start")
      .set("Authorization", authorization)
      .send({
        enrollmentId: enrollment.body.enrollment.id,
        mode: "RETENTION_CHECK",
        skillId: context.skill_id,
      });
    expect(startedCheck.status).toBe(201);
    expect(startedCheck.body.mode).toBe("RETENTION_CHECK");
    expect(JSON.stringify(startedCheck.body.question)).not.toContain("isCorrect");
    const correctOption = await pool.query<{ id: string }>(
      `SELECT id FROM question_options
       WHERE question_id = $1 AND is_correct LIMIT 1`,
      [startedCheck.body.question.id],
    );
    const submittedCheck = await request(app)
      .post(`/practice/attempts/${startedCheck.body.id}/submit`)
      .set("Authorization", authorization)
      .send({ durationSeconds: 35, hintsUsed: 0, optionId: correctOption.rows[0]!.id });
    expect(submittedCheck.status).toBe(200);
    expect(submittedCheck.body.feedback.isCorrect).toBe(true);
    expect(submittedCheck.body.evidence.retentionBefore).toBeLessThan(0.55);
    expect(submittedCheck.body.evidence.retentionAfter)
      .toBeGreaterThan(submittedCheck.body.evidence.retentionBefore);
    expect(submittedCheck.body.evidence.retentionStateAfter).toBe("STRONG");

    const afterCheck = await request(app).get("/retention").set("Authorization", authorization);
    const refreshed = afterCheck.body.skills.find((skill: { id: string }) => skill.id === context.skill_id);
    expect(refreshed.retention).toBeCloseTo(submittedCheck.body.evidence.retentionAfter, 3);
    expect(refreshed.revisionDue).toBe(false);
    expect(refreshed.state).toBe("STRONG");

    const storedEvidence = await pool.query<{
      retention_after: string;
      retention_before: string;
      source_type: string;
    }>(
      `SELECT source_type, retention_before, retention_after
       FROM skill_evidence
       WHERE learner_id = $1 AND skill_id = $2
       ORDER BY created_at DESC LIMIT 1`,
      [learnerId, context.skill_id],
    );
    expect(storedEvidence.rows[0]).toMatchObject({ source_type: "RETENTION_CHECK" });
    expect(Number(storedEvidence.rows[0]!.retention_after))
      .toBeGreaterThan(Number(storedEvidence.rows[0]!.retention_before));
    const activity = await pool.query<{ event_type: string }>(
      `SELECT event_type FROM learner_activity_events
       WHERE learner_id = $1 AND skill_id = $2
       ORDER BY occurred_at`,
      [learnerId, context.skill_id],
    );
    expect(activity.rows.map((row) => row.event_type)).toEqual(expect.arrayContaining([
      "RETENTION_CHECK_STARTED", "RETENTION_CHECK_COMPLETED",
    ]));
    const progress = await request(app).get("/enrollments").set("Authorization", authorization);
    expect(progress.body.enrollments[0].progressPercentage).toBe(0);
  });
});

describe("PostgreSQL Phase 11 candidate generation and evaluation baselines", () => {
  it("builds an enrollment-scoped pool without a goal and promotes real retention risk to revision", async () => {
    const contextResult = await pool.query<{ course_id: string }>(
      `SELECT DISTINCT course_skill.course_id
       FROM course_skills course_skill
       JOIN courses course ON course.id = course_skill.course_id AND course.is_active
       WHERE EXISTS (
         SELECT 1
         FROM course_skills dependent_course_skill
         JOIN skill_prerequisites prerequisite
           ON prerequisite.skill_id = dependent_course_skill.skill_id
          AND prerequisite.relationship_type = 'REQUIRED'
         WHERE dependent_course_skill.course_id = course_skill.course_id
       )
       ORDER BY course_skill.course_id
       LIMIT 1`,
    );
    const context = contextResult.rows[0]!;
    const registration = await request(app).post("/auth/register").send({
      displayName: "Candidate Learner",
      email: "candidate@example.com",
      password: "correct-horse-battery-staple",
    });
    const learnerId = registration.body.user.id as string;
    const authorization = `Bearer ${registration.body.accessToken}`;
    const enrollment = await request(app).post("/enrollments")
      .set("Authorization", authorization).send({ courseId: context.course_id });
    const enrollmentId = enrollment.body.enrollment.id as string;

    const initial = await request(app)
      .get(`/enrollments/${enrollmentId}/candidates`)
      .set("Authorization", authorization);
    expect(initial.status).toBe(200);
    expect(initial.body.context).toMatchObject({
      courseId: context.course_id,
      enrollmentId,
      goalId: null,
      goalName: null,
    });
    expect(initial.body.summary.eligibleSkills).toBeGreaterThan(0);
    expect(initial.body.summary.lockedSkills).toBeGreaterThan(0);
    expect(initial.body.candidates.locked.every(
      (candidate: { missingPrerequisites: unknown[] }) => candidate.missingPrerequisites.length > 0,
    )).toBe(true);
    const initiallyEligible = initial.body.candidates.eligible[0];
    expect(initiallyEligible).toMatchObject({
      evidenceState: "UNKNOWN",
      mastery: null,
      masteryGap: null,
      status: "ELIGIBLE",
    });
    const selectedSkillId = initiallyEligible.id as string;

    await pool.query(
      `INSERT INTO learner_skill_mastery (id, learner_id, skill_id)
       VALUES (gen_random_uuid(), $1, $2)
       ON CONFLICT (learner_id, skill_id) DO NOTHING`,
      [learnerId, selectedSkillId],
    );

    await pool.query(
      `INSERT INTO skill_evidence (
         id, learner_id, skill_id, source_type, source_id, score, correct, difficulty,
         attempt_number, mastery_before, mastery_after, confidence_before, confidence_after,
         evidence_state_before, evidence_state_after, metadata, created_at,
         retention_before, retention_after, retention_state_before, retention_state_after
       ) VALUES (
         gen_random_uuid(), $1, $2, 'ASSESSMENT', NULL, 0.85, TRUE, 3,
         1, NULL, 0.85, NULL, 0.72,
         'UNKNOWN', 'ASSESSED', '{"integration":"candidate_revision"}'::jsonb,
         NOW() - INTERVAL '120 days', NULL, 0.85, 'UNKNOWN', 'STRONG'
       )`,
      [learnerId, selectedSkillId],
    );
    await pool.query(
      `UPDATE learner_skill_mastery
       SET mastery = 0.85, confidence = 0.72, evidence_state = 'ASSESSED',
           attempt_count = 1, correct_attempts = 1,
           last_assessed_at = NOW() - INTERVAL '120 days',
           retention = 0.85, retention_state = 'STRONG',
           retention_anchor_at = NOW() - INTERVAL '120 days',
           retention_calculated_at = NOW() - INTERVAL '120 days'
       WHERE learner_id = $1 AND skill_id = $2`,
      [learnerId, selectedSkillId],
    );

    const refreshed = await request(app)
      .get(`/enrollments/${enrollmentId}/candidates`)
      .set("Authorization", authorization);
    expect(refreshed.status).toBe(200);
    const revision = refreshed.body.candidates.eligible.find(
      (candidate: { id: string }) => candidate.id === selectedSkillId,
    );
    expect(revision).toMatchObject({
      evidenceState: "ASSESSED",
      kind: "REVISION",
      mastery: 0.85,
      revisionDue: true,
      status: "ELIGIBLE",
    });
    expect(revision.retention).toBeLessThan(0.55);
    expect(refreshed.body.summary.revisionCandidates).toBeGreaterThan(0);

    const eligibleIds = new Set<string>(refreshed.body.candidates.eligible.map(
      (candidate: { id: string }) => candidate.id,
    ));
    for (const baseline of [
      refreshed.body.baselines.highestSkillGap.ranking,
      refreshed.body.baselines.popularity.ranking,
    ] as Array<Array<{ skillId: string }>>) {
      expect(baseline.length).toBe(eligibleIds.size);
      expect(baseline.every((entry) => eligibleIds.has(entry.skillId))).toBe(true);
    }
    const popularityEntry = refreshed.body.baselines.popularity.ranking.find(
      (entry: { skillId: string }) => entry.skillId === selectedSkillId,
    );
    expect(popularityEntry.observedLearners).toBeGreaterThanOrEqual(1);
    expect(popularityEntry.evidenceObservations).toBeGreaterThanOrEqual(1);
    expect(refreshed.body.baselines.disclaimer).toContain("not ML predictions");

    const progress = await request(app).get("/enrollments").set("Authorization", authorization);
    expect(progress.body.enrollments[0].progressPercentage).toBe(0);
  });
});

describe("PostgreSQL learning resources and activity lifecycle", () => {
  it("reuses global skill resources and records study behavior without manufacturing mastery", async () => {
    const registration = await request(app).post("/auth/register").send({
      displayName: "Resource Learner",
      email: "resources@example.com",
      password: "correct-horse-battery-staple",
    });
    const learnerId = registration.body.user.id as string;
    const authorization = `Bearer ${registration.body.accessToken}`;
    const catalog = await request(app).get("/catalog/overview").set("Authorization", authorization);
    const goalId = catalog.body.goals[0].id as string;
    await request(app).post("/catalog/learner-goals")
      .set("Authorization", authorization).send({ goalId, priority: 1 });

    const enrollments: request.Response[] = [];
    for (const course of catalog.body.courses.slice(0, 3) as Array<{ id: string }>) {
      enrollments.push(await request(app).post("/enrollments")
        .set("Authorization", authorization)
        .send({ courseId: course.id, learningGoalId: goalId }));
    }
    expect(enrollments.every((enrollment) => enrollment.status === 201)).toBe(true);

    const overview = await request(app).get("/learning/overview").set("Authorization", authorization);
    expect(overview.status).toBe(200);
    expect(overview.body.summary.availableResources).toBeGreaterThan(0);
    expect(overview.body.summary.skillsCovered).toBeGreaterThan(0);
    expect(overview.body.summary).toMatchObject({
      completedResources: 0, eventsRecorded: 0, startedResources: 0,
      totalTimeSpentSeconds: 0,
    });
    const sharedResource = overview.body.resources.find((resource: {
      contexts: Array<{ isEnrolled: boolean }>;
    }) => resource.contexts.filter((context) => context.isEnrolled).length > 1);
    expect(sharedResource).toBeTruthy();
    expect(sharedResource.contentSections).toBeUndefined();
    const context = sharedResource.contexts.find(
      (item: { isEnrolled: boolean }) => item.isEnrolled,
    ) as { courseId: string; moduleId: string };

    const beforeState = await pool.query<{
      confidence: string | null;
      mastery: string | null;
      total_time_spent_seconds: number;
    }>(
      `SELECT mastery, confidence, total_time_spent_seconds
       FROM learner_skill_mastery WHERE learner_id = $1 AND skill_id = $2`,
      [learnerId, sharedResource.skillId],
    );
    expect(beforeState.rows[0]).toMatchObject({
      confidence: null, mastery: null, total_time_spent_seconds: 0,
    });

    const premature = await request(app).post(`/learning/resources/${sharedResource.id}/events`)
      .set("Authorization", authorization)
      .send({
        courseId: context.courseId, durationSeconds: 12,
        eventType: "RESOURCE_COMPLETED", moduleId: context.moduleId,
      });
    expect(premature.status).toBe(409);
    expect(premature.body.error.code).toBe("RESOURCE_NOT_STARTED");

    const started = await request(app).post(`/learning/resources/${sharedResource.id}/events`)
      .set("Authorization", authorization)
      .send({
        courseId: context.courseId, durationSeconds: 0,
        eventType: "RESOURCE_STARTED", moduleId: context.moduleId,
      });
    expect(started.status).toBe(201);
    expect(started.body.event).toMatchObject({
      courseId: context.courseId,
      eventType: "RESOURCE_STARTED",
      resourceId: sharedResource.id,
      skillId: sharedResource.skillId,
    });
    expect(started.body.resource.progress).toMatchObject({
      completionCount: 0, sessionCount: 1, status: "IN_PROGRESS",
    });

    const completed = await request(app).post(`/learning/resources/${sharedResource.id}/events`)
      .set("Authorization", authorization)
      .send({
        courseId: context.courseId, durationSeconds: 125,
        eventType: "RESOURCE_COMPLETED", moduleId: context.moduleId,
        metadata: { interface: "integration_test" },
      });
    expect(completed.status).toBe(201);
    expect(completed.body.resource.progress).toMatchObject({
      completionCount: 1, sessionCount: 1, status: "COMPLETED",
      totalTimeSpentSeconds: 125,
    });
    expect(completed.body.resource).toMatchObject({
      id: sharedResource.id, mastery: null, skillId: sharedResource.skillId,
    });
    expect(completed.body.resource.contentSections.length).toBeGreaterThan(0);
    expect(completed.body.resource.learningObjectives.length).toBeGreaterThan(0);

    const afterState = await pool.query<{
      confidence: string | null;
      last_practiced_at: Date | null;
      mastery: string | null;
      total_time_spent_seconds: number;
    }>(
      `SELECT mastery, confidence, total_time_spent_seconds, last_practiced_at
       FROM learner_skill_mastery WHERE learner_id = $1 AND skill_id = $2`,
      [learnerId, sharedResource.skillId],
    );
    expect(afterState.rows[0]).toMatchObject({
      confidence: null, mastery: null, total_time_spent_seconds: 125,
    });
    expect(afterState.rows[0]?.last_practiced_at).not.toBeNull();

    const filtered = await request(app)
      .get(`/learning/overview?courseId=${context.courseId}&moduleId=${context.moduleId}`)
      .set("Authorization", authorization);
    expect(filtered.status).toBe(200);
    expect(filtered.body.resources.length).toBeGreaterThan(0);
    expect(filtered.body.resources.every((resource: {
      contexts: Array<{ courseId: string; moduleId: string }>;
    }) => resource.contexts.some((item) => (
      item.courseId === context.courseId && item.moduleId === context.moduleId
    )))).toBe(true);
    expect(filtered.body.activity.map(
      (event: { eventType: string }) => event.eventType,
    )).toEqual(expect.arrayContaining(["RESOURCE_STARTED", "RESOURCE_COMPLETED"]));

    const owningEnrollment = enrollments[0]!;
    const module = owningEnrollment.body.modules[0] as { id: string; isAccessible: boolean };
    expect(module.isAccessible).toBe(true);
    const lesson = await request(app)
      .post(`/enrollments/${owningEnrollment.body.enrollment.id}/modules/${module.id}/progress`)
      .set("Authorization", authorization).send({ status: "IN_PROGRESS" });
    expect(lesson.status).toBe(200);
    const afterLesson = await request(app).get("/learning/overview")
      .set("Authorization", authorization);
    expect(afterLesson.body.activity.map(
      (event: { eventType: string }) => event.eventType,
    )).toContain("LESSON_STARTED");
  });
});

describe("PostgreSQL course path lifecycle", () => {
  it("persists one graph-gated ML path per enrollment with production-aligned live features", async () => {
    const registration = await request(app).post("/auth/register").send({
      displayName: "Path Learner",
      email: "path@example.com",
      password: "correct-horse-battery-staple",
    });
    const authorization = `Bearer ${registration.body.accessToken}`;
    const catalog = await request(app).get("/catalog/overview").set("Authorization", authorization);
    const course = catalog.body.courses[0] as { id: string };
    const enrollment = await request(app).post("/enrollments")
      .set("Authorization", authorization).send({ courseId: course.id });
    const enrollmentId = enrollment.body.enrollment.id as string;

    const generated = await request(app).post(`/enrollments/${enrollmentId}/path/generate`)
      .set("Authorization", authorization);
    expect(generated.status).toBe(201);
    expect(generated.body.created).toBe(true);
    expect(generated.body.path).toMatchObject({
      pathVersion: 1,
      policyVersion: "course-path-policy-v2-graph",
      provenance: {
        featureVersion: "learner-candidate-features-v2",
        modelVersion: "integration-benefit-ranking-v2",
      },
    });
    expect(generated.body.path.learnNext).toMatchObject({ lane: "RECOMMENDED_NEXT" });
    expect(receivedFeatureBatches).toHaveLength(1);
    expect(Object.keys(receivedFeatureBatches[0]![0]!.features)).toHaveLength(55);
    expect(receivedFeatureBatches[0]![0]!.features).toHaveProperty("learner_performance_proxy");
    expect(receivedFeatureBatches[0]![0]!.features).not.toHaveProperty("learner_ability");
    expect(generated.body.path.items.filter(
      (item: { lane: string }) => item.lane === "LOCKED",
    ).every((item: { benefitProbability: number | null }) => item.benefitProbability === null)).toBe(true);

    const repeated = await request(app).post(`/enrollments/${enrollmentId}/path/generate`)
      .set("Authorization", authorization);
    expect(repeated.status).toBe(200);
    expect(repeated.body.created).toBe(false);
    expect(repeated.body.path.id).toBe(generated.body.path.id);
    expect(receivedFeatureBatches).toHaveLength(1);

    const persisted = await pool.query<{ path_count: number; recommendation_events: number }>(
      `SELECT
         (SELECT COUNT(*)::int FROM personalized_paths WHERE enrollment_id = $1) AS path_count,
         (SELECT COUNT(*)::int FROM learner_activity_events
          WHERE learner_id = $2 AND event_type = 'RECOMMENDATION_SHOWN') AS recommendation_events`,
      [enrollmentId, registration.body.user.id],
    );
    expect(persisted.rows[0]).toEqual({ path_count: 1, recommendation_events: 1 });
  });

  it("coordinates independent paths across simultaneous enrollments with an active goal signal", async () => {
    const registration = await request(app).post("/auth/register").send({
      displayName: "Coordinated Learner",
      email: "coordination@example.com",
      password: "correct-horse-battery-staple",
    });
    const learnerId = registration.body.user.id as string;
    const authorization = `Bearer ${registration.body.accessToken}`;
    const catalog = await request(app).get("/catalog/overview").set("Authorization", authorization);
    const goal = catalog.body.goals[0] as { id: string };
    const courses = (catalog.body.courses as Array<{ id: string }>).slice(0, 2);
    const selectedGoal = await request(app).post("/catalog/learner-goals")
      .set("Authorization", authorization).send({ goalId: goal.id, priority: 1 });
    expect(selectedGoal.status).toBe(201);

    const enrollments = [] as string[];
    for (const course of courses) {
      const enrollment = await request(app).post("/enrollments")
        .set("Authorization", authorization)
        .send({ courseId: course.id, learningGoalId: goal.id });
      expect(enrollment.status).toBe(201);
      enrollments.push(enrollment.body.enrollment.id as string);
    }

    const coordinated = await request(app).post("/enrollments/paths/coordination/generate")
      .set("Authorization", authorization);
    expect(coordinated.status).toBe(201);
    expect(coordinated.body.generatedPaths).toBe(2);
    expect(coordinated.body.plan).toMatchObject({
      activeGoal: { goalId: goal.id, priority: 1 },
      policyVersion: "cross-course-coordination-v1",
      summary: { activeCourses: 2, coordinatedCourses: 2, coursesWithoutPaths: 0 },
    });
    expect(coordinated.body.plan.learnNext.coordinationScore)
      .toBeGreaterThanOrEqual(coordinated.body.plan.learnNext.basePriority);
    expect(coordinated.body.plan.learnNext.reasonCodes).toContain("CROSS_COURSE_PRIORITY");

    const persisted = await pool.query<{
      coordinated_events: number;
      enrollment_paths: number;
    }>(
      `SELECT
         (SELECT COUNT(*)::int FROM personalized_paths
          WHERE learner_id = $1 AND enrollment_id = ANY($2::uuid[])) AS enrollment_paths,
         (SELECT COUNT(*)::int FROM learner_activity_events
          WHERE learner_id = $1 AND event_type = 'RECOMMENDATION_COORDINATED') AS coordinated_events`,
      [learnerId, enrollments],
    );
    expect(persisted.rows[0]).toEqual({ coordinated_events: 1, enrollment_paths: 2 });

    const read = await request(app).get("/enrollments/paths/coordination")
      .set("Authorization", authorization);
    expect(read.status).toBe(200);
    expect(read.body.learnNext.item.skillId).toBe(coordinated.body.plan.learnNext.item.skillId);
    expect(new Set(read.body.courses.map((course: { pathId: string }) => course.pathId)).size).toBe(2);
  });

  it("attributes response, lesson completion, and later assessed evidence to one path version", async () => {
    const registration = await request(app).post("/auth/register").send({
      displayName: "Outcome Learner",
      email: "outcome@example.com",
      password: "correct-horse-battery-staple",
    });
    const authorization = `Bearer ${registration.body.accessToken}`;
    const catalog = await request(app).get("/catalog/overview").set("Authorization", authorization);
    const course = catalog.body.courses[0] as { id: string };
    const enrollment = await request(app).post("/enrollments")
      .set("Authorization", authorization).send({ courseId: course.id });
    const enrollmentId = enrollment.body.enrollment.id as string;

    const diagnostic = await request(app).post("/diagnostics/start")
      .set("Authorization", authorization).send({ enrollmentId });
    let adaptiveAttempt = diagnostic.body as {
      id: string;
      questions: Array<{ id: string }>;
      savedAnswers: Array<{ isUnsure: boolean; optionId: string | null; questionId: string; responseSeconds: number }>;
      selection: { canComplete: boolean };
    };
    while (!adaptiveAttempt.selection.canComplete) {
      const question = adaptiveAttempt.questions.at(-1)!;
      const index = adaptiveAttempt.savedAnswers.length;
      const option = await pool.query<{ id: string }>(
        `SELECT id FROM question_options
         WHERE question_id = $1 AND is_correct = $2 ORDER BY option_key LIMIT 1`,
        [question.id, index % 2 === 0],
      );
      const saved = await request(app)
        .put(`/diagnostics/attempts/${adaptiveAttempt.id}/answers/${question.id}`)
        .set("Authorization", authorization)
        .send({ isUnsure: false, optionId: option.rows[0]!.id, responseSeconds: 20 });
      expect(saved.status).toBe(200);
      adaptiveAttempt = saved.body.attempt;
    }
    const answers = adaptiveAttempt.savedAnswers.map((answer) => ({
      isUnsure: answer.isUnsure,
      optionId: answer.optionId,
      questionId: answer.questionId,
      responseSeconds: answer.responseSeconds,
    }));
    const diagnosticResult = await request(app)
      .post(`/diagnostics/attempts/${diagnostic.body.id}/submit`)
      .set("Authorization", authorization)
      .send({ answers, durationSeconds: 300 });
    expect(diagnosticResult.status).toBe(200);

    const generated = await request(app).post(`/enrollments/${enrollmentId}/path/generate`)
      .set("Authorization", authorization);
    const pathId = generated.body.path.id as string;
    const pathVersion = generated.body.path.pathVersion as number;
    const skillId = generated.body.path.learnNext.skillId as string;
    const learning = await request(app)
      .get(`/learning/overview?courseId=${course.id}&skillId=${skillId}`)
      .set("Authorization", authorization);
    const resource = learning.body.resources[0] as { contexts: Array<{ courseId: string; moduleId: string }>; id: string };
    const context = resource.contexts.find((item) => item.courseId === course.id);

    const accepted = await request(app).post(`/recommendations/paths/${pathId}/feedback`)
      .set("Authorization", authorization)
      .send({ decision: "ACCEPTED", resourceId: resource.id });
    expect(accepted.status).toBe(201);
    const feedbackId = accepted.body.feedback.id as string;
    const metadata = { pathId, pathVersion: String(pathVersion), recommendationFeedbackId: feedbackId };
    await request(app).post(`/learning/resources/${resource.id}/events`)
      .set("Authorization", authorization)
      .send({ courseId: course.id, durationSeconds: 0, eventType: "RESOURCE_STARTED", metadata, moduleId: context?.moduleId });
    const completed = await request(app).post(`/learning/resources/${resource.id}/events`)
      .set("Authorization", authorization)
      .send({ courseId: course.id, durationSeconds: 600, eventType: "RESOURCE_COMPLETED", metadata, moduleId: context?.moduleId });
    expect(completed.status).toBe(201);

    const existingQuestion = await pool.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM questions
       WHERE skill_id = $1 AND status = 'ACTIVE' AND question_purpose = 'ASSESSMENT'`,
      [skillId],
    );
    if (existingQuestion.rows[0]!.count === 0) {
      const questionId = randomUUID();
      await pool.query(
        `INSERT INTO questions
           (id, skill_id, slug, prompt, difficulty, explanation, status, question_purpose)
         VALUES ($1, $2, $3, $4, 2, $5, 'ACTIVE', 'ASSESSMENT')`,
        [
          questionId,
          skillId,
          `outcome-evidence-${questionId}`,
          "Which answer demonstrates the recommended skill?",
          "The correct option represents assessed application of the recommended skill.",
        ],
      );
      await pool.query(
        `INSERT INTO question_options (id, question_id, option_key, content, is_correct)
         VALUES
           ($1, $3, 'A', 'A validated correct application', TRUE),
           ($2, $3, 'B', 'An unrelated response', FALSE)`,
        [randomUUID(), randomUUID(), questionId],
      );
    }
    const practice = await request(app).post("/practice/start")
      .set("Authorization", authorization).send({ enrollmentId, mode: "ASSESSMENT", skillId });
    expect(practice.status).toBe(201);
    const correct = await pool.query<{ id: string }>(
      `SELECT id FROM question_options WHERE question_id = $1 AND is_correct LIMIT 1`,
      [practice.body.question.id],
    );
    const assessed = await request(app).post(`/practice/attempts/${practice.body.id}/submit`)
      .set("Authorization", authorization)
      .send({ durationSeconds: 40, hintsUsed: 0, optionId: correct.rows[0]!.id });
    expect(assessed.status).toBe(200);

    const evaluation = await request(app).get("/recommendations/evaluation")
      .set("Authorization", authorization);
    expect(evaluation.status).toBe(200);
    expect(evaluation.body.summary).toMatchObject({
      accepted: 1, completed: 1, outcomeEvidence: 1, responded: 1, shown: 1,
    });
    expect(evaluation.body.records[0]).toMatchObject({
      decision: "ACCEPTED", evidenceAfterDecision: 1, pathId, pathVersion,
    });
    expect(evaluation.body.records[0].completion).not.toBeNull();
    expect(evaluation.body.records[0].outcomeState).toBe("OBSERVED_NO_BASELINE");
    expect(evaluation.body.records[0].learningGain).toBeNull();

    const analytics = await request(app).get("/analytics/overview")
      .set("Authorization", authorization);
    expect(analytics.status).toBe(200);
    expect(analytics.body.summary).toMatchObject({ activePaths: 1, enrolledCourses: 1 });
    expect(analytics.body.summary.assessedSkills).toBeGreaterThan(0);
    expect(analytics.body.summary.evidenceCount).toBeGreaterThan(0);
    expect(analytics.body.timeline.length).toBeGreaterThan(0);

    const governance = await request(app).get("/governance/overview")
      .set("Authorization", authorization);
    expect(governance.status).toBe(200);
    expect(governance.body.rates.state).toBe("INSUFFICIENT_DATA");
    expect(governance.body.retraining).toMatchObject({
      contentCoveragePass: true,
      eligible: false,
      requiredAssessedOutcomes: 100,
    });
    expect(governance.body.currentModel.modelVersion).toBe("integration-benefit-ranking-v2");
  });
});

describe("PostgreSQL prerequisite graph integrity", () => {
  it("rejects relationships that would make the global graph cyclic", async () => {
    const edge = await pool.query<{ prerequisite_skill_id: string; skill_id: string }>(
      `SELECT skill_id, prerequisite_skill_id
       FROM skill_prerequisites
       WHERE relationship_type = 'REQUIRED'
       ORDER BY skill_id
       LIMIT 1`,
    );
    const existing = edge.rows[0]!;

    await expect(pool.query(
      `INSERT INTO skill_prerequisites
         (skill_id, prerequisite_skill_id, required_mastery, relationship_type)
       VALUES ($1, $2, 0.7, 'REQUIRED')`,
      [existing.prerequisite_skill_id, existing.skill_id],
    )).rejects.toMatchObject({ code: "23514" });
  });
});

describe("Final curriculum content integrity", () => {
  it("keeps every active skill lesson-ready, assessable, and actionable across five courses", async () => {
    const coverage = await pool.query<{
      actionable_skills: number;
      active_courses: number;
      active_skills: number;
      assessment_skills: number;
      diagnostic_skills: number;
      lesson_skills: number;
      practice_skills: number;
    }>(
      `WITH question_coverage AS (
         SELECT skill_id,
                BOOL_OR(question_purpose = 'DIAGNOSTIC') AS has_diagnostic,
                BOOL_OR(question_purpose = 'PRACTICE') AS has_practice,
                BOOL_OR(question_purpose = 'ASSESSMENT') AS has_assessment
         FROM questions
         WHERE status = 'ACTIVE'
         GROUP BY skill_id
       ), lesson_coverage AS (
         SELECT resource_skill.skill_id,
                BOOL_OR(
                  resource.is_active
                  AND CARDINALITY(resource.learning_objectives) >= 3
                  AND jsonb_array_length(resource.content_sections) >= 3
                ) AS has_lesson
         FROM learning_resource_skills resource_skill
         JOIN learning_resources resource ON resource.id = resource_skill.resource_id
         WHERE resource_skill.is_primary
         GROUP BY resource_skill.skill_id
       )
       SELECT
         COUNT(*)::int AS active_skills,
         COUNT(*) FILTER (WHERE COALESCE(l.has_lesson, FALSE))::int AS lesson_skills,
         COUNT(*) FILTER (WHERE COALESCE(q.has_diagnostic, FALSE))::int AS diagnostic_skills,
         COUNT(*) FILTER (WHERE COALESCE(q.has_practice, FALSE))::int AS practice_skills,
         COUNT(*) FILTER (WHERE COALESCE(q.has_assessment, FALSE))::int AS assessment_skills,
         COUNT(*) FILTER (
           WHERE COALESCE(l.has_lesson, FALSE)
             AND COALESCE(q.has_diagnostic, FALSE)
             AND COALESCE(q.has_practice, FALSE)
             AND COALESCE(q.has_assessment, FALSE)
         )::int AS actionable_skills,
         (SELECT COUNT(*)::int FROM courses WHERE is_active) AS active_courses
       FROM skills s
       LEFT JOIN question_coverage q ON q.skill_id = s.id
       LEFT JOIN lesson_coverage l ON l.skill_id = s.id
       WHERE s.is_active`,
    );

    expect(coverage.rows[0]).toEqual({
      actionable_skills: 36,
      active_courses: 5,
      active_skills: 36,
      assessment_skills: 36,
      diagnostic_skills: 36,
      lesson_skills: 36,
      practice_skills: 36,
    });

    const invalidQuestions = await pool.query<{ invalid_count: number }>(
      `SELECT COUNT(*)::int AS invalid_count
       FROM questions q
       WHERE q.status = 'ACTIVE'
         AND (
           LENGTH(BTRIM(q.explanation)) = 0
           OR (SELECT COUNT(*) FROM question_options o WHERE o.question_id = q.id) < 2
           OR (SELECT COUNT(*) FROM question_options o WHERE o.question_id = q.id AND o.is_correct) <> 1
         )`,
    );
    expect(invalidQuestions.rows[0]!.invalid_count).toBe(0);
  });
});
