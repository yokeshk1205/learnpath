from datetime import datetime, timezone
from functools import lru_cache
import json
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.graph.schemas import GraphAnalyticsRequest, GraphAnalyticsResponse
from app.graph.service import analyze_graph
from app.inference.schemas import InferenceOverview, PredictionRequest, PredictionResponse
from app.inference.service import (
    ArtifactUnavailableError,
    ArtifactValidationError,
    FeatureSchemaError,
    InferenceService,
)


def utc_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


app = FastAPI(
    title="LearnPath ML Service",
    description=(
        "Checked ML boundary for LearnPath. Phase 16 consumes benefit probabilities in the API's "
        "graph-gated course-path pipeline; prerequisite enforcement and ranking stay outside this service."
    ),
    version=settings.version,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/")
def service_information() -> dict[str, str | int]:
    return {
        "name": "LearnPath ML Service",
        "phase": 16,
        "status": "benefit_inference_for_course_paths",
        "version": settings.version,
    }


@app.get("/health/live")
def liveness() -> dict[str, str]:
    return {
        "service": settings.service_name,
        "status": "ok",
        "timestamp": utc_timestamp(),
        "version": settings.version,
    }


def load_synthetic_manifest() -> dict[str, Any]:
    manifest_path = settings.synthetic_data_directory / "manifest.json"
    try:
        payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise RuntimeError("The Phase 12 synthetic dataset manifest is unavailable.") from error
    if payload.get("classification") != "SYNTHETIC / SIMULATED DATA":
        raise RuntimeError("The synthetic dataset classification is invalid.")
    return payload


def load_feature_manifest() -> dict[str, Any]:
    manifest_path = settings.feature_data_directory / "manifest.json"
    try:
        payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise RuntimeError("The Phase 13 feature dataset manifest is unavailable.") from error
    if payload.get("classification") != "SYNTHETIC / SIMULATED DATA — ENGINEERED FEATURES":
        raise RuntimeError("The feature dataset classification is invalid.")
    validation = payload.get("validation", {})
    if not validation or not all(validation.values()):
        raise RuntimeError("The feature dataset validation gates are not satisfied.")
    return payload


def load_experiment_manifest() -> dict[str, Any]:
    manifest_path = settings.experiment_directory / "manifest.json"
    try:
        payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise RuntimeError("The Phase 14 evaluation manifest is unavailable.") from error
    if payload.get("classification") != "SYNTHETIC / SIMULATED DATA — OFFLINE MODEL EVALUATION":
        raise RuntimeError("The offline evaluation classification is invalid.")
    if payload.get("model", {}).get("deploymentStatus") != "EVALUATED_NOT_DEPLOYED":
        raise RuntimeError("The Phase 14 model deployment boundary is invalid.")
    validation = payload.get("validation", {})
    if not validation or not all(validation.values()):
        raise RuntimeError("The offline evaluation validation gates are not satisfied.")
    return payload


@lru_cache(maxsize=1)
def get_inference_service() -> InferenceService:
    return InferenceService.load(settings.experiment_directory, settings.feature_data_directory)


@app.get("/health/ready", response_model=None)
def readiness() -> Any:
    component_status = {
        "syntheticDataset": "missing",
        "featureDataset": "missing",
        "offlineEvaluation": "missing",
        "inferenceService": "missing",
    }
    try:
        synthetic_manifest = load_synthetic_manifest()
        component_status["syntheticDataset"] = "available"
        feature_manifest = load_feature_manifest()
        component_status["featureDataset"] = "available"
        experiment_manifest = load_experiment_manifest()
        component_status["offlineEvaluation"] = "available"
        inference_service = get_inference_service()
        component_status["inferenceService"] = "available"
    except (RuntimeError, ArtifactUnavailableError, ArtifactValidationError) as error:
        return JSONResponse(
            status_code=503,
            content={
                "components": component_status,
                "detail": str(error),
                "service": settings.service_name,
                "status": "not_ready",
                "timestamp": utc_timestamp(),
                "version": settings.version,
            },
        )
    return {
        "components": {
            "syntheticDataset": "available",
            "syntheticDatasetVersion": synthetic_manifest["dataset"]["datasetVersion"],
            "featureDataset": "available",
            "featureDatasetVersion": feature_manifest["dataset"]["datasetVersion"],
            "featureContractVersion": feature_manifest["featureContract"]["contractVersion"],
            "offlineEvaluation": "available",
            "experimentVersion": experiment_manifest["experiment"]["experimentVersion"],
            "modelVersion": experiment_manifest["model"]["modelVersion"],
            "deploymentStatus": experiment_manifest["model"]["deploymentStatus"],
            "inferenceService": "available",
            "inferenceVersion": inference_service.overview()["inference"]["inferenceVersion"],
            "servingStatus": inference_service.overview()["inference"]["servingStatus"],
        },
        "service": settings.service_name,
        "status": "ready",
        "timestamp": utc_timestamp(),
        "version": settings.version,
    }


@app.get("/datasets/synthetic/overview")
def synthetic_dataset_overview() -> dict[str, Any]:
    try:
        return load_synthetic_manifest()
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@app.get("/datasets/features/overview")
def feature_dataset_overview() -> dict[str, Any]:
    try:
        return load_feature_manifest()
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@app.get("/experiments/current/overview")
def current_experiment_overview() -> dict[str, Any]:
    try:
        return load_experiment_manifest()
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@app.get("/inference/overview", response_model=InferenceOverview)
def inference_overview() -> dict[str, Any]:
    try:
        return get_inference_service().overview()
    except (ArtifactUnavailableError, ArtifactValidationError) as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@app.post("/predict", response_model=PredictionResponse)
def predict(request: PredictionRequest) -> dict[str, Any]:
    try:
        return get_inference_service().predict(request)
    except FeatureSchemaError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except (ArtifactUnavailableError, ArtifactValidationError) as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@app.post("/graph/analyze", response_model=GraphAnalyticsResponse)
def graph_analytics(request: GraphAnalyticsRequest) -> GraphAnalyticsResponse:
    try:
        return analyze_graph(request)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
