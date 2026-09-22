import type {
  DiagnosticQuestionCandidate,
  DiagnosticSelectionObservation,
} from "./selection.js";

export const diagnosticMinimumQuestions = 12;
export const diagnosticTargetQuestionRange = { maximum: 22, minimum: 16 } as const;
export const diagnosticMaximumQuestions = 28;

export type DiagnosticStoppingReason =
  | "BANK_EXHAUSTED"
  | "CRITICAL_GATEWAY_UNRESOLVED"
  | "EVIDENCE_SUFFICIENT"
  | "HIGH_IMPACT_CONTRADICTION"
  | "MAXIMUM_REACHED"
  | "MINIMUM_NOT_REACHED"
  | "STARTING_REGION_UNRESOLVED";

export interface DiagnosticStoppingDecision {
  criticalGatewayCount: number;
  observedSkillCount: number;
  requiredCoverageCount: number;
  shouldContinue: boolean;
  stoppingReason: DiagnosticStoppingReason;
  unresolvedGatewayCount: number;
}

interface SkillEvidenceState {
  applicationCount: number;
  correctCount: number;
  dependentCount: number;
  observationCount: number;
  recognized: boolean;
  skillId: string;
}

function recognized(candidate: DiagnosticQuestionCandidate): boolean {
  return !candidate.forceProbe && candidate.mastery !== null
    && candidate.mastery >= candidate.targetMastery
    && (candidate.confidence ?? 0) >= 0.7
    && candidate.retentionState !== "AT_RISK"
    && candidate.retentionState !== "CRITICAL";
}

function buildSkillStates(
  candidates: DiagnosticQuestionCandidate[],
  observations: DiagnosticSelectionObservation[],
): SkillEvidenceState[] {
  const grouped = new Map<string, DiagnosticQuestionCandidate[]>();
  for (const candidate of candidates) {
    const skill = grouped.get(candidate.skillId) ?? [];
    skill.push(candidate);
    grouped.set(candidate.skillId, skill);
  }
  return [...grouped.entries()].map(([skillId, skillCandidates]) => {
    const skillObservations = observations.filter((observation) => observation.skillId === skillId);
    return {
      applicationCount: skillObservations.filter((observation) =>
        observation.cognitiveLevel === "APPLY" || observation.cognitiveLevel === "ANALYZE").length,
      correctCount: skillObservations.filter((observation) => observation.isCorrect).length,
      dependentCount: Math.max(...skillCandidates.map((candidate) => candidate.dependentCount)),
      observationCount: skillObservations.length,
      recognized: skillCandidates.some(recognized),
      skillId,
    };
  });
}

function gatewayResolved(state: SkillEvidenceState): boolean {
  if (state.recognized) return true;
  if (state.observationCount < 2) return false;
  const mixed = state.correctCount > 0 && state.correctCount < state.observationCount;
  if (mixed && state.observationCount < 3) return false;
  // Two independent negative observations are sufficient to preserve a lock.
  // Positive evidence must include application or analysis before an unlock can
  // be treated as path-safe.
  return state.correctCount === 0 || state.applicationCount > 0;
}

export function evaluateDiagnosticStopping(
  candidates: DiagnosticQuestionCandidate[],
  observations: DiagnosticSelectionObservation[],
  maximumQuestions = diagnosticMaximumQuestions,
): DiagnosticStoppingDecision {
  const skillStates = buildSkillStates(candidates, observations);
  const availableQuestions = Math.min(maximumQuestions, candidates.length);
  const effectiveMinimum = Math.min(diagnosticMinimumQuestions, availableQuestions);
  const observedSkillCount = skillStates.filter((state) => state.observationCount > 0).length;
  const requiredCoverageCount = Math.min(
    skillStates.length,
    Math.max(8, Math.ceil(skillStates.length * 0.75)),
  );
  const criticalGateways = skillStates
    .filter((state) => state.dependentCount > 0)
    .sort((left, right) => right.dependentCount - left.dependentCount)
    .slice(0, 3);
  const unresolvedGateways = criticalGateways.filter((state) => !gatewayResolved(state));
  const highImpactContradictions = criticalGateways.filter((state) =>
    state.observationCount >= 2
      && state.correctCount > 0
      && state.correctCount < state.observationCount
      && state.observationCount < 3);
  const common = {
    criticalGatewayCount: criticalGateways.length,
    observedSkillCount,
    requiredCoverageCount,
    unresolvedGatewayCount: unresolvedGateways.length,
  };

  if (observations.length >= availableQuestions) return {
    ...common,
    shouldContinue: false,
    stoppingReason: observations.length >= maximumQuestions ? "MAXIMUM_REACHED" : "BANK_EXHAUSTED",
  };
  if (observations.length < effectiveMinimum) return {
    ...common, shouldContinue: true, stoppingReason: "MINIMUM_NOT_REACHED",
  };
  if (observedSkillCount < requiredCoverageCount) return {
    ...common, shouldContinue: true, stoppingReason: "STARTING_REGION_UNRESOLVED",
  };
  if (highImpactContradictions.length > 0) return {
    ...common, shouldContinue: true, stoppingReason: "HIGH_IMPACT_CONTRADICTION",
  };
  if (unresolvedGateways.length > 0) return {
    ...common, shouldContinue: true, stoppingReason: "CRITICAL_GATEWAY_UNRESOLVED",
  };
  return { ...common, shouldContinue: false, stoppingReason: "EVIDENCE_SUFFICIENT" };
}
