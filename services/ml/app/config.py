from dataclasses import dataclass
from os import environ
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    experiment_directory: Path
    feature_data_directory: Path
    model_directory: Path
    synthetic_data_directory: Path
    service_name: str = "learnpath-ml"
    version: str = "0.16.0"


def load_settings() -> Settings:
    default_experiment_directory = (
        Path(__file__).resolve().parent.parent / "models" / "benefit-ranking-v2"
    )
    default_feature_data_directory = Path(__file__).resolve().parent.parent / "data" / "features"
    default_model_directory = Path(__file__).resolve().parent.parent / "models"
    default_synthetic_data_directory = Path(__file__).resolve().parent.parent / "data" / "synthetic"
    return Settings(
        experiment_directory=Path(
            environ.get("EXPERIMENT_DIRECTORY", default_experiment_directory)
        ).resolve(),
        feature_data_directory=Path(
            environ.get("FEATURE_DATA_DIRECTORY", default_feature_data_directory)
        ).resolve(),
        model_directory=Path(environ.get("MODEL_DIRECTORY", default_model_directory)).resolve(),
        synthetic_data_directory=Path(
            environ.get("SYNTHETIC_DATA_DIRECTORY", default_synthetic_data_directory)
        ).resolve(),
    )


settings = load_settings()
