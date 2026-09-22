import {
  masteryPolicy,
  type EvidenceSourceType,
  type EvidenceState,
} from "./policy.js";

export interface DiagnosticObservation {
  difficulty: number;
  isCorrect: boolean;
}

export interface EvidenceSummary {
  averageDifficulty: number;
  consistency: number;
  evidenceCount: number;
  hasRetentionEvidence: boolean;
  sessionCount: number;
  sourceDiversity: number;
  sources: EvidenceSourceType[];
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

export function calculateDiagnosticScore(observations: DiagnosticObservation[]): number {
  if (!observations.length) return 0;
  const totalWeight = observations.reduce(
    (total, observation) => total + 0.75 + observation.difficulty * 0.1,
    0,
  );
  const earnedWeight = observations.reduce(
    (total, observation) => total + (observation.isCorrect ? 0.75 + observation.difficulty * 0.1 : 0),
    0,
  );
  return round(clamp(earnedWeight / totalWeight));
}

export function updateMastery(previousMastery: number | null, assessmentScore: number): number {
  if (previousMastery === null) return round(clamp(assessmentScore));
  return round(clamp(previousMastery * 0.6 + assessmentScore * 0.4));
}

export function difficultyAdjustedScore(observation: DiagnosticObservation): number {
  const difficulty = Math.max(1, Math.min(5, observation.difficulty));
  return round(observation.isCorrect
    ? 0.82 + (difficulty - 1) * 0.04
    : 0.02 + (difficulty - 1) * 0.04);
}

export function updateMasteryFromEvidence(
  previousMastery: number | null,
  performanceScore: number,
  sourceType: EvidenceSourceType,
  reliability = 1,
): number {
  const performance = clamp(performanceScore);
  const boundedReliability = clamp(reliability);
  const startingMastery = previousMastery ?? 0.5;
  const sourceWeight = previousMastery === null ? 1 : masteryPolicy.sourceWeights[sourceType];
  const effectiveWeight = sourceWeight * boundedReliability;
  return round(clamp(startingMastery * (1 - effectiveWeight) + performance * effectiveWeight));
}

export function calculateConfidence(summary: EvidenceSummary): number {
  if (!summary.evidenceCount) return 0;
  const countSignal = 0.45 * (1 - Math.exp(-summary.evidenceCount / 6));
  const diversitySignal = Math.min(summary.sourceDiversity, 3) * 0.05;
  const sessionSignal = Math.min(summary.sessionCount / 4, 1) * 0.12;
  const difficultySignal = Math.min(summary.averageDifficulty / 5, 1) * 0.06;
  const consistencySignal = clamp(summary.consistency) * 0.12;
  const retentionSignal = summary.hasRetentionEvidence ? 0.1 : 0;
  let confidence = 0.08 + countSignal + diversitySignal + sessionSignal
    + difficultySignal + consistencySignal + retentionSignal;
  if (summary.sources.every((source) => source === "DIAGNOSTIC")) {
    confidence = Math.min(confidence, masteryPolicy.confidence.diagnosticCeiling);
  }
  return round(clamp(confidence));
}

export function classifyEvidenceState(
  summary: EvidenceSummary,
  confidence: number,
): EvidenceState {
  if (!summary.evidenceCount) return "UNKNOWN";
  const verifiedDiversity = summary.hasRetentionEvidence
    || (summary.sourceDiversity >= 3 && summary.sessionCount >= 5);
  if (
    summary.evidenceCount >= masteryPolicy.evidence.verifiedMinimumObservations
    && summary.sessionCount >= masteryPolicy.evidence.verifiedMinimumSessions
    && summary.consistency >= masteryPolicy.evidence.verifiedMinimumConsistency
    && confidence >= masteryPolicy.confidence.verifiedMinimum
    && verifiedDiversity
  ) return "VERIFIED";
  if (
    summary.evidenceCount >= masteryPolicy.evidence.assessedMinimumObservations
    && summary.sessionCount >= masteryPolicy.evidence.assessedMinimumSessions
    && confidence >= masteryPolicy.confidence.assessedMinimum
  ) return "ASSESSED";
  return "ESTIMATED";
}

export function updateDiagnosticConfidence(
  previousConfidence: number | null,
  observations: DiagnosticObservation[],
): number {
  if (!observations.length) return previousConfidence ?? 0;
  const correctRate = observations.filter((observation) => observation.isCorrect).length / observations.length;
  const consistency = Math.abs(correctRate - 0.5) * 2;
  const averageDifficulty = observations.reduce(
    (total, observation) => total + observation.difficulty,
    0,
  ) / observations.length / 5;

  if (previousConfidence === null) {
    const initial = 0.18 + Math.min(observations.length, 3) * 0.06
      + averageDifficulty * 0.05 + consistency * 0.04;
    return round(Math.min(0.45, initial));
  }

  const gainRate = 0.08 + consistency * 0.04 + averageDifficulty * 0.02;
  return round(clamp(previousConfidence + (1 - previousConfidence) * gainRate));
}
