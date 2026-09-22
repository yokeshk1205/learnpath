import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DiagnosticAttempt, DiagnosticDraftAnswer, DiagnosticQuestion, DiagnosticResult } from "../diagnostics/api";
import { DiagnosticPage } from "./DiagnosticPage";

const mocks = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), submit: vi.fn(), result: vi.fn(), refresh: vi.fn(), generate: vi.fn(), regenerate: vi.fn() }));
vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ accessToken: "test-token", refreshSession: mocks.refresh, user: { id: "learner", displayName: "Learner" } }) }));
vi.mock("../diagnostics/api", () => ({ getDiagnosticAttempt: mocks.load, saveDiagnosticAnswer: mocks.save, submitDiagnostic: mocks.submit, getDiagnosticResult: mocks.result }));
vi.mock("../paths/api", () => ({ generatePersonalizedPath: mocks.generate, regeneratePersonalizedPath: mocks.regenerate }));

function question(id: string, questionType?: DiagnosticQuestion["questionType"]): DiagnosticQuestion {
  return {
    id, questionType, numericUnit: questionType === "NUMERIC" ? "cm" : undefined,
    prompt: `Question ${id}`, cognitiveLevel: "APPLY", difficulty: 2, discrimination: 1,
    options: questionType === "NUMERIC" ? [] : [{ id: `${id}-a`, key: "A", content: `${id} first choice` }, { id: `${id}-b`, key: "B", content: `${id} second choice` }],
    selectionReason: "Clarify this skill", selectionStage: "COVERAGE", sequence: 1,
    skillCategory: "General", skillId: `skill-${id}`, skillName: `Skill ${id}`,
  };
}
function attempt(questions: DiagnosticQuestion[], savedAnswers: DiagnosticDraftAnswer[] = []): DiagnosticAttempt {
  return {
    id: "attempt", assessmentTitle: "Course knowledge check", assessmentDescription: "Check your course", estimatedMinutes: 8,
    context: { enrollmentId: "enrollment", id: "course", name: "A course", slug: "course", type: "COURSE" },
    questions, savedAnswers, goal: null, startedAt: new Date().toISOString(), status: "IN_PROGRESS",
    selection: { answeredCount: savedAnswers.length, canComplete: true, currentStage: "COVERAGE", maximumQuestionCount: 12, minimumQuestionCount: 1, policyVersion: "test", questionBudget: 12, recognizedSkillCount: 0, selectedQuestionCount: questions.length, selectedSkillCount: questions.length, skippedSkillCount: 0, stoppingReason: null, templateQuestionCount: questions.length },
  };
}
function LocationView() { const location = useLocation(); return <p>Destination: {location.pathname}</p>; }
function BrowserControls() {
  const navigate = useNavigate();
  return <><button onClick={() => navigate(-1)} type="button">Browser back</button><button onClick={() => navigate(1)} type="button">Browser forward</button></>;
}
function openPage(data: DiagnosticAttempt) {
  mocks.load.mockResolvedValue(data);
  mocks.save.mockImplementation(async (_token, _attemptId, answer) => ({
    savedAnswer: { ...answer, optionId: answer.optionId ?? null, savedAt: new Date().toISOString() },
    answeredCount: data.savedAnswers.length + 1, questionCount: data.questions.length,
    attempt: { ...data, selection: { ...data.selection, answeredCount: data.savedAnswers.length + 1 } },
  }));
  return render(<MemoryRouter initialEntries={["/courses", "/diagnostic/attempt"]} initialIndex={1}><BrowserControls /><Routes><Route path="/diagnostic/:attemptId" element={<DiagnosticPage />} /><Route path="*" element={<LocationView />} /></Routes></MemoryRouter>);
}
beforeEach(() => { vi.clearAllMocks(); window.sessionStorage.clear(); });
afterEach(cleanup);

describe("diagnostic response formats", () => {
  it("accepts numeric zero and saves only after an explicit action", async () => {
    openPage(attempt([question("number", "NUMERIC"), question("next")]));
    const input = await screen.findByRole("textbox", { name: "Your answer (cm)" });
    fireEvent.change(input, { target: { value: "0" } });
    expect(mocks.save).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Next question" })).toBeDisabled();
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Save answer" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Next question" })).toBeEnabled());
    expect(mocks.save).toHaveBeenCalledWith("test-token", "attempt", expect.objectContaining({ isUnsure: false, numericAnswer: 0, questionId: "number" }));
    expect(mocks.save.mock.calls[0]![2]).not.toHaveProperty("optionId");
  });

  it("collects several selections before saving and restores them when returning to the question", async () => {
    openPage(attempt([question("multi", "MULTI_SELECT"), question("next")]));
    fireEvent.click(await screen.findByRole("checkbox", { name: "multi first choice" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "multi second choice" }));
    expect(mocks.save).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Go to evidence item 2" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Save answer" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Next question" })).toBeEnabled());
    expect(mocks.save.mock.calls[0]![2]).toMatchObject({ isUnsure: false, questionId: "multi", selectedOptionIds: ["multi-a", "multi-b"] });
    fireEvent.click(screen.getByRole("button", { name: "Next question" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(screen.getByRole("checkbox", { name: "multi first choice" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "multi second choice" })).toBeChecked();
    expect(mocks.save).toHaveBeenCalledOnce();
  });

  it("retains a numeric draft on save failure and blocks finishing or exiting until retry succeeds", async () => {
    openPage(attempt([question("number", "NUMERIC")]));
    mocks.save.mockRejectedValueOnce(new Error("Connection lost"));
    fireEvent.change(await screen.findByRole("textbox", { name: "Your answer (cm)" }), { target: { value: "-2.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save answer" }));
    await screen.findByText(/Connection lost/);
    expect(screen.getByRole("textbox", { name: "Your answer (cm)" })).toHaveValue("-2.5");
    expect(screen.getByRole("button", { name: "Finish this session" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save & exit" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Retry saving answer" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Finish this session" })).toBeEnabled());
    expect(mocks.save.mock.calls[1]![2]).toMatchObject({ numericAnswer: -2.5 });
  });

  it("restores saved arrays and negative numbers without submitting evidence again", async () => {
    const saved = [
      { isUnsure: false, optionId: null, selectedOptionIds: ["multi-a", "multi-b"], questionId: "multi", responseSeconds: 9, savedAt: new Date().toISOString() },
      { isUnsure: false, optionId: null, numericAnswer: -12, questionId: "number", responseSeconds: 4, savedAt: new Date().toISOString() },
    ];
    openPage(attempt([question("multi", "MULTI_SELECT"), question("number", "NUMERIC")], saved));
    expect(await screen.findByRole("textbox", { name: "Your answer (cm)" })).toHaveValue("-12");
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(screen.getByRole("checkbox", { name: "multi first choice" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "multi second choice" })).toBeChecked();
    expect(mocks.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox", { name: "multi second choice" }));
    fireEvent.click(screen.getByRole("button", { name: "Save & exit" }));
    await screen.findByText("Destination: /my-courses/enrollment/assessment");
    expect(mocks.save).toHaveBeenCalledWith("test-token", "attempt", expect.objectContaining({ selectedOptionIds: ["multi-a"] }));
  });

  it("prevents navigating away from a previously saved response after invalid local edits", async () => {
    const saved = [
      { isUnsure: true, optionId: null, questionId: "first", responseSeconds: 1, savedAt: new Date().toISOString() },
      { isUnsure: false, optionId: null, numericAnswer: 0, questionId: "number", responseSeconds: 1, savedAt: new Date().toISOString() },
    ];
    openPage(attempt([question("first"), question("number", "NUMERIC")], saved));
    const input = await screen.findByRole("textbox", { name: "Your answer (cm)" });
    for (const value of ["Infinity", "1e999", "-", ""]) {
      fireEvent.change(input, { target: { value } });
      expect(screen.getByRole("button", { name: "Save answer" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Save & exit" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Finish this session" })).toBeDisabled();
    }
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("keeps single-choice autosave for legacy questions without a question type", async () => {
    openPage(attempt([question("single")]));
    fireEvent.click(await screen.findByRole("button", { name: /single first choice/ }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
    expect(mocks.save.mock.calls[0]![2]).toMatchObject({ isUnsure: false, optionId: "single-a" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Finish this session" })).toBeEnabled());
  });

  it("recovers unsaved edits after browser Back and return without sending them as evidence", async () => {
    openPage(attempt([question("number", "NUMERIC")]));
    fireEvent.change(await screen.findByRole("textbox", { name: "Your answer (cm)" }), { target: { value: "-" } });
    fireEvent.click(screen.getByRole("button", { name: "Browser back" }));
    await screen.findByText("Destination: /courses");
    fireEvent.click(screen.getByRole("button", { name: "Browser forward" }));
    expect(await screen.findByRole("textbox", { name: "Your answer (cm)" })).toHaveValue("-");
    expect(screen.getByRole("status")).toHaveTextContent("Unsaved edits restored from this tab");
    expect(mocks.save).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save & exit" })).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: "Your answer (cm)" }), { target: { value: "-2e2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save answer" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Finish this session" })).toBeEnabled());
    expect(mocks.save.mock.calls[0]![2]).toMatchObject({ numericAnswer: -200 });
    expect(window.sessionStorage.getItem("learnpath:diagnostic-drafts:learner:attempt")).toBeNull();
  });

  it("discards a recovered draft if the backend answer was saved more recently", async () => {
    const savedAt = "2026-09-09T10:00:00.000Z";
    const original = attempt([question("number", "NUMERIC")], [{ isUnsure: false, optionId: null, numericAnswer: 2, questionId: "number", responseSeconds: 3, savedAt }]);
    openPage(original);
    fireEvent.change(await screen.findByRole("textbox", { name: "Your answer (cm)" }), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: "Browser back" }));
    await screen.findByText("Destination: /courses");
    mocks.load.mockResolvedValue({ ...original, savedAnswers: [{ ...original.savedAnswers[0], numericAnswer: 9, savedAt: "2026-09-09T10:01:00.000Z" }] });
    fireEvent.click(screen.getByRole("button", { name: "Browser forward" }));
    expect(await screen.findByRole("textbox", { name: "Your answer (cm)" })).toHaveValue("9");
    expect(screen.queryByText(/Unsaved edits restored/)).not.toBeInTheDocument();
    expect(mocks.save).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem("learnpath:diagnostic-drafts:learner:attempt")).toBeNull();
  });

  it("clears an earlier multi-response when switching to unsure and does not leak selections", async () => {
    openPage(attempt([question("multi", "MULTI_SELECT")], [{ isUnsure: false, optionId: null, selectedOptionIds: ["multi-a", "multi-b"], questionId: "multi", responseSeconds: 3, savedAt: "2026-09-09T10:00:00.000Z" }]));
    fireEvent.click(await screen.findByRole("button", { name: /I’m not sure/ }));
    expect(screen.getByRole("checkbox", { name: "multi first choice" })).not.toBeChecked();
    expect(mocks.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save answer" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Finish this session" })).toBeEnabled());
    expect(mocks.save.mock.calls[0]![2]).toMatchObject({ isUnsure: true, optionId: null });
    expect(mocks.save.mock.calls[0]![2]).not.toHaveProperty("selectedOptionIds");
    expect(mocks.save.mock.calls[0]![2]).not.toHaveProperty("numericAnswer");
    expect(window.sessionStorage.getItem("learnpath:diagnostic-drafts:learner:attempt")).toBeNull();
  });

  it("submits the saved response format and displays the server's answer text after completion", async () => {
    const saved: DiagnosticDraftAnswer[] = [
      { isUnsure: false, optionId: null, selectedOptionIds: ["multi-a", "multi-b"], questionId: "multi", responseSeconds: 9, savedAt: new Date().toISOString() },
      { isUnsure: false, optionId: null, numericAnswer: 0, questionId: "number", responseSeconds: 4, savedAt: new Date().toISOString() },
    ];
    const result: DiagnosticResult = {
      attempt: { id: "attempt", correctCount: 1, durationSeconds: 13, contextName: "A course", contextType: "COURSE", enrollmentId: null, goalName: null, overallScore: 0.5, questionCount: 2, startedAt: new Date().toISOString(), submittedAt: new Date().toISOString(), title: "Saved results" },
      skillResults: [], untestedSkills: [],
      answers: [
        { questionType: "MULTI_SELECT", cognitiveLevel: "APPLY", correctOptionContent: "First selection; Second selection", correctOptionId: null, difficulty: 2, evidenceStrength: 0.5, explanation: "The selections address both requirements.", isCorrect: true, isUnsure: false, misconceptionCode: null, prompt: "Multiple-selection result", questionId: "multi", responseSeconds: 9, selectedOptionContent: "First selection; Second selection", selectedOptionId: null, selectedOptionIds: ["multi-a", "multi-b"], sequence: 1, skillName: "Skill multi" },
        { questionType: "NUMERIC", cognitiveLevel: "APPLY", correctOptionContent: "5 cm", correctOptionId: null, difficulty: 2, evidenceStrength: 0.5, explanation: "The measured length is five centimetres.", isCorrect: false, isUnsure: false, misconceptionCode: null, prompt: "Numeric result", questionId: "number", responseSeconds: 4, selectedOptionContent: "0 cm", selectedOptionId: null, numericAnswer: 0, sequence: 2, skillName: "Skill number" },
      ],
    };
    openPage(attempt([question("multi", "MULTI_SELECT"), question("number", "NUMERIC")], saved));
    mocks.submit.mockResolvedValue(result);
    fireEvent.click(await screen.findByRole("button", { name: "Finish this session" }));
    await screen.findByRole("heading", { name: "Your starting point is clearer." });
    expect(mocks.submit).toHaveBeenCalledWith("test-token", "attempt", [
      { isUnsure: false, selectedOptionIds: ["multi-a", "multi-b"], questionId: "multi", responseSeconds: 9 },
      { isUnsure: false, numericAnswer: 0, questionId: "number", responseSeconds: 4 },
    ], expect.any(Number));
    expect(screen.getByText("First selection; Second selection", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("0 cm", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("5 cm", { exact: false })).toBeInTheDocument();
  });
});
