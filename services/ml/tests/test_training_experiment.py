import hashlib
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import pytest

from app.features.contract import FEATURE_NAMES, LABEL_NAME
from app.training.config import TrainingConfig
from app.training.experiment import (
    REQUIRED_METRICS,
    choose_threshold,
    evaluate_scores,
    ranking_metrics,
    split_learners,
    validate_disjoint_splits,
)


PROJECT_ROOT = Path(__file__).resolve().parents[1]
EXPERIMENT_DIRECTORY = PROJECT_ROOT / "models" / "benefit-ranking-v2"
FEATURE_DIRECTORY = PROJECT_ROOT / "data" / "features"
SPLIT_DIRECTORY = PROJECT_ROOT / "data" / "splits"


def file_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_experiment() -> dict:
    return json.loads((EXPERIMENT_DIRECTORY / "manifest.json").read_text(encoding="utf-8"))


def test_learner_split_is_exact_disjoint_and_deterministic() -> None:
    learners = [f"learner-{index:04d}" for index in range(1_000)]
    first = split_learners(learners, TrainingConfig())
    second = split_learners(list(reversed(learners)), TrainingConfig())

    assert first == second
    assert {name: len(values) for name, values in first.items()} == {
        "train": 700, "validation": 150, "test": 150
    }
    validate_disjoint_splits(first, set(learners))


def test_checked_experiment_has_required_models_metrics_and_boundaries() -> None:
    manifest = load_experiment()
    expected_predictors = {
        "gradient_boosting", "random_forest", "logistic_regression",
        "highest_skill_gap", "popularity",
    }

    assert manifest["model"]["selectedModel"] in {
        "gradient_boosting", "random_forest", "logistic_regression"
    }
    assert manifest["model"]["deploymentStatus"] == "EVALUATED_NOT_DEPLOYED"
    assert set(manifest["metrics"]["validation"]) == expected_predictors
    assert set(manifest["metrics"]["test"]) == expected_predictors
    for split_name in ["validation", "test"]:
        for metrics in manifest["metrics"][split_name].values():
            assert all(metric in metrics for metric in REQUIRED_METRICS)
            assert all(np.isfinite(metrics[metric]) for metric in REQUIRED_METRICS)
    assert manifest["phaseBoundary"] == {
        "learnNextAvailable": False,
        "modelDeployed": False,
        "modelEvaluated": True,
        "modelTrained": True,
        "personalizedPathAvailable": False,
        "predictionAvailable": False,
        "rankingIntegrated": False,
    }
    assert all(manifest["validation"].values())


def test_checked_split_assignment_has_no_learner_overlap_and_matches_checksum() -> None:
    manifest = load_experiment()
    split_path = SPLIT_DIRECTORY / manifest["split"]["assignmentFile"]
    assignments = pd.read_csv(split_path)

    assert manifest["split"]["assignmentSha256"] == file_hash(split_path)
    assert len(assignments) == assignments["learner_id"].nunique() == 1_000
    assert assignments.groupby("split")["learner_id"].nunique().to_dict() == {
        "test": 150, "train": 700, "validation": 150
    }


def test_selected_model_metrics_are_recomputed_from_the_held_out_test_rows() -> None:
    manifest = load_experiment()
    features = pd.read_csv(FEATURE_DIRECTORY / manifest["dataset"]["sourceFile"])
    assignments = pd.read_csv(SPLIT_DIRECTORY / manifest["split"]["assignmentFile"])
    test_learners = set(assignments.loc[assignments["split"] == "test", "learner_id"])
    test_frame = features[features["learner_id"].isin(test_learners)].reset_index(drop=True)
    model = joblib.load(EXPERIMENT_DIRECTORY / manifest["model"]["artifactFile"])
    scores = model.predict_proba(test_frame[FEATURE_NAMES])[:, 1]
    selected = manifest["model"]["selectedModel"]
    stored = manifest["metrics"]["test"][selected]
    measured = evaluate_scores(test_frame, scores, stored["classificationThreshold"])

    assert manifest["model"]["artifactSha256"] == file_hash(
        EXPERIMENT_DIRECTORY / manifest["model"]["artifactFile"]
    )
    for metric in REQUIRED_METRICS:
        assert measured[metric] == pytest.approx(stored[metric], abs=1e-6)


def test_model_selection_uses_validation_not_test_results() -> None:
    manifest = load_experiment()
    validation = manifest["metrics"]["validation"]
    model_names = ["gradient_boosting", "random_forest", "logistic_regression"]
    expected = max(
        model_names,
        key=lambda name: (
            validation[name][manifest["experiment"]["selectionMetric"]],
            validation[name]["rocAuc"],
            validation[name]["f1"],
            name,
        ),
    )
    assert manifest["model"]["selectedModel"] == expected
    assert manifest["validation"]["testLearnersUntouchedDuringSelection"] is True


def test_ranking_metrics_and_threshold_are_measured_not_constants() -> None:
    learner_ids = pd.Series(["a", "a", "a", "b", "b", "b"])
    labels = np.array([1, 0, 1, 0, 1, 0])
    strong_scores = np.array([0.9, 0.1, 0.8, 0.2, 0.7, 0.1])
    weak_scores = 1.0 - strong_scores

    strong = ranking_metrics(learner_ids, labels, strong_scores)
    weak = ranking_metrics(learner_ids, labels, weak_scores)
    threshold = choose_threshold(labels, strong_scores, 21)

    assert strong["ndcgAt5"] > weak["ndcgAt5"]
    assert strong["precisionAt3"] == pytest.approx(0.5)
    assert 0.05 <= threshold <= 0.95


def test_baseline_metrics_are_recomputed_from_real_test_features() -> None:
    manifest = load_experiment()
    features = pd.read_csv(FEATURE_DIRECTORY / manifest["dataset"]["sourceFile"])
    assignments = pd.read_csv(SPLIT_DIRECTORY / manifest["split"]["assignmentFile"])
    test_ids = set(assignments.loc[assignments["split"] == "test", "learner_id"])
    test_frame = features[features["learner_id"].isin(test_ids)].reset_index(drop=True)
    for name, feature_name in {
        "highest_skill_gap": "mastery_gap", "popularity": "popularity"
    }.items():
        stored = manifest["metrics"]["test"][name]
        measured = evaluate_scores(
            test_frame,
            test_frame[feature_name].to_numpy(dtype=float),
            stored["classificationThreshold"],
        )
        for metric in REQUIRED_METRICS:
            assert measured[metric] == pytest.approx(stored[metric], abs=1e-6)
