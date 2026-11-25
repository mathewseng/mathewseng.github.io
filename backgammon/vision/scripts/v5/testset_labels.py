#!/usr/bin/env python3
"""Write the eye-verified labels of the held-out test frames (labels/heldout-labels.json).

Each frame of TEST_DIR/items.json was looked at on testset_sheet.py sheets (obj-v8 peaks above
0.15 with crops, slots-v3 and the published decode drawn on the board), on cube crop grids and
on dice face strips. The review notes are TEST_DIR/notes.txt; this script turns them into labels:
the obj-v8 peaks at 0.35 or more, then the corrections below. Positions are in the readers' view
(the Nov 21 orientation the stored frames use).

Labels per frame:
  dice      [[x, y, red]] dice lying on the board and visible (dice in a hand are not on the board)
  hidden    dice proven not observable in this frame (a sliver under a hand or a stack), with the
            proof crop under TEST_DIR/proof; neither a miss nor an extra
  ignore    places where a peak is neither right nor wrong (the colour cannot be decided by eye)
  cube      {"xy": [x, y], "zone": holder|board|white|dark, "face": 64|2|4} or null when the cube
            is in a hand (not observable)
  checkers  {"points": 24 signed counts (White's numbering, + White), "bar": [w, b], "off": [w, b]}
            for quiet frames (no hand over the board and no checker in motion), else null;
            "barUnseen" when a hit checker is held in a hand
  roll      the turn's roll (turn frames), eye-checked on the dice face strips
usage: testset_labels.py
"""
import json, math, re
from pathlib import Path
import heldout as H

OUT = Path(__file__).parent / ('labels/heldout-labels-new.json' if H.TEST_SET == 'new' else 'labels/heldout-labels.json')
THRESH = .35

# Several peaks on one die (one die, at the cluster's strongest peak: the detector centres on a
# die's coloured side face, the pip face shows about 10 px to its left)
MERGE = {
    's1:76575': [(421, 244, 1)], 's3:31163': [(420, 226, 1)], 's4:4062': [(463, 164, 0)],
    's4:4218': [(421, 262, 1)], 's4:4312': [(419, 265, 1)], 's4:4437': [(419, 264, 1)],
    's5:29477': [(422, 38, 1)], 's5:33433': [(120, 533, 1)], 's5:33779': [(121, 532, 1)],
    's5:34154': [(121, 533, 1)], 's5:34559': [(121, 533, 1)], 's5:34934': [(121, 533, 1)],
}
# Dice the detector missed or scored under 0.35
ADD = {
    's1:63329': [(359, 387, 0)], 's1:77075': [(226, 480, 0)], 's1:77575': [(225, 480, 0)],
    's4:9062': [(655, 65, 0), (657, 145, 0)],
    's5:29672': [(313, 547, 1)], 's5:29684': [(313, 549, 1)], 's5:30059': [(312, 546, 1)],
    's5:31595': [(358, 381, 0)], 's5:37311': [(366, 253, 0)],
}
# Peaks that are not dice
REMOVE = {'s3:38663': [(331, 411)], 's4:4667': [(202, 69)]}
IGNORE = {'s4:9312': [(360, 182), (346, 42)]}
HIDDEN = {'s5:31559': [(350, 384, 0, 'proof/s5-31559-hidden-die.png')],
          's5:35332': [(360, 222, 0, 'proof/s5-35332-die-under-arm.png')]}


def cube_truth(key):
    s, f = key.split(':'); f = int(f)
    if key == 's4:7562': return None  # held in the fingers on its way to the holder
    if s == 's1': return ('board', 2) if 83623 <= f < 84927 else ('holder', 64)
    if s == 's3': return ('board', 2) if 41300 <= f < 43000 else ('holder', 64)
    if s == 's4':
        if f < 5512: return ('white', 2)
        if f < 7604: return ('board', 4)
        return ('holder', 64)
    if s == 's5': return ('board', 2) if 41947 <= f < 44295 else ('holder', 64)


# The second test set (BG_TEST_SET=new, Nov 24 15:31): labelled blind (no model output shown) in
# TEST_DIR/notes-blind.txt, one line per frame: "dice Y(x,y) R(x,y) ... | cube ZONE FACE [(x,y)] | chk quiet|moving".
# A die colour written "?" or "?R" was settled on a zoom (RESOLVE, from the notes' last lines); ignore(x,y) marks a
# place that is neither a miss nor an extra. Quiet frames take their checkers from TEST_DIR/checkers-eye.json.
RESOLVE = {('s6:5125', 437, 207): 1, ('s6:5500', 437, 207): 1, ('s6:6625', 553, 497): 1, ('s6:6625', 473, 557): 1,
           ('s6:8500', 636, 529): 1, ('s6:9625', 324, 197): 0, ('s6:11125', 467, 541): 1}
EXTRA_NEW = {'s6:2875': {'ignore': [[345, 312]]}}
# s6:13750's "?second" die at (323,328) was dropped on Nov 25: a 5x zoom shows one die by the fingers (287-300,
# 307-315) and bare felt at (323,328). Faces: labels/faces-blind-new.json, [x, y, red, blind, checked] per die.
# blind: read by eye on 6x crops around each labelled die, no model output shown (null: not readable; 124 of 226).
# Checked against the published turn whose roll the checker play fixes (rollSource move/reviewed; the die belongs to
# its colour's last roll), the blind reads were right 67 of 90 times: a die seen from the side shows two bars for a
# 4, 5 or 6. checked (the label used): the roll's value for a double, the blind read when it is one of a non-double
# roll's two values, else null (88 dice).
# s6:20125's yellow die was labelled 5 from White's last published roll (5-5 at 17235), but it is a new roll between
# the games (one yellow and one red die land at 20125); at rest (20150-20200) it shows a single pip: checked 1 (Nov 25).
FACES = Path(__file__).parent / 'labels/faces-blind-new.json'


def main_new():
    items = json.loads((H.TEST_DIR / 'items.json').read_text())
    chk = json.loads((H.TEST_DIR / 'checkers-eye.json').read_text())
    notes = {l.split()[0]: l for l in (H.TEST_DIR / 'notes-blind.txt').read_text().splitlines() if l.startswith('s6:')}
    out = {}; last_cube_xy = None; faces = json.loads(FACES.read_text()) if FACES.exists() else {}
    for it in items:
        k = it['key']; note = notes[k]; dpart, cpart, kpart = note.split(' | ')
        dice, ignore = [], []
        for m in re.finditer(r'(ignore|\?R|[YR?])\((\d+),(\d+)\)', dpart):
            c, x, y = m.group(1), int(m.group(2)), int(m.group(3))
            if c == 'ignore': ignore.append([x, y]); continue
            if c in ('?', '?R'): c = 'YR'[RESOLVE[(k, x, y)]]
            dice.append([x, y, int(c == 'R')])
        e = EXTRA_NEW.get(k, {}); dice += e.get('dice', []); ignore += e.get('ignore', [])
        m = re.search(r'cube (holder|board|white|dark) (\d+)(?: \((\d+),(\d+)\))?', cpart)
        if m:
            if m.group(3): last_cube_xy = [int(m.group(3)), int(m.group(4))]
            cube = {'xy': last_cube_xy, 'zone': m.group(1), 'face': int(m.group(2))}
        else: cube = None
        fl = faces.get(k, [])
        face = [next((f[4] for f in fl if f[0] == x and f[1] == y and f[2] == c), None) for x, y, c in dice]
        out[k] = {'dice': dice, 'faces': face, 'hidden': [], 'ignore': ignore, 'cube': cube,
                  'checkers': chk.get(k) if 'chk quiet' in kpart else None, 'note': note}
    OUT.write_text(json.dumps(out, indent=0))
    print('frames', len(out), 'dice', sum(len(v['dice']) for v in out.values()), 'cube', sum(v['cube'] is not None for v in out.values()),
          'checker frames', sum(v['checkers'] is not None for v in out.values()))


def main():
    if H.TEST_SET == 'new': return main_new()
    items = json.loads((H.TEST_DIR / 'items.json').read_text())
    P = json.loads((H.TEST_DIR / 'proposals.json').read_text())
    notes = {}
    for line in (H.TEST_DIR / 'notes.txt').read_text().splitlines():
        if line.strip() and not line.startswith('#'): notes[line.split()[0]] = line
    out = {}
    for it in items:
        k = it['key']; p = P[k]; note = notes[k]
        dice = [[x, y, c] for x, y, c, sc in p['dice'] if sc >= THRESH]
        for mx, my, mc in MERGE.get(k, []):
            near = [d for d in dice if d[2] == mc and math.hypot(d[0] - mx, d[1] - my) < 20]
            assert len(near) >= 2, (k, near)
            top = max(near, key=lambda d: [q for q in p['dice'] if q[:3] == d][0][3])
            dice = [d for d in dice if d not in near] + [top]
        for rx, ry in REMOVE.get(k, []):
            n0 = len(dice); dice = [d for d in dice if math.hypot(d[0] - rx, d[1] - ry) > 8]; assert len(dice) == n0 - 1, k
        for ix, iy in IGNORE.get(k, []):
            dice = [d for d in dice if math.hypot(d[0] - ix, d[1] - iy) > 14]
        dice += [list(a) for a in ADD.get(k, [])]
        lab = {'dice': dice, 'hidden': [list(h) for h in HIDDEN.get(k, [])], 'ignore': [list(i) for i in IGNORE.get(k, [])]}
        ct = cube_truth(k)
        lab['cube'] = None if ct is None else {'xy': p['cube'][:2], 'zone': ct[0], 'face': ct[1]}
        chk = re.search(r'chk (\S+)', note).group(1)
        if chk.startswith('ok') and 'ok-unknown' not in chk:
            pos = json.loads(json.dumps(p['decoded']))
            if chk == 'ok-points': pos['barUnseen'] = True
            lab['checkers'] = pos
        elif chk == 'fix':
            pos = json.loads(json.dumps(p['decoded']))
            for m in re.finditer(r'(r?)p(\d+)=(\d+)', note):
                q = int(m.group(2)) - 1
                if m.group(1): q = (q - 12) % 24  # reader-view point on the turned Nov 23 board
                r = p['reader'][q]; v = int(m.group(3))
                assert r is not None and abs(r) == v, (k, q + 1, r, v)
                pos['points'][q] = r
            b = re.search(r'bar=(\d),(\d)', note)
            if b: pos['bar'] = [int(b.group(1)), int(b.group(2))]
            lab['checkers'] = pos
        else:
            lab['checkers'] = None
        if it['kind'] == 'turn': lab['roll'] = it['roll']
        lab['note'] = note
        out[k] = lab
    OUT.write_text(json.dumps(out, indent=0))
    n = len(out)
    print('frames', n, 'dice', sum(len(v['dice']) for v in out.values()), 'hidden', sum(len(v['hidden']) for v in out.values()),
          'cube', sum(v['cube'] is not None for v in out.values()), 'checker frames', sum(v['checkers'] is not None for v in out.values()))


if __name__ == '__main__':
    main()
