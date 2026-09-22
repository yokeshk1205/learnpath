import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { AssessmentProgramOverview } from "../assessment-programs/api";
import { CourseAssessmentPage } from "./CourseAssessmentPage";

const mocks = vi.hoisted(() => ({
  overview: vi.fn(), diagnostic: vi.fn(), create: vi.fn(), start: vi.fn(), refresh: vi.fn(),
  saveReport: vi.fn(), focused: vi.fn(),
}));
vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ accessToken: "test-token", refreshSession: mocks.refresh }) }));
vi.mock("../components/LearnerAppShell", () => ({ LearnerAppShell: ({ children }: { children: ReactNode }) => children }));
vi.mock("../assessment-programs/api", () => ({
  getAssessmentProgramOverview: mocks.overview, createAssessmentProgram: mocks.create,
  startAssessmentProgramSession: mocks.start, saveCourseSelfReport: mocks.saveReport,
  startFocusedKnowledgeCheck: mocks.focused,
}));
vi.mock("../diagnostics/api", () => ({ getDiagnosticOverview: mocks.diagnostic }));

function overview(): AssessmentProgramOverview {
  return {
    context: { id: "history", name: "World history", slug: "world-history", enrollmentId: "enrollment", type: "COURSE" },
    coverage: { totalSkills: 120, assessed: 4, mastered: 0, observed: 4, unassessed: 116,
      needsConfirmation: 0, needsRefresh: 0, blocked: 1, assessedPercentage: 3.33, masteredPercentage: 0 },
    skills: [], modules: [], program: null, sessions: [],
    selfReport: { submittedAt: "2026-09-10T00:00:00.000Z", moduleReports: [], skillReports: [] },
    knowledgeBoundary: { found: false, pathReady: false, startingSkillId: null, startingSkillName: null,
      reason: "No direct evidence yet.", skills: [] },
    backlog: [],
    nextSession: { focusSkillIds: ["skill"], moduleId: "module", maximumQuestions: 12, estimatedSessionCount: 29,
      reason: "Checks a small group; the rest remain unassessed." },
    policy: { version: "course-coverage-v1", maximumSkillsPerSession: 4, maximumQuestionsPerSession: 28,
      coverageExplanation: "Direct evidence is required.", masteryExplanation: "Coverage is not mastery." },
  };
}
function Location() { const location = useLocation(); return <p>{location.pathname}</p>; }
function open() {
  return render(<MemoryRouter initialEntries={["/my-courses/enrollment/assessment"]}><Routes>
    <Route path="/my-courses/:enrollmentId/assessment" element={<CourseAssessmentPage />} />
    <Route path="/diagnostic/:attemptId" element={<Location />} />
  </Routes></MemoryRouter>);
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.overview.mockResolvedValue(overview());
  mocks.diagnostic.mockResolvedValue({ inProgressAttempt: null });
});
afterEach(cleanup);

describe("course-wide knowledge check flow", () => {
  it("shows real coverage separately from mastery and defaults to a full-course program", async () => {
    open();
    await screen.findByRole("heading", { name: "Know where you stand." });
    expect(screen.getByLabelText("4 of 120 skills assessed")).toBeInTheDocument();
    expect(screen.getByText("0 currently meet mastery requirements")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Full course Cover every skill/ })).toHaveAttribute("aria-pressed", "true");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("lets an existing learner voluntarily update starting knowledge without interrupting their course", async () => {
    open();
    await screen.findByRole("heading", { name: "Know where you stand." });
    fireEvent.click(screen.getByRole("button", { name: "Tell us what I know" }));
    expect(screen.getByRole("heading", { name: "Tell us where you’re starting." })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Return to course knowledge" }));
    expect(screen.getByRole("heading", { name: "Know where you stand." })).toBeInTheDocument();
    expect(mocks.saveReport).not.toHaveBeenCalled();
  });

  it("collects module self-report before assessment without converting it into mastery", async () => {
    const current = overview();
    current.selfReport.submittedAt = null;
    current.coverage = { ...current.coverage, assessed: 0, mastered: 0, observed: 0,
      needsConfirmation: 0, needsRefresh: 0, unassessed: 120, assessedPercentage: 0, masteredPercentage: 0 };
    current.modules = [{ id: "module", name: "Foundations", sequence: 1,
      skillIds: ["skill"], coverage: current.coverage }];
    current.skills = [{ skillId: "skill", skillName: "Evidence", category: "Reasoning",
      moduleId: "module", moduleName: "Foundations", moduleSequence: 1, sequence: 1,
      coverageStatus: "UNASSESSED", coverageReason: "No evidence", mastered: false,
      mastery: null, confidence: null, evidenceState: "UNKNOWN", retentionState: "UNKNOWN",
      latestClassification: null, lastEvidenceAt: null, distinctQuestionCount: 0,
      applicationQuestionCount: 0, difficultyBandCount: 0, bankStatus: "READY",
      bankReason: "Ready", questionCount: 4, availableQuestionCount: 4, dependentCount: 0, sessionCount: 0 }];
    const saved = { ...current, selfReport: { ...current.selfReport, submittedAt: "2026-09-10T00:00:00.000Z" } };
    mocks.overview.mockResolvedValue(current);
    mocks.saveReport.mockResolvedValue(saved);
    open();
    expect(await screen.findByRole("heading", { name: "Tell us where you’re starting." })).toBeInTheDocument();
    expect(screen.getByText(/never turn your self-report into a mastery score/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /I’m not sure — assess me/i }));
    await waitFor(() => expect(mocks.saveReport).toHaveBeenCalledWith("test-token", {
      enrollmentId: "enrollment", modules: [{ moduleId: "module", familiarity: "UNSURE" }], skills: [],
    }));
  });

  it("asks which individual skills are known and unknown before choosing diagnostic questions", async () => {
    const current = overview();
    current.selfReport.submittedAt = null;
    current.coverage = { ...current.coverage, assessed: 0, mastered: 0, observed: 0,
      needsConfirmation: 0, needsRefresh: 0, unassessed: 2, totalSkills: 2, assessedPercentage: 0, masteredPercentage: 0 };
    current.modules = [{ id: "module", name: "Foundations", sequence: 1,
      skillIds: ["known", "unknown"], coverage: current.coverage }];
    current.skills = ["known", "unknown"].map((skillId, index) => ({
      skillId, skillName: index === 0 ? "Recursion" : "Arrays", category: "Reasoning",
      moduleId: "module", moduleName: "Foundations", moduleSequence: 1, sequence: index + 1,
      coverageStatus: "UNASSESSED" as const, coverageReason: "No evidence", mastered: false,
      mastery: null, confidence: null, evidenceState: "UNKNOWN" as const, retentionState: "UNKNOWN" as const,
      latestClassification: null, lastEvidenceAt: null, distinctQuestionCount: 0,
      applicationQuestionCount: 0, difficultyBandCount: 0, bankStatus: "READY" as const,
      bankReason: "Ready", questionCount: 4, availableQuestionCount: 4, dependentCount: 0, sessionCount: 0,
    }));
    mocks.overview.mockResolvedValue(current);
    mocks.saveReport.mockResolvedValue({ ...current, selfReport: { ...current.selfReport, submittedAt: "2026-09-12T00:00:00.000Z" } });
    open();
    await screen.findByRole("heading", { name: "Tell us where you’re starting." });
    fireEvent.click(screen.getByRole("button", { name: /Comfortable I can use the main ideas/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("heading", { name: "Which skills do you know?" })).toBeInTheDocument();
    const recursion = screen.getByLabelText("Your knowledge of Recursion");
    const arrays = screen.getByLabelText("Your knowledge of Arrays");
    fireEvent.click(recursion.querySelector<HTMLButtonElement>("button")!);
    fireEvent.click(arrays.querySelectorAll<HTMLButtonElement>("button")[1]!);
    fireEvent.click(screen.getByRole("button", { name: "Save and choose my check" }));
    await waitFor(() => expect(mocks.saveReport).toHaveBeenCalledWith("test-token", expect.objectContaining({
      skills: expect.arrayContaining([
        expect.objectContaining({ skillId: "known", familiarity: "COMFORTABLE" }),
        expect.objectContaining({ skillId: "unknown", familiarity: "NEVER_LEARNED" }),
      ]),
    })));
  });

  it("resumes an unfinished legacy quiz without starting a duplicate program or attempt", async () => {
    mocks.diagnostic.mockResolvedValue({ inProgressAttempt: { id: "saved-attempt" } });
    open();
    const resume = await screen.findByRole("button", { name: "Resume knowledge check" });
    expect(screen.queryByText("Up to 12 questions this session")).not.toBeInTheDocument();
    fireEvent.click(resume);
    expect(await screen.findByText("/diagnostic/saved-attempt")).toBeInTheDocument();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("starts a full-course session then opens the returned real attempt", async () => {
    const current = { ...overview(), program: { id: "program", mode: "COMPREHENSIVE", status: "IN_PROGRESS" } };
    mocks.create.mockResolvedValue(current);
    mocks.start.mockResolvedValue({ program: current, attempt: { id: "new-attempt" } });
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Start full-course check" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith("test-token", "enrollment", "COMPREHENSIVE"));
    expect(mocks.start).toHaveBeenCalledWith("test-token", "program");
    expect(await screen.findByText("/diagnostic/new-attempt")).toBeInTheDocument();
  });

  it("labels quick placement as partial and exposes server failures without inventing progress", async () => {
    mocks.create.mockRejectedValue(new Error("Question bank unavailable"));
    open();
    fireEvent.click(await screen.findByRole("button", { name: /Quick starting point/ }));
    expect(screen.getByText(/Quick placement is partial/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Find my starting point" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Question bank unavailable");
    expect(screen.getByLabelText("4 of 120 skills assessed")).toBeInTheDocument();
    expect(mocks.start).not.toHaveBeenCalled();
  });
});
