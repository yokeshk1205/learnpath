from dataclasses import dataclass, field


SYNTHETIC_CLASSIFICATION = "SYNTHETIC / SIMULATED DATA"


@dataclass(frozen=True)
class BenefitDefinition:
    """Versioned, explainable label policy applied after outcome simulation."""

    assessment_improvement_weight: float = 0.25
    completion_weight: float = 0.25
    learner_feedback_weight: float = 0.10
    mastery_gain_weight: float = 0.40
    threshold: float = 0.27
    version: str = "benefit-v1"

    def validate(self) -> None:
        total = (
            self.mastery_gain_weight
            + self.completion_weight
            + self.assessment_improvement_weight
            + self.learner_feedback_weight
        )
        if abs(total - 1.0) > 1e-9:
            raise ValueError("Benefit weights must sum to 1.0.")
        if not 0.0 <= self.threshold <= 1.0:
            raise ValueError("The beneficial threshold must be between zero and one.")


@dataclass(frozen=True)
class SimulationConfig:
    """Central Phase 12 simulation policy. Changing it requires a dataset version change."""

    benefit: BenefitDefinition = field(default_factory=BenefitDefinition)
    dataset_version: str = "synthetic-interactions-v2"
    generator_version: str = "learner-skill-simulator-v2"
    interactions_per_learner: int = 20
    learner_count: int = 1_000
    random_seed: int = 42

    def validate(self, *, enforce_phase_requirements: bool = True) -> None:
        self.benefit.validate()
        if self.learner_count < 1:
            raise ValueError("At least one simulated learner is required.")
        if self.interactions_per_learner < 1:
            raise ValueError("At least one simulated interaction per learner is required.")
        if enforce_phase_requirements and self.learner_count < 1_000:
            raise ValueError("Phase 12 requires at least 1,000 simulated learners.")
        if enforce_phase_requirements and self.learner_count * self.interactions_per_learner < 10_000:
            raise ValueError("Phase 12 requires thousands of learner-skill interactions.")
