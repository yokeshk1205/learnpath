import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GovernanceOverview } from "../governance/api";
import { GovernancePage } from "./GovernancePage";

const mocks = vi.hoisted(() => ({ getOverview: vi.fn(), refresh: vi.fn() }));
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ accessToken: "test-token", refreshSession: mocks.refresh }),
}));
vi.mock("../governance/api", () => ({ getGovernanceOverview: mocks.getOverview }));

function overview(): GovernanceOverview {
  return {
    calibration: { bins: [], message: "Withheld", minimumOutcomes: 30, observedOutcomes: 1, state: "INSUFFICIENT_DATA" },
    coursePerformance: [],
    currentModel: { featureVersion: "features-v2", inferenceVersion: "inference-v2", modelVersion: "model-v2" },
    diagnosticQuality: {
      cohort: { meanQuestions: 12, medianQuestions: 11, p90Questions: 20, selfReportClaims: 8, submittedAttempts: 6, totalResponses: 72, uniqueLearners: 5 },
      evidence: { classificationCounts: { NEEDS_CONFIRMATION: 4, PROBED: 3 }, confidenceIntervalsRecorded: 7, mixedEvidenceSkills: 4, skillDecisions: 7 },
      items: [{
        absoluteCalibrationError: null, authorCalibrationState: "EXPERT_PRIOR", authorDiscrimination: 1,
        authorExpectedCorrectRate: 0.6, cognitiveLevel: "APPLY", configuredDifficulty: 3,
        constructCode: "APPLICATION", contentVersion: 2, correctRate: 0.5,
        diagnosticRole: "VERIFICATION", difficultyEstimate: 0.5, empiricalDiscrimination: null,
        expectedResponseSeconds: 90, id: "item", meanConfidenceChange: 0.03, meanMasteryChange: 0.04,
        meanResponseSeconds: 70, responseCount: 8, sampleState: "FIELD_TEST", skillName: "Percentages",
        slug: "percentages-application", unsureRate: 0.125, warnings: ["SMALL_SAMPLE"],
      }],
      minimumResponsesPerItem: 20,
      policyVersion: "curriculum-evidence-adaptive-v6",
      stopReasons: [{ count: 4, reason: "EVIDENCE_SUFFICIENT" }],
      studyReadiness: [
        { detail: "The engine is live.", key: "adaptive", label: "Evidence-bounded diagnostic engine", status: "IMPLEMENTED" },
        { detail: "A real study is required.", key: "validity", label: "External diagnostic validity", status: "REQUIRES_STUDY" },
      ],
      summary: { activeItems: 162, flaggedReportableItems: 0, meanAbsoluteCalibrationError: null, meanEmpiricalDiscrimination: null, observedItems: 20, reportableItems: 0 },
    },
    drift: { baselineMeanPrediction: null, baselinePredictions: 0, message: "Withheld", recentMeanPrediction: 0.4, recentPredictions: 12, relativeMeanShift: null, state: "INSUFFICIENT_DATA" },
    generatedAt: "2026-09-22T00:00:00.000Z",
    predictionDistribution: { count: 12, maximum: 0.8, mean: 0.4, median: 0.4, minimum: 0.1, p10: 0.2, p90: 0.7 },
    promotion: { automaticPromotion: false, stages: ["Current production model", "Human approval"] },
    rates: { acceptanceRate: null, assessmentFollowThrough: null, completionRate: null, minimumResponses: 30, rejectionRate: null, state: "INSUFFICIENT_DATA" },
    retraining: { contentCoveragePass: true, dataQualityPass: true, eligible: false, observedAssessedOutcomes: 1, reasons: ["More evidence required."], requiredAssessedOutcomes: 100 },
    volume: { accepted: 1, assessedOutcomes: 1, completed: 1, observedMeanGain: 0.1, predictions: 12, recommendations: 4, rejected: 0, responses: 1 },
  };
}

beforeEach(() => { vi.clearAllMocks(); mocks.getOverview.mockResolvedValue(overview()); });
afterEach(cleanup);

describe("diagnostic quality lab", () => {
  it("shows real evidence volume while withholding under-sampled calibration claims", async () => {
    render(<MemoryRouter><GovernancePage /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "Evidence before accuracy claims" })).toBeInTheDocument();
    expect(screen.getByText("Percentages")).toBeInTheDocument();
    expect(screen.getByText("Field test")).toBeInTheDocument();
    expect(screen.getAllByText("Withheld").length).toBeGreaterThan(0);
    expect(screen.getByText(/Reportability gate: 20 responses per item/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "External diagnostic validity" })).toBeInTheDocument();
  });
});
