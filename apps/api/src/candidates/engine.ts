import { candidatePolicy, type CandidateKind } from "./policy.js";
import type {
  CandidateBaselineEntry,
  CandidateOverview,
  CandidateSkill,
  CandidateSkillSource,
} from "./types.js";

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function percentage(value: number): number {
  return Math.round(value * 100);
}

function curriculumOrder(left: CandidateSkill, right: CandidateSkill): number {
  return left.dependencyLevel - right.dependencyLevel
    || (left.courseSequence ?? Number.MAX_SAFE_INTEGER) - (right.courseSequence ?? Number.MAX_SAFE_INTEGER)
    || left.name.localeCompare(right.name);
}

function explanation(
  source: CandidateSkillSource,
  status: CandidateSkill["status"],
  kind: CandidateKind,
  masteryGap: number | null,
): string {
  const skill = source.prerequisite;
  if (status === "EXCLUDED") {
    return `Global mastery already meets the ${percentage(skill.targetMastery)}% course target and no revision signal is active.`;
  }
  if (status === "LOCKED") {
    const names = skill.missingPrerequisites.map((item) => item.prerequisiteSkillName).join(", ");
    return `Locked until required prerequisite mastery improves: ${names}.`;
  }
  if (kind === "REVISION") {
    return `${source.retentionState.toLowerCase().replace("_", " ")} retention makes this previously demonstrated skill eligible for revision.`;
  }
  if (skill.currentMastery === null) {
    return kind === "SUPPORTING_PREREQUISITE"
      ? "No performance evidence exists yet; this supporting prerequisite is eligible before dependent course skills."
      : "No performance evidence exists yet, and no required prerequisite currently blocks this course skill.";
  }
  const gapText = `${percentage(masteryGap ?? 0)}-point mastery gap to the ${percentage(skill.targetMastery)}% target`;
  return kind === "SUPPORTING_PREREQUISITE"
    ? `${gapText}; closing it supports dependency-valid progression into the course.`
    : `${gapText}, with every required prerequisite currently satisfied.`;
}

function mapCandidate(source: CandidateSkillSource): CandidateSkill {
  const skill = source.prerequisite;
  const mastered = skill.currentMastery !== null && skill.currentMastery >= skill.targetMastery;
  const kind: CandidateKind = source.revisionDue
    ? "REVISION"
    : skill.isContextSkill ? "LEARN" : "SUPPORTING_PREREQUISITE";
  const status: CandidateSkill["status"] = mastered && !source.revisionDue
    ? "EXCLUDED"
    : skill.missingPrerequisites.length ? "LOCKED" : "ELIGIBLE";
  const masteryGap = skill.currentMastery === null
    ? null
    : round(Math.max(0, skill.targetMastery - skill.currentMastery));
  return {
    category: skill.category,
    confidence: skill.confidence,
    courseSequence: source.courseSequence,
    dependencyLevel: skill.dependencyLevel,
    description: skill.description,
    difficulty: skill.difficulty,
    eligibilityExplanation: explanation(source, status, kind, masteryGap),
    evidenceCount: source.evidenceCount,
    evidenceState: source.evidenceState,
    exclusionReason: status === "EXCLUDED" ? "STRONG_MASTERY" : null,
    goalRelevance: source.goalRelevance,
    graphMetrics: skill.graphMetrics,
    id: skill.id,
    isContextSkill: skill.isContextSkill,
    isCore: skill.isCore,
    kind,
    mastery: skill.currentMastery,
    masteryGap,
    missingPrerequisites: skill.missingPrerequisites,
    module: source.module,
    name: skill.name,
    popularity: source.popularity,
    practiceAvailable: source.practiceAvailable,
    prerequisiteCount: skill.prerequisites.filter((item) => item.relationshipType === "REQUIRED").length,
    prerequisites: skill.prerequisites,
    resourceCount: source.resourceCount,
    retention: source.retention,
    retentionState: source.retentionState,
    revisionDue: source.revisionDue,
    slug: skill.slug,
    status,
    targetMastery: skill.targetMastery,
  };
}

function baselineEntry(candidate: CandidateSkill, rank: number): CandidateBaselineEntry {
  return {
    activityEvents: candidate.popularity.activityEvents,
    courseContexts: candidate.popularity.courseContexts,
    evidenceObservations: candidate.popularity.evidenceObservations,
    masteryGap: candidate.masteryGap,
    observedLearners: candidate.popularity.observedLearners,
    rank,
    skillId: candidate.id,
    skillName: candidate.name,
  };
}

export function generateCandidateOverview(input: {
  context: CandidateOverview["context"];
  generatedAt?: string;
  skills: CandidateSkillSource[];
}): CandidateOverview {
  const all = input.skills.map(mapCandidate);
  const eligible = all.filter((skill) => skill.status === "ELIGIBLE").sort(curriculumOrder);
  const locked = all.filter((skill) => skill.status === "LOCKED").sort(curriculumOrder);
  const excluded = all.filter((skill) => skill.status === "EXCLUDED").sort(curriculumOrder);
  const highestGap = [...eligible].sort((left, right) => {
    if (left.masteryGap === null && right.masteryGap !== null) return 1;
    if (left.masteryGap !== null && right.masteryGap === null) return -1;
    return (right.masteryGap ?? 0) - (left.masteryGap ?? 0) || curriculumOrder(left, right);
  });
  const popularity = [...eligible].sort((left, right) => (
    right.popularity.observedLearners - left.popularity.observedLearners
    || right.popularity.evidenceObservations - left.popularity.evidenceObservations
    || right.popularity.activityEvents - left.popularity.activityEvents
    || right.popularity.courseContexts - left.popularity.courseContexts
    || curriculumOrder(left, right)
  ));
  const topK = Math.min(candidatePolicy.baselineTopK, eligible.length);
  const highestTop = new Set(highestGap.slice(0, topK).map((skill) => skill.id));
  const topKOverlap = popularity.slice(0, topK).filter((skill) => highestTop.has(skill.id)).length;
  return {
    baselines: {
      disclaimer: "These deterministic orders are evaluation baselines, not ML predictions, benefit probabilities, Learn Next, or a personalized path.",
      highestSkillGap: {
        description: "Orders eligible skills by the largest measurable mastery shortfall. Unknown mastery remains unknown and follows measurable gaps.",
        ranking: highestGap.map((candidate, index) => baselineEntry(candidate, index + 1)),
      },
      popularity: {
        description: "Orders eligible skills by observed learners and real evidence/activity counts, then curriculum prevalence. No synthetic popularity is added.",
        ranking: popularity.map((candidate, index) => baselineEntry(candidate, index + 1)),
      },
      topK,
      topKOverlap,
    },
    candidates: { eligible, excluded, locked },
    context: input.context,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    policyVersion: candidatePolicy.version,
    summary: {
      eligibleSkills: eligible.length,
      excludedStrongSkills: excluded.length,
      learnCandidates: eligible.filter((skill) => skill.kind === "LEARN").length,
      lockedSkills: locked.length,
      measurableGapCandidates: eligible.filter((skill) => skill.masteryGap !== null).length,
      revisionCandidates: eligible.filter((skill) => skill.kind === "REVISION").length,
      supportingCandidates: eligible.filter((skill) => skill.kind === "SUPPORTING_PREREQUISITE").length,
      totalRelevantSkills: all.length,
      unknownEvidenceCandidates: eligible.filter((skill) => skill.evidenceState === "UNKNOWN").length,
    },
  };
}
