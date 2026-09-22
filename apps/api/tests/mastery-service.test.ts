import { describe, expect, it } from "vitest";

import {
  calculateConfidence,
  calculateDiagnosticScore,
  classifyEvidenceState,
  difficultyAdjustedScore,
  updateDiagnosticConfidence,
  updateMastery,
  updateMasteryFromEvidence,
} from "../src/mastery/service.js";

describe("diagnostic mastery policy", () => {
  it("weights harder questions more heavily within the tested skill", () => {
    const score = calculateDiagnosticScore([
      { difficulty: 1, isCorrect: true },
      { difficulty: 5, isCorrect: false },
    ]);

    expect(score).toBeCloseTo(0.4048, 4);
  });

  it("uses the first skill score as its mastery baseline", () => {
    expect(updateMastery(null, 0.72)).toBe(0.72);
  });

  it("blends later assessment evidence using the documented 60/40 update", () => {
    expect(updateMastery(0.8, 0.3)).toBe(0.6);
  });

  it("keeps first-diagnostic confidence cautious and increases it with later evidence", () => {
    const observations = [
      { difficulty: 2, isCorrect: true },
      { difficulty: 4, isCorrect: true },
    ];
    const initial = updateDiagnosticConfidence(null, observations);
    const repeated = updateDiagnosticConfidence(initial, observations);

    expect(initial).toBeGreaterThan(0);
    expect(initial).toBeLessThanOrEqual(0.45);
    expect(repeated).toBeGreaterThan(initial);
    expect(repeated).toBeLessThanOrEqual(1);
  });

  it("rewards a correct hard answer more than a correct easy answer", () => {
    expect(difficultyAdjustedScore({ difficulty: 5, isCorrect: true }))
      .toBeGreaterThan(difficultyAdjustedScore({ difficulty: 1, isCorrect: true }));
  });

  it("penalizes an incorrect easy answer more than an incorrect hard answer", () => {
    expect(difficultyAdjustedScore({ difficulty: 1, isCorrect: false }))
      .toBeLessThan(difficultyAdjustedScore({ difficulty: 5, isCorrect: false }));
  });

  it("keeps evidence-driven mastery inside probability bounds", () => {
    expect(updateMasteryFromEvidence(0.99, 4, "PRACTICE")).toBeLessThanOrEqual(1);
    expect(updateMasteryFromEvidence(0.01, -4, "ASSESSMENT")).toBeGreaterThanOrEqual(0);
  });

  it("grows confidence as observations and sessions accumulate", () => {
    const early = calculateConfidence({
      averageDifficulty: 2, consistency: 0.8, evidenceCount: 1,
      hasRetentionEvidence: false, sessionCount: 1, sourceDiversity: 1,
      sources: ["PRACTICE"],
    });
    const repeated = calculateConfidence({
      averageDifficulty: 3, consistency: 0.8, evidenceCount: 8,
      hasRetentionEvidence: false, sessionCount: 4, sourceDiversity: 2,
      sources: ["DIAGNOSTIC", "PRACTICE"],
    });
    expect(repeated).toBeGreaterThan(early);
  });

  it("does not verify a high mastery estimate backed by too little evidence", () => {
    const summary = {
      averageDifficulty: 5, consistency: 1, evidenceCount: 2,
      hasRetentionEvidence: false, sessionCount: 1, sourceDiversity: 1,
      sources: ["PRACTICE" as const],
    };
    expect(classifyEvidenceState(summary, 0.95)).toBe("ESTIMATED");
  });

  it("requires observation volume, sessions, confidence, consistency, and diversity to verify", () => {
    const summary = {
      averageDifficulty: 4, consistency: 0.9, evidenceCount: 14,
      hasRetentionEvidence: false, sessionCount: 5, sourceDiversity: 3,
      sources: ["DIAGNOSTIC" as const, "PRACTICE" as const, "ASSESSMENT" as const],
    };
    expect(classifyEvidenceState(summary, 0.82)).toBe("VERIFIED");
    expect(classifyEvidenceState({ ...summary, sourceDiversity: 2 }, 0.82)).toBe("ASSESSED");
  });
});
