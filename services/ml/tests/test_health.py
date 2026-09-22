from fastapi.testclient import TestClient
import pytest

from app import main as main_module
from app.inference.service import ArtifactUnavailableError
from app.main import app


client = TestClient(app)


def test_liveness() -> None:
    response = client.get("/health/live")

    assert response.status_code == 200
    assert response.json()["service"] == "learnpath-ml"
    assert response.json()["status"] == "ok"
    assert response.json()["version"] == "0.16.0"


def test_readiness() -> None:
    response = client.get("/health/ready")

    assert response.status_code == 200
    assert response.json()["status"] == "ready"
    assert response.json()["components"]["syntheticDataset"] == "available"
    assert response.json()["components"]["featureDataset"] == "available"
    assert response.json()["components"]["featureContractVersion"] == "learner-candidate-features-v2"
    assert response.json()["components"]["offlineEvaluation"] == "available"
    assert response.json()["components"]["deploymentStatus"] == "EVALUATED_NOT_DEPLOYED"
    assert response.json()["components"]["inferenceService"] == "available"
    assert response.json()["components"]["servingStatus"] == "INFERENCE_AVAILABLE_NOT_RANKING"


def test_service_reports_phase_16_probability_role_without_claiming_graph_control() -> None:
    response = client.get("/")

    assert response.status_code == 200
    assert response.json() == {
        "name": "LearnPath ML Service",
        "phase": 16,
        "status": "benefit_inference_for_course_paths",
        "version": "0.16.0",
    }


def test_synthetic_dataset_overview_is_explicit_and_real() -> None:
    response = client.get("/datasets/synthetic/overview")

    assert response.status_code == 200
    payload = response.json()
    assert payload["classification"] == "SYNTHETIC / SIMULATED DATA"
    assert payload["dataset"]["learnerCount"] >= 1_000
    assert payload["dataset"]["interactionCount"] >= 10_000
    assert payload["dataset"]["randomSeed"] == 42
    assert payload["benefitDefinition"]["randomLabels"] is False
    assert payload["phaseBoundary"]["modelTrained"] is False


def test_feature_dataset_overview_exposes_the_frozen_contract() -> None:
    response = client.get("/datasets/features/overview")

    assert response.status_code == 200
    payload = response.json()
    assert payload["classification"] == "SYNTHETIC / SIMULATED DATA — ENGINEERED FEATURES"
    assert payload["featureContract"]["featureCount"] >= 30
    assert payload["featureContract"]["fixedOrder"] is True
    assert payload["featureContract"]["trainingInferenceParity"] is True
    assert payload["featureContract"]["label"]["includedInFeatureMatrix"] is False
    assert payload["validation"]["noCurrentOutcomeLeakage"] is True
    assert payload["phaseBoundary"]["modelTrained"] is False


def test_current_experiment_exposes_measured_results_without_deployment() -> None:
    response = client.get("/experiments/current/overview")

    assert response.status_code == 200
    payload = response.json()
    assert payload["classification"] == "SYNTHETIC / SIMULATED DATA — OFFLINE MODEL EVALUATION"
    assert payload["split"]["learnerCounts"] == {"train": 700, "validation": 150, "test": 150}
    assert payload["split"]["noLearnerOverlap"] is True
    assert payload["model"]["deploymentStatus"] == "EVALUATED_NOT_DEPLOYED"
    assert all(payload["validation"].values())
    assert payload["phaseBoundary"]["modelTrained"] is True
    assert payload["phaseBoundary"]["predictionAvailable"] is False


def test_inference_overview_exposes_runtime_without_ranking() -> None:
    response = client.get("/inference/overview")

    assert response.status_code == 200
    payload = response.json()
    assert payload["inference"]["servingStatus"] == "INFERENCE_AVAILABLE_NOT_RANKING"
    assert payload["validation"]["artifactChecksumVerified"] is True
    assert payload["phaseBoundary"]["predictionAvailable"] is True
    assert payload["phaseBoundary"]["candidateRankingIntegrated"] is False


def test_prediction_endpoint_returns_real_probability_and_version() -> None:
    overview = client.get("/inference/overview").json()
    candidate = overview["sampleCandidates"][0]
    response = client.post("/predict", json={
        "feature_version": overview["featureContract"]["contractVersion"],
        "candidates": [{"skill_id": candidate["skillId"], "features": candidate["features"]}],
    })

    assert response.status_code == 200
    payload = response.json()
    assert payload["model_version"] == "benefit-ranking-v2"
    assert payload["prediction_count"] == 1
    assert 0 <= payload["predictions"][0]["benefit_probability"] <= 1


def test_prediction_schema_drift_returns_explicit_422() -> None:
    overview = client.get("/inference/overview").json()
    candidate = overview["sampleCandidates"][0]
    del candidate["features"]["recent_score"]
    response = client.post("/predict", json={
        "feature_version": overview["featureContract"]["contractVersion"],
        "candidates": [{"skill_id": candidate["skillId"], "features": candidate["features"]}],
    })

    assert response.status_code == 422
    assert "missing: recent_score" in response.json()["detail"]


def test_missing_model_returns_http_503_without_fallback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    overview = client.get("/inference/overview").json()
    candidate = overview["sampleCandidates"][0]

    def unavailable() -> None:
        raise ArtifactUnavailableError("The trained model artifact is unavailable.")

    monkeypatch.setattr(main_module, "get_inference_service", unavailable)
    response = client.post("/predict", json={
        "feature_version": overview["featureContract"]["contractVersion"],
        "candidates": [{"skill_id": candidate["skillId"], "features": candidate["features"]}],
    })

    assert response.status_code == 503
    assert response.json()["detail"] == "The trained model artifact is unavailable."
