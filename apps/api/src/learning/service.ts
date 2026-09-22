import { randomUUID } from "node:crypto";

import type { Pool, PoolClient } from "pg";

import { AppError } from "../errors.js";
import type {
  JsonValue,
  LearningActivityEvent,
  LearningContextFilter,
  LearningResourceDetail,
  LearningResourceSummary,
  LearningServiceContract,
  ResourceCourseContext,
  ResourceHistory,
} from "./types.js";

type DatabaseRow = Record<string, unknown>;

const resourceSelect = `
  SELECT lr.id, lr.slug, lr.title, lr.summary, lr.resource_type, lr.difficulty,
         lr.estimated_minutes, lr.learning_objectives, lr.content_sections, lr.external_url,
         s.id AS skill_id, s.name AS skill_name, s.category AS skill_category,
         lsm.mastery,
         history.status AS history_status, history.first_started_at,
         history.last_started_at, history.last_completed_at, history.last_skipped_at,
         history.last_activity_at, history.total_time_spent_seconds,
         history.session_count, history.completion_count, history.skip_count,
         COALESCE(
           jsonb_agg(DISTINCT jsonb_build_object(
             'courseId', course.id,
             'courseName', course.name,
             'moduleId', module.id,
             'moduleName', module.name,
             'isEnrolled', (enrollment.id IS NOT NULL)
           )) FILTER (WHERE course.id IS NOT NULL),
           '[]'::jsonb
         ) AS contexts
  FROM learning_resources lr
  JOIN learning_resource_skills resource_skill
    ON resource_skill.resource_id = lr.id AND resource_skill.is_primary
  JOIN skills s ON s.id = resource_skill.skill_id
  LEFT JOIN learner_skill_mastery lsm
    ON lsm.learner_id = $1 AND lsm.skill_id = s.id
  LEFT JOIN learner_learning_history history
    ON history.learner_id = $1 AND history.resource_id = lr.id
  LEFT JOIN learning_resource_contexts resource_context ON resource_context.resource_id = lr.id
  LEFT JOIN courses course ON course.id = resource_context.course_id
  LEFT JOIN modules module ON module.id = resource_context.module_id
  LEFT JOIN course_enrollments enrollment
    ON enrollment.learner_id = $1 AND enrollment.course_id = course.id
   AND enrollment.status <> 'DROPPED'
`;

const resourceGroup = `
  GROUP BY lr.id, s.id, lsm.mastery, history.status, history.first_started_at,
           history.last_started_at, history.last_completed_at, history.last_skipped_at,
           history.last_activity_at, history.total_time_spent_seconds,
           history.session_count, history.completion_count, history.skip_count
`;

function number(value: unknown): number {
  return Number(value);
}

function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : number(value);
}

function iso(value: unknown): string {
  return new Date(String(value)).toISOString();
}

function jsonRecord(value: unknown): Record<string, JsonValue> {
  if (!value || Array.isArray(value) || typeof value !== "object") return {};
  return value as Record<string, JsonValue>;
}

function contexts(value: unknown): ResourceCourseContext[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const context = item as DatabaseRow;
    return {
      courseId: String(context.courseId),
      courseName: String(context.courseName),
      isEnrolled: Boolean(context.isEnrolled),
      moduleId: String(context.moduleId),
      moduleName: String(context.moduleName),
    };
  }).sort((left, right) => left.courseName.localeCompare(right.courseName));
}

function history(row: DatabaseRow): ResourceHistory | null {
  if (!row.history_status) return null;
  return {
    completionCount: number(row.completion_count),
    firstStartedAt: iso(row.first_started_at),
    lastActivityAt: iso(row.last_activity_at),
    lastCompletedAt: row.last_completed_at ? iso(row.last_completed_at) : null,
    lastSkippedAt: row.last_skipped_at ? iso(row.last_skipped_at) : null,
    lastStartedAt: iso(row.last_started_at),
    sessionCount: number(row.session_count),
    skipCount: number(row.skip_count),
    status: row.history_status as ResourceHistory["status"],
    totalTimeSpentSeconds: number(row.total_time_spent_seconds),
  };
}

function mapResource(row: DatabaseRow): LearningResourceDetail {
  const sections = Array.isArray(row.content_sections) ? row.content_sections : [];
  return {
    contentSections: sections.map((section) => {
      const item = section as DatabaseRow;
      return { body: String(item.body), heading: String(item.heading) };
    }),
    contexts: contexts(row.contexts),
    difficulty: number(row.difficulty),
    estimatedMinutes: number(row.estimated_minutes),
    externalUrl: row.external_url ? String(row.external_url) : null,
    id: String(row.id),
    learningObjectives: Array.isArray(row.learning_objectives)
      ? row.learning_objectives.map(String)
      : [],
    mastery: nullableNumber(row.mastery),
    progress: history(row),
    resourceType: row.resource_type as LearningResourceDetail["resourceType"],
    skillCategory: String(row.skill_category),
    skillId: String(row.skill_id),
    skillName: String(row.skill_name),
    slug: String(row.slug),
    summary: String(row.summary),
    title: String(row.title),
  };
}

function mapActivity(row: DatabaseRow): LearningActivityEvent {
  return {
    courseId: row.course_id ? String(row.course_id) : null,
    courseName: row.course_name ? String(row.course_name) : null,
    durationSeconds: number(row.duration_seconds),
    eventType: row.event_type as LearningActivityEvent["eventType"],
    id: String(row.id),
    metadata: jsonRecord(row.metadata),
    moduleId: row.module_id ? String(row.module_id) : null,
    moduleName: row.module_name ? String(row.module_name) : null,
    occurredAt: iso(row.occurred_at),
    resourceId: row.resource_id ? String(row.resource_id) : null,
    resourceTitle: row.resource_title ? String(row.resource_title) : null,
    result: jsonRecord(row.result),
    skillId: row.skill_id ? String(row.skill_id) : null,
    skillName: row.skill_name ? String(row.skill_name) : null,
  };
}

async function loadActivity(client: Pool | PoolClient, learnerId: string, limit = 20) {
  const result = await client.query(
    `SELECT event.id, event.course_id, course.name AS course_name,
            event.module_id, module.name AS module_name,
            event.skill_id, skill.name AS skill_name,
            event.resource_id, resource.title AS resource_title,
            event.event_type, event.occurred_at, event.duration_seconds,
            event.result, event.metadata
     FROM learner_activity_events event
     LEFT JOIN courses course ON course.id = event.course_id
     LEFT JOIN modules module ON module.id = event.module_id
     LEFT JOIN skills skill ON skill.id = event.skill_id
     LEFT JOIN learning_resources resource ON resource.id = event.resource_id
     WHERE event.learner_id = $1
     ORDER BY event.occurred_at DESC, event.id DESC
     LIMIT $2`,
    [learnerId, limit],
  );
  return (result.rows as DatabaseRow[]).map(mapActivity);
}

async function assertResourceContext(
  client: Pool | PoolClient,
  learnerId: string,
  resourceId: string,
  courseId?: string,
  moduleId?: string,
) {
  const result = await client.query(
    `SELECT s.id AS skill_id
     FROM learning_resources resource
     JOIN learning_resource_skills resource_skill
       ON resource_skill.resource_id = resource.id AND resource_skill.is_primary
     JOIN skills s ON s.id = resource_skill.skill_id
     WHERE resource.id = $2 AND resource.is_active
       AND (
         EXISTS (
           SELECT 1
           FROM learner_goals learner_goal
           JOIN goal_skills goal_skill
             ON goal_skill.goal_id = learner_goal.goal_id AND goal_skill.skill_id = s.id
           WHERE learner_goal.learner_id = $1 AND learner_goal.status <> 'DROPPED'
         )
         OR EXISTS (
           WITH RECURSIVE learner_course_scope(skill_id) AS (
             SELECT course_skill.skill_id
             FROM course_enrollments enrollment
             JOIN course_skills course_skill ON course_skill.course_id = enrollment.course_id
             WHERE enrollment.learner_id = $1 AND enrollment.status <> 'DROPPED'
             UNION
             SELECT prerequisite.prerequisite_skill_id
             FROM learner_course_scope scope
             JOIN skill_prerequisites prerequisite
               ON prerequisite.skill_id = scope.skill_id
              AND prerequisite.relationship_type = 'REQUIRED'
           )
           SELECT 1 FROM learner_course_scope WHERE skill_id = s.id
         )
       )
       AND ($3::uuid IS NULL OR EXISTS (
         WITH RECURSIVE selected_course_scope(skill_id) AS (
           SELECT course_skill.skill_id
           FROM course_enrollments enrollment
           JOIN course_skills course_skill ON course_skill.course_id = enrollment.course_id
           WHERE enrollment.learner_id = $1 AND enrollment.course_id = $3
             AND enrollment.status = 'ACTIVE'
           UNION
           SELECT prerequisite.prerequisite_skill_id
           FROM selected_course_scope scope
           JOIN skill_prerequisites prerequisite
             ON prerequisite.skill_id = scope.skill_id
            AND prerequisite.relationship_type = 'REQUIRED'
         )
         SELECT 1 FROM selected_course_scope WHERE skill_id = s.id
       ))
       AND ($4::uuid IS NULL OR EXISTS (
         SELECT 1 FROM learning_resource_contexts context
         WHERE context.resource_id = resource.id AND context.module_id = $4
           AND ($3::uuid IS NULL OR context.course_id = $3)
       ))`,
    [learnerId, resourceId, courseId ?? null, moduleId ?? null],
  );
  if (!result.rows[0]) {
    throw new AppError(
      404,
      "LEARNING_RESOURCE_NOT_FOUND",
      "The learning resource is unavailable in the learner's active context.",
    );
  }
  return String(result.rows[0].skill_id);
}

async function loadResource(
  client: Pool | PoolClient,
  learnerId: string,
  resourceId: string,
): Promise<LearningResourceDetail> {
  await assertResourceContext(client, learnerId, resourceId);
  const result = await client.query(
    `${resourceSelect}
     WHERE lr.id = $2 AND lr.is_active
     ${resourceGroup}`,
    [learnerId, resourceId],
  );
  return mapResource(result.rows[0] as DatabaseRow);
}

function toSummary(resource: LearningResourceDetail): LearningResourceSummary {
  const { contentSections: _contentSections, externalUrl: _externalUrl,
    learningObjectives: _learningObjectives, ...summary } = resource;
  void _contentSections; void _externalUrl; void _learningObjectives;
  return summary;
}

export function createLearningService(pool: Pool): LearningServiceContract {
  return {
    async getOverview(learnerId, filter: LearningContextFilter) {
      const values = [
        learnerId,
        filter.skillId ?? null,
        filter.courseId ?? null,
        filter.moduleId ?? null,
      ];
      const resourceResult = await pool.query(
        `${resourceSelect}
         WHERE lr.is_active
           AND (
             EXISTS (
               SELECT 1 FROM learner_goals learner_goal
               JOIN goal_skills goal_skill
                 ON goal_skill.goal_id = learner_goal.goal_id AND goal_skill.skill_id = s.id
               WHERE learner_goal.learner_id = $1 AND learner_goal.status <> 'DROPPED'
             )
             OR EXISTS (
               WITH RECURSIVE learner_course_scope(skill_id) AS (
                 SELECT course_skill.skill_id
                 FROM course_enrollments enrollment_context
                 JOIN course_skills course_skill
                   ON course_skill.course_id = enrollment_context.course_id
                 WHERE enrollment_context.learner_id = $1
                   AND enrollment_context.status <> 'DROPPED'
                 UNION
                 SELECT prerequisite.prerequisite_skill_id
                 FROM learner_course_scope scope
                 JOIN skill_prerequisites prerequisite
                   ON prerequisite.skill_id = scope.skill_id
                  AND prerequisite.relationship_type = 'REQUIRED'
               )
               SELECT 1 FROM learner_course_scope WHERE skill_id = s.id
             )
           )
           AND ($2::uuid IS NULL OR s.id = $2)
           AND ($3::uuid IS NULL OR EXISTS (
             WITH RECURSIVE selected_course_scope(skill_id) AS (
               SELECT course_skill.skill_id
               FROM course_enrollments enrollment_context
               JOIN course_skills course_skill
                 ON course_skill.course_id = enrollment_context.course_id
               WHERE enrollment_context.learner_id = $1
                 AND enrollment_context.course_id = $3
                 AND enrollment_context.status = 'ACTIVE'
               UNION
               SELECT prerequisite.prerequisite_skill_id
               FROM selected_course_scope scope
               JOIN skill_prerequisites prerequisite
                 ON prerequisite.skill_id = scope.skill_id
                AND prerequisite.relationship_type = 'REQUIRED'
             )
             SELECT 1 FROM selected_course_scope WHERE skill_id = s.id
           ))
           AND ($4::uuid IS NULL OR EXISTS (
             SELECT 1 FROM learning_resource_contexts filter_context
             WHERE filter_context.resource_id = lr.id AND filter_context.module_id = $4
               AND ($3::uuid IS NULL OR filter_context.course_id = $3)
           ))
         ${resourceGroup}
         ORDER BY
           CASE history.status WHEN 'IN_PROGRESS' THEN 0 WHEN 'COMPLETED' THEN 2 ELSE 1 END,
           s.category, s.difficulty, s.name, lr.resource_type`,
        values,
      );
      const resources = (resourceResult.rows as DatabaseRow[]).map(mapResource).map(toSummary);
      const activity = await loadActivity(pool, learnerId);
      const completed = resources.filter((resource) => (resource.progress?.completionCount ?? 0) > 0);
      const started = resources.filter((resource) => resource.progress !== null);
      return {
        activity,
        generatedAt: new Date().toISOString(),
        resources,
        summary: {
          availableResources: resources.length,
          completedResources: completed.length,
          eventsRecorded: activity.length,
          skillsCovered: new Set(resources.map((resource) => resource.skillId)).size,
          startedResources: started.length,
          totalTimeSpentSeconds: resources.reduce(
            (total, resource) => total + (resource.progress?.totalTimeSpentSeconds ?? 0),
            0,
          ),
        },
      };
    },

    async getResource(learnerId, resourceId) {
      return loadResource(pool, learnerId, resourceId);
    },

    async recordResourceEvent(learnerId, resourceId, input) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const skillId = await assertResourceContext(
          client, learnerId, resourceId, input.courseId, input.moduleId,
        );
        const existingResult = await client.query(
          `SELECT status FROM learner_learning_history
           WHERE learner_id = $1 AND resource_id = $2
           FOR UPDATE`,
          [learnerId, resourceId],
        );
        const existing = existingResult.rows[0] as DatabaseRow | undefined;
        if (input.eventType !== "RESOURCE_STARTED" && !existing) {
          throw new AppError(
            409,
            "RESOURCE_NOT_STARTED",
            "Start the learning resource before completing or skipping it.",
          );
        }

        const eventId = randomUUID();
        const result = {
          ...input.result,
          lifecycleStatus: input.eventType.replace("RESOURCE_", ""),
        };
        const metadata = { ...input.metadata, source: "learner_resource_session" };
        await client.query(
          `INSERT INTO learner_activity_events (
             id, learner_id, course_id, module_id, skill_id, resource_id,
             event_type, duration_seconds, result, metadata
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb)`,
          [eventId, learnerId, input.courseId ?? null, input.moduleId ?? null,
            skillId, resourceId, input.eventType, input.durationSeconds,
            JSON.stringify(result), JSON.stringify(metadata)],
        );

        if (input.eventType === "RESOURCE_STARTED") {
          await client.query(
            `INSERT INTO learner_learning_history (
               id, learner_id, resource_id, status, first_started_at,
               last_started_at, last_activity_at
             )
             VALUES ($1, $2, $3, 'IN_PROGRESS', NOW(), NOW(), NOW())
             ON CONFLICT (learner_id, resource_id) DO UPDATE
             SET status = 'IN_PROGRESS', last_started_at = NOW(),
                 last_activity_at = NOW(), session_count = learner_learning_history.session_count + 1,
                 updated_at = NOW()`,
            [randomUUID(), learnerId, resourceId],
          );
        } else if (input.eventType === "RESOURCE_COMPLETED") {
          await client.query(
            `UPDATE learner_learning_history
             SET status = 'COMPLETED', last_completed_at = NOW(), last_activity_at = NOW(),
                 total_time_spent_seconds = total_time_spent_seconds + $3,
                 completion_count = completion_count + 1, updated_at = NOW()
             WHERE learner_id = $1 AND resource_id = $2`,
            [learnerId, resourceId, input.durationSeconds],
          );
        } else {
          await client.query(
            `UPDATE learner_learning_history
             SET status = 'SKIPPED', last_skipped_at = NOW(), last_activity_at = NOW(),
                 total_time_spent_seconds = total_time_spent_seconds + $3,
                 skip_count = skip_count + 1, updated_at = NOW()
             WHERE learner_id = $1 AND resource_id = $2`,
            [learnerId, resourceId, input.durationSeconds],
          );
        }

        if (input.eventType !== "RESOURCE_STARTED") {
          await client.query(
            `UPDATE learner_skill_mastery
             SET total_time_spent_seconds = total_time_spent_seconds + $3,
                 last_practiced_at = NOW(), updated_at = NOW()
             WHERE learner_id = $1 AND skill_id = $2`,
            [learnerId, skillId, input.durationSeconds],
          );
        }

        const [resource, events] = await Promise.all([
          loadResource(client, learnerId, resourceId),
          loadActivity(client, learnerId, 1),
        ]);
        await client.query("COMMIT");
        return { event: events[0]!, resource };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
