import { randomUUID } from "node:crypto";

import type { Pool, PoolClient } from "pg";

import { AppError } from "../errors.js";
import { calculateDiagnosticScore, type DiagnosticObservation } from "../mastery/service.js";
import { recordSkillEvidence } from "../skill-evidence/service.js";
import {
  scoreDiagnosticResponse,
  type DiagnosticAnswerKey,
  type DiagnosticQuestionType,
  type DiagnosticResponseInput,
} from "./scoring.js";
import {
  calculateEvidenceStrength,
  calculateDiagnosticPerformance,
  calculateDiagnosticReliability,
  classifyDiagnosticSkill,
  diagnosticDecisionReason,
  masteryInterval,
  type DiagnosticClassification,
  type DiagnosticCognitiveLevel,
  type DiagnosticMeasurement,
} from "./estimation.js";
import {
  diagnosticSelectionPolicyVersion,
  initializeDiagnosticSelection,
  selectNextDiagnosticQuestion,
  type DiagnosticQuestionCandidate,
  type DiagnosticSelectionObservation,
} from "./selection.js";
import {
  diagnosticMaximumQuestions,
  diagnosticMinimumQuestions,
  evaluateDiagnosticStopping,
} from "./stopping.js";
import type {
  DiagnosticAnswerResult,
  DiagnosticAttempt,
  DiagnosticAttemptSummary,
  DiagnosticContext,
  DiagnosticOverview,
  DiagnosticQuestion,
  DiagnosticResult,
  DiagnosticServiceContract,
  DiagnosticSkillResult,
  DiagnosticUntestedSkill,
} from "./types.js";

type DatabaseRow = Record<string, unknown>;

interface DiagnosticContextRow extends DatabaseRow {
  assessment_id: string;
  context_id: string;
  context_name: string;
  context_slug: string;
  context_type: "COURSE" | "GOAL";
  enrollment_id: string | null;
  learner_goal_id: string | null;
}

function number(value: unknown): number {
  return Number(value);
}

function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : number(value);
}

function iso(value: unknown): string {
  return new Date(String(value)).toISOString();
}

interface ScoringQuestion extends DiagnosticAnswerKey {
  cognitiveLevel: DiagnosticCognitiveLevel;
  difficulty: number;
  discrimination: number;
  guessProbability: number;
  skillId: string;
}

async function loadScoringQuestions(client: Pool | PoolClient, attemptId: string): Promise<Map<string, ScoringQuestion>> {
  const result = await client.query(
    `SELECT q.id AS question_id, q.skill_id, q.difficulty, q.discrimination,
            q.guess_probability, q.cognitive_level, q.question_type, q.numeric_answer, q.numeric_tolerance,
            option.id AS option_id, option.is_correct, option.misconception_code
     FROM diagnostic_attempt_questions snapshot
     CROSS JOIN LATERAL jsonb_to_record(snapshot.question_snapshot) AS raw(
       id uuid, difficulty smallint, discrimination numeric, "cognitiveLevel" text,
       "questionType" text, "numericAnswer" double precision, "numericTolerance" double precision,
       "guessProbability" numeric, skill jsonb, options jsonb
     )
     CROSS JOIN LATERAL (SELECT raw.id, (raw.skill->>'id')::uuid AS skill_id, raw.difficulty,
       raw.discrimination, raw."cognitiveLevel" AS cognitive_level,
       raw."questionType" AS question_type, raw."numericAnswer" AS numeric_answer,
       raw."numericTolerance" AS numeric_tolerance, raw."guessProbability" AS guess_probability,
       raw.options) q
     LEFT JOIN LATERAL jsonb_to_recordset(q.options) AS option_raw(
       id uuid, key text, content text, "isCorrect" boolean, "misconceptionCode" text
     ) ON TRUE
     CROSS JOIN LATERAL (SELECT option_raw.id, option_raw.key AS option_key,
       option_raw."isCorrect" AS is_correct,
       option_raw."misconceptionCode" AS misconception_code) option
     WHERE snapshot.attempt_id = $1 ORDER BY snapshot.sequence, option.option_key`,
    [attemptId],
  );
  const questions = new Map<string, ScoringQuestion>();
  for (const row of result.rows as DatabaseRow[]) {
    const id = String(row.question_id);
    const question = questions.get(id) ?? {
      questionType: String(row.question_type ?? "SINGLE_CHOICE") as DiagnosticQuestionType,
      numericAnswer: nullableNumber(row.numeric_answer), numericTolerance: nullableNumber(row.numeric_tolerance),
      cognitiveLevel: String(row.cognitive_level) as DiagnosticCognitiveLevel,
      difficulty: number(row.difficulty), discrimination: number(row.discrimination),
      guessProbability: number(row.guess_probability), skillId: String(row.skill_id), options: new Map(),
    };
    if (row.option_id) question.options.set(String(row.option_id), {
      isCorrect: Boolean(row.is_correct), misconceptionCode: row.misconception_code ? String(row.misconception_code) : null,
    });
    questions.set(id, question);
  }
  return questions;
}

function responseFromDraft(row: DatabaseRow): DiagnosticResponseInput {
  return {
    isUnsure: Boolean(row.is_unsure), optionId: row.selected_option_id ? String(row.selected_option_id) : null,
    ...(Array.isArray(row.selected_option_ids) && row.selected_option_ids.length ? { selectedOptionIds: row.selected_option_ids.map(String) } : {}),
    ...(row.numeric_answer != null ? { numericAnswer: number(row.numeric_answer) } : {}),
  };
}

function mapAttemptSummary(row: DatabaseRow | undefined): DiagnosticAttemptSummary | null {
  if (!row) return null;
  return {
    correctCount: nullableNumber(row.correct_count),
    id: String(row.id),
    overallScore: nullableNumber(row.overall_score),
    questionCount: number(row.question_count),
    startedAt: iso(row.started_at),
    status: row.status as DiagnosticAttemptSummary["status"],
    submittedAt: row.submitted_at ? iso(row.submitted_at) : null,
  };
}

function mapContext(row: DatabaseRow): DiagnosticContext {
  return {
    enrollmentId: row.enrollment_id ? String(row.enrollment_id) : null,
    id: String(row.context_id),
    name: String(row.context_name),
    slug: String(row.context_slug),
    type: row.context_type as DiagnosticContext["type"],
  };
}

async function courseContext(
  client: Pool | PoolClient,
  learnerId: string,
  enrollmentId?: string,
): Promise<DiagnosticContextRow | undefined> {
  const result = await client.query(
    `SELECT ce.id AS enrollment_id, NULL::uuid AS learner_goal_id,
            c.id AS context_id, c.name AS context_name, c.slug AS context_slug,
            'COURSE'::text AS context_type,
            a.id AS assessment_id, a.title, a.description, a.estimated_minutes,
            COUNT(DISTINCT aq.question_id)::int AS question_count,
            COUNT(DISTINCT q.skill_id)::int AS skill_count
     FROM course_enrollments ce
     JOIN courses c ON c.id = ce.course_id
     JOIN assessments a ON a.course_id = c.id AND a.status = 'ACTIVE'
     JOIN assessment_questions aq ON aq.assessment_id = a.id
     JOIN questions q ON q.id = aq.question_id AND q.status = 'ACTIVE'
     WHERE ce.learner_id = $1 AND ce.status <> 'DROPPED'
       AND ($2::uuid IS NULL OR ce.id = $2)
     GROUP BY ce.id, c.id, a.id
     ORDER BY CASE ce.status WHEN 'ACTIVE' THEN 0 WHEN 'PAUSED' THEN 1 ELSE 2 END,
              ce.last_accessed_at DESC
     LIMIT 1`,
    [learnerId, enrollmentId ?? null],
  );
  return result.rows[0] as DiagnosticContextRow | undefined;
}

async function goalContext(
  client: Pool | PoolClient,
  learnerId: string,
  goalId?: string,
): Promise<DiagnosticContextRow | undefined> {
  const result = await client.query(
    `SELECT NULL::uuid AS enrollment_id, lg.id AS learner_goal_id,
            g.id AS context_id, g.name AS context_name, g.slug AS context_slug,
            'GOAL'::text AS context_type,
            a.id AS assessment_id, a.title, a.description, a.estimated_minutes,
            COUNT(DISTINCT aq.question_id)::int AS question_count,
            COUNT(DISTINCT q.skill_id)::int AS skill_count
     FROM learner_goals lg
     JOIN learning_goals g ON g.id = lg.goal_id
     JOIN assessments a ON a.goal_id = g.id AND a.status = 'ACTIVE'
     JOIN assessment_questions aq ON aq.assessment_id = a.id
     JOIN questions q ON q.id = aq.question_id AND q.status = 'ACTIVE'
     WHERE lg.learner_id = $1 AND lg.status = 'ACTIVE'
       AND ($2::uuid IS NULL OR g.id = $2)
     GROUP BY lg.id, g.id, a.id
     ORDER BY lg.priority, lg.selected_at DESC
     LIMIT 1`,
    [learnerId, goalId ?? null],
  );
  return result.rows[0] as DiagnosticContextRow | undefined;
}

async function resolveContext(
  client: Pool | PoolClient,
  learnerId: string,
  input: { enrollmentId?: string; goalId?: string } = {},
): Promise<DiagnosticContextRow | undefined> {
  if (input.enrollmentId) return courseContext(client, learnerId, input.enrollmentId);
  if (input.goalId) return goalContext(client, learnerId, input.goalId);
  return (await courseContext(client, learnerId)) ?? goalContext(client, learnerId);
}

async function loadCourseDiagnosticCandidates(
  client: Pool | PoolClient,
  learnerId: string,
  context: DiagnosticContextRow,
  scope: DatabaseRow = {},
): Promise<DiagnosticQuestionCandidate[]> {
  const candidateRows = await client.query(
    `SELECT q.id AS question_id, q.skill_id, q.difficulty,
            q.discrimination, q.guess_probability, q.cognitive_level, q.diagnostic_role,
            s.name AS skill_name, cs.sequence AS context_sequence,
            lsm.mastery, lsm.confidence,
            COALESCE(skill_report.familiarity, module_report.familiarity) AS self_report_familiarity,
            COALESCE(skill_report.confidence, module_report.confidence) AS self_report_confidence,
            COALESCE(lsm.retention_state, 'UNKNOWN') AS retention_state,
            0.7::numeric AS target_mastery,
            (SELECT COUNT(*)::int
             FROM skill_prerequisites prerequisite
             WHERE prerequisite.prerequisite_skill_id = q.skill_id
               AND prerequisite.relationship_type = 'REQUIRED') AS dependent_count
            , EXISTS (
                SELECT 1 FROM question_options option
                WHERE option.question_id = q.id
                  AND NOT option.is_correct
                  AND option.misconception_code IS NOT NULL
                  AND option.misconception_code <> 'UNCLASSIFIED_DISTRACTOR'
              ) AS misconception_mapped
            , COALESCE((
                SELECT SUM(misconception.occurrence_count)::int
                FROM learner_skill_misconceptions misconception
                WHERE misconception.learner_id = $1
                  AND misconception.skill_id = q.skill_id
              ), 0) AS misconception_evidence_count
            , (SELECT COUNT(*)::int
               FROM assessment_answers previous_answer
               JOIN assessment_attempts previous_attempt ON previous_attempt.id = previous_answer.attempt_id
               WHERE previous_attempt.learner_id = $1
                 AND previous_answer.question_id = q.id) AS exposure_count
     FROM assessment_questions aq
     JOIN questions q ON q.id = aq.question_id
       AND q.status = 'ACTIVE' AND q.question_purpose = 'DIAGNOSTIC'
     JOIN skills s ON s.id = q.skill_id
     JOIN course_skills cs ON cs.course_id = $3 AND cs.skill_id = q.skill_id
     LEFT JOIN learner_skill_mastery lsm
       ON lsm.learner_id = $1 AND lsm.skill_id = q.skill_id
     LEFT JOIN learner_module_self_reports module_report
       ON module_report.enrollment_id = $6 AND module_report.module_id = cs.module_id
     LEFT JOIN learner_skill_self_reports skill_report
       ON skill_report.enrollment_id = $6 AND skill_report.skill_id = q.skill_id
     WHERE aq.assessment_id = $2
       AND ($4::uuid[] IS NULL OR q.skill_id = ANY($4::uuid[]))
       AND ($5::uuid IS NULL OR NOT EXISTS (
         SELECT 1 FROM assessment_answers used
         JOIN assessment_attempts prior ON prior.id = used.attempt_id
         WHERE prior.learner_id = $1 AND prior.assessment_program_id = $5
           AND prior.status = 'SUBMITTED' AND used.question_id = q.id
       ))
     ORDER BY cs.sequence, aq.sequence`,
    [learnerId, context.assessment_id, context.context_id,
      scope.diagnostic_focus_skill_ids ?? null, scope.assessment_program_id ?? null,
      context.enrollment_id ?? null],
  );
  return (candidateRows.rows as DatabaseRow[]).map((row) => ({
    forceProbe: Boolean(scope.diagnostic_force_probe),
    cognitiveLevel: String(row.cognitive_level) as DiagnosticCognitiveLevel,
    confidence: nullableNumber(row.confidence),
    contextSequence: number(row.context_sequence),
    dependentCount: number(row.dependent_count),
    diagnosticRole: String(row.diagnostic_role) as DiagnosticQuestionCandidate["diagnosticRole"],
    difficulty: number(row.difficulty),
    discrimination: number(row.discrimination),
    exposureCount: number(row.exposure_count),
    guessProbability: number(row.guess_probability),
    mastery: nullableNumber(row.mastery),
    misconceptionEvidenceCount: number(row.misconception_evidence_count),
    misconceptionMapped: Boolean(row.misconception_mapped),
    questionId: String(row.question_id),
    retentionState: String(row.retention_state) as DiagnosticQuestionCandidate["retentionState"],
    skillId: String(row.skill_id),
    skillName: String(row.skill_name),
    targetMastery: number(row.target_mastery),
    selfReportFamiliarity: (row.self_report_familiarity ?? null) as DiagnosticQuestionCandidate["selfReportFamiliarity"],
    selfReportConfidence: (row.self_report_confidence ?? null) as DiagnosticQuestionCandidate["selfReportConfidence"],
  }));
}

async function ensureAttemptQuestionSnapshot(
  client: PoolClient,
  learnerId: string,
  attemptId: string,
  context: DiagnosticContextRow,
): Promise<void> {
  const existing = await client.query(
    "SELECT COUNT(*)::int AS count FROM diagnostic_attempt_questions WHERE attempt_id = $1",
    [attemptId],
  );
  if (number(existing.rows[0]?.count) > 0) return;

  if (context.context_type === "COURSE") {
    const scope = await client.query(
      `SELECT diagnostic_focus_skill_ids, assessment_program_id, diagnostic_force_probe
       FROM assessment_attempts WHERE id = $1 AND learner_id = $2`, [attemptId, learnerId],
    );
    const candidates = await loadCourseDiagnosticCandidates(client, learnerId, context, scope.rows[0]);
    const selection = initializeDiagnosticSelection(candidates);
    if (!selection.selected.length) {
      throw new AppError(409, "DIAGNOSTIC_QUESTION_BANK_EMPTY", "No active diagnostic questions are available for this course.");
    }
    for (const [index, selected] of selection.selected.entries()) {
      await client.query(
        `INSERT INTO diagnostic_attempt_questions (
           attempt_id, question_id, sequence, selection_reason, selection_stage, selection_score,
           selection_components
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
        [
          attemptId, selected.questionId, index + 1, selected.reason, selected.stage,
          selected.score, JSON.stringify(selected.components),
        ],
      );
    }
    await client.query(
      `UPDATE assessment_attempts
       SET question_count = $2, diagnostic_question_budget = $3, selection_policy_version = $4,
           diagnostic_template_question_count = $5,
           diagnostic_selected_skill_count = $6,
           diagnostic_recognized_skill_count = $7,
           diagnostic_skipped_skill_count = $8,
           diagnostic_min_question_count = $9,
           diagnostic_max_question_count = $10,
           diagnostic_stopping_reason = NULL,
           diagnostic_stopped_at = NULL
       WHERE id = $1`,
      [
        attemptId, selection.selected.length, selection.questionBudget,
        diagnosticSelectionPolicyVersion,
        selection.templateQuestionCount, selection.selectedSkillCount,
        selection.recognizedSkillCount, selection.skippedSkillCount,
        Math.min(diagnosticMinimumQuestions, selection.questionBudget),
        selection.questionBudget,
      ],
    );
    return;
  }

  const fixed = await client.query(
    `INSERT INTO diagnostic_attempt_questions (
       attempt_id, question_id, sequence, selection_reason
     )
     SELECT $1, aq.question_id, aq.sequence, 'Required by the selected learning goal'
     FROM assessment_questions aq
     JOIN questions q ON q.id = aq.question_id AND q.status = 'ACTIVE'
     WHERE aq.assessment_id = $2
     ORDER BY aq.sequence
     RETURNING question_id`,
    [attemptId, context.assessment_id],
  );
  const skillCount = await client.query(
    `SELECT COUNT(DISTINCT q.skill_id)::int AS count
     FROM assessment_questions aq JOIN questions q ON q.id = aq.question_id
     WHERE aq.assessment_id = $1 AND q.status = 'ACTIVE'`,
    [context.assessment_id],
  );
  await client.query(
    `UPDATE assessment_attempts
     SET question_count = $2, diagnostic_question_budget = $2,
         diagnostic_template_question_count = $4,
         diagnostic_selected_skill_count = $3,
         diagnostic_recognized_skill_count = 0,
         diagnostic_skipped_skill_count = 0,
         diagnostic_min_question_count = $2,
         diagnostic_max_question_count = $2
     WHERE id = $1`,
    [attemptId, fixed.rowCount ?? 0, number(skillCount.rows[0]?.count), fixed.rowCount ?? 0],
  );
}

async function appendAdaptiveQuestionIfReady(
  client: PoolClient,
  learnerId: string,
  attemptId: string,
): Promise<void> {
  const attemptResult = await client.query(
    `SELECT selection_policy_version, diagnostic_question_budget,
            diagnostic_max_question_count, diagnostic_focus_skill_ids,
            assessment_program_id, diagnostic_force_probe
     FROM assessment_attempts
     WHERE id = $1 AND learner_id = $2 AND status = 'IN_PROGRESS'`,
    [attemptId, learnerId],
  );
  const attempt = attemptResult.rows[0] as DatabaseRow | undefined;
  if (!attempt || attempt.selection_policy_version !== diagnosticSelectionPolicyVersion) return;

  const snapshotResult = await client.query(
    `SELECT snapshot.question_id, snapshot.sequence,
            (snapshot.question_snapshot->'skill'->>'id')::uuid AS skill_id,
            snapshot.question_snapshot->>'cognitiveLevel' AS cognitive_level,
            draft.is_unsure, draft.selected_option_id, draft.selected_option_ids, draft.numeric_answer
     FROM diagnostic_attempt_questions snapshot
     LEFT JOIN diagnostic_answer_drafts draft
       ON draft.attempt_id = snapshot.attempt_id AND draft.question_id = snapshot.question_id
     WHERE snapshot.attempt_id = $1
     ORDER BY snapshot.sequence`,
    [attemptId],
  );
  const rows = snapshotResult.rows as DatabaseRow[];
  const answeredRows = rows.filter((row) => row.is_unsure !== null && row.is_unsure !== undefined);
  if (answeredRows.length < rows.length) return;

  const context = await contextForAttempt(client, learnerId, attemptId);
  if (!context || context.context_type !== "COURSE") return;
  const candidates = await loadCourseDiagnosticCandidates(client, learnerId, context, attempt);
  const keys = await loadScoringQuestions(client, attemptId);
  const observations: DiagnosticSelectionObservation[] = answeredRows.map((row) => {
    const scored = scoreDiagnosticResponse(keys.get(String(row.question_id))!, responseFromDraft(row));
    return {
      cognitiveLevel: String(row.cognitive_level) as DiagnosticCognitiveLevel,
      isCorrect: scored.isCorrect, isUnsure: scored.isUnsure, misconceptionCode: scored.misconceptionCode,
      questionId: String(row.question_id), sequence: number(row.sequence), skillId: String(row.skill_id),
    };
  });
  const maximum = number(attempt.diagnostic_max_question_count ?? diagnosticMaximumQuestions);
  const stopping = evaluateDiagnosticStopping(candidates, observations, maximum);
  if (!stopping.shouldContinue) {
    await client.query(
      `UPDATE assessment_attempts
       SET diagnostic_question_budget = question_count,
           diagnostic_stopping_reason = $2,
           diagnostic_stopped_at = NOW()
       WHERE id = $1`,
      [attemptId, stopping.stoppingReason],
    );
    return;
  }
  await client.query(
    `UPDATE assessment_attempts
     SET diagnostic_question_budget = $2,
         diagnostic_stopping_reason = NULL,
         diagnostic_stopped_at = NULL
     WHERE id = $1`,
    [attemptId, maximum],
  );
  const next = selectNextDiagnosticQuestion(candidates, {
    observations,
    selectedQuestionIds: rows.map((row) => String(row.question_id)),
  }, rows.length + 1, maximum);
  if (!next) {
    await client.query(
      `UPDATE assessment_attempts
       SET diagnostic_question_budget = question_count,
           diagnostic_stopping_reason = 'BANK_EXHAUSTED',
           diagnostic_stopped_at = NOW()
       WHERE id = $1`,
      [attemptId],
    );
    return;
  }
  await client.query(
    `INSERT INTO diagnostic_attempt_questions (
       attempt_id, question_id, sequence, selection_reason, selection_stage, selection_score,
       selection_components
     ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [
      attemptId, next.questionId, rows.length + 1, next.reason, next.stage,
      next.score, JSON.stringify(next.components),
    ],
  );
  const selectedSkills = new Set([...rows.map((row) => String(row.skill_id)), next.skillId]);
  const candidateSkills = new Set(candidates.map((candidate) => candidate.skillId));
  await client.query(
    `UPDATE assessment_attempts
     SET question_count = $2,
         diagnostic_selected_skill_count = $3,
         diagnostic_skipped_skill_count = $4
     WHERE id = $1`,
    [attemptId, rows.length + 1, selectedSkills.size, Math.max(0, candidateSkills.size - selectedSkills.size)],
  );
}

async function contextForAttempt(
  client: PoolClient,
  learnerId: string,
  attemptId: string,
): Promise<DiagnosticContextRow | undefined> {
  const result = await client.query(
    `SELECT aa.assessment_id, aa.enrollment_id, aa.learner_goal_id,
            COALESCE(c.id, g.id) AS context_id,
            COALESCE(c.name, g.name) AS context_name,
            COALESCE(c.slug, g.slug) AS context_slug,
            CASE WHEN aa.enrollment_id IS NOT NULL THEN 'COURSE' ELSE 'GOAL' END AS context_type
     FROM assessment_attempts aa
     LEFT JOIN course_enrollments ce ON ce.id = aa.enrollment_id
     LEFT JOIN courses c ON c.id = ce.course_id
     LEFT JOIN learner_goals lg ON lg.id = aa.learner_goal_id
     LEFT JOIN learning_goals g ON g.id = lg.goal_id
     WHERE aa.id = $1 AND aa.learner_id = $2 AND aa.status = 'IN_PROGRESS'`,
    [attemptId, learnerId],
  );
  return result.rows[0] as DiagnosticContextRow | undefined;
}

async function loadAttempt(
  client: Pool | PoolClient,
  learnerId: string,
  attemptId: string,
): Promise<DiagnosticAttempt> {
  const attemptResult = await client.query(
    `SELECT aa.id, aa.status, aa.started_at, aa.enrollment_id, aa.question_count,
            aa.diagnostic_question_budget,
            aa.diagnostic_min_question_count, aa.diagnostic_max_question_count,
            aa.diagnostic_stopping_reason, aa.diagnostic_stopped_at,
            aa.selection_policy_version, aa.diagnostic_template_question_count,
            aa.diagnostic_selected_skill_count, aa.diagnostic_recognized_skill_count,
            aa.diagnostic_skipped_skill_count, aa.assessment_program_id,
            aa.assessment_program_session_id, aa.diagnostic_focus_skill_ids,
            aa.diagnostic_intent,
            a.title, a.description, a.estimated_minutes,
            COALESCE(c.id, g.id) AS context_id,
            COALESCE(c.name, g.name) AS context_name,
            COALESCE(c.slug, g.slug) AS context_slug,
            CASE WHEN aa.enrollment_id IS NOT NULL THEN 'COURSE' ELSE 'GOAL' END AS context_type
     FROM assessment_attempts aa
     JOIN assessments a ON a.id = aa.assessment_id
     LEFT JOIN course_enrollments ce ON ce.id = aa.enrollment_id
     LEFT JOIN courses c ON c.id = ce.course_id
     LEFT JOIN learner_goals lg ON lg.id = aa.learner_goal_id
     LEFT JOIN learning_goals g ON g.id = lg.goal_id
     WHERE aa.id = $1 AND aa.learner_id = $2`,
    [attemptId, learnerId],
  );
  const attempt = attemptResult.rows[0] as DatabaseRow | undefined;
  if (!attempt) throw new AppError(404, "DIAGNOSTIC_ATTEMPT_NOT_FOUND", "The diagnostic attempt does not exist.");
  if (attempt.status !== "IN_PROGRESS") {
    throw new AppError(409, "DIAGNOSTIC_ALREADY_SUBMITTED", "This diagnostic has already been submitted.");
  }

  const questionRows = await client.query(
    `SELECT q.id, q.prompt, q.difficulty, q.discrimination, q.cognitive_level, q.question_type, q.numeric_unit,
            snapshot.sequence, snapshot.selection_reason, snapshot.selection_stage,
            s.id AS skill_id, s.name AS skill_name, s.category AS skill_category,
            qo.id AS option_id, qo.option_key, qo.content AS option_content
     FROM diagnostic_attempt_questions snapshot
     CROSS JOIN LATERAL jsonb_to_record(snapshot.question_snapshot) AS raw(
       id uuid, prompt text, difficulty smallint, discrimination numeric,
       "cognitiveLevel" text, "questionType" text, "numericUnit" text,
       skill jsonb, options jsonb
     )
     CROSS JOIN LATERAL (SELECT raw.id, raw.prompt, raw.difficulty, raw.discrimination,
       raw."cognitiveLevel" AS cognitive_level, raw."questionType" AS question_type,
       raw."numericUnit" AS numeric_unit, raw.skill, raw.options) q
     CROSS JOIN LATERAL jsonb_to_record(q.skill) AS s(id uuid, name text, category text)
     LEFT JOIN LATERAL jsonb_to_recordset(q.options) AS option_raw(
       id uuid, key text, content text, "isCorrect" boolean, "misconceptionCode" text
     ) ON TRUE
     CROSS JOIN LATERAL (SELECT option_raw.id, option_raw.key AS option_key,
       option_raw.content) qo
     WHERE snapshot.attempt_id = $1
     ORDER BY snapshot.sequence, qo.option_key`,
    [attemptId],
  );
  const questionMap = new Map<string, DiagnosticQuestion>();
  for (const row of questionRows.rows as DatabaseRow[]) {
    const id = String(row.id);
    const existing = questionMap.get(id);
    if (existing && row.option_id) existing.options.push({
      content: String(row.option_content), id: String(row.option_id), key: String(row.option_key),
    });
    else if (!existing) questionMap.set(id, {
      questionType: String(row.question_type ?? "SINGLE_CHOICE") as DiagnosticQuestionType,
      numericUnit: row.numeric_unit ? String(row.numeric_unit) : null,
      cognitiveLevel: String(row.cognitive_level) as DiagnosticQuestion["cognitiveLevel"],
      difficulty: number(row.difficulty),
      discrimination: number(row.discrimination),
      id,
      options: row.option_id ? [{ content: String(row.option_content), id: String(row.option_id), key: String(row.option_key) }] : [],
      prompt: String(row.prompt),
      selectionReason: String(row.selection_reason),
      selectionStage: String(row.selection_stage) as DiagnosticQuestion["selectionStage"],
      sequence: number(row.sequence),
      skillCategory: String(row.skill_category),
      skillId: String(row.skill_id),
      skillName: String(row.skill_name),
    });
  }
  const draftRows = await client.query(
    `SELECT question_id, selected_option_id, selected_option_ids, numeric_answer, is_unsure, response_seconds, saved_at
     FROM diagnostic_answer_drafts
     WHERE attempt_id = $1
     ORDER BY saved_at`,
    [attemptId],
  );
  const context = mapContext(attempt);
  const questions = [...questionMap.values()];
  const personalized = attempt.selection_policy_version === diagnosticSelectionPolicyVersion;
  const questionBudget = number(attempt.diagnostic_question_budget ?? attempt.question_count);
  const currentStage = (questions.at(-1)?.selectionStage ?? "LEGACY") as DiagnosticAttempt["selection"]["currentStage"];
  const savedAnswers = (draftRows.rows as DatabaseRow[]).map((row) => ({
    isUnsure: Boolean(row.is_unsure),
    optionId: row.selected_option_id ? String(row.selected_option_id) : null,
    ...(Array.isArray(row.selected_option_ids) && row.selected_option_ids.length ? { selectedOptionIds: row.selected_option_ids.map(String) } : {}),
    ...(row.numeric_answer != null ? { numericAnswer: number(row.numeric_answer) } : {}),
    questionId: String(row.question_id),
    responseSeconds: number(row.response_seconds),
    savedAt: iso(row.saved_at),
  }));
  const canComplete = savedAnswers.length === questions.length
    && (!personalized || Boolean(attempt.diagnostic_stopped_at) || questions.length >= questionBudget);
  return {
    assessmentDescription: String(attempt.description),
    assessmentProgramId: attempt.assessment_program_id ? String(attempt.assessment_program_id) : null,
    assessmentProgramSessionId: attempt.assessment_program_session_id ? String(attempt.assessment_program_session_id) : null,
    focusSkillIds: (attempt.diagnostic_focus_skill_ids as string[] | null) ?? null,
    intent: String(attempt.diagnostic_intent ?? "PLACEMENT") as DiagnosticAttempt["intent"],
    assessmentTitle: String(attempt.title),
    context,
    estimatedMinutes: personalized
      ? Math.max(5, Math.ceil(questionBudget * 0.75))
      : number(attempt.estimated_minutes),
    goal: context.type === "GOAL" ? { id: context.id, name: context.name, slug: context.slug } : null,
    id: String(attempt.id),
    questions,
    savedAnswers,
    selection: {
      answeredCount: savedAnswers.length,
      canComplete,
      policyVersion: String(attempt.selection_policy_version),
      currentStage,
      maximumQuestionCount: number(attempt.diagnostic_max_question_count ?? questionBudget),
      minimumQuestionCount: number(attempt.diagnostic_min_question_count ?? questionBudget),
      questionBudget,
      recognizedSkillCount: number(attempt.diagnostic_recognized_skill_count ?? 0),
      selectedQuestionCount: questions.length,
      selectedSkillCount: number(attempt.diagnostic_selected_skill_count
        ?? new Set(questions.map((question) => question.skillId)).size),
      skippedSkillCount: number(attempt.diagnostic_skipped_skill_count ?? 0),
      stoppingReason: attempt.diagnostic_stopping_reason
        ? String(attempt.diagnostic_stopping_reason) : null,
      templateQuestionCount: number(attempt.diagnostic_template_question_count
        ?? attempt.question_count ?? questions.length),
    },
    startedAt: iso(attempt.started_at),
    status: "IN_PROGRESS",
  };
}

async function loadResult(
  client: Pool | PoolClient,
  learnerId: string,
  attemptId: string,
): Promise<DiagnosticResult> {
  const attemptResult = await client.query(
    `SELECT aa.id, aa.status, aa.question_count, aa.correct_count, aa.overall_score,
            aa.started_at, aa.submitted_at, aa.duration_seconds, aa.enrollment_id,
            aa.assessment_program_id, aa.assessment_program_session_id,
            aa.diagnostic_stopping_reason, aa.diagnostic_intent,
            a.title, COALESCE(c.name, g.name) AS context_name,
            CASE WHEN aa.enrollment_id IS NOT NULL THEN 'COURSE' ELSE 'GOAL' END AS context_type,
            g.name AS goal_name
     FROM assessment_attempts aa
     JOIN assessments a ON a.id = aa.assessment_id
     LEFT JOIN course_enrollments ce ON ce.id = aa.enrollment_id
     LEFT JOIN courses c ON c.id = ce.course_id
     LEFT JOIN learner_goals lg ON lg.id = aa.learner_goal_id
     LEFT JOIN learning_goals g ON g.id = lg.goal_id
     WHERE aa.id = $1 AND aa.learner_id = $2`,
    [attemptId, learnerId],
  );
  const attempt = attemptResult.rows[0] as DatabaseRow | undefined;
  if (!attempt) throw new AppError(404, "DIAGNOSTIC_ATTEMPT_NOT_FOUND", "The diagnostic attempt does not exist.");
  if (attempt.status !== "SUBMITTED") {
    throw new AppError(409, "DIAGNOSTIC_NOT_SUBMITTED", "Submit the diagnostic before viewing results.");
  }
  const [skillRows, answerRows, untestedRows] = await Promise.all([
    client.query(
      `SELECT asr.skill_id, s.name AS skill_name, s.category,
              asr.question_count, asr.correct_count, asr.score,
              asr.mastery_before, asr.mastery_after,
              asr.confidence_before, asr.confidence_after,
              asr.evidence_state_before, asr.evidence_state_after,
               asr.diagnostic_classification, asr.mastery_lower_bound,
               asr.mastery_upper_bound, asr.application_observation_count,
               asr.difficulty_coverage, asr.cognitive_coverage,
               asr.misconception_codes, asr.decision_reason,
               self_report.familiarity AS self_report_familiarity,
               self_report.verification_status AS self_report_verification
       FROM assessment_skill_results asr
       JOIN skills s ON s.id = asr.skill_id
       LEFT JOIN assessment_attempts report_attempt ON report_attempt.id = asr.attempt_id
       LEFT JOIN learner_skill_self_reports self_report
         ON self_report.enrollment_id = report_attempt.enrollment_id AND self_report.skill_id = asr.skill_id
       WHERE asr.attempt_id = $1
       ORDER BY s.category, s.name`,
      [attemptId],
    ),
    client.query(
      `SELECT q.id AS question_id, q.prompt, q.difficulty, q.cognitive_level, q.explanation,
               q.question_type, q.numeric_unit, q.numeric_answer AS correct_numeric_answer,
               snapshot.sequence, s.name AS skill_name, answer.is_correct, answer.is_unsure,
               answer.response_seconds, answer.evidence_strength, answer.misconception_code,
               answer.selected_option_ids, answer.numeric_answer,
              selected.id AS selected_option_id,
              COALESCE(selected.content, multi.content) AS selected_option_content,
              CASE WHEN q.question_type = 'SINGLE_CHOICE' THEN correct.ids[1] ELSE NULL END AS correct_option_id,
              correct.content AS correct_option_content
       FROM assessment_answers answer
       JOIN diagnostic_attempt_questions snapshot
         ON snapshot.attempt_id = answer.attempt_id AND snapshot.question_id = answer.question_id
       CROSS JOIN LATERAL jsonb_to_record(snapshot.question_snapshot) AS raw(
         id uuid, prompt text, difficulty smallint, explanation text,
         "cognitiveLevel" text, "questionType" text, "numericUnit" text,
         "numericAnswer" double precision, skill jsonb, options jsonb
       )
       CROSS JOIN LATERAL (SELECT raw.id, raw.prompt, raw.difficulty, raw.explanation,
         raw."cognitiveLevel" AS cognitive_level, raw."questionType" AS question_type,
         raw."numericUnit" AS numeric_unit, raw."numericAnswer" AS numeric_answer,
         raw.skill, raw.options) q
       CROSS JOIN LATERAL jsonb_to_record(q.skill) AS s(id uuid, name text, category text)
       LEFT JOIN LATERAL (
         SELECT option.id, option.content
         FROM jsonb_to_recordset(q.options) AS option(
           id uuid, key text, content text, "isCorrect" boolean, "misconceptionCode" text
         ) WHERE option.id = answer.selected_option_id
       ) selected ON TRUE
       LEFT JOIN LATERAL (
         SELECT ARRAY_AGG(option.id ORDER BY option.key) AS ids,
                STRING_AGG(option.content, '; ' ORDER BY option.key) AS content
         FROM jsonb_to_recordset(q.options) AS option(
           id uuid, key text, content text, "isCorrect" boolean, "misconceptionCode" text
         ) WHERE option."isCorrect"
       ) correct ON TRUE
       LEFT JOIN LATERAL (
         SELECT STRING_AGG(option.content, '; ' ORDER BY option.key) AS content
         FROM jsonb_to_recordset(q.options) AS option(
           id uuid, key text, content text, "isCorrect" boolean, "misconceptionCode" text
         ) WHERE option.id = ANY(answer.selected_option_ids)
       ) multi ON TRUE
       WHERE answer.attempt_id = $1
       ORDER BY snapshot.sequence`,
      [attemptId],
    ),
    client.query(
      `WITH context_skills AS (
         SELECT course_skill.skill_id
         FROM assessment_attempts diagnostic_attempt
         JOIN course_enrollments enrollment ON enrollment.id = diagnostic_attempt.enrollment_id
         JOIN course_skills course_skill ON course_skill.course_id = enrollment.course_id
         WHERE diagnostic_attempt.id = $1
         UNION
         SELECT goal_skill.skill_id
         FROM assessment_attempts diagnostic_attempt
         JOIN learner_goals learner_goal ON learner_goal.id = diagnostic_attempt.learner_goal_id
         JOIN goal_skills goal_skill ON goal_skill.goal_id = learner_goal.goal_id
         WHERE diagnostic_attempt.id = $1
       )
       SELECT skill.id AS skill_id, skill.name AS skill_name, skill.category,
              mastery.mastery, mastery.confidence,
              COALESCE(mastery.evidence_state, 'UNKNOWN') AS evidence_state,
              COALESCE(mastery.retention_state, 'UNKNOWN') AS retention_state
       FROM context_skills context_skill
       JOIN skills skill ON skill.id = context_skill.skill_id
       LEFT JOIN learner_skill_mastery mastery
         ON mastery.learner_id = $2 AND mastery.skill_id = context_skill.skill_id
       WHERE NOT EXISTS (
         SELECT 1 FROM assessment_skill_results result
         WHERE result.attempt_id = $1 AND result.skill_id = context_skill.skill_id
       )
       ORDER BY skill.category, skill.name`,
      [attemptId, learnerId],
    ),
  ]);
  const skillResults: DiagnosticSkillResult[] = skillRows.rows.map((row: DatabaseRow) => {
    const masteryAfter = number(row.mastery_after);
    const difficultyCoverage = (row.difficulty_coverage ?? {}) as Record<string, unknown>;
    const cognitiveCoverage = (row.cognitive_coverage ?? {}) as Record<string, unknown>;
    return {
      applicationObservationCount: number(row.application_observation_count ?? 0),
      category: String(row.category),
      classification: String(row.diagnostic_classification) as DiagnosticClassification,
      cognitiveCoverage: {
        analyze: Boolean(cognitiveCoverage.analyze),
        apply: Boolean(cognitiveCoverage.apply),
        remember: Boolean(cognitiveCoverage.remember),
        understand: Boolean(cognitiveCoverage.understand),
      },
      confidenceAfter: number(row.confidence_after),
      confidenceBefore: nullableNumber(row.confidence_before),
      correctCount: number(row.correct_count),
      decisionReason: String(row.decision_reason ?? "This estimate is based on the stored diagnostic evidence."),
      difficultyCoverage: {
        easy: Boolean(difficultyCoverage.easy),
        hard: Boolean(difficultyCoverage.hard),
        medium: Boolean(difficultyCoverage.medium),
      },
      evidenceStateAfter: row.evidence_state_after as DiagnosticSkillResult["evidenceStateAfter"],
      evidenceStateBefore: row.evidence_state_before as DiagnosticSkillResult["evidenceStateBefore"],
      masteryAfter,
      masteryBefore: nullableNumber(row.mastery_before),
      masteryLowerBound: nullableNumber(row.mastery_lower_bound) ?? masteryAfter,
      masteryUpperBound: nullableNumber(row.mastery_upper_bound) ?? masteryAfter,
      misconceptions: Array.isArray(row.misconception_codes)
        ? row.misconception_codes.map(String) : [],
      questionCount: number(row.question_count),
      score: number(row.score),
      selfReportFamiliarity: (row.self_report_familiarity ?? null) as DiagnosticSkillResult["selfReportFamiliarity"],
      selfReportVerification: (row.self_report_verification ?? null) as DiagnosticSkillResult["selfReportVerification"],
      skillId: String(row.skill_id),
      skillName: String(row.skill_name),
    };
  });
  const answers: DiagnosticAnswerResult[] = answerRows.rows.map((row: DatabaseRow) => ({
    questionType: String(row.question_type ?? "SINGLE_CHOICE") as DiagnosticQuestionType,
    selectedOptionIds: Array.isArray(row.selected_option_ids) ? row.selected_option_ids.map(String) : [],
    numericAnswer: nullableNumber(row.numeric_answer),
    cognitiveLevel: String(row.cognitive_level) as DiagnosticAnswerResult["cognitiveLevel"],
    correctOptionContent: row.question_type === "NUMERIC"
      ? `${number(row.correct_numeric_answer)}${row.numeric_unit ? ` ${String(row.numeric_unit)}` : ""}`
      : String(row.correct_option_content),
    correctOptionId: row.correct_option_id ? String(row.correct_option_id) : null,
    difficulty: number(row.difficulty),
    evidenceStrength: number(row.evidence_strength ?? 0),
    explanation: String(row.explanation),
    isCorrect: Boolean(row.is_correct),
    isUnsure: Boolean(row.is_unsure),
    misconceptionCode: row.misconception_code ? String(row.misconception_code) : null,
    prompt: String(row.prompt),
    questionId: String(row.question_id),
    responseSeconds: number(row.response_seconds ?? 0),
    selectedOptionContent: row.is_unsure ? "I’m not sure" : row.question_type === "NUMERIC"
      ? `${number(row.numeric_answer)}${row.numeric_unit ? ` ${String(row.numeric_unit)}` : ""}`
      : String(row.selected_option_content),
    selectedOptionId: row.selected_option_id ? String(row.selected_option_id) : null,
    sequence: number(row.sequence),
    skillName: String(row.skill_name),
  }));
  const untestedSkills: DiagnosticUntestedSkill[] = untestedRows.rows.map((row: DatabaseRow) => {
    const mastery = nullableNumber(row.mastery);
    const confidence = nullableNumber(row.confidence);
    const retentionState = String(row.retention_state) as DiagnosticUntestedSkill["retentionState"];
    const recognizedFromPassport = mastery !== null && mastery >= 0.7
      && (confidence ?? 0) >= 0.65
      && retentionState !== "AT_RISK" && retentionState !== "CRITICAL";
    return {
      category: String(row.category),
      confidence,
      evidenceState: String(row.evidence_state) as DiagnosticUntestedSkill["evidenceState"],
      mastery,
      reason: recognizedFromPassport
        ? "Recognized from strong, retained evidence in your global Skill Passport."
        : "Not sampled within this diagnostic's fixed evidence budget; no mastery was invented.",
      recognizedFromPassport,
      retentionState,
      skillId: String(row.skill_id),
      skillName: String(row.skill_name),
    };
  });
  const mastered = skillResults.filter((skill) => skill.classification === "MASTERED").length;
  const ready = skillResults.filter((skill) => skill.classification === "READY").length;
  const gaps = skillResults.filter((skill) => skill.classification === "GAP" || skill.classification === "FORGOTTEN").length;
  const sufficientEvidence = mastered + ready + gaps;
  const partiallyAssessed = skillResults.length - sufficientEvidence;
  return {
    answers,
    attempt: {
      assessmentProgramId: attempt.assessment_program_id ? String(attempt.assessment_program_id) : null,
      assessmentProgramSessionId: attempt.assessment_program_session_id ? String(attempt.assessment_program_session_id) : null,
      intent: String(attempt.diagnostic_intent ?? "PLACEMENT") as DiagnosticResult["attempt"]["intent"],
      contextName: String(attempt.context_name),
      contextType: attempt.context_type as "COURSE" | "GOAL",
      correctCount: number(attempt.correct_count),
      durationSeconds: nullableNumber(attempt.duration_seconds),
      enrollmentId: attempt.enrollment_id ? String(attempt.enrollment_id) : null,
      goalName: attempt.goal_name ? String(attempt.goal_name) : null,
      id: String(attempt.id),
      overallScore: number(attempt.overall_score),
      questionCount: number(attempt.question_count),
      startedAt: iso(attempt.started_at),
      submittedAt: iso(attempt.submitted_at),
      title: String(attempt.title),
    },
    skillResults,
    untestedSkills,
    summary: {
      courseSkillCount: skillResults.length + untestedSkills.length,
      questionsAnswered: answers.length,
      sufficientEvidence,
      partiallyAssessed,
      notTested: untestedSkills.filter((skill) => !skill.recognizedFromPassport).length,
      mastered,
      ready,
      gaps,
      needsConfirmation: skillResults.filter((skill) =>
        skill.classification === "NEEDS_CONFIRMATION" || skill.classification === "PROBED"
          || skill.classification === "FRAGILE_FOUNDATION").length,
      knowledgeBoundaryFound: skillResults.length > 0,
      pathReady: sufficientEvidence > 0 || skillResults.length > 0,
      stopReason: String(attempt.diagnostic_stopping_reason ?? "SUBMITTED_COMPLETE"),
    },
  };
}

export function createDiagnosticService(pool: Pool): DiagnosticServiceContract {
  return {
    async getOverview(learnerId, input = {}): Promise<DiagnosticOverview> {
      const context = await resolveContext(pool, learnerId, input);
      if (!context) return {
        activeGoal: null, assessment: null, context: null,
        inProgressAttempt: null, latestAttempt: null,
      };
      const attempts = await pool.query(
        `SELECT id, status, question_count, correct_count, overall_score, started_at, submitted_at
         FROM assessment_attempts
         WHERE learner_id = $1 AND assessment_id = $2
         ORDER BY started_at DESC`,
        [learnerId, context.assessment_id],
      );
      const inProgress = (attempts.rows as DatabaseRow[]).find((row) => row.status === "IN_PROGRESS");
      const latest = (attempts.rows as DatabaseRow[]).find((row) => row.status === "SUBMITTED");
      const mapped = mapContext(context);
      return {
        activeGoal: mapped.type === "GOAL" ? { id: mapped.id, name: mapped.name, slug: mapped.slug } : null,
        assessment: {
          description: String(context.description),
          estimatedMinutes: number(context.estimated_minutes),
          id: String(context.assessment_id),
          questionCount: number(context.question_count),
          skillCount: number(context.skill_count),
          title: String(context.title),
        },
        context: mapped,
        inProgressAttempt: mapAttemptSummary(inProgress),
        latestAttempt: mapAttemptSummary(latest),
      };
    },

    async start(learnerId, input) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const context = await resolveContext(client, learnerId, input);
        if (!context) throw new AppError(
          409,
          "DIAGNOSTIC_CONTEXT_REQUIRED",
          "Enroll in a course or select an optional learning goal with an available diagnostic.",
        );
        // Serialize starts for this learner/assessment, including legacy entry points.
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
          `diagnostic:${learnerId}:${context.assessment_id}`,
        ]);
        const existing = await client.query(
          `SELECT id, assessment_program_session_id FROM assessment_attempts
           WHERE learner_id = $1 AND assessment_id = $2 AND status = 'IN_PROGRESS'`,
          [learnerId, context.assessment_id],
        );
        if (existing.rows[0] && input.assessmentProgramSessionId
          && existing.rows[0].assessment_program_session_id !== input.assessmentProgramSessionId) {
          throw new AppError(409, "DIAGNOSTIC_IN_PROGRESS", "Finish your saved knowledge check before starting another session.", {
            attemptId: String(existing.rows[0].id),
          });
        }
        const attemptId = existing.rows[0]?.id ? String(existing.rows[0].id) : randomUUID();
        if (!existing.rows[0]) {
          await client.query(
            `INSERT INTO assessment_attempts (
               id, assessment_id, learner_id, learner_goal_id, enrollment_id, question_count,
               diagnostic_focus_skill_ids, assessment_program_id, assessment_program_session_id,
               diagnostic_force_probe, diagnostic_intent
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [
              attemptId, context.assessment_id, learnerId,
              context.learner_goal_id, context.enrollment_id, context.question_count,
              input.focusSkillIds ?? null, input.assessmentProgramId ?? null,
              input.assessmentProgramSessionId ?? null, input.forceProbe ?? false,
              input.intent ?? (input.assessmentProgramId ? "COURSE_COVERAGE" : "PLACEMENT"),
            ],
          );
          await client.query(
            `INSERT INTO learner_skill_mastery (id, learner_id, skill_id)
             SELECT gen_random_uuid(), $1, q.skill_id
             FROM assessment_questions aq
             JOIN questions q ON q.id = aq.question_id
             WHERE aq.assessment_id = $2
             ON CONFLICT (learner_id, skill_id) DO NOTHING`,
            [learnerId, context.assessment_id],
          );
        }
        await ensureAttemptQuestionSnapshot(client, learnerId, attemptId, context);
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

    async getAttempt(learnerId, attemptId) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const context = await contextForAttempt(client, learnerId, attemptId);
        if (context) await ensureAttemptQuestionSnapshot(client, learnerId, attemptId, context);
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

    async saveDraft(learnerId, attemptId, input) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const attempt = await client.query(
          `SELECT aa.id, aa.selection_policy_version
           FROM assessment_attempts aa
           JOIN diagnostic_attempt_questions snapshot ON snapshot.attempt_id = aa.id
             AND snapshot.question_id = $3
           WHERE aa.id = $1 AND aa.learner_id = $2 AND aa.status = 'IN_PROGRESS'
           FOR UPDATE OF aa`,
          [attemptId, learnerId, input.questionId],
        );
        if (!attempt.rows[0]) {
          throw new AppError(404, "DIAGNOSTIC_QUESTION_NOT_FOUND", "This question is not part of an active diagnostic.");
        }
        const keys = await loadScoringQuestions(client, attemptId);
        const key = keys.get(input.questionId);
        if (!key) throw new AppError(404, "DIAGNOSTIC_QUESTION_NOT_FOUND", "This question is not part of this diagnostic.");
        const scored = scoreDiagnosticResponse(key, input);
        const saved = await client.query(
          `INSERT INTO diagnostic_answer_drafts (
             attempt_id, question_id, selected_option_id, is_unsure, response_seconds, selected_option_ids, numeric_answer
           ) VALUES ($1, $2, $3, $4, $5, $6::uuid[], $7)
           ON CONFLICT (attempt_id, question_id) DO UPDATE
           SET selected_option_id = EXCLUDED.selected_option_id,
               is_unsure = EXCLUDED.is_unsure,
               response_seconds = EXCLUDED.response_seconds,
               selected_option_ids = EXCLUDED.selected_option_ids,
               numeric_answer = EXCLUDED.numeric_answer,
               saved_at = NOW()
           RETURNING selected_option_id, selected_option_ids, numeric_answer, is_unsure, response_seconds, saved_at`,
          [attemptId, input.questionId, scored.optionId, scored.isUnsure, input.responseSeconds, scored.selectedOptionIds, scored.numericAnswer],
        );
        await appendAdaptiveQuestionIfReady(client, learnerId, attemptId);
        const counts = await client.query(
          `SELECT COALESCE(aa.diagnostic_question_budget, aa.question_count)::int AS question_count,
                  COUNT(draft.question_id)::int AS answered_count
           FROM assessment_attempts aa
           LEFT JOIN diagnostic_answer_drafts draft ON draft.attempt_id = aa.id
           WHERE aa.id = $1
           GROUP BY aa.diagnostic_question_budget, aa.question_count`,
          [attemptId],
        );
        const row = saved.rows[0] as DatabaseRow;
        const refreshedAttempt = attempt.rows[0]?.selection_policy_version === diagnosticSelectionPolicyVersion
          ? await loadAttempt(client, learnerId, attemptId)
          : undefined;
        const result = {
          answeredCount: number(counts.rows[0]?.answered_count),
          attempt: refreshedAttempt,
          questionCount: number(counts.rows[0]?.question_count),
          savedAnswer: {
            isUnsure: Boolean(row.is_unsure),
            optionId: row.selected_option_id ? String(row.selected_option_id) : null,
            ...(Array.isArray(row.selected_option_ids) && row.selected_option_ids.length ? { selectedOptionIds: row.selected_option_ids.map(String) } : {}),
            ...(row.numeric_answer != null ? { numericAnswer: number(row.numeric_answer) } : {}),
            questionId: input.questionId,
            responseSeconds: number(row.response_seconds),
            savedAt: iso(row.saved_at),
          },
        };
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async submit(learnerId, attemptId, input) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const attemptResult = await client.query(
          `SELECT id, assessment_id, status, question_count, enrollment_id, diagnostic_intent,
                  selection_policy_version, diagnostic_question_budget
           FROM assessment_attempts WHERE id = $1 AND learner_id = $2 FOR UPDATE`,
          [attemptId, learnerId],
        );
        const attempt = attemptResult.rows[0] as DatabaseRow | undefined;
        if (!attempt) throw new AppError(404, "DIAGNOSTIC_ATTEMPT_NOT_FOUND", "The diagnostic attempt does not exist.");
        if (attempt.status !== "IN_PROGRESS") {
          throw new AppError(409, "DIAGNOSTIC_ALREADY_SUBMITTED", "This diagnostic has already been submitted.");
        }
        if (
          attempt.selection_policy_version === diagnosticSelectionPolicyVersion
          && number(attempt.question_count) < number(attempt.diagnostic_question_budget)
        ) {
          throw new AppError(
            400,
            "INCOMPLETE_ADAPTIVE_DIAGNOSTIC",
            "Complete the bounded adaptive question sequence before submitting.",
          );
        }
        const questionMap = await loadScoringQuestions(client, attemptId);
        if (input.answers.length !== questionMap.size) {
          throw new AppError(400, "INCOMPLETE_DIAGNOSTIC", "Answer every diagnostic question before submitting.");
        }
        const submittedQuestions = new Set(input.answers.map((answer) => answer.questionId));
        if (submittedQuestions.size !== input.answers.length || submittedQuestions.size !== questionMap.size) {
          throw new AppError(400, "INVALID_DIAGNOSTIC_ANSWERS", "Each diagnostic question must be answered exactly once.");
        }
        const evaluated: Array<{
          answerId: string;
          cognitiveLevel: DiagnosticCognitiveLevel;
          difficulty: number;
          discrimination: number;
          evidenceStrength: number;
          guessProbability: number;
          isCorrect: boolean;
          isUnsure: boolean;
          misconceptionCode: string | null;
          optionId: string | null;
          selectedOptionIds: string[];
          numericAnswer: number | null;
          questionId: string;
          responseSeconds: number;
          skillId: string;
        }> = [];
        for (const answer of input.answers) {
          const question = questionMap.get(answer.questionId);
          if (!question) {
            throw new AppError(400, "INVALID_DIAGNOSTIC_ANSWERS", "An answer does not belong to this diagnostic.");
          }
          const scored = scoreDiagnosticResponse(question, answer);
          const measurement: DiagnosticMeasurement = {
            cognitiveLevel: question.cognitiveLevel,
            difficulty: question.difficulty,
            discrimination: question.discrimination,
            guessProbability: question.guessProbability,
            isCorrect: scored.isCorrect,
            isUnsure: scored.isUnsure,
          };
          evaluated.push({
            answerId: randomUUID(),
            cognitiveLevel: question.cognitiveLevel,
            difficulty: question.difficulty,
            discrimination: question.discrimination,
            evidenceStrength: calculateEvidenceStrength(measurement),
            guessProbability: question.guessProbability,
            isCorrect: measurement.isCorrect,
            isUnsure: scored.isUnsure,
            misconceptionCode: scored.misconceptionCode,
            optionId: scored.optionId, selectedOptionIds: scored.selectedOptionIds, numericAnswer: scored.numericAnswer,
            questionId: answer.questionId,
            responseSeconds: Math.max(0, Math.min(3600, answer.responseSeconds ?? 0)),
            skillId: question.skillId,
          });
        }
        for (const answer of evaluated) {
          await client.query(
            `INSERT INTO assessment_answers (
               id, attempt_id, question_id, selected_option_id, is_correct, is_unsure,
               response_seconds, evidence_strength, misconception_code, selected_option_ids, numeric_answer
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::uuid[], $11)`,
            [
              answer.answerId, attemptId, answer.questionId, answer.optionId,
              answer.isCorrect, answer.isUnsure, answer.responseSeconds,
              answer.evidenceStrength, answer.misconceptionCode,
              answer.selectedOptionIds, answer.numericAnswer,
            ],
          );
        }
        const bySkill = new Map<string, typeof evaluated>();
        for (const answer of evaluated) {
          const group = bySkill.get(answer.skillId) ?? [];
          group.push(answer);
          bySkill.set(answer.skillId, group);
        }
        const adaptive = attempt.selection_policy_version === diagnosticSelectionPolicyVersion;
        for (const [skillId, answers] of bySkill) {
          const observations: DiagnosticObservation[] = answers.map((answer) => ({
            difficulty: answer.difficulty, isCorrect: answer.isCorrect,
          }));
          const measurements: DiagnosticMeasurement[] = answers.map((answer) => ({
            cognitiveLevel: answer.cognitiveLevel,
            difficulty: answer.difficulty,
            discrimination: answer.discrimination,
            guessProbability: answer.guessProbability,
            isCorrect: answer.isCorrect,
            isUnsure: answer.isUnsure,
          }));
          const score = adaptive
            ? calculateDiagnosticPerformance(measurements)
            : calculateDiagnosticScore(observations);
          const reliability = adaptive ? calculateDiagnosticReliability(measurements) : 1;
          const correctCount = answers.filter((answer) => answer.isCorrect).length;
          const update = await recordSkillEvidence(client, {
            learnerId,
            observations: answers.map((answer, index) => ({
              attemptNumber: index + 1,
              correct: answer.isCorrect,
              difficulty: answer.difficulty,
              evidenceStrength: answer.evidenceStrength,
              metadata: {
                isUnsure: answer.isUnsure,
                cognitiveLevel: answer.cognitiveLevel,
                discrimination: answer.discrimination,
                evidenceStrength: answer.evidenceStrength,
                misconceptionCode: answer.misconceptionCode,
                questionId: answer.questionId,
                responseSeconds: answer.responseSeconds,
              },
              score: adaptive
                ? calculateDiagnosticPerformance([{
                  cognitiveLevel: answer.cognitiveLevel,
                  difficulty: answer.difficulty,
                  discrimination: answer.discrimination,
                  guessProbability: answer.guessProbability,
                  isCorrect: answer.isCorrect,
                  isUnsure: answer.isUnsure,
                }])
                : answer.isCorrect ? 1 : 0,
              timeTakenSeconds: answer.responseSeconds,
            })),
            performanceScore: score,
            reliability,
            skillId,
            sourceId: attemptId,
            sourceType: "DIAGNOSTIC",
          });
          const classification: DiagnosticClassification = adaptive
            ? classifyDiagnosticSkill({
              confidence: update.confidenceAfter,
              mastery: update.masteryAfter,
              measurements,
              previousMastery: update.masteryBefore,
              retentionState: update.retentionStateBefore,
              targetMastery: 0.7,
            })
            : update.masteryAfter >= 0.7 ? "READY"
              : update.masteryAfter < 0.45 ? "GAP" : "NEEDS_CONFIRMATION";
          if (attempt.enrollment_id) {
            await client.query(
              `UPDATE learner_skill_self_reports
               SET verification_status = CASE
                     WHEN $4 IN ('NEEDS_CONFIRMATION', 'PROBED', 'FRAGILE_FOUNDATION') THEN 'UNVERIFIED'
                     WHEN familiarity IN ('COMFORTABLE', 'VERY_COMFORTABLE') AND $4 IN ('MASTERED', 'READY') THEN 'CONFIRMED'
                     WHEN familiarity = 'NEVER_LEARNED' AND $4 IN ('GAP', 'FORGOTTEN') THEN 'CONFIRMED'
                     WHEN familiarity = 'KNOW_A_LITTLE' AND $4 IN ('READY', 'GAP') THEN 'CONFIRMED'
                     WHEN familiarity = 'UNSURE' THEN 'UNVERIFIED'
                     ELSE 'NOT_CONFIRMED'
                   END,
                   updated_at = NOW()
               WHERE enrollment_id = $1 AND skill_id = $2
                 AND EXISTS (SELECT 1 FROM course_enrollments enrollment
                   WHERE enrollment.id = $1 AND enrollment.learner_id = $3)`,
              [attempt.enrollment_id, skillId, learnerId, classification],
            );
          }
          if (attempt.enrollment_id && (attempt.diagnostic_intent === "KNOWLEDGE_CHECK" || attempt.diagnostic_intent === "CHALLENGE")) {
            const resolved = classification === "MASTERED" || classification === "READY"
              || classification === "GAP" || classification === "FORGOTTEN";
            await client.query(
              `UPDATE learner_assessment_backlog
               SET status = $4, reason = CASE WHEN $4 = 'RESOLVED' THEN 'SUFFICIENT_EVIDENCE' ELSE reason END,
                   last_evaluated_at = NOW(), updated_at = NOW()
               WHERE enrollment_id = $1 AND skill_id = $2 AND learner_id = $3`,
              [attempt.enrollment_id, skillId, learnerId, resolved ? "RESOLVED" : "PENDING"],
            );
          }
          const interval = masteryInterval(update.masteryAfter, update.confidenceAfter, measurements.length);
          const applicationObservationCount = measurements.filter((measurement) =>
            measurement.cognitiveLevel === "APPLY" || measurement.cognitiveLevel === "ANALYZE").length;
          const difficultyCoverage = {
            easy: measurements.some((measurement) => measurement.difficulty <= 2),
            hard: measurements.some((measurement) => measurement.difficulty >= 4),
            medium: measurements.some((measurement) => measurement.difficulty === 3),
          };
          const cognitiveCoverage = {
            analyze: measurements.some((measurement) => measurement.cognitiveLevel === "ANALYZE"),
            apply: measurements.some((measurement) => measurement.cognitiveLevel === "APPLY"),
            remember: measurements.some((measurement) => measurement.cognitiveLevel === "REMEMBER"),
            understand: measurements.some((measurement) => measurement.cognitiveLevel === "UNDERSTAND"),
          };
          const misconceptionCodes = [...new Set(answers
            .map((answer) => answer.misconceptionCode)
            .filter((code): code is string => Boolean(code)))];
          const decisionReason = diagnosticDecisionReason({ classification, measurements });
          await client.query(
            `UPDATE assessment_answers
             SET mastery_before = $2, mastery_after = $3,
                 confidence_before = $4, confidence_after = $5
             WHERE attempt_id = $1 AND question_id = ANY($6::uuid[])`,
            [
              attemptId, update.masteryBefore, update.masteryAfter,
              update.confidenceBefore, update.confidenceAfter,
              answers.map((answer) => answer.questionId),
            ],
          );
          for (const answer of answers.filter((item) => item.misconceptionCode)) {
            const misconceptionConfidence = Math.min(0.95, 0.45 + answer.evidenceStrength * 0.4);
            await client.query(
              `INSERT INTO misconception_evidence (
                 id, learner_id, skill_id, attempt_id, answer_id, question_id,
                 misconception_code, evidence_strength, confidence
               ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
               ON CONFLICT (answer_id, misconception_code) DO NOTHING`,
              [
                randomUUID(), learnerId, skillId, attemptId, answer.answerId,
                answer.questionId, answer.misconceptionCode,
                answer.evidenceStrength, misconceptionConfidence,
              ],
            );
            await client.query(
              `INSERT INTO learner_skill_misconceptions (
                 learner_id, skill_id, misconception_code, occurrence_count, confidence
               ) VALUES ($1, $2, $3, 1, $4)
               ON CONFLICT (learner_id, skill_id, misconception_code) DO UPDATE
               SET occurrence_count = learner_skill_misconceptions.occurrence_count + 1,
                   confidence = LEAST(0.9500,
                     1 - (1 - learner_skill_misconceptions.confidence) * (1 - EXCLUDED.confidence * 0.45)),
                   last_seen_at = NOW()`,
              [learnerId, skillId, answer.misconceptionCode, misconceptionConfidence],
            );
          }
          await client.query(
            `INSERT INTO assessment_skill_results (
               id, attempt_id, skill_id, question_count, correct_count, score,
               mastery_before, mastery_after, confidence_before, confidence_after,
               evidence_state_before, evidence_state_after,
               diagnostic_classification, mastery_lower_bound, mastery_upper_bound,
               direct_observation_count, application_observation_count,
               difficulty_coverage, cognitive_coverage, misconception_codes, decision_reason
             ) VALUES (
               $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
               $13, $14, $15, $16, $17, $18::jsonb, $19::jsonb, $20, $21
             )`,
            [
              randomUUID(), attemptId, skillId, answers.length, correctCount, score,
              update.masteryBefore, update.masteryAfter, update.confidenceBefore,
              update.confidenceAfter, update.evidenceStateBefore, update.evidenceStateAfter,
              classification, interval.lowerBound, interval.upperBound,
              measurements.length, applicationObservationCount,
              JSON.stringify(difficultyCoverage), JSON.stringify(cognitiveCoverage),
              misconceptionCodes, decisionReason,
            ],
          );
        }
        if (adaptive) {
          await client.query(
            `UPDATE assessment_skill_results advanced
             SET diagnostic_classification = 'FRAGILE_FOUNDATION',
                 decision_reason = 'Advanced performance was observed, but a required prerequisite has repeated negative or forgotten evidence.'
             FROM skill_prerequisites edge
             JOIN assessment_skill_results prerequisite
               ON prerequisite.attempt_id = $1
              AND prerequisite.skill_id = edge.prerequisite_skill_id
             WHERE advanced.attempt_id = $1
               AND advanced.skill_id = edge.skill_id
               AND edge.relationship_type = 'REQUIRED'
               AND advanced.score >= 0.7000
               AND prerequisite.diagnostic_classification IN ('GAP', 'FORGOTTEN')`,
            [attemptId],
          );
        }
        const correctCount = evaluated.filter((answer) => answer.isCorrect).length;
        const overallScore = correctCount / evaluated.length;
        await client.query(
          `UPDATE assessment_attempts
           SET status = 'SUBMITTED', correct_count = $3::smallint,
               overall_score = $4, duration_seconds = $5, submitted_at = NOW()
           WHERE id = $1 AND learner_id = $2`,
          [attemptId, learnerId, correctCount, overallScore, input.durationSeconds ?? null],
        );
        await client.query("DELETE FROM diagnostic_answer_drafts WHERE attempt_id = $1", [attemptId]);
        await client.query(
          `INSERT INTO learner_activity_events (
             id, learner_id, event_type, duration_seconds, result, metadata
           ) VALUES ($1, $2, 'ASSESSMENT_SUBMITTED', $3, $4::jsonb, $5::jsonb)`,
          [
            randomUUID(), learnerId, input.durationSeconds ?? 0,
            JSON.stringify({ correctCount, overallScore, questionCount: evaluated.length }),
            JSON.stringify({ assessmentId: attempt.assessment_id, attemptId, source: "diagnostic" }),
          ],
        );
        const result = await loadResult(client, learnerId, attemptId);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async getResult(learnerId, attemptId) {
      return loadResult(pool, learnerId, attemptId);
    },
  };
}
