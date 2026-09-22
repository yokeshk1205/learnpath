from __future__ import annotations

import argparse
from pathlib import Path

from app.training import TrainingConfig, run_experiment


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Train and evaluate the LearnPath Phase 14 benefit models."
    )
    parser.add_argument("--features", type=Path, required=True)
    parser.add_argument("--feature-manifest", type=Path, required=True)
    parser.add_argument("--output-directory", type=Path, required=True)
    parser.add_argument("--split-directory", type=Path, required=True)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    manifest = run_experiment(
        args.features,
        args.feature_manifest,
        args.output_directory,
        args.split_directory,
        TrainingConfig(),
    )
    model = manifest["model"]
    metrics = manifest["metrics"]["test"][model["selectedModel"]]
    print(
        f"Selected {model['selectedModelDisplayName']} ({model['modelVersion']}) with held-out "
        f"ROC-AUC {metrics['rocAuc']:.3f} and NDCG@5 {metrics['ndcgAt5']:.3f}; "
        f"deployment remains {model['deploymentStatus']}."
    )


if __name__ == "__main__":
    main()
