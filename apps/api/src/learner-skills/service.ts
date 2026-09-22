import type { Pool } from "pg";

import type {
  LearnerSkillServiceContract,
  LearnerSkillState,
  SkillCourseContext,
  SkillGoalContext,
  SkillPassport,
} from "./types.js";
import { refreshLearnerRetention } from "../retention/service.js";

type DatabaseRow = Record<string, unknown>;

function number(value: unknown): number {
  return Number(value);
}

function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : number(value);
}

function nullableIso(value: unknown): string | null {
  return value ? new Date(String(value)).toISOString() : null;
}

function mean(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null);
  if (!present.length) return null;
  return Math.round((present.reduce((total, value) => total + value, 0) / present.length) * 10_000) / 10_000;
}

function mapSkill(row: DatabaseRow): LearnerSkillState {
  const mastery = nullableNumber(row.mastery);
  const evidenceState = row.evidence_state as LearnerSkillState["evidenceState"];
  return {
    attemptCount: number(row.attempt_count),
    category: String(row.category),
    confidence: nullableNumber(row.confidence),
    correctAttempts: number(row.correct_attempts),
    courseContexts: row.course_contexts as SkillCourseContext[],
    description: String(row.description),
    difficulty: number(row.difficulty),
    domainName: String(row.domain_name),
    evidenceCount: number(row.evidence_count),
    evidenceState,
    evidenceStatus: evidenceState === "UNKNOWN" ? "UNASSESSED" : "ASSESSED",
    goalContexts: row.goal_contexts as SkillGoalContext[],
    id: String(row.skill_id),
    incorrectAttempts: number(row.incorrect_attempts),
    lastAssessedAt: nullableIso(row.last_assessed_at),
    lastPracticedAt: nullableIso(row.last_practiced_at),
    mastery,
    name: String(row.name),
    practiceAvailable: Boolean(row.practice_available),
    retention: nullableNumber(row.retention),
    retentionAnchorAt: nullableIso(row.retention_anchor_at),
    retentionCalculatedAt: nullableIso(row.retention_calculated_at),
    retentionState: String(row.retention_state) as LearnerSkillState["retentionState"],
    revisionDue: Boolean(row.revision_due),
    slug: String(row.slug),
    totalTimeSpentSeconds: number(row.total_time_spent_seconds),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

export function createLearnerSkillService(pool: Pool): LearnerSkillServiceContract {
  return {
    async getPassport(learnerId): Promise<SkillPassport> {
      await refreshLearnerRetention(pool, learnerId);
      const result = await pool.query(
        `SELECT lsm.skill_id, lsm.mastery, lsm.confidence, lsm.retention,
                lsm.retention_state, lsm.retention_anchor_at, lsm.retention_calculated_at,
                (lsm.mastery >= 0.65 AND lsm.retention_state IN ('AT_RISK', 'CRITICAL')) AS revision_due,
                lsm.evidence_state,
                lsm.attempt_count, lsm.correct_attempts, lsm.incorrect_attempts,
                lsm.last_assessed_at, lsm.last_practiced_at,
                lsm.total_time_spent_seconds, lsm.updated_at,
                s.slug, s.name, s.description, s.category, s.difficulty,
                d.name AS domain_name,
                (SELECT COUNT(*)::int FROM skill_evidence evidence
                 WHERE evidence.learner_id = lsm.learner_id
                   AND evidence.skill_id = lsm.skill_id) AS evidence_count,
                EXISTS (
                  SELECT 1 FROM questions practice_question
                  WHERE practice_question.skill_id = lsm.skill_id
                    AND practice_question.status = 'ACTIVE'
                    AND practice_question.question_purpose = 'PRACTICE'
                ) AS practice_available,
                COALESCE((
                  SELECT jsonb_agg(jsonb_build_object(
                    'courseId', course_context.course_id,
                    'courseName', course_context.course_name,
                    'enrollmentId', course_context.enrollment_id,
                    'enrollmentStatus', course_context.enrollment_status,
                    'usageType', course_context.usage_type
                  ) ORDER BY (course_context.usage_type = 'COURSE_SKILL') DESC,
                             course_context.course_name)
                  FROM (
                    WITH RECURSIVE enrolled_course_skills AS (
                      SELECT ce.id AS enrollment_id, ce.status AS enrollment_status,
                             c.id AS course_id, c.name AS course_name, cs.skill_id,
                             'COURSE_SKILL'::text AS usage_type
                      FROM course_enrollments ce
                      JOIN courses c ON c.id = ce.course_id
                      JOIN course_skills cs ON cs.course_id = ce.course_id
                      WHERE ce.learner_id = lsm.learner_id
                        AND ce.status <> 'DROPPED'

                      UNION

                      SELECT context.enrollment_id, context.enrollment_status,
                             context.course_id, context.course_name,
                             prerequisite.prerequisite_skill_id,
                             'PREREQUISITE'::text
                      FROM enrolled_course_skills context
                      JOIN skill_prerequisites prerequisite
                        ON prerequisite.skill_id = context.skill_id
                    )
                    SELECT course_id, course_name, enrollment_id, enrollment_status,
                           CASE WHEN BOOL_OR(usage_type = 'COURSE_SKILL')
                             THEN 'COURSE_SKILL' ELSE 'PREREQUISITE' END AS usage_type
                    FROM enrolled_course_skills
                    WHERE skill_id = lsm.skill_id
                    GROUP BY course_id, course_name, enrollment_id, enrollment_status
                  ) course_context
                ), '[]'::jsonb) AS course_contexts,
                COALESCE((
                  SELECT jsonb_agg(jsonb_build_object(
                    'goalId', goal_context.goal_id,
                    'goalName', goal_context.goal_name,
                    'goalStatus', goal_context.goal_status,
                    'requiredMastery', goal_context.required_mastery
                  ) ORDER BY goal_context.goal_name)
                  FROM (
                    SELECT DISTINCT g.id AS goal_id, g.name AS goal_name,
                           lg.status AS goal_status, gs.required_mastery
                    FROM learner_goals lg
                    JOIN learning_goals g ON g.id = lg.goal_id
                    JOIN goal_skills gs ON gs.goal_id = lg.goal_id
                    WHERE lg.learner_id = lsm.learner_id
                      AND gs.skill_id = lsm.skill_id
                      AND lg.status <> 'DROPPED'
                  ) goal_context
                ), '[]'::jsonb) AS goal_contexts
         FROM learner_skill_mastery lsm
         JOIN skills s ON s.id = lsm.skill_id
         JOIN domains d ON d.id = s.domain_id
         WHERE lsm.learner_id = $1 AND s.is_active
         ORDER BY CASE WHEN lsm.mastery IS NULL THEN 1 ELSE 0 END,
                  s.category, s.difficulty, s.name`,
        [learnerId],
      );

      const skills = result.rows.map(mapSkill);
      const assessedSkills = skills.filter((skill) => skill.evidenceStatus === "ASSESSED").length;
      const trackedSkills = skills.length;
      return {
        skills,
        summary: {
          assessedStateSkills: skills.filter((skill) => skill.evidenceState === "ASSESSED").length,
          assessedSkills,
          averageConfidence: mean(skills.map((skill) => skill.confidence)),
          averageMastery: mean(skills.map((skill) => skill.mastery)),
          averageRetention: mean(skills.map((skill) => skill.retention)),
          evidenceCoverage: trackedSkills ? Math.round((assessedSkills / trackedSkills) * 10_000) / 100 : 0,
          estimatedSkills: skills.filter((skill) => skill.evidenceState === "ESTIMATED").length,
          sharedAcrossCourses: skills.filter(
            (skill) => skill.mastery !== null && skill.courseContexts.length > 1,
          ).length,
          totalAttempts: skills.reduce((total, skill) => total + skill.attemptCount, 0),
          trackedSkills,
          unassessedSkills: trackedSkills - assessedSkills,
          verifiedSkills: skills.filter((skill) => skill.evidenceState === "VERIFIED").length,
          atRiskSkills: skills.filter((skill) => skill.retentionState === "AT_RISK").length,
          criticalSkills: skills.filter((skill) => skill.retentionState === "CRITICAL").length,
          revisionDueSkills: skills.filter((skill) => skill.revisionDue).length,
          strongRetentionSkills: skills.filter((skill) => skill.retentionState === "STRONG").length,
        },
      };
    },
  };
}
