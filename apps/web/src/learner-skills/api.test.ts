import { afterEach, describe, expect, it, vi } from "vitest";

import { getSkillPassport } from "./api";

afterEach(() => vi.restoreAllMocks());

describe("global learner skill API client", () => {
  it("loads the authenticated learner's global skill passport", async () => {
    const payload = {
      skills: [],
      summary: { assessedSkills: 0, evidenceCoverage: 0, trackedSkills: 0 },
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(payload), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }),
    );

    await expect(getSkillPassport("memory-token")).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/learner-skills",
      expect.objectContaining({
        credentials: "include",
        headers: expect.objectContaining({ Authorization: "Bearer memory-token" }),
      }),
    );
  });
});
