import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import type { CoordinatedLearningPlan } from "../paths/api";
import { CoordinatedLearnNext } from "./CoordinatedLearnNext";

const plan = {
  activeGoal: { goalId: "goal", name: "Backend Engineer", priority: 1, targetDate: null },
  courses: [],
  generatedAt: "2026-08-31T00:00:00.000Z",
  learnNext: {
    basePriority: 0.72,
    coordinationScore: 0.82,
    courseContexts: [
      { courseId: "course-a", courseName: "Algorithms", courseSlug: "algorithms", enrollmentId: "enrollment-a", pathId: "path-a", priorityScore: 0.72 },
      { courseId: "course-b", courseName: "Programming", courseSlug: "programming", enrollmentId: "enrollment-b", pathId: "path-b", priorityScore: 0.7 },
    ],
    crossCourseBonus: 0.04,
    explanation: "Recursion advances both active course paths and supports the learner's goal.",
    goalBonus: 0.06,
    goalRelevance: 1,
    item: { name: "Recursion", skillId: "recursion" },
    primaryCourse: { courseId: "course-a", courseName: "Algorithms", courseSlug: "algorithms", enrollmentId: "enrollment-a", pathId: "path-a" },
    reasonCodes: ["COURSE_PATH_VALID", "SHARED_SKILL_UTILITY", "ACTIVE_GOAL_ALIGNMENT"],
  },
  policyVersion: "cross-course-coordination-v1",
  summary: { activeCourses: 2, coordinatedCourses: 2, coursesWithoutPaths: 0, goalAlignedCandidates: 1, sharedSkillContexts: 1 },
} as unknown as CoordinatedLearningPlan;

describe("coordinated Learn Next", () => {
  it("makes the cross-course decision and its bounded signals visible", () => {
    render(<MemoryRouter><CoordinatedLearnNext generating={false} onGenerate={vi.fn()} plan={plan} /></MemoryRouter>);

    expect(screen.getByRole("heading", { name: "Recursion" })).toBeInTheDocument();
    expect(screen.getByText("82%")).toBeInTheDocument();
    expect(screen.getByText("Supports Backend Engineer")).toBeInTheDocument();
    expect(screen.getByText("Algorithms")).toBeInTheDocument();
    expect(screen.getByText("Programming")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open next step/i })).toHaveAttribute(
      "href",
      "/my-courses/enrollment-a/path",
    );
  });

  it("shows that stale paths are excluded and offers an explicit refresh", () => {
    const stalePlan = {
      ...plan,
      courses: [{
        courseId: "course-a", courseName: "Algorithms", courseSlug: "algorithms",
        enrollmentId: "enrollment-a", enrollmentStatus: "ACTIVE", generatedAt: "2026-08-31T00:00:00.000Z",
        lastAccessedAt: "2026-08-31T00:00:00.000Z", learnNext: null, pathId: "path-a",
        pathState: "STALE", pathVersion: 1, progressPercentage: 30,
      }],
      learnNext: null,
      summary: { ...plan.summary, coordinatedCourses: 0 },
    } as CoordinatedLearningPlan;
    const onGenerate = vi.fn();
    render(<MemoryRouter><CoordinatedLearnNext generating={false} onGenerate={onGenerate} plan={stalePlan} /></MemoryRouter>);

    expect(screen.getByText(/1 course path needs an update/i)).toBeInTheDocument();
    screen.getByRole("button", { name: /update and coordinate/i }).click();
    expect(onGenerate).toHaveBeenCalledOnce();
  });
});
