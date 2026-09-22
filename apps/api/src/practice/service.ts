import { randomUUID } from "node:crypto";

import type { Pool, PoolClient } from "pg";

import { AppError } from "../errors.js";
import { difficultyAdjustedScore } from "../mastery/service.js";
import { recordSkillEvidence } from "../skill-evidence/service.js";
import type { PracticeAttempt, PracticeResult, PracticeServiceContract } from "./types.js";

type DatabaseRow = Record<string, unknown>;

function iso(value: unknown): string {
  return new Date(String(value)).toISOString();
}

async function loadAttempt(
  client: Pool | PoolClient,
  learnerId: string,
  attemptId: string,
): Promise<PracticeAttempt> {
  const result = await client.query(
    `SELECT pa.id, pa.status, pa.attempt_number, pa.attempt_kind, pa.started_at,
            s.id AS skill_id, s.slug AS skill_slug, s.name AS skill_name,
            s.category AS skill_category,
            q.id AS question_id, q.prompt, q.difficulty,
            ce.id AS enrollment_id, c.id AS course_id, c.name AS course_name,
            m.id AS module_id, m.name AS module_name,
            qo.id AS option_id, qo.option_key, qo.content AS option_content
     FROM practice_attempts pa
     JOIN skills s ON s.id = pa.skill_id
     JOIN questions q ON q.id = pa.question_id
     JOIN question_options qo ON qo.question_id = q.id
     LEFT JOIN course_enrollments ce ON ce.id = pa.enrollment_id
     LEFT JOIN courses c ON c.id = ce.course_id
     LEFT JOIN course_skills cs ON cs.course_id = c.id AND cs.skill_id = pa.skill_id
     LEFT JOIN modules m ON m.id = cs.module_id
     WHERE pa.id = $1 AND pa.learner_id = $2
     ORDER BY qo.option_key`,
    [attemptId, learnerId],
  );
  const first = result.rows[0] as DatabaseRow | undefined;
  if (!first) throw new AppError(404, "PRACTICE_ATTEMPT_NOT_FOUND", "The practice attempt does not exist.");
  if (first.status !== "IN_PROGRESS") {
    throw new AppError(409, "PRACTICE_ALREADY_SUBMITTED", "This practice attempt has already been submitted.");
  }
  return {
    attemptNumber: Number(first.attempt_number),
    context: first.enrollment_id ? {
      courseId: String(first.course_id),
      courseName: String(first.course_name),
      enrollmentId: String(first.enrollment_id),
      moduleId: first.module_id ? String(first.module_id) : "",
      moduleName: first.module_name ? String(first.module_name) : "Prerequisite foundation",
    } : null,
    id: String(first.id),
    mode: String(first.attempt_kind) as PracticeAttempt["mode"],
    question: {
      difficulty: Number(first.difficulty),
      id: String(first.question_id),
      options: result.rows.map((row: DatabaseRow) => ({
        content: String(row.option_content),
        id: String(row.option_id),
        key: String(row.option_key),
      })),
      prompt: String(first.prompt),
    },
    skill: {
      category: String(first.skill_category),
      id: String(first.skill_id),
      name: String(first.skill_name),
      slug: String(first.skill_slug),
    },
    startedAt: iso(first.started_at),
    status: "IN_PROGRESS",
  };
}

export function createPracticeService(pool: Pool): PracticeServiceContract {
  return {
    async getAttempt(learnerId, attemptId) {
      return loadAttempt(pool, learnerId, attemptId);
    },

    async start(learnerId, input) {
      const mode = input.mode ?? "PRACTICE";
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const context = input.enrollmentId
          ? await client.query(
            `WITH RECURSIVE skill_scope(skill_id, module_id) AS (
               SELECT cs.skill_id, cs.module_id
               FROM course_enrollments enrolled
               JOIN course_skills cs ON cs.course_id = enrolled.course_id
               WHERE enrolled.id = $2 AND enrolled.learner_id = $1
                 AND enrolled.status <> 'DROPPED'
               UNION
               SELECT prerequisite.prerequisite_skill_id, NULL::uuid
               FROM skill_scope current_skill
               JOIN skill_prerequisites prerequisite
                 ON prerequisite.skill_id = current_skill.skill_id
                AND prerequisite.relationship_type = 'REQUIRED'
             )
             SELECT ce.id AS enrollment_id, ce.course_id, scope.module_id
             FROM course_enrollments ce
             JOIN skill_scope scope ON scope.skill_id = $3
             WHERE ce.id = $2 AND ce.learner_id = $1 AND ce.status <> 'DROPPED'
             ORDER BY scope.module_id NULLS LAST
             LIMIT 1`,
            [learnerId, input.enrollmentId, input.skillId],
          )
          : await client.query(
            `SELECT NULL::uuid AS enrollment_id, NULL::uuid AS course_id, NULL::uuid AS module_id
             FROM learner_skill_mastery lsm
             WHERE lsm.learner_id = $1 AND lsm.skill_id = $2
               AND (
                 EXISTS (
                   SELECT 1 FROM course_enrollments ce
                   JOIN course_skills cs ON cs.course_id = ce.course_id
                   WHERE ce.learner_id = $1 AND ce.status <> 'DROPPED' AND cs.skill_id = $2
                 )
                 OR EXISTS (
                   SELECT 1 FROM learner_goals lg
                   JOIN goal_skills gs ON gs.goal_id = lg.goal_id
                   WHERE lg.learner_id = $1 AND lg.status <> 'DROPPED' AND gs.skill_id = $2
                 )
               )`,
            [learnerId, input.skillId],
          );
        const contextRow = context.rows[0] as DatabaseRow | undefined;
        if (!contextRow) {
          throw new AppError(404, "PRACTICE_CONTEXT_NOT_FOUND", "This skill is not available in the learner's active context.");
        }
        await client.query(
          `INSERT INTO learner_skill_mastery (id, learner_id, skill_id)
           VALUES ($1, $2, $3) ON CONFLICT (learner_id, skill_id) DO NOTHING`,
          [randomUUID(), learnerId, input.skillId],
        );
        const learnerState = await client.query(
          `SELECT 1 FROM learner_skill_mastery
           WHERE learner_id = $1 AND skill_id = $2 FOR UPDATE`,
          [learnerId, input.skillId],
        );
        if (mode === "RETENTION_CHECK") {
          const eligibility = await client.query(
            `SELECT state.mastery, COUNT(evidence.id)::int AS evidence_count
             FROM learner_skill_mastery state
             LEFT JOIN skill_evidence evidence
               ON evidence.learner_id = state.learner_id AND evidence.skill_id = state.skill_id
             WHERE state.learner_id = $1 AND state.skill_id = $2
             GROUP BY state.mastery`,
            [learnerId, input.skillId],
          );
          if (!learnerState.rows[0] || eligibility.rows[0]?.mastery === null
            || Number(eligibility.rows[0]?.evidence_count ?? 0) === 0) {
            throw new AppError(409, "RETENTION_CHECK_NOT_AVAILABLE", "Retention can only be checked after real performance evidence exists.");
          }
        }

        const active = await client.query(
          `SELECT id FROM practice_attempts
           WHERE learner_id = $1 AND skill_id = $2 AND status = 'IN_PROGRESS'`,
          [learnerId, input.skillId],
        );
        if (active.rows[0]) {
          const existing = await loadAttempt(client, learnerId, String(active.rows[0].id));
          await client.query("COMMIT");
          return existing;
        }

        const question = await client.query(
          `SELECT q.id
           FROM questions q
           WHERE q.skill_id = $1 AND q.status = 'ACTIVE'
             AND q.question_type = 'SINGLE_CHOICE'
             AND q.question_purpose = $3
           ORDER BY (
             SELECT COUNT(*) FROM practice_attempts previous
             WHERE previous.learner_id = $2 AND previous.question_id = q.id
           ), q.difficulty, q.slug
           LIMIT 1`,
          [input.skillId, learnerId, mode === "RETENTION_CHECK" ? "ASSESSMENT" : mode],
        );
        if (!question.rows[0]) {
          throw new AppError(
            409,
            mode === "ASSESSMENT" ? "ASSESSMENT_NOT_AVAILABLE" : "PRACTICE_NOT_AVAILABLE",
            `No validated ${mode === "ASSESSMENT" ? "assessment" : "practice"} question is available for this skill yet.`,
          );
        }
        const attemptCount = await client.query(
          `SELECT COALESCE(MAX(attempt_number), 0)::int + 1 AS next_attempt
           FROM practice_attempts WHERE learner_id = $1 AND skill_id = $2`,
          [learnerId, input.skillId],
        );
        const attemptId = randomUUID();
        await client.query(
          `INSERT INTO practice_attempts (
             id, learner_id, skill_id, enrollment_id, question_id, attempt_number, attempt_kind
           ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            attemptId, learnerId, input.skillId, contextRow.enrollment_id ?? null,
            question.rows[0].id, attemptCount.rows[0].next_attempt,
            mode,
          ],
        );
        const startedEvent = mode === "RETENTION_CHECK"
          ? "RETENTION_CHECK_STARTED"
          : mode === "ASSESSMENT" ? "ASSESSMENT_STARTED" : "PRACTICE_STARTED";
        await client.query(
          `INSERT INTO learner_activity_events (
             id, learner_id, course_id, module_id, skill_id, event_type, result, metadata
           ) VALUES ($1, $2, $3, $4, $5, $6, '{}'::jsonb, $7::jsonb)`,
          [
            randomUUID(), learnerId, contextRow.course_id ?? null,
            contextRow.module_id ?? null, input.skillId, startedEvent,
            JSON.stringify({ attemptId, source: mode.toLowerCase() }),
          ],
        );
        const attempt = await loadAttempt(client, learnerId, attemptId);
        await client.query("COMMIT");
        return attempt;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async submit(learnerId, attemptId, input): Promise<PracticeResult> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const attemptResult = await client.query(
          `SELECT pa.id, pa.status, pa.skill_id, pa.question_id, pa.attempt_number,
                  pa.attempt_kind,
                  pa.enrollment_id, q.difficulty, q.explanation, s.name AS skill_name,
                  ce.course_id, cs.module_id
           FROM practice_attempts pa
           JOIN questions q ON q.id = pa.question_id
           JOIN skills s ON s.id = pa.skill_id
           LEFT JOIN course_enrollments ce ON ce.id = pa.enrollment_id
           LEFT JOIN course_skills cs ON cs.course_id = ce.course_id AND cs.skill_id = pa.skill_id
           WHERE pa.id = $1 AND pa.learner_id = $2
           FOR UPDATE OF pa`,
          [attemptId, learnerId],
        );
        const attempt = attemptResult.rows[0] as DatabaseRow | undefined;
        if (!attempt) throw new AppError(404, "PRACTICE_ATTEMPT_NOT_FOUND", "The practice attempt does not exist.");
        if (attempt.status !== "IN_PROGRESS") {
          throw new AppError(409, "PRACTICE_ALREADY_SUBMITTED", "This practice attempt has already been submitted.");
        }
        const optionResult = await client.query(
          `SELECT selected.id, selected.content, selected.is_correct,
                  correct.content AS correct_content
           FROM question_options selected
           JOIN question_options correct
             ON correct.question_id = selected.question_id AND correct.is_correct
           WHERE selected.id = $1 AND selected.question_id = $2`,
          [input.optionId, attempt.question_id],
        );
        const option = optionResult.rows[0] as DatabaseRow | undefined;
        if (!option) throw new AppError(400, "INVALID_PRACTICE_ANSWER", "The selected answer does not belong to this question.");
        const isCorrect = Boolean(option.is_correct);
        const difficulty = Number(attempt.difficulty);
        const score = attempt.attempt_kind === "ASSESSMENT"
          ? (isCorrect ? 1 : 0)
          : difficultyAdjustedScore({ difficulty, isCorrect });
        await client.query(
          `UPDATE practice_attempts
           SET status = 'SUBMITTED', selected_option_id = $3, is_correct = $4,
               score = $5, hints_used = $6::smallint, duration_seconds = $7,
               submitted_at = NOW()
           WHERE id = $1 AND learner_id = $2`,
          [attemptId, learnerId, input.optionId, isCorrect, score, input.hintsUsed, input.durationSeconds],
        );
        const update = await recordSkillEvidence(client, {
          learnerId,
          observations: [{
            attemptNumber: Number(attempt.attempt_number),
            correct: isCorrect,
            difficulty,
            hintsUsed: input.hintsUsed,
            metadata: { questionId: String(attempt.question_id) },
            score,
            timeTakenSeconds: input.durationSeconds,
          }],
          performanceScore: score,
          skillId: String(attempt.skill_id),
          sourceId: attemptId,
          sourceType: String(attempt.attempt_kind) as "ASSESSMENT" | "PRACTICE" | "RETENTION_CHECK",
        });
        const completedEvent = attempt.attempt_kind === "RETENTION_CHECK"
          ? "RETENTION_CHECK_COMPLETED"
          : attempt.attempt_kind === "ASSESSMENT" ? "ASSESSMENT_COMPLETED" : "PRACTICE_COMPLETED";
        await client.query(
          `INSERT INTO learner_activity_events (
             id, learner_id, course_id, module_id, skill_id, event_type,
             duration_seconds, result, metadata
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)`,
          [
            randomUUID(), learnerId, attempt.course_id ?? null, attempt.module_id ?? null,
            attempt.skill_id, completedEvent, input.durationSeconds,
            JSON.stringify({
              correct: isCorrect,
              evidenceState: update.evidenceStateAfter,
              score,
            }),
            JSON.stringify({ attemptId, questionId: attempt.question_id, source: String(attempt.attempt_kind).toLowerCase() }),
          ],
        );
        const submittedAt = new Date().toISOString();
        await client.query("COMMIT");
        return {
          attempt: {
            attemptNumber: Number(attempt.attempt_number),
            durationSeconds: input.durationSeconds,
            id: attemptId,
            submittedAt,
          },
          evidence: {
            confidenceAfter: update.confidenceAfter,
            confidenceBefore: update.confidenceBefore,
            evidenceCount: update.evidenceCount,
            evidenceStateAfter: update.evidenceStateAfter,
            evidenceStateBefore: update.evidenceStateBefore,
            masteryAfter: update.masteryAfter,
            masteryBefore: update.masteryBefore,
            retentionAfter: update.retentionAfter,
            retentionBefore: update.retentionBefore,
            retentionStateAfter: update.retentionStateAfter,
            retentionStateBefore: update.retentionStateBefore,
          },
          feedback: {
            correctOptionContent: String(option.correct_content),
            explanation: String(attempt.explanation),
            isCorrect,
            score,
            selectedOptionContent: String(option.content),
          },
          skill: { id: String(attempt.skill_id), name: String(attempt.skill_name) },
        };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
