import { apiRequest } from "../auth/api";

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
  mode: "ASSESSMENT" | "PRACTICE" | "RETENTION_CHECK";
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
  attempt: { attemptNumber: number; durationSeconds: number; id: string; submittedAt: string };
  evidence: {
    confidenceAfter: number;
    confidenceBefore: number | null;
    evidenceCount: number;
    evidenceStateAfter: "ASSESSED" | "ESTIMATED" | "UNKNOWN" | "VERIFIED";
    evidenceStateBefore: "ASSESSED" | "ESTIMATED" | "UNKNOWN" | "VERIFIED";
    masteryAfter: number;
    masteryBefore: number | null;
    retentionAfter: number;
    retentionBefore: number | null;
    retentionStateAfter: "UNKNOWN" | "STRONG" | "MODERATE" | "AT_RISK" | "CRITICAL";
    retentionStateBefore: "UNKNOWN" | "STRONG" | "MODERATE" | "AT_RISK" | "CRITICAL";
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

function authorization(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

export function startPractice(
  accessToken: string,
  skillId: string,
  enrollmentId?: string,
  mode: "ASSESSMENT" | "PRACTICE" | "RETENTION_CHECK" = "PRACTICE",
): Promise<PracticeAttempt> {
  return apiRequest<PracticeAttempt>("/practice/start", {
    body: JSON.stringify({ skillId, mode, ...(enrollmentId ? { enrollmentId } : {}) }),
    headers: authorization(accessToken),
    method: "POST",
  });
}

export function getPracticeAttempt(accessToken: string, attemptId: string): Promise<PracticeAttempt> {
  return apiRequest<PracticeAttempt>(`/practice/attempts/${attemptId}`, {
    headers: authorization(accessToken),
  });
}

export function submitPractice(
  accessToken: string,
  attemptId: string,
  input: { durationSeconds: number; hintsUsed: number; optionId: string },
): Promise<PracticeResult> {
  return apiRequest<PracticeResult>(`/practice/attempts/${attemptId}/submit`, {
    body: JSON.stringify(input),
    headers: authorization(accessToken),
    method: "POST",
  });
}
