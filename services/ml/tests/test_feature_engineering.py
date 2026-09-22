import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from app.features.contract import (
    CURRENT_OUTCOME_COLUMNS,
    FEATURE_CLASSIFICATION,
    FEATURE_NAMES,
    FEATURE_SPECS,
    METADATA_COLUMNS,
    validate_feature_frame,
    validate_feature_record,
)
from app.features.transformer import engineer_features, write_feature_dataset


PROJECT_ROOT = Path(__file__).resolve().parents[1]
CURRICULUM_PATH = PROJECT_ROOT / "data" / "input" / "curriculum_v1.json"
SYNTHETIC_DIRECTORY = PROJECT_ROOT / "data" / "synthetic"
FEATURE_DIRECTORY = PROJECT_ROOT / "data" / "features"


def file_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_checked_artifacts() -> tuple[dict, pd.DataFrame, pd.DataFrame]:
    manifest = json.loads((FEATURE_DIRECTORY / "manifest.json").read_text(encoding="utf-8"))
    engineered = pd.read_csv(FEATURE_DIRECTORY / manifest["dataset"]["fileName"])
    synthetic_manifest = json.loads(
        (SYNTHETIC_DIRECTORY / "manifest.json").read_text(encoding="utf-8")
    )
    raw = pd.read_csv(SYNTHETIC_DIRECTORY / synthetic_manifest["dataset"]["fileName"])
    return manifest, engineered, raw


def test_frozen_contract_has_required_order_categories_and_boundary() -> None:
    manifest, engineered, _raw = load_checked_artifacts()
    contract = manifest["featureContract"]

    assert len(FEATURE_NAMES) == 55
    assert contract["featureNames"] == FEATURE_NAMES
    assert [item["order"] for item in contract["features"]] == list(range(1, 56))
    assert list(engineered.columns) == METADATA_COLUMNS + FEATURE_NAMES + ["beneficial"]
    assert set(manifest["categoryCounts"]) == {
        "LEARNER", "SKILL", "MASTERY", "PERFORMANCE", "RETENTION", "PREREQUISITE", "INTERACTION"
    }
    assert contract["label"]["includedInFeatureMatrix"] is False
    assert manifest["phaseBoundary"]["featureEngineeringImplemented"] is True
    assert manifest["phaseBoundary"]["modelTrained"] is False


def test_checked_feature_artifact_is_valid_and_traceable() -> None:
    manifest, engineered, raw = load_checked_artifacts()
    dataset_path = FEATURE_DIRECTORY / manifest["dataset"]["fileName"]
    contract_path = FEATURE_DIRECTORY / manifest["featureContract"]["fileName"]

    assert manifest["classification"] == FEATURE_CLASSIFICATION
    assert manifest["dataset"]["rowCount"] == len(raw) == len(engineered) == 20_000
    assert manifest["dataset"]["learnerCount"] == 1_000
    assert manifest["dataset"]["sha256"] == file_hash(dataset_path)
    assert manifest["featureContract"]["sha256"] == file_hash(contract_path)
    assert manifest["source"]["syntheticDatasetSha256"] == file_hash(
        SYNTHETIC_DIRECTORY / manifest["source"]["syntheticDatasetFile"]
    )
    assert all(manifest["validation"].values())
    assert engineered["synthetic_classification"].eq(FEATURE_CLASSIFICATION).all()
    assert engineered["beneficial"].isin([0, 1]).all()
    validate_feature_frame(engineered[FEATURE_NAMES])


def test_current_outcomes_are_excluded_and_historical_outcomes_are_shifted() -> None:
    manifest, engineered, raw = load_checked_artifacts()
    assert not CURRENT_OUTCOME_COLUMNS & set(FEATURE_NAMES)
    assert manifest["validation"]["noCurrentOutcomeLeakage"] is True
    for spec in FEATURE_SPECS:
        if any(column in spec.source for column in CURRENT_OUTCOME_COLUMNS):
            assert spec.availability == "PRIOR_HISTORY"

    first_learner = engineered[engineered["learner_id"] == "sim-learner-000001"].reset_index(drop=True)
    first_raw = raw[raw["learner_id"] == "sim-learner-000001"].reset_index(drop=True)
    assert first_learner.loc[0, "previous_interaction"] == 0.0
    assert first_learner.loc[0, "time_spent"] == 0.0
    assert first_learner.loc[1, "previous_interaction"] == 1.0
    assert first_learner.loc[1, "previous_engagement"] == pytest.approx(first_raw.loc[0, "engagement"])
    assert first_learner.loc[1, "previous_completion"] == float(first_raw.loc[0, "completed"])
    assert first_learner.loc[1, "recommendation_response"] == float(first_raw.loc[0, "beneficial"])


def test_training_and_future_inference_share_the_same_validator() -> None:
    _manifest, engineered, _raw = load_checked_artifacts()
    matrix = engineered[FEATURE_NAMES].head(2)
    validate_feature_frame(matrix)
    validate_feature_record(matrix.iloc[0].to_dict())

    with pytest.raises(ValueError, match="frozen feature contract order"):
        validate_feature_frame(matrix[list(reversed(FEATURE_NAMES))])
    invalid = matrix.copy()
    invalid.loc[invalid.index[0], "current_mastery"] = np.inf
    with pytest.raises(ValueError, match="finite"):
        validate_feature_frame(invalid)
    with pytest.raises(ValueError, match="keys"):
        validate_feature_record({"current_mastery": 0.5})


def test_generation_is_reproducible_for_the_same_ordered_input(tmp_path: Path) -> None:
    synthetic_manifest = json.loads(
        (SYNTHETIC_DIRECTORY / "manifest.json").read_text(encoding="utf-8")
    )
    source = pd.read_csv(SYNTHETIC_DIRECTORY / synthetic_manifest["dataset"]["fileName"])
    subset = source[source["learner_id"].isin(source["learner_id"].unique()[:5])]
    subset_path = tmp_path / "subset.csv"
    subset.to_csv(subset_path, index=False)
    first = write_feature_dataset(subset_path, CURRICULUM_PATH, tmp_path / "first")
    second = write_feature_dataset(subset_path, CURRICULUM_PATH, tmp_path / "second")

    assert first["dataset"]["sha256"] == second["dataset"]["sha256"]
    assert first["featureContract"]["sha256"] == second["featureContract"]["sha256"]


def test_transformer_is_order_stable_and_preserves_exact_prerequisite_inputs() -> None:
    _manifest, _engineered, raw = load_checked_artifacts()
    curriculum = json.loads(CURRICULUM_PATH.read_text(encoding="utf-8"))
    subset = raw[raw["learner_id"].isin(raw["learner_id"].unique()[:3])]
    transformed = engineer_features(subset.sample(frac=1.0, random_state=7), curriculum)
    ordered = transformed.sort_values("interaction_id").reset_index(drop=True)
    expected = subset.sort_values("interaction_id").reset_index(drop=True)

    assert np.allclose(ordered["satisfied_ratio"], expected["satisfied_prerequisite_ratio"])
    assert np.allclose(
        ordered["minimum_prerequisite_mastery"], expected["minimum_prerequisite_mastery"]
    )
