import { afterEach, describe, expect, it, vi } from "vitest";

import { getCatalogOverview, selectLearnerGoal } from "./api";

afterEach(() => vi.restoreAllMocks());

describe("curriculum catalog API client", () => {
  it("loads learner catalog data through the in-memory bearer credential", async () => {
    const overview = {
      courses: [], domains: [], goals: [], learnerGoals: [],
      stats: { categories: 8, courses: 4, domains: 1, prerequisiteEdges: 86, skills: 36 },
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(overview), { headers: { "Content-Type": "application/json" }, status: 200 }),
    );
    await expect(getCatalogOverview("memory-token")).resolves.toEqual(overview);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/catalog/overview",
      expect.objectContaining({
        credentials: "include",
        headers: expect.objectContaining({ Authorization: "Bearer memory-token" }),
      }),
    );
  });

  it("persists a selected goal instead of changing only local UI state", async () => {
    const goalId = "20000000-0000-4000-8000-000000000001";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ goal: { goalId } }), { headers: { "Content-Type": "application/json" }, status: 201 }),
    );
    await selectLearnerGoal("memory-token", goalId);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/catalog/learner-goals",
      expect.objectContaining({ body: JSON.stringify({ goalId, priority: 1 }), method: "POST" }),
    );
  });
});
