import { describe, expect, it } from "vitest";

import { coordinateCoursePaths } from "../src/paths/coordination.js";
import type { CoordinatedCoursePath, PathItem } from "../src/paths/types.js";

function item(input: Partial<PathItem> & Pick<PathItem, "name" | "skillId">): PathItem {
  return {
    benefitProbability: 0.7,
    candidateKind: "LEARN",
    category: "Algorithms",
    confidence: 0.6,
    dependencyLevel: 1,
    description: "Skill",
    difficulty: 2,
    evidenceState: "ASSESSED",
    explanation: "Course recommendation",
    goalRelevance: null,
    isContextSkill: true,
    isCore: true,
    lane: "RECOMMENDED_NEXT",
    mastery: 0.4,
    missingPrerequisites: [],
    module: null,
    position: 1,
    practiceAvailable: true,
    prerequisiteState: "SATISFIED",
    prerequisites: [],
    priorityScore: 0.7,
    reasonCodes: ["ML_HIGHEST_PRIORITY"],
    resourceCount: 1,
    retention: 0.4,
    retentionState: "AT_RISK",
    revisionDue: false,
    slug: input.name.toLowerCase().replaceAll(" ", "-"),
    targetMastery: 0.7,
    ...input,
  };
}

function course(input: Partial<CoordinatedCoursePath> & Pick<CoordinatedCoursePath, "courseName" | "enrollmentId">): CoordinatedCoursePath {
  return {
    courseId: `${input.enrollmentId}-course`,
    courseSlug: input.courseName.toLowerCase().replaceAll(" ", "-"),
    enrollmentStatus: "ACTIVE",
    generatedAt: "2026-08-31T00:00:00.000Z",
    lastAccessedAt: "2026-08-31T00:00:00.000Z",
    learnNext: null,
    pathId: `${input.enrollmentId}-path`,
    pathState: "READY",
    pathVersion: 1,
    progressPercentage: 20,
    ...input,
  };
}

describe("cross-course path coordination", () => {
  it("selects only among each active course's graph-valid Learn Next", () => {
    const plan = coordinateCoursePaths({
      activeGoal: null,
      courses: [
        course({ courseName: "Algorithms", enrollmentId: "algorithms", learnNext: item({ name: "Trees", priorityScore: 0.78, skillId: "trees" }) }),
        course({ courseName: "Programming", enrollmentId: "programming", learnNext: item({ name: "Functions", priorityScore: 0.71, skillId: "functions" }) }),
        course({ courseName: "Paused", enrollmentId: "paused", enrollmentStatus: "PAUSED", learnNext: item({ name: "Ignored", priorityScore: 0.99, skillId: "ignored" }) }),
      ],
    });
    expect(plan.learnNext).toMatchObject({
      basePriority: 0.78,
      coordinationScore: 0.78,
      item: { skillId: "trees" },
      primaryCourse: { enrollmentId: "algorithms" },
    });
    expect(plan.summary.activeCourses).toBe(2);
  });

  it("rewards one shared global skill without merging course path ownership", () => {
    const plan = coordinateCoursePaths({
      activeGoal: null,
      courses: [
        course({ courseName: "Algorithms", enrollmentId: "algorithms", learnNext: item({ name: "Recursion", priorityScore: 0.72, skillId: "recursion" }) }),
        course({ courseName: "Programming", enrollmentId: "programming", learnNext: item({ name: "Recursion", priorityScore: 0.7, skillId: "recursion" }) }),
      ],
    });
    expect(plan.learnNext).toMatchObject({
      basePriority: 0.72,
      coordinationScore: 0.76,
      crossCourseBonus: 0.04,
      item: { skillId: "recursion" },
    });
    expect(plan.learnNext?.courseContexts).toHaveLength(2);
    expect(new Set(plan.learnNext?.courseContexts.map((context) => context.pathId)).size).toBe(2);
  });

  it("uses the highest-priority active goal as a bounded optional signal", () => {
    const plan = coordinateCoursePaths({
      activeGoal: {
        goalId: "goal",
        name: "Backend Engineer",
        priority: 1,
        relevanceBySkill: new Map([["apis", 1]]),
        targetDate: null,
      },
      courses: [
        course({ courseName: "Web", enrollmentId: "web", learnNext: item({ name: "APIs", priorityScore: 0.7, skillId: "apis" }) }),
        course({ courseName: "Algorithms", enrollmentId: "algorithms", learnNext: item({ name: "Trees", priorityScore: 0.74, skillId: "trees" }) }),
      ],
    });
    expect(plan.learnNext).toMatchObject({
      basePriority: 0.7,
      coordinationScore: 0.76,
      goalBonus: 0.06,
      goalRelevance: 1,
      item: { skillId: "apis" },
    });
    expect(plan.learnNext?.reasonCodes).toContain("ACTIVE_GOAL_ALIGNMENT");
  });

  it("never coordinates a recommendation from a stale path", () => {
    const plan = coordinateCoursePaths({
      activeGoal: null,
      courses: [
        course({ courseName: "Stale", enrollmentId: "stale", pathState: "STALE", learnNext: item({ name: "Old next", priorityScore: 0.99, skillId: "old" }) }),
        course({ courseName: "Fresh", enrollmentId: "fresh", learnNext: item({ name: "Current next", priorityScore: 0.7, skillId: "current" }) }),
      ],
    });
    expect(plan.learnNext?.item.skillId).toBe("current");
    expect(plan.summary.coordinatedCourses).toBe(1);
  });
});
