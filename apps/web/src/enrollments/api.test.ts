import { afterEach, describe, expect, it, vi } from "vitest";

import { enrollInCourse, listEnrollments, updateModuleProgress } from "./api";

afterEach(() => vi.restoreAllMocks());

describe("course enrollment API client", () => {
  it("loads learner-owned enrollment progress", async () => {
    const payload = { enrollments: [{ id: "enrollment-1", progressPercentage: 0 }] };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(payload), { headers: { "Content-Type": "application/json" }, status: 200 }),
    );
    await expect(listEnrollments("memory-token")).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/enrollments",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer memory-token" }) }),
    );
  });

  it("persists a course enrollment with its active learning-goal context", async () => {
    const courseId = "40000000-0000-4000-8000-000000000001";
    const goalId = "20000000-0000-4000-8000-000000000001";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ enrollment: { courseId } }), { headers: { "Content-Type": "application/json" }, status: 201 }),
    );
    await enrollInCourse("memory-token", courseId, goalId);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/enrollments",
      expect.objectContaining({
        body: JSON.stringify({ courseId, learningGoalId: goalId }),
        method: "POST",
      }),
    );
  });

  it("updates only the addressed enrollment module", async () => {
    const enrollmentId = "71000000-0000-4000-8000-000000000001";
    const moduleId = "50000000-0000-4000-8000-000000000001";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ enrollment: { progressPercentage: 33.33 } }), { headers: { "Content-Type": "application/json" }, status: 200 }),
    );
    await updateModuleProgress("memory-token", enrollmentId, moduleId, "COMPLETED");
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/enrollments/${enrollmentId}/modules/${moduleId}/progress`,
      expect.objectContaining({ body: JSON.stringify({ status: "COMPLETED" }), method: "POST" }),
    );
  });
});
