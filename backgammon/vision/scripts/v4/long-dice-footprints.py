"""Verify long, stationary dice tracks against the original rectified video."""

import argparse
import json
from math import dist
from pathlib import Path

import cv2
import numpy as np

from dice_footprints import ARTIFACT_DIR, difference, patches


def stable_image(images):
    # Use a recurring patch for each reference so a passing hand doesn't
    # become part of either the felt or the die template.
    distances = np.array([[difference(patch, reference) for reference in images] for patch in images])
    count = max(4, len(images) // 3)
    medoid = np.partition(distances, count - 1, axis=1)[:, count - 1].argmin()
    closest = np.argsort(distances[medoid])[:count]
    return np.median(images[closest], axis=0).astype(np.uint8)


def presence(patch, background, die, contrast):
    seen = difference(patch, die)
    clear = difference(patch, background)
    if seen <= min(18, .42 * contrast) and clear - seen > .25 * contrast:
        return 1
    if clear <= min(15, .43 * contrast) and seen - clear > .25 * contrast:
        return -1
    return 0


def track(game, seed, stop, limit):
    start, end = seed["start"], seed["end"]
    centers = [list(map(round, point)) for point in seed["centers"]]
    if any(not 11 <= x < 549 or not 11 <= y < 409 for x, y in centers):
        return None
    earlier = range(start - 40, start - 6, 3)
    settled = range(start + 6, min(start + 110, end - 1), 3)
    images = patches(game, set(earlier) | set(settled), centers, color=True)
    empty = [stable_image(np.stack([images[frame][i] for frame in earlier])) for i in range(2)]
    faces = []
    for i, background in enumerate(empty):
        alternatives = [images[frame][i] for frame in settled if difference(images[frame][i], background) >= 18]
        if len(alternatives) < 6:
            return None
        faces.append(stable_image(np.stack(alternatives)))
    contrast = [difference(die, background) for die, background in zip(faces, empty)]
    if min(contrast) < 18:
        return None

    together = []
    clear = []
    first = start
    while first < stop:
        sample = range(first, stop, 4)
        images = patches(game, sample, centers, color=True)
        for frame in sample:
            if together and frame - together[-1] > 185:
                break
            if not together and frame - start > 40:
                return None
            state = tuple(presence(*args) for args in zip(images[frame], empty, faces, contrast))
            if state == (1, 1):
                together.append(frame)
            if state == (-1, -1) and together and frame > together[0] + 30:
                # Pickup needs repeated positive views of both empty spots.
                clear.append(frame)
                if len(clear) == 4:
                    break
            else:
                clear.clear()
        else:
            if together and stop < limit and stop - together[-1] <= 180:
                # The detector dropped this stationary pair before the image did.
                first = sample[-1] + sample.step
                stop = min(limit, stop + 700)
                continue
        break
    if len(together) < 6 or together[-1] < end + 50:
        return None
    coverage = 4 * len(together) / (together[-1] - together[0] + 4)
    pickup = clear[0] if len(clear) == 4 and clear[0] - together[-1] <= 70 else None
    return {
        "sourceStart": start, "firstTogether": together[0], "lastTogether": together[-1],
        "clear": pickup, "coverage": round(coverage, 3), "together": len(together),
        "centers": centers, "player": seed["player"],
        "maxGap": max(right - left for left, right in zip(together, together[1:])),
        "contrast": [round(value, 1) for value in contrast],
    }


def shared_centers(a, b):
    return all(any(dist(point, other) <= 10 for other in b) for point in a)


def run(game, observations, frames):
    pairs = [pair for pair in observations["pairs"] if pair["actorEvidence"] == "dice-body-agreement" and
             not pair["opening"]]
    cuts = [0, *observations["breaks"], frames]
    output = []
    for i, seed in enumerate(pairs):
        if seed["end"] - seed["start"] < 75:
            continue
        start = seed["start"]
        before = max(cut for cut in cuts if cut <= start)
        after = min(cut for cut in cuts if cut > start)
        if start - before < 42:
            continue
        later = [read["end"] for read in pairs[i+1:] if read["player"] == seed["player"] and
                 read["start"] < min(after, start + 7500) and shared_centers(seed["centers"], read["centers"])]
        limit = min(after, start + 7500)
        stop = min(limit, max(seed["end"] + 375, max(later, default=0) + 125))
        found = track(game, seed, stop, limit)
        if found:
            output.append(found)
    return output


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("observations", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    cv2.setNumThreads(1)
    result = {}
    for game in range(1, 6):
        observations = json.loads((args.observations / f"game-{game:02}-observations.json").read_text())
        recording = json.loads((ARTIFACT_DIR / "v2" / f"game-{game}-analysis.json").read_text())
        result[game] = run(game, observations, recording["frames"])
        print(game, len(result[game]), "long stationary location pairs", flush=True)
    args.output.write_text(json.dumps(result, separators=(",", ":")) + "\n")
