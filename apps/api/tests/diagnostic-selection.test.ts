import { describe, expect, it } from "vitest";

import {
  diagnosticSelectionPolicyVersion,
  initializeDiagnosticSelection,
  selectNextDiagnosticQuestion,
  type DiagnosticQuestionCandidate,
  type DiagnosticSelectionObservation,
} from "../src/diagnostics/selection.js";

function question(overrides: Partial<DiagnosticQuestionCandidate>): DiagnosticQuestionCandidate {
  return {
    cognitiveLevel: "UNDERSTAND",
    confidence: null,
    contextSequence: 1,
    dependentCount: 0,
    difficulty: 2,
    discrimination: 1,
    exposureCount: 0,
    guessProbability: 0.25,
    mastery: null,
    misconceptionEvidenceCount: 0,
    misconceptionMapped: false,
    questionId: "question-1",
    retentionState: "UNKNOWN",
    skillId: "skill-1",
    skillName: "Arrays",
    targetMastery: 0.7,
    ...overrides,
  };
}

function observation(overrides: Partial<DiagnosticSelectionObservation>): DiagnosticSelectionObservation {
  return {
    cognitiveLevel: "UNDERSTAND",
    isCorrect: true,
    isUnsure: false,
    questionId: "first",
    sequence: 1,
    skillId: "gateway",
    ...overrides,
  };
}

describe("evidence-bounded adaptive diagnostic selection", () => {
  it("starts with one high-impact coverage probe and a fixed budget", () => {
    const selected = initializeDiagnosticSelection([
      question({ dependentCount: 4, questionId: "gateway-easy", skillId: "gateway", skillName: "Recursion" }),
      question({ cognitiveLevel: "APPLY", dependentCount: 4, difficulty: 3, questionId: "gateway-application", skillId: "gateway", skillName: "Recursion" }),
      question({ confidence: 0.8, mastery: 0.9, questionId: "known", skillId: "known", skillName: "Arrays", retentionState: "STRONG" }),
      question({ contextSequence: 3, questionId: "unknown", skillId: "unknown", skillName: "Functions" }),
    ]);

    expect(diagnosticSelectionPolicyVersion).toBe("curriculum-evidence-adaptive-v6");
    expect(selected.questionBudget).toBe(4);
    expect(selected.selected).toHaveLength(1);
    expect(selected.selected[0]).toMatchObject({ questionId: "gateway-application", stage: "COVERAGE" });
    expect(selected.recognizedSkillCount).toBe(1);
  });

  it("uses self-report only as a small prioritization signal and never as mastery", () => {
    const selected = initializeDiagnosticSelection([
      question({ questionId: "reported", skillId: "reported", skillName: "Reported skill", selfReportFamiliarity: "VERY_COMFORTABLE" }),
      question({ questionId: "unknown", skillId: "unknown", skillName: "Unknown skill" }),
    ]);
    expect(selected.selected[0]).toMatchObject({ questionId: "reported" });
    expect(selected.selected[0]?.reason).toMatch(/learner-reported familiarity/i);
    expect(selected.recognizedSkillCount).toBe(0);
  });

  it("uses a different skill for remaining coverage before confirming the first probe", () => {
    const candidates = [
      question({ questionId: "gateway-first", skillId: "gateway" }),
      question({ cognitiveLevel: "APPLY", questionId: "gateway-second", skillId: "gateway" }),
      question({ contextSequence: 2, questionId: "other-first", skillId: "other" }),
    ];
    const next = selectNextDiagnosticQuestion(candidates, {
      observations: [observation({ questionId: "gateway-first" })],
      selectedQuestionIds: ["gateway-first"],
    }, 2, 3);

    expect(next).toMatchObject({ questionId: "other-first", stage: "COVERAGE" });
  });

  it("uses curriculum roles in anchor, verification, then challenge order", () => {
    const candidates = [
      question({ diagnosticRole: "CHALLENGE", questionId: "challenge", skillId: "gateway" }),
      question({ diagnosticRole: "VERIFICATION", questionId: "application", skillId: "gateway" }),
      question({ diagnosticRole: "ANCHOR", questionId: "anchor", skillId: "gateway" }),
    ];
    const first = selectNextDiagnosticQuestion(candidates, {
      observations: [], selectedQuestionIds: [],
    }, 1, 3);
    expect(first?.questionId).toBe("anchor");

    const confirmation = selectNextDiagnosticQuestion(candidates, {
      observations: [observation({ questionId: "anchor" })],
      selectedQuestionIds: ["anchor"],
    }, 2, 3);
    expect(confirmation?.questionId).toBe("application");
  });

  it("verifies a learner-claimed known skill with application before a definition anchor", () => {
    const candidates = [
      question({ diagnosticRole: "ANCHOR", questionId: "known-anchor", selfReportFamiliarity: "COMFORTABLE" }),
      question({ cognitiveLevel: "APPLY", diagnosticRole: "VERIFICATION", questionId: "known-application", selfReportFamiliarity: "COMFORTABLE" }),
      question({ diagnosticRole: "ANCHOR", questionId: "unknown-anchor", skillId: "skill-2", selfReportFamiliarity: "NEVER_LEARNED" }),
      question({ cognitiveLevel: "APPLY", diagnosticRole: "VERIFICATION", questionId: "unknown-application", skillId: "skill-2", selfReportFamiliarity: "NEVER_LEARNED" }),
    ];
    const first = selectNextDiagnosticQuestion(candidates, {
      observations: [], selectedQuestionIds: [],
    }, 1, 4);
    expect(first?.questionId).toBe("known-application");
    const second = selectNextDiagnosticQuestion(candidates, {
      observations: [observation({ questionId: "known-application", skillId: "skill-1" })],
      selectedQuestionIds: ["known-application"],
    }, 2, 4);
    expect(second?.questionId).toBe("unknown-anchor");
  });

  it("reserves final slots for inconsistent evidence", () => {
    const candidates = [
      question({ questionId: "gateway-1", skillId: "gateway" }),
      question({ cognitiveLevel: "APPLY", questionId: "gateway-2", skillId: "gateway" }),
      question({ cognitiveLevel: "ANALYZE", questionId: "gateway-3", skillId: "gateway" }),
      question({ questionId: "other-1", skillId: "other" }),
    ];
    const observations = [
      observation({ isCorrect: true, questionId: "gateway-1", sequence: 1 }),
      observation({ cognitiveLevel: "APPLY", isCorrect: false, questionId: "gateway-2", sequence: 2 }),
    ];
    const next = selectNextDiagnosticQuestion(candidates, {
      observations,
      selectedQuestionIds: observations.map((item) => item.questionId),
    }, 3, 4);

    expect(next).toMatchObject({ questionId: "gateway-3", stage: "VERIFICATION" });
    expect(next?.reason).toMatch(/inconsistent evidence/i);
  });

  it("budgets one coverage probe per skill before targeted confirmation", () => {
    const candidates = Array.from({ length: 10 }, (_, skillIndex) => (
      Array.from({ length: 3 }, (_, questionIndex) => question({
        cognitiveLevel: questionIndex === 2 ? "APPLY" : "UNDERSTAND",
        contextSequence: skillIndex + 1,
        questionId: `skill-${skillIndex + 1}-question-${questionIndex + 1}`,
        skillId: `skill-${skillIndex + 1}`,
        skillName: `Skill ${skillIndex + 1}`,
      }))
    )).flat();

    const selected = initializeDiagnosticSelection(candidates);

    expect(selected.questionBudget).toBe(28);
    expect(selected.selected[0]?.stage).toBe("COVERAGE");
  });

  it("allows a fourth independent item when three observations are still mixed", () => {
    const candidates = [
      question({ cognitiveLevel: "REMEMBER", questionId: "mixed-1", skillId: "mixed" }),
      question({ cognitiveLevel: "UNDERSTAND", questionId: "mixed-2", skillId: "mixed" }),
      question({ cognitiveLevel: "APPLY", questionId: "mixed-3", skillId: "mixed" }),
      question({ cognitiveLevel: "ANALYZE", questionId: "mixed-4", skillId: "mixed" }),
    ];
    const observations = [
      observation({ cognitiveLevel: "REMEMBER", isCorrect: true, questionId: "mixed-1", skillId: "mixed" }),
      observation({ cognitiveLevel: "UNDERSTAND", isCorrect: false, questionId: "mixed-2", sequence: 2, skillId: "mixed" }),
      observation({ cognitiveLevel: "APPLY", isCorrect: true, questionId: "mixed-3", sequence: 3, skillId: "mixed" }),
    ];

    const next = selectNextDiagnosticQuestion(candidates, {
      observations,
      selectedQuestionIds: observations.map((item) => item.questionId),
    }, 4, 4);

    expect(next).toMatchObject({ questionId: "mixed-4", stage: "VERIFICATION" });
  });
});
