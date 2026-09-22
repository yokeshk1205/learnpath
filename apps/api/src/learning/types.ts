export type ResourceEventType = "RESOURCE_COMPLETED" | "RESOURCE_SKIPPED" | "RESOURCE_STARTED";
export type ResourceHistoryStatus = "COMPLETED" | "IN_PROGRESS" | "SKIPPED";
export type ResourceType = "CONCEPT_GUIDE" | "INTERACTIVE" | "REFERENCE" | "VIDEO" | "WORKED_EXAMPLE";

export type JsonValue = boolean | number | string | null;

export interface ResourceCourseContext {
  courseId: string;
  courseName: string;
  isEnrolled: boolean;
  moduleId: string;
  moduleName: string;
}

export interface ResourceHistory {
  completionCount: number;
  firstStartedAt: string;
  lastActivityAt: string;
  lastCompletedAt: string | null;
  lastSkippedAt: string | null;
  lastStartedAt: string;
  sessionCount: number;
  skipCount: number;
  status: ResourceHistoryStatus;
  totalTimeSpentSeconds: number;
}

export interface LearningResourceSummary {
  contexts: ResourceCourseContext[];
  difficulty: number;
  estimatedMinutes: number;
  id: string;
  mastery: number | null;
  progress: ResourceHistory | null;
  resourceType: ResourceType;
  skillCategory: string;
  skillId: string;
  skillName: string;
  slug: string;
  summary: string;
  title: string;
}

export interface LearningResourceDetail extends LearningResourceSummary {
  contentSections: Array<{ body: string; heading: string }>;
  externalUrl: string | null;
  learningObjectives: string[];
}

export interface LearningActivityEvent {
  courseId: string | null;
  courseName: string | null;
  durationSeconds: number;
  eventType:
    | "ASSESSMENT_SUBMITTED"
    | "ASSESSMENT_STARTED"
    | "ASSESSMENT_COMPLETED"
    | "LESSON_COMPLETED"
    | "LESSON_STARTED"
    | "PRACTICE_COMPLETED"
    | "PRACTICE_STARTED"
    | "RETENTION_CHECK_COMPLETED"
    | "RETENTION_CHECK_STARTED"
    | ResourceEventType;
  id: string;
  metadata: Record<string, JsonValue>;
  moduleId: string | null;
  moduleName: string | null;
  occurredAt: string;
  resourceId: string | null;
  resourceTitle: string | null;
  result: Record<string, JsonValue>;
  skillId: string | null;
  skillName: string | null;
}

export interface LearningOverview {
  activity: LearningActivityEvent[];
  generatedAt: string;
  resources: LearningResourceSummary[];
  summary: {
    availableResources: number;
    completedResources: number;
    eventsRecorded: number;
    skillsCovered: number;
    startedResources: number;
    totalTimeSpentSeconds: number;
  };
}

export interface LearningContextFilter {
  courseId?: string;
  moduleId?: string;
  skillId?: string;
}

export interface RecordResourceEventInput {
  courseId?: string;
  durationSeconds: number;
  eventType: ResourceEventType;
  metadata?: Record<string, JsonValue>;
  moduleId?: string;
  result?: Record<string, JsonValue>;
}

export interface LearningServiceContract {
  getOverview(learnerId: string, filter: LearningContextFilter): Promise<LearningOverview>;
  getResource(learnerId: string, resourceId: string): Promise<LearningResourceDetail>;
  recordResourceEvent(
    learnerId: string,
    resourceId: string,
    input: RecordResourceEventInput,
  ): Promise<{ event: LearningActivityEvent; resource: LearningResourceDetail }>;
}
