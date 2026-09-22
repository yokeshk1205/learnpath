from __future__ import annotations

import argparse
from pathlib import Path

from app.features.transformer import write_feature_dataset


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate the versioned LearnPath Phase 13 feature dataset."
    )
    parser.add_argument("--input", type=Path, required=True, help="Phase 12 synthetic CSV.")
    parser.add_argument("--curriculum", type=Path, required=True, help="Curriculum snapshot JSON.")
    parser.add_argument("--output-directory", type=Path, required=True)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    manifest = write_feature_dataset(args.input, args.curriculum, args.output_directory)
    print(
        f"Generated {manifest['dataset']['rowCount']:,} feature rows with "
        f"{manifest['featureContract']['featureCount']} ordered features "
        f"({manifest['dataset']['sha256']})."
    )


if __name__ == "__main__":
    main()
