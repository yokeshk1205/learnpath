import { describe, expect, it } from "vitest";

import { calculateRetention, classifyRetention } from "../src/retention/service.js";

const anchor = new Date("2026-01-01T00:00:00.000Z");

describe("retention and forgetting policy", () => {
  it("keeps retention unknown until performance evidence exists", () => {
    const projection = calculateRetention({
      anchorAt: null, asOf: anchor, confidence: null, evidenceCount: 0, mastery: null,
    });
    expect(projection).toMatchObject({ retention: null, revisionDue: false, state: "UNKNOWN" });
  });

  it("starts at current mastery and decays without changing historical mastery", () => {
    const initial = calculateRetention({
      anchorAt: anchor, asOf: anchor, confidence: 0.6, evidenceCount: 8, mastery: 0.84,
    });
    const later = calculateRetention({
      anchorAt: anchor, asOf: new Date("2026-03-02T00:00:00.000Z"),
      confidence: 0.6, evidenceCount: 8, mastery: 0.84,
    });
    expect(initial.retention).toBe(0.84);
    expect(later.retention).toBeLessThan(initial.retention!);
    expect(later.decayAmount).toBeCloseTo(0.84 - later.retention!, 4);
  });

  it("decays more slowly when confidence and repeated evidence are stronger", () => {
    const asOf = new Date("2026-02-15T00:00:00.000Z");
    const sparse = calculateRetention({
      anchorAt: anchor, asOf, confidence: 0.2, evidenceCount: 1, mastery: 0.9,
    });
    const strong = calculateRetention({
      anchorAt: anchor, asOf, confidence: 0.9, evidenceCount: 20, mastery: 0.9,
    });
    expect(strong.effectiveLambda!).toBeLessThan(sparse.effectiveLambda!);
    expect(strong.retention!).toBeGreaterThan(sparse.retention!);
  });

  it("creates revision due only for previously demonstrated mastery", () => {
    const asOf = new Date("2026-06-01T00:00:00.000Z");
    const forgotten = calculateRetention({
      anchorAt: anchor, asOf, confidence: 0.4, evidenceCount: 5, mastery: 0.82,
    });
    const learningGap = calculateRetention({
      anchorAt: anchor, asOf, confidence: 0.4, evidenceCount: 5, mastery: 0.4,
    });
    expect(["AT_RISK", "CRITICAL"]).toContain(forgotten.state);
    expect(forgotten.revisionDue).toBe(true);
    expect(learningGap.revisionDue).toBe(false);
  });

  it("uses explicit bounded retention states", () => {
    expect(classifyRetention(null)).toBe("UNKNOWN");
    expect(classifyRetention(0.9)).toBe("STRONG");
    expect(classifyRetention(0.6)).toBe("MODERATE");
    expect(classifyRetention(0.4)).toBe("AT_RISK");
    expect(classifyRetention(0.2)).toBe("CRITICAL");
  });
});
