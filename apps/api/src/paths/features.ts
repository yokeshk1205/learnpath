import type { Pool } from "pg";

import type { CandidateOverview, CandidateSkill } from "../candidates/types.js";

export const liveFeatureNames = [
  "learner_experience", "overall_mastery", "learning_pace", "activity_frequency",
  "consistency", "learner_performance_proxy", "prior_interaction_count",
  "historical_completion_rate", "historical_assessment_improvement", "historical_feedback",
  "learner_cold_start", "difficulty", "goal_relevance", "popularity", "expected_time",
  "prerequisite_depth", "dependent_count", "candidate_is_course_skill", "current_mastery",
  "confidence", "mastery_gap", "evidence_strength", "mastery_confidence_alignment",
  "recent_score", "average_score", "score_trend", "attempt_count", "correct_rate",
  "score_volatility", "skill_completion_rate", "skill_average_score", "days_since_practice",
  "retention", "retention_state_fresh", "retention_state_due", "retention_state_critical",
  "revision_due", "prerequisite_count", "satisfied_ratio", "minimum_prerequisite_mastery",
  "average_prerequisite_mastery", "prerequisite_readiness", "has_prerequisites",
  "previous_interaction", "time_spent", "previous_completion", "recommendation_response",
  "previous_engagement", "previous_practice", "previous_candidate_same_skill",
  "candidate_is_learn", "candidate_is_revision", "candidate_is_supporting",
  "elapsed_since_previous_interaction", "course_context_switch",
] as const;

type DatabaseRow = Record<string, unknown>;

interface CurriculumSkillMetadata {
  dependentCount: number;
  estimatedMinutes: number;
}

interface SkillEvidenceMetadata {
  averageScore: number | null;
  count: number;
  lastEvidenceAt: Date | null;
  scoreVolatility: number;
}

export interface LiveFeatureBatch {
  lastActivitySkillId: string | null;
  vectors: Array<{ features: Record<string, number>; skillId: string }>;
}

function numeric(value: unknown, fallback = 0): number {
  if (value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nullableNumeric(value: unknown): number | null {
  return value === null || value === undefined ? null : numeric(value);
}

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function daysSince(date: Date | null): number {
  if (!date) return 60;
  return Math.max(0, (Date.now() - date.getTime()) / 86_400_000);
}

function experience(priorInteractions: number): number {
  if (priorInteractions >= 20) return 1;
  if (priorInteractions >= 5) return 0.5;
  return 0;
}

function candidateVector(input: {
  activityFrequency: number;
  candidate: CandidateSkill;
  completionRate: number;
  consistency: number;
  curriculum: CurriculumSkillMetadata;
  courseContextSwitch: number;
  depthMaximum: number;
  dependentMaximum: number;
  elapsedSincePrevious: number;
  evidence: SkillEvidenceMetadata;
  evidenceCount: number;
  globalAverageScore: number;
  historicalImprovement: number;
  lastActivitySkillId: string | null;
  learningPace: number;
  overallMastery: number;
  previousCompletion: number;
  previousEngagement: number;
  previousInteraction: number;
  previousPractice: number;
  previousRecommendationResponse: number;
  previousTimeSpent: number;
  prerequisiteMaximum: number;
  priorInteractions: number;
  expectedTimeMaximum: number;
  popularityMaximum: { courseContexts: number; dependents: number };
}): Record<string, number> {
  const { candidate } = input;
  const currentMastery = candidate.mastery ?? 0;
  const confidence = candidate.confidence ?? 0;
  const recentScore = input.evidence.averageScore ?? candidate.mastery ?? 0.5;
  const required = candidate.prerequisites.filter((item) => item.relationshipType === "REQUIRED");
  const prerequisiteMasteries = required.map((item) => item.currentMastery ?? 0);
  const satisfiedRatio = required.length
    ? required.filter((item) => item.satisfied).length / required.length
    : 1;
  const minimumPrerequisiteMastery = required.length ? Math.min(...prerequisiteMasteries) : 1;
  const averagePrerequisiteMastery = required.length
    ? prerequisiteMasteries.reduce((sum, value) => sum + value, 0) / required.length
    : 1;
  const readiness = required.length
    ? required.reduce((sum, item) => sum + (item.currentMastery ?? 0) / Math.max(item.requiredMastery, 0.01), 0) / required.length
    : 1;
  const coverage = candidate.popularity.courseContexts / Math.max(input.popularityMaximum.courseContexts, 1);
  const centrality = input.curriculum.dependentCount / Math.max(input.popularityMaximum.dependents, 1);
  const evidenceStrength = clamp(Math.log1p(input.evidence.count) / Math.log(21));
  const averageScore = input.evidence.averageScore ?? recentScore;
  const performanceProxy = clamp(0.45 * input.overallMastery + 0.20 * confidence + 0.35 * recentScore);
  const retention = candidate.retention ?? currentMastery;
  const hasRetentionEvidence = candidate.retention !== null;
  const values: Record<(typeof liveFeatureNames)[number], number> = {
    activity_frequency: clamp(input.activityFrequency),
    attempt_count: clamp(input.evidence.count / 10),
    average_prerequisite_mastery: clamp(averagePrerequisiteMastery),
    average_score: clamp(input.globalAverageScore),
    candidate_is_course_skill: candidate.isContextSkill ? 1 : 0,
    candidate_is_learn: candidate.kind === "LEARN" ? 1 : 0,
    candidate_is_revision: candidate.kind === "REVISION" ? 1 : 0,
    candidate_is_supporting: candidate.kind === "SUPPORTING_PREREQUISITE" ? 1 : 0,
    confidence: clamp(confidence),
    consistency: clamp(input.consistency),
    correct_rate: clamp(input.globalAverageScore),
    course_context_switch: input.courseContextSwitch,
    current_mastery: clamp(currentMastery),
    days_since_practice: clamp(daysSince(input.evidence.lastEvidenceAt) / 60),
    dependent_count: clamp(input.curriculum.dependentCount / Math.max(input.dependentMaximum, 1)),
    difficulty: clamp((candidate.difficulty - 1) / 4),
    elapsed_since_previous_interaction: clamp(input.elapsedSincePrevious / 7),
    evidence_strength: evidenceStrength,
    expected_time: clamp(input.curriculum.estimatedMinutes / Math.max(input.expectedTimeMaximum, 1)),
    goal_relevance: candidate.kind === "SUPPORTING_PREREQUISITE" ? 0.72 : 1,
    has_prerequisites: required.length ? 1 : 0,
    historical_assessment_improvement: clamp(input.historicalImprovement, -1, 1),
    historical_completion_rate: clamp(input.completionRate),
    historical_feedback: 0.5,
    learner_cold_start: input.priorInteractions === 0 ? 1 : 0,
    learner_experience: experience(input.priorInteractions),
    learner_performance_proxy: performanceProxy,
    learning_pace: clamp(input.learningPace),
    mastery_confidence_alignment: clamp(1 - Math.abs(currentMastery - confidence)),
    mastery_gap: clamp(1 - currentMastery),
    minimum_prerequisite_mastery: clamp(minimumPrerequisiteMastery),
    overall_mastery: clamp(input.overallMastery),
    popularity: clamp(0.6 * coverage + 0.4 * centrality),
    prerequisite_count: clamp(required.length / Math.max(input.prerequisiteMaximum, 1)),
    prerequisite_depth: clamp(candidate.dependencyLevel / Math.max(input.depthMaximum, 1)),
    prerequisite_readiness: clamp(readiness / 1.5),
    previous_candidate_same_skill: input.lastActivitySkillId === candidate.id ? 1 : 0,
    previous_completion: input.previousCompletion,
    previous_engagement: input.previousEngagement,
    previous_interaction: input.previousInteraction,
    previous_practice: input.previousPractice,
    prior_interaction_count: clamp(input.priorInteractions / 20),
    recommendation_response: input.previousRecommendationResponse,
    recent_score: clamp(recentScore),
    retention: clamp(retention),
    retention_state_critical: hasRetentionEvidence && retention < 0.5 ? 1 : 0,
    retention_state_due: hasRetentionEvidence && retention >= 0.5 && retention < 0.75 ? 1 : 0,
    retention_state_fresh: hasRetentionEvidence && retention >= 0.75 ? 1 : 0,
    revision_due: candidate.revisionDue ? 1 : 0,
    satisfied_ratio: clamp(satisfiedRatio),
    score_trend: clamp(recentScore - input.globalAverageScore, -1, 1),
    score_volatility: clamp(input.evidence.scoreVolatility),
    skill_average_score: clamp(averageScore),
    skill_completion_rate: clamp(averageScore),
    time_spent: clamp(input.previousTimeSpent),
  };
  return Object.fromEntries(liveFeatureNames.map((name) => [name, round(values[name])]));
}

export async function buildLiveFeatureBatch(
  pool: Pool,
  learnerId: string,
  overview: CandidateOverview,
): Promise<LiveFeatureBatch> {
  const candidates = overview.candidates.eligible;
  const skillIds = candidates.map((candidate) => candidate.id);
  const [learnerResult, evidenceResult, curriculumResult, historyResult, lastActivityResult, recommendationResult] = await Promise.all([
    pool.query(
      `WITH evidence AS (
         SELECT COUNT(*)::int AS evidence_count,
                COALESCE(AVG(score) FILTER (WHERE score IS NOT NULL), 0.5) AS average_score,
                COALESCE(STDDEV_POP(score) FILTER (WHERE score IS NOT NULL), 0) AS score_volatility,
                COALESCE(AVG(mastery_after - COALESCE(mastery_before, mastery_after)), 0) AS assessment_improvement
         FROM skill_evidence WHERE learner_id = $1
       ), mastery AS (
         SELECT COALESCE(AVG(mastery) FILTER (WHERE mastery IS NOT NULL), 0.5) AS overall_mastery
         FROM learner_skill_mastery WHERE learner_id = $1
       ), activity AS (
         SELECT COUNT(*)::int AS activity_count,
                COUNT(DISTINCT occurred_at::date)::int AS active_days
         FROM learner_activity_events WHERE learner_id = $1
       )
       SELECT evidence.*, mastery.*, activity.* FROM evidence, mastery, activity`,
      [learnerId],
    ),
    pool.query(
      `SELECT skill_id, COUNT(*)::int AS evidence_count,
              AVG(score) FILTER (WHERE score IS NOT NULL) AS average_score,
              COALESCE(STDDEV_POP(score) FILTER (WHERE score IS NOT NULL), 0) AS score_volatility,
              MAX(created_at) AS last_evidence_at
       FROM skill_evidence
       WHERE learner_id = $1 AND skill_id = ANY($2::uuid[])
       GROUP BY skill_id`,
      [learnerId, skillIds],
    ),
    pool.query(
      `SELECT skill.id, skill.estimated_minutes,
              COUNT(prerequisite.skill_id) FILTER (WHERE prerequisite.relationship_type = 'REQUIRED')::int AS dependent_count
       FROM skills skill
       LEFT JOIN skill_prerequisites prerequisite ON prerequisite.prerequisite_skill_id = skill.id
       WHERE skill.id = ANY($1::uuid[])
       GROUP BY skill.id`,
      [skillIds],
    ),
    pool.query(
      `SELECT COALESCE(AVG(CASE WHEN history.status = 'COMPLETED' THEN 1.0 ELSE 0.0 END), 0.5) AS completion_rate,
              COALESCE(AVG(
                history.total_time_spent_seconds / 60.0 /
                NULLIF(resource.estimated_minutes * GREATEST(history.session_count, 1), 0)
              ), 1.15) AS time_ratio
       FROM learner_learning_history history
       JOIN learning_resources resource ON resource.id = history.resource_id
       WHERE history.learner_id = $1`,
      [learnerId],
    ),
    pool.query(
      `SELECT activity.course_id, activity.duration_seconds, activity.event_type,
              activity.occurred_at, activity.skill_id, resource.estimated_minutes
       FROM learner_activity_events activity
       LEFT JOIN learning_resources resource ON resource.id = activity.resource_id
       WHERE activity.learner_id = $1
       ORDER BY activity.occurred_at DESC LIMIT 1`,
      [learnerId],
    ),
    pool.query(
      `SELECT event_type FROM learner_activity_events
       WHERE learner_id = $1 AND event_type IN ('RECOMMENDATION_ACCEPTED', 'RECOMMENDATION_REJECTED')
       ORDER BY occurred_at DESC LIMIT 1`,
      [learnerId],
    ),
  ]);
  const learner = (learnerResult.rows[0] ?? {}) as DatabaseRow;
  const history = (historyResult.rows[0] ?? {}) as DatabaseRow;
  const lastActivity = lastActivityResult.rows[0] as DatabaseRow | undefined;
  const evidenceBySkill = new Map<string, SkillEvidenceMetadata>(
    (evidenceResult.rows as DatabaseRow[]).map((row) => [String(row.skill_id), {
      averageScore: nullableNumeric(row.average_score),
      count: numeric(row.evidence_count),
      lastEvidenceAt: row.last_evidence_at ? new Date(String(row.last_evidence_at)) : null,
      scoreVolatility: numeric(row.score_volatility),
    }]),
  );
  const curriculumBySkill = new Map<string, CurriculumSkillMetadata>(
    (curriculumResult.rows as DatabaseRow[]).map((row) => [String(row.id), {
      dependentCount: numeric(row.dependent_count),
      estimatedMinutes: numeric(row.estimated_minutes, 1),
    }]),
  );
  const evidenceCount = numeric(learner.evidence_count);
  const globalAverageScore = numeric(learner.average_score, 0.5);
  const scoreVolatility = numeric(learner.score_volatility);
  const activityCount = numeric(learner.activity_count);
  const activeDays = Math.max(numeric(learner.active_days), 1);
  const timeRatio = numeric(history.time_ratio, 1.15);
  const lastEvent = lastActivity?.event_type ? String(lastActivity.event_type) : null;
  const lastSkillId = lastActivity?.skill_id ? String(lastActivity.skill_id) : null;
  const lastExpectedMinutes = numeric(lastActivity?.estimated_minutes);
  const lastDurationMinutes = numeric(lastActivity?.duration_seconds) / 60;
  const maxExpectedTime = Math.max(...candidates.map((candidate) => curriculumBySkill.get(candidate.id)?.estimatedMinutes ?? 1), 1);
  const maxDepth = Math.max(...candidates.map((candidate) => candidate.dependencyLevel), 1);
  const maxDependents = Math.max(...candidates.map((candidate) => curriculumBySkill.get(candidate.id)?.dependentCount ?? 0), 1);
  const maxPrerequisites = Math.max(...candidates.map((candidate) => candidate.prerequisiteCount), 1);
  const maxCourseContexts = Math.max(...candidates.map((candidate) => candidate.popularity.courseContexts), 1);
  const recommendationEvent = recommendationResult.rows[0]?.event_type
    ? String(recommendationResult.rows[0].event_type)
    : null;
  const shared = {
    activityFrequency: clamp(activityCount / activeDays),
    completionRate: numeric(history.completion_rate, 0.5),
    consistency: evidenceCount > 1 ? 1 - scoreVolatility : 0.5,
    courseContextSwitch: lastActivity?.course_id && String(lastActivity.course_id) !== overview.context.courseId ? 1 : 0,
    depthMaximum: maxDepth,
    dependentMaximum: maxDependents,
    elapsedSincePrevious: lastActivity?.occurred_at ? daysSince(new Date(String(lastActivity.occurred_at))) : 7,
    evidenceCount,
    expectedTimeMaximum: maxExpectedTime,
    globalAverageScore,
    historicalImprovement: numeric(learner.assessment_improvement),
    lastActivitySkillId: lastSkillId,
    learningPace: clamp((1.5 - timeRatio) / 0.7),
    overallMastery: numeric(learner.overall_mastery, 0.5),
    popularityMaximum: { courseContexts: maxCourseContexts, dependents: maxDependents },
    prerequisiteMaximum: maxPrerequisites,
    previousCompletion: lastEvent?.includes("COMPLETED") ? 1 : 0,
    previousEngagement: lastEvent?.includes("COMPLETED") ? 1 : lastEvent?.includes("SKIPPED") ? 0.2 : lastEvent ? 0.5 : 0,
    previousInteraction: lastEvent ? 1 : 0,
    previousPractice: lastEvent?.startsWith("PRACTICE") || lastEvent?.startsWith("QUIZ") || lastEvent === "ASSESSMENT_SUBMITTED" ? 0.2 : 0,
    previousRecommendationResponse: recommendationEvent === "RECOMMENDATION_ACCEPTED" ? 1 : 0,
    previousTimeSpent: lastExpectedMinutes ? clamp(lastDurationMinutes / lastExpectedMinutes / 2) : 0,
    priorInteractions: evidenceCount,
  };
  return {
    lastActivitySkillId: lastSkillId,
    vectors: candidates.map((candidate) => ({
      features: candidateVector({
        ...shared,
        candidate,
        curriculum: curriculumBySkill.get(candidate.id) ?? { dependentCount: 0, estimatedMinutes: 1 },
        evidence: evidenceBySkill.get(candidate.id) ?? { averageScore: null, count: 0, lastEvidenceAt: null, scoreVolatility: 0 },
      }),
      skillId: candidate.id,
    })),
  };
}
