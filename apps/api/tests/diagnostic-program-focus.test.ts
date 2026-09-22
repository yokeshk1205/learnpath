import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import { createDiagnosticService } from "../src/diagnostics/service.js";
import {
  diagnosticSelectionPolicyVersion,
  initializeDiagnosticSelection,
  type DiagnosticQuestionCandidate,
} from "../src/diagnostics/selection.js";
import { evaluateDiagnosticStopping } from "../src/diagnostics/stopping.js";

type Row = Record<string, unknown>;
const learnerId = "learner";
const attemptId = "attempt";
const programId = "program";
const sessionId = "session";
const focusSkillIds = ["focus-skill"];

function candidate(overrides: Partial<DiagnosticQuestionCandidate> = {}): DiagnosticQuestionCandidate {
  return {
    cognitiveLevel: "APPLY", confidence: 0.95, contextSequence: 1, dependentCount: 2,
    difficulty: 3, discrimination: 1, exposureCount: 0, guessProbability: 0.25,
    mastery: 0.95, misconceptionEvidenceCount: 0, misconceptionMapped: false,
    questionId: "fresh-question", retentionState: "STRONG", skillId: "focus-skill",
    skillName: "Focus skill", targetMastery: 0.7, ...overrides,
  };
}

function fixture(options: { existing?: boolean; legacy?: boolean; snapshotCount?: number } = {}) {
  const context: Row = {
    assessment_id: "assessment", context_id: "course", context_name: "Course",
    context_slug: "course", context_type: "COURSE", enrollment_id: "enrollment",
    learner_goal_id: null, question_count: 30,
  };
  const attempt: Row = {
    ...context, id: attemptId, status: "IN_PROGRESS", started_at: "2026-09-01T00:00:00Z",
    title: "Course check", description: "Check understanding", estimated_minutes: 10,
    selection_policy_version: options.legacy ? "diagnostic-fixed-v1" : diagnosticSelectionPolicyVersion,
    diagnostic_question_budget: 3, diagnostic_min_question_count: 3, diagnostic_max_question_count: 3,
    diagnostic_focus_skill_ids: options.legacy ? null : focusSkillIds,
    assessment_program_id: options.legacy ? null : programId,
    assessment_program_session_id: options.legacy ? null : sessionId,
    diagnostic_force_probe: !options.legacy,
  };
  const snapshots: Row[] = options.snapshotCount === 0 ? [] : [{
    question_id: "fresh-question-1", sequence: 1, selection_stage: options.legacy ? "LEGACY" : "COVERAGE",
    selection_reason: "Saved selection", skill_id: "focus-skill", cognitive_level: "APPLY",
  }];
  const drafts: Row[] = [];
  const bank = [1, 2, 3].map((index) => ({
    question_id: `fresh-question-${index}`, skill_id: "focus-skill", skill_name: "Focus skill",
    cognitive_level: "APPLY", confidence: 0.95, mastery: 0.95, retention_state: "STRONG",
    context_sequence: 1, dependent_count: 2, difficulty: 3, discrimination: 1,
    exposure_count: 0, guess_probability: 0.25, target_mastery: 0.7,
    misconception_evidence_count: 0, misconception_mapped: false,
  }));
  const query = vi.fn(async (raw: string, values: unknown[] = []) => {
    const sql = raw.replace(/\s+/g, " ").trim();
    let rows: Row[] = [];
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql) || sql.includes("pg_advisory_xact_lock")) {
      rows = [];
    } else if (sql.startsWith("SELECT ce.id AS enrollment_id") || sql.startsWith("SELECT aa.assessment_id")) {
      rows = [context];
    } else if (sql.startsWith("SELECT id, assessment_program_session_id")) {
      rows = options.existing === false ? [] : [attempt];
    } else if (sql.startsWith("SELECT COUNT(*)::int AS count FROM diagnostic_attempt_questions")) {
      rows = [{ count: snapshots.length }];
    } else if (sql.startsWith("SELECT diagnostic_focus_skill_ids") || sql.startsWith("SELECT selection_policy_version")) {
      rows = [attempt];
    } else if (sql.startsWith("SELECT q.id AS question_id") && sql.includes("FROM diagnostic_attempt_questions snapshot")) {
      rows = snapshots.map((snapshot) => ({
        ...bank.find((question) => question.question_id === snapshot.question_id),
        question_type: "SINGLE_CHOICE", option_id: `${snapshot.question_id}-option`, is_correct: true,
      }));
    } else if (sql.startsWith("SELECT q.id AS question_id")) {
      // The database returns only fresh questions in the persisted focus. The
      // tests below separately assert the SQL predicates and bound parameters.
      rows = bank;
    } else if (sql.startsWith("INSERT INTO assessment_attempts")) {
      attempt.id = values[0];
      attempt.diagnostic_focus_skill_ids = values[6];
      attempt.assessment_program_id = values[7];
      attempt.assessment_program_session_id = values[8];
      attempt.diagnostic_force_probe = values[9];
    } else if (sql.startsWith("INSERT INTO learner_skill_mastery")) {
      rows = [];
    } else if (sql.startsWith("INSERT INTO diagnostic_attempt_questions")) {
      snapshots.push({
        question_id: values[1], sequence: values[2], selection_reason: values[3],
        selection_stage: values[4], skill_id: "focus-skill", cognitive_level: "APPLY",
      });
    } else if (sql.startsWith("UPDATE assessment_attempts")) {
      if (sql.includes("diagnostic_recognized_skill_count = $7")) {
        attempt.diagnostic_recognized_skill_count = values[6];
      }
    } else if (sql.startsWith("SELECT aa.id, aa.status")) {
      rows = [attempt];
    } else if (sql.startsWith("SELECT q.id, q.prompt")) {
      rows = snapshots.map((snapshot) => ({
        ...snapshot, id: snapshot.question_id, prompt: "Apply the skill", difficulty: 3,
        discrimination: 1, skill_name: "Focus skill", skill_category: "FOUNDATION",
        option_id: `${snapshot.question_id}-option`, option_key: "A", option_content: "Answer",
      }));
    } else if (sql.startsWith("SELECT question_id, selected_option_id")) {
      rows = drafts;
    } else if (sql.startsWith("SELECT aa.id, aa.selection_policy_version")) {
      rows = [attempt];
    } else if (sql.startsWith("INSERT INTO diagnostic_answer_drafts")) {
      const draft = {
        question_id: values[1], selected_option_id: values[2], is_unsure: values[3],
        response_seconds: values[4], saved_at: "2026-09-01T00:00:20Z",
      };
      drafts.push(draft);
      rows = [draft];
    } else if (sql.startsWith("SELECT snapshot.question_id")) {
      rows = snapshots.map((snapshot) => ({
        ...snapshot, is_unsure: drafts.find((draft) => draft.question_id === snapshot.question_id)?.is_unsure ?? null,
        is_correct: false,
      }));
    } else if (sql.startsWith("SELECT COALESCE(aa.diagnostic_question_budget")) {
      rows = [{ answered_count: drafts.length, question_count: attempt.diagnostic_question_budget }];
    } else {
      throw new Error(`Unexpected database query: ${sql}`);
    }
    return { rows, rowCount: rows.length };
  });
  const release = vi.fn();
  const pool = { connect: vi.fn(async () => ({ query, release })), query } as unknown as Pool;
  return { attempt, drafts, query, release, service: createDiagnosticService(pool), snapshots };
}

function expectPersistedCandidateScope(query: ReturnType<typeof fixture>["query"]) {
  const calls = query.mock.calls.filter(([sql]) => sql.includes("SELECT q.id AS question_id")
    && sql.includes("FROM assessment_questions aq"));
  expect(calls).toHaveLength(1);
  const [sql, parameters] = calls[0]!;
  expect(parameters).toEqual([learnerId, "assessment", "course", focusSkillIds, programId, "enrollment"]);
  expect(sql).toMatch(/q\.skill_id = ANY\(\$4::uuid\[\]\)/);
  expect(sql).toMatch(/\$5::uuid IS NULL OR NOT EXISTS/);
  expect(sql).toMatch(/prior\.learner_id = \$1 AND prior\.assessment_program_id = \$5/);
  expect(sql).toMatch(/prior\.status = 'SUBMITTED' AND used\.question_id = q\.id/);
}

describe("assessment-program diagnostic scope and resume", () => {
  it("persists program controls when starting and selects only within that database scope", async () => {
    const state = fixture({ existing: false, snapshotCount: 0 });
    const attempt = await state.service.start(learnerId, {
      enrollmentId: "enrollment", focusSkillIds, assessmentProgramId: programId,
      assessmentProgramSessionId: sessionId, forceProbe: true,
    });

    expect(attempt).toMatchObject({ assessmentProgramId: programId, assessmentProgramSessionId: sessionId, focusSkillIds });
    expect(attempt.questions).toHaveLength(1);
    expect(attempt.questions[0]?.skillId).toBe("focus-skill");
    expect(attempt.selection.recognizedSkillCount).toBe(0);
    expectPersistedCandidateScope(state.query);
    expect(state.query.mock.calls.find(([sql]) => sql.includes("INSERT INTO assessment_attempts"))?.[1]?.slice(6))
      .toEqual([focusSkillIds, programId, sessionId, true, "COURSE_COVERAGE"]);
  });

  it("restores focus and force-probe from storage when resuming a reserved attempt without a question", async () => {
    const state = fixture({ snapshotCount: 0 });
    const attempt = await state.service.getAttempt(learnerId, attemptId);

    expectPersistedCandidateScope(state.query);
    expect(attempt.focusSkillIds).toEqual(focusSkillIds);
    expect(attempt.selection.recognizedSkillCount).toBe(0);
    expect(attempt.questions[0]?.selectionReason).not.toMatch(/reusable knowledge/i);
  });

  it("keeps persisted focus and prior-program exclusions when appending after a saved answer", async () => {
    const state = fixture();
    const result = await state.service.saveDraft!(learnerId, attemptId, {
      questionId: "fresh-question-1", optionId: null, isUnsure: true, responseSeconds: 20,
    });

    expectPersistedCandidateScope(state.query);
    expect(result.attempt?.questions.map((question) => question.id)).toEqual(["fresh-question-1", "fresh-question-2"]);
    expect(result.attempt?.questions.every((question) => question.skillId === "focus-skill")).toBe(true);
    expect(result.attempt?.savedAnswers[0]).toMatchObject({ questionId: "fresh-question-1", isUnsure: true });
    expect(result.attempt?.assessmentProgramId).toBe(programId);
  });

  it("resumes existing legacy snapshots without attaching them to a program or regenerating questions", async () => {
    const state = fixture({ legacy: true });
    const original = structuredClone(state.attempt);
    const attempt = await state.service.start(learnerId, { enrollmentId: "enrollment" });

    expect(state.attempt).toEqual(original);
    expect(attempt).toMatchObject({ assessmentProgramId: null, focusSkillIds: null });
    expect(attempt.selection.policyVersion).toBe("diagnostic-fixed-v1");
    expect(attempt.questions[0]?.selectionReason).toBe("Saved selection");
    expect(state.query.mock.calls.some(([sql]) => /(?:INSERT INTO|UPDATE) assessment_attempts/.test(sql))).toBe(false);
    expect(state.query.mock.calls.some(([sql]) => sql.includes("SELECT q.id AS question_id"))).toBe(false);
  });

  it("rejects program attachment to an existing legacy attempt and preserves its state", async () => {
    const state = fixture({ legacy: true });
    const original = structuredClone(state.attempt);
    await expect(state.service.start(learnerId, {
      enrollmentId: "enrollment", focusSkillIds, assessmentProgramId: programId,
      assessmentProgramSessionId: sessionId, forceProbe: true,
    })).rejects.toMatchObject({ code: "DIAGNOSTIC_IN_PROGRESS" });

    expect(state.attempt).toEqual(original);
    expect(state.query.mock.calls.some(([sql]) => /^(?:INSERT|UPDATE|DELETE)/.test(sql.trim()))).toBe(false);
    expect(state.query).toHaveBeenCalledWith("ROLLBACK");
    expect(state.release).toHaveBeenCalledOnce();
  });
});

describe("fresh program evidence for recognized skills", () => {
  it("does not count a forced probe as recognized passport reuse", () => {
    expect(initializeDiagnosticSelection([candidate()]).recognizedSkillCount).toBe(1);
    const fresh = initializeDiagnosticSelection([candidate({ forceProbe: true })]);
    expect(fresh.recognizedSkillCount).toBe(0);
    expect(fresh.selected[0]?.reason).not.toMatch(/reusable knowledge/i);
  });

  it("does not resolve a forced prerequisite check solely from previously recognized mastery", () => {
    const bank = Array.from({ length: 8 }, (_, skillIndex) => Array.from({ length: 3 }, (_, itemIndex) => candidate({
      questionId: `q-${skillIndex}-${itemIndex}`, skillId: `skill-${skillIndex}`,
      dependentCount: skillIndex === 0 ? 2 : 0,
    }))).flat();
    const observations = Array.from({ length: 12 }, (_, index) => ({
      cognitiveLevel: "APPLY" as const, isCorrect: true, isUnsure: false,
      questionId: `observed-${index}`, sequence: index + 1, skillId: `skill-${index < 8 ? index : index - 7}`,
    }));
    expect(evaluateDiagnosticStopping(bank, observations)).toMatchObject({
      shouldContinue: false, stoppingReason: "EVIDENCE_SUFFICIENT",
    });
    expect(evaluateDiagnosticStopping(bank.map((question) => ({ ...question, forceProbe: true })), observations)).toMatchObject({
      shouldContinue: true, stoppingReason: "CRITICAL_GATEWAY_UNRESOLVED", unresolvedGatewayCount: 1,
    });
  });
});
