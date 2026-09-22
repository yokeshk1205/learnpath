from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Mapping

import numpy as np
import pandas as pd


FEATURE_CONTRACT_VERSION = "learner-candidate-features-v2"
FEATURE_DATASET_VERSION = "engineered-features-v2"
FEATURE_CLASSIFICATION = "SYNTHETIC / SIMULATED DATA — ENGINEERED FEATURES"
LABEL_NAME = "beneficial"
METADATA_COLUMNS = [
    "synthetic_classification",
    "feature_version",
    "interaction_id",
    "learner_id",
    "course_id",
    "skill_id",
]

CURRENT_OUTCOME_COLUMNS = {
    "assessment_improvement",
    "beneficial",
    "benefit_score",
    "completed",
    "completion_rate",
    "disengaged",
    "engagement",
    "feedback_rating",
    "guessing",
    "inconsistent_performance",
    "learner_feedback",
    "mastery_gain",
    "post_assessment",
    "post_mastery",
    "practice_attempts",
    "skipped_content",
    "time_spent_minutes",
}


@dataclass(frozen=True)
class FeatureSpec:
    name: str
    category: str
    description: str
    source: str
    availability: str
    minimum: float
    maximum: float


def _feature(
    name: str,
    category: str,
    description: str,
    source: str,
    availability: str = "CURRENT_STATE",
    minimum: float = 0.0,
    maximum: float = 1.0,
) -> FeatureSpec:
    return FeatureSpec(name, category, description, source, availability, minimum, maximum)


FEATURE_SPECS = [
    _feature("learner_experience", "LEARNER", "Evidence-based experience tier available before recommendation.", "prior(interaction count)"),
    _feature("overall_mastery", "LEARNER", "Decision-time expanding mean mastery.", "current_mastery"),
    _feature("learning_pace", "LEARNER", "Observed pace from prior actual time relative to expected time; neutral at cold start.", "prior(time_spent_minutes, expected_time_minutes)", "PRIOR_HISTORY"),
    _feature("activity_frequency", "LEARNER", "Prior interactions per simulated active day.", "learner_interaction_index, simulation_day"),
    _feature("consistency", "LEARNER", "Inverse historical assessment-score volatility; neutral at cold start.", "prior(post_assessment)", "PRIOR_HISTORY"),
    _feature(
        "learner_performance_proxy",
        "LEARNER",
        "Observable decision-time performance proxy from mastery, confidence, and recent assessment evidence.",
        "overall_mastery, current_confidence, pre_assessment",
    ),
    _feature("prior_interaction_count", "LEARNER", "Normalized count of prior learner interactions.", "learner_interaction_index"),
    _feature("historical_completion_rate", "LEARNER", "Mean completion from prior interactions only.", "prior(completion_rate)", "PRIOR_HISTORY"),
    _feature("historical_assessment_improvement", "LEARNER", "Mean assessment change from prior interactions only.", "prior(assessment_improvement)", "PRIOR_HISTORY", -1.0, 1.0),
    _feature("historical_feedback", "LEARNER", "Mean learner feedback from prior interactions only.", "prior(learner_feedback)", "PRIOR_HISTORY"),
    _feature("learner_cold_start", "LEARNER", "No earlier interaction is available.", "learner_interaction_index"),

    _feature("difficulty", "SKILL", "Skill difficulty normalized from the curriculum scale.", "skill_difficulty"),
    _feature("goal_relevance", "SKILL", "Course-context relevance proxy; not an asserted learner goal.", "candidate_kind"),
    _feature("popularity", "SKILL", "Curriculum coverage and dependency-centrality proxy.", "curriculum.courseSkillCoverage, curriculum.dependentCount"),
    _feature("expected_time", "SKILL", "Expected learning time normalized within the curriculum.", "expected_time_minutes"),
    _feature("prerequisite_depth", "SKILL", "Skill depth in the prerequisite DAG.", "curriculum.prerequisiteDepth"),
    _feature("dependent_count", "SKILL", "Normalized count of downstream skills.", "curriculum.dependentCount"),
    _feature("candidate_is_course_skill", "SKILL", "Candidate belongs directly to the course rather than supporting it.", "candidate_kind"),

    _feature("current_mastery", "MASTERY", "Global current mastery before the interaction.", "current_mastery"),
    _feature("confidence", "MASTERY", "Confidence in the current mastery estimate.", "current_confidence"),
    _feature("mastery_gap", "MASTERY", "Distance from full mastery.", "current_mastery"),
    _feature("evidence_strength", "MASTERY", "Log-scaled count of evidence available before interaction.", "evidence_count"),
    _feature("mastery_confidence_alignment", "MASTERY", "Agreement between mastery and confidence.", "current_mastery, current_confidence"),

    _feature("recent_score", "PERFORMANCE", "Most recent decision-time pre-assessment score.", "pre_assessment"),
    _feature("average_score", "PERFORMANCE", "Mean post-assessment score from prior interactions.", "prior(post_assessment)", "PRIOR_HISTORY"),
    _feature("score_trend", "PERFORMANCE", "Recent score minus historical mean.", "pre_assessment, prior(post_assessment)", "PRIOR_HISTORY", -1.0, 1.0),
    _feature("attempt_count", "PERFORMANCE", "Normalized prior attempts on this learner-skill pair.", "prior(learner_id, skill_id)", "PRIOR_HISTORY"),
    _feature("correct_rate", "PERFORMANCE", "Historical assessment success rate.", "prior(post_assessment)", "PRIOR_HISTORY"),
    _feature("score_volatility", "PERFORMANCE", "Historical assessment-score standard deviation.", "prior(post_assessment)", "PRIOR_HISTORY"),
    _feature("skill_completion_rate", "PERFORMANCE", "Prior completion rate for this learner-skill pair.", "prior(completion_rate by skill)", "PRIOR_HISTORY"),
    _feature("skill_average_score", "PERFORMANCE", "Prior mean post-assessment for this learner-skill pair.", "prior(post_assessment by skill)", "PRIOR_HISTORY"),

    _feature("days_since_practice", "RETENTION", "Days since evidence, normalized to a 60-day horizon.", "days_since_evidence"),
    _feature("retention", "RETENTION", "Decision-time retained mastery.", "retention"),
    _feature("retention_state_fresh", "RETENTION", "Retention is at least 0.75.", "retention"),
    _feature("retention_state_due", "RETENTION", "Retention is between 0.50 and 0.75.", "retention"),
    _feature("retention_state_critical", "RETENTION", "Retention is below 0.50.", "retention"),
    _feature("revision_due", "RETENTION", "Candidate was generated for revision.", "candidate_kind"),

    _feature("prerequisite_count", "PREREQUISITE", "Required prerequisite count normalized within the curriculum.", "required_prerequisite_count"),
    _feature("satisfied_ratio", "PREREQUISITE", "Share of required prerequisites satisfying their thresholds.", "satisfied_prerequisite_ratio"),
    _feature("minimum_prerequisite_mastery", "PREREQUISITE", "Weakest required prerequisite mastery.", "minimum_prerequisite_mastery"),
    _feature("average_prerequisite_mastery", "PREREQUISITE", "Mean required prerequisite mastery.", "prerequisite_mastery"),
    _feature("prerequisite_readiness", "PREREQUISITE", "Threshold-relative prerequisite readiness, clipped and normalized.", "prerequisite_readiness"),
    _feature("has_prerequisites", "PREREQUISITE", "Candidate has at least one required prerequisite.", "required_prerequisite_count"),

    _feature("previous_interaction", "INTERACTION", "A previous learner interaction exists.", "prior(interaction_id)", "PRIOR_HISTORY"),
    _feature("time_spent", "INTERACTION", "Previous time spent relative to its expected duration.", "prior(time_spent_minutes, expected_time_minutes)", "PRIOR_HISTORY"),
    _feature("previous_completion", "INTERACTION", "Previous interaction completion indicator.", "prior(completed)", "PRIOR_HISTORY"),
    _feature("recommendation_response", "INTERACTION", "Whether the prior simulated recommendation was beneficial.", "prior(beneficial)", "PRIOR_HISTORY"),
    _feature("previous_engagement", "INTERACTION", "Engagement observed in the prior interaction.", "prior(engagement)", "PRIOR_HISTORY"),
    _feature("previous_practice", "INTERACTION", "Normalized practice attempts in the prior interaction.", "prior(practice_attempts)", "PRIOR_HISTORY"),
    _feature("previous_candidate_same_skill", "INTERACTION", "Previous interaction targeted the same skill.", "prior(skill_id)", "PRIOR_HISTORY"),
    _feature("candidate_is_learn", "INTERACTION", "Learn candidate indicator.", "candidate_kind"),
    _feature("candidate_is_revision", "INTERACTION", "Revision candidate indicator.", "candidate_kind"),
    _feature("candidate_is_supporting", "INTERACTION", "Supporting-prerequisite candidate indicator.", "candidate_kind"),
    _feature("elapsed_since_previous_interaction", "INTERACTION", "Elapsed simulated days before this decision.", "elapsed_days"),
    _feature("course_context_switch", "INTERACTION", "Course context changed since the previous interaction.", "prior(course_id)", "PRIOR_HISTORY"),
]

FEATURE_NAMES = [spec.name for spec in FEATURE_SPECS]
FEATURE_COLUMNS = METADATA_COLUMNS + FEATURE_NAMES + [LABEL_NAME]


def contract_payload() -> dict[str, Any]:
    return {
        "contractVersion": FEATURE_CONTRACT_VERSION,
        "datasetVersion": FEATURE_DATASET_VERSION,
        "classification": FEATURE_CLASSIFICATION,
        "entity": "LEARNER × ELIGIBLE CANDIDATE SKILL",
        "featureCount": len(FEATURE_SPECS),
        "featureNames": FEATURE_NAMES,
        "fixedOrder": True,
        "trainingInferenceParity": True,
        "metadataColumns": METADATA_COLUMNS,
        "label": {"name": LABEL_NAME, "dtype": "int8", "includedInFeatureMatrix": False},
        "features": [
            {"order": index, "dtype": "float64", **asdict(spec)}
            for index, spec in enumerate(FEATURE_SPECS, start=1)
        ],
        "leakagePolicy": {
            "currentOutcomeColumnsExcluded": sorted(CURRENT_OUTCOME_COLUMNS),
            "historicalOutcomeRule": "Outcome-derived features must be shifted by learner before aggregation.",
            "identifiersIncludedInFeatureMatrix": False,
        },
    }


def validate_feature_frame(frame: pd.DataFrame) -> None:
    """Shared training/inference gate: accept only the frozen feature order and bounds."""
    if list(frame.columns) != FEATURE_NAMES:
        raise ValueError("Feature columns must exactly match the frozen feature contract order.")
    values = frame.to_numpy(dtype=float)
    if not np.isfinite(values).all():
        raise ValueError("Feature values must all be finite numeric values.")
    for spec in FEATURE_SPECS:
        series = frame[spec.name]
        if bool((series < spec.minimum - 1e-9).any()) or bool(
            (series > spec.maximum + 1e-9).any()
        ):
            raise ValueError(f"Feature {spec.name} violates its documented bounds.")


def validate_feature_record(values: Mapping[str, float]) -> None:
    """Validate one future inference vector against the same frozen contract."""
    frame = pd.DataFrame([[values.get(name) for name in FEATURE_NAMES]], columns=FEATURE_NAMES)
    if set(values) != set(FEATURE_NAMES):
        raise ValueError("Inference feature keys must exactly match the frozen feature contract.")
    validate_feature_frame(frame)
