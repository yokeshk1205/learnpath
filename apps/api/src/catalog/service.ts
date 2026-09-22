import { randomUUID } from "node:crypto";

import type { Pool } from "pg";

import { AppError } from "../errors.js";
import type {
  CatalogCourse,
  CatalogDomain,
  CatalogGoal,
  CatalogOverview,
  CatalogServiceContract,
  CatalogStats,
  GoalDetail,
  GoalSkill,
  LearnerGoal,
  PrerequisiteEdge,
} from "./types.js";

type DatabaseRow = Record<string, unknown>;

function number(value: unknown): number {
  return Number(value);
}

function mapGoal(row: DatabaseRow): CatalogGoal {
  return {
    coreSkillCount: number(row.core_skill_count),
    description: String(row.description),
    domainName: String(row.domain_name),
    estimatedWeeks: number(row.estimated_weeks),
    id: String(row.id),
    isSelected: Boolean(row.is_selected),
    level: row.level as CatalogGoal["level"],
    name: String(row.name),
    outcome: String(row.outcome),
    skillCount: number(row.skill_count),
    slug: String(row.slug),
  };
}

function mapLearnerGoal(row: DatabaseRow): LearnerGoal {
  return {
    estimatedWeeks: number(row.estimated_weeks),
    goalId: String(row.goal_id),
    id: String(row.id),
    level: String(row.level),
    name: String(row.name),
    outcome: String(row.outcome),
    priority: number(row.priority),
    selectedAt: new Date(String(row.selected_at)).toISOString(),
    slug: String(row.slug),
    status: row.status as LearnerGoal["status"],
    targetDate: row.target_date ? String(row.target_date) : null,
  };
}

const goalSelection = `
  SELECT lg.id, lg.learner_id, lg.goal_id, lg.status, lg.priority,
         lg.target_date, lg.selected_at, g.slug, g.name, g.outcome,
         g.level, g.estimated_weeks
  FROM learner_goals lg
  JOIN learning_goals g ON g.id = lg.goal_id
  WHERE lg.learner_id = $1
`;

export function createCatalogService(pool: Pool): CatalogServiceContract {
  async function getLearnerGoals(learnerId: string): Promise<LearnerGoal[]> {
    const result = await pool.query(
      `${goalSelection} ORDER BY lg.priority ASC, lg.selected_at DESC`,
      [learnerId],
    );
    return result.rows.map(mapLearnerGoal);
  }

  return {
    async getOverview(learnerId): Promise<CatalogOverview> {
      const [statsResult, domainsResult, goalsResult, coursesResult, learnerGoals] =
        await Promise.all([
          pool.query(`
            SELECT
              (SELECT COUNT(*) FROM domains WHERE is_active) AS domains,
              (SELECT COUNT(*) FROM skills WHERE is_active) AS skills,
              (SELECT COUNT(DISTINCT category) FROM skills WHERE is_active) AS categories,
              (SELECT COUNT(*) FROM skill_prerequisites) AS prerequisite_edges,
              (SELECT COUNT(*) FROM courses WHERE is_active) AS courses
          `),
          pool.query(`
            SELECT id, slug, name, description, icon
            FROM domains WHERE is_active ORDER BY sort_order, name
          `),
          pool.query(
            `SELECT g.id, g.slug, g.name, g.description, g.outcome, g.level,
                    g.estimated_weeks, d.name AS domain_name,
                    COUNT(gs.skill_id) AS skill_count,
                    COUNT(gs.skill_id) FILTER (WHERE gs.is_core) AS core_skill_count,
                    EXISTS (
                      SELECT 1 FROM learner_goals lg
                      WHERE lg.learner_id = $1 AND lg.goal_id = g.id
                        AND lg.status = 'ACTIVE'
                    ) AS is_selected
             FROM learning_goals g
             JOIN domains d ON d.id = g.domain_id
             LEFT JOIN goal_skills gs ON gs.goal_id = g.id
             WHERE g.is_active
             GROUP BY g.id, d.name
             ORDER BY g.estimated_weeks, g.name`,
            [learnerId],
          ),
          pool.query(`
            SELECT c.id, c.slug, c.name, c.description, c.level, c.estimated_hours,
                   COUNT(DISTINCT m.id) AS module_count,
                   COUNT(DISTINCT cs.skill_id) AS skill_count
            FROM courses c
            LEFT JOIN modules m ON m.course_id = c.id
            LEFT JOIN course_skills cs ON cs.course_id = c.id
            WHERE c.is_active
            GROUP BY c.id
            ORDER BY c.level, c.name
          `),
          getLearnerGoals(learnerId),
        ]);

      const statsRow = statsResult.rows[0] as DatabaseRow;
      const stats: CatalogStats = {
        categories: number(statsRow.categories),
        courses: number(statsRow.courses),
        domains: number(statsRow.domains),
        prerequisiteEdges: number(statsRow.prerequisite_edges),
        skills: number(statsRow.skills),
      };
      const domains: CatalogDomain[] = domainsResult.rows.map((row: DatabaseRow) => ({
        description: String(row.description),
        icon: String(row.icon),
        id: String(row.id),
        name: String(row.name),
        slug: String(row.slug),
      }));
      const courses: CatalogCourse[] = coursesResult.rows.map((row: DatabaseRow) => ({
        description: String(row.description),
        estimatedHours: number(row.estimated_hours),
        id: String(row.id),
        level: row.level as CatalogCourse["level"],
        moduleCount: number(row.module_count),
        name: String(row.name),
        skillCount: number(row.skill_count),
        slug: String(row.slug),
      }));
      return {
        courses,
        domains,
        goals: goalsResult.rows.map(mapGoal),
        learnerGoals,
        stats,
      };
    },

    async getGoalDetail(learnerId, goalId): Promise<GoalDetail> {
      const [goalResult, skillsResult, prerequisitesResult] = await Promise.all([
        pool.query(
          `SELECT g.id, g.slug, g.name, g.description, g.outcome, g.level,
                  g.estimated_weeks, d.name AS domain_name,
                  COUNT(gs.skill_id) AS skill_count,
                  COUNT(gs.skill_id) FILTER (WHERE gs.is_core) AS core_skill_count,
                  EXISTS (
                    SELECT 1 FROM learner_goals lg
                    WHERE lg.learner_id = $1 AND lg.goal_id = g.id
                      AND lg.status = 'ACTIVE'
                  ) AS is_selected
           FROM learning_goals g
           JOIN domains d ON d.id = g.domain_id
           LEFT JOIN goal_skills gs ON gs.goal_id = g.id
           WHERE g.id = $2 AND g.is_active
           GROUP BY g.id, d.name`,
          [learnerId, goalId],
        ),
        pool.query(
          `SELECT s.id, s.slug, s.name, s.description, s.category, s.difficulty,
                  s.estimated_minutes, gs.relevance, gs.required_mastery, gs.is_core,
                  COALESCE(
                    jsonb_agg(DISTINCT jsonb_build_object(
                      'courseId', c.id, 'courseName', c.name
                    )) FILTER (WHERE c.id IS NOT NULL), '[]'::jsonb
                  ) AS courses
           FROM goal_skills gs
           JOIN skills s ON s.id = gs.skill_id
           LEFT JOIN course_skills cs ON cs.skill_id = s.id
           LEFT JOIN courses c ON c.id = cs.course_id AND c.is_active
           WHERE gs.goal_id = $1 AND s.is_active
           GROUP BY s.id, gs.relevance, gs.required_mastery, gs.is_core
           ORDER BY s.category, s.difficulty, s.name`,
          [goalId],
        ),
        pool.query(
          `SELECT sp.skill_id, skill.name AS skill_name,
                  sp.prerequisite_skill_id, prerequisite.name AS prerequisite_skill_name,
                  sp.required_mastery, sp.relationship_type
           FROM skill_prerequisites sp
           JOIN skills skill ON skill.id = sp.skill_id
           JOIN skills prerequisite ON prerequisite.id = sp.prerequisite_skill_id
           WHERE sp.skill_id IN (SELECT skill_id FROM goal_skills WHERE goal_id = $1)
           ORDER BY skill.difficulty, skill.name, prerequisite.name`,
          [goalId],
        ),
      ]);

      if (!goalResult.rows[0]) {
        throw new AppError(404, "GOAL_NOT_FOUND", "The learning goal does not exist.");
      }

      const skills: GoalSkill[] = skillsResult.rows.map((row: DatabaseRow) => ({
        category: String(row.category),
        courses: row.courses as GoalSkill["courses"],
        description: String(row.description),
        difficulty: number(row.difficulty),
        estimatedMinutes: number(row.estimated_minutes),
        id: String(row.id),
        isCore: Boolean(row.is_core),
        name: String(row.name),
        relevance: number(row.relevance),
        requiredMastery: number(row.required_mastery),
        slug: String(row.slug),
      }));
      const prerequisites: PrerequisiteEdge[] = prerequisitesResult.rows.map(
        (row: DatabaseRow) => ({
          prerequisiteSkillId: String(row.prerequisite_skill_id),
          prerequisiteSkillName: String(row.prerequisite_skill_name),
          relationshipType: row.relationship_type as PrerequisiteEdge["relationshipType"],
          requiredMastery: number(row.required_mastery),
          skillId: String(row.skill_id),
          skillName: String(row.skill_name),
        }),
      );
      return { goal: mapGoal(goalResult.rows[0]), prerequisites, skills };
    },

    getLearnerGoals,

    async removeGoal(learnerId, goalId): Promise<LearnerGoal> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const existing = await client.query(
          `${goalSelection} AND lg.goal_id = $2 FOR UPDATE OF lg`,
          [learnerId, goalId],
        );
        if (!existing.rows[0]) {
          throw new AppError(404, "LEARNER_GOAL_NOT_FOUND", "The learner goal does not exist.");
        }
        await client.query(
          `UPDATE learner_goals
           SET status = 'DROPPED', updated_at = NOW()
           WHERE learner_id = $1 AND goal_id = $2`,
          [learnerId, goalId],
        );
        await client.query(
          `UPDATE course_enrollments
           SET learning_goal_id = NULL, updated_at = NOW()
           WHERE learner_id = $1 AND learning_goal_id = $2`,
          [learnerId, goalId],
        );
        const removed = await client.query(`${goalSelection} AND lg.goal_id = $2`, [learnerId, goalId]);
        await client.query("COMMIT");
        return mapLearnerGoal(removed.rows[0]);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async selectGoal(learnerId, input): Promise<LearnerGoal> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const goal = await client.query(
          "SELECT id FROM learning_goals WHERE id = $1 AND is_active",
          [input.goalId],
        );
        if (!goal.rows[0]) {
          throw new AppError(404, "GOAL_NOT_FOUND", "The learning goal does not exist.");
        }

        await client.query(
          `UPDATE learner_goals
           SET status = 'PAUSED', updated_at = NOW()
           WHERE learner_id = $1 AND goal_id <> $2 AND status = 'ACTIVE'`,
          [learnerId, input.goalId],
        );
        await client.query(
          `INSERT INTO learner_goals (id, learner_id, goal_id, priority, target_date)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (learner_id, goal_id) DO UPDATE
           SET status = 'ACTIVE', priority = EXCLUDED.priority,
               target_date = EXCLUDED.target_date, updated_at = NOW()`,
          [randomUUID(), learnerId, input.goalId, input.priority, input.targetDate ?? null],
        );
        await client.query(
          `INSERT INTO learner_skill_mastery (id, learner_id, skill_id)
           SELECT gen_random_uuid(), $1, gs.skill_id
           FROM goal_skills gs WHERE gs.goal_id = $2
           ON CONFLICT (learner_id, skill_id) DO NOTHING`,
          [learnerId, input.goalId],
        );
        const selected = await client.query(`${goalSelection} AND lg.goal_id = $2`, [
          learnerId,
          input.goalId,
        ]);
        await client.query("COMMIT");
        return mapLearnerGoal(selected.rows[0]);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
