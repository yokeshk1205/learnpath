import type { Pool } from "pg";

import { AppError } from "../errors.js";
import type { PrerequisiteServiceContract } from "../prerequisites/types.js";
import type { RetentionServiceContract } from "../retention/types.js";
import { generateCandidateOverview } from "./engine.js";
import type {
  CandidateModuleContext,
  CandidateServiceContract,
  CandidateSkillSource,
} from "./types.js";

type DatabaseRow = Record<string, unknown>;

function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function number(value: unknown): number {
  return Number(value ?? 0);
}

function moduleContext(row: DatabaseRow): CandidateModuleContext | null {
  if (!row.module_id) return null;
  return {
    id: String(row.module_id),
    name: String(row.module_name),
    progressStatus: String(row.module_progress_status) as CandidateModuleContext["progressStatus"],
    sequence: number(row.module_sequence),
  };
}

export function createCandidateService(
  pool: Pool,
  prerequisiteService: PrerequisiteServiceContract,
  retentionService: RetentionServiceContract,
): CandidateServiceContract {
  return {
    async generate(learnerId, enrollmentId) {
      const contextResult = await pool.query(
        `SELECT enrollment.id AS enrollment_id, enrollment.status AS enrollment_status,
                course.id AS course_id, course.slug AS course_slug, course.name AS course_name,
                enrollment.learning_goal_id AS goal_id, goal.name AS goal_name
         FROM course_enrollments enrollment
         JOIN courses course ON course.id = enrollment.course_id
         LEFT JOIN learning_goals goal ON goal.id = enrollment.learning_goal_id
         WHERE enrollment.id = $1 AND enrollment.learner_id = $2
           AND enrollment.status <> 'DROPPED'`,
        [enrollmentId, learnerId],
      );
      const context = contextResult.rows[0] as DatabaseRow | undefined;
      if (!context) {
        throw new AppError(404, "ENROLLMENT_NOT_FOUND", "The course enrollment is unavailable.");
      }

      const [prerequisites, retention] = await Promise.all([
        prerequisiteService.analyze(learnerId, { enrollmentId }),
        retentionService.getOverview(learnerId),
      ]);
      const skillIds = prerequisites.skills.map((skill) => skill.id);
      const metadataResult = await pool.query(
        `WITH observed_learners AS (
           SELECT skill_id, learner_id FROM skill_evidence
           UNION
           SELECT skill_id, learner_id FROM learner_activity_events WHERE skill_id IS NOT NULL
         ),
         observed_counts AS (
           SELECT skill_id, COUNT(DISTINCT learner_id)::int AS observed_learners
           FROM observed_learners GROUP BY skill_id
         ),
         evidence_counts AS (
           SELECT skill_id, COUNT(*)::int AS evidence_observations
           FROM skill_evidence GROUP BY skill_id
         ),
         activity_counts AS (
           SELECT skill_id, COUNT(*)::int AS activity_events
           FROM learner_activity_events WHERE skill_id IS NOT NULL GROUP BY skill_id
         ),
         course_counts AS (
           SELECT skill_id, COUNT(DISTINCT course_id)::int AS course_contexts
           FROM course_skills GROUP BY skill_id
         )
         SELECT skill.id,
                course_skill.sequence AS course_sequence,
                module.id AS module_id, module.name AS module_name,
                module.sequence AS module_sequence,
                COALESCE(module_progress.status, 'NOT_STARTED') AS module_progress_status,
                goal_skill.relevance AS goal_relevance,
                COALESCE(observed_counts.observed_learners, 0) AS observed_learners,
                COALESCE(evidence_counts.evidence_observations, 0) AS evidence_observations,
                COALESCE(activity_counts.activity_events, 0) AS activity_events,
                COALESCE(course_counts.course_contexts, 0) AS course_contexts,
                (SELECT COUNT(*)::int
                 FROM learning_resource_skills resource_skill
                 JOIN learning_resources resource ON resource.id = resource_skill.resource_id
                 WHERE resource_skill.skill_id = skill.id AND resource.is_active) AS resource_count,
                EXISTS (
                  SELECT 1 FROM questions question
                  WHERE question.skill_id = skill.id AND question.status = 'ACTIVE'
                ) AS practice_available
         FROM skills skill
         LEFT JOIN course_skills course_skill
           ON course_skill.course_id = $2 AND course_skill.skill_id = skill.id
         LEFT JOIN modules module ON module.id = course_skill.module_id
         LEFT JOIN learner_module_progress module_progress
           ON module_progress.enrollment_id = $1 AND module_progress.module_id = module.id
         LEFT JOIN goal_skills goal_skill
           ON goal_skill.goal_id = $3 AND goal_skill.skill_id = skill.id
         LEFT JOIN observed_counts ON observed_counts.skill_id = skill.id
         LEFT JOIN evidence_counts ON evidence_counts.skill_id = skill.id
         LEFT JOIN activity_counts ON activity_counts.skill_id = skill.id
         LEFT JOIN course_counts ON course_counts.skill_id = skill.id
         WHERE skill.id = ANY($4::uuid[])`,
        [enrollmentId, context.course_id, context.goal_id ?? null, skillIds],
      );
      const metadataBySkill = new Map(
        (metadataResult.rows as DatabaseRow[]).map((row) => [String(row.id), row]),
      );
      const retentionBySkill = new Map(retention.skills.map((skill) => [skill.id, skill]));
      const sources: CandidateSkillSource[] = prerequisites.skills.map((skill) => {
        const metadata = metadataBySkill.get(skill.id) ?? {};
        const retained = retentionBySkill.get(skill.id);
        return {
          courseSequence: metadata.course_sequence ? number(metadata.course_sequence) : null,
          evidenceCount: retained?.evidenceCount ?? 0,
          evidenceState: retained?.evidenceState ?? "UNKNOWN",
          goalRelevance: nullableNumber(metadata.goal_relevance),
          module: moduleContext(metadata),
          popularity: {
            activityEvents: number(metadata.activity_events),
            courseContexts: number(metadata.course_contexts),
            evidenceObservations: number(metadata.evidence_observations),
            observedLearners: number(metadata.observed_learners),
          },
          practiceAvailable: Boolean(metadata.practice_available) && skill.isContextSkill,
          prerequisite: skill,
          resourceCount: number(metadata.resource_count),
          retention: retained?.retention ?? null,
          retentionState: retained?.state ?? "UNKNOWN",
          revisionDue: retained?.revisionDue ?? false,
        };
      });
      return generateCandidateOverview({
        context: {
          courseId: String(context.course_id),
          courseName: String(context.course_name),
          courseSlug: String(context.course_slug),
          enrollmentId: String(context.enrollment_id),
          enrollmentStatus: String(context.enrollment_status) as "ACTIVE" | "COMPLETED" | "PAUSED",
          goalId: context.goal_id ? String(context.goal_id) : null,
          goalName: context.goal_name ? String(context.goal_name) : null,
        },
        skills: sources,
      });
    },
  };
}
