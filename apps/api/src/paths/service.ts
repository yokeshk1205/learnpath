import { randomUUID } from "node:crypto";

import type { Pool, PoolClient } from "pg";

import type { CandidateServiceContract } from "../candidates/types.js";
import { AppError } from "../errors.js";
import { comparePaths } from "./change.js";
import { coordinateCoursePaths, type CoordinationGoalInput } from "./coordination.js";
import { constructPath } from "./engine.js";
import { buildLiveFeatureBatch } from "./features.js";
import { pathPolicy } from "./policy.js";
import type {
  InferenceClientContract,
  CoordinatedCoursePath,
  CoordinatedLearningPlan,
  PathItem,
  PathChangeSummary,
  PathServiceContract,
  PersonalizedPath,
} from "./types.js";

type DatabaseRow = Record<string, unknown>;

function numeric(value: unknown): number {
  return Number(value ?? 0);
}

function nullableNumeric(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function object(value: unknown): DatabaseRow {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) return value as DatabaseRow;
  if (typeof value === "string") return JSON.parse(value) as DatabaseRow;
  return {};
}

function array<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === "string") return JSON.parse(value) as T[];
  return [];
}

function snapshot(item: PathItem): DatabaseRow {
  return {
    category: item.category,
    dependencyLevel: item.dependencyLevel,
    description: item.description,
    difficulty: item.difficulty,
    evidenceState: item.evidenceState,
    goalRelevance: item.goalRelevance,
    graphMetrics: item.graphMetrics,
    isContextSkill: item.isContextSkill,
    isCore: item.isCore,
    missingPrerequisites: item.missingPrerequisites,
    module: item.module,
    name: item.name,
    practiceAvailable: item.practiceAvailable,
    prerequisites: item.prerequisites,
    resourceCount: item.resourceCount,
    retentionState: item.retentionState,
    revisionDue: item.revisionDue,
    slug: item.slug,
    targetMastery: item.targetMastery,
  };
}

function mapItem(row: DatabaseRow): PathItem {
  const context = object(row.context_snapshot);
  return {
    benefitProbability: nullableNumeric(row.benefit_probability),
    candidateKind: String(row.candidate_kind) as PathItem["candidateKind"],
    category: String(context.category),
    confidence: nullableNumeric(row.confidence_snapshot),
    dependencyLevel: numeric(context.dependencyLevel),
    description: String(context.description),
    difficulty: numeric(context.difficulty),
    evidenceState: String(context.evidenceState) as PathItem["evidenceState"],
    explanation: String(row.explanation),
    goalRelevance: nullableNumeric(context.goalRelevance),
    graphMetrics: context.graphMetrics ? context.graphMetrics as PathItem["graphMetrics"] : undefined,
    isContextSkill: Boolean(context.isContextSkill),
    isCore: Boolean(context.isCore),
    lane: String(row.lane) as PathItem["lane"],
    mastery: nullableNumeric(row.mastery_snapshot),
    missingPrerequisites: array(context.missingPrerequisites),
    module: context.module ? context.module as PathItem["module"] : null,
    name: String(context.name),
    position: numeric(row.position),
    practiceAvailable: Boolean(context.practiceAvailable),
    prerequisiteState: String(row.prerequisite_state) as PathItem["prerequisiteState"],
    prerequisites: array(context.prerequisites),
    priorityScore: nullableNumeric(row.priority_score),
    reasonCodes: array<string>(row.reason_codes),
    resourceCount: numeric(context.resourceCount),
    retention: nullableNumeric(row.retention_snapshot),
    retentionState: String(context.retentionState) as PathItem["retentionState"],
    revisionDue: Boolean(context.revisionDue),
    skillId: String(row.skill_id),
    slug: String(context.slug),
    targetMastery: numeric(context.targetMastery),
  };
}

function summary(items: PathItem[]): PersonalizedPath["summary"] {
  return {
    eligibleRanked: items.filter((item) => ["CURRENT", "RECOMMENDED_NEXT", "UPCOMING"].includes(item.lane)).length,
    locked: items.filter((item) => item.lane === "LOCKED").length,
    recognizedFromGlobalMastery: items.filter((item) => item.lane === "RECOGNIZED").length,
    revisions: items.filter((item) => item.revisionDue && item.lane !== "LOCKED").length,
    total: items.length,
  };
}

async function readPath(pool: Pool, learnerId: string, enrollmentId: string): Promise<PersonalizedPath | null> {
  const pathResult = await pool.query(
    `SELECT path.*, course.name AS course_name, course.slug AS course_slug,
            enrollment.status AS enrollment_status, enrollment.learning_goal_id AS goal_id,
            goal.name AS goal_name
     FROM personalized_paths path
     JOIN course_enrollments enrollment ON enrollment.id = path.enrollment_id
     JOIN courses course ON course.id = path.course_id
     LEFT JOIN learning_goals goal ON goal.id = enrollment.learning_goal_id
     WHERE path.enrollment_id = $1 AND path.learner_id = $2
     ORDER BY path.path_version DESC
     LIMIT 1`,
    [enrollmentId, learnerId],
  );
  const path = pathResult.rows[0] as DatabaseRow | undefined;
  if (!path) return null;
  const itemsResult = await pool.query(
    `SELECT * FROM personalized_path_items WHERE path_id = $1 ORDER BY position`,
    [path.id],
  );
  const items = (itemsResult.rows as DatabaseRow[]).map(mapItem);
  return {
    context: {
      courseId: String(path.course_id),
      courseName: String(path.course_name),
      courseSlug: String(path.course_slug),
      enrollmentId: String(path.enrollment_id),
      enrollmentStatus: String(path.enrollment_status) as PersonalizedPath["context"]["enrollmentStatus"],
      goalId: path.goal_id ? String(path.goal_id) : null,
      goalName: path.goal_name ? String(path.goal_name) : null,
    },
    generatedAt: new Date(String(path.generated_at)).toISOString(),
    id: String(path.id),
    invalidatedAt: path.invalidated_at ? new Date(String(path.invalidated_at)).toISOString() : null,
    invalidatedBySkillId: path.invalidated_by_skill_id ? String(path.invalidated_by_skill_id) : null,
    invalidationReason: path.invalidation_reason ? String(path.invalidation_reason) : null,
    items,
    learnNext: items.find((item) => item.lane === "RECOMMENDED_NEXT") ?? null,
    pathVersion: numeric(path.path_version),
    policyVersion: String(path.policy_version),
    previousPathId: path.previous_path_id ? String(path.previous_path_id) : null,
    provenance: {
      featureVersion: String(path.feature_version),
      inferenceVersion: String(path.inference_version),
      modelVersion: String(path.model_version),
      sourceClassification: String(path.source_classification),
    },
    status: String(path.status) as PersonalizedPath["status"],
    supersededAt: path.superseded_at ? new Date(String(path.superseded_at)).toISOString() : null,
    changeSummary: Object.keys(object(path.change_summary)).length
      ? object(path.change_summary) as unknown as PathChangeSummary
      : null,
    summary: summary(items),
  };
}

async function readHistory(pool: Pool, learnerId: string, enrollmentId: string): Promise<PersonalizedPath[]> {
  const result = await pool.query(
    `SELECT path_version FROM personalized_paths
     WHERE enrollment_id = $1 AND learner_id = $2
     ORDER BY path_version DESC`,
    [enrollmentId, learnerId],
  );
  const history: PersonalizedPath[] = [];
  for (const row of result.rows as DatabaseRow[]) {
    const versionResult = await pool.query(
      `SELECT path.*, course.name AS course_name, course.slug AS course_slug,
              enrollment.status AS enrollment_status, enrollment.learning_goal_id AS goal_id,
              goal.name AS goal_name
       FROM personalized_paths path
       JOIN course_enrollments enrollment ON enrollment.id = path.enrollment_id
       JOIN courses course ON course.id = path.course_id
       LEFT JOIN learning_goals goal ON goal.id = enrollment.learning_goal_id
       WHERE path.enrollment_id = $1 AND path.learner_id = $2 AND path.path_version = $3`,
      [enrollmentId, learnerId, row.path_version],
    );
    const pathRow = versionResult.rows[0] as DatabaseRow | undefined;
    if (!pathRow) continue;
    const itemResult = await pool.query(
      `SELECT * FROM personalized_path_items WHERE path_id = $1 ORDER BY position`,
      [pathRow.id],
    );
    const items = (itemResult.rows as DatabaseRow[]).map(mapItem);
    history.push({
      context: {
        courseId: String(pathRow.course_id), courseName: String(pathRow.course_name),
        courseSlug: String(pathRow.course_slug), enrollmentId: String(pathRow.enrollment_id),
        enrollmentStatus: String(pathRow.enrollment_status) as PersonalizedPath["context"]["enrollmentStatus"],
        goalId: pathRow.goal_id ? String(pathRow.goal_id) : null,
        goalName: pathRow.goal_name ? String(pathRow.goal_name) : null,
      },
      generatedAt: new Date(String(pathRow.generated_at)).toISOString(), id: String(pathRow.id),
      invalidatedAt: pathRow.invalidated_at ? new Date(String(pathRow.invalidated_at)).toISOString() : null,
      invalidatedBySkillId: pathRow.invalidated_by_skill_id ? String(pathRow.invalidated_by_skill_id) : null,
      invalidationReason: pathRow.invalidation_reason ? String(pathRow.invalidation_reason) : null,
      items, learnNext: items.find((item) => item.lane === "RECOMMENDED_NEXT") ?? null,
      pathVersion: numeric(pathRow.path_version), policyVersion: String(pathRow.policy_version),
      previousPathId: pathRow.previous_path_id ? String(pathRow.previous_path_id) : null,
      provenance: {
        featureVersion: String(pathRow.feature_version), inferenceVersion: String(pathRow.inference_version),
        modelVersion: String(pathRow.model_version), sourceClassification: String(pathRow.source_classification),
      },
      status: String(pathRow.status) as PersonalizedPath["status"],
      supersededAt: pathRow.superseded_at ? new Date(String(pathRow.superseded_at)).toISOString() : null,
      changeSummary: Object.keys(object(pathRow.change_summary)).length
        ? object(pathRow.change_summary) as unknown as PathChangeSummary : null,
      summary: summary(items),
    });
  }
  return history;
}

async function readCoordination(pool: Pool, learnerId: string): Promise<CoordinatedLearningPlan> {
  const enrollmentResult = await pool.query(
    `SELECT enrollment.id, enrollment.course_id, enrollment.status,
            enrollment.last_accessed_at, course.name AS course_name,
            course.slug AS course_slug,
            COALESCE(progress.progress_percentage, 0) AS progress_percentage
     FROM course_enrollments enrollment
     JOIN courses course ON course.id = enrollment.course_id
     LEFT JOIN learner_course_progress progress ON progress.enrollment_id = enrollment.id
     WHERE enrollment.learner_id = $1 AND enrollment.status <> 'DROPPED'
     ORDER BY CASE enrollment.status WHEN 'ACTIVE' THEN 0 WHEN 'PAUSED' THEN 1 ELSE 2 END,
              enrollment.last_accessed_at DESC, course.name`,
    [learnerId],
  );
  const courses: CoordinatedCoursePath[] = await Promise.all(
    (enrollmentResult.rows as DatabaseRow[]).map(async (row) => {
      const enrollmentId = String(row.id);
      const path = await readPath(pool, learnerId, enrollmentId);
      return {
        courseId: String(row.course_id),
        courseName: String(row.course_name),
        courseSlug: String(row.course_slug),
        enrollmentId,
        enrollmentStatus: String(row.status) as CoordinatedCoursePath["enrollmentStatus"],
        generatedAt: path?.generatedAt ?? null,
        lastAccessedAt: new Date(String(row.last_accessed_at)).toISOString(),
        learnNext: path?.learnNext ?? null,
        pathId: path?.id ?? null,
        pathState: !path ? "NOT_GENERATED" : path.status === "STALE" ? "STALE" : path.learnNext ? "READY" : "NO_ELIGIBLE_NEXT",
        pathVersion: path?.pathVersion ?? null,
        progressPercentage: numeric(row.progress_percentage),
      };
    }),
  );
  const goalResult = await pool.query(
    `SELECT learner_goal.goal_id, learner_goal.priority, learner_goal.target_date,
            goal.name
     FROM learner_goals learner_goal
     JOIN learning_goals goal ON goal.id = learner_goal.goal_id
     WHERE learner_goal.learner_id = $1 AND learner_goal.status = 'ACTIVE'
     ORDER BY learner_goal.priority, learner_goal.selected_at DESC
     LIMIT 1`,
    [learnerId],
  );
  const goalRow = goalResult.rows[0] as DatabaseRow | undefined;
  let activeGoal: CoordinationGoalInput | null = null;
  if (goalRow) {
    const relevanceResult = await pool.query(
      `SELECT skill_id, relevance FROM goal_skills WHERE goal_id = $1`,
      [goalRow.goal_id],
    );
    activeGoal = {
      goalId: String(goalRow.goal_id),
      name: String(goalRow.name),
      priority: numeric(goalRow.priority),
      relevanceBySkill: new Map(
        (relevanceResult.rows as DatabaseRow[]).map((row) => [String(row.skill_id), numeric(row.relevance)]),
      ),
      targetDate: goalRow.target_date ? String(goalRow.target_date) : null,
    };
  }
  return coordinateCoursePaths({ activeGoal, courses });
}

async function persist(
  client: PoolClient,
  learnerId: string,
  items: PathItem[],
  input: {
    context: { courseId: string; enrollmentId: string };
    featureVersion: string;
    inferenceVersion: string;
    modelVersion: string;
    pathVersion?: number;
    previousPathId?: string | null;
    changeSummary?: PathChangeSummary | null;
  },
): Promise<string> {
  const pathId = randomUUID();
  await client.query(
    `INSERT INTO personalized_paths (
       id, enrollment_id, learner_id, course_id, model_version, feature_version,
       inference_version, policy_version, source_classification, path_version,
       previous_path_id, change_summary
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)`,
    [
      pathId, input.context.enrollmentId, learnerId, input.context.courseId,
      input.modelVersion, input.featureVersion, input.inferenceVersion, pathPolicy.version,
      "MODEL INFERENCE — SYNTHETICALLY TRAINED",
      input.pathVersion ?? 1, input.previousPathId ?? null, JSON.stringify(input.changeSummary ?? {}),
    ],
  );
  for (const pathItem of items) {
    await client.query(
      `INSERT INTO personalized_path_items (
         id, path_id, skill_id, position, lane, candidate_kind,
         benefit_probability, priority_score, mastery_snapshot, confidence_snapshot,
         retention_snapshot, prerequisite_state, explanation, reason_codes,
         prerequisite_snapshot, context_snapshot
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16::jsonb)`,
      [
        randomUUID(), pathId, pathItem.skillId, pathItem.position, pathItem.lane,
        pathItem.candidateKind, pathItem.benefitProbability, pathItem.priorityScore,
        pathItem.mastery, pathItem.confidence, pathItem.retention,
        pathItem.prerequisiteState, pathItem.explanation, pathItem.reasonCodes,
        JSON.stringify(pathItem.prerequisites), JSON.stringify(snapshot(pathItem)),
      ],
    );
  }
  const learnNext = items.find((item) => item.lane === "RECOMMENDED_NEXT");
  if (learnNext) {
    await client.query(
      `INSERT INTO learner_activity_events (
         id, learner_id, course_id, skill_id, event_type, result, metadata
       ) VALUES ($1, $2, $3, $4, 'RECOMMENDATION_SHOWN', $5::jsonb, $6::jsonb)`,
      [
        randomUUID(), learnerId, input.context.courseId, learnNext.skillId,
        JSON.stringify({ benefitProbability: learnNext.benefitProbability, priorityScore: learnNext.priorityScore }),
        JSON.stringify({ modelVersion: input.modelVersion, pathId, pathVersion: input.pathVersion ?? 1, source: "personalized_path" }),
      ],
    );
  }
  return pathId;
}

export function createPathService(
  pool: Pool,
  candidateService: CandidateServiceContract,
  inferenceClient: InferenceClientContract,
): PathServiceContract {
  const service: PathServiceContract = {
    async coordinate(learnerId, generateMissing = false) {
      let generatedPaths = 0;
      let regeneratedPaths = 0;
      if (generateMissing) {
        const enrollmentResult = await pool.query(
          `SELECT id FROM course_enrollments
           WHERE learner_id = $1 AND status = 'ACTIVE'
           ORDER BY last_accessed_at DESC`,
          [learnerId],
        );
        for (const row of enrollmentResult.rows as DatabaseRow[]) {
          const enrollmentId = String(row.id);
          const current = await service.get(learnerId, enrollmentId);
          if (current?.status === "STALE") {
            await service.regenerate(learnerId, enrollmentId);
            regeneratedPaths += 1;
          } else {
            const result = await service.generate(learnerId, enrollmentId);
            if (result.created) generatedPaths += 1;
          }
        }
      }
      const plan = await readCoordination(pool, learnerId);
      if (generateMissing && plan.learnNext) {
        await pool.query(
          `INSERT INTO learner_activity_events (
             id, learner_id, course_id, skill_id, event_type, result, metadata
           ) VALUES ($1, $2, $3, $4, 'RECOMMENDATION_COORDINATED', $5::jsonb, $6::jsonb)`,
          [
            randomUUID(), learnerId, plan.learnNext.primaryCourse.courseId,
            plan.learnNext.item.skillId,
            JSON.stringify({
              basePriority: plan.learnNext.basePriority,
              coordinationScore: plan.learnNext.coordinationScore,
              crossCourseBonus: plan.learnNext.crossCourseBonus,
              goalBonus: plan.learnNext.goalBonus,
            }),
            JSON.stringify({
              courseEnrollmentIds: plan.learnNext.courseContexts.map((context) => context.enrollmentId),
              goalId: plan.activeGoal?.goalId ?? null,
              policyVersion: plan.policyVersion,
              source: "cross_course_coordination",
            }),
          ],
        );
      }
      return { generatedPaths, regeneratedPaths, plan };
    },
    async generate(learnerId, enrollmentId) {
      const existing = await readPath(pool, learnerId, enrollmentId);
      if (existing) return { created: false, path: existing };
      const candidates = await candidateService.generate(learnerId, enrollmentId);
      const liveFeatures = await buildLiveFeatureBatch(pool, learnerId, candidates);
      const inference = liveFeatures.vectors.length
        ? await inferenceClient.predict(liveFeatures.vectors)
        : { ...(await inferenceClient.provenance()), predictions: [] };
      const items = constructPath({
        candidates,
        lastActivitySkillId: liveFeatures.lastActivitySkillId,
        predictions: inference.predictions,
      });
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await persist(client, learnerId, items, {
          context: candidates.context,
          featureVersion: inference.featureVersion,
          inferenceVersion: inference.inferenceVersion,
          modelVersion: inference.modelVersion,
        });
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        if ((error as { code?: string }).code === "23505") {
          const concurrent = await readPath(pool, learnerId, enrollmentId);
          if (concurrent) return { created: false, path: concurrent };
        }
        throw error;
      } finally {
        client.release();
      }
      const created = await readPath(pool, learnerId, enrollmentId);
      if (!created) throw new AppError(500, "PATH_PERSISTENCE_FAILED", "The personalized path could not be read after generation.");
      return { created: true, path: created };
    },
    async get(learnerId, enrollmentId) {
      return readPath(pool, learnerId, enrollmentId);
    },
    async history(learnerId, enrollmentId) {
      return readHistory(pool, learnerId, enrollmentId);
    },
    async regenerate(learnerId, enrollmentId) {
      const previous = await readPath(pool, learnerId, enrollmentId);
      if (!previous) {
        throw new AppError(404, "PATH_NOT_GENERATED", "Generate this course's personalized path before updating it.");
      }
      if (previous.status !== "STALE") {
        throw new AppError(409, "PATH_NOT_STALE", "This path already reflects the learner's latest evidence.");
      }
      const candidates = await candidateService.generate(learnerId, enrollmentId);
      const liveFeatures = await buildLiveFeatureBatch(pool, learnerId, candidates);
      const inference = liveFeatures.vectors.length
        ? await inferenceClient.predict(liveFeatures.vectors)
        : { ...(await inferenceClient.provenance()), predictions: [] };
      const items = constructPath({
        candidates,
        lastActivitySkillId: liveFeatures.lastActivitySkillId,
        predictions: inference.predictions,
      });
      const change = comparePaths(previous.items, items);
      const nextVersion = previous.pathVersion + 1;
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const lockResult = await client.query(
          `SELECT id, path_version, status FROM personalized_paths
           WHERE id = $1 AND learner_id = $2
           FOR UPDATE`,
          [previous.id, learnerId],
        );
        const locked = lockResult.rows[0] as DatabaseRow | undefined;
        if (!locked || String(locked.status) !== "STALE" || numeric(locked.path_version) !== previous.pathVersion) {
          throw new AppError(409, "PATH_ALREADY_UPDATED", "This path was updated by another request. Reload it to see the current version.");
        }
        await client.query(
          `UPDATE personalized_paths
           SET status = 'SUPERSEDED', superseded_at = NOW(), updated_at = NOW()
           WHERE id = $1`,
          [previous.id],
        );
        const pathId = await persist(client, learnerId, items, {
          changeSummary: change,
          context: candidates.context,
          featureVersion: inference.featureVersion,
          inferenceVersion: inference.inferenceVersion,
          modelVersion: inference.modelVersion,
          pathVersion: nextVersion,
          previousPathId: previous.id,
        });
        const next = items.find((item) => item.lane === "RECOMMENDED_NEXT") ?? null;
        await client.query(
          `INSERT INTO learner_activity_events (
             id, learner_id, course_id, skill_id, event_type, result, metadata
           ) VALUES ($1, $2, $3, $4, 'PATH_REGENERATED', $5::jsonb, $6::jsonb)`,
          [
            randomUUID(), learnerId, candidates.context.courseId, next?.skillId ?? null,
            JSON.stringify(change),
            JSON.stringify({ pathId, pathVersion: nextVersion, previousPathId: previous.id, source: "explicit_path_regeneration" }),
          ],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
      const path = await readPath(pool, learnerId, enrollmentId);
      if (!path || path.pathVersion !== nextVersion) {
        throw new AppError(500, "PATH_REGENERATION_FAILED", "The updated personalized path could not be read.");
      }
      return { change, path, previousPath: previous, regenerated: true };
    },
  };
  return service;
}
