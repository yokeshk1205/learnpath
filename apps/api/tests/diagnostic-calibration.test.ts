import { describe, expect, it } from "vitest";

import {
  authorExpectedCorrectRate,
  describeDiagnosticItemCalibration,
} from "../src/diagnostics/calibration.js";

describe("diagnostic item calibration", () => {
  it("keeps empirical claims behind a minimum sample gate", () => {
    const result = describeDiagnosticItemCalibration({
      configuredDifficulty: 3,
      correctRate: 0.9,
      empiricalDiscrimination: 0.02,
      expectedResponseSeconds: 60,
      meanResponseSeconds: 8,
      responseCount: 8,
      unsureRate: 0,
    });

    expect(result.sampleState).toBe("FIELD_TEST");
    expect(result.absoluteCalibrationError).toBeNull();
    expect(result.empiricalDiscrimination).toBeNull();
    expect(result.warnings).toEqual(["SMALL_SAMPLE"]);
  });

  it("flags reportable item-quality risks without changing the authored item", () => {
    const result = describeDiagnosticItemCalibration({
      configuredDifficulty: 5,
      correctRate: 0.94,
      empiricalDiscrimination: 0.08,
      expectedResponseSeconds: 100,
      meanResponseSeconds: 20,
      responseCount: 40,
      unsureRate: 0.4,
    });

    expect(result.sampleState).toBe("REPORTABLE");
    expect(result.warnings).toEqual([
      "TOO_EASY",
      "LOW_EMPIRICAL_DISCRIMINATION",
      "AUTHOR_PRIOR_MISMATCH",
      "HIGH_UNSURE_RATE",
      "RAPID_RESPONSE_RISK",
    ]);
    expect(result.absoluteCalibrationError).toBe(0.64);
  });

  it("publishes the transparent ordinal author-prior mapping", () => {
    expect([1, 2, 3, 4, 5].map(authorExpectedCorrectRate)).toEqual([0.9, 0.75, 0.6, 0.45, 0.3]);
  });
});
