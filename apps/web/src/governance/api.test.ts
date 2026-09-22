import { afterEach, describe, expect, it, vi } from "vitest";

import { getGovernanceOverview } from "./api";

afterEach(() => vi.restoreAllMocks());

describe("model governance API", () => {
  it("loads the authenticated sample-gated governance report", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ rates: { state: "INSUFFICIENT_DATA" } }), { status: 200 }),
    );
    const result = await getGovernanceOverview("token");
    expect(result.rates.state).toBe("INSUFFICIENT_DATA");
    expect(fetchMock).toHaveBeenCalledWith("/api/governance/overview", expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer token" }),
    }));
  });
});
