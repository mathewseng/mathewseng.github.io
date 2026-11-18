"""Read stable game state at one camera frame."""
import argparse
import gzip
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from project_paths import ARTIFACT_DIR

OUT = ARTIFACT_DIR / "v4"


def query(game, frame):
    prefix = f"game-{game:02}"
    index = json.loads((OUT / f"{prefix}-game.json").read_text())
    if not 0 <= frame < index["frames"]:
        raise ValueError(f"Frame must be between 0 and {index['frames'] - 1}")
    with gzip.open(OUT / f"{prefix}-state.jsonl.gz", "rt") as stream:
        row = next(json.loads(line) for i, line in enumerate(stream) if i == frame)
    if row["frame"] != frame:
        raise ValueError("State file has an invalid frame index")
    return {
        "game": game, "seconds": frame / 25, **row,
        "position": index["positions"].get(str(row["position"])),
        "decision": index["decisions"].get(str(row["decision"])),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("game", type=int, choices=range(1, 6))
    where = parser.add_mutually_exclusive_group(required=True)
    where.add_argument("--frame", type=int)
    where.add_argument("--seconds", type=float)
    args = parser.parse_args()
    try:
        frame = args.frame if args.frame is not None else round(args.seconds * 25)
        result = query(args.game, frame)
    except ValueError as error:
        parser.error(str(error))
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
