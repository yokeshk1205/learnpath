import { describe, expect, it } from "vitest";

import { generateCandidateOverview } from "../src/candidates/engine.js";
import type { CandidateSkillSource } from "../src/candidates/types.js";
import { constructPath } from "../src/paths/engine.js";
import type { PrerequisiteSkillAnalysis } from "../src/prerequisites/types.js";

const context = {
  courseId: "course", courseName: "Algorithms", courseSlug: "algorithms",
  enrollmentId: "enrollment", enrollmentStatus: "ACTIVE" as const,
  goalId: null, goalName: null,
};

function prerequisite(input: Partial<PrerequisiteSkillAnalysis> & Pick<PrerequisiteSkillAnalysis, "id" | "name">): PrerequisiteSkillAnalysis {
  return {
    category: "Foundations", confidence: 0.4, contextGap: 0.4, courseContexts: [],
    currentMastery: 0.3, dependencyLevel: 0, description: `${input.name} description`,
    difficulty: 2, explanation: "Eligible", goalGap: null, isContextSkill: true,
    isCore: true, isGoalSkill: false, missingPrerequisites: [], prerequisites: [],
    relevance: 1, slug: input.name.toLowerCase().replaceAll(" ", "-"),
    status: "UNLOCKED", targetMastery: 0.7,
    ...input,
  };
}

function source(input: Partial<CandidateSkillSource> & { prerequisite: PrerequisiteSkillAnalysis }): CandidateSkillSource {
  return {
    courseSequence: 1, evidenceCount: 2, evidenceState: "ASSESSED", goalRelevance: null,
    module: { id: "module", name: "Module", progressStatus: "NOT_STARTED", sequence: 1 },
    popularity: { activityEvents: 1, courseContexts: 1, evidenceObservations: 2, observedLearners: 1 },
    practiceAvailable: true, resourceCount: 2, retention: 0.8,
    retentionState: "STRONG", revisionDue: false,
    ...input,
  };
}

describe("course-specific path construction", () => {
  it("uses ML probabilities among eligible skills and never assigns a score to locked skills", () => {
    const missing = {
      confidence: 0.3, courseContexts: [], currentMastery: 0.3, evidenceStatus: "KNOWN" as const,
      prerequisiteSkillId: "arrays", prerequisiteSkillName: "Arrays", recognizedAcrossCourses: false,
      relationshipType: "REQUIRED" as const, requiredMastery: 0.7, satisfied: false, shortfall: 0.4,
    };
    const candidates = generateCandidateOverview({ context, skills: [
      source({ courseSequence: 2, prerequisite: prerequisite({ id: "trees", name: "Trees" }) }),
      source({ courseSequence: 1, prerequisite: prerequisite({ id: "arrays", name: "Arrays" }) }),
      source({ prerequisite: prerequisite({ id: "graphs", missingPrerequisites: [missing], name: "Graphs", prerequisites: [missing], status: "LOCKED" }) }),
    ] });
    const path = constructPath({
      candidates,
      lastActivitySkillId: null,
      predictions: [
        { benefitProbability: 0.81, skillId: "trees" },
        { benefitProbability: 0.62, skillId: "arrays" },
      ],
    });

    expect(path.find((item) => item.lane === "RECOMMENDED_NEXT")).toMatchObject({
      benefitProbability: 0.81, skillId: "trees",
    });
    expect(path.find((item) => item.skillId === "graphs")).toMatchObject({
      benefitProbability: null, lane: "LOCKED", priorityScore: null,
    });
    expect(path.find((item) => item.skillId === "graphs")?.explanation).toContain("Not sent to the ML model");
  });

  it("shows globally known skills as recognized without marking module completion", () => {
    const candidates = generateCandidateOverview({ context, skills: [source({
      prerequisite: prerequisite({ currentMastery: 0.88, id: "recursion", name: "Recursion", status: "MASTERED" }),
    })] });
    const path = constructPath({ candidates, lastActivitySkillId: null, predictions: [] });

    expect(path[0]).toMatchObject({ lane: "RECOGNIZED", skillId: "recursion" });
    expect(path[0]?.explanation).toContain("without claiming the course module is complete");
  });

  it("applies the documented retention bonus after prediction rather than changing eligibility", () => {
    const candidates = generateCandidateOverview({ context, skills: [
      source({ prerequisite: prerequisite({ id: "new", name: "New skill" }) }),
      source({ prerequisite: prerequisite({ currentMastery: 0.8, id: "revise", name: "Revise" }), retention: 0.28, retentionState: "CRITICAL", revisionDue: true }),
    ] });
    const path = constructPath({
      candidates, lastActivitySkillId: null,
      predictions: [
        { benefitProbability: 0.65, skillId: "new" },
        { benefitProbability: 0.6, skillId: "revise" },
      ],
    });

    expect(path.find((item) => item.lane === "RECOMMENDED_NEXT")).toMatchObject({
      candidateKind: "REVISION", priorityScore: 0.68, skillId: "revise",
    });
  });

  it("uses bounded NetworkX gateway utility without bypassing graph eligibility", () => {
    const candidates = generateCandidateOverview({ context, skills: [
      source({ prerequisite: prerequisite({
        graphMetrics: {
          betweennessCentrality: 0.5, directDependentCount: 2, downstreamSkillCount: 4,
          foundationRoute: ["gateway"], gatewayScore: 1, unlockableSkills: [],
        },
        id: "gateway", name: "Gateway",
      }) }),
      source({ prerequisite: prerequisite({ id: "isolated", name: "Isolated" }) }),
    ] });
    const path = constructPath({
      candidates, lastActivitySkillId: null,
      predictions: [
        { benefitProbability: 0.6, skillId: "gateway" },
        { benefitProbability: 0.64, skillId: "isolated" },
      ],
    });
    const next = path.find((item) => item.lane === "RECOMMENDED_NEXT")!;

    expect(next).toMatchObject({ priorityScore: 0.66, skillId: "gateway" });
    expect(next.reasonCodes).toContain("NETWORKX_GATEWAY_PRIORITY");
  });
});
