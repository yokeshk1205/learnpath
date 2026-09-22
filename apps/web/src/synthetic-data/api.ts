const mlBaseUrl = import.meta.env.VITE_ML_BASE_URL ?? "/ml";

export interface SyntheticDatasetOverview {
  benefitDefinition: {
    assessment_improvement_weight: number;
    completion_weight: number;
    formula: string;
    labelRule: string;
    learner_feedback_weight: number;
    mastery_gain_weight: number;
    randomLabels: boolean;
    threshold: number;
    version: string;
  };
  classification: "SYNTHETIC / SIMULATED DATA";
  curriculum: {
    checksumSha256: string;
    courseCount: number;
    prerequisiteEdgeCount: number;
    schemaVersion: string;
    skillCount: number;
    source: string;
  };
  dataset: {
    datasetVersion: string;
    fileName: string;
    generatorVersion: string;
    interactionCount: number;
    learnerCount: number;
    randomSeed: number;
    sha256: string;
  };
  distributions: {
    beneficial: Record<string, number>;
    candidateKind: Record<string, number>;
    learnerLevel: Record<string, number>;
    learningPace: Record<string, number>;
    performanceConsistency: Record<string, number>;
  };
  modeledRelationships: Record<string, number>;
  noise: Record<string, number>;
  outcomes: {
    beneficialRate: number;
    meanAssessmentImprovement: number;
    meanBenefitScore: number;
    meanCompletionRate: number;
    meanMasteryGain: number;
  };
  phaseBoundary: {
    containsRealLearnerData: boolean;
    featureEngineeringImplemented: boolean;
    modelTrained: boolean;
    predictionAvailable: boolean;
  };
  sampleRows: Array<Record<string, boolean | number | string>>;
  schema: Array<{ name: string; role: string }>;
  validation: Record<string, boolean>;
}

export async function getSyntheticDatasetOverview(): Promise<SyntheticDatasetOverview> {
  const response = await fetch(`${mlBaseUrl}/datasets/synthetic/overview`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Synthetic dataset request failed with ${response.status}.`);
  }
  return (await response.json()) as SyntheticDatasetOverview;
}
