import { apiRequest } from "../auth/api";

export interface DiagnosticAttemptSummary {
  correctCount: number | null;
  id: string;
  overallScore: number | null;
  questionCount: number;
  startedAt: string;
  status: "IN_PROGRESS" | "SUBMITTED";
  submittedAt: string | null;
}

export interface DiagnosticOverview {
  activeGoal: { id: string; name: string; slug: string } | null;
  assessment: {
    description: string;
    estimatedMinutes: number;
    id: string;
    questionCount: number;
    skillCount: number;
    title: string;
  } | null;
  context: DiagnosticContext | null;
  inProgressAttempt: DiagnosticAttemptSummary | null;
  latestAttempt: DiagnosticAttemptSummary | null;
}

export interface DiagnosticContext {
  enrollmentId: string | null;
  id: string;
  name: string;
  slug: string;
  type: "COURSE" | "GOAL";
}

export interface DiagnosticQuestion {
  questionType?: "SINGLE_CHOICE" | "MULTI_SELECT" | "NUMERIC";
  numericUnit?: string | null;
  cognitiveLevel: "ANALYZE" | "APPLY" | "REMEMBER" | "UNDERSTAND";
  difficulty: number;
  discrimination: number;
  id: string;
  options: Array<{ content: string; id: string; key: string }>;
  prompt: string;
  selectionReason: string;
  selectionStage: "CONFIRMATION" | "COVERAGE" | "LEGACY" | "VERIFICATION";
  sequence: number;
  skillCategory: string;
  skillId: string;
  skillName: string;
}

export interface DiagnosticDraftAnswer {
  isUnsure: boolean;
  optionId: string | null;
  selectedOptionIds?: string[];
  numericAnswer?: number | null;
  questionId: string;
  responseSeconds: number;
  savedAt: string;
}

export interface DiagnosticAnswerInput {
  isUnsure?: boolean;
  optionId?: string | null;
  selectedOptionIds?: string[];
  numericAnswer?: number;
  questionId: string;
  responseSeconds?: number;
}

export interface DiagnosticSelectionSummary {
  answeredCount: number;
  canComplete: boolean;
  currentStage: "CONFIRMATION" | "COVERAGE" | "LEGACY" | "VERIFICATION";
  maximumQuestionCount: number;
  minimumQuestionCount: number;
  policyVersion: string;
  questionBudget: number;
  recognizedSkillCount: number;
  selectedQuestionCount: number;
  selectedSkillCount: number;
  skippedSkillCount: number;
  stoppingReason: string | null;
  templateQuestionCount: number;
}

export interface DiagnosticAttempt {
  assessmentProgramId?: string | null;
  assessmentProgramSessionId?: string | null;
  focusSkillIds?: string[] | null;
  intent?: "PLACEMENT" | "COURSE_COVERAGE" | "KNOWLEDGE_CHECK" | "CHALLENGE";
  assessmentDescription: string;
  assessmentTitle: string;
  estimatedMinutes: number;
  context: DiagnosticContext;
  goal: { id: string; name: string; slug: string } | null;
  id: string;
  questions: DiagnosticQuestion[];
  savedAnswers: DiagnosticDraftAnswer[];
  selection: DiagnosticSelectionSummary;
  startedAt: string;
  status: "IN_PROGRESS";
}

export interface DiagnosticSkillResult {
  applicationObservationCount: number;
  category: string;
  classification: "MASTERED" | "READY" | "GAP" | "FORGOTTEN" | "FRAGILE_FOUNDATION" | "NEEDS_CONFIRMATION" | "PROBED" | "NOT_TESTED";
  cognitiveCoverage: Record<"analyze" | "apply" | "remember" | "understand", boolean>;
  confidenceAfter: number;
  confidenceBefore: number | null;
  correctCount: number;
  decisionReason: string;
  difficultyCoverage: Record<"easy" | "hard" | "medium", boolean>;
  evidenceStateAfter: "ASSESSED" | "ESTIMATED" | "UNKNOWN" | "VERIFIED";
  evidenceStateBefore: "ASSESSED" | "ESTIMATED" | "UNKNOWN" | "VERIFIED";
  masteryAfter: number;
  masteryBefore: number | null;
  masteryLowerBound: number;
  masteryUpperBound: number;
  misconceptions: string[];
  questionCount: number;
  score: number;
  selfReportFamiliarity?: "NEVER_LEARNED" | "KNOW_A_LITTLE" | "COMFORTABLE" | "VERY_COMFORTABLE" | "UNSURE" | null;
  selfReportVerification?: "UNVERIFIED" | "CONFIRMED" | "NOT_CONFIRMED" | null;
  skillId: string;
  skillName: string;
}

export interface DiagnosticUntestedSkill {
  category: string;
  confidence: number | null;
  evidenceState: "ASSESSED" | "ESTIMATED" | "UNKNOWN" | "VERIFIED";
  mastery: number | null;
  reason: string;
  recognizedFromPassport: boolean;
  retentionState: "AT_RISK" | "CRITICAL" | "MODERATE" | "STRONG" | "UNKNOWN";
  skillId: string;
  skillName: string;
}

export interface DiagnosticResult {
  answers: Array<{
    questionType?: DiagnosticQuestion["questionType"];
    cognitiveLevel: "ANALYZE" | "APPLY" | "REMEMBER" | "UNDERSTAND";
    correctOptionContent: string;
    correctOptionId: string | null;
    difficulty: number;
    evidenceStrength: number;
    explanation: string;
    isCorrect: boolean;
    isUnsure: boolean;
    misconceptionCode: string | null;
    prompt: string;
    questionId: string;
    responseSeconds: number;
    selectedOptionContent: string;
    selectedOptionId: string | null;
    selectedOptionIds?: string[];
    numericAnswer?: number | null;
    sequence: number;
    skillName: string;
  }>;
  attempt: {
    assessmentProgramId?: string | null;
    assessmentProgramSessionId?: string | null;
    correctCount: number;
    durationSeconds: number | null;
    contextName: string;
    contextType: "COURSE" | "GOAL";
    enrollmentId: string | null;
    goalName: string | null;
    id: string;
    intent?: "PLACEMENT" | "COURSE_COVERAGE" | "KNOWLEDGE_CHECK" | "CHALLENGE";
    overallScore: number;
    questionCount: number;
    startedAt: string;
    submittedAt: string;
    title: string;
  };
  skillResults: DiagnosticSkillResult[];
  untestedSkills: DiagnosticUntestedSkill[];
  summary?: {
    courseSkillCount: number; questionsAnswered: number; sufficientEvidence: number;
    partiallyAssessed: number; notTested: number; mastered: number; ready: number;
    gaps: number; needsConfirmation: number; knowledgeBoundaryFound: boolean;
    pathReady: boolean; stopReason: string;
  };
}

function authorization(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

export function getDiagnosticOverview(
  accessToken: string,
  context: { enrollmentId?: string; goalId?: string } = {},
): Promise<DiagnosticOverview> {
  const query = context.enrollmentId
    ? `?enrollmentId=${encodeURIComponent(context.enrollmentId)}`
    : context.goalId ? `?goalId=${encodeURIComponent(context.goalId)}` : "";
  return apiRequest<DiagnosticOverview>(`/diagnostics/overview${query}`, { headers: authorization(accessToken) });
}

export function startDiagnostic(
  accessToken: string,
  context: { enrollmentId?: string; goalId?: string } = {},
): Promise<DiagnosticAttempt> {
  return apiRequest<DiagnosticAttempt>("/diagnostics/start", {
    body: JSON.stringify(context),
    headers: authorization(accessToken),
    method: "POST",
  });
}

export function getDiagnosticAttempt(accessToken: string, attemptId: string): Promise<DiagnosticAttempt> {
  return apiRequest<DiagnosticAttempt>(`/diagnostics/attempts/${attemptId}`, {
    headers: authorization(accessToken),
  });
}

export function submitDiagnostic(
  accessToken: string,
  attemptId: string,
  answers: DiagnosticAnswerInput[],
  durationSeconds: number,
): Promise<DiagnosticResult> {
  return apiRequest<DiagnosticResult>(`/diagnostics/attempts/${attemptId}/submit`, {
    body: JSON.stringify({ answers, durationSeconds }),
    headers: authorization(accessToken),
    method: "POST",
  });
}

export function saveDiagnosticAnswer(
  accessToken: string,
  attemptId: string,
  answer: DiagnosticAnswerInput & { isUnsure: boolean; responseSeconds: number },
): Promise<{
  answeredCount: number;
  attempt?: DiagnosticAttempt;
  questionCount: number;
  savedAnswer: DiagnosticDraftAnswer;
}> {
  return apiRequest(`/diagnostics/attempts/${attemptId}/answers/${answer.questionId}`, {
    body: JSON.stringify({
      isUnsure: answer.isUnsure,
      optionId: answer.optionId,
      selectedOptionIds: answer.selectedOptionIds,
      numericAnswer: answer.numericAnswer,
      responseSeconds: answer.responseSeconds,
    }),
    headers: authorization(accessToken),
    method: "PUT",
  });
}

export function getDiagnosticResult(accessToken: string, attemptId: string): Promise<DiagnosticResult> {
  return apiRequest<DiagnosticResult>(`/diagnostics/attempts/${attemptId}/results`, {
    headers: authorization(accessToken),
  });
}
