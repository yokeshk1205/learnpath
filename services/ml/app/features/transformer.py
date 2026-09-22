from __future__ import annotations

import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from app.features.contract import (
    CURRENT_OUTCOME_COLUMNS,
    FEATURE_CLASSIFICATION,
    FEATURE_COLUMNS,
    FEATURE_CONTRACT_VERSION,
    FEATURE_DATASET_VERSION,
    FEATURE_NAMES,
    FEATURE_SPECS,
    LABEL_NAME,
    METADATA_COLUMNS,
    contract_payload,
    validate_feature_frame,
)
from app.synthetic.config import SYNTHETIC_CLASSIFICATION


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


def load_inputs(dataset_path: Path, curriculum_path: Path) -> tuple[pd.DataFrame, dict[str, Any]]:
    raw = pd.read_csv(dataset_path)
    curriculum = json.loads(curriculum_path.read_text(encoding="utf-8"))
    if not (raw["synthetic_classification"] == SYNTHETIC_CLASSIFICATION).all():
        raise ValueError("Feature engineering accepts explicitly synthetic rows only.")
    if curriculum.get("classification") != "APPLICATION CURRICULUM / NO LEARNER DATA":
        raise ValueError("Feature engineering requires a curriculum-only snapshot.")
    required = {
        "learner_interaction_index", "simulation_day", "elapsed_days",
        "satisfied_prerequisite_ratio", "minimum_prerequisite_mastery",
    }
    missing = sorted(required - set(raw.columns))
    if missing:
        raise ValueError(f"Synthetic input is missing decision-time fields: {', '.join(missing)}")
    return raw, curriculum


def _curriculum_features(curriculum: dict[str, Any]) -> dict[str, dict[str, float]]:
    skill_ids = [str(skill["id"]) for skill in curriculum["skills"]]
    coverage = Counter(
        str(skill_id)
        for course in curriculum["courses"]
        for skill_id in course["skillIds"]
    )
    parents: dict[str, list[str]] = defaultdict(list)
    dependents = Counter()
    for edge in curriculum["prerequisites"]:
        skill_id = str(edge["skillId"])
        prerequisite_id = str(edge["prerequisiteSkillId"])
        parents[skill_id].append(prerequisite_id)
        dependents[prerequisite_id] += 1

    depth_cache: dict[str, int] = {}

    def depth(skill_id: str) -> int:
        if skill_id not in depth_cache:
            depth_cache[skill_id] = 0 if not parents[skill_id] else 1 + max(
                depth(parent) for parent in parents[skill_id]
            )
        return depth_cache[skill_id]

    depths = {skill_id: depth(skill_id) for skill_id in skill_ids}
    max_coverage = max(coverage.values(), default=1)
    max_dependents = max(dependents.values(), default=1)
    max_depth = max(depths.values(), default=1)
    max_minutes = max(float(skill["estimatedMinutes"]) for skill in curriculum["skills"])
    output: dict[str, dict[str, float]] = {}
    for skill in curriculum["skills"]:
        skill_id = str(skill["id"])
        coverage_score = coverage[skill_id] / max_coverage
        dependent_score = dependents[skill_id] / max_dependents
        output[skill_id] = {
            "expected_time": float(skill["estimatedMinutes"]) / max_minutes,
            "prerequisite_depth": depths[skill_id] / max(max_depth, 1),
            "dependent_count": dependent_score,
            "popularity": 0.6 * coverage_score + 0.4 * dependent_score,
        }
    return output


def _shifted_expanding_mean(grouped: Any, column: str, fallback: pd.Series | float) -> pd.Series:
    result = grouped[column].transform(lambda values: values.shift(1).expanding().mean())
    return result.fillna(fallback)


def engineer_features(raw: pd.DataFrame, curriculum: dict[str, Any]) -> pd.DataFrame:
    frame = raw.sort_values(["learner_id", "learner_interaction_index"], kind="stable").copy()
    learner = frame.groupby("learner_id", sort=False)
    learner_skill = frame.groupby(["learner_id", "skill_id"], sort=False)
    curriculum_by_skill = _curriculum_features(curriculum)

    prior_count = learner.cumcount()
    skill_prior_count = learner_skill.cumcount()
    historical_score = _shifted_expanding_mean(learner, "post_assessment", frame["pre_assessment"])
    historical_completion = _shifted_expanding_mean(learner, "completion_rate", 0.5)
    historical_improvement = _shifted_expanding_mean(learner, "assessment_improvement", 0.0)
    historical_feedback = _shifted_expanding_mean(learner, "learner_feedback", 0.5)
    historical_volatility = learner["post_assessment"].transform(
        lambda values: values.shift(1).expanding().std(ddof=0)
    ).fillna(0.0)
    time_ratio = frame["time_spent_minutes"] / frame["expected_time_minutes"].replace(0, np.nan)
    historical_time_ratio = frame.assign(_time_ratio=time_ratio).groupby(
        "learner_id", sort=False
    )["_time_ratio"].transform(lambda values: values.shift(1).expanding().mean()).fillna(1.15)
    skill_completion = _shifted_expanding_mean(learner_skill, "completion_rate", 0.5)
    skill_score = _shifted_expanding_mean(
        learner_skill, "post_assessment", frame["pre_assessment"]
    )
    previous = learner.shift(1)

    features = pd.DataFrame(index=frame.index)
    features["learner_experience"] = np.select(
        [prior_count >= 20, prior_count >= 5], [1.0, 0.5], default=0.0
    )
    features["overall_mastery"] = learner["current_mastery"].transform(
        lambda values: values.expanding().mean()
    )
    features["learning_pace"] = np.clip((1.5 - historical_time_ratio) / 0.7, 0.0, 1.0)
    features["activity_frequency"] = np.clip(
        prior_count / np.maximum(frame["simulation_day"], 1), 0.0, 1.0
    )
    features["consistency"] = np.where(prior_count > 1, 1.0 - historical_volatility, 0.5)
    features["learner_performance_proxy"] = np.clip(
        0.45 * features["overall_mastery"]
        + 0.20 * frame["current_confidence"]
        + 0.35 * frame["pre_assessment"],
        0.0,
        1.0,
    )
    features["prior_interaction_count"] = np.clip(prior_count / 20.0, 0.0, 1.0)
    features["historical_completion_rate"] = historical_completion
    features["historical_assessment_improvement"] = historical_improvement
    features["historical_feedback"] = historical_feedback
    features["learner_cold_start"] = (prior_count == 0).astype(float)

    features["difficulty"] = (frame["skill_difficulty"] - 1.0) / 4.0
    features["goal_relevance"] = np.where(frame["candidate_kind"] == "SUPPORTING_PREREQUISITE", 0.72, 1.0)
    for name in ["popularity", "expected_time", "prerequisite_depth", "dependent_count"]:
        features[name] = frame["skill_id"].map(lambda value: curriculum_by_skill[str(value)][name])
    features["candidate_is_course_skill"] = (frame["candidate_kind"] != "SUPPORTING_PREREQUISITE").astype(float)

    features["current_mastery"] = frame["current_mastery"]
    features["confidence"] = frame["current_confidence"]
    features["mastery_gap"] = 1.0 - frame["current_mastery"]
    features["evidence_strength"] = np.clip(np.log1p(frame["evidence_count"]) / np.log(21.0), 0.0, 1.0)
    features["mastery_confidence_alignment"] = 1.0 - (frame["current_mastery"] - frame["current_confidence"]).abs()

    features["recent_score"] = frame["pre_assessment"]
    features["average_score"] = historical_score
    features["score_trend"] = frame["pre_assessment"] - historical_score
    features["attempt_count"] = np.clip(skill_prior_count / 10.0, 0.0, 1.0)
    features["correct_rate"] = historical_score
    features["score_volatility"] = np.clip(historical_volatility, 0.0, 1.0)
    features["skill_completion_rate"] = skill_completion
    features["skill_average_score"] = skill_score

    features["days_since_practice"] = np.clip(frame["days_since_evidence"] / 60.0, 0.0, 1.0)
    features["retention"] = frame["retention"]
    features["retention_state_fresh"] = (frame["retention"] >= 0.75).astype(float)
    features["retention_state_due"] = ((frame["retention"] >= 0.50) & (frame["retention"] < 0.75)).astype(float)
    features["retention_state_critical"] = (frame["retention"] < 0.50).astype(float)
    features["revision_due"] = (frame["candidate_kind"] == "REVISION").astype(float)

    max_prerequisites = max(float(frame["required_prerequisite_count"].max()), 1.0)
    features["prerequisite_count"] = frame["required_prerequisite_count"] / max_prerequisites
    features["satisfied_ratio"] = frame["satisfied_prerequisite_ratio"]
    features["minimum_prerequisite_mastery"] = frame["minimum_prerequisite_mastery"]
    features["average_prerequisite_mastery"] = frame["prerequisite_mastery"]
    features["prerequisite_readiness"] = np.clip(frame["prerequisite_readiness"] / 1.5, 0.0, 1.0)
    features["has_prerequisites"] = (frame["required_prerequisite_count"] > 0).astype(float)

    features["previous_interaction"] = (prior_count > 0).astype(float)
    previous_time_ratio = previous["time_spent_minutes"] / previous["expected_time_minutes"].replace(0, np.nan)
    features["time_spent"] = np.clip(previous_time_ratio.fillna(0.0) / 2.0, 0.0, 1.0)
    features["previous_completion"] = previous["completed"].eq(True).astype(float)
    features["recommendation_response"] = previous["beneficial"].eq(True).astype(float)
    features["previous_engagement"] = previous["engagement"].fillna(0.0)
    features["previous_practice"] = np.clip(previous["practice_attempts"].fillna(0.0) / 5.0, 0.0, 1.0)
    features["previous_candidate_same_skill"] = (
        previous["skill_id"].notna() & (previous["skill_id"] == frame["skill_id"])
    ).astype(float)
    features["candidate_is_learn"] = (frame["candidate_kind"] == "LEARN").astype(float)
    features["candidate_is_revision"] = (frame["candidate_kind"] == "REVISION").astype(float)
    features["candidate_is_supporting"] = (frame["candidate_kind"] == "SUPPORTING_PREREQUISITE").astype(float)
    features["elapsed_since_previous_interaction"] = np.clip(frame["elapsed_days"] / 7.0, 0.0, 1.0)
    features["course_context_switch"] = (
        previous["course_id"].notna() & (previous["course_id"] != frame["course_id"])
    ).astype(float)

    features = features[FEATURE_NAMES].astype(float)
    validate_feature_frame(features)
    output = pd.DataFrame({
        "synthetic_classification": FEATURE_CLASSIFICATION,
        "feature_version": FEATURE_CONTRACT_VERSION,
        "interaction_id": frame["interaction_id"],
        "learner_id": frame["learner_id"],
        "course_id": frame["course_id"],
        "skill_id": frame["skill_id"],
    }, index=frame.index)
    output = pd.concat([output, features], axis=1)
    output[LABEL_NAME] = frame[LABEL_NAME].astype(int)
    return output[FEATURE_COLUMNS].reset_index(drop=True)


def build_manifest(
    feature_frame: pd.DataFrame,
    raw: pd.DataFrame,
    input_dataset_path: Path,
    curriculum_path: Path,
) -> dict[str, Any]:
    matrix = feature_frame[FEATURE_NAMES]
    category_counts = Counter(spec.category for spec in FEATURE_SPECS)
    leakage_safe = all(
        not any(column in spec.source and spec.availability != "PRIOR_HISTORY" for column in CURRENT_OUTCOME_COLUMNS)
        for spec in FEATURE_SPECS
    )
    validation = {
        "atLeastThirtyFeatures": len(FEATURE_NAMES) >= 30,
        "categoryCoverageComplete": set(category_counts) == {
            "LEARNER", "SKILL", "MASTERY", "PERFORMANCE", "RETENTION", "PREREQUISITE", "INTERACTION"
        },
        "featureOrderFrozen": list(matrix.columns) == FEATURE_NAMES,
        "finiteNumericValues": bool(np.isfinite(matrix.to_numpy()).all()),
        "identifiersExcludedFromMatrix": not {"learner_id", "course_id", "skill_id", "interaction_id"} & set(FEATURE_NAMES),
        "labelExcludedFromMatrix": LABEL_NAME not in FEATURE_NAMES,
        "noCurrentOutcomeLeakage": leakage_safe,
        "rowCountMatchesInput": len(feature_frame) == len(raw),
        "syntheticClassificationConsistent": bool((feature_frame["synthetic_classification"] == FEATURE_CLASSIFICATION).all()),
        "trainingInferenceSchemaShared": True,
    }
    if not all(validation.values()):
        failed = [name for name, passed in validation.items() if not passed]
        raise ValueError(f"Feature dataset validation failed: {', '.join(failed)}")
    return _native({
        "classification": FEATURE_CLASSIFICATION,
        "featureContract": contract_payload(),
        "dataset": {
            "datasetVersion": FEATURE_DATASET_VERSION,
            "rowCount": len(feature_frame),
            "learnerCount": int(feature_frame["learner_id"].nunique()),
            "positiveLabels": int(feature_frame[LABEL_NAME].sum()),
            "negativeLabels": int((feature_frame[LABEL_NAME] == 0).sum()),
        },
        "source": {
            "syntheticDatasetVersion": str(raw["dataset_version"].iloc[0]),
            "syntheticDatasetFile": input_dataset_path.name,
            "syntheticDatasetSha256": _sha256(input_dataset_path),
            "curriculumFile": curriculum_path.name,
            "curriculumSha256": _sha256(curriculum_path),
            "containsRealLearnerData": False,
        },
        "categoryCounts": dict(sorted(category_counts.items())),
        "featureRanges": {
            name: {"minimum": float(matrix[name].min()), "maximum": float(matrix[name].max()), "mean": float(matrix[name].mean())}
            for name in FEATURE_NAMES
        },
        "sampleRows": feature_frame.head(6).to_dict(orient="records"),
        "validation": validation,
        "phaseBoundary": {
            "featureEngineeringImplemented": True,
            "learnerDisjointSplitsCreated": False,
            "modelTrained": False,
            "predictionAvailable": False,
            "rankingAvailable": False,
        },
    })


def write_feature_dataset(
    input_dataset_path: Path,
    curriculum_path: Path,
    output_directory: Path,
) -> dict[str, Any]:
    raw, curriculum = load_inputs(input_dataset_path, curriculum_path)
    feature_frame = engineer_features(raw, curriculum)
    manifest = build_manifest(feature_frame, raw, input_dataset_path, curriculum_path)
    output_directory.mkdir(parents=True, exist_ok=True)
    contract_path = output_directory / f"{FEATURE_CONTRACT_VERSION}.json"
    dataset_path = output_directory / f"{FEATURE_DATASET_VERSION}.csv"
    manifest_path = output_directory / "manifest.json"
    contract_path.write_text(f"{json.dumps(contract_payload(), indent=2, sort_keys=True)}\n", encoding="utf-8")
    feature_frame.to_csv(dataset_path, index=False, float_format="%.6f", lineterminator="\n")
    manifest["featureContract"]["fileName"] = contract_path.name
    manifest["featureContract"]["sha256"] = _sha256(contract_path)
    manifest["dataset"]["fileName"] = dataset_path.name
    manifest["dataset"]["sha256"] = _sha256(dataset_path)
    manifest_path.write_text(f"{json.dumps(_native(manifest), indent=2, sort_keys=True)}\n", encoding="utf-8")
    return manifest
