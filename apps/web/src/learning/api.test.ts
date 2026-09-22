import { afterEach, describe, expect, it, vi } from "vitest";

import { getLearningOverview, getLearningResource, recordResourceEvent } from "./api";

afterEach(() => vi.restoreAllMocks());

describe("learning resource API client", () => {
  it("loads a learner-scoped resource library with context filters", async () => {
    const payload = { activity: [], resources: [], summary: { availableResources: 0 } };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(payload), { headers: { "Content-Type": "application/json" } }),
    );

    await expect(getLearningOverview("memory-token", {
      courseId: "40000000-0000-4000-8000-000000000001",
      moduleId: "50000000-0000-4000-8000-000000000001",
    })).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/learning/overview?courseId=40000000-0000-4000-8000-000000000001&moduleId=50000000-0000-4000-8000-000000000001",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer memory-token" }) }),
    );
  });

  it("loads a real study resource", async () => {
    const payload = { id: "resource-1", title: "Arrays Visual Primer" };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(payload), { headers: { "Content-Type": "application/json" } }),
    );

    await expect(getLearningResource("memory-token", "resource-1")).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/learning/resources/resource-1",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer memory-token" }) }),
    );
  });

  it("persists a resource lifecycle event with measured duration", async () => {
    const payload = { event: { eventType: "RESOURCE_COMPLETED" } };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(payload), { headers: { "Content-Type": "application/json" }, status: 201 }),
    );
    const input = {
      courseId: "course-1", durationSeconds: 95,
      eventType: "RESOURCE_COMPLETED" as const, moduleId: "module-1",
    };

    await expect(recordResourceEvent("memory-token", "resource-1", input)).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/learning/resources/resource-1/events",
      expect.objectContaining({ body: JSON.stringify(input), method: "POST" }),
    );
  });
});
