import { afterEach, describe, expect, it, vi } from "vitest";

import { startPractice, submitPractice } from "./api";

afterEach(() => vi.restoreAllMocks());

describe("practice API client", () => {
  it("starts practice in an enrollment context", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      JSON.stringify({ id: "attempt-1" }),
      { headers: { "Content-Type": "application/json" }, status: 201 },
    ));
    await startPractice("token", "skill-id", "enrollment-id");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/practice/start",
      expect.objectContaining({
        body: JSON.stringify({ skillId: "skill-id", mode: "PRACTICE", enrollmentId: "enrollment-id" }),
        method: "POST",
      }),
    );
  });

  it("starts a real retention check through the practice pipeline", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      JSON.stringify({ id: "retention-attempt" }),
      { headers: { "Content-Type": "application/json" }, status: 201 },
    ));
    await startPractice("token", "skill-id", undefined, "RETENTION_CHECK");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/practice/start",
      expect.objectContaining({ body: JSON.stringify({ skillId: "skill-id", mode: "RETENTION_CHECK" }) }),
    );
  });

  it("starts a separate post-lesson assessment pool", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      JSON.stringify({ id: "assessment-attempt" }),
      { headers: { "Content-Type": "application/json" }, status: 201 },
    ));
    await startPractice("token", "skill-id", "enrollment-id", "ASSESSMENT");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/practice/start",
      expect.objectContaining({
        body: JSON.stringify({ skillId: "skill-id", mode: "ASSESSMENT", enrollmentId: "enrollment-id" }),
      }),
    );
  });

  it("submits only the learner answer and measured interaction data", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      JSON.stringify({ feedback: { isCorrect: true } }),
      { headers: { "Content-Type": "application/json" }, status: 200 },
    ));
    const input = { durationSeconds: 31, hintsUsed: 0, optionId: "option-id" };
    await submitPractice("token", "attempt-id", input);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/practice/attempts/attempt-id/submit",
      expect.objectContaining({ body: JSON.stringify(input), method: "POST" }),
    );
  });
});
