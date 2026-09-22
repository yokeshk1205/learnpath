import { describe, expect, it } from "vitest";

import { comparePaths } from "../src/paths/change.js";
import type { PathItem } from "../src/paths/types.js";

function item(skillId: string, name: string, lane: PathItem["lane"], mastery: number): PathItem {
  return {
    benefitProbability: 0.7, candidateKind: "LEARN", category: "Core", confidence: 0.6,
    dependencyLevel: 1, description: name, difficulty: 2, evidenceState: "ASSESSED",
    explanation: "Reason", goalRelevance: null, isContextSkill: true, isCore: true,
    lane, mastery, missingPrerequisites: [], module: null, name, position: 1,
    practiceAvailable: true, prerequisiteState: "SATISFIED", prerequisites: [], priorityScore: 0.7,
    reasonCodes: [], resourceCount: 1, retention: mastery, retentionState: "STRONG",
    revisionDue: false, skillId, slug: skillId, targetMastery: 0.7,
  };
}

describe("path version comparison", () => {
  it("explains a changed Learn Next and counts newly recognized and unlocked skills", () => {
    const change = comparePaths(
      [item("recursion", "Recursion", "RECOMMENDED_NEXT", 0.4), item("trees", "Trees", "LOCKED", 0.1)],
      [item("recursion", "Recursion", "RECOGNIZED", 0.82), item("trees", "Trees", "RECOMMENDED_NEXT", 0.1)],
    );
    expect(change).toMatchObject({
      learnNextChanged: true, masterySnapshotsChanged: 1, recognizedAdded: 1,
      unlockedAdded: 1, previousLearnNext: { skillId: "recursion" }, newLearnNext: { skillId: "trees" },
    });
    expect(change.laneChanges).toHaveLength(2);
  });
});
