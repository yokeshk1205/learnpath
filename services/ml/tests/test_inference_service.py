import json
from pathlib import Path
import shutil

import joblib
import pandas as pd
import pytest

from app.features.contract import FEATURE_CONTRACT_VERSION, FEATURE_NAMES
from app.inference.schemas import PredictionRequest
from app.inference.service import (
    ArtifactUnavailableError,
    ArtifactValidationError,
    FeatureSchemaError,
    INFERENCE_VERSION,
    InferenceService,
    SERVING_STATUS,
)


PROJECT_ROOT = Path(__file__).resolve().parents[1]
EXPERIMENT_DIRECTORY = PROJECT_ROOT / "models" / "benefit-ranking-v2"
FEATURE_DIRECTORY = PROJECT_ROOT / "data" / "features"


def service() -> InferenceService:
    return InferenceService.load(EXPERIMENT_DIRECTORY, FEATURE_DIRECTORY)


def sample_request(candidate_count: int = 1) -> PredictionRequest:
    overview = service().overview()
    candidates = overview["sampleCandidates"][:candidate_count]
    return PredictionRequest(
        feature_version=FEATURE_CONTRACT_VERSION,
        candidates=[
            {"skill_id": candidate["skillId"], "features": candidate["features"]}
            for candidate in candidates
        ],
    )


def test_checked_artifact_loads_with_exact_training_schema() -> None:
    loaded = service()
    overview = loaded.overview()

    assert overview["inference"] == {
        "inferenceVersion": INFERENCE_VERSION,
        "servingStatus": SERVING_STATUS,
        "capability": "BENEFIT_PROBABILITY_ONLY",
        "maximumBatchSize": 100,
        "decisionThreshold": 0.45,
    }
    assert overview["featureContract"]["featureCount"] == 55
    assert overview["featureContract"]["trainingInferenceParity"] is True
    assert all(overview["validation"].values())
    assert overview["phaseBoundary"] == {
        "predictionAvailable": True,
        "benefitProbabilityAvailable": True,
        "candidateRankingIntegrated": False,
        "learnNextAvailable": False,
        "personalizedPathAvailable": False,
        "pathRegenerationAvailable": False,
    }


def test_probability_response_matches_the_serialized_model() -> None:
    loaded = service()
    request = sample_request(3)
    response = loaded.predict(request)
    frame = pd.DataFrame(
        [{name: candidate.features[name] for name in FEATURE_NAMES} for candidate in request.candidates],
        columns=FEATURE_NAMES,
    )
    serialized = joblib.load(EXPERIMENT_DIRECTORY / "model.joblib")
    expected = serialized.predict_proba(frame)[:, list(serialized.classes_).index(1)]

    assert response["model_version"] == "benefit-ranking-v2"
    assert response["feature_version"] == FEATURE_CONTRACT_VERSION
    assert response["inference_version"] == INFERENCE_VERSION
    assert response["serving_status"] == SERVING_STATUS
    assert response["prediction_count"] == 3
    assert [item["skill_id"] for item in response["predictions"]] == [
        candidate.skill_id for candidate in request.candidates
    ]
    for item, probability in zip(response["predictions"], expected, strict=True):
        assert item["benefit_probability"] == pytest.approx(probability, abs=1e-6)


def test_wrong_feature_version_is_rejected() -> None:
    request = sample_request()
    request.feature_version = "drifted-contract"

    with pytest.raises(FeatureSchemaError, match="feature_version"):
        service().predict(request)


@pytest.mark.parametrize("change, expected", [
    ("missing", "missing: recent_score"),
    ("extra", "unexpected: invented_score"),
])
def test_missing_and_extra_features_are_explicit(change: str, expected: str) -> None:
    request = sample_request()
    if change == "missing":
        del request.candidates[0].features["recent_score"]
    else:
        request.candidates[0].features["invented_score"] = 0.5

    with pytest.raises(FeatureSchemaError, match=expected):
        service().predict(request)


def test_out_of_bounds_values_and_duplicate_skills_are_rejected() -> None:
    request = sample_request()
    request.candidates[0].features["confidence"] = 1.5
    with pytest.raises(FeatureSchemaError, match="confidence violates"):
        service().predict(request)

    duplicate = sample_request(2)
    duplicate.candidates[1].skill_id = duplicate.candidates[0].skill_id
    with pytest.raises(FeatureSchemaError, match="only once"):
        service().predict(duplicate)


def test_missing_artifact_returns_no_heuristic_fallback(tmp_path: Path) -> None:
    experiment = tmp_path / "experiment"
    experiment.mkdir()
    shutil.copy(EXPERIMENT_DIRECTORY / "manifest.json", experiment / "manifest.json")

    with pytest.raises(ArtifactUnavailableError, match="artifact is unavailable"):
        InferenceService.load(experiment, FEATURE_DIRECTORY)


def test_checksum_mismatch_is_rejected_before_deserialization(tmp_path: Path) -> None:
    experiment = tmp_path / "experiment"
    experiment.mkdir()
    manifest = json.loads((EXPERIMENT_DIRECTORY / "manifest.json").read_text(encoding="utf-8"))
    (experiment / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    (experiment / "model.joblib").write_bytes(b"not-the-checked-model")

    with pytest.raises(ArtifactValidationError, match="checksum"):
        InferenceService.load(experiment, FEATURE_DIRECTORY)
