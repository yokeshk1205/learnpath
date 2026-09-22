import { describe, expect, it } from "vitest";

import {
  analyzePrerequisiteGraph,
  PrerequisiteGraphCycleError,
  type PrerequisiteNodeInput,
} from "../src/prerequisites/engine.js";

const goal = { id: "goal", name: "Backend", outcome: "Build systems", slug: "backend" };

function node(input: Partial<PrerequisiteNodeInput> & Pick<PrerequisiteNodeInput, "id" | "name">): PrerequisiteNodeInput {
  return {
    category: "Foundations",
    confidence: null,
    courseContexts: [],
    currentMastery: null,
    description: `${input.name} description`,
    difficulty: 1,
    isCore: true,
    isGoalSkill: true,
    relevance: 1,
    requiredMastery: 0.7,
    slug: input.name.toLowerCase().replaceAll(" ", "-"),
    ...input,
  };
}

describe("prerequisite graph engine", () => {
  it("locks a skill when a required prerequisite has insufficient global mastery", () => {
    const analysis = analyzePrerequisiteGraph({
      analyzedAt: "2026-08-29T00:00:00.000Z",
      edges: [{
        prerequisiteSkillId: "arrays", relationshipType: "REQUIRED", requiredMastery: 0.7, skillId: "hashing",
      }],
      goal,
      nodes: [
        node({ currentMastery: 0.42, id: "arrays", name: "Arrays" }),
        node({ currentMastery: 0.2, id: "hashing", name: "Hashing" }),
      ],
    });
    const hashing = analysis.skills.find((skill) => skill.id === "hashing")!;

    expect(hashing.status).toBe("LOCKED");
    expect(hashing.missingPrerequisites[0]).toMatchObject({
      currentMastery: 0.42, prerequisiteSkillName: "Arrays", requiredMastery: 0.7, shortfall: 0.28,
    });
  });

  it("keeps recommended relationships advisory and recognizes cross-course mastery", () => {
    const analysis = analyzePrerequisiteGraph({
      edges: [{
        prerequisiteSkillId: "arrays", relationshipType: "RECOMMENDED", requiredMastery: 0.8, skillId: "queues",
      }],
      goal,
      nodes: [
        node({
          courseContexts: [
            { courseId: "one", courseName: "Course One", isEnrolled: true },
            { courseId: "two", courseName: "Course Two", isEnrolled: true },
          ],
          currentMastery: 0.6,
          id: "arrays",
          name: "Arrays",
        }),
        node({ currentMastery: 0.1, id: "queues", name: "Queues" }),
      ],
    });
    const queues = analysis.skills.find((skill) => skill.id === "queues")!;

    expect(queues.status).toBe("UNLOCKED");
    expect(queues.missingPrerequisites).toHaveLength(0);
    expect(queues.prerequisites[0]).toMatchObject({ recognizedAcrossCourses: true, satisfied: false });
  });

  it("uses confidence-adjusted mastery for required prerequisite gates", () => {
    const analysis = analyzePrerequisiteGraph({
      edges: [{
        prerequisiteSkillId: "arrays", relationshipType: "REQUIRED", requiredMastery: 0.7, skillId: "queues",
      }],
      goal,
      nodes: [
        node({ confidence: 0.4, currentMastery: 0.73, id: "arrays", name: "Arrays" }),
        node({ currentMastery: 0.2, id: "queues", name: "Queues" }),
      ],
    });
    const gate = analysis.skills.find((skill) => skill.id === "queues")!.prerequisites[0]!;

    expect(gate).toMatchObject({
      currentMastery: 0.73, effectiveMastery: 0.67, satisfied: false,
      shortfall: 0.03, uncertaintyPenalty: 0.06,
    });
  });

  it("returns a dependency-valid order and transparent goal readiness", () => {
    const analysis = analyzePrerequisiteGraph({
      edges: [
        { prerequisiteSkillId: "root", relationshipType: "REQUIRED", requiredMastery: 0.6, skillId: "middle" },
        { prerequisiteSkillId: "middle", relationshipType: "REQUIRED", requiredMastery: 0.7, skillId: "advanced" },
      ],
      goal,
      nodes: [
        node({ currentMastery: 0.7, id: "root", name: "Root", relevance: 0.5 }),
        node({ currentMastery: 0.7, id: "middle", name: "Middle", relevance: 0.3 }),
        node({ currentMastery: 0.35, id: "advanced", name: "Advanced", relevance: 0.2 }),
      ],
    });

    expect(analysis.validOrder).toEqual(["root", "middle", "advanced"]);
    expect(analysis.summary.goalReadiness).toBe(0.9);
    expect(analysis.summary).toMatchObject({ lockedSkills: 0, masteredSkills: 2, unlockedSkills: 1 });
  });

  it("fails explicitly when required relationships contain a cycle", () => {
    expect(() => analyzePrerequisiteGraph({
      edges: [
        { prerequisiteSkillId: "b", relationshipType: "REQUIRED", requiredMastery: 0.7, skillId: "a" },
        { prerequisiteSkillId: "a", relationshipType: "REQUIRED", requiredMastery: 0.7, skillId: "b" },
      ],
      goal,
      nodes: [node({ id: "a", name: "A" }), node({ id: "b", name: "B" })],
    })).toThrow(PrerequisiteGraphCycleError);
  });
});
