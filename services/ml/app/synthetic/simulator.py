from __future__ import annotations

import hashlib
import json
import math
from collections import Counter, defaultdict
from dataclasses import asdict
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from app.synthetic.config import SYNTHETIC_CLASSIFICATION, SimulationConfig


def _clip(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return float(np.clip(value, low, high))


def _sigmoid(value: float) -> float:
    return 1.0 / (1.0 + math.exp(-value))


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


def load_curriculum(path: Path) -> tuple[dict[str, Any], str]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if payload.get("classification") != "APPLICATION CURRICULUM / NO LEARNER DATA":
        raise ValueError("The curriculum snapshot must explicitly exclude learner data.")
    if payload.get("schemaVersion") != "curriculum-v1":
        raise ValueError("Unsupported curriculum snapshot schema.")
    if not payload.get("skills") or not payload.get("courses"):
        raise ValueError("The curriculum snapshot has no active skills or courses.")
    return payload, _sha256(path)


def _topological_skill_ids(
    skill_ids: list[str], prerequisites: list[dict[str, Any]]
) -> list[str]:
    incoming: dict[str, int] = {skill_id: 0 for skill_id in skill_ids}
    dependents: dict[str, list[str]] = defaultdict(list)
    for edge in prerequisites:
        skill_id = str(edge["skillId"])
        prerequisite_id = str(edge["prerequisiteSkillId"])
        incoming[skill_id] += 1
        dependents[prerequisite_id].append(skill_id)
    ready = sorted(skill_id for skill_id, count in incoming.items() if count == 0)
    ordered: list[str] = []
    while ready:
        current = ready.pop(0)
        ordered.append(current)
        for dependent in sorted(dependents[current]):
            incoming[dependent] -= 1
            if incoming[dependent] == 0:
                ready.append(dependent)
                ready.sort()
    if len(ordered) != len(skill_ids):
        raise ValueError("The curriculum prerequisite graph must be acyclic.")
    return ordered


def _profile(rng: np.random.Generator) -> dict[str, Any]:
    level = str(rng.choice(["BEGINNER", "INTERMEDIATE", "ADVANCED"], p=[0.40, 0.36, 0.24]))
    pace = str(rng.choice(["FAST", "SLOW"], p=[0.46, 0.54]))
    consistency = str(rng.choice(["CONSISTENT", "INCONSISTENT"], p=[0.64, 0.36]))
    ability_mean = {"BEGINNER": 0.31, "INTERMEDIATE": 0.57, "ADVANCED": 0.78}[level]
    ability = _clip(float(rng.normal(ability_mean, 0.09)), 0.08, 0.96)
    engagement = _clip(float(rng.normal(0.70 if consistency == "CONSISTENT" else 0.57, 0.10)))
    practice_propensity = _clip(float(rng.normal(0.61, 0.16)))
    return {
        "ability": ability,
        "archetype": f"{level}_{pace}_{consistency}",
        "consistency": consistency,
        "engagement_propensity": engagement,
        "level": level,
        "pace": pace,
        "pace_factor": 1.14 if pace == "FAST" else 0.84,
        "practice_propensity": practice_propensity,
    }


def _initial_state(
    rng: np.random.Generator,
    profile: dict[str, Any],
    ordered_skills: list[str],
    skills: dict[str, dict[str, Any]],
    prerequisite_edges: dict[str, list[dict[str, Any]]],
) -> tuple[dict[str, float], dict[str, float], dict[str, int], dict[str, int]]:
    mastery: dict[str, float] = {}
    confidence: dict[str, float] = {}
    days_since_evidence: dict[str, int] = {}
    evidence_count: dict[str, int] = {}
    noise_scale = 0.045 if profile["consistency"] == "CONSISTENT" else 0.105
    for skill_id in ordered_skills:
        skill = skills[skill_id]
        difficulty = (float(skill["difficulty"]) - 1.0) / 4.0
        ability_signal = _sigmoid((profile["ability"] - difficulty) * 4.2)
        required = [
            edge
            for edge in prerequisite_edges[skill_id]
            if edge["relationshipType"] == "REQUIRED"
        ]
        prerequisite_signal = (
            float(np.mean([mastery[str(edge["prerequisiteSkillId"])] for edge in required]))
            if required
            else ability_signal
        )
        estimate = 0.64 * ability_signal + 0.36 * prerequisite_signal
        mastery[skill_id] = _clip(float(rng.normal(estimate, noise_scale)), 0.02, 0.96)
        base_evidence = int(rng.integers(0, 7 if profile["level"] == "BEGINNER" else 12))
        evidence_count[skill_id] = base_evidence
        confidence[skill_id] = _clip(0.12 + 0.075 * base_evidence + float(rng.normal(0, 0.04)))
        days_since_evidence[skill_id] = int(rng.integers(1, 31)) if base_evidence else 0
    return mastery, confidence, days_since_evidence, evidence_count


def _retention(mastery: float, confidence: float, evidence_count: int, days: int) -> float:
    effective_lambda = 0.025 / (0.75 + confidence + 0.08 * math.log1p(evidence_count))
    return _clip(mastery * math.exp(-effective_lambda * days))


def _benefit_score(row: dict[str, Any], config: SimulationConfig) -> float:
    policy = config.benefit
    return round(
        policy.mastery_gain_weight * float(row["mastery_gain"])
        + policy.completion_weight * float(row["completion_rate"])
        + policy.assessment_improvement_weight * float(row["assessment_improvement"])
        + policy.learner_feedback_weight * float(row["learner_feedback"]),
        6,
    )


def _distribution(frame: pd.DataFrame, column: str) -> dict[str, int]:
    counts = frame[column].value_counts(dropna=False).sort_index()
    return {str(key): int(value) for key, value in counts.items()}


def _correlation(frame: pd.DataFrame, left: str, right: str) -> float:
    value = frame[left].corr(frame[right])
    return 0.0 if pd.isna(value) else round(float(value), 6)


def _schema() -> list[dict[str, str]]:
    roles = {
        "synthetic_classification": "PROVENANCE",
        "dataset_version": "PROVENANCE",
        "generator_version": "PROVENANCE",
        "random_seed": "PROVENANCE",
        "interaction_id": "SYNTHETIC_IDENTIFIER",
        "learner_id": "SYNTHETIC_IDENTIFIER",
        "learner_archetype": "SIMULATION_INPUT",
        "learner_level": "SIMULATION_INPUT",
        "learning_pace": "SIMULATION_INPUT",
        "performance_consistency": "SIMULATION_INPUT",
        "learner_ability": "SIMULATION_INPUT",
        "learner_interaction_index": "SIMULATION_INPUT",
        "simulation_day": "SIMULATION_INPUT",
        "elapsed_days": "SIMULATION_INPUT",
        "course_id": "CURRICULUM_CONTEXT",
        "course_slug": "CURRICULUM_CONTEXT",
        "skill_id": "CURRICULUM_CONTEXT",
        "skill_slug": "CURRICULUM_CONTEXT",
        "skill_category": "CURRICULUM_CONTEXT",
        "skill_difficulty": "CURRICULUM_CONTEXT",
        "candidate_kind": "SIMULATION_INPUT",
        "current_mastery": "SIMULATION_INPUT",
        "current_confidence": "SIMULATION_INPUT",
        "retention": "SIMULATION_INPUT",
        "days_since_evidence": "SIMULATION_INPUT",
        "evidence_count": "SIMULATION_INPUT",
        "required_prerequisite_count": "SIMULATION_INPUT",
        "satisfied_prerequisite_ratio": "SIMULATION_INPUT",
        "minimum_prerequisite_mastery": "SIMULATION_INPUT",
        "prerequisite_mastery": "SIMULATION_INPUT",
        "prerequisite_readiness": "SIMULATION_INPUT",
        "engagement": "SIMULATED_BEHAVIOR",
        "practice_attempts": "SIMULATED_BEHAVIOR",
        "time_spent_minutes": "SIMULATED_BEHAVIOR",
        "expected_time_minutes": "CURRICULUM_CONTEXT",
        "completion_rate": "SIMULATED_OUTCOME",
        "completed": "SIMULATED_OUTCOME",
        "guessing": "REALISTIC_NOISE",
        "disengaged": "REALISTIC_NOISE",
        "skipped_content": "REALISTIC_NOISE",
        "inconsistent_performance": "REALISTIC_NOISE",
        "difficulty_mismatch": "REALISTIC_NOISE",
        "pre_assessment": "SIMULATION_INPUT",
        "post_assessment": "SIMULATED_OUTCOME",
        "assessment_improvement": "SIMULATED_OUTCOME",
        "post_mastery": "SIMULATED_OUTCOME",
        "mastery_gain": "SIMULATED_OUTCOME",
        "feedback_rating": "SIMULATED_OUTCOME",
        "learner_feedback": "SIMULATED_OUTCOME",
        "benefit_score": "DETERMINISTIC_LABEL_INPUT",
        "beneficial": "DETERMINISTIC_LABEL",
    }
    return [{"name": name, "role": role} for name, role in roles.items()]


def generate_dataset(
    curriculum: dict[str, Any],
    curriculum_checksum: str,
    config: SimulationConfig = SimulationConfig(),
    *,
    enforce_phase_requirements: bool = True,
) -> tuple[pd.DataFrame, dict[str, Any]]:
    config.validate(enforce_phase_requirements=enforce_phase_requirements)
    rng = np.random.default_rng(config.random_seed)
    skills = {str(skill["id"]): skill for skill in curriculum["skills"]}
    courses = {str(course["id"]): course for course in curriculum["courses"]}
    skill_ids = sorted(skills)
    prerequisite_edges: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for edge in curriculum["prerequisites"]:
        prerequisite_edges[str(edge["skillId"])].append(edge)
    ordered_skills = _topological_skill_ids(skill_ids, curriculum["prerequisites"])
    course_relevant_skills: dict[str, list[str]] = {}
    for course_id, course in courses.items():
        relevant = {str(skill_id) for skill_id in course["skillIds"]}
        frontier = list(relevant)
        while frontier:
            current = frontier.pop()
            for edge in prerequisite_edges[current]:
                prerequisite_id = str(edge["prerequisiteSkillId"])
                if prerequisite_id not in relevant:
                    relevant.add(prerequisite_id)
                    frontier.append(prerequisite_id)
        course_relevant_skills[course_id] = sorted(relevant)
    records: list[dict[str, Any]] = []
    interaction_number = 0

    for learner_number in range(1, config.learner_count + 1):
        learner_id = f"sim-learner-{learner_number:06d}"
        profile = _profile(rng)
        mastery, confidence, days_since, evidence_count = _initial_state(
            rng, profile, ordered_skills, skills, prerequisite_edges
        )
        enrollment_count = int(rng.choice([1, 2, 3], p=[0.48, 0.38, 0.14]))
        enrolled_course_ids = [
            str(value)
            for value in rng.choice(sorted(courses), size=enrollment_count, replace=False)
        ]
        simulation_day = 0

        for learner_interaction_index in range(1, config.interactions_per_learner + 1):
            elapsed_days = int(rng.integers(0, 4))
            simulation_day += elapsed_days
            for known_skill_id in skill_ids:
                days_since[known_skill_id] += elapsed_days

            available: list[tuple[str, str, str, float]] = []
            fallback: list[tuple[str, str, str, float]] = []
            for course_id in enrolled_course_ids:
                direct_skill_ids = {str(value) for value in courses[course_id]["skillIds"]}
                for skill_id in course_relevant_skills[course_id]:
                    skill_id = str(skill_id)
                    required = [
                        edge
                        for edge in prerequisite_edges[skill_id]
                        if edge["relationshipType"] == "REQUIRED"
                    ]
                    if not all(
                        mastery[str(edge["prerequisiteSkillId"])]
                        >= float(edge["requiredMastery"])
                        for edge in required
                    ):
                        continue
                    retained = _retention(
                        mastery[skill_id], confidence[skill_id], evidence_count[skill_id],
                        days_since[skill_id]
                    )
                    revision_due = (
                        evidence_count[skill_id] > 0
                        and mastery[skill_id] >= 0.65
                        and retained < 0.55
                    )
                    kind = (
                        "REVISION"
                        if revision_due
                        else "LEARN" if skill_id in direct_skill_ids else "SUPPORTING_PREREQUISITE"
                    )
                    priority = (
                        (1.0 - mastery[skill_id])
                        + (0.45 if revision_due else 0.0)
                        + (0.10 if kind == "SUPPORTING_PREREQUISITE" else 0.0)
                    )
                    fallback.append((course_id, skill_id, kind, max(priority, 0.05)))
                    if mastery[skill_id] < 0.70 or revision_due:
                        available.append((course_id, skill_id, kind, max(priority, 0.05)))
            choices = available or fallback
            if not choices:
                raise ValueError("No prerequisite-valid simulated interaction is available.")
            weights = np.array([choice[3] for choice in choices], dtype=float)
            selected_index = int(rng.choice(len(choices), p=weights / weights.sum()))
            course_id, skill_id, candidate_kind, _priority = choices[selected_index]
            skill = skills[skill_id]
            required = [
                edge
                for edge in prerequisite_edges[skill_id]
                if edge["relationshipType"] == "REQUIRED"
            ]
            prerequisite_mastery = (
                float(np.mean([mastery[str(edge["prerequisiteSkillId"])] for edge in required]))
                if required
                else 1.0
            )
            minimum_prerequisite_mastery = (
                float(np.min([mastery[str(edge["prerequisiteSkillId"])] for edge in required]))
                if required
                else 1.0
            )
            satisfied_prerequisite_ratio = (
                float(np.mean([
                    mastery[str(edge["prerequisiteSkillId"])] >= float(edge["requiredMastery"])
                    for edge in required
                ]))
                if required
                else 1.0
            )
            prerequisite_readiness = (
                float(np.mean([
                    mastery[str(edge["prerequisiteSkillId"])] / float(edge["requiredMastery"])
                    for edge in required
                ]))
                if required
                else 1.0
            )
            current_mastery = mastery[skill_id]
            current_confidence = confidence[skill_id]
            current_retention = _retention(
                current_mastery, current_confidence, evidence_count[skill_id], days_since[skill_id]
            )
            difficulty_normalized = (float(skill["difficulty"]) - 1.0) / 4.0
            mismatch = difficulty_normalized - float(profile["ability"])
            mismatch_abs = abs(mismatch)
            behavior_noise = 0.05 if profile["consistency"] == "CONSISTENT" else 0.15
            engagement = _clip(
                float(profile["engagement_propensity"])
                - 0.24 * mismatch_abs
                + float(rng.normal(0, behavior_noise))
            )
            disengaged = bool(rng.random() < 0.05 + 0.38 * (1.0 - engagement))
            skipped_content = bool(
                rng.random() < 0.03 + 0.30 * (1.0 - engagement) + 0.12 * float(disengaged)
            )
            practice_attempts = int(
                rng.poisson(0.35 + 3.2 * float(profile["practice_propensity"]) * engagement)
            )
            if skipped_content:
                practice_attempts = min(practice_attempts, 1)
            expected_time = float(skill["estimatedMinutes"])
            time_multiplier = 0.72 if profile["pace"] == "FAST" else 1.18
            time_ratio = _clip(
                time_multiplier * (0.55 + 0.72 * engagement) + float(rng.normal(0, 0.16)),
                0.08,
                2.2,
            )
            if skipped_content:
                time_ratio *= 0.22
            time_spent = max(1.0, expected_time * time_ratio)
            completion_rate = _clip(
                0.12
                + 0.72 * engagement
                + 0.045 * min(practice_attempts, 5)
                - 0.24 * float(disengaged)
                - 0.42 * float(skipped_content)
                - 0.14 * mismatch_abs
                + float(rng.normal(0, behavior_noise))
            )
            completed = completion_rate >= 0.70
            guessing = bool(rng.random() < 0.06 + 0.26 * (1.0 - current_mastery))
            assessment_noise = 0.045 if profile["consistency"] == "CONSISTENT" else 0.13
            pre_assessment = _clip(
                current_mastery + 0.11 * float(guessing) + float(rng.normal(0, assessment_noise))
            )
            inconsistent_performance = bool(
                profile["consistency"] == "INCONSISTENT" and abs(pre_assessment - current_mastery) > 0.08
            )
            learning_strength = _sigmoid(
                -0.45
                + 1.32 * engagement
                + 0.17 * min(practice_attempts, 5)
                + 0.56 * min(prerequisite_readiness, 1.25)
                + 0.45 * completion_rate
                + 0.34 * float(profile["pace_factor"])
                - 1.30 * mismatch_abs
                - 0.72 * float(disengaged)
                - 0.88 * float(skipped_content)
            )
            expected_gain = (1.0 - current_mastery) * 0.34 * learning_strength
            gain_noise = float(rng.normal(0, 0.022 if profile["consistency"] == "CONSISTENT" else 0.07))
            mastery_gain = float(np.clip(expected_gain + gain_noise, -0.12, 1.0 - current_mastery))
            post_mastery = _clip(current_mastery + mastery_gain)
            post_assessment = _clip(
                post_mastery
                + 0.018 * min(practice_attempts, 5)
                - 0.07 * float(disengaged)
                + float(rng.normal(0, assessment_noise))
            )
            assessment_improvement = post_assessment - pre_assessment
            learner_feedback = _clip(
                0.20
                + 0.28 * engagement
                + 0.22 * completion_rate
                + 0.20 * _clip(assessment_improvement + 0.25)
                + 0.10 * (1.0 - min(mismatch_abs, 1.0))
                + float(rng.normal(0, 0.04 if profile["consistency"] == "CONSISTENT" else 0.10))
            )
            interaction_number += 1
            record: dict[str, Any] = {
                "synthetic_classification": SYNTHETIC_CLASSIFICATION,
                "dataset_version": config.dataset_version,
                "generator_version": config.generator_version,
                "random_seed": config.random_seed,
                "interaction_id": f"sim-interaction-{interaction_number:08d}",
                "learner_id": learner_id,
                "learner_archetype": profile["archetype"],
                "learner_level": profile["level"],
                "learning_pace": profile["pace"],
                "performance_consistency": profile["consistency"],
                "learner_ability": round(float(profile["ability"]), 6),
                "learner_interaction_index": learner_interaction_index,
                "simulation_day": simulation_day,
                "elapsed_days": elapsed_days,
                "course_id": course_id,
                "course_slug": courses[course_id]["slug"],
                "skill_id": skill_id,
                "skill_slug": skill["slug"],
                "skill_category": skill["category"],
                "skill_difficulty": int(skill["difficulty"]),
                "candidate_kind": candidate_kind,
                "current_mastery": round(current_mastery, 6),
                "current_confidence": round(current_confidence, 6),
                "retention": round(current_retention, 6),
                "days_since_evidence": days_since[skill_id],
                "evidence_count": evidence_count[skill_id],
                "required_prerequisite_count": len(required),
                "satisfied_prerequisite_ratio": round(satisfied_prerequisite_ratio, 6),
                "minimum_prerequisite_mastery": round(minimum_prerequisite_mastery, 6),
                "prerequisite_mastery": round(prerequisite_mastery, 6),
                "prerequisite_readiness": round(prerequisite_readiness, 6),
                "engagement": round(engagement, 6),
                "practice_attempts": practice_attempts,
                "time_spent_minutes": round(time_spent, 6),
                "expected_time_minutes": int(skill["estimatedMinutes"]),
                "completion_rate": round(completion_rate, 6),
                "completed": completed,
                "guessing": guessing,
                "disengaged": disengaged,
                "skipped_content": skipped_content,
                "inconsistent_performance": inconsistent_performance,
                "difficulty_mismatch": round(mismatch, 6),
                "pre_assessment": round(pre_assessment, 6),
                "post_assessment": round(post_assessment, 6),
                "assessment_improvement": round(assessment_improvement, 6),
                "post_mastery": round(post_mastery, 6),
                "mastery_gain": round(mastery_gain, 6),
                "feedback_rating": round(1.0 + 4.0 * learner_feedback, 6),
                "learner_feedback": round(learner_feedback, 6),
            }
            record["benefit_score"] = _benefit_score(record, config)
            record["beneficial"] = bool(record["benefit_score"] >= config.benefit.threshold)
            records.append(record)
            mastery[skill_id] = post_mastery
            confidence[skill_id] = _clip(current_confidence + 0.018 + 0.025 * completion_rate)
            evidence_count[skill_id] += 1
            days_since[skill_id] = 0

    frame = pd.DataFrame.from_records(records, columns=[item["name"] for item in _schema()])
    expected_scores = frame.apply(
        lambda row: _benefit_score(row.to_dict(), config), axis=1
    )
    validation = {
        "acyclicCurriculum": len(ordered_skills) == len(skill_ids),
        "benefitFormulaVerified": bool(np.allclose(expected_scores, frame["benefit_score"], atol=1e-6)),
        "curriculumReferencesValid": bool(
            frame["skill_id"].isin(skills).all() and frame["course_id"].isin(courses).all()
        ),
        "finiteNumericValues": bool(
            np.isfinite(frame.select_dtypes(include=[np.number]).to_numpy()).all()
        ),
        "interactionCountRequirement": len(frame) >= 10_000 if enforce_phase_requirements else True,
        "learnerCountRequirement": (
            frame["learner_id"].nunique() >= 1_000 if enforce_phase_requirements else True
        ),
        "noDuplicateInteractionIds": not frame["interaction_id"].duplicated().any(),
        "syntheticLabelConsistent": bool(
            (frame["synthetic_classification"] == SYNTHETIC_CLASSIFICATION).all()
        ),
    }
    if not all(validation.values()):
        failed = [name for name, passed in validation.items() if not passed]
        raise ValueError(f"Synthetic dataset validation failed: {', '.join(failed)}")

    manifest = {
        "classification": SYNTHETIC_CLASSIFICATION,
        "dataset": {
            "datasetVersion": config.dataset_version,
            "generatorVersion": config.generator_version,
            "interactionCount": len(frame),
            "learnerCount": int(frame["learner_id"].nunique()),
            "randomSeed": config.random_seed,
        },
        "curriculum": {
            "checksumSha256": curriculum_checksum,
            "courseCount": len(courses),
            "prerequisiteEdgeCount": len(curriculum["prerequisites"]),
            "schemaVersion": curriculum["schemaVersion"],
            "skillCount": len(skills),
            "source": curriculum["source"],
        },
        "benefitDefinition": {
            **asdict(config.benefit),
            "formula": (
                "mastery_gain_weight × mastery_gain + completion_weight × completion_rate + "
                "assessment_improvement_weight × assessment_improvement + "
                "learner_feedback_weight × learner_feedback"
            ),
            "labelRule": "beneficial = benefit_score >= threshold",
            "randomLabels": False,
        },
        "distributions": {
            "beneficial": _distribution(frame, "beneficial"),
            "candidateKind": _distribution(frame, "candidate_kind"),
            "learnerLevel": _distribution(frame.drop_duplicates("learner_id"), "learner_level"),
            "learningPace": _distribution(frame.drop_duplicates("learner_id"), "learning_pace"),
            "performanceConsistency": _distribution(
                frame.drop_duplicates("learner_id"), "performance_consistency"
            ),
        },
        "noise": {
            "difficultyMismatch": int((frame["difficulty_mismatch"].abs() >= 0.32).sum()),
            "disengaged": int(frame["disengaged"].sum()),
            "guessing": int(frame["guessing"].sum()),
            "inconsistentPerformance": int(frame["inconsistent_performance"].sum()),
            "skippedContent": int(frame["skipped_content"].sum()),
        },
        "outcomes": {
            "beneficialRate": round(float(frame["beneficial"].mean()), 6),
            "meanAssessmentImprovement": round(float(frame["assessment_improvement"].mean()), 6),
            "meanBenefitScore": round(float(frame["benefit_score"].mean()), 6),
            "meanCompletionRate": round(float(frame["completion_rate"].mean()), 6),
            "meanMasteryGain": round(float(frame["mastery_gain"].mean()), 6),
        },
        "modeledRelationships": {
            "difficultyMismatchToMasteryGain": _correlation(
                frame.assign(abs_mismatch=frame["difficulty_mismatch"].abs()),
                "abs_mismatch",
                "mastery_gain",
            ),
            "engagementToCompletion": _correlation(frame, "engagement", "completion_rate"),
            "engagementToMasteryGain": _correlation(frame, "engagement", "mastery_gain"),
            "practiceToAssessmentImprovement": _correlation(
                frame, "practice_attempts", "assessment_improvement"
            ),
            "prerequisiteMasteryToPostAssessment": _correlation(
                frame, "prerequisite_mastery", "post_assessment"
            ),
        },
        "schema": _schema(),
        "sampleRows": _native(frame.head(6).to_dict(orient="records")),
        "validation": validation,
        "phaseBoundary": {
            "containsRealLearnerData": False,
            "featureEngineeringImplemented": False,
            "modelTrained": False,
            "predictionAvailable": False,
        },
    }
    return frame, _native(manifest)


def write_dataset(
    curriculum_path: Path,
    output_directory: Path,
    config: SimulationConfig = SimulationConfig(),
    *,
    enforce_phase_requirements: bool = True,
) -> dict[str, Any]:
    curriculum, curriculum_checksum = load_curriculum(curriculum_path)
    frame, manifest = generate_dataset(
        curriculum,
        curriculum_checksum,
        config,
        enforce_phase_requirements=enforce_phase_requirements,
    )
    output_directory.mkdir(parents=True, exist_ok=True)
    dataset_path = output_directory / f"{config.dataset_version}.csv"
    manifest_path = output_directory / "manifest.json"
    frame.to_csv(dataset_path, index=False, float_format="%.6f", lineterminator="\n")
    manifest["dataset"]["fileName"] = dataset_path.name
    manifest["dataset"]["sha256"] = _sha256(dataset_path)
    manifest_path.write_text(
        f"{json.dumps(_native(manifest), indent=2, sort_keys=True)}\n",
        encoding="utf-8",
        newline="\n",
    )
    return manifest
