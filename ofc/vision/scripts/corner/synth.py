"""Synthetic rank glyphs: erase a real corner patch's rank glyph and draw another rank in a condensed sans font at the
same box, ink colour and blur. Label = (new rank, the patch's own suit)."""
import os, sys
REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')); sys.path.insert(0, REPO)
import cv2, numpy as np
from PIL import Image, ImageDraw, ImageFont
F = '/System/Library/Fonts/Supplemental/'; S = '/System/Library/Fonts/'
FONTS = [(F + 'Arial Narrow.ttf', 0), (S + 'HelveticaNeue.ttc', 0), (S + 'HelveticaNeue.ttc', 7), (S + 'Avenir Next Condensed.ttc', 0),
         (S + 'Avenir Next Condensed.ttc', 3), (F + 'DIN Condensed Bold.ttf', 0), (S + 'Helvetica.ttc', 0), (S + 'SFNS.ttf', 0)]
RANKS = 'A23456789TJQK'
# --morefonts (corner6): rounder sans faces whose 3 and closed 4 are closer to the jumbo deck's index font
MORE = [(F + 'Futura.ttc', 0), (F + 'GillSans.ttc', 0), (S + 'Avenir Next.ttc', 0), (F + 'Trebuchet MS.ttf', 0),
        (F + 'Verdana.ttf', 0), (F + 'Tahoma.ttf', 0), (F + 'Arial.ttf', 0), (S + 'Avenir.ttc', 0)]
def use_more_fonts(): FONTS.extend(MORE)
_cache = {}
def font(i, px):
    k = (i, px)
    if k not in _cache: _cache[k] = ImageFont.truetype(FONTS[i][0], px, index=FONTS[i][1])
    return _cache[k]
def glyph_box(p, sm):
    """bbox (y0, y1, x0, x1) of the ink above the seam in the index column, ink colour, white level"""
    r = p[:sm, :20].astype(np.int16); g = r.mean(2); white = np.percentile(p.reshape(-1, 3).mean(1), 90)
    felt = r[:, :, 0] - r[:, :, 2] > 35; ink = ((g < white - 45) & ~felt) | (r[:, :, 2] - r[:, :, 0] > 50)
    ys, xs = np.nonzero(ink)
    if len(ys) < 8: return None
    iv = r[ink]; col = np.median(iv[iv.mean(1) <= np.percentile(iv.mean(1), 33)], 0); wcol = np.median(p[:sm, :20][~ink & ~felt].reshape(-1, 3), 0) if (~ink & ~felt).sum() > 20 else np.array([white] * 3)
    return ys.min(), ys.max() + 1, xs.min(), xs.max() + 1, col, wcol
def synth(rng, p, sm, rank):
    gb = glyph_box(p, sm)
    if gb is None: return None
    y0, y1, x0, x1, col, wcol = gb; h = y1 - y0
    if h < 6 or h > 20: return None
    q = p.copy().astype(np.float32)
    q[max(y0 - 2, 0):y1 + 2, max(x0 - 2, 0):min(x1 + 2, 23)] = wcol + rng.normal(0, 2, (1, 1, 3))  # erase
    SC = 4; txt = '10' if rank == 'T' else rank; fi = rng.integers(len(FONTS))
    im = Image.new('L', (36 * SC, 36 * SC), 0); dr = ImageDraw.Draw(im); f = font(fi, int(h * SC * 1.35))
    bb = dr.textbbox((0, 0), txt, font=f); gw, gh = bb[2] - bb[0], bb[3] - bb[1]
    sx = rng.uniform(0.75, 1.1) * (h * SC) / max(gh, 1); m = np.zeros((36 * SC, 36 * SC), np.uint8)
    tmp = Image.new('L', (gw + 8, gh + 8), 0); ImageDraw.Draw(tmp).text((4 - bb[0], 4 - bb[1]), txt, font=f, fill=255)
    tw, th = max(1, int((gw + 8) * sx * (0.8 if txt == '10' else 1.0))), max(1, int((gh + 8) * (h * SC) / max(gh, 1)))
    a = np.array(tmp.resize((tw, th), Image.LANCZOS)); oy, ox = max(0, y0 * SC - 4 * th // (gh + 8)), max(0, x0 * SC - 2)
    hh, ww = min(th, 36 * SC - oy), min(tw, 36 * SC - ox)
    if hh <= 0 or ww <= 0: return None
    m[oy:oy + hh, ox:ox + ww] = a[:hh, :ww]
    a = cv2.resize(m.astype(np.float32) / 255, (36, 36), interpolation=cv2.INTER_AREA)
    a = cv2.GaussianBlur(a, (3, 3), rng.uniform(0.4, 0.9)) * rng.uniform(0.8, 1.0)
    q = q * (1 - a[:, :, None]) + col[None, None, :] * a[:, :, None]
    q = np.clip(q, 0, 255).astype(np.uint8)
    ok, enc = cv2.imencode('.jpg', q, [cv2.IMWRITE_JPEG_QUALITY, int(rng.integers(70, 95))])
    return cv2.imdecode(enc, 1)
if __name__ == '__main__':
    import sys, json; sys.argv = ['x']
    from train_corner import load, seam, CODES
    keep = {tuple(x) for x in json.load(open('../corner-keep.json'))}; pos, neg = load(['A', 'B'], keep=keep)
    rng = np.random.default_rng(0); tiles = []
    while len(tiles) < 40:
        p, y = pos[rng.integers(len(pos))]; r = RANKS[rng.integers(13)]; q = synth(rng, p, seam(p), r)
        if q is None: continue
        t = np.zeros((48, 76, 3), np.uint8); t[12:, :36] = p; t[12:, 40:] = q; cv2.putText(t, CODES[y] + '>' + r, (0, 9), 0, .3, (0, 255, 255), 1)
        tiles.append(cv2.resize(t, None, fx=3, fy=3, interpolation=cv2.INTER_NEAREST))
    cv2.imwrite('../look/synth.jpg', np.vstack([np.hstack(tiles[i:i + 8]) for i in range(0, 40, 8)]))
