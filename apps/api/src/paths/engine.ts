import type { CandidateOverview, CandidateSkill } from "../candidates/types.js";
import { pathPolicy } from "./policy.js";
import type { BenefitPrediction, PathItem, PathLane } from "./types.js";

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function percentage(value: number): number {
  return Math.round(value * 100);
}

function priority(candidate: CandidateSkill, probability: number): number {
  const gatewayBonus = (candidate.graphMetrics?.gatewayScore ?? 0) * pathPolicy.gatewayPriorityMaximumBonus;
  return round(Math.min(1, probability + (candidate.revisionDue ? pathPolicy.revisionPriorityBonus : 0) + gatewayBonus));
}

function item(
  candidate: CandidateSkill,
  lane: PathLane,
  position: number,
  probability: number | null,
  priorityScore: number | null,
  explanation: string,
  reasonCodes: string[],
): PathItem {
  return {
    benefitProbability: probability,
    candidateKind: candidate.kind,
    category: candidate.category,
    confidence: candidate.confidence,
    dependencyLevel: candidate.dependencyLevel,
    description: candidate.description,
    difficulty: candidate.difficulty,
    evidenceState: candidate.evidenceState,
    explanation,
    goalRelevance: candidate.goalRelevance,
    graphMetrics: candidate.graphMetrics,
    isContextSkill: candidate.isContextSkill,
    isCore: candidate.isCore,
    lane,
    mastery: candidate.mastery,
    missingPrerequisites: candidate.missingPrerequisites,
    module: candidate.module,
    name: candidate.name,
    position,
    practiceAvailable: candidate.practiceAvailable,
    prerequisiteState: lane === "LOCKED" ? "MISSING" : lane === "RECOGNIZED" ? "RECOGNIZED" : "SATISFIED",
    prerequisites: candidate.prerequisites,
    priorityScore,
    reasonCodes,
    resourceCount: candidate.resourceCount,
    retention: candidate.retention,
    retentionState: candidate.retentionState,
    revisionDue: candidate.revisionDue,
    skillId: candidate.id,
    slug: candidate.slug,
    targetMastery: candidate.targetMastery,
  };
}

export function constructPath(input: {
  candidates: CandidateOverview;
  lastActivitySkillId: string | null;
  predictions: BenefitPrediction[];
}): PathItem[] {
  const probabilityBySkill = new Map(input.predictions.map((prediction) => [prediction.skillId, prediction.benefitProbability]));
  if (probabilityBySkill.size !== input.candidates.candidates.eligible.length) {
    throw new Error("Inference output must cover every and only eligible candidate.");
  }
  const ranked = input.candidates.candidates.eligible.map((candidate) => {
    const probability = probabilityBySkill.get(candidate.id);
    if (probability === undefined) throw new Error(`Missing benefit probability for ${candidate.id}.`);
    return { candidate, probability, priorityScore: priority(candidate, probability) };
  }).sort((left, right) => (
    right.priorityScore - left.priorityScore
    || right.probability - left.probability
    || left.candidate.dependencyLevel - right.candidate.dependencyLevel
    || (left.candidate.courseSequence ?? Number.MAX_SAFE_INTEGER) - (right.candidate.courseSequence ?? Number.MAX_SAFE_INTEGER)
    || left.candidate.name.localeCompare(right.candidate.name)
  ));
  const recommended = ranked[0];
  const current = ranked.find((entry, index) => (
    index > 0
    && entry.candidate.id === input.lastActivitySkillId
    && entry.candidate.module?.progressStatus === "IN_PROGRESS"
  ));
  const ordered: PathItem[] = [];
  const add = (candidate: CandidateSkill, lane: PathLane, probability: number | null, priorityScore: number | null, explanation: string, codes: string[]) => {
    ordered.push(item(candidate, lane, ordered.length + 1, probability, priorityScore, explanation, codes));
  };
  for (const candidate of input.candidates.candidates.excluded) {
    add(
      candidate,
      "RECOGNIZED",
      null,
      null,
      `Your global ${percentage(candidate.mastery ?? 0)}% mastery already meets this course's ${percentage(candidate.targetMastery)}% target. LearnPath recognizes it without claiming the course module is complete.`,
      ["GLOBAL_MASTERY_REUSED", "COURSE_TARGET_MET"],
    );
  }
  if (current) {
    add(
      current.candidate,
      "CURRENT",
      current.probability,
      current.priorityScore,
      `You recently worked in this in-progress module. It stays visible while Learn Next remains the highest checked benefit recommendation.`,
      ["ACTIVITY_IN_PROGRESS", "PREREQUISITES_SATISFIED"],
    );
  }
  if (recommended) {
    const gatewayBonus = (recommended.candidate.graphMetrics?.gatewayScore ?? 0)
      * pathPolicy.gatewayPriorityMaximumBonus;
    const evidenceReason = recommended.candidate.revisionDue
      ? `Retention is ${recommended.candidate.retentionState.toLowerCase().replace("_", " ")}, so revision receives the documented ${percentage(pathPolicy.revisionPriorityBonus)}-point policy bonus.`
      : recommended.candidate.masteryGap === null
        ? "No direct mastery evidence exists yet, so this recommendation also closes an evidence gap."
        : `It has a ${percentage(recommended.candidate.masteryGap)}-point gap to the course target.`;
    add(
      recommended.candidate,
      "RECOMMENDED_NEXT",
      recommended.probability,
      recommended.priorityScore,
      `Highest priority among ${ranked.length} prerequisite-eligible skills with ${percentage(recommended.probability)}% predicted learning benefit. ${evidenceReason}${gatewayBonus > 0 ? ` NetworkX gateway analysis adds ${percentage(gatewayBonus)} points because this skill reaches ${recommended.candidate.graphMetrics?.downstreamSkillCount ?? 0} downstream skills.` : ""}`,
      ["ML_HIGHEST_PRIORITY", "PREREQUISITES_SATISFIED", recommended.candidate.revisionDue ? "RETENTION_REVISION" : "MASTERY_GAP", ...(gatewayBonus > 0 ? ["NETWORKX_GATEWAY_PRIORITY"] : [])],
    );
  }
  for (const entry of ranked) {
    if (entry === recommended || entry === current) continue;
    add(
      entry.candidate,
      "UPCOMING",
      entry.probability,
      entry.priorityScore,
      `Prerequisites are satisfied and the model predicts ${percentage(entry.probability)}% benefit; higher-priority eligible work is placed first.`,
      ["ML_RANKED_ELIGIBLE", "PREREQUISITES_SATISFIED"],
    );
  }
  for (const candidate of input.candidates.candidates.locked) {
    const missingNames = candidate.missingPrerequisites.map((prerequisite) => prerequisite.prerequisiteSkillName).join(", ");
    add(
      candidate,
      "LOCKED",
      null,
      null,
      `Not sent to the ML model. Required prerequisite mastery is still missing: ${missingNames}.`,
      ["PREREQUISITE_LOCKED", "EXCLUDED_FROM_ML"],
    );
  }
  return ordered;
}
