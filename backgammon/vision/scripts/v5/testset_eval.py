#!/usr/bin/env python3
"""Score the dice, cube and checker readers on the held-out, eye-verified test frames.

Frames and labels: heldout.TEST_DIR/frames.npz and labels/heldout-labels.json (testset_labels.py).
Per day (Nov 21, Nov 23, Nov 24) it prints counts:

  dice found      labelled dice with a detection of the right colour within 12 px
  dice missed     labelled dice with none (a wrong-colour detection there is also counted)
  dice extra      detections with no labelled die (peaks near "ignore" or "hidden" places excepted)
  dice faces      turn frames: the roller's detected dice read by the face reader, compared with the
                  turn's roll without order (both colours on a game's opening roll)
  die faces       the new set: each found die whose face was read by eye (labels "faces": checked against the legal-move roll), read alone
  cube zone       best cube peak (score >= 0.5) in the labelled zone; a missing peak is wrong
  cube face       the published analysis' cube value at that frame (holder = 64); after the game's end
                  (a pass or the last bear-off) the players reset the cube and the frame is not scored
  points          quiet frames: slot reader per point (a count of 6 reads a column of 6 or more;
                  points the reader marks unknown are counted apart)
  decoded         quiet frames: the published decode's position at that frame (points, bar, off). A
                  frame where the player on roll has made part (or all) of the next decoded turn's
                  move, as it was played, counts as mid-move: the replay shows whole turns. A frame
                  showing the whole move more than 2 s before the decode's result is late; one
                  whose position the decode never reaches there is wrong. After the published game's end
                  the final position is expected; a board changed by play after the game (the Nov 23
                  play-out after the pass) is counted apart.

usage: [BG_TEST_SET=new] testset_eval.py [--obj M[,M2]] [--verify V] [--track CACHE] [--tol 12] [--cube-thresh 0.5] [--faces M] [--slots M] [--thresh 0.35] [--post merge|none] [--comb]
                       [--decode s1=decode.json ...] [--decoded-only] [-v]
  --decode scores a decode2.mjs output for a session instead of the published analysis.
"""
import argparse, collections, json, math
from pathlib import Path
import cv2, numpy as np, torch
import heldout as H, objects as ob, read_slots as rs, dice as dice_mod, dice_faces as df, die_verify as dv
from session import reader_xy, reader_points
from testset_sheet import load_test, img_of, analysis, state_at

D = Path.home() / 'Downloads/office-3-backgammon-20261121'
LABELS = Path(__file__).parent / ('labels/heldout-labels-new.json' if H.TEST_SET == 'new' else 'labels/heldout-labels.json')
TOL = 12  # --tol: 16 for the new set's blind labels (placed by eye, about 10 px)
LATE = 50  # 2 s: a stable reading takes three samples 5 frames apart, and the decode marks its start


def die_peaks(net, im, thresh, post, comb=False, ver=None):
    with torch.no_grad():
        logits = net(ob.to_tensor(im)[None].to(ob.dev)); det = ob.peaks(logits, min(thresh, .15))[0]
    dice = [(c, x, y, s) for c, x, y, s in det if c < 2 and ob.on_board(x, y)]
    if comb: dice = [d for d in ob.die_peaks(logits, min(thresh, .15))[0] if ob.on_board(d[1], d[2])]
    cubes = sorted([d for d in det if d[0] == 2], key=lambda d: -d[3])
    if ver is not None: return dv.refine(ver, im, dice, thresh), cubes[0] if cubes else None
    return post_dice(dice, thresh, post), cubes[0] if cubes else None


def post_dice(dice, thresh, post):
    return [d for d in dice if d[3] >= thresh] if post == 'none' else ob.merge_dice(dice, thresh)


def cube_zone(x, y, session):
    st = H.settings(session); right = st.get('cubeRail') == 'right'
    rail = st.get('cubeRailX', 710 if right else 90)  # as analyze.mjs
    on_rail = x > rail if right else x < rail
    if on_rail: return 'white' if y < 250 else 'dark' if y > 350 else 'holder'
    return 'board'


def system_cube_face(A, f):
    """Cube value the published analysis shows at frame f (64 = centred)."""
    value, centred = 1, True
    first = A['turns'][0].get('cube') or {'value': 1, 'owner': None}
    value = first['value']; centred = first.get('owner') is None and value == 1
    for e in A['cubeEvents']:
        if e['frame'] > f: break
        if e['type'] == 'offer': value = e.get('value') or value * 2; centred = False
        elif e['type'] == 'pass': centred = True; value = 1
        elif e['type'] == 'take': centred = False
    return 64 if centred else value


def game_end(block):
    """Last frame of the published game: its end, the cube pass that ended it, or its last bear-off."""
    A = analysis(block); r = A.get('result') or {}
    won = [r['frame']] if r.get('reason') in ('bear-off', 'gammon') and r.get('frame') else []
    return min([A['endFrame']] + won + [e['frame'] for e in A['cubeEvents'] if e['type'] == 'pass'])


def block_turns(block, decodes):
    """The block's turns in order as dicts: player, frame (result), end (dice picked up, else the
    result), before, after, rolls (the dice the decode allows)."""
    s, a, b, an, label = [x for x in H.BLOCKS if x[4] == block][0]
    A = analysis(block)
    pub = [t for t in A['turns'] if not t.get('cubeOnly')]
    ref = decodes.get(s)
    if not ref:
        return [{'player': t['player'], 'frame': t['resultFrame'], 'end': t.get('pickupFrame') or t['resultFrame'],
                 'before': t['before'], 'after': t['after'], 'rolls': [t['roll']] if t.get('roll') else []} for t in pub]
    d = json.loads(Path(ref).read_text())
    g = [g for g in d['games'] if g['turns'] and g['startFrame'] <= b and g['turns'][-1]['frame'] >= a][0]
    out = []
    for t in g['turns']:
        # the dice pickup comes from the dice scan: take it from the published turn with the same result
        m = [u for u in pub if u['player'] == t['player'] and u['after'] == t['after'] and abs(u['resultFrame'] - t['frame']) < 3000]
        end = max(t['frame'], m[0].get('pickupFrame') or 0) if m else t['frame']
        out.append({'player': t['player'], 'frame': t['frame'], 'end': end, 'before': t['before'], 'after': t['after'],
                    'rolls': [p['dice'] for p in t['plays']]})
    return out


def die_moves(st, d, white):
    """Positions after moving one checker of the player by one die (simplified bear-off)."""
    pts, bar, off = st; me, sg = (0, 1) if white else (1, -1); out = []
    def land(p, b, o, t):
        if pts_ok(p, t):
            p = list(p); b = list(b)
            if p[t] * sg == -1: p[t] = 0; b[1 - me] += 1
            p[t] += sg; out.append((tuple(p), tuple(b), o))
    def pts_ok(p, t): return p[t] * sg >= -1
    if bar[me]:
        t = 24 - d if white else d - 1
        b = list(bar); b[me] -= 1; land(pts, tuple(b), off, t)
        return out
    home = all(v * sg <= 0 for i, v in enumerate(pts) if (i > 5 if white else i < 18))
    for i in range(24):
        if pts[i] * sg < 1: continue
        p = list(pts); p[i] -= sg; t = i - d if white else i + d
        if 0 <= t <= 23: land(tuple(p), bar, off, t)
        elif home:
            o = list(off); o[me] += 1; out.append((tuple(p), bar, tuple(o)))
    return out


def partial_states(turn):
    """Every position on the way through a turn: any legal moves with part or all of its dice
    (players try one arrangement and change it before they pick up the dice)."""
    white = turn['player'] == 'white'; out = set()
    b = turn['before']; start = (tuple(b['points']), tuple(b['bar']), tuple(b['off']))
    for roll in turn['rolls']:
        dice = [roll[0]] * 4 if roll[0] == roll[1] else list(roll)
        frontier = {(start, tuple(sorted(dice)))}
        while frontier:
            nxt = set()
            for st, left in frontier:
                out.add(st)
                for d in set(left):
                    rest = list(left); rest.remove(d)
                    for s2 in die_moves(st, d, white): nxt.add((s2, tuple(rest)))
            frontier = nxt
    return out


def decoded_check(turns, f, chk, end):
    """'right', 'mid-move', 'late' or 'wrong' for the eye-checked position chk at frame f. A frame
    between the next turn's roll and its end (dice picked up) showing part or all of its move is
    mid-move; showing the whole move more than LATE frames after the dice were picked up and
    before the decode's result is late. After the game's end (a pass) the replay holds the final
    position: a board that differs from it then is play after the game, not scored."""
    pos = turns[0]['before']
    for t in turns:
        if t['frame'] <= min(f, end): pos = t['after']
    def eq(p):
        return list(p[0]) == chk['points'] and (chk.get('barUnseen') or list(p[1]) == chk['bar']) and list(p[2]) == chk['off']
    if eq((pos['points'], pos['bar'], pos['off'])): return 'right'
    if f > end: return 'after the game'
    later = [t for t in turns if t['frame'] > f]
    if later:
        same = [t for t in later if t['frame'] == later[0]['frame']]  # a two-turn jump shares a frame
        for t in same:
            if eq((t['after']['points'], t['after']['bar'], t['after']['off'])):
                return 'late' if f > t['end'] + LATE else 'mid-move'
            if any(eq(p) for p in partial_states(t)): return 'mid-move'
    return 'wrong'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--obj', default=str(D / 'objects/models/obj-v8.pt'))
    ap.add_argument('--faces', default=str(D / 'models/faces-v6.pt'))
    ap.add_argument('--slots', default=str(D / 'models/slots-v3.pt'))
    ap.add_argument('--thresh', type=float, default=.35); ap.add_argument('--post', default='merge')
    ap.add_argument('--counts', default='run', help='run (checkers stack from the rail) or slots (every filled slot)')
    ap.add_argument('--decode', nargs='*', default=[], help='SESSION=decode2.json: score this decode instead of the published one')
    ap.add_argument('--decoded-only', action='store_true', help='score only the decoded positions (no models)')
    ap.add_argument('--comb', action='store_true', help='dice on the combined die score (objects.die_peaks)')
    ap.add_argument('--verify', help='die crop verifier (die_verify.py): second look at every die peak')
    ap.add_argument('--tol', type=float, default=12, help='px between a labelled die and its peak')
    ap.add_argument('--cube-thresh', type=float, default=.5, help='best cube peak needed to place the cube (0.15 shipped)')
    ap.add_argument('--track', help='die_track.py testcache file: dice and cube from die tracking (die_track.Tracker)')
    ap.add_argument('--no-one-die', action='store_true', help='tracking without the one-die check (die_track rule 5b)')
    ap.add_argument('-v', action='store_true')
    a = ap.parse_args()
    global TOL; TOL = a.tol
    decodes = dict(x.split('=', 1) for x in a.decode); turns_of = {}
    items, imgs = load_test(); L = json.loads(LABELS.read_text())
    if not a.decoded_only:
        net = ob.load(a.obj); reader = rs.Reader(a.slots, ob.dev)
        fnet = df.load_net(a.faces); ver = dv.load(a.verify) if a.verify else None
        if a.track:
            import pickle, die_track
            trackers = {s: die_track.Tracker(raw, image=None if a.no_one_die else die_track.session_images(s)) for s, raw in pickle.load(open(a.track, 'rb')).items()}
    S = collections.defaultdict(collections.Counter); errs = collections.defaultdict(list)
    first_turn = {}
    for it in items:
        if it['kind'] == 'turn': first_turn.setdefault(it['block'], it['key'])
        if H.TEST_SET == 'new':  # the new set's frames belong to the game played at that frame (none between games)
            f = int(it['key'].split(':')[1])
            it['block'] = next((lab for s, a, b, an, lab in H.BLOCKS if a <= f <= b + 750), None)
    for it in items:
        k = it['key']; s = it['session']; day = H.DAY[s]; lab = L[k]; f = int(k.split(':')[1])
        if a.decoded_only:
            if lab['checkers'] is not None and it['block'] is not None:
                if it['block'] not in turns_of: turns_of[it['block']] = block_turns(it['block'], decodes)
                res = decoded_check(turns_of[it['block']], f, lab['checkers'], game_end(it['block']))
                S[day]['quiet frames'] += 1; S[day]['decoded ' + res] += 1
                if res != 'right': errs[day].append(f'{k} decoded {res}')
            continue
        im = img_of(imgs[k]); view = H.board_view(s)
        if a.track:
            dice = trackers[s].dice(f); c = trackers[s].cube(f, a.cube_thresh); cube = (2, *c) if c else None
        else: dice, cube = die_peaks(net, im, a.thresh, a.post, a.comb, ver)
        # dice presence and colour
        used = set(); matched = {}
        for ti, (x, y, c) in enumerate(lab['dice']):
            best = min(((math.hypot(d[1] - x, d[2] - y), j) for j, d in enumerate(dice) if d[0] == c and j not in used), default=(99, None))
            if best[0] <= TOL:
                used.add(best[1]); matched[ti] = best[1]; S[day]['dice found'] += 1
            else:
                S[day]['dice missed'] += 1; errs[day].append(f'{k} miss die {"YR"[c]} at {x:.0f},{y:.0f}')
        free = [p[:2] for p in lab['hidden'] + lab['ignore']]
        for j, d in enumerate(dice):
            if j in used or any(math.hypot(d[1] - p[0], d[2] - p[1]) < 16 for p in free): continue
            S[day]['dice extra'] += 1; errs[day].append(f'{k} extra {"YR"[d[0]]} {d[3]:.2f} at {d[1]:.0f},{d[2]:.0f}')
        S[day]['dice labelled'] += len(lab['dice'])
        # faces of single dice (the new set: read by eye where the crop shows them, testset_labels.FACES)
        for ti, fv in enumerate(lab.get('faces') or []):
            if fv is None: continue
            S[day]['die faces labelled'] += 1
            if ti not in matched: continue
            d = dice[matched[ti]]; p = dice_mod.patch(im, d[1], d[2], 40)
            with torch.no_grad(): r = int(fnet(df.prep(p, False)[None].to(df.dev))[0].argmax()) + 1
            S[day]['die faces read'] += 1; S[day]['die faces right'] += r == fv
            if r != fv: errs[day].append(f'{k} die face read {r} truth {fv} at {lab["dice"][ti][0]:.0f},{lab["dice"][ti][1]:.0f}')
        # faces on turn frames
        if lab.get('roll'):
            red = 1 if it['player'] == H.red_player(s) else 0
            both = first_turn.get(it['block']) == k
            ids = [ti for ti, (x, y, c) in enumerate(lab['dice']) if (both or c == red) and ti in matched]
            if ids:
                reads = []
                for ti in ids:
                    d = dice[matched[ti]]
                    p = dice_mod.patch(im, d[1], d[2], 40)
                    with torch.no_grad(): lp = torch.log_softmax(fnet(df.prep(p, False)[None].to(df.dev)), 1)[0].cpu().numpy()
                    reads.append(int(lp.argmax()) + 1)
                roll = sorted(lab['roll']) if lab['roll'][0] != lab['roll'][1] else lab['roll']
                if len(reads) >= 2: ok = sorted(reads[:2]) == sorted(roll[:2])
                else: ok = reads[0] in roll
                S[day]['faces right'] += ok; S[day]['faces read'] += 1
                if not ok: errs[day].append(f'{k} faces read {reads} roll {lab["roll"]}')
        # cube
        if lab['cube'] is not None:
            S[day]['cube frames'] += 1
            if cube is not None and cube[3] >= a.cube_thresh:
                cx, cy = reader_xy(cube[1], cube[2], 800, 590, view)
                z = cube_zone(cx, cy, s)
            else: z = None
            ok = z == lab['cube']['zone']; S[day]['cube zone right'] += ok
            if not ok: errs[day].append(f'{k} cube zone {z} truth {lab["cube"]["zone"]} (peak {cube[3] if cube else 0:.2f})')
            if it['block'] is not None and f > game_end(it['block']):
                S[day]['cube face after the game'] += 1  # the replay holds the final cube; the players reset it
            else:
                if it['block'] is None: face = 64  # between games the cube is centred
                else: A = analysis(it['block']); face = system_cube_face(A, f)
                ok = face == lab['cube']['face']; S[day]['cube face right'] += ok; S[day]['cube faces scored'] += 1
                if not ok: errs[day].append(f'{k} cube face {face} truth {lab["cube"]["face"]}')
        # checkers
        chk = lab['checkers']
        if chk is not None:
            pr = reader.probs_batch([im])[0]
            order = reader_points(view); wrong = []; unk = 0
            if a.counts == 'run': rpos, rconf = rs.counts(pr)
            else:
                cls = pr.argmax(-1); rconf = np.where((cls == 3).any(-1), 0., pr.max(-1).min(-1)) if pr.shape[-1] > 3 else pr.max(-1).min(-1)
                rpos = [int((cls[q] == 1).sum()) if (cls[q] == 1).sum() >= (cls[q] == 2).sum() else -int((cls[q] == 2).sum()) for q in range(24)]
            for i in range(24):
                q = order[i]
                if rconf[q] < .5: unk += 1; continue
                r = rpos[q]; t = chk['points'][i]
                tc = max(-6, min(6, t))
                if r != tc: wrong.append((i + 1, t, r))
            S[day]['quiet frames'] += 1; S[day]['points read'] += 24 - unk
            if it['block'] is None:
                S[day]['decoded between games'] += 1; S[day]['points wrong'] += len(wrong); S[day]['points unknown'] += unk
                S[day]['frames all points right'] += not wrong and not unk
                for w in wrong: errs[day].append(f'{k} reader point {w[0]} truth {w[1]} read {w[2]}')
                continue; S[day]['points unknown'] += unk
            S[day]['points wrong'] += len(wrong); S[day]['frames all points right'] += not wrong and not unk
            for w in wrong: errs[day].append(f'{k} reader point {w[0]} truth {w[1]} read {w[2]}')
            if it['block'] not in turns_of: turns_of[it['block']] = block_turns(it['block'], decodes)
            res = decoded_check(turns_of[it['block']], f, chk, game_end(it['block']))
            S[day]['decoded ' + res] += 1
            if res != 'right': errs[day].append(f'{k} decoded {res}')
    def die_faces(c):
        return f" | die faces {c['die faces right']}/{c['die faces read']} ({c['die faces labelled']} labelled)" if c['die faces labelled'] else ''

    def after_note(c):
        n = c['cube face after the game']
        return f' (+{n} after the game)' if n else ''
    for day in H.DAYS:
        c = S[day]
        print(f"{day}: dice {c['dice found']}/{c['dice labelled']} found, {c['dice missed']} missed, {c['dice extra']} extra | "
              f"faces {c['faces right']}/{c['faces read']}{die_faces(c)} | cube zone {c['cube zone right']}/{c['cube frames']} face {c['cube face right']}/{c['cube faces scored']}{after_note(c)} | "
              f"points wrong {c['points wrong']}/{c['points read']} (+{c['points unknown']} unknown), frames all right {c['frames all points right']}/{c['quiet frames']} | "
              f"decoded {c['decoded right']}/{c['quiet frames']} right, {c['decoded mid-move']} mid-move, {c['decoded late']} late, {c['decoded wrong']} wrong, {c['decoded after the game']} after the game (not scored)")
        if a.v:
            for e in errs[day]: print('   ', e)


if __name__ == '__main__':
    main()
