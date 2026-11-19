"""Recover dice missed by the locator from repeated changes on the same felt."""
import argparse
from itertools import combinations
import json
from math import dist
from pathlib import Path

import cv2
import numpy as np

from dice_footprints import ARTIFACT_DIR, difference, images
from game_state import center_crop, evaluate_patches, hand_regions, within_hand


STRIDE = 4
KERNEL = np.ones((21, 21), np.uint8)


def gray(pixels):
    return cv2.cvtColor(pixels, cv2.COLOR_BGR2GRAY)


def median(pictures):
    return np.median(pictures, axis=0).astype(np.uint8)


def patch(image, center):
    x, y = center
    return image[y-11:y+12, x-11:x+12]


def seed_centers(background, foreground, side):
    changed = cv2.absdiff(foreground, background) > 21
    if side == "white":
        changed[:, 268:] = False
        changed[:, :58] = False
    else:
        changed[:, :294] = False
        changed[:, 507:] = False
    changed[:25] = changed[395:] = False
    core = cv2.boxFilter(changed.astype(np.uint8), cv2.CV_32F, (15, 15), normalize=False)
    surround = cv2.boxFilter(changed.astype(np.uint8), cv2.CV_32F, (27, 27), normalize=False) - core
    score = np.where((core >= 43) & (surround < 1.4 * core + 12), core - .37 * surround, 0).astype(np.float32)
    peak = cv2.dilate(score, KERNEL)
    y, x = np.where((score == peak) & (score >= 27))
    points = sorted(zip(x.tolist(), y.tolist(), score[y, x]), key=lambda item: item[2], reverse=True)
    centers = []
    for x, y, _ in points:
        center = (x, y)
        if all(dist(center, other) >= 18 for other in centers):
            centers.append(center)
    return centers[:8]


def appearance(background, foreground, center, side):
    felt, die = patch(background, center), patch(foreground, center)
    contrast = difference(die, felt)
    if contrast < 13:
        return None
    signal = cv2.absdiff(die, felt)[4:19, 4:19] > 21
    values = die[4:19, 4:19][signal]
    if len(values) < 22 or (side == "white" and np.mean(values >= 184) < .45 or
                            side == "dark" and np.mean(values <= 130) < .45):
        return None
    return felt, die, contrast


def visible(pixels, center, model):
    sample = patch(pixels, center)
    felt, die, contrast = model
    like_die = difference(sample, die)
    like_felt = difference(sample, felt)
    if like_die < min(13, .56 * contrast) and like_felt - like_die > .24 * contrast:
        return 1
    if like_felt < min(13, .54 * contrast) and like_die - like_felt > .24 * contrast:
        return -1
    return 0


def trace(snapshots, frames, offset, centers, models, masks):
    together = []
    clear = []
    for frame in frames[offset:]:
        if together and frame - together[-1] > 100:
            break
        state = [visible(snapshots[frame], center, model) for center, model in zip(centers, models)]
        uncovered = all(not within_hand(*center, masks[frame], 8) for center in centers)
        if state == [1, 1] and uncovered:
            together.append(frame)
            clear.clear()
        elif state == [-1, -1] and together and uncovered:
            clear.append(frame)
            if len(clear) == 4:
                break
        else:
            clear.clear()
    if (len(together) < 10 or len(clear) < 4 or clear[0] - together[-1] > 85 or
            together[-1] - together[0] < 45 or 4 * len(together) / (together[-1] - together[0] + 4) < .56):
        return None
    return together, clear


def accurate_edge(game, first, last, centers, models, sign):
    run = []
    for frame, pixels in images(game, range(first, last + 1)):
        luminance = gray(pixels)
        hands = hand_regions(pixels)
        if all(not within_hand(*center, hands, 8) and visible(luminance, center, model) == sign
               for center, model in zip(centers, models)):
            run.append(frame)
            if len(run) == 5:
                return run[0]
        else:
            run.clear()
    return None


def retained_faces(reader, photos, centers, together):
    selected = [frame for frame in together if frame in photos and not any(
        within_hand(*center, hand_regions(photos[frame]), 3) for center in centers)][:16]
    if len(selected) < 10:
        return []
    result = []
    for center in centers:
        crops = [center_crop(photos[frame], *center) for frame in selected]
        scores = evaluate_patches(reader, crops)
        mean = scores.mean(axis=0)
        face, second = np.argsort(mean)[-2:][::-1]
        agreeing = (scores.argmax(axis=1) == face).sum()
        if face and mean[face] >= .84 and mean[face] - mean[second] >= .45 and agreeing >= .85 * len(selected):
            result.append(dict(face=int(face), center=center, views=len(selected), agree=int(agreeing),
                               probability=round(float(mean[face]), 3), frames=selected))
    return result


def search(game, anchor, limit, reader):
    after_visible = anchor["poseLastSeen"]
    side = "dark" if anchor["player"] == "white" else "white"
    before = range(after_visible + 7, after_visible + 20, 2)
    frames = list(range(before.stop, limit, STRIDE))
    photos = dict(images(game, [*before, *frames]))
    background = median([gray(photos.pop(frame)) for frame in before])
    snapshots = {frame: gray(photos[frame]) for frame in frames}
    masks = {frame: hand_regions(photos[frame]) for frame in frames}
    qualified = []
    for offset in range(0, min(len(frames) - 2, (anchor["resultFrame"] - frames[0] + 55) // STRIDE), 2):
        foreground = median([snapshots[frame] for frame in frames[offset:offset+3]])
        models = {center: source for center in seed_centers(background, foreground, side)
                  if (source := appearance(background, foreground, center, side))}
        for centers in combinations(models, 2):
            if dist(*centers) < 20:
                continue
            active = [models[center] for center in centers]
            proof = trace(snapshots, frames, offset, centers, active, masks)
            if not proof:
                continue
            together, clear = proof
            if any(together[0] <= item["lastTogether"] and together[-1] >= item["start"] and all(
                    any(dist(center, old) < 12 for old in item["centers"]) for center in centers)
                   for item in qualified):
                continue
            faces = retained_faces(reader, photos, centers, together)
            if not faces:
                continue
            onset = accurate_edge(game, max(before.stop, together[0] - 18), together[0] + 12, centers, active, 1)
            pickup = accurate_edge(game, max(together[-1] + 1, clear[0] - 10), clear[0] + 10, centers, active, -1)
            if onset is None or pickup is None:
                continue
            qualified.append(dict(game=game, previous=anchor["start"], start=onset, lastTogether=together[-1],
                                  pickup=pickup, centers=centers, player=side, samples=len(together), faces=faces))
    return qualified


def scan(plans, observations, reader, games):
    results = []
    for game in games:
        prefix = f"game-{game:02}"
        turns = json.loads((plans / (prefix + "-plan.json")).read_text())
        cuts = json.loads((observations / (prefix + "-observations.json")).read_text())["breaks"]
        for turn, next_turn in zip(turns, turns[1:]):
            last_seen = turn.get("poseLastSeen")
            result = turn.get("resultFrame")
            if (last_seen is None or result is None or len(turn.get("centers", [])) != 2 or
                    not turn.get("steps") or result - last_seen > 52 or result < turn["start"] or
                    next_turn["start"] - max(last_seen, result) < 115 or turn["player"] != next_turn["player"]):
                continue
            limit = min(next_turn["start"] - 10, last_seen + 515, min((cut for cut in cuts if cut > last_seen), default=next_turn["start"]))
            if not last_seen + 115 < limit:
                continue
            found = search(game, turn, limit, reader)
            results.extend(found)
            for witness in found:
                print(json.dumps(witness), flush=True)
    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("plans", type=Path)
    parser.add_argument("observations", type=Path)
    parser.add_argument("model", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("games", nargs="*", type=int)
    args = parser.parse_args()
    cv2.setNumThreads(1)
    reader = cv2.dnn.readNetFromONNX(str(args.model))
    found = scan(args.plans, args.observations, reader, args.games or range(1, 6))
    args.output.write_text(json.dumps(found, indent=2) + "\n")
