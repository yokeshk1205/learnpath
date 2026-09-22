import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PathEvidenceNote } from "./PathEvidenceNote";

afterEach(cleanup);
describe("saved path evidence provenance", () => {
  it("labels synthetic ranking and renders backend version values", () => {
    render(<PathEvidenceNote provenance={{
      featureVersion: "features-fixture", inferenceVersion: "inference-fixture",
      modelVersion: "model-fixture", sourceClassification: "MODEL INFERENCE — SYNTHETICALLY TRAINED",
    }} />);
    expect(screen.getByText(/not been validated across subjects/)).toBeTruthy();
    expect(screen.getByText("model-fixture")).toBeTruthy();
    expect(screen.getByText("features-fixture")).toBeTruthy();
  });
  it("does not invent synthetic provenance for a different saved source", () => {
    render(<PathEvidenceNote provenance={{
      featureVersion: "features", inferenceVersion: "inference",
      modelVersion: "model", sourceClassification: "EXPLICIT TEST SOURCE",
    }} />);
    expect(screen.getByText("EXPLICIT TEST SOURCE")).toBeTruthy();
    expect(screen.queryByText(/trained on synthetic learning data/)).toBeNull();
  });
});
