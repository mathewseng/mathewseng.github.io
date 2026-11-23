#!/usr/bin/env python3
"""Contact sheet of crops for reviewing detector labels.

usage: objects_grid.py items.json out.jpg [crop] [cols]
items.json: [[key, x, y, caption], ...] with key "session:frame".
Each crop is centred on (x, y), drawn at 2x with its list index.
"""
import json, sys
import cv2, numpy as np
import objects as ob


def main():
    items = json.loads(open(sys.argv[1]).read()); out = sys.argv[2]
    crop = int(sys.argv[3]) if len(sys.argv) > 3 else 48
    cols = int(sys.argv[4]) if len(sys.argv) > 4 else 12
    keys, jp = ob.load_frames(); index = {k: i for i, k in enumerate(keys)}
    cache, tiles = {}, []
    for n, (key, x, y, cap) in enumerate(items):
        if key not in cache: cache = {key: ob.decode(jp[index[key]])}
        img = cv2.copyMakeBorder(cache[key], crop, crop, crop, crop, cv2.BORDER_CONSTANT)
        xi, yi = int(round(x)) + crop - crop // 2, int(round(y)) + crop - crop // 2
        t = cv2.resize(img[yi:yi + crop, xi:xi + crop], (crop * 2, crop * 2), interpolation=cv2.INTER_CUBIC)
        t = cv2.copyMakeBorder(t, 16, 0, 0, 0, cv2.BORDER_CONSTANT, value=(30, 30, 30))
        cv2.putText(t, f'{n} {cap}', (2, 12), 0, .4, (255, 255, 255), 1)
        tiles.append(t)
    while len(tiles) % cols: tiles.append(np.zeros_like(tiles[0]))
    rows = [np.hstack(tiles[i:i + cols]) for i in range(0, len(tiles), cols)]
    cv2.imwrite(out, np.vstack(rows), [cv2.IMWRITE_JPEG_QUALITY, 90])


if __name__ == '__main__':
    main()
