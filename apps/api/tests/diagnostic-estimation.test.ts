import { describe, expect, it } from "vitest";

import {
  calculateDiagnosticPerformance,
  calculateDiagnosticReliability,
  calculateEvidenceStrength,
  classifyDiagnosticSkill,
  masteryInterval,
  type DiagnosticMeasurement,
} from "../src/diagnostics/estimation.js";
import { updateMasteryFromEvidence } from "../src/mastery/service.js";

function measurement(overrides: Partial<DiagnosticMeasurement> = {}): DiagnosticMeasurement {
  return {
    cognitiveLevel: "UNDERSTAND",
    difficulty: 3,
    discrimination: 1,
    isCorrect: true,
    isUnsure: false,
    ...overrides,
  };
}

describe("evidence-bounded diagnostic estimation", () => {
  it("does not turn one correct answer into complete mastery", () => {
    const measurements = [measurement()];
    const performance = calculateDiagnosticPerformance(measurements);
    const reliability = calculateDiagnosticReliability(measurements);
    const mastery = updateMasteryFromEvidence(null, performance, "DIAGNOSTIC", reliability);

    expect(mastery).toBeGreaterThan(0.5);
    expect(mastery).toBeLessThan(0.7);
    expect(classifyDiagnosticSkill({
      confidence: 0.25, mastery, measurements, previousMastery: null,
      retentionState: "UNKNOWN", targetMastery: 0.7,
    })).toBe("PROBED");
  });

  it("requires varied application evidence before diagnostic mastery", () => {
    const measurements = [
      measurement({ cognitiveLevel: "REMEMBER", difficulty: 1 }),
      measurement({ cognitiveLevel: "UNDERSTAND", difficulty: 3 }),
      measurement({ cognitiveLevel: "APPLY", difficulty: 4 }),
    ];
    expect(classifyDiagnosticSkill({
      confidence: 0.72, mastery: 0.82, measurements, previousMastery: null,
      retentionState: "UNKNOWN", targetMastery: 0.7,
    })).toBe("MASTERED");
  });

  it("assigns stronger evidence to difficult application than easy recall", () => {
    const recall = calculateEvidenceStrength(measurement({ cognitiveLevel: "REMEMBER", difficulty: 1 }));
    const application = calculateEvidenceStrength(measurement({ cognitiveLevel: "APPLY", difficulty: 5 }));
    expect(application).toBeGreaterThan(recall);
  });

  it("keeps mixed evidence unresolved and returns a bounded interval", () => {
    const measurements = [measurement(), measurement({ cognitiveLevel: "APPLY", isCorrect: false })];
    expect(classifyDiagnosticSkill({
      confidence: 0.35, mastery: 0.6, measurements, previousMastery: null,
      retentionState: "UNKNOWN", targetMastery: 0.7,
    })).toBe("NEEDS_CONFIRMATION");
    const interval = masteryInterval(0.6, 0.35, 2);
    expect(interval.lowerBound).toBeLessThan(0.6);
    expect(interval.upperBound).toBeGreaterThan(0.6);
  });

  it("distinguishes forgotten prior knowledge from an ordinary unknown gap", () => {
    const measurements = [
      measurement({ cognitiveLevel: "REMEMBER", difficulty: 1, isCorrect: false }),
      measurement({ cognitiveLevel: "APPLY", difficulty: 2, isCorrect: false }),
    ];
    expect(classifyDiagnosticSkill({
      confidence: 0.62,
      mastery: 0.41,
      measurements,
      previousMastery: 0.82,
      retentionState: "AT_RISK",
      targetMastery: 0.7,
    })).toBe("FORGOTTEN");
    expect(classifyDiagnosticSkill({
      confidence: 0.3,
      mastery: 0.41,
      measurements,
      previousMastery: null,
      retentionState: "UNKNOWN",
      targetMastery: 0.7,
    })).toBe("GAP");
  });
});
