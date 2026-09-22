"""Reproducible synthetic interaction data for LearnPath model research."""

from app.synthetic.config import BenefitDefinition, SimulationConfig
from app.synthetic.simulator import generate_dataset, write_dataset

__all__ = ["BenefitDefinition", "SimulationConfig", "generate_dataset", "write_dataset"]
