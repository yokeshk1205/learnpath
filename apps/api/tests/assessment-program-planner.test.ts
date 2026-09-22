import { describe, expect, it } from "vitest";

import {
  assessmentModules,
  buildAssessmentBacklog,
  buildKnowledgeBoundary,
  describeAssessmentSkill,
  planAssessmentSession,
  summarizeAssessmentCoverage,
  type AssessmentSkillEvidence,
} from "../src/assessment-programs/planner.js";

function evidence(overrides: Partial<AssessmentSkillEvidence> = {}): AssessmentSkillEvidence {
  return {
    skillId: "skill-1", skillName: "Interpreting a source", category: "History",
    moduleId: "module-1", moduleName: "Sources", moduleSequence: 1, sequence: 1,
    mastery: null, confidence: null, evidenceState: "UNKNOWN", retentionState: "UNKNOWN",
    latestClassification: null, lastEvidenceAt: null, distinctQuestionCount: 0,
    applicationQuestionCount: 0, difficultyBandCount: 0,
    correctQuestionCount: 0,
    questionCount: 5, availableQuestionCount: 5, sessionCount: 0,
    dependentCount: 0,
    bankApplicationQuestionCount: 2, bankDifficultyBandCount: 2, evidenceCount: 0,
    ...overrides,
  };
}

describe("course-wide assessment coverage", () => {
  it("keeps not-tested knowledge distinct from a confirmed gap in the learner boundary", () => {
    const unknown = describeAssessmentSkill(evidence());
    const gap = describeAssessmentSkill(evidence({
      skillId: "gap", skillName: "Ratio reasoning", distinctQuestionCount: 2,
      evidenceCount: 2, latestClassification: "GAP", mastery: 0.25, confidence: 0.7,
    }));
    const boundary = buildKnowledgeBoundary([unknown, gap]);
    expect(boundary.skills).toEqual(expect.arrayContaining([
      expect.objectContaining({ skillId: "skill-1", status: "NOT_ASSESSED_YET", assessmentCoverage: "NOT_TESTED" }),
      expect.objectContaining({ skillId: "gap", status: "NEEDS_WORK", assessmentCoverage: "SUFFICIENT_EVIDENCE" }),
    ]));
    expect(boundary.pathReady).toBe(true);
  });

  it("prioritizes stale and contradictory evidence ahead of ordinary untested skills", () => {
    const items = buildAssessmentBacklog([
      describeAssessmentSkill(evidence({ skillId: "unknown" })),
      describeAssessmentSkill(evidence({ skillId: "gateway", dependentCount: 4 })),
      describeAssessmentSkill(evidence({ skillId: "stale", evidenceCount: 3, distinctQuestionCount: 3,
        retentionState: "CRITICAL", lastEvidenceAt: "2020-01-01T00:00:00Z" })),
    ]);
    expect(items[0]).toMatchObject({ skillId: "stale", reason: "RETENTION_RISK", status: "PENDING" });
    expect(items.find((item) => item.skillId === "gateway")).toMatchObject({ reason: "PREREQUISITE_GATEWAY" });
  });

  it("allows consistent cumulative diagnostic evidence to complete coverage at the existing confidence ceiling", () => {
    const skill = describeAssessmentSkill(evidence({
      distinctQuestionCount: 3, correctQuestionCount: 3, applicationQuestionCount: 1, difficultyBandCount: 2,
      evidenceCount: 3, confidence: 0.45, mastery: 0.85, latestClassification: "NEEDS_CONFIRMATION",
    }));
    expect(skill).toMatchObject({ coverageStatus: "ASSESSED", mastered: false, confidence: 0.45, mastery: 0.85 });
    expect(planAssessmentSession([skill], "COMPREHENSIVE")).toBeNull();
  });

  it("preserves independent contradictions despite a recent correct answer and many repeated sessions", () => {
    const skill = describeAssessmentSkill(evidence({
      distinctQuestionCount: 6, correctQuestionCount: 5, applicationQuestionCount: 2, difficultyBandCount: 3,
      evidenceCount: 40, sessionCount: 12, confidence: 0.45, mastery: 0.85,
      latestClassification: "PROBED", lastEvidenceAt: new Date().toISOString(),
    }));
    expect(skill).toMatchObject({ coverageStatus: "NEEDS_CONFIRMATION", mastered: false });
  });

  it("does not use the diagnostic coverage allowance for insufficient, low confidence, or recall-only evidence", () => {
    const positive = evidence({
      distinctQuestionCount: 3, correctQuestionCount: 3, applicationQuestionCount: 1, difficultyBandCount: 2,
      evidenceCount: 3, confidence: 0.45, mastery: 0.85,
    });
    for (const overrides of [
      { distinctQuestionCount: 1, correctQuestionCount: 1, evidenceCount: 100, sessionCount: 20 },
      { confidence: 0.44 }, { applicationQuestionCount: 0 }, { difficultyBandCount: 1 },
    ]) expect(describeAssessmentSkill({ ...positive, ...overrides }).coverageStatus).toBe("NEEDS_CONFIRMATION");
  });
  it("does not convert a high inferred mastery value or lack of observations into assessment coverage", () => {
    expect(describeAssessmentSkill(evidence({ mastery: 0.95, confidence: 0.9, evidenceState: "ESTIMATED" })))
      .toMatchObject({ coverageStatus: "UNASSESSED", mastered: false });
  });

  it("does not count repeated answers and repeated sessions as independent coverage", () => {
    const skill = describeAssessmentSkill(evidence({
      mastery: 0.95, confidence: 0.95, evidenceState: "ASSESSED", evidenceCount: 40,
      distinctQuestionCount: 1, difficultyBandCount: 1, applicationQuestionCount: 1, sessionCount: 12,
    }));
    expect(skill).toMatchObject({ coverageStatus: "NEEDS_CONFIRMATION", mastered: false, distinctQuestionCount: 1 });
    expect(summarizeAssessmentCoverage([skill])).toMatchObject({ observed: 1, assessed: 0, mastered: 0, needsConfirmation: 1 });
  });

  it("separates evidence sufficient to describe a gap from evidence of mastery", () => {
    const skill = describeAssessmentSkill(evidence({
      mastery: 0.3, confidence: 0.65, evidenceCount: 3, distinctQuestionCount: 3,
      difficultyBandCount: 2, applicationQuestionCount: 1, latestClassification: "GAP",
    }));
    expect(skill).toMatchObject({ coverageStatus: "ASSESSED", mastered: false });
    expect(summarizeAssessmentCoverage([skill])).toMatchObject({ assessedPercentage: 100, masteredPercentage: 0 });
  });

  it("accepts the existing engine's independently confirmed negative evidence", () => {
    expect(describeAssessmentSkill(evidence({
      mastery: 0.2, confidence: 0.4, evidenceCount: 2, distinctQuestionCount: 2, latestClassification: "GAP",
    }))).toMatchObject({ coverageStatus: "ASSESSED", mastered: false });
  });

  it("counts a freshly diagnosed weak skill as assessed, not as forgotten evidence", () => {
    const now = Date.parse("2026-09-09T10:00:00Z");
    const gap = evidence({ mastery: 0.1, confidence: 0.55, evidenceCount: 3,
      distinctQuestionCount: 3, latestClassification: "GAP", retentionState: "CRITICAL",
      lastEvidenceAt: "2026-09-09T09:59:00Z" });
    expect(describeAssessmentSkill(gap, now)).toMatchObject({ coverageStatus: "ASSESSED", mastered: false });
    expect(describeAssessmentSkill(gap, now + 48 * 60 * 60 * 1000)).toMatchObject({ coverageStatus: "NEEDS_REFRESH" });
  });

  it("keeps low confidence or recall-only observations in the confirmation backlog", () => {
    expect(describeAssessmentSkill(evidence({
      evidenceCount: 6, distinctQuestionCount: 6, mastery: 0.9, confidence: 0.8, difficultyBandCount: 2,
    })).coverageStatus).toBe("NEEDS_CONFIRMATION");
    expect(describeAssessmentSkill(evidence({
      evidenceCount: 3, distinctQuestionCount: 3, mastery: 0.9, confidence: 0.3,
      difficultyBandCount: 2, applicationQuestionCount: 1,
    })).coverageStatus).toBe("NEEDS_CONFIRMATION");
  });

  it("reuses strong existing evidence and requires refresh when retention is at risk", () => {
    const strong = evidence({
      mastery: 0.9, confidence: 0.85, evidenceCount: 12, distinctQuestionCount: 5,
      applicationQuestionCount: 2, difficultyBandCount: 3, evidenceState: "VERIFIED", retentionState: "STRONG",
    });
    expect(describeAssessmentSkill(strong)).toMatchObject({ coverageStatus: "ASSESSED", mastered: true });
    expect(planAssessmentSession([describeAssessmentSkill(strong)], "COMPREHENSIVE")).toBeNull();
    expect(describeAssessmentSkill({ ...strong, retentionState: "CRITICAL" }))
      .toMatchObject({ coverageStatus: "NEEDS_REFRESH", mastered: false });
  });

  it("keeps missing questions separate from an unassessed learner's knowledge", () => {
    const missing = describeAssessmentSkill(evidence({ questionCount: 0, availableQuestionCount: 0 }));
    expect(missing).toMatchObject({ coverageStatus: "UNASSESSED", bankStatus: "BLOCKED", mastery: null });
    expect(planAssessmentSession([missing], "COMPREHENSIVE")).toBeNull();
    expect(summarizeAssessmentCoverage([missing])).toMatchObject({ blocked: 1, unassessed: 1, assessed: 0 });
  });

  it("reports a thin bank and eventually blocks additional confirmation when independent questions run out", () => {
    const thin = evidence({ questionCount: 1, availableQuestionCount: 1, bankApplicationQuestionCount: 0, bankDifficultyBandCount: 1 });
    expect(describeAssessmentSkill(thin).bankStatus).toBe("LIMITED");
    const exhausted = describeAssessmentSkill({ ...thin, availableQuestionCount: 0, evidenceCount: 1, distinctQuestionCount: 1 });
    expect(exhausted).toMatchObject({ coverageStatus: "NEEDS_CONFIRMATION", bankStatus: "BLOCKED" });
    expect(planAssessmentSession([exhausted], "COMPREHENSIVE")).toBeNull();
  });

  it("preserves zero as zero rather than inventing a mastered empty course", () => {
    expect(summarizeAssessmentCoverage([])).toMatchObject({ totalSkills: 0, assessedPercentage: 0, masteredPercentage: 0 });
    expect(planAssessmentSession([], "COMPREHENSIVE")).toBeNull();
  });
});

describe("bounded sessions over a large curriculum", () => {
  it("reaches every skill in a 1,000-skill course without a program-level 28-question or session ceiling", () => {
    const skills = Array.from({ length: 1_000 }, (_, index) => describeAssessmentSkill(evidence({
      skillId: `skill-${index}`, skillName: `Skill ${index}`, moduleId: `module-${Math.floor(index / 40)}`,
      moduleName: `Module ${Math.floor(index / 40)}`, moduleSequence: Math.floor(index / 40) + 1, sequence: index % 40 + 1,
    })));
    const visited = new Set<string>();
    let sessions = 0;
    while (true) {
      const plan = planAssessmentSession(skills, "COMPREHENSIVE");
      if (!plan) break;
      expect(plan.focusSkillIds.length).toBeLessThanOrEqual(4);
      expect(plan.maximumQuestions).toBeLessThanOrEqual(28);
      for (const id of plan.focusSkillIds) {
        expect(visited.has(id)).toBe(false);
        visited.add(id);
        skills.find((skill) => skill.skillId === id)!.coverageStatus = "ASSESSED";
      }
      sessions += 1;
      if (sessions > 1_000) throw new Error("Planner failed to make progress");
    }
    expect(sessions).toBe(250);
    expect(visited.size).toBe(1_000);
  });

  it("reaches advanced unassessed modules before repeating uncertain foundations", () => {
    const foundation = describeAssessmentSkill(evidence({ evidenceCount: 1, distinctQuestionCount: 1, sessionCount: 3 }));
    const advanced = describeAssessmentSkill(evidence({ skillId: "advanced", moduleId: "advanced-module", moduleSequence: 20 }));
    expect(planAssessmentSession([foundation, advanced], "COMPREHENSIVE")?.focusSkillIds).toEqual(["advanced"]);
  });

  it("spreads quick placement across available modules while labeling it as a partial sample", () => {
    const skills = Array.from({ length: 12 }, (_, index) => describeAssessmentSkill(evidence({
      skillId: `skill-${index}`, moduleId: `module-${Math.floor(index / 4)}`, moduleSequence: Math.floor(index / 4) + 1,
      sequence: index % 4 + 1,
    })));
    const plan = planAssessmentSession(skills, "QUICK_PLACEMENT")!;
    expect(plan.focusSkillIds).toEqual(["skill-0", "skill-4", "skill-8", "skill-1"]);
    expect(plan.estimatedSessionCount).toBe(1);
    expect(plan.reason).toContain("Remaining skills");
  });

  it("samples a claimed known skill in quick placement so the claim can be verified", () => {
    const skills = [
      describeAssessmentSkill(evidence({ skillId: "intro", moduleId: "module-1", sequence: 1 })),
      describeAssessmentSkill(evidence({ skillId: "claimed", moduleId: "module-1", sequence: 2 })),
      describeAssessmentSkill(evidence({ skillId: "other", moduleId: "module-2", moduleSequence: 2, sequence: 1 })),
    ];
    const plan = planAssessmentSession(skills, "QUICK_PLACEMENT", new Map([
      ["intro", "NEVER_LEARNED"], ["claimed", "COMFORTABLE"], ["other", "UNSURE"],
    ]));
    expect(plan?.focusSkillIds[0]).toBe("claimed");
    expect(plan?.focusSkillIds).toContain("other");
  });

  it("summarizes every module and the four mutually exclusive coverage states", () => {
    const skills = [
      describeAssessmentSkill(evidence()),
      describeAssessmentSkill(evidence({ skillId: "probe", evidenceCount: 1, distinctQuestionCount: 1 })),
      describeAssessmentSkill(evidence({ skillId: "old", moduleId: "later", moduleSequence: 2, evidenceCount: 2, retentionState: "CRITICAL" })),
      describeAssessmentSkill(evidence({ skillId: "gap", evidenceCount: 2, distinctQuestionCount: 2, latestClassification: "GAP" })),
    ];
    const summary = summarizeAssessmentCoverage(skills);
    expect(summary.assessed + summary.needsConfirmation + summary.needsRefresh + summary.unassessed).toBe(summary.totalSkills);
    expect(assessmentModules(skills).map((module) => module.coverage.totalSkills)).toEqual([3, 1]);
  });

  it("includes late course regions in quick placement for a 30-module course", () => {
    const skills = Array.from({ length: 30 }, (_, index) => describeAssessmentSkill(evidence({
      skillId: `skill-${index}`, moduleId: `module-${index}`, moduleSequence: index + 1,
    })));
    expect(planAssessmentSession(skills, "QUICK_PLACEMENT")?.focusSkillIds)
      .toEqual(["skill-0", "skill-9", "skill-19", "skill-29"]);
  });
});
