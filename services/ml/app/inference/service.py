from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

from app.features.contract import (
    FEATURE_CONTRACT_VERSION,
    FEATURE_NAMES,
    METADATA_COLUMNS,
    validate_feature_frame,
)
from app.inference.schemas import PredictionRequest
from app.training.config import EXPERIMENT_CLASSIFICATION


INFERENCE_CLASSIFICATION = "MODEL INFERENCE — SYNTHETICALLY TRAINED"
INFERENCE_VERSION = "benefit-inference-v2"
SERVING_STATUS = "INFERENCE_AVAILABLE_NOT_RANKING"


class ArtifactUnavailableError(RuntimeError):
    """The checked model artifact cannot be made available."""


class ArtifactValidationError(RuntimeError):
    """The artifact or its metadata violates the serving contract."""


class FeatureSchemaError(ValueError):
    """An inference request does not match the frozen feature contract."""


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _read_json(path: Path, description: str) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ArtifactUnavailableError(f"{description} is unavailable or unreadable.") from error
    if not isinstance(payload, dict):
        raise ArtifactValidationError(f"{description} must contain a JSON object.")
    return payload


class InferenceService:
    def __init__(
        self,
        model: Any,
        experiment_manifest: dict[str, Any],
        feature_manifest: dict[str, Any],
        curriculum: dict[str, Any],
        artifact_sha256: str,
    ) -> None:
        self.model = model
        self.experiment_manifest = experiment_manifest
        self.feature_manifest = feature_manifest
        self.curriculum = curriculum
        self.artifact_sha256 = artifact_sha256
        classes = list(getattr(model, "classes_", []))
        if 1 not in classes:
            raise ArtifactValidationError("The trained model does not expose a positive class.")
        self.positive_class_index = classes.index(1)

    @classmethod
    def load(cls, experiment_directory: Path, feature_directory: Path) -> "InferenceService":
        experiment_manifest = _read_json(
            experiment_directory / "manifest.json", "The Phase 14 experiment manifest"
        )
        feature_manifest = _read_json(
            feature_directory / "manifest.json", "The Phase 13 feature manifest"
        )
        curriculum_file = str(feature_manifest.get("source", {}).get("curriculumFile", ""))
        if not curriculum_file or Path(curriculum_file).name != curriculum_file:
            raise ArtifactValidationError("The curriculum artifact filename is invalid.")
        curriculum = _read_json(
            feature_directory.parent / "input" / curriculum_file,
            "The curriculum context artifact",
        )
        if curriculum.get("classification") != "APPLICATION CURRICULUM / NO LEARNER DATA":
            raise ArtifactValidationError("The curriculum context classification is invalid.")
        if experiment_manifest.get("classification") != EXPERIMENT_CLASSIFICATION:
            raise ArtifactValidationError("The experiment classification is invalid for inference.")
        if not all(experiment_manifest.get("validation", {}).values()):
            raise ArtifactValidationError("The evaluated experiment has failed validation gates.")
        model_info = experiment_manifest.get("model", {})
        dataset_info = experiment_manifest.get("dataset", {})
        contract_info = feature_manifest.get("featureContract", {})
        if model_info.get("deploymentStatus") != "EVALUATED_NOT_DEPLOYED":
            raise ArtifactValidationError("The model does not have the required evaluated status.")
        if dataset_info.get("featureVersion") != FEATURE_CONTRACT_VERSION:
            raise ArtifactValidationError("The trained model feature version is incompatible.")
        if contract_info.get("contractVersion") != FEATURE_CONTRACT_VERSION:
            raise ArtifactValidationError("The serving feature contract version is incompatible.")
        if contract_info.get("featureNames") != FEATURE_NAMES:
            raise ArtifactValidationError("The serving feature names or order have drifted.")
        if contract_info.get("featureCount") != len(FEATURE_NAMES):
            raise ArtifactValidationError("The serving feature count has drifted.")
        if not contract_info.get("trainingInferenceParity"):
            raise ArtifactValidationError("Training/inference feature parity is not certified.")

        artifact_file = str(model_info.get("artifactFile", ""))
        if not artifact_file or Path(artifact_file).name != artifact_file:
            raise ArtifactValidationError("The model artifact filename is invalid.")
        artifact_path = experiment_directory / artifact_file
        if not artifact_path.is_file():
            raise ArtifactUnavailableError("The trained model artifact is unavailable.")
        artifact_sha256 = _sha256(artifact_path)
        if artifact_sha256 != model_info.get("artifactSha256"):
            raise ArtifactValidationError("The trained model artifact checksum does not match.")
        try:
            model = joblib.load(artifact_path)
        except Exception as error:
            raise ArtifactUnavailableError("The trained model artifact could not be loaded.") from error
        if not callable(getattr(model, "predict_proba", None)):
            raise ArtifactValidationError("The trained model does not support probability inference.")
        learned_names = list(getattr(model, "feature_names_in_", []))
        if learned_names and learned_names != FEATURE_NAMES:
            raise ArtifactValidationError("The model's learned feature schema has drifted.")
        return cls(model, experiment_manifest, feature_manifest, curriculum, artifact_sha256)

    @property
    def model_version(self) -> str:
        return str(self.experiment_manifest["model"]["modelVersion"])

    def predict(self, request: PredictionRequest) -> dict[str, Any]:
        if request.feature_version != FEATURE_CONTRACT_VERSION:
            raise FeatureSchemaError(
                f"feature_version must be {FEATURE_CONTRACT_VERSION}."
            )
        skill_ids = [candidate.skill_id for candidate in request.candidates]
        if len(skill_ids) != len(set(skill_ids)):
            raise FeatureSchemaError("Each skill_id must appear only once in an inference batch.")
        records: list[dict[str, float]] = []
        for candidate in request.candidates:
            keys = set(candidate.features)
            expected = set(FEATURE_NAMES)
            if keys != expected:
                missing = sorted(expected - keys)
                extra = sorted(keys - expected)
                detail = []
                if missing:
                    detail.append(f"missing: {', '.join(missing)}")
                if extra:
                    detail.append(f"unexpected: {', '.join(extra)}")
                raise FeatureSchemaError(
                    "Inference feature keys must exactly match the frozen contract ("
                    + "; ".join(detail)
                    + ")."
                )
            records.append({name: candidate.features[name] for name in FEATURE_NAMES})
        frame = pd.DataFrame(records, columns=FEATURE_NAMES)
        try:
            validate_feature_frame(frame)
        except (TypeError, ValueError) as error:
            raise FeatureSchemaError(str(error)) from error
        try:
            probabilities = np.asarray(self.model.predict_proba(frame), dtype=float)[
                :, self.positive_class_index
            ]
        except Exception as error:
            raise ArtifactUnavailableError("The trained model failed during inference.") from error
        if len(probabilities) != len(request.candidates) or not np.isfinite(probabilities).all():
            raise ArtifactValidationError("The model returned invalid probabilities.")
        if bool((probabilities < 0).any()) or bool((probabilities > 1).any()):
            raise ArtifactValidationError("The model returned probabilities outside [0, 1].")
        return {
            "model_version": self.model_version,
            "feature_version": FEATURE_CONTRACT_VERSION,
            "inference_version": INFERENCE_VERSION,
            "serving_status": SERVING_STATUS,
            "prediction_count": len(request.candidates),
            "predictions": [
                {
                    "skill_id": candidate.skill_id,
                    "benefit_probability": round(float(probability), 6),
                }
                for candidate, probability in zip(
                    request.candidates, probabilities, strict=True
                )
            ],
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

    def overview(self) -> dict[str, Any]:
        contract = self.feature_manifest["featureContract"]
        skills = {item["id"]: item for item in self.curriculum.get("skills", [])}
        courses = {item["id"]: item for item in self.curriculum.get("courses", [])}
        samples = []
        for row in self.feature_manifest.get("sampleRows", [])[:6]:
            skill = skills.get(row["skill_id"], {})
            course = courses.get(row["course_id"], {})
            samples.append({
                "candidateId": row["interaction_id"],
                "learnerId": row["learner_id"],
                "courseId": row["course_id"],
                "skillId": row["skill_id"],
                "skillName": skill.get("name", "Unknown skill"),
                "skillCategory": skill.get("category", "Uncategorized"),
                "courseName": course.get("name", "Unknown course"),
                "features": {name: row[name] for name in FEATURE_NAMES},
            })
        return {
            "classification": INFERENCE_CLASSIFICATION,
            "inference": {
                "inferenceVersion": INFERENCE_VERSION,
                "servingStatus": SERVING_STATUS,
                "capability": "BENEFIT_PROBABILITY_ONLY",
                "maximumBatchSize": 100,
                "decisionThreshold": self.experiment_manifest["metrics"]["test"][
                    self.experiment_manifest["model"]["selectedModel"]
                ]["classificationThreshold"],
            },
            "model": {
                "modelVersion": self.model_version,
                "modelType": self.experiment_manifest["model"]["selectedModelDisplayName"],
                "artifactSha256": self.artifact_sha256,
                "artifactEvaluationStatus": self.experiment_manifest["model"][
                    "deploymentStatus"
                ],
                "positiveClass": "beneficial",
                "featureImportance": self.experiment_manifest["model"]["featureImportance"],
            },
            "featureContract": {
                "contractVersion": contract["contractVersion"],
                "featureCount": contract["featureCount"],
                "fixedOrder": contract["fixedOrder"],
                "trainingInferenceParity": contract["trainingInferenceParity"],
                "sha256": contract["sha256"],
                "metadataExcluded": METADATA_COLUMNS,
            },
            "validation": {
                "artifactChecksumVerified": True,
                "featureVersionMatched": True,
                "featureNamesAndOrderMatched": True,
                "probabilityInterfaceAvailable": True,
                "noHeuristicFallback": True,
                "curriculumContextMapped": True,
            },
            "sampleCandidates": samples,
            "phaseBoundary": {
                "predictionAvailable": True,
                "benefitProbabilityAvailable": True,
                "candidateRankingIntegrated": False,
                "learnNextAvailable": False,
                "personalizedPathAvailable": False,
                "pathRegenerationAvailable": False,
            },
        }
