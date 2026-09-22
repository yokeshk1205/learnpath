const mlBaseUrl = import.meta.env.VITE_ML_BASE_URL ?? "/ml";

export interface FeatureSpec {
  availability: "CURRENT_STATE" | "PRIOR_HISTORY";
  category: string;
  description: string;
  dtype: string;
  maximum: number;
  minimum: number;
  name: string;
  order: number;
  source: string;
}

export interface FeatureDatasetOverview {
  categoryCounts: Record<string, number>;
  classification: string;
  dataset: {
    datasetVersion: string;
    fileName: string;
    learnerCount: number;
    negativeLabels: number;
    positiveLabels: number;
    rowCount: number;
    sha256: string;
  };
  featureContract: {
    classification: string;
    contractVersion: string;
    datasetVersion: string;
    entity: string;
    featureCount: number;
    featureNames: string[];
    features: FeatureSpec[];
    fileName: string;
    fixedOrder: boolean;
    label: { dtype: string; includedInFeatureMatrix: boolean; name: string };
    leakagePolicy: {
      currentOutcomeColumnsExcluded: string[];
      historicalOutcomeRule: string;
      identifiersIncludedInFeatureMatrix: boolean;
    };
    metadataColumns: string[];
    sha256: string;
    trainingInferenceParity: boolean;
  };
  featureRanges: Record<string, { maximum: number; mean: number; minimum: number }>;
  phaseBoundary: {
    featureEngineeringImplemented: boolean;
    learnerDisjointSplitsCreated: boolean;
    modelTrained: boolean;
    predictionAvailable: boolean;
    rankingAvailable: boolean;
  };
  sampleRows: Array<Record<string, number | string>>;
  source: {
    containsRealLearnerData: boolean;
    curriculumFile: string;
    curriculumSha256: string;
    syntheticDatasetFile: string;
    syntheticDatasetSha256: string;
    syntheticDatasetVersion: string;
  };
  validation: Record<string, boolean>;
}

export async function getFeatureDatasetOverview(): Promise<FeatureDatasetOverview> {
  const response = await fetch(`${mlBaseUrl}/datasets/features/overview`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Feature dataset request failed with ${response.status}.`);
  }
  return (await response.json()) as FeatureDatasetOverview;
}
