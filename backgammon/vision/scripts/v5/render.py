#!/usr/bin/env python3
"""Render a game's analysis video: rectified board, decision panel, equity table, audio.

usage: render.py <analysis-dir> <out-dir> <game...> [--software]
"""
from __future__ import annotations
import argparse, json, subprocess
from fractions import Fraction
from functools import lru_cache
from pathlib import Path
import av, cv2, numpy as np
from PIL import Image, ImageDraw, ImageFont
import frames, geometry as g
from session import COMBINED, RECT

FPS = 25
W, H = 1920, 1080
BX, BY, BW, BH = 32, 88, 928, 696
RX, RY, RW, RH = 984, 88, 904, 960
BG, CARD, ROW, LINE = "#101723", "#1A2639", "#202E44", "#3B4B65"
TEXT, MUTED, WHITE, BLACK, GREEN = "#F1F5FA", "#B6C3D9", "#F5E6C8", "#BCD2FD", "#9CE4C6"
SELECTED, BEST_ROW = "#304A70", "#243E43"
PAD, HEAD, SECTION, BODY, META = 28, 41, 28, 24, 18
NAME = {"white": "White", "dark": "Black"}
TONE = {"white": WHITE, "dark": BLACK}
FONT = Path('/System/Library/Fonts/Supplemental')
HOLD = 2 * FPS
LEAD, TAIL = 5 * FPS, 6 * FPS
TONE_LUT = np.clip((np.arange(256, dtype=np.float32) - 24) * (255 / 222), 0, 255).astype(np.uint8)


@lru_cache(None)
def face(size, bold=False):
    try: return ImageFont.truetype(str(FONT / ('Arial Bold.ttf' if bold else 'Arial.ttf')), size)
    except OSError: return ImageFont.load_default(size)


def write(d, x, y, t, size, fill=TEXT, bold=False, anchor=None):
    d.text((x, y), str(t), font=face(size, bold), fill=fill, anchor=anchor)


def pct(p): return f"{p * 100:.1f}%"


def loss_color(v):
    return GREEN if v <= 1e-7 else "#A9DCCF" if v < .02 else "#F1CF88" if v < .05 else "#FFAD7D" if v < .1 else "#FF918C"


def card(w, h):
    im = Image.new("RGB", (w, h), BG); d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, w - 1, h - 1), radius=12, fill=CARD, outline=LINE)
    return im, d


def draw_dice(d, x, y, dice, player, size=44):
    pips = {1: (4,), 2: (0, 8), 3: (0, 4, 8), 4: (0, 2, 6, 8), 5: (0, 2, 4, 6, 8), 6: (0, 2, 3, 5, 6, 8)}
    fill, ink = ("#F2D35B", BG) if player == "white" else ("#D9534F", TEXT)
    s = size / 44
    for i, die in enumerate(dice):
        left = x + i * 53 * s
        d.rounded_rectangle((left, y, left + size, y + size), radius=8 * s, fill=fill)
        if die not in pips: write(d, left + size / 2, y + size / 2, "?", round(SECTION * s), ink, True, "mm"); continue
        for dot in pips[die]:
            cx, cy = left + (10 + 12 * (dot % 3)) * s, y + (10 + 12 * (dot // 3)) * s
            d.ellipse((cx - 3 * s, cy - 3 * s, cx + 3 * s, cy + 3 * s), fill=ink)


def both(prob, equity, mover):
    """Rows for White and Black from the mover's probabilities [win, wg, wbg, lg, lbg]."""
    w, wg, wb, lg, lb = prob
    me = {"equity": equity, "win": w, "single": w - wg, "gammon": wg - wb, "bg": wb}
    op = {"equity": -equity, "win": 1 - w, "single": 1 - w - lg, "gammon": lg - lb, "bg": lb}
    return (me, op) if mover == "white" else (op, me)


def pips(pos):
    pts, bar = pos["points"], pos["bar"]
    w = sum(v * (i + 1) for i, v in enumerate(pts) if v > 0) + bar[0] * 25
    b = sum(-v * (24 - i) for i, v in enumerate(pts) if v < 0) + bar[1] * 25
    return w, b


class Game:
    def __init__(self, data):
        self.d = data
        T = data["turns"]
        first_roll = next((t.get("rollFrame") or t["resultFrame"] for t in T), data["startFrame"])
        self.first = max(data["startFrame"], first_roll - LEAD)
        end = data["result"]["frame"] if data.get("result") else T[-1]["resultFrame"]
        self.last = min(data["endFrame"], end + TAIL) if data.get("result") else data["endFrame"]
        self.last = max(self.last, end + TAIL)
        self.segments = self.build()

    def build(self):
        segs, prev_end = [], self.first
        actions, loss = [], {"white": {"checker": 0.0, "cube": 0.0}, "dark": {"checker": 0.0, "cube": 0.0}}
        T = self.d["turns"]
        for i, t in enumerate(T):
            p = t["player"]; q = "dark" if p == "white" else "white"
            roll_at = t.get("rollFrame") or max(prev_end + FPS, (t.get("fromFrame") or t["resultFrame"]) - 2 * FPS)
            roll_at = min(max(roll_at, prev_end + 1), t["resultFrame"])
            ca = t.get("cubeAction")
            # pre-roll
            pre_end = ca["offerFrame"] if ca else roll_at
            if t.get("cubeDecision") or t.get("position"):
                segs.append((prev_end, pre_end, {"kind": "pre", "t": i}))
            if ca:
                cd = {o["action"]: o["equity"] for o in t["cubeDecision"]["options"]}
                best = max(cd.values())
                l = max(0.0, best - cd["double"]); loss[p]["cube"] += l
                actions.append({"f": ca["offerFrame"], "player": p, "label": f"doubles to {t['cube']['value'] * 2}", "ev": cd["double"], "loss": l})
                reply_at = ca.get("replyFrame") or ca["offerFrame"] + HOLD
                segs.append((ca["offerFrame"], reply_at, {"kind": "offer", "t": i}))
                resp = {o["action"]: o["equity"] for o in ca.get("responses", [])}
                if ca.get("reply") in resp:
                    bestr = min(resp[k] for k in ("take", "pass") if k in resp)
                    l2 = max(0.0, resp[ca["reply"]] - bestr); loss[q]["cube"] += l2
                    actions.append({"f": reply_at, "player": q, "label": ca["reply"] + "s", "ev": -resp[ca["reply"]], "loss": l2})
                end_reply = reply_at + HOLD if ca.get("reply") == "pass" else roll_at
                segs.append((reply_at, max(end_reply, reply_at + 1), {"kind": "reply", "t": i}))
                if ca.get("reply") == "pass": prev_end = reply_at + HOLD; break
            elif t.get("cubeDecision"):
                cd = {o["action"]: o["equity"] for o in t["cubeDecision"]["options"]}
                l = max(0.0, max(cd.values()) - cd["roll"]); loss[p]["cube"] += l
                if l > 0 or i == 0:
                    pass
                actions.append({"f": roll_at, "player": p, "label": "rolls without doubling" if t["cubeDecision"]["options"] else "rolls", "ev": cd["roll"], "loss": l, "quiet": l == 0})
            if t.get("cubeOnly"): continue
            segs.append((roll_at, t["resultFrame"], {"kind": "rolled", "t": i}))
            a = t.get("analysis")
            if a and a.get("played"):
                l = a["evLoss"]
                if t.get("rollSource") in ("move", "dice", "reviewed"): loss[p]["checker"] += l
                actions.append({"f": t["resultFrame"], "player": p, "label": f"played {a['played']['notation']}", "ev": a["played"]["equity"],
                                "loss": l if t.get("rollSource") in ("move", "dice", "reviewed") else None})
            elif t.get("dance"):
                actions.append({"f": t["resultFrame"], "player": p, "label": "cannot enter", "ev": None, "loss": None})
            prev_end = t["resultFrame"]
            segs.append((t["resultFrame"], t["resultFrame"] + HOLD, {"kind": "played", "t": i}))
            prev_end = t["resultFrame"] + HOLD
        segs.append((prev_end, self.last + 1, {"kind": "end"}))
        self.actions = actions
        # cumulative loss by frame
        self.loss_events = []
        run = {"white": {"checker": 0.0, "cube": 0.0}, "dark": {"checker": 0.0, "cube": 0.0}}
        return segs

    def at(self, f):
        for s0, s1, info in self.segments:
            if s0 <= f < s1: return info
        return {"kind": "end"}

    def position(self, f):
        pos = self.d["turns"][0]["before"]
        for t in self.d["turns"]:
            if t["resultFrame"] <= f: pos = t["after"]
            else: break
        return pos

    def cube(self, f):
        c = {"value": 1, "owner": None}
        for t in self.d["turns"]:
            ca = t.get("cubeAction")
            if ca and ca.get("reply") == "take" and (ca.get("replyFrame") or 1e12) <= f: c = t["cubeAfter"]
        return c

    def totals(self, f):
        tot = {"white": {"checker": 0.0, "cube": 0.0}, "dark": {"checker": 0.0, "cube": 0.0}}
        for a in self.actions:
            if a["f"] <= f and a.get("loss"):
                kind = "cube" if ("doubl" in a["label"] or a["label"] in ("takes", "passes")) else "checker"
                tot[a["player"]][kind] += a["loss"]
        return tot


def equity_panel(game, f, info):
    im, d = card(BW, 256)
    T = game.d["turns"]; closed = info["kind"] == "end" and game.d.get("result")
    title, basis, rows = "Game equity", "", None
    if not closed and "t" in info:
        t = T[info["t"]]
        if info["kind"] in ("pre", "offer", "reply", "rolled"):
            src = t.get("cubeDecision") or t.get("position")
            if src:
                eq = src.get("outcomes", [src["equity"]])[0] if src.get("outcomes") else src["equity"]
                rows = both(src["probabilities"], eq, t["player"]); basis = f"{NAME[t['player']]} to roll"
        elif info["kind"] == "played" and t.get("analysis", {}).get("played"):
            pl = t["analysis"]["played"]; rows = both(pl["probabilities"], pl["equity"], t["player"]); basis = "After played move"
    if closed:
        r = game.d["result"]; title = "Final EV loss"
        basis = f"{NAME[r['winner']]} wins {r['points']} pt{'s' if r['points'] != 1 else ''} · {r['reason']}"
    write(d, 28, 20, title, SECTION, bold=True); write(d, BW - 28, 26, basis, META, MUTED, anchor="ra")
    cols = [(172, "Pips"), (262, "Equity"), (346, "Win"), (430, "Single"), (522, "Gammon"), (660, "Backgammon"), (790, "Checker EVL"), (899, "Cube EVL")]
    for x, lab in cols: write(d, x, 84, lab, META, MUTED, True, "ra")
    d.line((28, 115, BW - 28, 115), fill=LINE)
    pw = pips(game.position(f)); tot = game.totals(f)
    for k, p in enumerate(("white", "dark")):
        y = 132 + k * 57
        d.rounded_rectangle((15, y - 5, BW - 15, y + 44), radius=7, fill=ROW if k == 0 else CARD)
        d.rounded_rectangle((23, y + 10, 29, y + 28), radius=3, fill=TONE[p])
        write(d, 39, y + 3, NAME[p], BODY, TONE[p], True)
        vals = [pw[k]] + (["—"] * 5 if rows is None else [f"{rows[k]['equity']:+.3f}", pct(rows[k]['win']), pct(rows[k]['single']), pct(rows[k]['gammon']), pct(rows[k]['bg'])])
        for (x, _), v in zip(cols[:6], vals): write(d, x, y + 4, v, BODY, anchor="ra")
        for (x, _), kind in zip(cols[6:], ("checker", "cube")):
            v = tot[p][kind]; write(d, x, y + 4, f"{v:.3f}", BODY, loss_color(v), True, "ra")
    return im


def table(d, y, title, rows, best, played=None, numbers=True, height=52):
    write(d, PAD, y, title, META, MUTED, True); write(d, RW - 176, y, "EV", META, MUTED, True, "ra"); write(d, RW - PAD, y, "EV loss", META, MUTED, True, "ra")
    d.line((PAD, y + 28, RW - PAD, y + 28), fill=LINE)
    for i, (key, label, ev) in enumerate(rows):
        top = y + 37 + i * height
        opt = abs(best - ev) < 1e-7; sel = played is not None and key == played
        d.rounded_rectangle((PAD - 7, top, RW - PAD + 7, top + height - 5), radius=7, fill=SELECTED if sel else BEST_ROW if opt else ROW if i % 2 == 0 else CARD)
        x = PAD + 13
        if numbers: write(d, x, top + 8, i + 1, META, MUTED, True); x += 31
        write(d, x, top + 6, label, BODY, TEXT, opt or sel)
        badge = "PLAYED · BEST" if sel and opt else "PLAYED" if sel else "BEST" if opt else ""
        if badge: write(d, RW - 309, top + 9, badge, META, BLACK if sel else GREEN, True, "ra")
        write(d, RW - 176, top + 6, f"{ev:+.3f}", BODY, anchor="ra")
        l = max(0, best - ev); write(d, RW - PAD, top + 6, f"{l:.3f}", BODY, loss_color(l), True, "ra")


def decision_panel(game, f, info):
    im, d = card(RW, RH)
    write(d, PAD, 24, "Decision analysis", SECTION, bold=True)
    d.line((PAD, 64, RW - PAD, 64), fill=LINE)
    T = game.d["turns"]; kind = info["kind"]
    if kind == "end" or "t" not in info:
        r = game.d.get("result")
        if r: write(d, PAD, 90, f"{NAME[r['winner']]} wins {r['points']} point{'s' if r['points'] != 1 else ''}", HEAD, TONE[r['winner']], True); write(d, PAD, 145, {"pass": "Cube passed", "gammon": "Gammon", "bear-off": "Bore off all checkers"}.get(r["reason"], r["reason"]), BODY, MUTED)
        else: write(d, PAD, 90, "Recording ends", HEAD, TEXT, True)
    else:
        t = T[info["t"]]; p = t["player"]; q = "dark" if p == "white" else "white"
        if kind in ("pre", "offer", "reply"):
            cd = t.get("cubeDecision")
            heading = f"{NAME[p]} on roll"
            if kind == "offer": heading = f"{NAME[p]} doubles to {t['cube']['value'] * 2}"
            if kind == "reply": heading = f"{NAME[q]} {t['cubeAction']['reply']}s"
            write(d, PAD, 90, heading, HEAD, TONE[p if kind != 'reply' else q], True)
            write(d, PAD, 145, f"Cube at {t['cube']['value']}" + ("" if t['cube']['owner'] is None else f" · owned by {NAME['white' if t['cube']['owner'] == 0 else 'dark']}"), META, MUTED)
            if cd and cd.get("options"):
                o = {x["action"]: x["equity"] for x in cd["options"]}
                rows = [("roll", "No double", o["roll"]), ("double", "Double", o["double"])]
                played = "double" if t.get("cubeAction") and kind != "pre" else None
                table(d, 190, f"{NAME[p]}’s cube decision", rows, max(o.values()), played, numbers=False)
            elif t.get("position"):
                write(d, PAD, 200, "No cube decision (cube owned by the opponent)", BODY, MUTED)
            ca = t.get("cubeAction")
            if ca and kind in ("offer", "reply") and ca.get("responses"):
                o = {x["action"]: -x["equity"] for x in ca["responses"] if x["action"] in ("take", "pass")}
                rows = [("take", "Take", o["take"]), ("pass", "Pass", o["pass"])]
                table(d, 380, f"{NAME[q]}’s response", rows, max(o.values()), ca.get("reply") if kind == "reply" else None, numbers=False)
        else:
            roll = t.get("roll")
            write(d, PAD, 90, f"{NAME[p]}’s roll", HEAD, TONE[p], True)
            if roll: draw_dice(d, PAD + d.textlength(f"{NAME[p]}’s roll", font=face(HEAD, True)) + 24, 86, roll, p)
            src = {"move": "Roll confirmed by the move played", "dice": "Roll read from the dice", "reviewed": "Roll read from the dice (reviewed)", "ambiguous": "Roll uncertain: several rolls fit the move"}.get(t.get("rollSource"), "")
            if t.get("inferred"): src = "Move inferred between camera views"
            write(d, PAD, 145, src, META, MUTED)
            a = t.get("analysis")
            if a:
                rows = [(c["notation"], c["notation"], c["equity"]) for c in a["candidates"]]
                played = a["played"]["notation"] if kind == "played" and a.get("played") else None
                table(d, 190, "Top checker moves", rows, rows[0][2], played)
                if played and a["played"]["rank"] > len(rows):
                    write(d, PAD, 190 + 37 + len(rows) * 52 + 6, f"Played {played} · rank {a['played']['rank']} of {a['legalMoves']} · EV {a['played']['equity']:+.3f} · loss {a['evLoss']:.3f}", BODY, loss_color(a['evLoss']), True)
            elif t.get("dance"):
                write(d, PAD, 200, "No legal entry", BODY, MUTED)
    # recent actions
    recent = [a for a in game.actions if a["f"] <= f and not a.get("quiet")][-3:]
    if recent:
        y0 = 742
        d.line((PAD, y0, RW - PAD, y0), fill=LINE)
        write(d, PAD, y0 + 13, "Recent actions", META, MUTED, True); write(d, RW - 176, y0 + 13, "EV", META, MUTED, True, "ra"); write(d, RW - PAD, y0 + 13, "EV loss", META, MUTED, True, "ra")
        for i, a in enumerate(reversed(recent)):
            y = y0 + 52 + i * 39
            write(d, PAD, y, f"{NAME[a['player']]} {a['label']}", BODY, TONE[a['player']])
            write(d, RW - 176, y, "—" if a.get("ev") is None else f"{a['ev']:+.3f}", BODY, anchor="ra")
            l = a.get("loss"); write(d, RW - PAD, y, "—" if l is None else f"{l:.3f}", BODY, MUTED if l is None else loss_color(l), True, "ra")
    return im


def badges(pos, cube):
    """RGBA overlay at board size with point counts, bar, borne-off and cube."""
    im = Image.new("RGBA", (BW, BH), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    sx, sy = BW / g.W if hasattr(g, 'W') else BW / 800, BH / 590
    def badge(x, y, n, player):
        fill, ink = (WHITE, BG) if player == "white" else ("#2A3A55", TEXT)
        d.rounded_rectangle((x - 17, y - 15, x + 17, y + 15), radius=6, fill=fill, outline=BG, width=2)
        write(d, x, y, n, 20, ink, True, "mm")
    for p in range(1, 25):
        v = pos["points"][p - 1]
        if v: badge(g.point_x(p) * sx, (14 if g.is_top(p) else 576) * sy, abs(v), "white" if v > 0 else "dark")
    bx = (g.BAR_X[0] + g.BAR_X[1]) / 2 * sx
    if pos["bar"][0]: badge(bx, 250 * sy, f"{pos['bar'][0]}", "white")
    if pos["bar"][1]: badge(bx, 340 * sy, f"{pos['bar'][1]}", "dark")
    if pos["off"][0]: badge(732 * sx, 150 * sy, pos["off"][0], "white")
    if pos["off"][1]: badge(732 * sx, 440 * sy, pos["off"][1], "dark")
    if cube["value"] > 1:
        y = 60 if cube["owner"] == 0 else 530
        d.rounded_rectangle((8, y * sy - 22, 70, y * sy + 22), radius=8, fill="#E8D5B0", outline=BG, width=2)
        write(d, 39, y * sy, cube["value"], 24, BG, True, "mm")
    return np.asarray(im)


def header(game, f):
    im = Image.new("RGB", (W, 80), BG); d = ImageDraw.Draw(im)
    write(d, 32, 24, "Office-3 Backgammon", 28, TEXT, True)
    write(d, 392, 26, f"Nov 21 · Game {game.d['game']:02d}", 24, MUTED)
    s = (f - game.first) // FPS; write(d, W - 32, 24, f"{s // 60:02d}:{s % 60:02d}", 28, TEXT, True, "ra")
    d.line((32, 72, W - 32, 72), fill=LINE)
    return np.asarray(im)[:, :, ::-1]


def render(game, out, software=False):
    tmp = out.with_suffix('.video.mp4')
    container = av.open(str(tmp), 'w')
    st = container.add_stream('libx264' if software else 'h264_videotoolbox', rate=FPS)
    st.width, st.height = W, H; st.pix_fmt = 'yuv420p' if software else 'nv12'
    if software: st.options = {'crf': '20', 'preset': 'veryfast'}
    else: st.bit_rate = 5_000_000; st.options = {'allow_sw': '1', 'realtime': '0', 'profile': 'high'}
    base = np.full((H, W, 3), tuple(int(BG[i:i + 2], 16) for i in (5, 3, 1)), np.uint8)
    cache = {}
    n = 0
    clip, idx = frames.locate(game.first)
    want = game.first
    while want <= game.last:
        with av.open(str(RECT / f'clip-{clip:03d}.mp4')) as box:
            for i, fr in enumerate(box.decode(video=0)):
                if i < idx: continue
                f = want
                info = game.at(f); pos = game.position(f); cube = game.cube(f)
                canvas = base.copy()
                canvas[:80] = cache.setdefault(('h', (f - game.first) // FPS), header(game, f))
                board = cv2.LUT(cv2.resize(fr.to_ndarray(format='bgr24'), (BW, BH), interpolation=cv2.INTER_AREA), TONE_LUT)
                key = ('b', json.dumps(pos), cube['value'], cube['owner'])
                ov = cache.get(key)
                if ov is None: ov = cache[key] = badges(pos, cube)
                a = ov[:, :, 3:4] / 255.0
                board = (board * (1 - a) + ov[:, :, 2::-1] * a).astype(np.uint8)
                canvas[BY:BY + BH, BX:BX + BW] = board
                rec = len([x for x in game.actions if x['f'] <= f])
                k2 = ('p', json.dumps(info), rec, f >= game.last - TAIL)
                panels = cache.get(k2)
                if panels is None:
                    panels = cache[k2] = (np.asarray(decision_panel(game, f, info))[:, :, ::-1], np.asarray(equity_panel(game, f, info))[:, :, ::-1])
                canvas[RY:RY + RH, RX:RX + RW] = panels[0]
                canvas[BY + BH + 12:BY + BH + 12 + 256, BX:BX + BW] = panels[1]
                vf = av.VideoFrame.from_ndarray(canvas, format='bgr24'); vf.pts = n; vf.time_base = Fraction(1, FPS)
                for pkt in st.encode(vf): container.mux(pkt)
                n += 1; want += 1
                if len(cache) > 400: cache.clear()
                if want > game.last: break
        clip += 1; idx = 0
    for pkt in st.encode(): container.mux(pkt)
    container.close()
    start = game.first / FPS; dur = n / FPS
    subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', str(tmp), '-ss', f'{start:.3f}', '-t', f'{dur:.3f}', '-i', str(COMBINED),
                    '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'libx264', '-crf', '26', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', str(out)], check=True)
    tmp.unlink()
    return n


if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('analysis'); ap.add_argument('out'); ap.add_argument('games', type=int, nargs='+')
    ap.add_argument('--software', action='store_true'); ap.add_argument('--preview', type=float, help='render only N seconds')
    a = ap.parse_args(); Path(a.out).mkdir(parents=True, exist_ok=True)
    for gnum in a.games:
        data = json.loads((Path(a.analysis) / f'game-{gnum:02d}.json').read_text())
        game = Game(data)
        if a.preview: game.last = game.first + int(a.preview * FPS)
        n = render(game, Path(a.out) / f'game-{gnum:02d}-analysis.mp4', a.software)
        (Path(a.out) / f'game-{gnum:02d}.range.json').write_text(json.dumps({'first': game.first, 'last': game.last, 'frames': n}))
        print(gnum, 'frames', n, 'range', game.first, game.last)
