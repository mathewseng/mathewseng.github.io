"""Masked crops: grey out, in a card's 64x96 crop, every card placed after it that overlaps it (from hand state),
so a reader sees only the covered card's own visible part. Writes ../scan/S/crops_m/<crop> and masked.json
(crop -> visible fraction of the card area)."""
import sys, os, json, math, cv2, numpy as np
from hand_state import run
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')); from ofc_card_vision import card_quad
W, H, MARGIN = 64, 96, 0.10
DST = np.array([[0, 0], [W, 0], [W, H], [0, H]], np.float32)
CARD = np.zeros((H, W), np.uint8); CARD[4:92, 3:61] = 1
def crop_h(sl):
    q = card_quad(sl['x'], sl['y'], sl['w'], sl['h'], sl['deg']); c = q.mean(0); q = c + (q - c) * (1 + MARGIN)
    return cv2.getPerspectiveTransform(q.astype(np.float32), DST)
def mask_for(b, own, others):
    """b: body (its own box decides the crop); own: its slot; others: later-placed slots."""
    Hm = crop_h(dict(x=b['x'], y=b['y'], w=b['w'], h=b['h'], deg=b['deg']))
    m = np.zeros((H, W), np.uint8)
    for o in others:
        q = card_quad(o['x'], o['y'], o['w'], o['h'], o['deg']).reshape(-1, 1, 2).astype(np.float32)
        p = cv2.perspectiveTransform(q, Hm).reshape(-1, 2)
        cv2.fillConvexPoly(m, np.round(p).astype(np.int32), 1)
    return m
def later_overlapping(fr, own):
    out = []
    for o in fr['slots']:
        if o['id'] == own['id'] or o['first'] <= own['first'] + 0.3: continue
        if math.hypot(o['x'] - own['x'], o['y'] - own['y']) < 0.9 * (own['h'] + o['h']) / 2: out.append(o)
    return out
if __name__ == '__main__':
    tag = sys.argv[1]
    for s in sys.argv[2:]:
        out = run(s, tag); os.makedirs(f'../scan/{s}/crops_m', exist_ok=True); vis = {}
        for fr in out:
            S = {o['id']: o for o in fr['slots']}
            for b in fr['bodies']:
                if not b.get('crop') or b['track'] not in S: continue
                others = later_overlapping(fr, S[b['track']])
                if not others: continue
                m = mask_for(b, S[b['track']], others)
                v = float((CARD & (1 - m)).sum() / CARD.sum())
                if v > 0.97: continue
                im = cv2.imread(f"../scan/{s}/crops/{b['crop']}"); im[m > 0] = 128
                cv2.imwrite(f"../scan/{s}/crops_m/{b['crop']}", im, [cv2.IMWRITE_JPEG_QUALITY, 92]); vis[b['crop']] = round(v, 3)
        json.dump(vis, open(f'../scan/{s}/masked.json', 'w')); print(s, len(vis), flush=True)
