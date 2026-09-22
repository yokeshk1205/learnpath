import argparse
import json
from pathlib import Path

from app.synthetic.config import SimulationConfig
from app.synthetic.simulator import write_dataset


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate the reproducible LearnPath Phase 12 synthetic interaction dataset."
    )
    parser.add_argument(
        "--curriculum",
        type=Path,
        default=Path("data/input/curriculum_v1.json"),
        help="Stable curriculum snapshot exported from PostgreSQL.",
    )
    parser.add_argument(
        "--output-directory",
        type=Path,
        default=Path("data/synthetic"),
        help="Directory for the CSV dataset and manifest.",
    )
    args = parser.parse_args()
    manifest = write_dataset(args.curriculum, args.output_directory, SimulationConfig())
    print(
        json.dumps(
            {
                "classification": manifest["classification"],
                "dataset": manifest["dataset"],
                "validation": manifest["validation"],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
