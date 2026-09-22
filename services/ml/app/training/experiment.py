from __future__ import annotations

import hashlib
import json
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from app.features.contract import (
    FEATURE_CLASSIFICATION,
    FEATURE_CONTRACT_VERSION,
    FEATURE_NAMES,
    LABEL_NAME,
    METADATA_COLUMNS,
    validate_feature_frame,
)
from app.training.config import EXPERIMENT_CLASSIFICATION, TrainingConfig


MODEL_DISPLAY_NAMES = {
    "gradient_boosting": "Gradient Boosting",
    "random_forest": "Random Forest",
    "logistic_regression": "Logistic Regression",
    "highest_skill_gap": "Highest Skill Gap",
    "popularity": "Popularity",
}
REQUIRED_METRICS = [
    "accuracy", "precision", "recall", "f1", "rocAuc",
    "precisionAt3", "precisionAt5", "recallAt5", "ndcgAt5",
]


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _native(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): _native(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_native(item) for item in value]
    if isinstance(value, (np.bool_, bool)):
        return bool(value)
    if isinstance(value, (np.floating, float)):
        return round(float(value), 6)
    if isinstance(value, (np.integer, int)):
        return int(value)
    return value


def split_learners(
    learner_ids: list[str], config: TrainingConfig
) -> dict[str, list[str]]:
    config.validate()
    ordered = np.array(sorted(set(learner_ids)), dtype=object)
    if len(ordered) < 3:
        raise ValueError("At least three learners are required for disjoint splits.")
    shuffled = np.random.default_rng(config.random_seed).permutation(ordered)
    train_count = int(round(len(shuffled) * config.train_fraction))
    validation_count = int(round(len(shuffled) * config.validation_fraction))
    if train_count + validation_count >= len(shuffled):
        validation_count = max(1, len(shuffled) - train_count - 1)
    return {
        "train": sorted(str(value) for value in shuffled[:train_count]),
        "validation": sorted(
            str(value) for value in shuffled[train_count : train_count + validation_count]
        ),
        "test": sorted(str(value) for value in shuffled[train_count + validation_count :]),
    }


def validate_disjoint_splits(splits: dict[str, list[str]], expected: set[str]) -> None:
    train = set(splits["train"])
    validation = set(splits["validation"])
    test = set(splits["test"])
    if train & validation or train & test or validation & test:
        raise ValueError("No learner may appear in multiple dataset splits.")
    if train | validation | test != expected:
        raise ValueError("Learner split assignments must cover the complete dataset exactly once.")


def build_models(config: TrainingConfig) -> dict[str, Any]:
    return {
        "gradient_boosting": GradientBoostingClassifier(
            learning_rate=0.05,
            max_depth=3,
            min_samples_leaf=8,
            n_estimators=140,
            random_state=config.random_seed,
        ),
        "random_forest": RandomForestClassifier(
            class_weight="balanced",
            max_depth=12,
            max_features="sqrt",
            min_samples_leaf=4,
            n_estimators=220,
            n_jobs=1,
            random_state=config.random_seed,
        ),
        "logistic_regression": Pipeline([
            ("scaler", StandardScaler()),
            ("classifier", LogisticRegression(
                C=1.0,
                class_weight="balanced",
                max_iter=1_000,
                random_state=config.random_seed,
                solver="liblinear",
            )),
        ]),
    }


def choose_threshold(labels: np.ndarray, scores: np.ndarray, grid_points: int) -> float:
    best: tuple[float, float, float, float] | None = None
    for threshold in np.linspace(0.05, 0.95, grid_points):
        predictions = (scores >= threshold).astype(int)
        f1 = float(f1_score(labels, predictions, zero_division=0))
        precision = float(precision_score(labels, predictions, zero_division=0))
        candidate = (f1, precision, -abs(float(threshold) - 0.5), float(threshold))
        if best is None or candidate > best:
            best = candidate
    if best is None:
        raise ValueError("A classification threshold could not be selected.")
    return best[3]


def ranking_metrics(
    learner_ids: pd.Series,
    labels: np.ndarray,
    scores: np.ndarray,
) -> dict[str, float | int]:
    evaluation = pd.DataFrame({
        "learner_id": learner_ids.to_numpy(),
        "label": labels.astype(int),
        "score": scores.astype(float),
        "stable_order": np.arange(len(labels)),
    })
    precision_at_3: list[float] = []
    precision_at_5: list[float] = []
    recall_at_5: list[float] = []
    ndcg_at_5: list[float] = []
    positive_queries = 0
    for _learner_id, group in evaluation.groupby("learner_id", sort=True):
        ordered = group.sort_values(["score", "stable_order"], ascending=[False, True])
        relevance = ordered["label"].to_numpy(dtype=float)
        relevant_total = float(relevance.sum())
        positive_queries += int(relevant_total > 0)

        def precision_at(k: int) -> float:
            count = min(k, len(relevance))
            return float(relevance[:count].sum() / count) if count else 0.0

        precision_at_3.append(precision_at(3))
        precision_at_5.append(precision_at(5))
        recall_at_5.append(
            float(relevance[:5].sum() / relevant_total) if relevant_total else 0.0
        )
        gains = relevance[:5] / np.log2(np.arange(2, min(5, len(relevance)) + 2))
        ideal = np.sort(relevance)[::-1][:5]
        ideal_gains = ideal / np.log2(np.arange(2, len(ideal) + 2))
        denominator = float(ideal_gains.sum())
        ndcg_at_5.append(float(gains.sum() / denominator) if denominator else 0.0)
    return {
        "precisionAt3": float(np.mean(precision_at_3)),
        "precisionAt5": float(np.mean(precision_at_5)),
        "recallAt5": float(np.mean(recall_at_5)),
        "ndcgAt5": float(np.mean(ndcg_at_5)),
        "queryLearners": int(evaluation["learner_id"].nunique()),
        "positiveQueryLearners": positive_queries,
    }


def evaluate_scores(
    frame: pd.DataFrame,
    scores: np.ndarray,
    threshold: float,
) -> dict[str, float | int | list[list[int]]]:
    labels = frame[LABEL_NAME].to_numpy(dtype=int)
    predictions = (scores >= threshold).astype(int)
    classification = {
        "accuracy": float(accuracy_score(labels, predictions)),
        "precision": float(precision_score(labels, predictions, zero_division=0)),
        "recall": float(recall_score(labels, predictions, zero_division=0)),
        "f1": float(f1_score(labels, predictions, zero_division=0)),
        "rocAuc": float(roc_auc_score(labels, scores)),
        "classificationThreshold": threshold,
        "confusionMatrix": confusion_matrix(labels, predictions, labels=[0, 1]).tolist(),
    }
    return {**classification, **ranking_metrics(frame["learner_id"], labels, scores)}


def _model_configuration(models: dict[str, Any]) -> dict[str, Any]:
    output: dict[str, Any] = {}
    for name, model in models.items():
        parameters = model.get_params(deep=True)
        output[name] = {
            "displayName": MODEL_DISPLAY_NAMES[name],
            "estimator": model.__class__.__name__,
            "parameters": {
                key: value for key, value in parameters.items()
                if isinstance(value, (bool, float, int, str)) or value is None
            },
        }
    return output


def _feature_importance(model: Any) -> list[dict[str, float | str]]:
    if isinstance(model, Pipeline):
        coefficients = np.abs(model.named_steps["classifier"].coef_[0])
    else:
        coefficients = np.asarray(model.feature_importances_)
    total = float(coefficients.sum()) or 1.0
    ranked = sorted(
        zip(FEATURE_NAMES, coefficients / total, strict=True),
        key=lambda item: (-float(item[1]), item[0]),
    )
    return [
        {"feature": name, "importance": float(value)} for name, value in ranked[:12]
    ]


def run_experiment(
    feature_dataset_path: Path,
    feature_manifest_path: Path,
    output_directory: Path,
    split_directory: Path,
    config: TrainingConfig = TrainingConfig(),
) -> dict[str, Any]:
    config.validate()
    feature_manifest = json.loads(feature_manifest_path.read_text(encoding="utf-8"))
    frame = pd.read_csv(feature_dataset_path)
    if feature_manifest.get("classification") != FEATURE_CLASSIFICATION:
        raise ValueError("Phase 14 accepts the validated synthetic feature artifact only.")
    if feature_manifest["featureContract"]["contractVersion"] != FEATURE_CONTRACT_VERSION:
        raise ValueError("The feature contract version does not match the training code.")
    if list(frame.columns) != METADATA_COLUMNS + FEATURE_NAMES + [LABEL_NAME]:
        raise ValueError("The feature dataset columns do not match the frozen contract.")
    validate_feature_frame(frame[FEATURE_NAMES])

    learners = sorted(str(value) for value in frame["learner_id"].unique())
    splits = split_learners(learners, config)
    validate_disjoint_splits(splits, set(learners))
    split_sets = {name: set(values) for name, values in splits.items()}
    frames = {
        name: frame[frame["learner_id"].isin(values)].reset_index(drop=True)
        for name, values in split_sets.items()
    }
    for name, split_frame in frames.items():
        if split_frame[LABEL_NAME].nunique() != 2:
            raise ValueError(f"The {name} split must contain both label classes.")

    models = build_models(config)
    trained: dict[str, Any] = {}
    validation_results: dict[str, Any] = {}
    test_results: dict[str, Any] = {}
    x_train = frames["train"][FEATURE_NAMES]
    y_train = frames["train"][LABEL_NAME]
    for name, model in models.items():
        model.fit(x_train, y_train)
        validation_scores = model.predict_proba(frames["validation"][FEATURE_NAMES])[:, 1]
        threshold = choose_threshold(
            frames["validation"][LABEL_NAME].to_numpy(dtype=int),
            validation_scores,
            config.threshold_grid_points,
        )
        validation_results[name] = evaluate_scores(frames["validation"], validation_scores, threshold)
        test_scores = model.predict_proba(frames["test"][FEATURE_NAMES])[:, 1]
        test_results[name] = evaluate_scores(frames["test"], test_scores, threshold)
        trained[name] = model

    baseline_scores = {
        "highest_skill_gap": "mastery_gap",
        "popularity": "popularity",
    }
    for name, feature_name in baseline_scores.items():
        validation_scores = frames["validation"][feature_name].to_numpy(dtype=float)
        threshold = choose_threshold(
            frames["validation"][LABEL_NAME].to_numpy(dtype=int),
            validation_scores,
            config.threshold_grid_points,
        )
        validation_results[name] = evaluate_scores(frames["validation"], validation_scores, threshold)
        test_results[name] = evaluate_scores(
            frames["test"], frames["test"][feature_name].to_numpy(dtype=float), threshold
        )

    model_names = list(models)
    selected_name = max(
        model_names,
        key=lambda name: (
            validation_results[name][config.selection_metric],
            validation_results[name]["rocAuc"],
            validation_results[name]["f1"],
            name,
        ),
    )

    output_directory.mkdir(parents=True, exist_ok=True)
    split_directory.mkdir(parents=True, exist_ok=True)
    model_path = output_directory / "model.joblib"
    split_path = split_directory / f"{config.split_version}.csv"
    manifest_path = output_directory / "manifest.json"
    joblib.dump(trained[selected_name], model_path, compress=3)
    assignments = pd.DataFrame([
        {"learner_id": learner_id, "split": split_name}
        for split_name, values in splits.items()
        for learner_id in values
    ]).sort_values("learner_id")
    assignments.to_csv(split_path, index=False, lineterminator="\n")

    best_baseline_name = max(
        baseline_scores,
        key=lambda name: test_results[name][config.selection_metric],
    )
    selected_test = test_results[selected_name]
    best_baseline_test = test_results[best_baseline_name]
    validation = {
        "allRequiredMetricsPresent": all(
            all(metric in metrics for metric in REQUIRED_METRICS)
            for metrics in [*validation_results.values(), *test_results.values()]
        ),
        "artifactChecksumsRecorded": True,
        "bothLabelClassesInEverySplit": all(
            split_frame[LABEL_NAME].nunique() == 2 for split_frame in frames.values()
        ),
        "featureContractMatches": True,
        "learnerDisjoint": not (
            split_sets["train"] & split_sets["validation"]
            or split_sets["train"] & split_sets["test"]
            or split_sets["validation"] & split_sets["test"]
        ),
        "metricsFiniteAndMeasured": all(
            np.isfinite(float(metrics[metric]))
            for metrics in [*validation_results.values(), *test_results.values()]
            for metric in REQUIRED_METRICS
        ),
        "modelNotDeployed": config.deployment_status == "EVALUATED_NOT_DEPLOYED",
        "splitCoverageComplete": sum(len(values) for values in splits.values()) == len(learners),
        "testLearnersUntouchedDuringSelection": True,
    }
    if not all(validation.values()):
        failed = [name for name, passed in validation.items() if not passed]
        raise ValueError(f"Training experiment validation failed: {', '.join(failed)}")

    manifest = _native({
        "classification": EXPERIMENT_CLASSIFICATION,
        "experiment": {
            "experimentVersion": config.experiment_version,
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "randomSeed": config.random_seed,
            "selectionMetric": config.selection_metric,
        },
        "model": {
            "modelVersion": config.model_version,
            "selectedModel": selected_name,
            "selectedModelDisplayName": MODEL_DISPLAY_NAMES[selected_name],
            "artifactFile": model_path.name,
            "artifactSha256": _sha256(model_path),
            "deploymentStatus": config.deployment_status,
            "featureImportance": _feature_importance(trained[selected_name]),
        },
        "dataset": {
            "datasetVersion": feature_manifest["dataset"]["datasetVersion"],
            "featureVersion": FEATURE_CONTRACT_VERSION,
            "featureCount": len(FEATURE_NAMES),
            "sourceFile": feature_dataset_path.name,
            "sourceSha256": _sha256(feature_dataset_path),
            "syntheticOnly": True,
        },
        "split": {
            "splitVersion": config.split_version,
            "assignmentFile": split_path.name,
            "assignmentSha256": _sha256(split_path),
            "fractions": {
                "train": config.train_fraction,
                "validation": config.validation_fraction,
                "test": config.test_fraction,
            },
            "learnerCounts": {name: len(values) for name, values in splits.items()},
            "rowCounts": {name: len(split_frame) for name, split_frame in frames.items()},
            "positiveLabels": {
                name: int(split_frame[LABEL_NAME].sum()) for name, split_frame in frames.items()
            },
            "noLearnerOverlap": True,
        },
        "trainingConfiguration": {
            **asdict(config),
            "libraryVersions": {"numpy": np.__version__, "pandas": pd.__version__, "scikitLearn": sklearn.__version__},
            "models": _model_configuration(models),
            "baselineDefinitions": {
                "highest_skill_gap": "Sort descending by mastery_gap.",
                "popularity": "Sort descending by curriculum-derived popularity.",
            },
            "thresholdPolicy": "Maximize validation F1 over the configured threshold grid; apply unchanged to test.",
            "rankingEvaluationUnit": "Candidate interaction rows grouped by held-out learner.",
        },
        "metrics": {
            "validation": validation_results,
            "test": test_results,
        },
        "comparison": {
            "bestBaseline": best_baseline_name,
            "bestBaselineDisplayName": MODEL_DISPLAY_NAMES[best_baseline_name],
            "selectedModelNdcgAt5Lift": selected_test["ndcgAt5"] - best_baseline_test["ndcgAt5"],
            "selectedModelPrecisionAt5Lift": selected_test["precisionAt5"] - best_baseline_test["precisionAt5"],
            "selectedModelRocAucLift": selected_test["rocAuc"] - best_baseline_test["rocAuc"],
        },
        "validation": validation,
        "phaseBoundary": {
            "modelTrained": True,
            "modelEvaluated": True,
            "modelDeployed": False,
            "predictionAvailable": False,
            "rankingIntegrated": False,
            "learnNextAvailable": False,
            "personalizedPathAvailable": False,
        },
    })
    manifest_path.write_text(
        f"{json.dumps(manifest, indent=2, sort_keys=True)}\n", encoding="utf-8"
    )
    return manifest
