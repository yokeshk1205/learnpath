import { describe, expect, it } from "vitest";

import { classifyRecommendationOutcome } from "../src/recommendations/policy.js";

describe("recommendation outcome attribution policy", () => {
  it("keeps missing evidence explicit and uses a symmetric five-point threshold", () => {
    expect(classifyRecommendationOutcome("ACCEPTED", null)).toBe("AWAITING_EVIDENCE");
    expect(classifyRecommendationOutcome("ACCEPTED", null, 1)).toBe("OBSERVED_NO_BASELINE");
    expect(classifyRecommendationOutcome("ACCEPTED", 0.049)).toBe("STABLE");
    expect(classifyRecommendationOutcome("ACCEPTED", 0.05)).toBe("IMPROVED");
    expect(classifyRecommendationOutcome("ACCEPTED", -0.05)).toBe("DECLINED");
  });

  it("does not reinterpret a rejected recommendation as a learning outcome", () => {
    expect(classifyRecommendationOutcome("REJECTED", 0.4)).toBe("REJECTED");
  });
});
