import { afterEach, describe, expect, it, vi } from "vitest";

import { getModelEvaluationOverview } from "./api";

afterEach(() => vi.restoreAllMocks());

describe("model evaluation API", () => {
  it("loads the measured Phase 14 experiment", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      model: { selectedModel: "random_forest", deploymentStatus: "EVALUATED_NOT_DEPLOYED" },
    }), { status: 200 }));

    const result = await getModelEvaluationOverview();

    expect(fetch).toHaveBeenCalledWith("/ml/experiments/current/overview", expect.any(Object));
    expect(result.model.selectedModel).toBe("random_forest");
  });

  it("fails explicitly when no evaluated experiment is available", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 503 }));

    await expect(getModelEvaluationOverview()).rejects.toThrow("503");
  });
});
