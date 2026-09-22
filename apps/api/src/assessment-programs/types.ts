import type { DiagnosticAttempt, DiagnosticContext } from "../diagnostics/types.js";
import type { DiagnosticClassification } from "../diagnostics/estimation.js";

export type AssessmentProgramMode = "QUICK_PLACEMENT" | "COMPREHENSIVE";
export type AssessmentCoverageStatus = "ASSESSED" | "NEEDS_CONFIRMATION" | "UNASSESSED" | "NEEDS_REFRESH";
export type AssessmentBankStatus = "READY" | "LIMITED" | "BLOCKED";
export type AssessmentProgramStatus = "IN_PROGRESS" | "COMPLETED" | "BLOCKED";
export type SelfReportFamiliarity = "NEVER_LEARNED" | "KNOW_A_LITTLE" | "COMFORTABLE" | "VERY_COMFORTABLE" | "UNSURE";
export type SelfReportConfidence = "LOW" | "MEDIUM" | "HIGH";
export type SelfReportExperienceSource = "LEARNED_IN_COURSE" | "SOLVED_PROBLEMS" | "USED_IN_PROJECT" | "READ_OR_WATCHED_ONLY" | "OTHER";

export interface AssessmentCoverageSummary {
  totalSkills: number;
  assessed: number;
  mastered: number;
  observed: number;
  needsConfirmation: number;
  unassessed: number;
  needsRefresh: number;
  blocked: number;
  assessedPercentage: number;
  masteredPercentage: number;
}

export interface AssessmentProgramSkill {
  skillId: string;
  skillName: string;
  category: string;
  moduleId: string;
  moduleName: string;
  moduleSequence: number;
  sequence: number;
  coverageStatus: AssessmentCoverageStatus;
  coverageReason: string;
  mastered: boolean;
  mastery: number | null;
  confidence: number | null;
  evidenceState: "UNKNOWN" | "ESTIMATED" | "ASSESSED" | "VERIFIED";
  retentionState: "UNKNOWN" | "STRONG" | "MODERATE" | "AT_RISK" | "CRITICAL";
  latestClassification: DiagnosticClassification | null;
  lastEvidenceAt: string | null;
  distinctQuestionCount: number;
  applicationQuestionCount: number;
  difficultyBandCount: number;
  bankStatus: AssessmentBankStatus;
  bankReason: string;
  questionCount: number;
  availableQuestionCount: number;
  dependentCount: number;
  sessionCount: number;
}

export interface CourseSelfReport {
  submittedAt: string | null;
  moduleReports: Array<{
    moduleId: string;
    familiarity: SelfReportFamiliarity;
    confidence: SelfReportConfidence | null;
  }>;
  skillReports: Array<{
    skillId: string;
    familiarity: SelfReportFamiliarity;
    confidence: SelfReportConfidence | null;
    experienceSource: SelfReportExperienceSource | null;
    verificationStatus: "UNVERIFIED" | "CONFIRMED" | "NOT_CONFIRMED";
  }>;
}

export interface AssessmentBacklogItem {
  skillId: string;
  skillName: string;
  moduleName: string;
  priority: number;
  reason: "CURRENT_PATH_BLOCKER" | "PREREQUISITE_GATEWAY" | "CONTRADICTORY_EVIDENCE" | "LOW_CONFIDENCE" | "RETENTION_RISK" | "NOT_TESTED" | "UPCOMING_MODULE" | "STARVATION_PREVENTION" | "SUFFICIENT_EVIDENCE" | "QUESTION_BANK_BLOCKED";
  status: "PENDING" | "IN_PROGRESS" | "RESOLVED" | "BLOCKED";
}

export interface KnowledgeBoundarySkill {
  skillId: string;
  skillName: string;
  moduleName: string;
  status: "STRONG" | "READY" | "NEEDS_WORK" | "NEEDS_CONFIRMATION" | "NOT_ASSESSED_YET";
  assessmentCoverage: "NOT_TESTED" | "PARTIALLY_ASSESSED" | "SUFFICIENT_EVIDENCE";
  mastery: number | null;
  confidence: number | null;
}

export interface KnowledgeBoundarySummary {
  found: boolean;
  pathReady: boolean;
  startingSkillId: string | null;
  startingSkillName: string | null;
  reason: string;
  skills: KnowledgeBoundarySkill[];
}

export interface AssessmentProgramModule {
  id: string;
  name: string;
  sequence: number;
  coverage: AssessmentCoverageSummary;
  skillIds: string[];
}

export interface AssessmentProgramSummary {
  id: string;
  enrollmentId: string;
  mode: AssessmentProgramMode;
  status: AssessmentProgramStatus;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  completedSessionCount: number;
  activeSessionId: string | null;
}

export interface AssessmentProgramSession {
  id: string;
  sequence: number;
  attemptId: string | null;
  focusSkillIds: string[];
  moduleId: string | null;
  status: "PLANNED" | "IN_PROGRESS" | "SUBMITTED";
  createdAt: string;
  submittedAt: string | null;
  questionCount: number;
}

export interface AssessmentSessionPlan {
  focusSkillIds: string[];
  moduleId: string | null;
  estimatedSessionCount: number;
  maximumQuestions: number;
  reason: string;
}

export interface AssessmentProgramOverview {
  context: DiagnosticContext;
  coverage: AssessmentCoverageSummary;
  modules: AssessmentProgramModule[];
  skills: AssessmentProgramSkill[];
  program: AssessmentProgramSummary | null;
  sessions: AssessmentProgramSession[];
  nextSession: AssessmentSessionPlan | null;
  selfReport: CourseSelfReport;
  knowledgeBoundary: KnowledgeBoundarySummary;
  backlog: AssessmentBacklogItem[];
  policy: {
    version: string;
    maximumSkillsPerSession: number;
    maximumQuestionsPerSession: number;
    coverageExplanation: string;
    masteryExplanation: string;
  };
}

export interface AssessmentProgramServiceContract {
  getOverview(learnerId: string, input: { enrollmentId: string }): Promise<AssessmentProgramOverview>;
  create(learnerId: string, input: {
    enrollmentId: string;
    mode: AssessmentProgramMode;
  }): Promise<AssessmentProgramOverview>;
  getProgram(learnerId: string, programId: string): Promise<AssessmentProgramOverview>;
  saveSelfReport?(learnerId: string, input: {
    enrollmentId: string;
    modules: Array<{ moduleId: string; familiarity: SelfReportFamiliarity; confidence?: SelfReportConfidence | null }>;
    skills?: Array<{ skillId: string; familiarity: SelfReportFamiliarity; confidence?: SelfReportConfidence | null; experienceSource?: SelfReportExperienceSource | null }>;
  }): Promise<AssessmentProgramOverview>;
  startFocusedCheck?(learnerId: string, input: {
    enrollmentId: string;
    skillId: string;
    intent: "KNOWLEDGE_CHECK" | "CHALLENGE";
  }): Promise<DiagnosticAttempt>;
  startSession(learnerId: string, programId: string): Promise<{
    program: AssessmentProgramOverview;
    session: AssessmentProgramSession;
    attempt: DiagnosticAttempt;
  }>;
}
