import { describe, expect, it } from "vitest";

import type {
  DiagnosticQuestionCandidate,
  DiagnosticSelectionObservation,
} from "../src/diagnostics/selection.js";
import { evaluateDiagnosticStopping } from "../src/diagnostics/stopping.js";

function candidates(skillCount = 12): DiagnosticQuestionCandidate[] {
  return Array.from({ length: skillCount }, (_, index) => Array.from({ length: 3 }, (_, question) => ({
    cognitiveLevel: question === 1 ? "APPLY" as const : "UNDERSTAND" as const,
    confidence: null,
    contextSequence: index + 1,
    dependentCount: index < 2 ? 4 - index : 0,
    difficulty: question + 2,
    discrimination: 1,
    exposureCount: 0,
    guessProbability: 0.25,
    mastery: null,
    misconceptionEvidenceCount: 0,
    misconceptionMapped: true,
    questionId: `q-${index}-${question}`,
    retentionState: "UNKNOWN" as const,
    skillId: `skill-${index}`,
    skillName: `Skill ${index}`,
    targetMastery: 0.7,
  }))).flat();
}

function observation(
  skillIndex: number,
  sequence: number,
  isCorrect = true,
  cognitiveLevel: DiagnosticSelectionObservation["cognitiveLevel"] = "UNDERSTAND",
): DiagnosticSelectionObservation {
  return {
    cognitiveLevel,
    isCorrect,
    isUnsure: false,
    questionId: `observed-${sequence}`,
    sequence,
    skillId: `skill-${skillIndex}`,
  };
}

describe("diagnostic evidence-sufficiency stopping", () => {
  it("continues before the minimum evidence count", () => {
    const result = evaluateDiagnosticStopping(candidates(), [observation(0, 1)]);
    expect(result).toMatchObject({ shouldContinue: true, stoppingReason: "MINIMUM_NOT_REACHED" });
  });

  it("stops once breadth and critical gateways are resolved", () => {
    const observations = Array.from({ length: 12 }, (_, index) => observation(index, index + 1, index !== 1));
    observations.push(observation(0, 13, true, "APPLY"));
    observations.push(observation(1, 14, false, "APPLY"));
    const result = evaluateDiagnosticStopping(candidates(), observations);
    expect(result).toMatchObject({ shouldContinue: false, stoppingReason: "EVIDENCE_SUFFICIENT" });
  });

  it("continues when a critical prerequisite has contradictory evidence", () => {
    const observations = Array.from({ length: 12 }, (_, index) => observation(index, index + 1));
    observations.push(observation(0, 13, false, "APPLY"));
    observations.push(observation(1, 14, true, "APPLY"));
    const result = evaluateDiagnosticStopping(candidates(), observations);
    expect(result).toMatchObject({ shouldContinue: true, stoppingReason: "HIGH_IMPACT_CONTRADICTION" });
  });
});
