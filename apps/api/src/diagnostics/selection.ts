import type { DiagnosticCognitiveLevel } from "./estimation.js";

export const diagnosticSelectionPolicyVersion = "curriculum-evidence-adaptive-v6";
export const maximumDiagnosticQuestions = 28;
const anchorQuestionCount = 8;

export const diagnosticQuestionValueWeights = {
  courseRelevance: 0.1,
  decisionImpact: 0.15,
  evidenceDiversity: 0.07,
  gateway: 0.15,
  informationGain: 0.25,
  misconceptionValue: 0.05,
  retentionRisk: 0.08,
  uncertainty: 0.15,
  selfReportPriority: 0.05,
} as const;

export interface DiagnosticQuestionCandidate {
  forceProbe?: boolean;
  cognitiveLevel: DiagnosticCognitiveLevel;
  confidence: number | null;
  contextSequence: number;
  dependentCount: number;
  diagnosticRole?: "ANCHOR" | "CHALLENGE" | "VERIFICATION";
  difficulty: number;
  discrimination: number;
  exposureCount: number;
  guessProbability: number;
  mastery: number | null;
  misconceptionEvidenceCount: number;
  misconceptionMapped: boolean;
  questionId: string;
  retentionState: "AT_RISK" | "CRITICAL" | "MODERATE" | "STRONG" | "UNKNOWN";
  skillId: string;
  skillName: string;
  targetMastery: number;
  selfReportFamiliarity?: "NEVER_LEARNED" | "KNOW_A_LITTLE" | "COMFORTABLE" | "VERY_COMFORTABLE" | "UNSURE" | null;
  selfReportConfidence?: "LOW" | "MEDIUM" | "HIGH" | null;
}

export interface DiagnosticSelectionObservation {
  cognitiveLevel: DiagnosticCognitiveLevel;
  isCorrect: boolean;
  isUnsure: boolean;
  misconceptionCode?: string | null;
  questionId: string;
  sequence: number;
  skillId: string;
}

export type DiagnosticSelectionStage = "CONFIRMATION" | "COVERAGE" | "VERIFICATION";

export interface SelectedDiagnosticQuestion {
  components: DiagnosticSelectionComponents;
  questionId: string;
  reason: string;
  score: number;
  skillId: string;
  stage: DiagnosticSelectionStage;
}

export interface DiagnosticSelectionComponents {
  courseRelevance: number;
  decisionImpact: number;
  evidenceDiversity: number;
  exposurePenalty: number;
  gateway: number;
  informationGain: number;
  misconceptionValue: number;
  retentionRisk: number;
  topicSwitchPenalty: number;
  uncertainty: number;
  selfReportPriority: number;
}

export interface DiagnosticSelection {
  questionBudget: number;
  recognizedSkillCount: number;
  selected: SelectedDiagnosticQuestion[];
  selectedSkillCount: number;
  skippedSkillCount: number;
  templateQuestionCount: number;
}

export interface DiagnosticSelectionState {
  observations: DiagnosticSelectionObservation[];
  selectedQuestionIds: string[];
}

export function isRecognized(candidate: DiagnosticQuestionCandidate): boolean {
  return !candidate.forceProbe && candidate.mastery !== null
    && candidate.mastery >= candidate.targetMastery
    && (candidate.confidence ?? 0) >= 0.7
    && candidate.retentionState !== "AT_RISK"
    && candidate.retentionState !== "CRITICAL";
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function desiredDifficulty(candidate: DiagnosticQuestionCandidate): number {
  if (candidate.mastery === null) return Math.min(3, Math.max(1, candidate.difficulty));
  if (candidate.mastery < 0.4) return 2;
  if (candidate.mastery < 0.7) return 3;
  return 4;
}

function stageFor(
  sequence: number,
  budget: number,
  skillCount: number,
  observations: DiagnosticSelectionObservation[],
): DiagnosticSelectionStage {
  if (sequence <= Math.min(anchorQuestionCount, skillCount, budget)) return "COVERAGE";
  const contradictoryGateway = observations.some((observation) => {
    const related = observations.filter((item) => item.skillId === observation.skillId);
    const correct = related.filter((item) => item.isCorrect).length;
    return related.length >= 2 && correct > 0 && correct < related.length;
  });
  if (contradictoryGateway || sequence >= Math.min(22, budget)) return "VERIFICATION";
  return "CONFIRMATION";
}

function reasonFor(
  candidate: DiagnosticQuestionCandidate,
  stage: DiagnosticSelectionStage,
  observations: DiagnosticSelectionObservation[],
): string {
  const skillObservations = observations.filter((observation) => observation.skillId === candidate.skillId);
  if (stage === "COVERAGE") {
    if (candidate.selfReportFamiliarity === "VERY_COMFORTABLE" || candidate.selfReportFamiliarity === "COMFORTABLE") {
      return `Verifies learner-reported familiarity with ${candidate.skillName}`;
    }
    if (candidate.selfReportFamiliarity === "NEVER_LEARNED") {
      return `Checks the reported starting boundary near ${candidate.skillName}`;
    }
    if (isRecognized(candidate)) return `Spot-checks reusable knowledge in ${candidate.skillName}`;
    if (candidate.retentionState === "AT_RISK" || candidate.retentionState === "CRITICAL") {
      return `Checks whether ${candidate.skillName} is still retained`;
    }
    if (candidate.mastery === null && candidate.dependentCount > 0) {
      return `Probes an unknown gateway that supports ${candidate.dependentCount} later skill${candidate.dependentCount === 1 ? "" : "s"}`;
    }
    return candidate.mastery === null
      ? `Establishes an initial probe for ${candidate.skillName}`
      : `Checks the current evidence boundary for ${candidate.skillName}`;
  }
  const correct = skillObservations.filter((observation) => observation.isCorrect).length;
  if (stage === "VERIFICATION") {
    if (correct > 0 && correct < skillObservations.length) {
      return "Resolves inconsistent evidence without interrupting the earlier diagnostic flow";
    }
    if (!skillObservations.some((observation) => observation.cognitiveLevel === "APPLY"
      || observation.cognitiveLevel === "ANALYZE")) {
      return `Verifies ${candidate.skillName} with an application-level item`;
    }
    return `Performs a final independent confidence check for ${candidate.skillName}`;
  }
  if (skillObservations.length === 1) {
    return `Confirms the initial ${candidate.skillName} probe with independent evidence`;
  }
  if (correct > 0 && correct < skillObservations.length) {
    return `Investigates mixed evidence for ${candidate.skillName}`;
  }
  return `Reduces uncertainty in the current ${candidate.skillName} estimate`;
}

function candidateScore(
  candidate: DiagnosticQuestionCandidate,
  state: DiagnosticSelectionState,
  stage: DiagnosticSelectionStage,
): { components: DiagnosticSelectionComponents; score: number } {
  const observations = state.observations.filter((observation) => observation.skillId === candidate.skillId);
  const correct = observations.filter((observation) => observation.isCorrect).length;
  const mixed = correct > 0 && correct < observations.length;
  const cognitiveNovelty = observations.some(
    (observation) => observation.cognitiveLevel === candidate.cognitiveLevel,
  ) ? 0 : 1;
  const applicationNeeded = !observations.some(
    (observation) => observation.cognitiveLevel === "APPLY" || observation.cognitiveLevel === "ANALYZE",
  ) && (candidate.cognitiveLevel === "APPLY" || candidate.cognitiveLevel === "ANALYZE") ? 1 : 0;
  const last = [...state.observations].sort((left, right) => right.sequence - left.sequence)[0];
  const difficultyFit = 1 - Math.abs(candidate.difficulty - desiredDifficulty(candidate)) / 4;
  const masteryUncertainty = candidate.mastery === null ? 1 : 1 - (candidate.confidence ?? 0);
  const observationUncertainty = observations.length === 0 ? 0.88
    : observations.length === 1 ? 1
      : mixed ? 1 : applicationNeeded > 0 ? 0.78 : 0.28;
  const thresholdProximity = candidate.mastery === null
    ? 0.7
    : 1 - Math.min(1, Math.abs(candidate.mastery - candidate.targetMastery) / 0.25);
  const gateway = clamp(candidate.dependentCount / 4);
  const selfReportBase = candidate.selfReportFamiliarity === "VERY_COMFORTABLE" ? 1
    : candidate.selfReportFamiliarity === "COMFORTABLE" ? 0.85
      : candidate.selfReportFamiliarity === "KNOW_A_LITTLE" ? 0.72
        : candidate.selfReportFamiliarity === "UNSURE" ? 0.64
          : candidate.selfReportFamiliarity === "NEVER_LEARNED" ? 0.25 : 0.5;
  const selfReportConfidence = candidate.selfReportConfidence === "HIGH" ? 1
    : candidate.selfReportConfidence === "MEDIUM" ? 0.85
      : candidate.selfReportConfidence === "LOW" ? 0.7 : 0.8;
  const components: DiagnosticSelectionComponents = {
    courseRelevance: 1 / (1 + Math.max(0, candidate.contextSequence - 1) * 0.08),
    decisionImpact: clamp(gateway * Math.max(thresholdProximity, masteryUncertainty)),
    evidenceDiversity: clamp(cognitiveNovelty * 0.45 + applicationNeeded * 0.4 + difficultyFit * 0.15),
    exposurePenalty: Math.min(0.16, candidate.exposureCount * 0.04),
    gateway,
    informationGain: clamp(candidate.discrimination * (1 - candidate.guessProbability) / 1.8),
    misconceptionValue: candidate.misconceptionEvidenceCount > 0
      ? 1 : candidate.misconceptionMapped ? 0.45 : 0,
    retentionRisk: candidate.retentionState === "CRITICAL" ? 1
      : candidate.retentionState === "AT_RISK" ? 0.8
        : candidate.retentionState === "MODERATE" ? 0.35 : 0,
    topicSwitchPenalty: last && last.skillId !== candidate.skillId ? 0.035 : 0,
    uncertainty: clamp(Math.max(masteryUncertainty, observationUncertainty)),
    selfReportPriority: clamp(selfReportBase * selfReportConfidence),
  };

  if (stage === "COVERAGE") {
    if (observations.length > 0) return { components, score: Number.NEGATIVE_INFINITY };
  }
  const maximumSkillObservations = mixed || applicationNeeded > 0 ? 4 : 3;
  if (observations.length >= maximumSkillObservations) {
    return { components, score: Number.NEGATIVE_INFINITY };
  }
  const weighted = Object.entries(diagnosticQuestionValueWeights).reduce(
    (total, [key, weight]) => total + components[key as keyof typeof diagnosticQuestionValueWeights] * weight,
    0,
  );
  const verificationBoost = stage === "VERIFICATION" && mixed ? 0.18 : 0;
  return {
    components,
    score: (weighted + verificationBoost - components.exposurePenalty - components.topicSwitchPenalty) * 100,
  };
}

function preferCurriculumRoleBySkill(
  candidates: DiagnosticQuestionCandidate[],
  stage: DiagnosticSelectionStage,
): DiagnosticQuestionCandidate[] {
  const bySkill = new Map<string, DiagnosticQuestionCandidate[]>();
  for (const candidate of candidates) {
    const group = bySkill.get(candidate.skillId) ?? [];
    group.push(candidate);
    bySkill.set(candidate.skillId, group);
  }
  return [...bySkill.values()].flatMap((group) => {
    const familiarity = group[0]?.selfReportFamiliarity;
    const reportedKnown = familiarity === "COMFORTABLE" || familiarity === "VERY_COMFORTABLE";
    const preferred = stage === "COVERAGE"
      ? reportedKnown ? "VERIFICATION" : "ANCHOR"
      : stage === "CONFIRMATION" ? "VERIFICATION" : "CHALLENGE";
    const matches = group.filter((candidate) => candidate.diagnosticRole === preferred);
    return matches.length ? matches : group;
  });
}

export function selectNextDiagnosticQuestion(
  candidates: DiagnosticQuestionCandidate[],
  state: DiagnosticSelectionState,
  sequence: number,
  questionBudget: number,
): SelectedDiagnosticQuestion | null {
  const skillCount = new Set(candidates.map((candidate) => candidate.skillId)).size;
  const stage = stageFor(sequence, questionBudget, skillCount, state.observations);
  const selected = new Set(state.selectedQuestionIds);
  let available = candidates.filter((candidate) => !selected.has(candidate.questionId));
  if (!available.length) return null;

  if (stage === "COVERAGE") {
    const testedSkills = new Set(state.observations.map((observation) => observation.skillId));
    const untested = available.filter((candidate) => !testedSkills.has(candidate.skillId));
    if (untested.length) available = untested;
  }

  const testedSkills = new Set(state.observations.map((observation) => observation.skillId));
  const requiredCoverage = Math.min(skillCount, Math.max(8, Math.ceil(skillCount * 0.75)));
  if (stage === "CONFIRMATION" && testedSkills.size < requiredCoverage) {
    const untested = available.filter((candidate) => !testedSkills.has(candidate.skillId));
    if (untested.length) available = untested;
  }
  if (stage === "VERIFICATION") {
    const contradictorySkills = new Set([...testedSkills].filter((skillId) => {
      const related = state.observations.filter((observation) => observation.skillId === skillId);
      const correct = related.filter((observation) => observation.isCorrect).length;
      return related.length >= 2 && correct > 0 && correct < related.length;
    }));
    const contradictionChecks = available.filter((candidate) => contradictorySkills.has(candidate.skillId));
    if (contradictionChecks.length) available = contradictionChecks;
  }

  available = preferCurriculumRoleBySkill(available, stage);

  const ranked = available.map((candidate) => ({
    candidate,
    ...candidateScore(candidate, state, stage),
  })).filter(({ score }) => Number.isFinite(score)).sort((left, right) =>
    right.score - left.score
      || left.candidate.contextSequence - right.candidate.contextSequence
      || left.candidate.questionId.localeCompare(right.candidate.questionId));
  const choice = ranked[0];
  if (!choice) return null;
  return {
    components: choice.components,
    questionId: choice.candidate.questionId,
    reason: reasonFor(choice.candidate, stage, state.observations),
    score: Math.round(choice.score * 10_000) / 10_000,
    skillId: choice.candidate.skillId,
    stage,
  };
}

export function initializeDiagnosticSelection(
  candidates: DiagnosticQuestionCandidate[],
): DiagnosticSelection {
  const skillIds = new Set(candidates.map((candidate) => candidate.skillId));
  const questionBudget = Math.min(maximumDiagnosticQuestions, candidates.length);
  const first = questionBudget > 0
    ? selectNextDiagnosticQuestion(candidates, { observations: [], selectedQuestionIds: [] }, 1, questionBudget)
    : null;
  const recognizedSkillIds = new Set(candidates.filter(isRecognized).map((candidate) => candidate.skillId));
  return {
    questionBudget,
    recognizedSkillCount: recognizedSkillIds.size,
    selected: first ? [first] : [],
    selectedSkillCount: first ? 1 : 0,
    skippedSkillCount: Math.max(0, skillIds.size - (first ? 1 : 0)),
    templateQuestionCount: candidates.length,
  };
}
