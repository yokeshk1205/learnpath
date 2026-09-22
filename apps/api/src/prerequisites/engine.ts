import type {
  GoalPrerequisiteAnalysis,
  PrerequisiteCheck,
  PrerequisiteCourseContext,
  PrerequisiteSkillAnalysis,
} from "./types.js";
import { knowledgeGraphPolicy } from "./policy.js";

export interface PrerequisiteNodeInput {
  category: string;
  confidence: number | null;
  courseContexts: PrerequisiteCourseContext[];
  currentMastery: number | null;
  description: string;
  difficulty: number;
  id: string;
  isCore: boolean;
  isContextSkill?: boolean;
  isGoalSkill: boolean;
  name: string;
  relevance: number | null;
  requiredMastery: number | null;
  slug: string;
}

export interface PrerequisiteEdgeInput {
  prerequisiteSkillId: string;
  relationshipType: "RECOMMENDED" | "REQUIRED";
  requiredMastery: number;
  skillId: string;
}

export class PrerequisiteGraphCycleError extends Error {
  constructor() {
    super("The prerequisite graph contains a cycle.");
    this.name = "PrerequisiteGraphCycleError";
  }
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function confidenceAdjustedMastery(mastery: number | null, confidence: number | null): {
  effectiveMastery: number | null;
  uncertaintyPenalty: number;
} {
  if (mastery === null) return { effectiveMastery: null, uncertaintyPenalty: 0 };
  if (confidence === null) return { effectiveMastery: mastery, uncertaintyPenalty: 0 };
  const uncertaintyPenalty = round((1 - clamp(confidence)) * knowledgeGraphPolicy.maximumConfidencePenalty);
  return { effectiveMastery: round(Math.max(0, mastery - uncertaintyPenalty)), uncertaintyPenalty };
}

export function analyzePrerequisiteGraph(input: {
  context?: GoalPrerequisiteAnalysis["context"];
  edges: PrerequisiteEdgeInput[];
  goal?: NonNullable<GoalPrerequisiteAnalysis["goal"]>;
  nodes: PrerequisiteNodeInput[];
  analyzedAt?: string;
}): GoalPrerequisiteAnalysis {
  const context = input.context ?? (input.goal ? {
    ...input.goal,
    enrollmentId: null,
    type: "GOAL" as const,
  } : undefined);
  if (!context) throw new Error("A prerequisite analysis context is required.");
  const nodeById = new Map(input.nodes.map((node) => [node.id, node]));
  const requiredEdges = input.edges.filter((edge) => edge.relationshipType === "REQUIRED");
  const requiredBySkill = new Map<string, PrerequisiteEdgeInput[]>();
  const allBySkill = new Map<string, PrerequisiteEdgeInput[]>();
  for (const edge of input.edges) {
    const all = allBySkill.get(edge.skillId) ?? [];
    all.push(edge);
    allBySkill.set(edge.skillId, all);
    if (edge.relationshipType === "REQUIRED") {
      const required = requiredBySkill.get(edge.skillId) ?? [];
      required.push(edge);
      requiredBySkill.set(edge.skillId, required);
    }
  }

  const visiting = new Set<string>();
  const levelBySkill = new Map<string, number>();
  const dependencyLevel = (skillId: string): number => {
    const known = levelBySkill.get(skillId);
    if (known !== undefined) return known;
    if (visiting.has(skillId)) throw new PrerequisiteGraphCycleError();
    visiting.add(skillId);
    const prerequisites = requiredBySkill.get(skillId) ?? [];
    const level = prerequisites.length
      ? Math.max(...prerequisites.map((edge) => dependencyLevel(edge.prerequisiteSkillId) + 1))
      : 0;
    visiting.delete(skillId);
    levelBySkill.set(skillId, level);
    return level;
  };
  for (const node of input.nodes) dependencyLevel(node.id);

  const targetBySkill = new Map<string, number>();
  for (const node of input.nodes) {
    if (node.requiredMastery !== null) {
      targetBySkill.set(node.id, node.requiredMastery);
      continue;
    }
    const dependentThresholds = requiredEdges
      .filter((edge) => edge.prerequisiteSkillId === node.id)
      .map((edge) => edge.requiredMastery);
    targetBySkill.set(node.id, dependentThresholds.length ? Math.max(...dependentThresholds) : 0.7);
  }

  const skills: PrerequisiteSkillAnalysis[] = input.nodes.map((node) => {
    const isContextSkill = node.isContextSkill ?? node.isGoalSkill;
    const prerequisiteChecks: PrerequisiteCheck[] = (allBySkill.get(node.id) ?? []).map((edge) => {
      const prerequisite = nodeById.get(edge.prerequisiteSkillId);
      if (!prerequisite) throw new Error(`Prerequisite skill ${edge.prerequisiteSkillId} is missing.`);
      const currentMastery = prerequisite.currentMastery;
      const { effectiveMastery, uncertaintyPenalty } = confidenceAdjustedMastery(
        currentMastery,
        prerequisite.confidence,
      );
      const satisfied = effectiveMastery !== null && effectiveMastery >= edge.requiredMastery;
      return {
        confidence: prerequisite.confidence,
        courseContexts: prerequisite.courseContexts,
        currentMastery,
        effectiveMastery,
        evidenceStatus: currentMastery === null ? "UNKNOWN" : "KNOWN",
        prerequisiteSkillId: prerequisite.id,
        prerequisiteSkillName: prerequisite.name,
        recognizedAcrossCourses: prerequisite.courseContexts.length > 1,
        relationshipType: edge.relationshipType,
        requiredMastery: edge.requiredMastery,
        satisfied,
        shortfall: round(Math.max(0, edge.requiredMastery - (effectiveMastery ?? 0))),
        uncertaintyPenalty,
      };
    });
    const missingPrerequisites = prerequisiteChecks.filter(
      (check) => check.relationshipType === "REQUIRED" && !check.satisfied,
    );
    const targetMastery = targetBySkill.get(node.id)!;
    const adjusted = confidenceAdjustedMastery(node.currentMastery, node.confidence);
    const isMastered = adjusted.effectiveMastery !== null && adjusted.effectiveMastery >= targetMastery;
    const status = isMastered ? "MASTERED" : missingPrerequisites.length ? "LOCKED" : "UNLOCKED";
    const explanation = status === "MASTERED"
      ? `Global mastery meets the ${Math.round(targetMastery * 100)}% target in every course context.`
      : status === "UNLOCKED"
        ? prerequisiteChecks.filter((check) => check.relationshipType === "REQUIRED").length
          ? "Every required prerequisite meets its mastery threshold."
          : "No required prerequisite blocks this skill."
        : `${missingPrerequisites.length} required prerequisite${missingPrerequisites.length === 1 ? "" : "s"} need more mastery or evidence.`;
    return {
      category: node.category,
      confidence: node.confidence,
      courseContexts: node.courseContexts,
      currentMastery: node.currentMastery,
      effectiveMastery: adjusted.effectiveMastery,
      dependencyLevel: levelBySkill.get(node.id)!,
      description: node.description,
      difficulty: node.difficulty,
      explanation,
      contextGap: isContextSkill && node.currentMastery !== null
        ? round(Math.max(0, targetMastery - (adjusted.effectiveMastery ?? node.currentMastery)))
        : null,
      id: node.id,
      isCore: node.isCore,
      isContextSkill,
      isGoalSkill: node.isGoalSkill,
      goalGap: context.type === "GOAL" && isContextSkill && node.currentMastery !== null
        ? round(Math.max(0, targetMastery - (adjusted.effectiveMastery ?? node.currentMastery)))
        : null,
      missingPrerequisites,
      name: node.name,
      prerequisites: prerequisiteChecks,
      relevance: node.relevance,
      slug: node.slug,
      status,
      targetMastery,
    };
  });

  const skillById = new Map(skills.map((skill) => [skill.id, skill]));
  const contextSkills = skills.filter((skill) => skill.isContextSkill);
  const relevanceTotal = contextSkills.reduce((total, skill) => total + (skill.relevance ?? 1), 0);
  const readiness = relevanceTotal
    ? contextSkills.reduce((total, skill) => (
      total + (skill.relevance ?? 1) * (
        skill.targetMastery === 0 ? 1 : clamp((skill.effectiveMastery ?? 0) / skill.targetMastery)
      )
    ), 0) / relevanceTotal
    : 0;
  const satisfiedRequiredEdges = requiredEdges.filter((edge) => {
    const prerequisite = nodeById.get(edge.prerequisiteSkillId);
    return prerequisite !== undefined
      && prerequisite.currentMastery !== null
      && prerequisite.currentMastery >= edge.requiredMastery;
  }).length;
  const statusCount = (status: PrerequisiteSkillAnalysis["status"]) => (
    contextSkills.filter((skill) => skill.status === status).length
  );

  return {
    analyzedAt: input.analyzedAt ?? new Date().toISOString(),
    context,
    goal: context.type === "GOAL" ? {
      id: context.id, name: context.name, outcome: context.outcome, slug: context.slug,
    } : null,
    skills: [...skills].sort((left, right) => (
      left.dependencyLevel - right.dependencyLevel || left.name.localeCompare(right.name)
    )),
    summary: {
      contextReadiness: round(readiness),
      contextSkills: contextSkills.length,
      courseReadiness: context.type === "COURSE" ? round(readiness) : null,
      courseSkills: context.type === "COURSE" ? contextSkills.length : null,
      evidenceCoverage: contextSkills.length
        ? round(contextSkills.filter((skill) => skill.currentMastery !== null).length / contextSkills.length)
        : 0,
      goalReadiness: context.type === "GOAL" ? round(readiness) : null,
      goalSkills: context.type === "GOAL" ? contextSkills.length : null,
      lockedSkills: statusCount("LOCKED"),
      masteredSkills: statusCount("MASTERED"),
      prerequisiteCoverage: requiredEdges.length ? round(satisfiedRequiredEdges / requiredEdges.length) : 1,
      requiredEdges: requiredEdges.length,
      satisfiedRequiredEdges,
      supportingSkills: skills.length - contextSkills.length,
      unlockedSkills: statusCount("UNLOCKED"),
    },
    validOrder: [...skills]
      .sort((left, right) => (
        left.dependencyLevel - right.dependencyLevel || left.name.localeCompare(right.name)
      ))
      .map((skill) => skillById.get(skill.id)!.id),
  };
}
