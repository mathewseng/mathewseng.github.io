"""Find on-felt cube witnesses before a sustained increase of an owned cube."""
import argparse
import json
from math import dist
from pathlib import Path

import cv2
import numpy as np

from dice_footprints import ARTIFACT_DIR, images
from game_state import FACES, center_crop, evaluate_patches, hand_regions, within_hand


def settled_tray_reads(observations):
    return [item for item in observations["cube"] if item["side"] != "playing-surface" and
            item["stake"] in FACES[1:] + (1,) and item["visibleSamples"] >= 12 and
            item["end"] - item["start"] >= 24]


def cube_centers(pixels):
    gray = cv2.cvtColor(pixels, cv2.COLOR_BGR2GRAY)
    centers = []
    for cut in (220, 211, 202, 193, 182):
        _, _, boxes, _ = cv2.connectedComponentsWithStats((gray > cut).astype(np.uint8), 8)
        for x, y, width, height, area in boxes[1:]:
            if not (60 <= x and x + width <= 506 and 50 <= y and y + height <= 380 and
                    18 <= width <= 33 and 17 <= height <= 32 and 175 <= area <= 790):
                continue
            center = (round(float(x + width / 2)), round(float(y + height / 2)))
            if 263 < center[0] < 294 or any(dist(center, other) <= 5 for other in centers):
                continue
            centers.append(center)
    hands = hand_regions(pixels)
    return [center for center in centers if not within_hand(*center, hands, 2)]


def surface_reads(game, frames, model, stake):
    index = FACES.index(stake)
    clusters = []
    for frame, pixels in images(game, frames):
        centers = cube_centers(pixels)
        patches = [center_crop(pixels, *center) for center in centers]
        for center, odds in zip(centers, evaluate_patches(model, patches)):
            if odds[index] < .90:
                continue
            nearby = next((item for item in clusters if dist(center, item["center"]) <= 6), None)
            if nearby is None:
                nearby = {"center": center, "frames": [], "scores": []}
                clusters.append(nearby)
            if not nearby["frames"] or nearby["frames"][-1] != frame:
                nearby["frames"].append(frame)
                nearby["scores"].append(float(odds[index]))
    return clusters


def inspect(game, before, after, breaks, model):
    if any(before["end"] < cut <= after["start"] for cut in breaks):
        return None
    start = max(0, before["end"] - 8)
    end = after["start"]
    candidates = surface_reads(game, range(start, end, 5), model, after["stake"])
    stable = []
    for track in candidates:
        frames = track["frames"]
        first, last = frames[0], frames[-1]
        if (len(frames) < 4 or last - first < 15 or first <= before["end"] or end - last > 125 or
                5 * len(frames) / (last - first + 5) < .28):
            continue
        stable.append(track)
    if len(stable) != 1:
        return None
    pose = stable[0]
    first = pose["frames"][0]
    earlier = surface_reads(game, range(max(start, first - 5), first + 6), model, after["stake"])
    # Backfill only the same stationary position seen in the later frames.
    refined = next((item for item in earlier if dist(item["center"], pose["center"]) <= 6 and
                    len(item["frames"]) >= 3), None)
    return dict(game=game, previous=before["start"], previousSeen=before["end"],
                start=refined["frames"][0] if refined else first, lastSeen=pose["frames"][-1],
                take=end, side=after["side"], offered=after["stake"], center=pose["center"],
                views=len(pose["frames"]), confidence=round(float(np.median(pose["scores"])), 3))


def scan(observations, model, games):
    result = []
    for game in games:
        data = json.loads((observations / f"game-{game:02}-observations.json").read_text())
        reads = settled_tray_reads(data)
        for index, after in enumerate(reads[1:], 1):
            before = reads[index - 1]
            if (after["stake"] != 2 * before["stake"] or after["side"] == "centered" or
                    after["side"] == before["side"] or not 15 <= after["start"] - before["end"] <= 25 * 210):
                continue
            witness = inspect(game, before, after, data["breaks"], model)
            if witness:
                result.append(witness)
                print(json.dumps(witness), flush=True)
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("observations", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("games", nargs="*", type=int)
    args = parser.parse_args()
    cv2.setNumThreads(1)
    model = cv2.dnn.readNetFromONNX(str(ARTIFACT_DIR / "models/cube_real.onnx"))
    result = scan(args.observations, model, args.games or range(1, 6))
    args.output.write_text(json.dumps(result, indent=2) + "\n")
