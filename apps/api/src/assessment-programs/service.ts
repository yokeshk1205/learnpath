import { randomUUID } from "node:crypto";

import type { Pool, PoolClient } from "pg";

import type { DiagnosticContext, DiagnosticServiceContract } from "../diagnostics/types.js";
import { AppError } from "../errors.js";
import {
  assessmentModules,
  assessmentProgramPolicy,
  buildAssessmentBacklog,
  buildKnowledgeBoundary,
  describeAssessmentSkill,
  planAssessmentSession,
  summarizeAssessmentCoverage,
} from "./planner.js";
import type {
  AssessmentProgramOverview,
  AssessmentProgramServiceContract,
  AssessmentProgramSession,
  AssessmentProgramSkill,
  AssessmentProgramSummary,
  CourseSelfReport,
} from "./types.js";

type Row = Record<string, unknown>;
type Database = Pool | PoolClient;

function iso(value: unknown): string {
  return new Date(String(value)).toISOString();
}

function optionalNumber(value: unknown): number | null {
  return value == null ? null : Number(value);
}

async function ownedEnrollment(client: Database, learnerId: string, enrollmentId: string): Promise<DiagnosticContext> {
  const result = await client.query(
    `SELECT ce.id AS enrollment_id, c.id AS course_id, c.name, c.slug
     FROM course_enrollments ce JOIN courses c ON c.id = ce.course_id
     WHERE ce.id = $1 AND ce.learner_id = $2 AND ce.status <> 'DROPPED'`,
    [enrollmentId, learnerId],
  );
  const row = result.rows[0] as Row | undefined;
  if (!row) throw new AppError(404, "ENROLLMENT_NOT_FOUND", "This course enrollment was not found.");
  return { enrollmentId: String(row.enrollment_id), id: String(row.course_id), name: String(row.name), slug: String(row.slug), type: "COURSE" };
}

async function ownedProgram(client: Database, learnerId: string, programId: string, lock = false): Promise<Row> {
  const result = await client.query(
    `SELECT program.* FROM assessment_programs program
     JOIN course_enrollments enrollment ON enrollment.id = program.enrollment_id
       AND enrollment.learner_id = program.learner_id AND enrollment.status <> 'DROPPED'
     WHERE program.id = $1 AND program.learner_id = $2${lock ? " FOR UPDATE OF program" : ""}`,
    [programId, learnerId],
  );
  if (!result.rows[0]) throw new AppError(404, "ASSESSMENT_PROGRAM_NOT_FOUND", "This assessment program was not found.");
  return result.rows[0] as Row;
}

async function loadSkills(client: Database, learnerId: string, courseId: string, programId: string | null): Promise<AssessmentProgramSkill[]> {
  // Count independent question IDs, not answers or sessions. Question-level
  // evidence is global, so valid knowledge transfers between enrolled courses.
  const result = await client.query(
    `WITH direct_questions AS (
       SELECT q.id, q.skill_id, q.cognitive_level, q.difficulty, attempt.submitted_at AS observed_at,
              answer.id AS response_id, answer.is_correct
       FROM assessment_answers answer
       JOIN assessment_attempts attempt ON attempt.id = answer.attempt_id
         AND attempt.learner_id = $1 AND attempt.status = 'SUBMITTED'
       JOIN questions q ON q.id = answer.question_id
       UNION ALL
       SELECT q.id, q.skill_id, q.cognitive_level, q.difficulty, attempt.submitted_at,
              attempt.id, attempt.is_correct
       FROM practice_attempts attempt JOIN questions q ON q.id = attempt.question_id
       WHERE attempt.learner_id = $1 AND attempt.status = 'SUBMITTED'
     ), latest_direct_questions AS (
       SELECT DISTINCT ON (id) id, skill_id, cognitive_level, difficulty, observed_at, is_correct
       FROM direct_questions ORDER BY id, observed_at DESC, response_id DESC
     ), direct_coverage AS (
       SELECT skill_id, COUNT(DISTINCT id)::int AS distinct_question_count,
              COUNT(DISTINCT id) FILTER (WHERE is_correct)::int AS correct_question_count,
              COUNT(DISTINCT id) FILTER (WHERE cognitive_level IN ('APPLY', 'ANALYZE'))::int AS application_question_count,
              COUNT(DISTINCT CASE WHEN difficulty <= 2 THEN 'easy' WHEN difficulty = 3 THEN 'medium' ELSE 'hard' END)::int AS difficulty_band_count,
              MAX(observed_at) AS last_direct_at
       FROM latest_direct_questions GROUP BY skill_id
     ), evidence AS (
       SELECT skill_id, COUNT(*)::int AS evidence_count, MAX(created_at) AS last_evidence_at
       FROM skill_evidence WHERE learner_id = $1 GROUP BY skill_id
     ), latest_diagnostic AS (
       SELECT DISTINCT ON (result.skill_id) result.skill_id, result.diagnostic_classification
       FROM assessment_skill_results result
       JOIN assessment_attempts attempt ON attempt.id = result.attempt_id
       WHERE attempt.learner_id = $1 AND attempt.status = 'SUBMITTED'
       ORDER BY result.skill_id, attempt.submitted_at DESC, attempt.id DESC
     ), used_in_program AS (
       SELECT DISTINCT answer.question_id
       FROM assessment_answers answer JOIN assessment_attempts attempt ON attempt.id = answer.attempt_id
       WHERE attempt.learner_id = $1 AND attempt.assessment_program_id = $3 AND attempt.status = 'SUBMITTED'
     ), bank AS (
       SELECT q.skill_id, COUNT(DISTINCT q.id)::int AS question_count,
              COUNT(DISTINCT q.id) FILTER (WHERE used.question_id IS NULL)::int AS available_question_count,
              COUNT(DISTINCT q.id) FILTER (WHERE q.cognitive_level IN ('APPLY', 'ANALYZE'))::int AS application_question_count,
              COUNT(DISTINCT CASE WHEN q.difficulty <= 2 THEN 'easy' WHEN q.difficulty = 3 THEN 'medium' ELSE 'hard' END)::int AS difficulty_band_count
       FROM assessments assessment
       JOIN assessment_questions aq ON aq.assessment_id = assessment.id
       JOIN questions q ON q.id = aq.question_id AND q.status = 'ACTIVE' AND q.question_purpose = 'DIAGNOSTIC'
       LEFT JOIN used_in_program used ON used.question_id = q.id
       WHERE assessment.course_id = $2 AND assessment.status = 'ACTIVE' AND assessment.assessment_type = 'DIAGNOSTIC'
       GROUP BY q.skill_id
     ), sessions AS (
       SELECT focus.skill_id, COUNT(*)::int AS session_count
       FROM assessment_program_sessions session
       CROSS JOIN LATERAL UNNEST(session.focus_skill_ids) AS focus(skill_id)
       JOIN assessment_attempts attempt ON attempt.id = session.attempt_id AND attempt.status = 'SUBMITTED'
       WHERE session.program_id = $3 GROUP BY focus.skill_id
     )
     SELECT skill.id AS skill_id, skill.name AS skill_name, skill.category,
            module.id AS module_id, module.name AS module_name, module.sequence AS module_sequence, cs.sequence,
            mastery.mastery, mastery.confidence, COALESCE(mastery.evidence_state, 'UNKNOWN') AS evidence_state,
            COALESCE(mastery.retention_state, 'UNKNOWN') AS retention_state,
            latest.diagnostic_classification, GREATEST(evidence.last_evidence_at, direct.last_direct_at) AS last_evidence_at,
            COALESCE(evidence.evidence_count, 0)::int AS evidence_count,
            COALESCE(direct.distinct_question_count, 0)::int AS distinct_question_count,
            COALESCE(direct.correct_question_count, 0)::int AS correct_question_count,
            COALESCE(direct.application_question_count, 0)::int AS application_question_count,
            COALESCE(direct.difficulty_band_count, 0)::int AS difficulty_band_count,
            COALESCE(bank.question_count, 0)::int AS question_count,
            COALESCE(bank.available_question_count, 0)::int AS available_question_count,
            COALESCE(bank.application_question_count, 0)::int AS bank_application_question_count,
            COALESCE(bank.difficulty_band_count, 0)::int AS bank_difficulty_band_count,
            (SELECT COUNT(*)::int FROM skill_prerequisites edge
             WHERE edge.prerequisite_skill_id = skill.id AND edge.relationship_type = 'REQUIRED') AS dependent_count,
            COALESCE(sessions.session_count, 0)::int AS session_count
     FROM course_skills cs JOIN skills skill ON skill.id = cs.skill_id AND skill.is_active
     JOIN modules module ON module.id = cs.module_id AND module.course_id = cs.course_id
     LEFT JOIN learner_skill_mastery mastery ON mastery.learner_id = $1 AND mastery.skill_id = skill.id
     LEFT JOIN direct_coverage direct ON direct.skill_id = skill.id
     LEFT JOIN evidence ON evidence.skill_id = skill.id
     LEFT JOIN latest_diagnostic latest ON latest.skill_id = skill.id
     LEFT JOIN bank ON bank.skill_id = skill.id
     LEFT JOIN sessions ON sessions.skill_id = skill.id
     WHERE cs.course_id = $2 ORDER BY module.sequence, cs.sequence, skill.id`,
    [learnerId, courseId, programId],
  );
  return (result.rows as Row[]).map((row) => describeAssessmentSkill({
    skillId: String(row.skill_id), skillName: String(row.skill_name), category: String(row.category),
    moduleId: String(row.module_id), moduleName: String(row.module_name), moduleSequence: Number(row.module_sequence), sequence: Number(row.sequence),
    mastery: optionalNumber(row.mastery), confidence: optionalNumber(row.confidence),
    evidenceState: row.evidence_state as AssessmentProgramSkill["evidenceState"],
    retentionState: row.retention_state as AssessmentProgramSkill["retentionState"],
    latestClassification: (row.diagnostic_classification ?? null) as AssessmentProgramSkill["latestClassification"],
    lastEvidenceAt: row.last_evidence_at ? iso(row.last_evidence_at) : null,
    evidenceCount: Number(row.evidence_count), distinctQuestionCount: Number(row.distinct_question_count),
    correctQuestionCount: Number(row.correct_question_count ?? 0),
    applicationQuestionCount: Number(row.application_question_count), difficultyBandCount: Number(row.difficulty_band_count),
    questionCount: Number(row.question_count), availableQuestionCount: Number(row.available_question_count),
    dependentCount: Number(row.dependent_count),
    bankApplicationQuestionCount: Number(row.bank_application_question_count), bankDifficultyBandCount: Number(row.bank_difficulty_band_count),
    sessionCount: Number(row.session_count),
  }));
}

async function loadSelfReport(client: Database, enrollmentId: string): Promise<CourseSelfReport> {
  const [profile, modules, skills] = await Promise.all([
    client.query("SELECT submitted_at FROM learner_course_self_reports WHERE enrollment_id = $1", [enrollmentId]),
    client.query(
      `SELECT module_id, familiarity, confidence
       FROM learner_module_self_reports WHERE enrollment_id = $1 ORDER BY module_id`, [enrollmentId],
    ),
    client.query(
      `SELECT skill_id, familiarity, confidence, experience_source, verification_status
       FROM learner_skill_self_reports WHERE enrollment_id = $1 ORDER BY skill_id`, [enrollmentId],
    ),
  ]);
  return {
    submittedAt: profile.rows[0]?.submitted_at ? iso(profile.rows[0].submitted_at) : null,
    moduleReports: (modules.rows as Row[]).map((row) => ({
      moduleId: String(row.module_id),
      familiarity: row.familiarity as CourseSelfReport["moduleReports"][number]["familiarity"],
      confidence: (row.confidence ?? null) as CourseSelfReport["moduleReports"][number]["confidence"],
    })),
    skillReports: (skills.rows as Row[]).map((row) => ({
      skillId: String(row.skill_id),
      familiarity: row.familiarity as CourseSelfReport["skillReports"][number]["familiarity"],
      confidence: (row.confidence ?? null) as CourseSelfReport["skillReports"][number]["confidence"],
      experienceSource: (row.experience_source ?? null) as CourseSelfReport["skillReports"][number]["experienceSource"],
      verificationStatus: row.verification_status as CourseSelfReport["skillReports"][number]["verificationStatus"],
    })),
  };
}

async function synchronizeBacklog(
  client: Database,
  learnerId: string,
  enrollmentId: string,
  items: ReturnType<typeof buildAssessmentBacklog>,
): Promise<void> {
  for (const item of items) {
    await client.query(
      `INSERT INTO learner_assessment_backlog (
         learner_id, enrollment_id, skill_id, priority, reason, status, last_evaluated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (enrollment_id, skill_id) DO UPDATE
       SET learner_id = EXCLUDED.learner_id, priority = EXCLUDED.priority,
           reason = EXCLUDED.reason,
           status = CASE WHEN learner_assessment_backlog.status = 'IN_PROGRESS'
                     AND EXCLUDED.status = 'PENDING' THEN 'IN_PROGRESS' ELSE EXCLUDED.status END,
           last_evaluated_at = NOW(), updated_at = NOW()`,
      [learnerId, enrollmentId, item.skillId, item.priority, item.reason, item.status],
    );
  }
}

async function loadSessions(client: Database, programId: string): Promise<AssessmentProgramSession[]> {
  const result = await client.query(
    `SELECT session.id, session.sequence, session.focus_skill_ids, session.module_id, session.created_at,
            COALESCE(session.attempt_id, attempt.id) AS attempt_id, attempt.status, attempt.submitted_at,
            COALESCE(attempt.question_count, 0)::int AS question_count
     FROM assessment_program_sessions session
     LEFT JOIN assessment_attempts attempt ON attempt.assessment_program_session_id = session.id
       OR attempt.id = session.attempt_id
     WHERE session.program_id = $1 ORDER BY session.sequence`,
    [programId],
  );
  return (result.rows as Row[]).map((row) => ({
    id: String(row.id), sequence: Number(row.sequence), focusSkillIds: row.focus_skill_ids as string[],
    moduleId: row.module_id ? String(row.module_id) : null, attemptId: row.attempt_id ? String(row.attempt_id) : null,
    status: row.status === "SUBMITTED" ? "SUBMITTED" : row.attempt_id ? "IN_PROGRESS" : "PLANNED",
    createdAt: iso(row.created_at), submittedAt: row.submitted_at ? iso(row.submitted_at) : null,
    questionCount: Number(row.question_count),
  }));
}

function summarizeProgram(row: Row, sessions: AssessmentProgramSession[], overview: Pick<AssessmentProgramOverview, "coverage" | "nextSession">): AssessmentProgramSummary {
  const completedSessions = sessions.filter((session) => session.status === "SUBMITTED");
  const activeSession = sessions.find((session) => session.status !== "SUBMITTED");
  const complete = row.mode === "QUICK_PLACEMENT" ? completedSessions.length > 0
    : overview.coverage.totalSkills > 0 && overview.coverage.assessed === overview.coverage.totalSkills;
  const status = activeSession ? "IN_PROGRESS" : complete ? "COMPLETED"
    : overview.nextSession ? "IN_PROGRESS" : "BLOCKED";
  const completedAt = status === "COMPLETED"
    ? (row.completed_at ? iso(row.completed_at) : completedSessions.at(-1)?.submittedAt ?? iso(row.created_at)) : null;
  const lastSubmission = completedSessions.at(-1)?.submittedAt;
  return {
    id: String(row.id), enrollmentId: String(row.enrollment_id), mode: row.mode as AssessmentProgramSummary["mode"], status,
    createdAt: iso(row.created_at), updatedAt: lastSubmission && lastSubmission > iso(row.updated_at) ? lastSubmission : iso(row.updated_at),
    completedAt, completedSessionCount: completedSessions.length, activeSessionId: activeSession?.id ?? null,
  };
}

async function buildOverview(client: Database, learnerId: string, context: DiagnosticContext, row: Row | null): Promise<AssessmentProgramOverview> {
  const skills = await loadSkills(client, learnerId, context.id, row ? String(row.id) : null);
  const sessions = row ? await loadSessions(client, String(row.id)) : [];
  const coverage = summarizeAssessmentCoverage(skills);
  const selfReport = await loadSelfReport(client, context.enrollmentId!);
  const knowledgeBoundary = buildKnowledgeBoundary(skills);
  const backlog = buildAssessmentBacklog(skills);
  await synchronizeBacklog(client, learnerId, context.enrollmentId!, backlog);
  const nextSession = planAssessmentSession(
    skills,
    row ? row.mode as AssessmentProgramSummary["mode"] : "COMPREHENSIVE",
    new Map(selfReport.skillReports.map((report) => [report.skillId, report.familiarity])),
  );
  const program = row ? summarizeProgram(row, sessions, { coverage, nextSession }) : null;
  return {
    context, coverage, skills, modules: assessmentModules(skills), program, sessions,
    selfReport, knowledgeBoundary, backlog,
    nextSession: program?.status === "COMPLETED" ? null : nextSession,
    policy: { ...assessmentProgramPolicy },
  };
}

async function persistProgramStatus(client: Database, overview: AssessmentProgramOverview): Promise<void> {
  if (!overview.program) return;
  await client.query(
    `UPDATE assessment_programs SET status = $2, completed_at = $3, updated_at = NOW() WHERE id = $1`,
    [overview.program.id, overview.program.status, overview.program.completedAt],
  );
}

export function createAssessmentProgramService(pool: Pool, diagnosticService: DiagnosticServiceContract): AssessmentProgramServiceContract {
  return {
    async getOverview(learnerId, input) {
      const context = await ownedEnrollment(pool, learnerId, input.enrollmentId);
      const result = await pool.query(
        `SELECT * FROM assessment_programs WHERE learner_id = $1 AND enrollment_id = $2
         ORDER BY CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END, created_at DESC LIMIT 1`,
        [learnerId, input.enrollmentId],
      );
      return buildOverview(pool, learnerId, context, result.rows[0] as Row | undefined ?? null);
    },

    async create(learnerId, input) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const context = await ownedEnrollment(client, learnerId, input.enrollmentId);
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`assessment-program:${learnerId}:${input.enrollmentId}:${input.mode}`]);
        const existing = await client.query(
          `SELECT * FROM assessment_programs WHERE learner_id = $1 AND enrollment_id = $2 AND mode = $3
           ORDER BY CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END, created_at DESC LIMIT 1 FOR UPDATE`,
          [learnerId, input.enrollmentId, input.mode],
        );
        let row = existing.rows[0] as Row | undefined;
        if (row) {
          const previous = await buildOverview(client, learnerId, context, row);
          await persistProgramStatus(client, previous);
          // Resume completed comprehensive programs as the current coverage
          // view until new evidence or retention creates work. A completed
          // quick placement can be explicitly run again as a new program.
          if (previous.program!.status !== "COMPLETED" || input.mode === "COMPREHENSIVE") {
            await client.query("COMMIT");
            return previous;
          }
        }
        const inserted = await client.query(
          `INSERT INTO assessment_programs (id, learner_id, enrollment_id, mode)
           VALUES ($1, $2, $3, $4) RETURNING *`,
          [randomUUID(), learnerId, input.enrollmentId, input.mode],
        );
        row = inserted.rows[0] as Row;
        const overview = await buildOverview(client, learnerId, context, row);
        await persistProgramStatus(client, overview);
        await client.query("COMMIT");
        return overview;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async getProgram(learnerId, programId) {
      const row = await ownedProgram(pool, learnerId, programId);
      const context = await ownedEnrollment(pool, learnerId, String(row.enrollment_id));
      return buildOverview(pool, learnerId, context, row);
    },

    async saveSelfReport(learnerId, input) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const context = await ownedEnrollment(client, learnerId, input.enrollmentId);
        const curriculum = await client.query(
          `SELECT module.id AS module_id, course_skill.skill_id
           FROM modules module
           LEFT JOIN course_skills course_skill ON course_skill.module_id = module.id
           WHERE module.course_id = $1 ORDER BY module.sequence, course_skill.sequence`,
          [context.id],
        );
        const validModules = new Set((curriculum.rows as Row[]).map((item) => String(item.module_id)));
        const submittedModules = new Set(input.modules.map((item) => item.moduleId));
        if (submittedModules.size !== input.modules.length
          || submittedModules.size !== validModules.size
          || [...validModules].some((id) => !submittedModules.has(id))) {
          throw new AppError(400, "SELF_REPORT_MODULES_INCOMPLETE", "Choose a familiarity level for every course module.");
        }
        const validSkills = new Set((curriculum.rows as Row[]).filter((item) => item.skill_id).map((item) => String(item.skill_id)));
        const skillReports = input.skills ?? [];
        const submittedSkills = new Set(skillReports.map((item) => item.skillId));
        if (submittedSkills.size !== skillReports.length || [...submittedSkills].some((id) => !validSkills.has(id))) {
          throw new AppError(400, "SELF_REPORT_SKILLS_INVALID", "A selected skill does not belong to this course.");
        }
        await client.query(
          `INSERT INTO learner_course_self_reports (enrollment_id, learner_id, course_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (enrollment_id) DO UPDATE
           SET learner_id = EXCLUDED.learner_id, course_id = EXCLUDED.course_id,
               submitted_at = NOW(), updated_at = NOW()`,
          [input.enrollmentId, learnerId, context.id],
        );
        await client.query("DELETE FROM learner_module_self_reports WHERE enrollment_id = $1", [input.enrollmentId]);
        for (const report of input.modules) {
          await client.query(
            `INSERT INTO learner_module_self_reports (
               enrollment_id, course_id, module_id, familiarity, confidence
             ) VALUES ($1, $2, $3, $4, $5)`,
            [input.enrollmentId, context.id, report.moduleId, report.familiarity, report.confidence ?? null],
          );
        }
        await client.query("DELETE FROM learner_skill_self_reports WHERE enrollment_id = $1", [input.enrollmentId]);
        for (const report of skillReports) {
          await client.query(
            `INSERT INTO learner_skill_self_reports (
               enrollment_id, course_id, skill_id, familiarity, confidence, experience_source
             ) VALUES ($1, $2, $3, $4, $5, $6)`,
            [input.enrollmentId, context.id, report.skillId, report.familiarity,
              report.confidence ?? null, report.experienceSource ?? null],
          );
        }
        const current = await client.query(
          `SELECT * FROM assessment_programs WHERE learner_id = $1 AND enrollment_id = $2
           ORDER BY CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END, created_at DESC LIMIT 1`,
          [learnerId, input.enrollmentId],
        );
        const overview = await buildOverview(client, learnerId, context, current.rows[0] as Row | undefined ?? null);
        await client.query("COMMIT");
        return overview;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async startFocusedCheck(learnerId, input) {
      const context = await ownedEnrollment(pool, learnerId, input.enrollmentId);
      const skill = await pool.query(
        `SELECT skill.id FROM course_skills course_skill
         JOIN skills skill ON skill.id = course_skill.skill_id AND skill.is_active
         WHERE course_skill.course_id = $1 AND skill.id = $2`,
        [context.id, input.skillId],
      );
      if (!skill.rows[0]) throw new AppError(404, "COURSE_SKILL_NOT_FOUND", "This skill is not part of the enrolled course.");
      const attempt = await diagnosticService.start(learnerId, {
        enrollmentId: input.enrollmentId,
        focusSkillIds: [input.skillId],
        forceProbe: true,
        intent: input.intent,
      });
      await pool.query(
        `UPDATE learner_assessment_backlog SET status = 'IN_PROGRESS', updated_at = NOW()
         WHERE learner_id = $1 AND enrollment_id = $2 AND skill_id = $3`,
        [learnerId, input.enrollmentId, input.skillId],
      );
      return attempt;
    },

    async startSession(learnerId, programId) {
      const client = await pool.connect();
      let session: AssessmentProgramSession;
      let enrollmentId: string;
      try {
        await client.query("BEGIN");
        const row = await ownedProgram(client, learnerId, programId, true);
        enrollmentId = String(row.enrollment_id);
        const context = await ownedEnrollment(client, learnerId, enrollmentId);
        const overview = await buildOverview(client, learnerId, context, row);
        const active = overview.sessions.find((item) => item.status !== "SUBMITTED");
        if (active) {
          session = active;
        } else {
          if (overview.program!.status === "COMPLETED") throw new AppError(409, "ASSESSMENT_PROGRAM_COMPLETE", "This assessment program is complete. Course coverage and mastery are shown separately.");
          if (!overview.nextSession) throw new AppError(409, "ASSESSMENT_BANK_BLOCKED", "The remaining skills need additional assessment questions before another session can begin.", { coverage: overview.coverage });
          const conflict = await client.query(
            `SELECT attempt.id FROM assessment_attempts attempt JOIN assessments assessment ON assessment.id = attempt.assessment_id
             WHERE attempt.learner_id = $1 AND assessment.course_id = $2 AND attempt.status = 'IN_PROGRESS'`,
            [learnerId, context.id],
          );
          if (conflict.rows[0]) throw new AppError(409, "ASSESSMENT_ATTEMPT_IN_PROGRESS", "Finish or resume the existing assessment session for this course first.", { attemptId: String(conflict.rows[0].id) });
          const id = randomUUID();
          const sequence = (overview.sessions.at(-1)?.sequence ?? 0) + 1;
          const inserted = await client.query(
            `INSERT INTO assessment_program_sessions (id, program_id, sequence, focus_skill_ids, module_id)
             VALUES ($1, $2, $3, $4::uuid[], $5) RETURNING created_at`,
            [id, programId, sequence, overview.nextSession.focusSkillIds, overview.nextSession.moduleId],
          );
          session = {
            id, sequence, focusSkillIds: overview.nextSession.focusSkillIds, moduleId: overview.nextSession.moduleId,
            attemptId: null, status: "PLANNED", createdAt: iso(inserted.rows[0]!.created_at), submittedAt: null, questionCount: 0,
          };
        }
        await client.query("UPDATE assessment_programs SET status = 'IN_PROGRESS', completed_at = NULL, updated_at = NOW() WHERE id = $1", [programId]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
      // The reservation is durable before starting the diagnostic transaction.
      // Failed requests retry the same session; the diagnostic hook serializes
      // its session ID and recovers an attempt committed before a lost reply.
      const attempt = session.attemptId ? await diagnosticService.getAttempt(learnerId, session.attemptId)
        : await diagnosticService.start(learnerId, {
          enrollmentId, focusSkillIds: session.focusSkillIds, assessmentProgramId: programId,
          assessmentProgramSessionId: session.id, forceProbe: true, intent: "COURSE_COVERAGE",
        });
      const attached = await pool.query(
        `UPDATE assessment_program_sessions SET attempt_id = $2
         WHERE id = $1 AND program_id = $3 AND (attempt_id IS NULL OR attempt_id = $2) RETURNING id`,
        [session.id, attempt.id, programId],
      );
      if (!attached.rows[0]) throw new AppError(409, "ASSESSMENT_SESSION_CONFLICT", "This session already belongs to another assessment attempt.");
      const row = await ownedProgram(pool, learnerId, programId);
      const context = await ownedEnrollment(pool, learnerId, enrollmentId);
      const overview = await buildOverview(pool, learnerId, context, row);
      return { program: overview, session: overview.sessions.find((item) => item.id === session.id)!, attempt };
    },
  };
}
