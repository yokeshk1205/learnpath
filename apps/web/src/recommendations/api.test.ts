import { afterEach, describe, expect, it, vi } from "vitest";

import { getRecommendationEvaluation, getRecommendationFeedback, respondToRecommendation } from "./api";

afterEach(() => vi.restoreAllMocks());

describe("recommendation feedback API", () => {
  it("loads, responds, and evaluates using authenticated backend routes", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ feedback: null }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ created: true, feedback: { decision: "ACCEPTED" } }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ summary: { shown: 1 } }), { status: 200 }));

    await getRecommendationFeedback("token", "path");
    await respondToRecommendation("token", "path", { decision: "ACCEPTED", resourceId: "resource" });
    const evaluation = await getRecommendationEvaluation("token");

    expect(evaluation.summary.shown).toBe(1);
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/recommendations/paths/path/feedback", expect.objectContaining({
      body: JSON.stringify({ decision: "ACCEPTED", resourceId: "resource" }), method: "POST",
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/recommendations/evaluation", expect.any(Object));
  });
});
