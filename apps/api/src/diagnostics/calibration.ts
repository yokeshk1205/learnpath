export type DiagnosticItemSampleState = "UNOBSERVED" | "FIELD_TEST" | "REPORTABLE";

export type DiagnosticItemWarning =
  | "UNOBSERVED"
  | "SMALL_SAMPLE"
  | "TOO_EASY"
  | "TOO_HARD"
  | "LOW_EMPIRICAL_DISCRIMINATION"
  | "AUTHOR_PRIOR_MISMATCH"
  | "HIGH_UNSURE_RATE"
  | "RAPID_RESPONSE_RISK";

export interface DiagnosticItemCalibrationInput {
  configuredDifficulty: number;
  empiricalDiscrimination: number | null;
  expectedResponseSeconds: number | null;
  meanResponseSeconds: number | null;
  responseCount: number;
  correctRate: number | null;
  unsureRate: number | null;
}

export interface DiagnosticItemCalibration {
  absoluteCalibrationError: number | null;
  authorExpectedCorrectRate: number;
  difficultyEstimate: number | null;
  empiricalDiscrimination: number | null;
  sampleState: DiagnosticItemSampleState;
  warnings: DiagnosticItemWarning[];
}

const clamp = (value: number): number => Math.max(0, Math.min(1, value));
const round = (value: number): number => Math.round(value * 10_000) / 10_000;

/**
 * The author prior is deliberately simple and visible. It maps the ordinal
 * one-to-five difficulty label to an expected success rate; it is not an IRT
 * parameter and is replaced only after a sample gate is met.
 */
export function authorExpectedCorrectRate(configuredDifficulty: number): number {
  return round(clamp(0.9 - (Math.max(1, Math.min(5, configuredDifficulty)) - 1) * 0.15));
}

export function describeDiagnosticItemCalibration(
  input: DiagnosticItemCalibrationInput,
  minimumResponses = 20,
): DiagnosticItemCalibration {
  const expected = authorExpectedCorrectRate(input.configuredDifficulty);
  const sampleState: DiagnosticItemSampleState = input.responseCount === 0
    ? "UNOBSERVED" : input.responseCount < minimumResponses ? "FIELD_TEST" : "REPORTABLE";
  const reportable = sampleState === "REPORTABLE";
  const correctRate = input.correctRate === null ? null : clamp(input.correctRate);
  const unsureRate = input.unsureRate === null ? null : clamp(input.unsureRate);
  const discrimination = reportable && input.empiricalDiscrimination !== null
    ? Math.max(-1, Math.min(1, input.empiricalDiscrimination)) : null;
  const warnings: DiagnosticItemWarning[] = [];

  if (sampleState === "UNOBSERVED") warnings.push("UNOBSERVED");
  else if (!reportable) warnings.push("SMALL_SAMPLE");
  if (reportable && correctRate !== null && correctRate > 0.9) warnings.push("TOO_EASY");
  if (reportable && correctRate !== null && correctRate < 0.2) warnings.push("TOO_HARD");
  if (reportable && discrimination !== null && discrimination < 0.15) {
    warnings.push("LOW_EMPIRICAL_DISCRIMINATION");
  }
  if (reportable && correctRate !== null && Math.abs(correctRate - expected) > 0.2) {
    warnings.push("AUTHOR_PRIOR_MISMATCH");
  }
  if (reportable && unsureRate !== null && unsureRate > 0.35) warnings.push("HIGH_UNSURE_RATE");
  if (
    reportable
    && input.expectedResponseSeconds !== null
    && input.meanResponseSeconds !== null
    && input.meanResponseSeconds < input.expectedResponseSeconds * 0.35
  ) warnings.push("RAPID_RESPONSE_RISK");

  return {
    absoluteCalibrationError: reportable && correctRate !== null
      ? round(Math.abs(correctRate - expected)) : null,
    authorExpectedCorrectRate: expected,
    difficultyEstimate: correctRate === null ? null : round(1 - correctRate),
    empiricalDiscrimination: discrimination === null ? null : round(discrimination),
    sampleState,
    warnings,
  };
}
