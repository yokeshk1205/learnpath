import { afterEach, describe, expect, it, vi } from "vitest";

import { getLearnerAnalytics } from "./api";

afterEach(() => vi.restoreAllMocks());

describe("learner analytics API", () => {
  it("loads authenticated learner-scoped analytics", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ summary: { assessedSkills: 4 } }), { status: 200 }),
    );
    const result = await getLearnerAnalytics("token");
    expect(result.summary.assessedSkills).toBe(4);
    expect(fetchMock).toHaveBeenCalledWith("/api/analytics/overview", expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer token" }),
    }));
  });
});
