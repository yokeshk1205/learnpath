from __future__ import annotations

from dataclasses import dataclass


EXPERIMENT_CLASSIFICATION = "SYNTHETIC / SIMULATED DATA — OFFLINE MODEL EVALUATION"


@dataclass(frozen=True)
class TrainingConfig:
    """Versioned Phase 14 experiment policy."""

    deployment_status: str = "EVALUATED_NOT_DEPLOYED"
    experiment_version: str = "benefit-evaluation-v2"
    model_version: str = "benefit-ranking-v2"
    random_seed: int = 42
    selection_metric: str = "ndcgAt5"
    split_version: str = "learner-disjoint-split-v1"
    test_fraction: float = 0.15
    threshold_grid_points: int = 181
    train_fraction: float = 0.70
    validation_fraction: float = 0.15

    def validate(self) -> None:
        if abs(self.train_fraction + self.validation_fraction + self.test_fraction - 1.0) > 1e-9:
            raise ValueError("Train, validation, and test fractions must sum to 1.0.")
        if min(self.train_fraction, self.validation_fraction, self.test_fraction) <= 0:
            raise ValueError("Every learner split must be non-empty.")
        if self.threshold_grid_points < 3:
            raise ValueError("Threshold selection requires at least three grid points.")
        if self.deployment_status != "EVALUATED_NOT_DEPLOYED":
            raise ValueError("Phase 14 models must remain evaluated but not deployed.")
