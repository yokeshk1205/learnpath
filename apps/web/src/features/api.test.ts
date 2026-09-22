import { afterEach, describe, expect, it, vi } from "vitest";

import { getFeatureDatasetOverview } from "./api";

afterEach(() => vi.restoreAllMocks());

describe("feature dataset API", () => {
  it("loads the Phase 13 overview from the ML boundary", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      classification: "SYNTHETIC / SIMULATED DATA — ENGINEERED FEATURES",
      featureContract: { contractVersion: "learner-candidate-features-v2", featureCount: 55 },
    }), { status: 200 }));

    const result = await getFeatureDatasetOverview();

    expect(fetch).toHaveBeenCalledWith("/ml/datasets/features/overview", expect.any(Object));
    expect(result.featureContract.featureCount).toBe(55);
  });

  it("fails explicitly when the feature manifest is unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 503 }));

    await expect(getFeatureDatasetOverview()).rejects.toThrow("503");
  });
});
