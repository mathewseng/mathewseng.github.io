"""Pool the camera face reader's probabilities over verified stationary dice windows."""
import argparse
from collections import defaultdict
import gzip
import json
from math import dist
from pathlib import Path
import sys

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from game_state import center_crop
from project_paths import ARTIFACT_DIR
from v2.vision import face_probabilities


def sample(windows):
    frames = defaultdict(list)
    observations = defaultdict(list)
    for game, requests in windows.items():
        manifest = ARTIFACT_DIR / "v2" / f"game-{game}-analysis.json"
        segments = json.loads(manifest.read_text())["segments"]
        for roll_start, window in requests:
            start, stop = window["frames"]
            centers = window["centers"]
            if start < roll_start or stop <= start or len(centers) != 2 or dist(*centers) < 16:
                raise ValueError(f"Invalid settled dice window for {game} at frame {roll_start}")
            # Widely spaced frames limit the influence of a single glare or occlusion.
            for frame in range(start, stop, 6):
                part = next(part for part in reversed(segments) if part["firstGameFrame"] <= frame)
                source_frame = part["firstFrame"] + frame - part["firstGameFrame"]
                if source_frame >= part["lastExclusive"] or part["discontinuity"] and start < part["firstGameFrame"]:
                    raise ValueError(f"Dice window crosses a source gap in game {game}")
                frames[part["source"]].append(((game, roll_start), frame, source_frame, centers))

    net = cv2.dnn.readNetFromONNX(str(ARTIFACT_DIR / "models" / "dice_real.onnx"))
    for source, requests in frames.items():
        archive = ARTIFACT_DIR / "v2" / "state" / Path(source).with_suffix(".jsonl.gz").name
        with gzip.open(archive, "rt") as stream:
            raw = [json.loads(line)["state"] for line in stream]
        camera = cv2.VideoCapture(str(ARTIFACT_DIR / "board" / source))
        for key, frame, local, centers in requests:
            state = raw[local]
            if state is None or any(
                left - 12 <= x <= right + 12 and top - 12 <= y <= bottom + 12
                for left, top, right, bottom in state["handRegions"] for x, y in centers
            ):
                continue
            camera.set(cv2.CAP_PROP_POS_FRAMES, local)
            ok, board = camera.read()
            if not ok:
                raise ValueError(f"Cannot read {source} frame {local}")
            if any(not 0 <= x < board.shape[1] or not 0 <= y < board.shape[0] for x, y in centers):
                raise ValueError(f"Die center outside rectified board in {source}")
            odds = face_probabilities(net, [center_crop(board, x, y) for x, y in centers])
            # Class zero is background. Keep its probability in the pooled vector.
            if all(row[0] < .50 for row in odds):
                observations[key].append((frame, odds))
        camera.release()

    result = {}
    for (game, roll_start), rows in observations.items():
        rows.sort(key=lambda row: row[0])
        result.setdefault(game, {})[roll_start] = {
            "frames": [frame for frame, _ in rows],
            "odds": np.round(np.mean([odds for _, odds in rows], axis=0), 6).tolist(),
        }
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("notes", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    cv2.setNumThreads(1)
    notes = json.loads(args.notes.read_text())
    windows = {
        game: [(round(note["starts"][0] * 25), note["settledFaces"]) for note in cases if "settledFaces" in note]
        for game, cases in notes.items()
    }
    data = sample(windows)
    args.output.write_text(json.dumps(data, indent=2) + "\n")
    for game, rolls in data.items():
        for start, evidence in rolls.items():
            print(game, start, len(evidence["frames"]), np.round(evidence["odds"], 3).tolist())
