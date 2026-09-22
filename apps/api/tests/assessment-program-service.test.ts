import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import { createAssessmentProgramService } from "../src/assessment-programs/service.js";
import type { DiagnosticAttempt, DiagnosticServiceContract } from "../src/diagnostics/types.js";

type Row = Record<string, unknown>;
const learnerId = "learner-a";
const enrollmentId = "enrollment-a";
const programId = "program-a";
const timestamp = "2026-09-09T00:00:00.000Z";

function skill(overrides: Row = {}): Row {
  return {
    skill_id: "source-analysis", skill_name: "Source analysis", category: "History", module_id: "module-a",
    module_name: "Sources", module_sequence: 1, sequence: 1, mastery: null, confidence: null,
    evidence_state: "UNKNOWN", retention_state: "UNKNOWN", diagnostic_classification: null, last_evidence_at: null,
    evidence_count: 0, distinct_question_count: 0, correct_question_count: 0, application_question_count: 0, difficulty_band_count: 0,
    question_count: 5, available_question_count: 5, bank_application_question_count: 2, bank_difficulty_band_count: 2,
    dependent_count: 0, session_count: 0, ...overrides,
  };
}

function attempt(id: string): DiagnosticAttempt {
  return {
    id, context: { id: "course-a", enrollmentId, name: "World history", slug: "world-history", type: "COURSE" },
    assessmentDescription: "Coverage session", assessmentTitle: "World history assessment", estimatedMinutes: 10,
    goal: null, questions: [], savedAnswers: [], startedAt: timestamp, status: "IN_PROGRESS",
    selection: { answeredCount: 0, canComplete: false, currentStage: "COVERAGE", maximumQuestionCount: 5,
      minimumQuestionCount: 5, policyVersion: "evidence-driven-adaptive-v5", questionBudget: 5,
      recognizedSkillCount: 0, selectedQuestionCount: 1, selectedSkillCount: 1, skippedSkillCount: 0,
      stoppingReason: null, templateQuestionCount: 5 },
  };
}

function harness(options: { skills?: Row[]; mode?: string; noProgram?: boolean; noEnrollment?: boolean } = {}) {
  const programs: Row[] = options.noProgram ? [] : [{
    id: programId, learner_id: learnerId, enrollment_id: enrollmentId, mode: options.mode ?? "COMPREHENSIVE",
    status: "IN_PROGRESS", created_at: timestamp, updated_at: timestamp, completed_at: null,
  }];
  const sessions: Row[] = [];
  const attempts: Row[] = [];
  const skills = options.skills ?? [skill()];
  const query = vi.fn(async (sql: string, values: unknown[] = []): Promise<{ rows: Row[] }> => {
    const text = sql.replace(/\s+/g, " ").trim();
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(text) || text.startsWith("SELECT pg_advisory")) return { rows: [] };
    if (text.startsWith("SELECT ce.id AS enrollment_id")) return { rows: !options.noEnrollment && values[0] === enrollmentId && values[1] === learnerId
      ? [{ enrollment_id: enrollmentId, course_id: "course-a", name: "World history", slug: "world-history" }] : [] };
    if (text.startsWith("SELECT program.*")) return { rows: programs.filter((row) => row.id === values[0] && row.learner_id === values[1]) };
    if (text.startsWith("SELECT * FROM assessment_programs")) return { rows: programs.filter((row) =>
      row.learner_id === values[0] && row.enrollment_id === values[1] && (values[2] == null || row.mode === values[2])).slice(-1) };
    if (text.startsWith("WITH direct_questions")) return { rows: skills };
    if (text.startsWith("SELECT submitted_at FROM learner_course_self_reports")) return { rows: [] };
    if (text.startsWith("SELECT module_id, familiarity, confidence")) return { rows: [] };
    if (text.startsWith("SELECT skill_id, familiarity, confidence, experience_source")) return { rows: [] };
    if (text.startsWith("INSERT INTO learner_assessment_backlog")) return { rows: [] };
    if (text.startsWith("SELECT skill.id FROM course_skills")) return { rows: [{ id: values[1] }] };
    if (text.startsWith("UPDATE learner_assessment_backlog SET status = 'IN_PROGRESS'")) return { rows: [] };
    if (text.startsWith("SELECT session.id, session.sequence")) return { rows: sessions.filter((row) => row.program_id === values[0]).map((row) => {
      const attached = attempts.find((item) => item.id === row.attempt_id || item.assessment_program_session_id === row.id);
      return { ...row, attempt_id: attached?.id ?? null, status: attached?.status ?? null, submitted_at: attached?.submitted_at ?? null, question_count: attached?.question_count ?? 0 };
    }) };
    if (text.startsWith("INSERT INTO assessment_programs")) {
      const row = { id: values[0], learner_id: values[1], enrollment_id: values[2], mode: values[3], status: "IN_PROGRESS", created_at: timestamp, updated_at: timestamp, completed_at: null };
      programs.push(row);
      return { rows: [row] };
    }
    if (text.startsWith("UPDATE assessment_programs SET status = $2")) {
      const row = programs.find((item) => item.id === values[0])!;
      row.status = values[1]; row.completed_at = values[2];
      return { rows: [] };
    }
    if (text.startsWith("UPDATE assessment_programs SET status = 'IN_PROGRESS'")) return { rows: [] };
    if (text.startsWith("SELECT attempt.id FROM assessment_attempts")) return { rows: attempts.filter((row) => row.status === "IN_PROGRESS") };
    if (text.startsWith("INSERT INTO assessment_program_sessions")) {
      const row = { id: values[0], program_id: values[1], sequence: values[2], focus_skill_ids: values[3], module_id: values[4], attempt_id: null, created_at: timestamp };
      sessions.push(row);
      return { rows: [{ created_at: timestamp }] };
    }
    if (text.startsWith("UPDATE assessment_program_sessions SET attempt_id")) {
      const row = sessions.find((item) => item.id === values[0] && item.program_id === values[2] && (item.attempt_id == null || item.attempt_id === values[1]));
      if (!row) return { rows: [] };
      row.attempt_id = values[1];
      return { rows: [{ id: row.id }] };
    }
    throw new Error(`Unexpected query: ${text}`);
  });
  const release = vi.fn();
  const pool = { query, connect: vi.fn(async () => ({ query, release })) } as unknown as Pool;
  const diagnostic: DiagnosticServiceContract = {
    getAttempt: vi.fn(async (_learner, id) => attempt(id)), getOverview: vi.fn(), getResult: vi.fn(), submit: vi.fn(),
    start: vi.fn(async (_learner, input) => {
      const id = `attempt-${attempts.length + 1}`;
      attempts.push({ id, assessment_program_session_id: input.assessmentProgramSessionId, status: "IN_PROGRESS", question_count: 1 });
      return attempt(id);
    }),
  };
  return { service: createAssessmentProgramService(pool, diagnostic), programs, sessions, attempts, diagnostic, query, release, skills };
}

describe("assessment program service", () => {
  it("completes comprehensive coverage using cumulative consistent diagnostics without claiming mastery", async () => {
    const state = harness({ skills: [skill({
      evidence_count: 3, distinct_question_count: 3, correct_question_count: 3, application_question_count: 1,
      difficulty_band_count: 2, confidence: 0.45, mastery: 0.84, evidence_state: "ESTIMATED",
      diagnostic_classification: "NEEDS_CONFIRMATION",
    })] });
    const overview = await state.service.getProgram(learnerId, programId);
    expect(overview.program?.status).toBe("COMPLETED");
    expect(overview.coverage).toMatchObject({ assessed: 1, mastered: 0, needsConfirmation: 0 });
    expect(overview.nextSession).toBeNull();
    expect(overview.skills[0]).not.toHaveProperty("correctQuestionCount");
  });
  it("checks enrollment ownership before returning any coverage", async () => {
    const state = harness();
    await expect(state.service.getOverview("other-learner", { enrollmentId })).rejects.toMatchObject({ statusCode: 404, code: "ENROLLMENT_NOT_FOUND" });
    expect(state.query).toHaveBeenCalledTimes(1);
  });

  it("checks program ownership before reading or mutating its sessions", async () => {
    const state = harness();
    await expect(state.service.getProgram("other-learner", programId)).rejects.toMatchObject({ code: "ASSESSMENT_PROGRAM_NOT_FOUND" });
    await expect(state.service.startSession("other-learner", programId)).rejects.toMatchObject({ code: "ASSESSMENT_PROGRAM_NOT_FOUND" });
    expect(state.sessions).toHaveLength(0);
    expect(state.diagnostic.start).not.toHaveBeenCalled();
    expect(state.release).toHaveBeenCalledTimes(1);
  });

  it("creates and resumes the same comprehensive program without inventing learner evidence", async () => {
    const state = harness({ noProgram: true });
    const first = await state.service.create(learnerId, { enrollmentId, mode: "COMPREHENSIVE" });
    const resumed = await state.service.create(learnerId, { enrollmentId, mode: "COMPREHENSIVE" });
    expect(resumed.program?.id).toBe(first.program?.id);
    expect(state.programs).toHaveLength(1);
    expect(resumed.coverage).toMatchObject({ unassessed: 1, assessed: 0, mastered: 0 });
    expect(state.diagnostic.start).not.toHaveBeenCalled();
  });

  it("reserves a bounded session, invokes the existing diagnostic engine, and resumes its persisted attempt", async () => {
    const state = harness();
    const first = await state.service.startSession(learnerId, programId);
    const resumed = await state.service.startSession(learnerId, programId);
    expect(state.sessions).toHaveLength(1);
    expect(first.session.status).toBe("IN_PROGRESS");
    expect(resumed.attempt.id).toBe(first.attempt.id);
    expect(state.diagnostic.start).toHaveBeenCalledExactlyOnceWith(learnerId, {
      enrollmentId, focusSkillIds: ["source-analysis"], assessmentProgramId: programId,
      assessmentProgramSessionId: first.session.id, forceProbe: true, intent: "COURSE_COVERAGE",
    });
    expect(state.diagnostic.getAttempt).toHaveBeenCalledWith(learnerId, first.attempt.id);
  });

  it("runs a just-in-time check through the existing diagnostic evidence engine", async () => {
    const state = harness();
    const focused = await state.service.startFocusedCheck!(learnerId, {
      enrollmentId, skillId: "source-analysis", intent: "KNOWLEDGE_CHECK",
    });
    expect(focused.id).toBe("attempt-1");
    expect(state.diagnostic.start).toHaveBeenCalledWith(learnerId, {
      enrollmentId, focusSkillIds: ["source-analysis"], forceProbe: true, intent: "KNOWLEDGE_CHECK",
    });
  });

  it("recovers the durable planned session after a diagnostic request fails", async () => {
    const state = harness();
    vi.mocked(state.diagnostic.start).mockRejectedValueOnce(new Error("Transient connection failure"));
    await expect(state.service.startSession(learnerId, programId)).rejects.toThrow("Transient connection failure");
    const reservedId = state.sessions[0]!.id;
    expect(state.sessions).toHaveLength(1);
    expect(state.sessions[0]!.attempt_id).toBeNull();
    const recovered = await state.service.startSession(learnerId, programId);
    expect(state.sessions).toHaveLength(1);
    expect(recovered.session.id).toBe(reservedId);
    expect(recovered.session.status).toBe("IN_PROGRESS");
  });

  it("recovers an attempt committed before the session attachment reply was lost", async () => {
    const state = harness();
    state.sessions.push({ id: "reserved", program_id: programId, sequence: 1, focus_skill_ids: ["source-analysis"], module_id: "module-a", attempt_id: null, created_at: timestamp });
    state.attempts.push({ id: "committed-attempt", assessment_program_session_id: "reserved", status: "IN_PROGRESS", question_count: 1 });
    const recovered = await state.service.startSession(learnerId, programId);
    expect(recovered.attempt.id).toBe("committed-attempt");
    expect(state.sessions[0]!.attempt_id).toBe("committed-attempt");
    expect(state.diagnostic.start).not.toHaveBeenCalled();
  });

  it("keeps a submitted quick placement complete while whole-course skills remain unassessed", async () => {
    const state = harness({ mode: "QUICK_PLACEMENT" });
    state.sessions.push({ id: "quick", program_id: programId, sequence: 1, focus_skill_ids: ["source-analysis"], module_id: "module-a", attempt_id: "done", created_at: timestamp });
    state.attempts.push({ id: "done", assessment_program_session_id: "quick", status: "SUBMITTED", submitted_at: timestamp, question_count: 4 });
    const overview = await state.service.getProgram(learnerId, programId);
    expect(overview.program).toMatchObject({ status: "COMPLETED", completedSessionCount: 1 });
    expect(overview.coverage).toMatchObject({ assessed: 0, unassessed: 1, mastered: 0 });
    expect(overview.nextSession).toBeNull();
    await expect(state.service.startSession(learnerId, programId)).rejects.toMatchObject({ code: "ASSESSMENT_PROGRAM_COMPLETE" });
  });

  it("does not declare comprehensive completion when even one course skill lacks a bank", async () => {
    const state = harness({ skills: [skill({ question_count: 0, available_question_count: 0 })] });
    const overview = await state.service.getProgram(learnerId, programId);
    expect(overview.program?.status).toBe("BLOCKED");
    expect(overview.coverage).toMatchObject({ unassessed: 1, blocked: 1, assessed: 0 });
    await expect(state.service.startSession(learnerId, programId)).rejects.toMatchObject({ code: "ASSESSMENT_BANK_BLOCKED" });
    expect(state.sessions).toHaveLength(0);
    expect(state.diagnostic.start).not.toHaveBeenCalled();
  });

  it("preserves an existing course attempt instead of attaching it to a different program", async () => {
    const state = harness();
    state.attempts.push({ id: "legacy-attempt", status: "IN_PROGRESS" });
    await expect(state.service.startSession(learnerId, programId)).rejects.toMatchObject({
      code: "ASSESSMENT_ATTEMPT_IN_PROGRESS", details: { attemptId: "legacy-attempt" },
    });
    expect(state.sessions).toHaveLength(0);
    expect(state.diagnostic.start).not.toHaveBeenCalled();
  });
});
