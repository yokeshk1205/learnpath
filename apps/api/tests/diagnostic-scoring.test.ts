import { describe, expect, it } from "vitest";

import { numericAnswerMatches, scoreDiagnosticResponse, type DiagnosticAnswerKey } from "../src/diagnostics/scoring.js";

function key(overrides: Partial<DiagnosticAnswerKey> = {}): DiagnosticAnswerKey {
  return {
    questionType: "SINGLE_CHOICE", numericAnswer: null, numericTolerance: null,
    options: new Map([
      ["a", { isCorrect: true, misconceptionCode: null }],
      ["b", { isCorrect: false, misconceptionCode: "WRONG_OPERATION" }],
      ["c", { isCorrect: false, misconceptionCode: null }],
    ]),
    ...overrides,
  };
}

describe("deterministic diagnostic format scoring", () => {
  it("preserves single-choice correctness, misconception, and uncertainty behavior", () => {
    expect(scoreDiagnosticResponse(key(), { optionId: "a" })).toMatchObject({ isCorrect: true, optionId: "a", misconceptionCode: null });
    expect(scoreDiagnosticResponse(key(), { optionId: "b" })).toMatchObject({ isCorrect: false, misconceptionCode: "WRONG_OPERATION" });
    expect(scoreDiagnosticResponse(key(), { isUnsure: true, optionId: null })).toMatchObject({ isCorrect: false, isUnsure: true });
  });

  it("requires the entire correct multi-select set, with no partial positive result", () => {
    const multi = key({ questionType: "MULTI_SELECT" });
    multi.options.get("c")!.isCorrect = true;
    expect(scoreDiagnosticResponse(multi, { selectedOptionIds: ["c", "a"] })).toMatchObject({ isCorrect: true, selectedOptionIds: ["a", "c"] });
    expect(scoreDiagnosticResponse(multi, { selectedOptionIds: ["a"] }).isCorrect).toBe(false);
    expect(scoreDiagnosticResponse(multi, { selectedOptionIds: ["a", "b", "c"] })).toMatchObject({ isCorrect: false, misconceptionCode: "WRONG_OPERATION" });
  });

  it("rejects unknown options, empty sets, duplicates, and incompatible nonempty response fields", () => {
    const multi = key({ questionType: "MULTI_SELECT" });
    for (const input of [{ selectedOptionIds: [] }, { selectedOptionIds: ["a", "a"] }, { selectedOptionIds: ["other-question-option"] }, { optionId: "a" }, { selectedOptionIds: ["a"], numericAnswer: 1 }]) {
      expect(() => scoreDiagnosticResponse(multi, input)).toThrow();
    }
    expect(() => scoreDiagnosticResponse(key(), { optionId: "a", selectedOptionIds: ["a"] })).toThrow();
    expect(() => scoreDiagnosticResponse(key(), { optionId: "other-question-option" })).toThrow();
    expect(() => scoreDiagnosticResponse(key(), { isUnsure: true, numericAnswer: 0 })).toThrow();
  });

  it("requires authored correct options and a distractor for multi-select", () => {
    const multi = key({ questionType: "MULTI_SELECT" });
    for (const option of multi.options.values()) option.isCorrect = true;
    expect(() => scoreDiagnosticResponse(multi, { selectedOptionIds: ["a"] })).toThrow("distractor");
  });

  it("attributes the same multi-select misconception regardless of click order", () => {
    const multi = key({
      questionType: "MULTI_SELECT",
      options: new Map([
        ["right", { isCorrect: true, misconceptionCode: null }],
        ["z-first-authored", { isCorrect: false, misconceptionCode: "WRONG_BASE" }],
        ["a-second-authored", { isCorrect: false, misconceptionCode: "INVERTED_RATE" }],
      ]),
    });
    const authoredOrder = scoreDiagnosticResponse(multi, { selectedOptionIds: ["z-first-authored", "a-second-authored"] });
    const reverseOrder = scoreDiagnosticResponse(multi, { selectedOptionIds: ["a-second-authored", "z-first-authored"] });

    expect(reverseOrder).toEqual(authoredOrder);
    expect(reverseOrder).toMatchObject({
      isCorrect: false,
      selectedOptionIds: ["a-second-authored", "z-first-authored"],
      misconceptionCode: "WRONG_BASE",
    });
  });

  it("grades zero, negatives, scientific notation, and inclusive decimal tolerance boundaries", () => {
    const numeric = key({ questionType: "NUMERIC", numericAnswer: 0, numericTolerance: 0, options: new Map() });
    expect(scoreDiagnosticResponse(numeric, { numericAnswer: 0 }).isCorrect).toBe(true);
    expect(scoreDiagnosticResponse({ ...numeric, numericAnswer: -4 }, { numericAnswer: -4 }).isCorrect).toBe(true);
    expect(numericAnswerMatches(0.3, 0.4, 0.1)).toBe(true);
    expect(numericAnswerMatches(0.5, 0.4, 0.1)).toBe(true);
    expect(numericAnswerMatches(0.30000000000000004, 0.4, 0.1)).toBe(true);
    expect(numericAnswerMatches(0.29999999999999993, 0.4, 0.1)).toBe(false);
    expect(numericAnswerMatches(0.5000000000000001, 0.4, 0.1)).toBe(false);
    expect(numericAnswerMatches(2e-12, 3e-12, 1e-12)).toBe(true);
    expect(numericAnswerMatches(Number.MIN_VALUE, 0, Number.MIN_VALUE)).toBe(true);
    expect(numericAnswerMatches(Number.MAX_VALUE, Number.MAX_VALUE, 0)).toBe(true);
    expect(numericAnswerMatches(-Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE)).toBe(false);
  });

  it("rejects nonfinite numeric values and invalid authored tolerances", () => {
    const numeric = key({ questionType: "NUMERIC", numericAnswer: 3, numericTolerance: 0.1, options: new Map() });
    for (const numericAnswer of [NaN, Infinity, -Infinity]) {
      expect(() => scoreDiagnosticResponse(numeric, { numericAnswer })).toThrow("finite");
    }
    expect(() => scoreDiagnosticResponse(numeric, { optionId: "a" })).toThrow();
    expect(() => scoreDiagnosticResponse(numeric, { numericAnswer: 3, selectedOptionIds: ["a"] })).toThrow();
    expect(() => scoreDiagnosticResponse({ ...numeric, numericTolerance: -1 }, { numericAnswer: 3 })).toThrow("authored");
    expect(numericAnswerMatches(0, 0, -1)).toBe(false);
  });
});
