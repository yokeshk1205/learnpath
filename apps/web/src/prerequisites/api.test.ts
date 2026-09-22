import { afterEach, describe, expect, it, vi } from "vitest";

import { getPrerequisiteAnalysis } from "./api";

afterEach(() => vi.restoreAllMocks());

describe("prerequisite analysis API client", () => {
  it("loads authenticated goal-specific graph intelligence", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      analyzedAt: "2026-08-29T00:00:00.000Z",
      goal: { id: "goal", name: "Goal", outcome: "Outcome", slug: "goal" },
      skills: [],
      summary: { goalReadiness: 0.5 },
      validOrder: [],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const result = await getPrerequisiteAnalysis("token", { goalId: "goal-id" });

    expect(result.summary.goalReadiness).toBe(0.5);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/prerequisites/analysis?goalId=goal-id",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer token" }) }),
    );
  });
});
