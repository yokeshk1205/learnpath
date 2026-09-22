import { describe, expect, it } from "vitest";

import { generateCandidateOverview } from "../src/candidates/engine.js";
import type { CandidateSkillSource } from "../src/candidates/types.js";
import type { PrerequisiteSkillAnalysis } from "../src/prerequisites/types.js";

const context = {
  courseId: "course", courseName: "Algorithms", courseSlug: "algorithms",
  enrollmentId: "enrollment", enrollmentStatus: "ACTIVE" as const,
  goalId: null, goalName: null,
};

function prerequisite(input: Partial<PrerequisiteSkillAnalysis> & Pick<PrerequisiteSkillAnalysis, "id" | "name">): PrerequisiteSkillAnalysis {
  return {
    category: "Foundations", confidence: null, contextGap: null, courseContexts: [],
    currentMastery: null, dependencyLevel: 0, description: `${input.name} description`,
    difficulty: 1, explanation: "Eligible", goalGap: null, isContextSkill: true,
    isCore: true, isGoalSkill: false, missingPrerequisites: [], prerequisites: [],
    relevance: 1, slug: input.name.toLowerCase().replaceAll(" ", "-"),
    status: "UNLOCKED", targetMastery: 0.7,
    ...input,
  };
}

function source(input: Partial<CandidateSkillSource> & { prerequisite: PrerequisiteSkillAnalysis }): CandidateSkillSource {
  return {
    courseSequence: 1, evidenceCount: 0, evidenceState: "UNKNOWN", goalRelevance: null,
    module: { id: "module", name: "Module", progressStatus: "NOT_STARTED", sequence: 1 },
    popularity: { activityEvents: 0, courseContexts: 1, evidenceObservations: 0, observedLearners: 0 },
    practiceAvailable: true, resourceCount: 1, retention: null,
    retentionState: "UNKNOWN", revisionDue: false,
    ...input,
  };
}

describe("candidate generation engine", () => {
  it("separates eligible, locked, and already-strong course skills", () => {
    const missing = {
      confidence: null, courseContexts: [], currentMastery: 0.3, evidenceStatus: "KNOWN" as const,
      prerequisiteSkillId: "arrays", prerequisiteSkillName: "Arrays", recognizedAcrossCourses: false,
      relationshipType: "REQUIRED" as const, requiredMastery: 0.7, satisfied: false, shortfall: 0.4,
    };
    const overview = generateCandidateOverview({ context, skills: [
      source({ prerequisite: prerequisite({ id: "unknown", name: "Unknown" }) }),
      source({ prerequisite: prerequisite({ id: "locked", missingPrerequisites: [missing], name: "Locked", prerequisites: [missing], status: "LOCKED" }) }),
      source({ evidenceCount: 4, evidenceState: "ASSESSED", prerequisite: prerequisite({ currentMastery: 0.8, id: "strong", name: "Strong", status: "MASTERED" }), retention: 0.78, retentionState: "STRONG" }),
    ] });

    expect(overview.candidates.eligible.map((skill) => skill.id)).toEqual(["unknown"]);
    expect(overview.candidates.locked[0]).toMatchObject({ id: "locked", status: "LOCKED" });
    expect(overview.candidates.excluded[0]).toMatchObject({ exclusionReason: "STRONG_MASTERY", id: "strong" });
  });

  it("restores a mastered skill as an eligible revision candidate when retention is due", () => {
    const overview = generateCandidateOverview({ context, skills: [source({
      evidenceCount: 8, evidenceState: "ASSESSED",
      prerequisite: prerequisite({ currentMastery: 0.86, id: "recursion", name: "Recursion", status: "MASTERED" }),
      retention: 0.28, retentionState: "CRITICAL", revisionDue: true,
    })] });

    expect(overview.candidates.eligible[0]!).toMatchObject({
      id: "recursion", kind: "REVISION", masteryGap: 0, revisionDue: true,
    });
    expect(overview.summary.revisionCandidates).toBe(1);
  });

  it("includes unmastered prerequisite ancestors as supporting candidates", () => {
    const overview = generateCandidateOverview({ context, skills: [source({
      courseSequence: null, module: null,
      prerequisite: prerequisite({ id: "math", isContextSkill: false, isCore: false, name: "Discrete Math" }),
    })] });

    expect(overview.candidates.eligible[0]).toMatchObject({
      isContextSkill: false, kind: "SUPPORTING_PREREQUISITE", module: null,
    });
  });

  it("builds honest evaluation baselines from gap and observed popularity only", () => {
    const overview = generateCandidateOverview({ context, skills: [
      source({ prerequisite: prerequisite({ currentMastery: 0.2, id: "large-gap", name: "Large Gap" }) }),
      source({ popularity: { activityEvents: 12, courseContexts: 3, evidenceObservations: 9, observedLearners: 5 }, prerequisite: prerequisite({ currentMastery: 0.55, id: "popular", name: "Popular" }) }),
      source({ prerequisite: prerequisite({ id: "unknown", name: "Unknown" }) }),
    ] });

    expect(overview.baselines.highestSkillGap.ranking.map((item) => item.skillId)).toEqual([
      "large-gap", "popular", "unknown",
    ]);
    expect(overview.baselines.popularity.ranking[0]!.skillId).toBe("popular");
    expect(overview.baselines.disclaimer).toContain("not ML predictions");
    expect(overview.baselines.topKOverlap).toBe(3);
  });
});
