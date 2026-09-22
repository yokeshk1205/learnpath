const mlBaseUrl = import.meta.env.VITE_ML_BASE_URL ?? "/ml";

export interface InferenceSampleCandidate {
  candidateId: string;
  learnerId: string;
  courseId: string;
  courseName: string;
  skillId: string;
  skillName: string;
  skillCategory: string;
  features: Record<string, number>;
}

export interface InferenceOverview {
  classification: string;
  inference: {
    inferenceVersion: string;
    servingStatus: string;
    capability: string;
    maximumBatchSize: number;
    decisionThreshold: number;
  };
  model: {
    modelVersion: string;
    modelType: string;
    artifactSha256: string;
    artifactEvaluationStatus: string;
    positiveClass: string;
    featureImportance: Array<{ feature: string; importance: number }>;
  };
  featureContract: {
    contractVersion: string;
    featureCount: number;
    fixedOrder: boolean;
    trainingInferenceParity: boolean;
    sha256: string;
    metadataExcluded: string[];
  };
  validation: Record<string, boolean>;
  sampleCandidates: InferenceSampleCandidate[];
  phaseBoundary: {
    predictionAvailable: boolean;
    benefitProbabilityAvailable: boolean;
    candidateRankingIntegrated: boolean;
    learnNextAvailable: boolean;
    personalizedPathAvailable: boolean;
    pathRegenerationAvailable: boolean;
  };
}

export interface PredictionResponse {
  model_version: string;
  feature_version: string;
  inference_version: string;
  serving_status: string;
  prediction_count: number;
  predictions: Array<{ skill_id: string; benefit_probability: number }>;
  generated_at: string;
}

async function errorDetail(response: Response): Promise<string> {
  try {
    const body = await response.json() as { detail?: string };
    return body.detail ?? `Request failed with ${response.status}.`;
  } catch {
    return `Request failed with ${response.status}.`;
  }
}

export async function getInferenceOverview(): Promise<InferenceOverview> {
  const response = await fetch(`${mlBaseUrl}/inference/overview`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(await errorDetail(response));
  return (await response.json()) as InferenceOverview;
}

export async function predictBenefit(
  featureVersion: string,
  skillId: string,
  features: Record<string, number>,
): Promise<PredictionResponse> {
  const response = await fetch(`${mlBaseUrl}/predict`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      feature_version: featureVersion,
      candidates: [{ skill_id: skillId, features }],
    }),
  });
  if (!response.ok) throw new Error(await errorDetail(response));
  return (await response.json()) as PredictionResponse;
}
