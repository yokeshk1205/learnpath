import { afterEach, describe, expect, it, vi } from "vitest";

import { getCandidateOverview } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("candidate API", () => {
  it("requests the course-owned candidate pool", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: { eligible: [], excluded: [], locked: [] },
      policyVersion: "candidate-v1",
    }), { headers: { "content-type": "application/json" }, status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await getCandidateOverview("access", "enrollment-id");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/enrollments/enrollment-id/candidates",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer access" }),
      }),
    );
  });
});
