import { z } from "zod";

import { AppError } from "../errors.js";
import { pathPolicy } from "./policy.js";
import type { InferenceClientContract } from "./types.js";

const inferenceResponse = z.object({
  feature_version: z.string(),
  generated_at: z.string(),
  inference_version: z.string(),
  model_version: z.string(),
  predictions: z.array(z.object({
    benefit_probability: z.number().min(0).max(1),
    skill_id: z.string(),
  })),
  serving_status: z.string(),
});

const overviewResponse = z.object({
  featureContract: z.object({ contractVersion: z.string() }),
  inference: z.object({ inferenceVersion: z.string(), servingStatus: z.string() }),
  model: z.object({ modelVersion: z.string() }),
});

async function requestJson(url: string, timeoutMs: number, init?: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new AppError(503, "ML_INFERENCE_UNAVAILABLE", "The checked benefit model rejected the live request.", payload);
    }
    return payload;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(503, "ML_INFERENCE_UNAVAILABLE", "The checked benefit model is unavailable; LearnPath will not fabricate a ranking.");
  } finally {
    clearTimeout(timeout);
  }
}

export function createInferenceClient(baseUrl: string, timeoutMs: number): InferenceClientContract {
  return {
    async provenance() {
      const payload = await requestJson(`${baseUrl}/inference/overview`, timeoutMs);
      const parsed = overviewResponse.safeParse(payload);
      if (!parsed.success || parsed.data.featureContract.contractVersion !== pathPolicy.featureVersion) {
        throw new AppError(503, "ML_INFERENCE_CONTRACT_DRIFT", "The benefit model overview does not match the production feature contract.");
      }
      return {
        featureVersion: parsed.data.featureContract.contractVersion,
        generatedAt: new Date().toISOString(),
        inferenceVersion: parsed.data.inference.inferenceVersion,
        modelVersion: parsed.data.model.modelVersion,
        servingStatus: parsed.data.inference.servingStatus,
      };
    },
    async predict(candidates) {
      if (!candidates.length) {
        throw new AppError(422, "NO_ELIGIBLE_CANDIDATES", "At least one eligible candidate is required for inference.");
      }
      const payload = await requestJson(`${baseUrl}/predict`, timeoutMs, {
          body: JSON.stringify({
            candidates: candidates.map((candidate) => ({
              features: candidate.features,
              skill_id: candidate.skillId,
            })),
            feature_version: pathPolicy.featureVersion,
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
        });
      try {
        const parsed = inferenceResponse.safeParse(payload);
        if (!parsed.success || parsed.data.feature_version !== pathPolicy.featureVersion) {
          throw new AppError(503, "ML_INFERENCE_CONTRACT_DRIFT", "The benefit model response does not match the production feature contract.");
        }
        if (parsed.data.predictions.length !== candidates.length) {
          throw new AppError(503, "ML_INFERENCE_INCOMPLETE", "The benefit model did not return one prediction per eligible skill.");
        }
        return {
          featureVersion: parsed.data.feature_version,
          generatedAt: parsed.data.generated_at,
          inferenceVersion: parsed.data.inference_version,
          modelVersion: parsed.data.model_version,
          predictions: parsed.data.predictions.map((prediction) => ({
            benefitProbability: prediction.benefit_probability,
            skillId: prediction.skill_id,
          })),
          servingStatus: parsed.data.serving_status,
        };
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError(503, "ML_INFERENCE_UNAVAILABLE", "The benefit model returned an invalid inference response.");
      }
    },
  };
}
