import { afterEach, describe, expect, it, vi } from "vitest";

import { getInferenceOverview, predictBenefit } from "./api";

afterEach(() => vi.restoreAllMocks());

describe("inference API", () => {
  it("loads the checked inference runtime", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      inference: { inferenceVersion: "benefit-inference-v2" },
      phaseBoundary: { candidateRankingIntegrated: false },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const result = await getInferenceOverview();

    expect(fetch).toHaveBeenCalledWith("/ml/inference/overview", expect.any(Object));
    expect(result.inference.inferenceVersion).toBe("benefit-inference-v2");
    expect(result.phaseBoundary.candidateRankingIntegrated).toBe(false);
  });

  it("posts the exact feature version and candidate vector", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      model_version: "benefit-ranking-v2",
      predictions: [{ skill_id: "skill-1", benefit_probability: 0.73 }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const result = await predictBenefit("features-v1", "skill-1", { mastery_gap: 0.4 });

    expect(fetch).toHaveBeenCalledWith("/ml/predict", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        feature_version: "features-v1",
        candidates: [{ skill_id: "skill-1", features: { mastery_gap: 0.4 } }],
      }),
    }));
    expect(result.predictions[0]?.benefit_probability).toBe(0.73);
  });

  it("surfaces explicit service errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      JSON.stringify({ detail: "The trained model artifact is unavailable." }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    ));

    await expect(getInferenceOverview()).rejects.toThrow("artifact is unavailable");
  });
});
