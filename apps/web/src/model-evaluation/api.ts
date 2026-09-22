const mlBaseUrl = import.meta.env.VITE_ML_BASE_URL ?? "/ml";

export interface EvaluationMetrics {
  accuracy: number;
  classificationThreshold: number;
  confusionMatrix: number[][];
  f1: number;
  ndcgAt5: number;
  positiveQueryLearners: number;
  precision: number;
  precisionAt3: number;
  precisionAt5: number;
  queryLearners: number;
  recall: number;
  recallAt5: number;
  rocAuc: number;
}

export interface ModelEvaluationOverview {
  classification: string;
  comparison: {
    bestBaseline: string;
    bestBaselineDisplayName: string;
    selectedModelNdcgAt5Lift: number;
    selectedModelPrecisionAt5Lift: number;
    selectedModelRocAucLift: number;
  };
  dataset: {
    datasetVersion: string;
    featureCount: number;
    featureVersion: string;
    sourceFile: string;
    sourceSha256: string;
    syntheticOnly: boolean;
  };
  experiment: {
    createdAt: string;
    experimentVersion: string;
    randomSeed: number;
    selectionMetric: string;
  };
  metrics: {
    test: Record<string, EvaluationMetrics>;
    validation: Record<string, EvaluationMetrics>;
  };
  model: {
    artifactFile: string;
    artifactSha256: string;
    deploymentStatus: string;
    featureImportance: Array<{ feature: string; importance: number }>;
    modelVersion: string;
    selectedModel: string;
    selectedModelDisplayName: string;
  };
  phaseBoundary: {
    learnNextAvailable: boolean;
    modelDeployed: boolean;
    modelEvaluated: boolean;
    modelTrained: boolean;
    personalizedPathAvailable: boolean;
    predictionAvailable: boolean;
    rankingIntegrated: boolean;
  };
  split: {
    assignmentFile: string;
    assignmentSha256: string;
    fractions: Record<"test" | "train" | "validation", number>;
    learnerCounts: Record<"test" | "train" | "validation", number>;
    noLearnerOverlap: boolean;
    positiveLabels: Record<"test" | "train" | "validation", number>;
    rowCounts: Record<"test" | "train" | "validation", number>;
    splitVersion: string;
  };
  trainingConfiguration: {
    baselineDefinitions: Record<string, string>;
    libraryVersions: Record<string, string>;
    models: Record<string, { displayName: string; estimator: string; parameters: Record<string, unknown> }>;
    rankingEvaluationUnit: string;
    thresholdPolicy: string;
  };
  validation: Record<string, boolean>;
}

export async function getModelEvaluationOverview(): Promise<ModelEvaluationOverview> {
  const response = await fetch(`${mlBaseUrl}/experiments/current/overview`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Model evaluation request failed with ${response.status}.`);
  }
  return (await response.json()) as ModelEvaluationOverview;
}
