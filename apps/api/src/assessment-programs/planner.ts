import { diagnosticClassificationThresholds } from "../diagnostics/estimation.js";
import { diagnosticMaximumQuestions } from "../diagnostics/stopping.js";
import { masteryPolicy } from "../mastery/policy.js";
import type {
  AssessmentBacklogItem,
  AssessmentCoverageSummary,
  AssessmentProgramMode,
  AssessmentProgramModule,
  AssessmentProgramSkill,
  AssessmentSessionPlan,
  KnowledgeBoundarySummary,
} from "./types.js";

export const assessmentProgramPolicy = {
  version: "course-coverage-v1",
  maximumSkillsPerSession: 4,
  maximumQuestionsPerSession: diagnosticMaximumQuestions,
  freshEvidenceHours: 24,
  coverageExplanation: "Assessed means enough direct evidence to describe current understanding, including gaps. Uncertain and stale evidence remain in the backlog. Each session is bounded; course coverage continues across sessions.",
  masteryExplanation: "Mastery is a separate estimate from the existing learner model. Completing assessment coverage does not complete lessons or unlock learning prerequisites.",
} as const;

export interface AssessmentSkillEvidence extends Omit<AssessmentProgramSkill,
  "coverageStatus" | "coverageReason" | "mastered" | "bankStatus" | "bankReason"> {
  bankApplicationQuestionCount: number;
  bankDifficultyBandCount: number;
  evidenceCount: number;
  correctQuestionCount: number;
}

export function buildKnowledgeBoundary(skills: AssessmentProgramSkill[]): KnowledgeBoundarySummary {
  const mapped = skills.map((skill) => {
    const assessmentCoverage = skill.coverageStatus === "UNASSESSED" ? "NOT_TESTED" as const
      : skill.coverageStatus === "ASSESSED" ? "SUFFICIENT_EVIDENCE" as const : "PARTIALLY_ASSESSED" as const;
    const status = skill.mastered ? "STRONG" as const
      : skill.latestClassification === "READY" ? "READY" as const
        : skill.latestClassification === "GAP" || skill.latestClassification === "FORGOTTEN" ? "NEEDS_WORK" as const
          : assessmentCoverage === "NOT_TESTED" ? "NOT_ASSESSED_YET" as const : "NEEDS_CONFIRMATION" as const;
    return {
      skillId: skill.skillId, skillName: skill.skillName, moduleName: skill.moduleName,
      status, assessmentCoverage, mastery: skill.mastery, confidence: skill.confidence,
    };
  });
  const start = mapped.find((skill) => skill.status !== "STRONG");
  const knownCount = mapped.filter((skill) => skill.assessmentCoverage !== "NOT_TESTED").length;
  const found = Boolean(start && knownCount > 0);
  return {
    found,
    pathReady: mapped.length > 0 && (knownCount > 0 || mapped.every((skill) => skill.status === "NOT_ASSESSED_YET")),
    startingSkillId: start?.skillId ?? null,
    startingSkillName: start?.skillName ?? null,
    reason: !mapped.length ? "This course has no active skills."
      : !knownCount ? "No direct knowledge evidence exists yet; the path must begin conservatively at the first required skill."
        : start ? `${start.skillName} is the first course skill not supported by strong evidence.`
          : "Current evidence supports every mapped course skill.",
    skills: mapped,
  };
}

export function buildAssessmentBacklog(skills: AssessmentProgramSkill[]): AssessmentBacklogItem[] {
  return skills.map((skill) => {
    if (skill.coverageStatus === "ASSESSED") return {
      skillId: skill.skillId, skillName: skill.skillName, moduleName: skill.moduleName,
      priority: 0, reason: "SUFFICIENT_EVIDENCE" as const, status: "RESOLVED" as const,
    };
    if (skill.bankStatus === "BLOCKED") return {
      skillId: skill.skillId, skillName: skill.skillName, moduleName: skill.moduleName,
      priority: 0, reason: "QUESTION_BANK_BLOCKED" as const, status: "BLOCKED" as const,
    };
    const reason = skill.coverageStatus === "NEEDS_REFRESH" ? "RETENTION_RISK" as const
      : skill.latestClassification === "NEEDS_CONFIRMATION" || skill.latestClassification === "FRAGILE_FOUNDATION"
        ? "CONTRADICTORY_EVIDENCE" as const
        : skill.coverageStatus === "NEEDS_CONFIRMATION" ? "LOW_CONFIDENCE" as const
          : skill.dependentCount > 0 ? "PREREQUISITE_GATEWAY" as const
            : skill.sessionCount > 1 ? "STARVATION_PREVENTION" as const : "NOT_TESTED" as const;
    const base = reason === "RETENTION_RISK" ? 78 : reason === "CONTRADICTORY_EVIDENCE" ? 74
      : reason === "LOW_CONFIDENCE" ? 68 : reason === "PREREQUISITE_GATEWAY" ? 64
        : reason === "STARVATION_PREVENTION" ? 60 : 48;
    const priority = Math.min(100, base + Math.min(15, skill.dependentCount * 3)
      + Math.max(0, 8 - skill.moduleSequence) * 0.5);
    return {
      skillId: skill.skillId, skillName: skill.skillName, moduleName: skill.moduleName,
      priority: Math.round(priority * 1000) / 1000, reason, status: "PENDING" as const,
    };
  }).sort((left, right) => right.priority - left.priority || left.skillId.localeCompare(right.skillId));
}

/** Derive coverage only. This never calculates or writes learner mastery. */
export function describeAssessmentSkill(input: AssessmentSkillEvidence, now = Date.now()): AssessmentProgramSkill {
  const { bankApplicationQuestionCount, bankDifficultyBandCount, evidenceCount, correctQuestionCount, ...skill } = input;
  const observed = skill.distinctQuestionCount > 0 || evidenceCount > 0;
  // Reusing the same question cannot create independent coverage. A confirmed
  // negative result can establish a gap without positive application evidence.
  const confirmedGap = skill.latestClassification === "GAP" || skill.latestClassification === "FORGOTTEN";
  const diverseEvidence = skill.distinctQuestionCount >= 3
    && skill.applicationQuestionCount > 0 && skill.difficultyBandCount >= 2;
  // Diagnostic-only confidence is capped at 0.45 in the existing learner
  // model. Coverage can use its assessed minimum without claiming mastery,
  // but only when all cumulative independent responses agree. A lucky latest
  // answer cannot erase a contradiction on another question.
  const consistentDiagnosticCoverage = diverseEvidence
    && correctQuestionCount === skill.distinctQuestionCount
    && (skill.confidence ?? 0) >= masteryPolicy.confidence.assessedMinimum;
  const sufficient = observed && (
    (skill.evidenceState === "VERIFIED" && skill.distinctQuestionCount >= 3)
    || (diverseEvidence && (skill.confidence ?? 0) >= 0.5)
    || consistentDiagnosticCoverage
    || (confirmedGap && skill.distinctQuestionCount >= 2)
  );
  // A newly observed gap can have low retention immediately. That is fresh
  // evidence of weak knowledge, not evidence that the assessment has expired.
  const evidenceAge = skill.lastEvidenceAt ? now - Date.parse(skill.lastEvidenceAt) : Infinity;
  const fresh = Number.isFinite(evidenceAge) && evidenceAge >= 0
    && evidenceAge < assessmentProgramPolicy.freshEvidenceHours * 60 * 60 * 1000;
  const stale = observed && !fresh && (skill.retentionState === "AT_RISK" || skill.retentionState === "CRITICAL");
  const coverageStatus = !observed ? "UNASSESSED" : stale ? "NEEDS_REFRESH"
    : sufficient ? "ASSESSED" : "NEEDS_CONFIRMATION";
  const coverageReason = coverageStatus === "UNASSESSED"
    ? "No direct assessment or practice evidence has been recorded for this skill."
    : coverageStatus === "NEEDS_REFRESH"
      ? "Existing evidence is at retention risk and needs a fresh check."
      : coverageStatus === "ASSESSED"
        ? confirmedGap ? "Repeated direct evidence identifies a learning gap; assessment coverage does not imply mastery."
          : "Current direct evidence is sufficient to assess this skill."
        : "Some evidence exists, but independent observations, application evidence, or confidence still need confirmation.";
  const bankStatus = skill.questionCount === 0 || skill.availableQuestionCount === 0 ? "BLOCKED"
    : skill.questionCount < 3 || bankApplicationQuestionCount === 0 || bankDifficultyBandCount < 2
      ? "LIMITED" : "READY";
  const bankReason = skill.questionCount === 0
    ? "No active diagnostic questions are published for this course skill."
    : skill.availableQuestionCount === 0
      ? "This program has used all available diagnostic questions for this skill. Additional independent questions are needed."
      : bankStatus === "LIMITED"
        ? "The question bank has limited independent questions, application evidence, or difficulty variety; a session may leave this skill needing confirmation."
        : "Active diagnostic questions include independent observations, application, and varied difficulty.";
  const mastered = coverageStatus === "ASSESSED"
    && (skill.mastery ?? 0) >= diagnosticClassificationThresholds.masteredMasteryMinimum
    && (skill.confidence ?? 0) >= diagnosticClassificationThresholds.masteredConfidenceMinimum
    && skill.latestClassification !== "FRAGILE_FOUNDATION"
    && (skill.evidenceState === "VERIFIED" || diverseEvidence);
  return { ...skill, coverageStatus, coverageReason, mastered, bankStatus, bankReason };
}

export function summarizeAssessmentCoverage(skills: AssessmentProgramSkill[]): AssessmentCoverageSummary {
  const count = (status: AssessmentProgramSkill["coverageStatus"]) => skills.filter((skill) => skill.coverageStatus === status).length;
  const assessed = count("ASSESSED");
  const mastered = skills.filter((skill) => skill.mastered).length;
  return {
    totalSkills: skills.length,
    assessed,
    mastered,
    observed: skills.filter((skill) => skill.coverageStatus !== "UNASSESSED").length,
    needsConfirmation: count("NEEDS_CONFIRMATION"),
    unassessed: count("UNASSESSED"),
    needsRefresh: count("NEEDS_REFRESH"),
    blocked: skills.filter((skill) => skill.coverageStatus !== "ASSESSED" && skill.bankStatus === "BLOCKED").length,
    assessedPercentage: skills.length ? Math.round(assessed * 10_000 / skills.length) / 100 : 0,
    masteredPercentage: skills.length ? Math.round(mastered * 10_000 / skills.length) / 100 : 0,
  };
}

export function assessmentModules(skills: AssessmentProgramSkill[]): AssessmentProgramModule[] {
  const modules = new Map<string, AssessmentProgramSkill[]>();
  for (const skill of skills) modules.set(skill.moduleId, [...(modules.get(skill.moduleId) ?? []), skill]);
  return [...modules.values()].map((moduleSkills) => ({
    id: moduleSkills[0]!.moduleId,
    name: moduleSkills[0]!.moduleName,
    sequence: moduleSkills[0]!.moduleSequence,
    coverage: summarizeAssessmentCoverage(moduleSkills),
    skillIds: moduleSkills.map((skill) => skill.skillId),
  })).sort((left, right) => left.sequence - right.sequence);
}

/** A course backlog has no skill or session ceiling. Learning locks are not
 * inputs: probing a later skill does not grant permission to study its module. */
export function planAssessmentSession(
  skills: AssessmentProgramSkill[],
  mode: AssessmentProgramMode,
  reportedFamiliarity: ReadonlyMap<string, "NEVER_LEARNED" | "KNOW_A_LITTLE" | "COMFORTABLE" | "VERY_COMFORTABLE" | "UNSURE"> = new Map(),
): AssessmentSessionPlan | null {
  const priority = { UNASSESSED: 0, NEEDS_REFRESH: 1, NEEDS_CONFIRMATION: 2, ASSESSED: 3 } as const;
  const backlog = skills.filter((skill) => skill.coverageStatus !== "ASSESSED" && skill.bankStatus !== "BLOCKED")
    .sort((left, right) => priority[left.coverageStatus] - priority[right.coverageStatus]
      || left.sessionCount - right.sessionCount
      || left.moduleSequence - right.moduleSequence
      || (mode === "QUICK_PLACEMENT" ? (
        (reportedFamiliarity.get(left.skillId) === "VERY_COMFORTABLE" || reportedFamiliarity.get(left.skillId) === "COMFORTABLE" ? 0
          : reportedFamiliarity.get(left.skillId) === "NEVER_LEARNED" ? 2 : 1)
        - (reportedFamiliarity.get(right.skillId) === "VERY_COMFORTABLE" || reportedFamiliarity.get(right.skillId) === "COMFORTABLE" ? 0
          : reportedFamiliarity.get(right.skillId) === "NEVER_LEARNED" ? 2 : 1)
      ) : 0)
      || left.sequence - right.sequence
      || left.skillId.localeCompare(right.skillId));
  if (!backlog.length) return null;
  let selected: AssessmentProgramSkill[];
  if (mode === "QUICK_PLACEMENT") {
    // Round-robin modules samples a wider region without claiming coverage of
    // every module or allowing a large opening module to hide advanced topics.
    const moduleIds = [...new Set(backlog.map((skill) => skill.moduleId))];
    const limit = assessmentProgramPolicy.maximumSkillsPerSession;
    // Include later course regions even when there are many more modules than
    // one placement session can visit. This is a sample, not full coverage.
    const sampledModules = moduleIds.length > limit
      ? Array.from({ length: limit }, (_, index) => moduleIds[Math.floor(index * (moduleIds.length - 1) / (limit - 1))]!)
      : moduleIds;
    selected = [];
    for (let offset = 0; selected.length < assessmentProgramPolicy.maximumSkillsPerSession; offset += 1) {
      const round = sampledModules.map((id) => backlog.filter((skill) => skill.moduleId === id)[offset])
        .filter((skill): skill is AssessmentProgramSkill => Boolean(skill));
      if (!round.length) break;
      selected.push(...round.slice(0, assessmentProgramPolicy.maximumSkillsPerSession - selected.length));
    }
  } else {
    selected = backlog.filter((skill) => skill.moduleId === backlog[0]!.moduleId
      && skill.coverageStatus === backlog[0]!.coverageStatus)
      .slice(0, assessmentProgramPolicy.maximumSkillsPerSession);
  }
  const estimatedSessionCount = mode === "QUICK_PLACEMENT" ? 1
    : [...new Set(backlog.map((skill) => `${skill.moduleId}:${skill.coverageStatus}`))]
      .reduce((total, group) => total + Math.ceil(backlog.filter((skill) =>
        `${skill.moduleId}:${skill.coverageStatus}` === group).length / assessmentProgramPolicy.maximumSkillsPerSession), 0);
  return {
    focusSkillIds: selected.map((skill) => skill.skillId),
    moduleId: selected.every((skill) => skill.moduleId === selected[0]!.moduleId) ? selected[0]!.moduleId : null,
    estimatedSessionCount,
    maximumQuestions: Math.min(assessmentProgramPolicy.maximumQuestionsPerSession,
      selected.reduce((total, skill) => total + skill.availableQuestionCount, 0)),
    reason: mode === "QUICK_PLACEMENT"
      ? "A bounded sample suggests where to start. Remaining skills stay visible in course coverage."
      : "Assesses a small group of skills in this module. Unassessed skills across the course are visited before further confirmation sessions. Session estimates are a minimum and may grow when evidence remains uncertain.",
  };
}
