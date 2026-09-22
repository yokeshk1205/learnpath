export const pathPolicy = {
  featureVersion: "learner-candidate-features-v2",
  gatewayPriorityMaximumBonus: 0.06,
  revisionPriorityBonus: 0.08,
  version: "course-path-policy-v2-graph",
} as const;

export const coordinationPolicy = {
  crossCourseBonusPerAdditionalContext: 0.04,
  goalAlignmentMaximumBonus: 0.06,
  maximumAdditionalContexts: 2,
  version: "cross-course-coordination-v1",
} as const;
