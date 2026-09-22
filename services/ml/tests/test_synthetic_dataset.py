import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd

from app.synthetic import SimulationConfig, write_dataset


PROJECT_ROOT = Path(__file__).resolve().parents[1]
CURRICULUM_PATH = PROJECT_ROOT / "data" / "input" / "curriculum_v1.json"
DATASET_DIRECTORY = PROJECT_ROOT / "data" / "synthetic"


def file_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def test_generation_is_byte_reproducible(tmp_path: Path) -> None:
    config = SimulationConfig(learner_count=24, interactions_per_learner=6)
    first_directory = tmp_path / "first"
    second_directory = tmp_path / "second"

    first = write_dataset(
        CURRICULUM_PATH,
        first_directory,
        config,
        enforce_phase_requirements=False,
    )
    second = write_dataset(
        CURRICULUM_PATH,
        second_directory,
        config,
        enforce_phase_requirements=False,
    )

    assert first["dataset"]["sha256"] == second["dataset"]["sha256"]
    assert file_hash(first_directory / first["dataset"]["fileName"]) == file_hash(
        second_directory / second["dataset"]["fileName"]
    )
    assert json.loads((first_directory / "manifest.json").read_text()) == json.loads(
        (second_directory / "manifest.json").read_text()
    )


def test_checked_dataset_meets_phase_12_contract() -> None:
    manifest = json.loads((DATASET_DIRECTORY / "manifest.json").read_text(encoding="utf-8"))
    dataset_path = DATASET_DIRECTORY / manifest["dataset"]["fileName"]
    frame = pd.read_csv(dataset_path)

    assert manifest["classification"] == "SYNTHETIC / SIMULATED DATA"
    assert manifest["dataset"]["randomSeed"] == 42
    assert manifest["dataset"]["learnerCount"] >= 1_000
    assert manifest["dataset"]["interactionCount"] >= 10_000
    assert manifest["dataset"]["sha256"] == file_hash(dataset_path)
    assert frame["learner_id"].nunique() == manifest["dataset"]["learnerCount"]
    assert frame["synthetic_classification"].eq("SYNTHETIC / SIMULATED DATA").all()
    assert frame["interaction_id"].is_unique
    assert set(frame["learner_level"]) == {"BEGINNER", "INTERMEDIATE", "ADVANCED"}
    assert set(frame["learning_pace"]) == {"FAST", "SLOW"}
    assert set(frame["performance_consistency"]) == {"CONSISTENT", "INCONSISTENT"}
    assert all(manifest["validation"].values())
    assert not manifest["phaseBoundary"]["containsRealLearnerData"]
    assert not manifest["phaseBoundary"]["featureEngineeringImplemented"]
    assert not manifest["phaseBoundary"]["modelTrained"]


def test_beneficial_label_is_derived_from_versioned_outcomes() -> None:
    manifest = json.loads((DATASET_DIRECTORY / "manifest.json").read_text(encoding="utf-8"))
    frame = pd.read_csv(DATASET_DIRECTORY / manifest["dataset"]["fileName"])
    definition = manifest["benefitDefinition"]
    expected = (
        definition["mastery_gain_weight"] * frame["mastery_gain"]
        + definition["completion_weight"] * frame["completion_rate"]
        + definition["assessment_improvement_weight"] * frame["assessment_improvement"]
        + definition["learner_feedback_weight"] * frame["learner_feedback"]
    ).round(6)

    assert np.allclose(expected, frame["benefit_score"], atol=1e-6)
    assert (frame["beneficial"] == (frame["benefit_score"] >= definition["threshold"])).all()
    assert definition["randomLabels"] is False


def test_modeled_relationships_and_noise_are_present() -> None:
    manifest = json.loads((DATASET_DIRECTORY / "manifest.json").read_text(encoding="utf-8"))
    relationships = manifest["modeledRelationships"]

    assert relationships["engagementToCompletion"] > 0.3
    assert relationships["engagementToMasteryGain"] > 0.1
    assert relationships["practiceToAssessmentImprovement"] > 0.1
    assert relationships["prerequisiteMasteryToPostAssessment"] > 0.1
    assert relationships["difficultyMismatchToMasteryGain"] < -0.1
    assert all(value > 0 for value in manifest["noise"].values())
    assert set(manifest["distributions"]["beneficial"]) == {"False", "True"}
