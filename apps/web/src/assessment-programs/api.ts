import { apiRequest } from "../auth/api";
import type { DiagnosticAttempt, DiagnosticContext, DiagnosticSkillResult } from "../diagnostics/api";

export type AssessmentProgramMode = "QUICK_PLACEMENT" | "COMPREHENSIVE";
export type AssessmentCoverageStatus = "ASSESSED" | "NEEDS_CONFIRMATION" | "UNASSESSED" | "NEEDS_REFRESH";
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
  latestClassification: DiagnosticSkillResult["classification"] | null;
  lastEvidenceAt: string | null;
  distinctQuestionCount: number;
  applicationQuestionCount: number;
  difficultyBandCount: number;
  bankStatus: "READY" | "LIMITED" | "BLOCKED";
  bankReason: string;
  questionCount: number;
  availableQuestionCount: number;
  dependentCount: number;
  sessionCount: number;
}
export interface AssessmentProgramSummary {
  id: string;
  enrollmentId: string;
  mode: AssessmentProgramMode;
  status: "IN_PROGRESS" | "COMPLETED" | "BLOCKED";
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
export interface AssessmentProgramOverview {
  context: DiagnosticContext;
  coverage: AssessmentCoverageSummary;
  modules: Array<{ id: string; name: string; sequence: number; coverage: AssessmentCoverageSummary; skillIds: string[] }>;
  skills: AssessmentProgramSkill[];
  program: AssessmentProgramSummary | null;
  sessions: AssessmentProgramSession[];
  nextSession: { focusSkillIds: string[]; moduleId: string | null; estimatedSessionCount: number; maximumQuestions: number; reason: string } | null;
  selfReport: {
    submittedAt: string | null;
    moduleReports: Array<{ moduleId: string; familiarity: SelfReportFamiliarity; confidence: SelfReportConfidence | null }>;
    skillReports: Array<{ skillId: string; familiarity: SelfReportFamiliarity; confidence: SelfReportConfidence | null; experienceSource: SelfReportExperienceSource | null; verificationStatus: "UNVERIFIED" | "CONFIRMED" | "NOT_CONFIRMED" }>;
  };
  knowledgeBoundary: {
    found: boolean;
    pathReady: boolean;
    startingSkillId: string | null;
    startingSkillName: string | null;
    reason: string;
    skills: Array<{ skillId: string; skillName: string; moduleName: string; status: "STRONG" | "READY" | "NEEDS_WORK" | "NEEDS_CONFIRMATION" | "NOT_ASSESSED_YET"; assessmentCoverage: "NOT_TESTED" | "PARTIALLY_ASSESSED" | "SUFFICIENT_EVIDENCE"; mastery: number | null; confidence: number | null }>;
  };
  backlog: Array<{ skillId: string; skillName: string; moduleName: string; priority: number; reason: string; status: "PENDING" | "IN_PROGRESS" | "RESOLVED" | "BLOCKED" }>;
  policy: { version: string; maximumSkillsPerSession: number; maximumQuestionsPerSession: number; coverageExplanation: string; masteryExplanation: string };
}
const headers = (token: string): HeadersInit => ({ Authorization: `Bearer ${token}` });
export function getAssessmentProgramOverview(token: string, enrollmentId: string): Promise<AssessmentProgramOverview> {
  return apiRequest(`/assessment-programs/overview?${new URLSearchParams({ enrollmentId })}`, { headers: headers(token) });
}
export function getAssessmentProgram(token: string, programId: string): Promise<AssessmentProgramOverview> {
  return apiRequest(`/assessment-programs/${programId}`, { headers: headers(token) });
}
export function createAssessmentProgram(token: string, enrollmentId: string, mode: AssessmentProgramMode): Promise<AssessmentProgramOverview> {
  return apiRequest("/assessment-programs", { method: "POST", headers: headers(token), body: JSON.stringify({ enrollmentId, mode }) });
}
export function startAssessmentProgramSession(token: string, programId: string): Promise<{ program: AssessmentProgramOverview; session: AssessmentProgramSession; attempt: DiagnosticAttempt }> {
  return apiRequest(`/assessment-programs/${programId}/sessions`, { method: "POST", headers: headers(token), body: JSON.stringify({}) });
}

export function saveCourseSelfReport(token: string, input: {
  enrollmentId: string;
  modules: Array<{ moduleId: string; familiarity: SelfReportFamiliarity; confidence?: SelfReportConfidence | null }>;
  skills?: Array<{ skillId: string; familiarity: SelfReportFamiliarity; confidence?: SelfReportConfidence | null; experienceSource?: SelfReportExperienceSource | null }>;
}): Promise<AssessmentProgramOverview> {
  return apiRequest("/assessment-programs/self-report", {
    method: "PUT", headers: headers(token), body: JSON.stringify(input),
  });
}

export function startFocusedKnowledgeCheck(token: string, input: {
  enrollmentId: string;
  skillId: string;
  intent: "KNOWLEDGE_CHECK" | "CHALLENGE";
}): Promise<DiagnosticAttempt> {
  return apiRequest("/assessment-programs/focused-checks", {
    method: "POST", headers: headers(token), body: JSON.stringify(input),
  });
}
