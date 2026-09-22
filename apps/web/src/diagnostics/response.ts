import type { DiagnosticAnswerInput, DiagnosticAttempt, DiagnosticDraftAnswer, DiagnosticQuestion } from "./api";

export interface QuestionResponseDraft {
  isUnsure: boolean;
  optionId: string | null;
  selectedOptionIds: string[];
  numericText: string;
}

interface LocalResponseDraft {
  draft: QuestionResponseDraft;
  questionType: NonNullable<DiagnosticQuestion["questionType"]>;
  savedAt: string | null;
}

function readDraftCache(storageKey: string): Record<string, LocalResponseDraft> {
  try {
    const value: unknown = JSON.parse(window.sessionStorage.getItem(storageKey) ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, LocalResponseDraft> : {};
  } catch { return {}; }
}

export function storeLocalResponse(storageKey: string, question: DiagnosticQuestion, draft: QuestionResponseDraft, savedAt: string | null): void {
  try {
    const cache = readDraftCache(storageKey);
    cache[question.id] = { draft, savedAt, questionType: question.questionType ?? "SINGLE_CHOICE" };
    window.sessionStorage.setItem(storageKey, JSON.stringify(cache));
  } catch { /* Browser storage can be unavailable; in-page save guards still apply. */ }
}

export function clearLocalResponse(storageKey: string, questionId?: string, expectedDraft?: QuestionResponseDraft): void {
  try {
    if (!questionId) { window.sessionStorage.removeItem(storageKey); return; }
    const cache = readDraftCache(storageKey);
    // An older request may finish after the learner has already edited again in this tab.
    if (expectedDraft && JSON.stringify(cache[questionId]?.draft) !== JSON.stringify(expectedDraft)) return;
    delete cache[questionId];
    if (Object.keys(cache).length) window.sessionStorage.setItem(storageKey, JSON.stringify(cache));
    else window.sessionStorage.removeItem(storageKey);
  } catch { /* Cleanup must not change a successful server save into an error. */ }
}

export function recoverLocalResponses(storageKey: string, attempt: DiagnosticAttempt): Record<string, QuestionResponseDraft> {
  const cache = readDraftCache(storageKey);
  const recovered: Record<string, QuestionResponseDraft> = {};
  for (const question of attempt.questions) {
    const entry = cache[question.id];
    const saved = attempt.savedAnswers.find((answer) => answer.questionId === question.id);
    if (!entry || entry.questionType !== (question.questionType ?? "SINGLE_CHOICE") || entry.savedAt !== (saved?.savedAt ?? null)) continue;
    const draft = entry.draft;
    if (!draft || typeof draft.isUnsure !== "boolean" || (draft.optionId !== null && typeof draft.optionId !== "string")
      || typeof draft.numericText !== "string" || !Array.isArray(draft.selectedOptionIds)
      || !draft.selectedOptionIds.every((id) => typeof id === "string" && question.options.some((option) => option.id === id))
      || new Set(draft.selectedOptionIds).size !== draft.selectedOptionIds.length) continue;
    if (draft.isUnsure ? draft.optionId !== null || draft.selectedOptionIds.length > 0 || draft.numericText !== ""
      : question.questionType === "NUMERIC" ? draft.optionId !== null || draft.selectedOptionIds.length > 0
        : question.questionType === "MULTI_SELECT" ? draft.optionId !== null || draft.numericText !== ""
          : draft.selectedOptionIds.length > 0 || draft.numericText !== "" || (draft.optionId !== null && !question.options.some((option) => option.id === draft.optionId))) continue;
    if (!responsesMatch(draft, restoreResponse(saved))) recovered[question.id] = draft;
  }
  // Remove stale or unmapped drafts so a later session cannot restore them accidentally.
  try {
    const validEntries = Object.fromEntries(Object.keys(recovered).map((id) => [id, cache[id]]));
    if (Object.keys(validEntries).length) window.sessionStorage.setItem(storageKey, JSON.stringify(validEntries));
    else window.sessionStorage.removeItem(storageKey);
  } catch { /* Recovery also works in memory if cleanup is unavailable. */ }
  return recovered;
}

export function restoreResponse(answer?: Pick<DiagnosticDraftAnswer, "isUnsure" | "optionId" | "selectedOptionIds" | "numericAnswer">): QuestionResponseDraft {
  return {
    isUnsure: answer?.isUnsure ?? false,
    optionId: answer?.optionId ?? null,
    selectedOptionIds: answer?.selectedOptionIds ?? [],
    numericText: answer?.numericAnswer === null || answer?.numericAnswer === undefined ? "" : String(answer.numericAnswer),
  };
}

export function parseNumericResponse(text: string): number | null {
  const trimmed = text.trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

export function isResponseValid(question: DiagnosticQuestion, draft: QuestionResponseDraft): boolean {
  if (draft.isUnsure) return true;
  if (question.questionType === "NUMERIC") return parseNumericResponse(draft.numericText) !== null;
  if (question.questionType === "MULTI_SELECT") return draft.selectedOptionIds.length > 0
    && draft.selectedOptionIds.every((id) => question.options.some((option) => option.id === id));
  return question.options.some((option) => option.id === draft.optionId);
}

export function responsesMatch(left: QuestionResponseDraft, right: QuestionResponseDraft): boolean {
  return left.isUnsure === right.isUnsure && left.optionId === right.optionId
    && left.numericText === right.numericText
    && [...left.selectedOptionIds].sort().join("|") === [...right.selectedOptionIds].sort().join("|");
}

export function responsePayload(question: DiagnosticQuestion, draft: QuestionResponseDraft): Omit<DiagnosticAnswerInput, "questionId" | "responseSeconds"> & { isUnsure: boolean } {
  if (draft.isUnsure) return { isUnsure: true, optionId: null };
  if (question.questionType === "NUMERIC") {
    const value = parseNumericResponse(draft.numericText);
    if (value === null) throw new Error("Enter a finite number before saving.");
    return { isUnsure: false, numericAnswer: value };
  }
  if (question.questionType === "MULTI_SELECT") return { isUnsure: false, selectedOptionIds: draft.selectedOptionIds };
  return { isUnsure: false, optionId: draft.optionId };
}
