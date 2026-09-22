import { AppError } from "../errors.js";

export type DiagnosticQuestionType = "SINGLE_CHOICE" | "MULTI_SELECT" | "NUMERIC";

export interface DiagnosticResponseInput {
  isUnsure?: boolean;
  optionId?: string | null;
  selectedOptionIds?: string[];
  numericAnswer?: number;
}

export interface DiagnosticAnswerKey {
  questionType: DiagnosticQuestionType;
  numericAnswer: number | null;
  numericTolerance: number | null;
  options: Map<string, { isCorrect: boolean; misconceptionCode: string | null }>;
}

export interface ScoredDiagnosticResponse {
  isCorrect: boolean;
  isUnsure: boolean;
  optionId: string | null;
  selectedOptionIds: string[];
  numericAnswer: number | null;
  misconceptionCode: string | null;
}

function invalid(message: string): never {
  throw new AppError(400, "INVALID_DIAGNOSTIC_ANSWER", message);
}

/** Exact comparison of the finite numbers' decimal representations avoids
 * accepting a broad floating epsilon or rejecting an authored boundary such
 * as 0.3 for 0.4 +/- 0.1. Scientific notation uses the same integer scale. */
export function numericAnswerMatches(answer: number, expected: number, tolerance: number): boolean {
  if (![answer, expected, tolerance].every(Number.isFinite) || tolerance < 0) return false;
  const decimal = (value: number) => {
    const [mantissa, scientificExponent = "0"] = value.toString().toLowerCase().split("e");
    const fractionLength = mantissa!.split(".")[1]?.length ?? 0;
    return { coefficient: BigInt(mantissa!.replace(".", "")), exponent: Number(scientificExponent) - fractionLength };
  };
  const values = [answer, expected, tolerance].map(decimal);
  const exponent = Math.min(...values.map((value) => value.exponent));
  const integers = values.map((value) => value.coefficient * 10n ** BigInt(value.exponent - exponent));
  const difference = integers[0]! - integers[1]!;
  return (difference < 0n ? -difference : difference) <= integers[2]!;
}

/** Validate the response against server-owned metadata before grading. */
export function scoreDiagnosticResponse(key: DiagnosticAnswerKey, input: DiagnosticResponseInput): ScoredDiagnosticResponse {
  const response: ScoredDiagnosticResponse = {
    isCorrect: false, isUnsure: input.isUnsure === true, optionId: null,
    selectedOptionIds: [], numericAnswer: null, misconceptionCode: null,
  };
  const hasSingle = input.optionId != null;
  const hasMulti = input.selectedOptionIds !== undefined;
  const hasNumeric = input.numericAnswer !== undefined;
  if (response.isUnsure) {
    if (hasSingle || hasMulti || hasNumeric) invalid("An unsure response cannot also contain an answer.");
    return response;
  }
  if (key.questionType === "SINGLE_CHOICE") {
    if (!hasSingle || hasMulti || hasNumeric || !key.options.has(input.optionId!)) {
      invalid("Choose exactly one option belonging to this question.");
    }
    const selected = key.options.get(input.optionId!)!;
    if ([...key.options.values()].filter((option) => option.isCorrect).length !== 1) {
      throw new AppError(409, "DIAGNOSTIC_ANSWER_KEY_INVALID", "This question needs a valid authored answer key.");
    }
    response.optionId = input.optionId!;
    response.isCorrect = selected.isCorrect;
    response.misconceptionCode = !selected.isCorrect && selected.misconceptionCode !== "UNCLASSIFIED_DISTRACTOR"
      ? selected.misconceptionCode : null;
  } else if (key.questionType === "MULTI_SELECT") {
    const selected = input.selectedOptionIds;
    if (hasSingle || hasNumeric || !Array.isArray(selected) || selected.length === 0
      || selected.length > key.options.size || new Set(selected).size !== selected.length
      || selected.some((id) => !key.options.has(id))) {
      invalid("Choose a nonempty set of unique options belonging to this question.");
    }
    const correct = [...key.options.entries()].filter(([, option]) => option.isCorrect).map(([id]) => id);
    if (!correct.length || correct.length === key.options.size) {
      throw new AppError(409, "DIAGNOSTIC_ANSWER_KEY_INVALID", "This question needs correct options and at least one distractor.");
    }
    response.selectedOptionIds = [...selected].sort();
    response.isCorrect = selected.length === correct.length && correct.every((id) => selected.includes(id));
    // The selected set has no meaningful click order. Attribute the first
    // mapped distractor in the server-owned authored option order instead.
    response.misconceptionCode = [...key.options.entries()].find(([id, option]) =>
      selected.includes(id) && !option.isCorrect && option.misconceptionCode
      && option.misconceptionCode !== "UNCLASSIFIED_DISTRACTOR")?.[1].misconceptionCode ?? null;
  } else if (key.questionType === "NUMERIC") {
    if (hasSingle || hasMulti || !hasNumeric || !Number.isFinite(input.numericAnswer)) {
      invalid("Enter one finite numeric answer for this question.");
    }
    if (key.numericAnswer === null || key.numericTolerance === null
      || !Number.isFinite(key.numericAnswer) || !Number.isFinite(key.numericTolerance) || key.numericTolerance < 0) {
      throw new AppError(409, "DIAGNOSTIC_ANSWER_KEY_INVALID", "This question needs a valid authored numeric answer and tolerance.");
    }
    response.numericAnswer = input.numericAnswer!;
    response.isCorrect = numericAnswerMatches(input.numericAnswer!, key.numericAnswer, key.numericTolerance);
  } else {
    throw new AppError(409, "DIAGNOSTIC_FORMAT_UNSUPPORTED", "This question format is not supported.");
  }
  return response;
}
