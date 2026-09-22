import { coordinationPolicy } from "./policy.js";
import type {
  CoordinatedCoursePath,
  CoordinatedLearningPlan,
  CoordinatedRecommendation,
} from "./types.js";

export interface CoordinationGoalInput {
  goalId: string;
  name: string;
  priority: number;
  relevanceBySkill: Map<string, number>;
  targetDate: string | null;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function percentage(value: number): number {
  return Math.round(value * 100);
}

function primaryContext(courses: CoordinatedCoursePath[]): CoordinatedCoursePath {
  return [...courses].sort((left, right) => {
    const priorityDifference = (right.learnNext?.priorityScore ?? 0) - (left.learnNext?.priorityScore ?? 0);
    if (priorityDifference) return priorityDifference;
    return new Date(right.lastAccessedAt).getTime() - new Date(left.lastAccessedAt).getTime()
      || left.courseName.localeCompare(right.courseName);
  })[0]!;
}

export function coordinateCoursePaths(input: {
  activeGoal: CoordinationGoalInput | null;
  courses: CoordinatedCoursePath[];
  generatedAt?: string;
}): CoordinatedLearningPlan {
  const groups = new Map<string, CoordinatedCoursePath[]>();
  for (const course of input.courses) {
    if (course.enrollmentStatus !== "ACTIVE" || course.pathState !== "READY" || !course.learnNext || !course.pathId) continue;
    const current = groups.get(course.learnNext.skillId) ?? [];
    current.push(course);
    groups.set(course.learnNext.skillId, current);
  }

  const recommendations: CoordinatedRecommendation[] = [...groups.values()].map((courses) => {
    const primary = primaryContext(courses);
    const item = primary.learnNext!;
    const basePriority = Math.max(...courses.map((course) => (
      course.learnNext?.priorityScore ?? course.learnNext?.benefitProbability ?? 0
    )));
    const goalRelevance = input.activeGoal?.relevanceBySkill.get(item.skillId) ?? null;
    const goalBonus = goalRelevance === null
      ? 0
      : round(coordinationPolicy.goalAlignmentMaximumBonus * clamp(goalRelevance));
    const additionalContexts = Math.min(
      Math.max(courses.length - 1, 0),
      coordinationPolicy.maximumAdditionalContexts,
    );
    const crossCourseBonus = round(
      coordinationPolicy.crossCourseBonusPerAdditionalContext * additionalContexts,
    );
    const coordinationScore = round(clamp(basePriority + goalBonus + crossCourseBonus));
    const reasonCodes = ["COURSE_PATH_VALID", "CROSS_COURSE_PRIORITY"];
    if (courses.length > 1) reasonCodes.push("SHARED_SKILL_UTILITY");
    if (goalRelevance !== null) reasonCodes.push("ACTIVE_GOAL_ALIGNMENT");
    if (item.revisionDue) reasonCodes.push("RETENTION_REVISION");
    const explanations = [
      `${item.name} is the strongest prerequisite-valid next step across ${courses.length} active course path${courses.length === 1 ? "" : "s"}, starting from a ${percentage(basePriority)}% course priority.`,
    ];
    if (courses.length > 1) {
      explanations.push(`Learning it supports ${courses.length} courses, adding a ${percentage(crossCourseBonus)}-point shared-skill bonus.`);
    }
    if (goalRelevance !== null && input.activeGoal) {
      explanations.push(`${percentage(goalRelevance)}% alignment with ${input.activeGoal.name} adds ${percentage(goalBonus)} points.`);
    }
    return {
      basePriority: round(basePriority),
      coordinationScore,
      courseContexts: courses.map((course) => ({
        courseId: course.courseId,
        courseName: course.courseName,
        courseSlug: course.courseSlug,
        enrollmentId: course.enrollmentId,
        pathId: course.pathId!,
        priorityScore: round(course.learnNext?.priorityScore ?? course.learnNext?.benefitProbability ?? 0),
      })).sort((left, right) => right.priorityScore - left.priorityScore || left.courseName.localeCompare(right.courseName)),
      crossCourseBonus,
      explanation: explanations.join(" "),
      goalBonus,
      goalRelevance,
      item,
      primaryCourse: {
        courseId: primary.courseId,
        courseName: primary.courseName,
        courseSlug: primary.courseSlug,
        enrollmentId: primary.enrollmentId,
        pathId: primary.pathId!,
      },
      reasonCodes,
    };
  }).sort((left, right) => (
    right.coordinationScore - left.coordinationScore
    || Number(right.item.revisionDue) - Number(left.item.revisionDue)
    || (right.goalRelevance ?? -1) - (left.goalRelevance ?? -1)
    || right.basePriority - left.basePriority
    || right.courseContexts.length - left.courseContexts.length
    || left.item.name.localeCompare(right.item.name)
  ));

  return {
    activeGoal: input.activeGoal ? {
      goalId: input.activeGoal.goalId,
      name: input.activeGoal.name,
      priority: input.activeGoal.priority,
      targetDate: input.activeGoal.targetDate,
    } : null,
    courses: input.courses,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    learnNext: recommendations[0] ?? null,
    policyVersion: coordinationPolicy.version,
    summary: {
      activeCourses: input.courses.filter((course) => course.enrollmentStatus === "ACTIVE").length,
      coordinatedCourses: input.courses.filter((course) => course.enrollmentStatus === "ACTIVE" && course.pathState === "READY").length,
      coursesWithoutPaths: input.courses.filter((course) => course.enrollmentStatus === "ACTIVE" && course.pathState === "NOT_GENERATED").length,
      goalAlignedCandidates: recommendations.filter((recommendation) => recommendation.goalRelevance !== null).length,
      sharedSkillContexts: recommendations.reduce(
        (total, recommendation) => total + Math.max(0, recommendation.courseContexts.length - 1),
        0,
      ),
    },
  };
}
