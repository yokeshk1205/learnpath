import { afterEach, describe, expect, it, vi } from "vitest";

import { getDiagnosticOverview, saveDiagnosticAnswer, startDiagnostic, submitDiagnostic } from "./api";

afterEach(() => vi.restoreAllMocks());

describe("diagnostic API client", () => {
  it("loads the learner's diagnostic context", async () => {
    const payload = { activeGoal: null, assessment: null, inProgressAttempt: null, latestAttempt: null };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(payload), { headers: { "Content-Type": "application/json" }, status: 200 }),
    );
    await expect(getDiagnosticOverview("memory-token")).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/diagnostics/overview",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer memory-token" }) }),
    );
  });

  it("starts a diagnostic for a selected goal", async () => {
    const goalId = "20000000-0000-4000-8000-000000000001";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "attempt-1" }), { headers: { "Content-Type": "application/json" }, status: 201 }),
    );
    await startDiagnostic("memory-token", { goalId });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/diagnostics/start",
      expect.objectContaining({ body: JSON.stringify({ goalId }), method: "POST" }),
    );
  });

  it("submits per-question answers without client-side scoring", async () => {
    const answers = [{ questionId: "61000000-0000-4000-8000-000000000001", optionId: "62000000-0000-4000-8000-000000000001" }];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ skillResults: [] }), { headers: { "Content-Type": "application/json" }, status: 200 }),
    );
    await submitDiagnostic("memory-token", "70000000-0000-4000-8000-000000000001", answers, 90);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/diagnostics/attempts/70000000-0000-4000-8000-000000000001/submit",
      expect.objectContaining({ body: JSON.stringify({ answers, durationSeconds: 90 }), method: "POST" }),
    );
  });

  it("autosaves an unsure answer without requesting scoring", async () => {
    const answer = {
      isUnsure: true, optionId: null,
      questionId: "61000000-0000-4000-8000-000000000001", responseSeconds: 14,
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ answeredCount: 1 }), { headers: { "Content-Type": "application/json" }, status: 200 }),
    );
    await saveDiagnosticAnswer("memory-token", "70000000-0000-4000-8000-000000000001", answer);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/diagnostics/attempts/70000000-0000-4000-8000-000000000001/answers/${answer.questionId}`,
      expect.objectContaining({
        body: JSON.stringify({ isUnsure: true, optionId: null, responseSeconds: 14 }), method: "PUT",
      }),
    );
  });

  it("preserves multiple selections and numeric zero without adding client scoring", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ answeredCount: 1 }), { headers: { "Content-Type": "application/json" }, status: 200 }),
    );
    await saveDiagnosticAnswer("token", "attempt", { isUnsure: false, questionId: "multi", selectedOptionIds: ["a", "b"], responseSeconds: 3 });
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))).toEqual({ isUnsure: false, selectedOptionIds: ["a", "b"], responseSeconds: 3 });
    await saveDiagnosticAnswer("token", "attempt", { isUnsure: false, questionId: "number", numericAnswer: 0, responseSeconds: 4 });
    expect(JSON.parse(String(fetchMock.mock.calls[1]![1]?.body))).toEqual({ isUnsure: false, numericAnswer: 0, responseSeconds: 4 });
  });
});
