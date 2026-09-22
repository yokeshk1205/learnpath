import { afterEach, describe, expect, it, vi } from "vitest";

import { getRetentionOverview } from "./api";

afterEach(() => vi.restoreAllMocks());

describe("retention API client", () => {
  it("loads the authenticated learner's retention projection", async () => {
    const payload = { calculatedAt: "2026-08-30T00:00:00.000Z", skills: [], summary: {} };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      JSON.stringify(payload), { headers: { "Content-Type": "application/json" }, status: 200 },
    ));
    await expect(getRetentionOverview("token")).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/retention",
      expect.objectContaining({
        credentials: "include",
        headers: expect.objectContaining({ Authorization: "Bearer token" }),
      }),
    );
  });
});
