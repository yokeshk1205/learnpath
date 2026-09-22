import type { DiagnosticClassification } from "./estimation.js";
import type { DiagnosticQuestionType, DiagnosticResponseInput } from "./scoring.js";

export interface DiagnosticGoal {
  id: string;
  name: string;
  slug: string;
}

export interface DiagnosticContext {
  enrollmentId: string | null;
  id: string;
  name: string;
  slug: string;
  type: "COURSE" | "GOAL";
}

export interface DiagnosticAssessmentSummary {
  description: string;
  estimatedMinutes: number;
  id: string;
  questionCount: number;
  skillCount: number;
  title: string;
}

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
  activeGoal: DiagnosticGoal | null;
  assessment: DiagnosticAssessmentSummary | null;
  context: DiagnosticContext | null;
  inProgressAttempt: DiagnosticAttemptSummary | null;
  latestAttempt: DiagnosticAttemptSummary | null;
}

export interface DiagnosticOption {
  content: string;
  id: string;
  key: string;
}

export interface DiagnosticQuestion {
  questionType?: DiagnosticQuestionType;
  numericUnit?: string | null;
  cognitiveLevel: "ANALYZE" | "APPLY" | "REMEMBER" | "UNDERSTAND";
  difficulty: number;
  discrimination: number;
  id: string;
  options: DiagnosticOption[];
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

export interface DiagnosticDraftSaveResult {
  answeredCount: number;
  attempt?: DiagnosticAttempt;
  questionCount: number;
  savedAnswer: DiagnosticDraftAnswer;
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
  goal: DiagnosticGoal | null;
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
  classification: DiagnosticClassification;
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

export interface DiagnosticAnswerResult {
  questionType?: DiagnosticQuestionType;
  selectedOptionIds?: string[];
  numericAnswer?: number | null;
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
  sequence: number;
  skillName: string;
}

export interface DiagnosticResult {
  answers: DiagnosticAnswerResult[];
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
    courseSkillCount: number;
    questionsAnswered: number;
    sufficientEvidence: number;
    partiallyAssessed: number;
    notTested: number;
    mastered: number;
    ready: number;
    gaps: number;
    needsConfirmation: number;
    knowledgeBoundaryFound: boolean;
    pathReady: boolean;
    stopReason: string;
  };
}

// Internal program controls are not accepted by the public diagnostic router.
export interface DiagnosticStartInput {
  enrollmentId?: string;
  goalId?: string;
  focusSkillIds?: string[];
  assessmentProgramId?: string;
  assessmentProgramSessionId?: string;
  forceProbe?: boolean;
  intent?: "PLACEMENT" | "COURSE_COVERAGE" | "KNOWLEDGE_CHECK" | "CHALLENGE";
}

export interface DiagnosticServiceContract {
  getAttempt(learnerId: string, attemptId: string): Promise<DiagnosticAttempt>;
  getOverview(
    learnerId: string,
    input?: { enrollmentId?: string; goalId?: string },
  ): Promise<DiagnosticOverview>;
  getResult(learnerId: string, attemptId: string): Promise<DiagnosticResult>;
  saveDraft?(
    learnerId: string,
    attemptId: string,
    input: DiagnosticResponseInput & {
      isUnsure: boolean;
      optionId: string | null;
      questionId: string;
      responseSeconds: number;
    },
  ): Promise<DiagnosticDraftSaveResult>;
  start(
    learnerId: string,
    input: DiagnosticStartInput,
  ): Promise<DiagnosticAttempt>;
  submit(
    learnerId: string,
    attemptId: string,
    input: {
      answers: Array<{
        isUnsure?: boolean;
        optionId?: string | null;
        selectedOptionIds?: string[];
        numericAnswer?: number;
        questionId: string;
        responseSeconds?: number;
      }>;
      durationSeconds?: number;
    },
  ): Promise<DiagnosticResult>;
}
