import { randomUUID } from "node:crypto";

import type { Pool, PoolClient } from "pg";

import { AppError } from "../errors.js";
import type {
  EnrollmentDetail,
  EnrollmentModule,
  EnrollmentServiceContract,
  EnrollmentSkill,
  EnrollmentSummary,
} from "./types.js";

type DatabaseRow = Record<string, unknown>;

const enrollmentSummaryQuery = `
  SELECT ce.id, ce.course_id, ce.learning_goal_id, ce.status, ce.enrolled_at,
         ce.last_accessed_at, c.slug AS course_slug, c.name AS course_name,
         c.description AS course_description, c.level AS course_level,
         g.name AS learning_goal_name, cp.completed_modules, cp.total_modules,
         cp.progress_percentage
  FROM course_enrollments ce
  JOIN courses c ON c.id = ce.course_id
  JOIN learner_course_progress cp ON cp.enrollment_id = ce.id
  LEFT JOIN learning_goals g ON g.id = ce.learning_goal_id
`;

function number(value: unknown): number {
  return Number(value);
}

function iso(value: unknown): string {
  return new Date(String(value)).toISOString();
}

function mapSummary(row: DatabaseRow): EnrollmentSummary {
  return {
    completedModules: number(row.completed_modules),
    courseDescription: String(row.course_description),
    courseId: String(row.course_id),
    courseLevel: String(row.course_level),
    courseName: String(row.course_name),
    courseSlug: String(row.course_slug),
    enrolledAt: iso(row.enrolled_at),
    id: String(row.id),
    lastAccessedAt: iso(row.last_accessed_at),
    learningGoalId: row.learning_goal_id ? String(row.learning_goal_id) : null,
    learningGoalName: row.learning_goal_name ? String(row.learning_goal_name) : null,
    progressPercentage: number(row.progress_percentage),
    status: row.status as EnrollmentSummary["status"],
    totalModules: number(row.total_modules),
  };
}

async function summaryById(
  client: Pool | PoolClient,
  learnerId: string,
  enrollmentId: string,
): Promise<EnrollmentSummary> {
  const result = await client.query(
    `${enrollmentSummaryQuery} WHERE ce.learner_id = $1 AND ce.id = $2`,
    [learnerId, enrollmentId],
  );
  if (!result.rows[0]) {
    throw new AppError(404, "ENROLLMENT_NOT_FOUND", "The course enrollment does not exist.");
  }
  return mapSummary(result.rows[0]);
}

async function detailById(
  client: Pool | PoolClient,
  learnerId: string,
  enrollmentId: string,
): Promise<EnrollmentDetail> {
  const enrollment = await summaryById(client, learnerId, enrollmentId);
  const [modulesResult, skillsResult] = await Promise.all([
    client.query(
      `SELECT m.id, m.slug, m.name, m.description, m.sequence, mp.status,
              mp.started_at, mp.last_accessed_at, mp.completed_at,
              (
                m.sequence = 1 OR NOT EXISTS (
                  SELECT 1
                  FROM modules previous
                  JOIN learner_module_progress previous_progress
                    ON previous_progress.module_id = previous.id
                   AND previous_progress.enrollment_id = mp.enrollment_id
                  WHERE previous.course_id = m.course_id
                    AND previous.sequence < m.sequence
                    AND previous_progress.status <> 'COMPLETED'
                )
              ) AS is_accessible
       FROM learner_module_progress mp
       JOIN modules m ON m.id = mp.module_id
       WHERE mp.enrollment_id = $1
       ORDER BY m.sequence`,
      [enrollmentId],
    ),
    client.query(
      `SELECT s.id, s.slug, s.name, s.category, s.difficulty,
              m.id AS module_id, m.name AS module_name
       FROM course_skills cs
       JOIN skills s ON s.id = cs.skill_id
       JOIN modules m ON m.id = cs.module_id
       WHERE cs.course_id = $1
       ORDER BY m.sequence, cs.sequence`,
      [enrollment.courseId],
    ),
  ]);

  const modules: EnrollmentModule[] = modulesResult.rows.map((row: DatabaseRow) => ({
    completedAt: row.completed_at ? iso(row.completed_at) : null,
    description: String(row.description),
    id: String(row.id),
    isAccessible: Boolean(row.is_accessible),
    lastAccessedAt: row.last_accessed_at ? iso(row.last_accessed_at) : null,
    name: String(row.name),
    sequence: number(row.sequence),
    slug: String(row.slug),
    startedAt: row.started_at ? iso(row.started_at) : null,
    status: row.status as EnrollmentModule["status"],
  }));
  const skills: EnrollmentSkill[] = skillsResult.rows.map((row: DatabaseRow) => ({
    category: String(row.category),
    difficulty: number(row.difficulty),
    id: String(row.id),
    moduleId: String(row.module_id),
    moduleName: String(row.module_name),
    name: String(row.name),
    slug: String(row.slug),
  }));
  return { enrollment, modules, skills };
}

export function createEnrollmentService(pool: Pool): EnrollmentServiceContract {
  return {
    async listEnrollments(learnerId) {
      const result = await pool.query(
        `${enrollmentSummaryQuery}
         WHERE ce.learner_id = $1
         ORDER BY CASE ce.status WHEN 'ACTIVE' THEN 0 WHEN 'PAUSED' THEN 1 ELSE 2 END,
                  ce.last_accessed_at DESC`,
        [learnerId],
      );
      return result.rows.map(mapSummary);
    },

    async getEnrollment(learnerId, enrollmentId) {
      return detailById(pool, learnerId, enrollmentId);
    },

    async enroll(learnerId, input) {
      const client = await pool.connect();
      const enrollmentId = randomUUID();
      try {
        await client.query("BEGIN");
        const course = await client.query(
          `SELECT c.id, COUNT(m.id)::int AS module_count
           FROM courses c LEFT JOIN modules m ON m.course_id = c.id
           WHERE c.id = $1 AND c.is_active GROUP BY c.id`,
          [input.courseId],
        );
        if (!course.rows[0]) {
          throw new AppError(404, "COURSE_NOT_FOUND", "The course does not exist.");
        }
        if (number(course.rows[0].module_count) === 0) {
          throw new AppError(409, "COURSE_HAS_NO_MODULES", "The course has no modules to study.");
        }
        if (input.learningGoalId) {
          const goal = await client.query(
            "SELECT 1 FROM learner_goals WHERE learner_id = $1 AND goal_id = $2",
            [learnerId, input.learningGoalId],
          );
          if (!goal.rows[0]) {
            throw new AppError(400, "LEARNER_GOAL_REQUIRED", "Select this learning goal before associating it with a course.");
          }
        }

        const duplicate = await client.query(
          "SELECT id FROM course_enrollments WHERE learner_id = $1 AND course_id = $2",
          [learnerId, input.courseId],
        );
        if (duplicate.rows[0]) {
          throw new AppError(409, "ALREADY_ENROLLED", "You are already enrolled in this course.");
        }

        await client.query(
          `INSERT INTO course_enrollments
             (id, learner_id, course_id, learning_goal_id)
           VALUES ($1, $2, $3, $4)`,
          [enrollmentId, learnerId, input.courseId, input.learningGoalId ?? null],
        );
        await client.query(
          `INSERT INTO learner_course_progress
             (id, enrollment_id, total_modules)
           VALUES ($1, $2, $3)`,
          [randomUUID(), enrollmentId, course.rows[0].module_count],
        );
        await client.query(
          `INSERT INTO learner_module_progress
             (id, enrollment_id, course_id, module_id)
           SELECT gen_random_uuid(), $1, m.course_id, m.id
           FROM modules m WHERE m.course_id = $2`,
          [enrollmentId, input.courseId],
        );
        await client.query(
          `INSERT INTO learner_skill_mastery (id, learner_id, skill_id)
           SELECT gen_random_uuid(), $1, cs.skill_id
           FROM course_skills cs WHERE cs.course_id = $2
           ON CONFLICT (learner_id, skill_id) DO NOTHING`,
          [learnerId, input.courseId],
        );
        const detail = await detailById(client, learnerId, enrollmentId);
        await client.query("COMMIT");
        return detail;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async setStatus(learnerId, enrollmentId, status) {
      const current = await summaryById(pool, learnerId, enrollmentId);
      if (current.status === "COMPLETED") {
        throw new AppError(409, "COURSE_ALREADY_COMPLETED", "A completed course cannot be paused or dropped.");
      }
      await pool.query(
        `UPDATE course_enrollments
         SET status = $3, last_accessed_at = NOW(), updated_at = NOW()
         WHERE learner_id = $1 AND id = $2`,
        [learnerId, enrollmentId, status],
      );
      return summaryById(pool, learnerId, enrollmentId);
    },

    async updateModuleProgress(learnerId, enrollmentId, moduleId, status) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const enrollment = await client.query(
          `SELECT ce.course_id, ce.status, m.sequence, mp.status AS module_status
           FROM course_enrollments ce
           JOIN learner_module_progress mp ON mp.enrollment_id = ce.id
           JOIN modules m ON m.id = mp.module_id
           WHERE ce.id = $1 AND ce.learner_id = $2 AND mp.module_id = $3
           FOR UPDATE OF ce, mp`,
          [enrollmentId, learnerId, moduleId],
        );
        const row = enrollment.rows[0] as DatabaseRow | undefined;
        if (!row) {
          throw new AppError(404, "MODULE_PROGRESS_NOT_FOUND", "The enrolled module does not exist.");
        }
        if (row.status !== "ACTIVE") {
          throw new AppError(409, "ENROLLMENT_NOT_ACTIVE", "Resume the course before updating module progress.");
        }
        if (row.module_status === "COMPLETED") {
          throw new AppError(409, "MODULE_ALREADY_COMPLETED", "This module is already complete.");
        }
        const blocked = await client.query(
          `SELECT 1
           FROM modules previous
           JOIN learner_module_progress previous_progress
             ON previous_progress.module_id = previous.id
            AND previous_progress.enrollment_id = $1
           WHERE previous.course_id = $2 AND previous.sequence < $3
             AND previous_progress.status <> 'COMPLETED'
           LIMIT 1`,
          [enrollmentId, row.course_id, row.sequence],
        );
        if (blocked.rows[0]) {
          throw new AppError(409, "MODULE_LOCKED", "Complete the earlier modules before starting this one.");
        }

        await client.query(
          `UPDATE learner_module_progress
           SET status = $3,
               started_at = COALESCE(started_at, NOW()),
               last_accessed_at = NOW(),
               completed_at = CASE WHEN $3 = 'COMPLETED' THEN NOW() ELSE NULL END,
               updated_at = NOW()
           WHERE enrollment_id = $1 AND module_id = $2`,
          [enrollmentId, moduleId, status],
        );
        const counts = await client.query(
          `SELECT COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS completed,
                  COUNT(*)::int AS total
           FROM learner_module_progress WHERE enrollment_id = $1`,
          [enrollmentId],
        );
        const completed = number(counts.rows[0].completed);
        const total = number(counts.rows[0].total);
        const isComplete = completed === total;
        await client.query(
          `UPDATE learner_course_progress
           SET completed_modules = $2::smallint, total_modules = $3::smallint,
               progress_percentage = ROUND(($2::numeric * 100) / $3::numeric, 2),
               started_at = COALESCE(started_at, NOW()),
               completed_at = CASE WHEN $4 THEN NOW() ELSE NULL END,
               updated_at = NOW()
           WHERE enrollment_id = $1`,
          [enrollmentId, completed, total, isComplete],
        );
        await client.query(
          `UPDATE course_enrollments
           SET status = CASE WHEN $3 THEN 'COMPLETED' ELSE status END,
               completed_at = CASE WHEN $3 THEN NOW() ELSE completed_at END,
               last_accessed_at = NOW(), updated_at = NOW()
           WHERE id = $1 AND learner_id = $2`,
          [enrollmentId, learnerId, isComplete],
        );
        const detail = await detailById(client, learnerId, enrollmentId);
        await client.query("COMMIT");
        return detail;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
