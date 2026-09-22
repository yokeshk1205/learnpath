import { afterEach, describe, expect, it, vi } from "vitest";

import { getSyntheticDatasetOverview } from "./api";

afterEach(() => vi.restoreAllMocks());

describe("synthetic dataset API", () => {
  it("reads the real ML manifest endpoint", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      classification: "SYNTHETIC / SIMULATED DATA",
      dataset: { interactionCount: 20_000, learnerCount: 1_000, randomSeed: 42 },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const result = await getSyntheticDatasetOverview();

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/ml/datasets/synthetic/overview",
      { headers: { Accept: "application/json" } },
    );
    expect(result.classification).toBe("SYNTHETIC / SIMULATED DATA");
    expect(result.dataset).toMatchObject({ interactionCount: 20_000, learnerCount: 1_000, randomSeed: 42 });
  });
});
