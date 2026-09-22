import type { Pool } from "pg";

import { AppError } from "../errors.js";
import {
  analyzePrerequisiteGraph,
  PrerequisiteGraphCycleError,
  type PrerequisiteEdgeInput,
  type PrerequisiteNodeInput,
} from "./engine.js";
import type {
  GraphAnalyticsClientContract,
  GoalPrerequisiteAnalysis,
  PrerequisiteCourseContext,
  PrerequisiteServiceContract,
} from "./types.js";
import { knowledgeGraphPolicy } from "./policy.js";

type DatabaseRow = Record<string, unknown>;

interface AnalysisContext extends DatabaseRow {
  enrollment_id: string | null;
  id: string;
  name: string;
  outcome: string;
  slug: string;
  type: "COURSE" | "GOAL";
}

function number(value: unknown): number {
  return Number(value);
}

function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : number(value);
}

function courseContexts(value: unknown): PrerequisiteCourseContext[] {
  if (!Array.isArray(value)) return [];
  return value.map((course) => {
    const context = course as Record<string, unknown>;
    return {
      courseId: String(context.courseId),
      courseName: String(context.courseName),
      isEnrolled: Boolean(context.isEnrolled),
    };
  });
}

async function resolveContext(
  pool: Pool,
  learnerId: string,
  input: { enrollmentId?: string; goalId?: string },
): Promise<AnalysisContext | undefined> {
  if (input.enrollmentId || !input.goalId) {
    const enrollment = await pool.query(
      `SELECT c.id, c.slug, c.name, c.description AS outcome,
              ce.id AS enrollment_id, 'COURSE'::text AS type
       FROM course_enrollments ce
       JOIN courses c ON c.id = ce.course_id
       WHERE ce.learner_id = $1 AND ce.status <> 'DROPPED'
         AND ($2::uuid IS NULL OR ce.id = $2)
       ORDER BY CASE ce.status WHEN 'ACTIVE' THEN 0 WHEN 'PAUSED' THEN 1 ELSE 2 END,
                ce.last_accessed_at DESC
       LIMIT 1`,
      [learnerId, input.enrollmentId ?? null],
    );
    if (enrollment.rows[0] || input.enrollmentId) {
      return enrollment.rows[0] as AnalysisContext | undefined;
    }
  }
  const goal = await pool.query(
    `SELECT g.id, g.slug, g.name, g.outcome,
            NULL::uuid AS enrollment_id, 'GOAL'::text AS type
     FROM learner_goals lg
     JOIN learning_goals g ON g.id = lg.goal_id
     WHERE lg.learner_id = $1 AND lg.status = 'ACTIVE'
       AND ($2::uuid IS NULL OR g.id = $2)
     ORDER BY lg.priority, lg.selected_at DESC
     LIMIT 1`,
    [learnerId, input.goalId ?? null],
  );
  return goal.rows[0] as AnalysisContext | undefined;
}

async function courseGraph(pool: Pool, learnerId: string, courseId: string) {
  return Promise.all([
    pool.query(
      `WITH RECURSIVE relevant_skills(skill_id) AS (
         SELECT skill_id FROM course_skills WHERE course_id = $2
         UNION
         SELECT sp.prerequisite_skill_id
         FROM skill_prerequisites sp
         JOIN relevant_skills relevant ON relevant.skill_id = sp.skill_id
       )
       SELECT s.id, s.slug, s.name, s.description, s.category, s.difficulty,
              CASE WHEN context_skill.skill_id IS NOT NULL THEN 1::numeric ELSE NULL END AS relevance,
              CASE WHEN context_skill.skill_id IS NOT NULL THEN 0.7::numeric ELSE NULL END AS required_mastery,
              COALESCE(context_skill.is_required, FALSE) AS is_core,
              (context_skill.skill_id IS NOT NULL) AS is_context_skill,
              lsm.mastery, lsm.confidence,
              COALESCE(
                jsonb_agg(DISTINCT jsonb_build_object(
                  'courseId', c.id, 'courseName', c.name, 'isEnrolled', (ce.id IS NOT NULL)
                )) FILTER (WHERE c.id IS NOT NULL), '[]'::jsonb
              ) AS course_contexts
       FROM relevant_skills relevant
       JOIN skills s ON s.id = relevant.skill_id
       LEFT JOIN course_skills context_skill
         ON context_skill.course_id = $2 AND context_skill.skill_id = s.id
       LEFT JOIN learner_skill_mastery lsm
         ON lsm.learner_id = $1 AND lsm.skill_id = s.id
       LEFT JOIN course_skills cs ON cs.skill_id = s.id
       LEFT JOIN courses c ON c.id = cs.course_id
       LEFT JOIN course_enrollments ce
         ON ce.learner_id = $1 AND ce.course_id = c.id AND ce.status <> 'DROPPED'
       GROUP BY s.id, context_skill.skill_id, context_skill.is_required,
                lsm.mastery, lsm.confidence
       ORDER BY s.difficulty, s.name`,
      [learnerId, courseId],
    ),
    pool.query(
      `WITH RECURSIVE relevant_skills(skill_id) AS (
         SELECT skill_id FROM course_skills WHERE course_id = $1
         UNION
         SELECT sp.prerequisite_skill_id
         FROM skill_prerequisites sp
         JOIN relevant_skills relevant ON relevant.skill_id = sp.skill_id
       )
       SELECT sp.skill_id, sp.prerequisite_skill_id,
              sp.required_mastery, sp.relationship_type
       FROM skill_prerequisites sp
       JOIN relevant_skills skill ON skill.skill_id = sp.skill_id
       JOIN relevant_skills prerequisite ON prerequisite.skill_id = sp.prerequisite_skill_id
       ORDER BY sp.skill_id, sp.relationship_type, sp.prerequisite_skill_id`,
      [courseId],
    ),
  ]);
}

async function goalGraph(pool: Pool, learnerId: string, goalId: string) {
  return Promise.all([
    pool.query(
      `WITH RECURSIVE relevant_skills(skill_id) AS (
         SELECT skill_id FROM goal_skills WHERE goal_id = $2
         UNION
         SELECT sp.prerequisite_skill_id
         FROM skill_prerequisites sp
         JOIN relevant_skills relevant ON relevant.skill_id = sp.skill_id
       )
       SELECT s.id, s.slug, s.name, s.description, s.category, s.difficulty,
              gs.relevance, gs.required_mastery, gs.is_core,
              (gs.skill_id IS NOT NULL) AS is_context_skill,
              lsm.mastery, lsm.confidence,
              COALESCE(
                jsonb_agg(DISTINCT jsonb_build_object(
                  'courseId', c.id, 'courseName', c.name, 'isEnrolled', (ce.id IS NOT NULL)
                )) FILTER (WHERE c.id IS NOT NULL), '[]'::jsonb
              ) AS course_contexts
       FROM relevant_skills relevant
       JOIN skills s ON s.id = relevant.skill_id
       LEFT JOIN goal_skills gs ON gs.goal_id = $2 AND gs.skill_id = s.id
       LEFT JOIN learner_skill_mastery lsm
         ON lsm.learner_id = $1 AND lsm.skill_id = s.id
       LEFT JOIN course_skills cs ON cs.skill_id = s.id
       LEFT JOIN courses c ON c.id = cs.course_id
       LEFT JOIN course_enrollments ce
         ON ce.learner_id = $1 AND ce.course_id = c.id AND ce.status <> 'DROPPED'
       GROUP BY s.id, gs.skill_id, gs.relevance, gs.required_mastery, gs.is_core,
                lsm.mastery, lsm.confidence
       ORDER BY s.difficulty, s.name`,
      [learnerId, goalId],
    ),
    pool.query(
      `WITH RECURSIVE relevant_skills(skill_id) AS (
         SELECT skill_id FROM goal_skills WHERE goal_id = $1
         UNION
         SELECT sp.prerequisite_skill_id
         FROM skill_prerequisites sp
         JOIN relevant_skills relevant ON relevant.skill_id = sp.skill_id
       )
       SELECT sp.skill_id, sp.prerequisite_skill_id,
              sp.required_mastery, sp.relationship_type
       FROM skill_prerequisites sp
       JOIN relevant_skills skill ON skill.skill_id = sp.skill_id
       JOIN relevant_skills prerequisite ON prerequisite.skill_id = sp.prerequisite_skill_id
       ORDER BY sp.skill_id, sp.relationship_type, sp.prerequisite_skill_id`,
      [goalId],
    ),
  ]);
}

export function createPrerequisiteService(
  pool: Pool,
  graphAnalyticsClient?: GraphAnalyticsClientContract,
): PrerequisiteServiceContract {
  return {
    async analyze(learnerId, input = {}): Promise<GoalPrerequisiteAnalysis> {
      const context = await resolveContext(pool, learnerId, input);
      if (!context) throw new AppError(
        409,
        "PREREQUISITE_CONTEXT_REQUIRED",
        "Enroll in a course or select an optional goal before analyzing readiness.",
      );
      const [nodeResult, edgeResult] = context.type === "COURSE"
        ? await courseGraph(pool, learnerId, String(context.id))
        : await goalGraph(pool, learnerId, String(context.id));
      const nodes: PrerequisiteNodeInput[] = (nodeResult.rows as DatabaseRow[]).map((row) => ({
        category: String(row.category),
        confidence: nullableNumber(row.confidence),
        courseContexts: courseContexts(row.course_contexts),
        currentMastery: nullableNumber(row.mastery),
        description: String(row.description),
        difficulty: number(row.difficulty),
        id: String(row.id),
        isContextSkill: Boolean(row.is_context_skill),
        isCore: Boolean(row.is_core),
        isGoalSkill: context.type === "GOAL" && Boolean(row.is_context_skill),
        name: String(row.name),
        relevance: nullableNumber(row.relevance),
        requiredMastery: nullableNumber(row.required_mastery),
        slug: String(row.slug),
      }));
      const edges: PrerequisiteEdgeInput[] = (edgeResult.rows as DatabaseRow[]).map((row) => ({
        prerequisiteSkillId: String(row.prerequisite_skill_id),
        relationshipType: row.relationship_type as PrerequisiteEdgeInput["relationshipType"],
        requiredMastery: number(row.required_mastery),
        skillId: String(row.skill_id),
      }));
      let analysis: GoalPrerequisiteAnalysis;
      try {
        analysis = analyzePrerequisiteGraph({
          context: {
            enrollmentId: context.enrollment_id ? String(context.enrollment_id) : null,
            id: String(context.id),
            name: String(context.name),
            outcome: String(context.outcome),
            slug: String(context.slug),
            type: context.type,
          },
          edges,
          nodes,
        });
      } catch (error) {
        if (error instanceof PrerequisiteGraphCycleError) throw new AppError(
          500,
          "PREREQUISITE_GRAPH_INVALID",
          "The prerequisite graph is cyclic and cannot produce a valid order.",
        );
        throw error;
      }
      if (!graphAnalyticsClient) return {
        ...analysis,
        analytics: {
          bottlenecks: [], criticalPath: analysis.validOrder, edgeCount: edges.length,
          engine: "typescript", generatedAt: analysis.analyzedAt, isDag: true,
          nodeCount: analysis.skills.length, status: "NOT_CONFIGURED",
          version: knowledgeGraphPolicy.version,
        },
      };
      try {
        const external = await graphAnalyticsClient.analyze({
          edges: edges.map((edge) => ({
            ...edge,
            satisfied: analysis.skills.find((skill) => skill.id === edge.skillId)?.prerequisites
              .find((check) => check.prerequisiteSkillId === edge.prerequisiteSkillId)?.satisfied ?? false,
          })),
          nodes: analysis.skills.map((skill) => ({
            isContextSkill: skill.isContextSkill,
            name: skill.name,
            skillId: skill.id,
            status: skill.status,
          })),
        });
        if (external.analyticsVersion !== knowledgeGraphPolicy.analyticsVersion) {
          throw new Error("NetworkX analytics policy mismatch.");
        }
        const metricBySkill = new Map(external.nodes.map((metric) => [metric.skillId, metric]));
        return {
          ...analysis,
          analytics: {
            bottlenecks: external.bottlenecks,
            criticalPath: external.criticalPath,
            edgeCount: external.edgeCount,
            engine: external.engine,
            generatedAt: external.generatedAt,
            isDag: external.isDag,
            nodeCount: external.nodeCount,
            status: "AVAILABLE",
            version: external.analyticsVersion,
          },
          skills: analysis.skills.map((skill) => ({
            ...skill,
            graphMetrics: metricBySkill.get(skill.id),
          })),
        };
      } catch {
        return {
          ...analysis,
          analytics: {
            bottlenecks: [], criticalPath: analysis.validOrder, edgeCount: edges.length,
            engine: "typescript", generatedAt: analysis.analyzedAt, isDag: true,
            nodeCount: analysis.skills.length, status: "UNAVAILABLE",
            version: knowledgeGraphPolicy.version,
          },
        };
      }
    },
  };
}
