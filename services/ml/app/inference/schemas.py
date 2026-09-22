from typing import Any

from pydantic import BaseModel, Field


class PredictionCandidate(BaseModel):
    skill_id: str = Field(min_length=1, max_length=200)
    features: dict[str, float]


class PredictionRequest(BaseModel):
    feature_version: str = Field(min_length=1, max_length=100)
    candidates: list[PredictionCandidate] = Field(min_length=1, max_length=100)


class BenefitPrediction(BaseModel):
    skill_id: str
    benefit_probability: float


class PredictionResponse(BaseModel):
    model_version: str
    feature_version: str
    inference_version: str
    serving_status: str
    prediction_count: int
    predictions: list[BenefitPrediction]
    generated_at: str


class InferenceOverview(BaseModel):
    classification: str
    inference: dict[str, Any]
    model: dict[str, Any]
    featureContract: dict[str, Any]
    validation: dict[str, bool]
    sampleCandidates: list[dict[str, Any]]
    phaseBoundary: dict[str, bool]
