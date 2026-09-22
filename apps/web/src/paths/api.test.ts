import { afterEach, describe, expect, it, vi } from "vitest";

import {
  generateCoordinatedLearningPlan,
  generatePersonalizedPath,
  getCoordinatedLearningPlan,
  getPersonalizedPath,
  getPersonalizedPathHistory,
  regeneratePersonalizedPath,
} from "./api";

afterEach(() => vi.restoreAllMocks());

describe("personalized path API", () => {
  it("loads the one path owned by an enrollment", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: "path", pathVersion: 1 }), { status: 200 }));
    const result = await getPersonalizedPath("token", "enrollment");
    expect(result.id).toBe("path");
    expect(fetchMock).toHaveBeenCalledWith("/api/enrollments/enrollment/path", expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer token" }),
    }));
  });

  it("requests idempotent path generation", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ created: true, path: { id: "path" } }), { status: 201 }));
    const result = await generatePersonalizedPath("token", "enrollment");
    expect(result.created).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("/api/enrollments/enrollment/path/generate", expect.objectContaining({ method: "POST" }));
  });

  it("explicitly regenerates a stale path and loads its history", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ regenerated: true, path: { pathVersion: 2 } }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ paths: [{ pathVersion: 2 }, { pathVersion: 1 }] }), { status: 200 }));
    const result = await regeneratePersonalizedPath("token", "enrollment");
    const history = await getPersonalizedPathHistory("token", "enrollment");
    expect(result.path.pathVersion).toBe(2);
    expect(history.paths).toHaveLength(2);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/enrollments/enrollment/path/regenerate", expect.objectContaining({ method: "POST" }));
  });

  it("loads and explicitly generates cross-course coordination", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ policyVersion: "cross-course-coordination-v1" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ generatedPaths: 2, plan: {} }), { status: 201 }));

    await getCoordinatedLearningPlan("token");
    await generateCoordinatedLearningPlan("token");

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/enrollments/paths/coordination", expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer token" }),
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/enrollments/paths/coordination/generate", expect.objectContaining({
      method: "POST",
    }));
  });
});
