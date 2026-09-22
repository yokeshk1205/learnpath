import type { EvidenceState } from "../mastery/policy.js";
import type { RetentionState } from "../retention/policy.js";

export type PracticeMode = "ASSESSMENT" | "PRACTICE" | "RETENTION_CHECK";

export interface PracticeAttempt {
  attemptNumber: number;
  context: {
    courseId: string;
    courseName: string;
    enrollmentId: string;
    moduleId: string;
    moduleName: string;
  } | null;
  id: string;
  mode: PracticeMode;
  question: {
    difficulty: number;
    id: string;
    options: Array<{ content: string; id: string; key: string }>;
    prompt: string;
  };
  skill: { category: string; id: string; name: string; slug: string };
  startedAt: string;
  status: "IN_PROGRESS";
}

export interface PracticeResult {
  attempt: {
    attemptNumber: number;
    durationSeconds: number;
    id: string;
    submittedAt: string;
  };
  evidence: {
    confidenceAfter: number;
    confidenceBefore: number | null;
    evidenceCount: number;
    evidenceStateAfter: EvidenceState;
    evidenceStateBefore: EvidenceState;
    masteryAfter: number;
    masteryBefore: number | null;
    retentionAfter: number;
    retentionBefore: number | null;
    retentionStateAfter: RetentionState;
    retentionStateBefore: RetentionState;
  };
  feedback: {
    correctOptionContent: string;
    explanation: string;
    isCorrect: boolean;
    score: number;
    selectedOptionContent: string;
  };
  skill: { id: string; name: string };
}

export interface PracticeServiceContract {
  getAttempt(learnerId: string, attemptId: string): Promise<PracticeAttempt>;
  start(
    learnerId: string,
    input: { enrollmentId?: string; mode?: PracticeMode; skillId: string },
  ): Promise<PracticeAttempt>;
  submit(
    learnerId: string,
    attemptId: string,
    input: { durationSeconds: number; hintsUsed: number; optionId: string },
  ): Promise<PracticeResult>;
}
