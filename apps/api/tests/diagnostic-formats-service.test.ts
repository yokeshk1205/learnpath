import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import { createDiagnosticService } from "../src/diagnostics/service.js";

type Row = Record<string, unknown>;
const timestamp = "2026-09-09T00:00:00.000Z";

function harness() {
  const drafts = new Map<string, Row>();
  const base = { difficulty: 3, discrimination: 1, guess_probability: 0.25, cognitive_level: "APPLY", skill_id: "skill", skill_name: "Quantities", skill_category: "Mathematics", prompt: "Authored question", selection_reason: "Coverage", selection_stage: "LEGACY" };
  const rows = [
    { ...base, id: "single", question_id: "single", sequence: 1, question_type: "SINGLE_CHOICE", numeric_answer: null, numeric_tolerance: null, numeric_unit: null, option_id: "a", is_correct: true, option_key: "A", option_content: "First" },
    { ...base, id: "single", question_id: "single", sequence: 1, question_type: "SINGLE_CHOICE", numeric_answer: null, numeric_tolerance: null, numeric_unit: null, option_id: "b", is_correct: false, option_key: "B", option_content: "Second" },
    { ...base, id: "multi", question_id: "multi", sequence: 2, question_type: "MULTI_SELECT", numeric_answer: null, numeric_tolerance: null, numeric_unit: null, option_id: "m1", is_correct: true, option_key: "A", option_content: "One" },
    { ...base, id: "multi", question_id: "multi", sequence: 2, question_type: "MULTI_SELECT", numeric_answer: null, numeric_tolerance: null, numeric_unit: null, option_id: "m2", is_correct: true, option_key: "B", option_content: "Two" },
    { ...base, id: "multi", question_id: "multi", sequence: 2, question_type: "MULTI_SELECT", numeric_answer: null, numeric_tolerance: null, numeric_unit: null, option_id: "m3", is_correct: false, option_key: "C", option_content: "Three" },
    { ...base, id: "numeric", question_id: "numeric", sequence: 3, question_type: "NUMERIC", numeric_answer: 41, numeric_tolerance: 0.01, numeric_unit: "m", option_id: null },
  ];
  const attempt = { id: "attempt", status: "IN_PROGRESS", question_count: 3, diagnostic_question_budget: 3, selection_policy_version: "diagnostic-fixed-v1", started_at: timestamp, enrollment_id: "enrollment", title: "Quantities", description: "Independent responses", estimated_minutes: 8, context_id: "course", context_name: "General studies", context_slug: "general-studies", context_type: "COURSE" };
  const query = vi.fn(async (sql: string, values: unknown[] = []): Promise<{ rows: Row[] }> => {
    const text = sql.replace(/\s+/g, " ").trim();
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(text)) return { rows: [] };
    if (text.startsWith("SELECT aa.assessment_id")) return { rows: values[1] === "learner" ? [attempt] : [] };
    if (text.startsWith("SELECT COUNT(*)::int AS count FROM diagnostic_attempt_questions")) return { rows: [{ count: 3 }] };
    if (text.startsWith("SELECT aa.id, aa.status, aa.started_at")) return { rows: values[1] === "learner" ? [attempt] : [] };
    if (text.startsWith("SELECT q.id, q.prompt")) return { rows };
    if (text.startsWith("SELECT question_id, selected_option_id")) return { rows: [...drafts.values()] };
    if (text.startsWith("SELECT aa.id, aa.selection_policy_version")) return { rows: values[1] === "learner" && rows.some((row) => row.id === values[2]) ? [attempt] : [] };
    if (text.startsWith("SELECT q.id AS question_id")) return { rows };
    if (text.startsWith("INSERT INTO diagnostic_answer_drafts")) {
      const saved = { question_id: values[1], selected_option_id: values[2], is_unsure: values[3], response_seconds: values[4], selected_option_ids: values[5], numeric_answer: values[6], saved_at: timestamp };
      drafts.set(String(values[1]), saved);
      return { rows: [saved] };
    }
    if (text.startsWith("SELECT selection_policy_version")) return { rows: [attempt] };
    if (text.startsWith("SELECT COALESCE(aa.diagnostic_question_budget")) return { rows: [{ question_count: 3, answered_count: drafts.size }] };
    if (text.startsWith("SELECT id, assessment_id, status")) return { rows: values[1] === "learner" ? [attempt] : [] };
    throw new Error(`Unexpected query: ${text}`);
  });
  const pool = { query, connect: async () => ({ query, release: vi.fn() }) } as unknown as Pool;
  return { service: createDiagnosticService(pool), query, drafts };
}

describe("diagnostic format service boundary", () => {
  it("renders numeric questions without options and never exposes numeric keys, tolerance, or option correctness", async () => {
    const state = harness();
    const attempt = await state.service.getAttempt("learner", "attempt");
    expect(attempt.questions).toHaveLength(3);
    expect(attempt.questions[2]).toMatchObject({ questionType: "NUMERIC", numericUnit: "m", options: [] });
    for (const question of attempt.questions) {
      expect(question).not.toHaveProperty("numericAnswer");
      expect(question).not.toHaveProperty("numericTolerance");
      expect(question).not.toHaveProperty("numeric_answer");
      expect(question).not.toHaveProperty("numeric_tolerance");
      for (const option of question.options) expect(option).not.toHaveProperty("isCorrect");
    }
    const publicQuestionRead = state.query.mock.calls.find(([sql]) => sql.replace(/\s+/g, " ").trim().startsWith("SELECT q.id, q.prompt"))?.[0];
    expect(publicQuestionRead).toContain("jsonb_to_record(snapshot.question_snapshot)");
    expect(publicQuestionRead).not.toMatch(/JOIN questions q/);
  });

  it("saves and restores single, multi, numeric zero, and unsure answers without incompatible optional fields", async () => {
    const state = harness();
    await state.service.saveDraft!("learner", "attempt", { questionId: "single", optionId: "a", isUnsure: false, responseSeconds: 3 });
    await state.service.saveDraft!("learner", "attempt", { questionId: "multi", optionId: null, selectedOptionIds: ["m2", "m1"], isUnsure: false, responseSeconds: 7 });
    const numeric = await state.service.saveDraft!("learner", "attempt", { questionId: "numeric", optionId: null, numericAnswer: 0, isUnsure: false, responseSeconds: 4 });
    expect(numeric.savedAnswer).toMatchObject({ numericAnswer: 0 });
    expect(numeric.savedAnswer).not.toHaveProperty("selectedOptionIds");
    expect(numeric).not.toHaveProperty("isCorrect");
    const resumed = await state.service.getAttempt("learner", "attempt");
    expect(resumed.savedAnswers[0]).toMatchObject({ questionId: "single", optionId: "a" });
    expect(resumed.savedAnswers[0]).not.toHaveProperty("numericAnswer");
    expect(resumed.savedAnswers[0]).not.toHaveProperty("selectedOptionIds");
    expect(resumed.savedAnswers[1]).toMatchObject({ selectedOptionIds: ["m1", "m2"] });
    expect(resumed.savedAnswers[2]).toMatchObject({ numericAnswer: 0 });
    const unsure = await state.service.saveDraft!("learner", "attempt", { questionId: "numeric", optionId: null, isUnsure: true, responseSeconds: 4 });
    expect(unsure.savedAnswer).toMatchObject({ isUnsure: true, optionId: null });
    expect(unsure.savedAnswer).not.toHaveProperty("numericAnswer");
    expect(unsure.savedAnswer).not.toHaveProperty("selectedOptionIds");
    const scoringRead = state.query.mock.calls.find(([sql]) => sql.replace(/\s+/g, " ").trim().startsWith("SELECT q.id AS question_id"))?.[0];
    expect(scoringRead).toContain("jsonb_to_record(snapshot.question_snapshot)");
    expect(scoringRead).not.toMatch(/JOIN questions q/);
  });

  it("checks active-attempt ownership and question scope before saving any format", async () => {
    const state = harness();
    await expect(state.service.saveDraft!("other-learner", "attempt", { questionId: "numeric", optionId: null, numericAnswer: 0, isUnsure: false, responseSeconds: 4 }))
      .rejects.toMatchObject({ code: "DIAGNOSTIC_QUESTION_NOT_FOUND" });
    await expect(state.service.saveDraft!("learner", "attempt", { questionId: "outside-attempt", optionId: null, numericAnswer: 0, isUnsure: false, responseSeconds: 4 }))
      .rejects.toMatchObject({ code: "DIAGNOSTIC_QUESTION_NOT_FOUND" });
    expect(state.drafts.size).toBe(0);
  });

  it("rejects format mismatches and foreign options before recording draft or submitted evidence", async () => {
    const state = harness();
    await expect(state.service.saveDraft!("learner", "attempt", { questionId: "numeric", optionId: "a", isUnsure: false, responseSeconds: 4 }))
      .rejects.toMatchObject({ code: "INVALID_DIAGNOSTIC_ANSWER" });
    await expect(state.service.saveDraft!("learner", "attempt", { questionId: "multi", optionId: null, selectedOptionIds: ["a"], isUnsure: false, responseSeconds: 4 }))
      .rejects.toMatchObject({ code: "INVALID_DIAGNOSTIC_ANSWER" });
    await expect(state.service.submit("learner", "attempt", { answers: [
      { questionId: "single", optionId: "a" }, { questionId: "multi", selectedOptionIds: ["m1", "m1"] }, { questionId: "numeric", numericAnswer: 41 },
    ] })).rejects.toMatchObject({ code: "INVALID_DIAGNOSTIC_ANSWER" });
    expect(state.drafts.size).toBe(0);
    expect(state.query.mock.calls.some(([sql]) => sql.includes("INSERT INTO assessment_answers"))).toBe(false);
  });
});
