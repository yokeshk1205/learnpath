export type DiagnosticClassification =
  | "MASTERED"
  | "READY"
  | "GAP"
  | "FORGOTTEN"
  | "FRAGILE_FOUNDATION"
  | "NEEDS_CONFIRMATION"
  | "PROBED"
  | "NOT_TESTED";

export type DiagnosticCognitiveLevel = "ANALYZE" | "APPLY" | "REMEMBER" | "UNDERSTAND";

export interface DiagnosticMeasurement {
  cognitiveLevel: DiagnosticCognitiveLevel;
  difficulty: number;
  discrimination: number;
  guessProbability?: number;
  isCorrect: boolean;
  isUnsure: boolean;
}

export const diagnosticClassificationThresholds = {
  gapMasteryMaximum: 0.5,
  masteredConfidenceMinimum: 0.7,
  masteredMasteryMinimum: 0.8,
  readyConfidenceMinimum: 0.5,
  readyMasteryMinimum: 0.65,
} as const;

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function measurementValue(measurement: DiagnosticMeasurement): number {
  const difficulty = Math.max(1, Math.min(5, measurement.difficulty));
  if (measurement.isCorrect) return 0.72 + difficulty * 0.05;
  if (measurement.isUnsure) return 0.12 + difficulty * 0.035;
  return 0.03 + difficulty * 0.05;
}

export function calculateEvidenceStrength(measurement: DiagnosticMeasurement): number {
  const difficultyWeight = 0.55 + Math.max(1, Math.min(5, measurement.difficulty)) * 0.09;
  const discriminationWeight = Math.max(0.25, Math.min(2.5, measurement.discrimination)) / 1.5;
  const cognitiveWeight = measurement.cognitiveLevel === "ANALYZE" ? 1
    : measurement.cognitiveLevel === "APPLY" ? 0.92
      : measurement.cognitiveLevel === "UNDERSTAND" ? 0.76 : 0.62;
  const guessAdjustment = measurement.isCorrect ? 1 - (measurement.guessProbability ?? 0.25) : 1;
  const certaintyAdjustment = measurement.isUnsure ? 0.72 : 1;
  return round(clamp(
    difficultyWeight * discriminationWeight * cognitiveWeight * guessAdjustment * certaintyAdjustment,
  ));
}

export function calculateDiagnosticPerformance(
  measurements: DiagnosticMeasurement[],
): number {
  if (!measurements.length) return 0.5;
  const totalWeight = measurements.reduce(
    (total, measurement) => total + Math.max(0.1, calculateEvidenceStrength(measurement)),
    0,
  );
  const performance = measurements.reduce(
    (total, measurement) => total
      + measurementValue(measurement) * Math.max(0.1, calculateEvidenceStrength(measurement)),
    0,
  ) / totalWeight;
  return round(clamp(performance));
}

/**
 * A diagnostic is a placement estimate, not certification. Reliability grows
 * only when independent observations and application evidence agree. The cap
 * keeps a single diagnostic session from becoming conclusive evidence.
 */
export function calculateDiagnosticReliability(
  measurements: DiagnosticMeasurement[],
): number {
  if (!measurements.length) return 0;
  const cognitiveLevels = new Set(measurements.map((measurement) => measurement.cognitiveLevel));
  const applicationCount = measurements.filter(
    (measurement) => measurement.cognitiveLevel === "APPLY" || measurement.cognitiveLevel === "ANALYZE",
  ).length;
  const correctCount = measurements.filter((measurement) => measurement.isCorrect).length;
  const consistency = correctCount === 0 || correctCount === measurements.length ? 1 : 0;
  return round(Math.min(0.78,
    Math.min(measurements.length, 3) * 0.16
      + Math.min(cognitiveLevels.size, 3) * 0.06
      + (applicationCount > 0 ? 0.08 : 0)
      + consistency * 0.06));
}

export function masteryInterval(
  mastery: number,
  confidence: number,
  observationCount: number,
): { lowerBound: number; upperBound: number } {
  const width = 0.06 + (1 - clamp(confidence)) * 0.22
    / Math.sqrt(Math.max(1, observationCount));
  return {
    lowerBound: round(clamp(mastery - width)),
    upperBound: round(clamp(mastery + width)),
  };
}

export function classifyDiagnosticSkill(input: {
  confidence: number;
  mastery: number;
  measurements: DiagnosticMeasurement[];
  previousMastery: number | null;
  retentionState: "AT_RISK" | "CRITICAL" | "MODERATE" | "STRONG" | "UNKNOWN";
  targetMastery: number;
}): DiagnosticClassification {
  const { measurements } = input;
  if (!measurements.length) return "NOT_TESTED";
  if (measurements.length === 1) return "PROBED";
  const correctCount = measurements.filter((measurement) => measurement.isCorrect).length;
  const negativeCount = measurements.filter((measurement) => !measurement.isCorrect).length;
  const cognitiveLevels = new Set(measurements.map((measurement) => measurement.cognitiveLevel));
  const applicationCorrect = measurements.some((measurement) => measurement.isCorrect
    && (measurement.cognitiveLevel === "APPLY" || measurement.cognitiveLevel === "ANALYZE"));
  const inconsistent = correctCount > 0 && correctCount < measurements.length;
  const performance = calculateDiagnosticPerformance(measurements);

  if (
    input.previousMastery !== null
    && input.previousMastery >= input.targetMastery
    && (input.retentionState === "AT_RISK" || input.retentionState === "CRITICAL")
    && performance < 0.45
  ) return "FORGOTTEN";
  if (inconsistent) return "NEEDS_CONFIRMATION";
  if (
    measurements.length >= 3
    && applicationCorrect
    && cognitiveLevels.size >= 2
    && input.mastery >= Math.max(input.targetMastery, diagnosticClassificationThresholds.masteredMasteryMinimum)
    && input.confidence >= diagnosticClassificationThresholds.masteredConfidenceMinimum
  ) return "MASTERED";
  if (
    input.mastery >= diagnosticClassificationThresholds.readyMasteryMinimum
    && input.confidence >= diagnosticClassificationThresholds.readyConfidenceMinimum
    && correctCount >= 2
  ) return "READY";
  if (
    input.mastery < diagnosticClassificationThresholds.gapMasteryMaximum
    && negativeCount >= 2
    && correctCount === 0
  ) return "GAP";
  return "NEEDS_CONFIRMATION";
}

export function diagnosticDecisionReason(input: {
  classification: DiagnosticClassification;
  measurements: DiagnosticMeasurement[];
}): string {
  const applicationCount = input.measurements.filter((measurement) =>
    measurement.cognitiveLevel === "APPLY" || measurement.cognitiveLevel === "ANALYZE").length;
  const correctCount = input.measurements.filter((measurement) => measurement.isCorrect).length;
  const levels = new Set(input.measurements.map((measurement) => measurement.cognitiveLevel)).size;
  const facts = `${input.measurements.length} independent observation${input.measurements.length === 1 ? "" : "s"}, ${correctCount} correct, ${applicationCount} application-level, across ${levels} cognitive level${levels === 1 ? "" : "s"}`;
  switch (input.classification) {
    case "MASTERED": return `Repeated and varied evidence supports mastery: ${facts}.`;
    case "READY": return `The evidence is sufficient to continue, but not yet strong enough to certify mastery: ${facts}.`;
    case "GAP": return `Repeated negative evidence indicates a foundation gap: ${facts}.`;
    case "FORGOTTEN": return `Earlier strong knowledge was not reproduced in this retention-sensitive check: ${facts}.`;
    case "FRAGILE_FOUNDATION": return `Advanced performance was observed, but a required prerequisite remains weak: ${facts}.`;
    case "PROBED": return `This is an initial probe only; one answer cannot establish mastery: ${facts}.`;
    case "NOT_TESTED": return "No direct evidence was collected in this diagnostic.";
    default: return `Evidence is limited or contradictory, so the skill remains open for confirmation: ${facts}.`;
  }
}
