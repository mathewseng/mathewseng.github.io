"""Hand-state reading: a placed OFC card never moves until the hand is cleared, so a card named while it was
fully visible keeps that name after later cards cover it. Offline version over scan_state.py output."""
import json, math, sys, numpy as np
from collections import Counter
CODES = [s + r for s in 'SHCD' for r in 'A23456789TJQK']

def gate(p1, p2, prob=0.8, margin=0.3):
    p = (p1 + p2) / 2; o = np.argsort(-p); top = int(o[0])
    if top == 52 or p[top] < prob or p[top] - p[o[1]] < margin: return None
    if int(p1.argmax()) != top or int(p2.argmax()) != top or min(p1[top], p2[top]) < prob: return None
    return CODES[top]

def angdiff(a, b):
    d = abs(a - b) % 180; return min(d, 180 - d)

class HandState:
    def __init__(self, dist=12, ang=12, gap_named=12.0, gap=4.0, swap_reads=2, min_votes=1, purity=0.8):
        self.__dict__.update(dist=dist, ang=ang, gap_named=gap_named, gap=gap, swap_reads=swap_reads,
                             min_votes=min_votes, purity=purity)
        self.tracks, self.n = [], 0

    def _new(self, t, b):
        tr = dict(id=self.n, x=b['x'], y=b['y'], deg=b['deg'], first=t, last=t, votes=Counter(), name=None, pend=None, npend=0)
        self.n += 1; self.tracks.append(tr); return tr

    def update(self, t, bodies):
        """bodies: dicts with x, y, deg, conf and optional 'read' (gated single-view name or None).
        Sets b['track'] and b['carried'] (the track's name, or None)."""
        self.tracks = [tr for tr in self.tracks if t - tr['last'] <= (self.gap_named if tr['name'] else self.gap)]
        cand = []
        for bi, b in enumerate(bodies):
            for ti, tr in enumerate(self.tracks):
                e = math.hypot(b['x'] - tr['x'], b['y'] - tr['y'])
                if e < self.dist and angdiff(b['deg'], tr['deg']) < self.ang: cand.append((e, bi, ti))
        ub, ut = {}, set()
        for e, bi, ti in sorted(cand):
            if bi in ub or ti in ut: continue
            ub[bi] = ti; ut.add(ti)
        live = list(self.tracks)
        for bi, b in enumerate(bodies):
            tr = live[ub[bi]] if bi in ub else self._new(t, b)
            r = b.get('read')
            if r and tr['name'] and r != tr['name']:
                # a different confident card on the same spot: after swap_reads in a row, it is a new card
                tr['npend'] = tr['npend'] + 1 if tr['pend'] == r else 1; tr['pend'] = r
                if tr['npend'] >= self.swap_reads:
                    tr['last'] = t - 1e6  # retire
                    tr = self._new(t, b); tr['votes'][r] += self.swap_reads
                    r = None
            elif r:
                tr['pend'], tr['npend'] = None, 0
            if r: tr['votes'][r] += 1
            tr.update(x=b['x'], y=b['y'], deg=b['deg'], last=t)
            if tr['votes']:
                top, n = tr['votes'].most_common(1)[0]
                tr['name'] = top if n >= self.min_votes and n >= self.purity * sum(tr['votes'].values()) else None
            b['track'], b['carried'] = tr['id'], tr['name']
        # one copy per identity across the live table (one deck per hand): keep the best-supported track
        best = {}
        for tr in self.tracks:
            if tr['name'] and t - tr['last'] < 1e5:
                if tr['name'] not in best or tr['votes'][tr['name']] > best[tr['name']]['votes'][tr['name']]: best[tr['name']] = tr
        bad = {tr['id'] for tr in self.tracks if tr['name'] and t - tr['last'] < 1e5 and best[tr['name']] is not tr}
        for b in bodies:
            if b['track'] in bad: b['carried'] = None; b['dupe'] = True
        return bodies

def inside(px, py, b, shrink=0.8):
    a = math.radians(b['deg']); dx, dy = px - b['x'], py - b['y']
    u = dx * math.cos(a) + dy * math.sin(a); v = -dx * math.sin(a) + dy * math.cos(a)
    return abs(u) <= b['w'] / 2 * shrink and abs(v) <= b['h'] / 2 * shrink

class AnchoredHandState:
    """Each placed card is a slot anchored where it was first seen (median of its matched views). A body
    belongs to a slot only within `dist` px of the anchor, so a fanned card placed 10+ px over it starts its own slot.
    A named slot stays alive while some detected body covers its anchor (cards fanned over it), up to `gap_named`
    seconds without any cover; unnamed slots live `gap` seconds without a matched view."""
    def __init__(self, dist=6, ang=8, gap=4.0, gap_named=12.0, swap_reads=2, min_votes=2, purity=0.8, mean_prob=0.8,
                 strip_prob=0.7, strip_margin=0.3, strip_agree=0.7, strip_min=5, empty_secs=3.0):
        self.__dict__.update(dist=dist, ang=ang, gap=gap, gap_named=gap_named, swap_reads=swap_reads,
                             min_votes=min_votes, purity=purity, mean_prob=mean_prob, strip_prob=strip_prob,
                             strip_margin=strip_margin, strip_agree=strip_agree, strip_min=strip_min, empty_secs=empty_secs)
        self.slots, self.n = [], 0
        self.hand = {}; self.hand_no = 0; self.empty_since = None  # names seen this hand -> slot id

    def _strip(self, sl):
        ps = sl['cov'][-60:]
        if len(ps) < self.strip_min: return None
        m = np.mean(ps, 0); o = np.argsort(-m); top = int(o[0])
        if top == 52 or m[top] < self.strip_prob or m[top] - m[o[1]] < self.strip_margin: return None
        if np.mean([int(p.argmax()) == top for p in ps]) < self.strip_agree: return None
        return CODES[top]

    def _new(self, t, b):
        sl = dict(id=self.n, xs=[(b['x'], b['y'], b['deg'], b['w'], b['h'])], x=b['x'], y=b['y'], deg=b['deg'], w=b['w'], h=b['h'], first=t, last=t, seen=t,
                  votes=Counter(), name=None, pend=None, npend=0, dead=False, psum=np.zeros(53), vsum=None, pn=0, vn=0, cov=[])
        self.n += 1; self.slots.append(sl); return sl

    def update(self, t, bodies, cover=None):
        cover = bodies if cover is None else cover
        if sum(1 for b in bodies if b['conf'] >= 0.25) <= 1:
            self.empty_since = t if self.empty_since is None else self.empty_since
            if t - self.empty_since >= self.empty_secs and self.hand: self.hand = {}; self.hand_no += 1
        else:
            self.empty_since = None
        for sl in self.slots:
            if sl['dead']: continue
            if any(inside(sl['x'], sl['y'], c) for c in cover): sl['last'] = t
            keep = sl['name'] or sl['seen'] - sl['first'] >= 2.5  # named, or placed: survives while something covers it
            if t - sl['seen'] > (self.gap_named if keep else self.gap) and t - sl['last'] > self.gap: sl['dead'] = True
            elif not keep and t - sl['seen'] > self.gap: sl['dead'] = True
        self.slots = [sl for sl in self.slots if not sl['dead']]
        cand = []
        for bi, b in enumerate(bodies):
            for si, sl in enumerate(self.slots):
                e = math.hypot(b['x'] - sl['x'], b['y'] - sl['y'])
                if e < self.dist and angdiff(b['deg'], sl['deg']) < self.ang: cand.append((e, bi, si))
        ub, us = {}, set()
        for e, bi, si in sorted(cand):
            if bi in ub or si in us: continue
            ub[bi] = si; us.add(si)
        live = list(self.slots)
        for bi, b in enumerate(bodies):
            sl = live[ub[bi]] if bi in ub else self._new(t, b)
            r = b.get('read')
            if r and sl['name'] and r != sl['name']:
                sl['npend'] = sl['npend'] + 1 if sl['pend'] == r else 1; sl['pend'] = r
                if sl['npend'] >= self.swap_reads:
                    sl['dead'] = True
                    sl = self._new(t, b); sl['votes'][r] += self.swap_reads; r = None
            elif r:
                sl['pend'], sl['npend'] = None, 0
            if 'p' in b: sl['psum'] = sl['psum'] + b['p']; sl['pn'] += 1; sl['cov'].append(b['p'])
            if r: sl['votes'][r] += 1; sl['vrecent'] = sl['cov'][-10:]
            sl['xs'].append((b['x'], b['y'], b['deg'], b['w'], b['h'])); sl['xs'] = sl['xs'][-50:]
            m = np.median(np.array(sl['xs']), 0)
            sl.update(x=float(m[0]), y=float(m[1]), deg=float(m[2]), w=float(m[3]), h=float(m[4]), seen=t, last=t)
            if sl['votes']:
                top, n = sl['votes'].most_common(1)[0]
                # the vote winner must also lead the slot's mean probabilities over its views up to the latest vote
                # (an ornate ace read as a 7 twice in 40 views loses here)
                ok = n >= self.min_votes and n >= self.purity * sum(sl['votes'].values())
                if sl.get('vrecent'):
                    # the name must lead the median of the slot's last 10 views up to the latest vote, at >= mean_prob
                    # (an ornate ace read as a 7 at 0.81 twice among views at 0.77 stays unnamed)
                    m = np.median(np.array(sl['vrecent']), 0)
                    ok = ok and int(m.argmax()) == CODES.index(top) and m[CODES.index(top)] >= self.mean_prob
                sl['name'] = top if ok else None
            b['track'], b['carried'] = sl['id'], sl['name']
            if b.get('read') and sl['name'] and b['read'] != sl['name']: b['carried'] = None  # pending swap: say nothing
        self.slots = [sl for sl in self.slots if not sl['dead']]
        byname = {}
        for sl in sorted(self.slots, key=lambda sl: -sl['seen']):
            if not sl['name']: continue
            keep = byname.get(sl['name'])
            if keep is None: byname[sl['name']] = sl; continue
            if math.hypot(keep['x'] - sl['x'], keep['y'] - sl['y']) < 30:  # same card, moved: fold the older slot in
                keep['votes'].update(sl['votes']); sl['dead'] = True
        self.slots = [sl for sl in self.slots if not sl['dead']]
        best = {}
        for sl in self.slots:
            if sl['name'] and (sl['name'] not in best or sl['votes'][sl['name']] > best[sl['name']]['votes'][sl['name']]): best[sl['name']] = sl
        bad = {sl['id'] for sl in self.slots if sl['name'] and best[sl['name']] is not sl}
        for sl in self.slots:
            if sl['name'] and sl['id'] not in bad and sl['name'] not in self.hand: self.hand[sl['name']] = sl['id']
        for b in bodies:
            if b['track'] in bad: b['carried'] = None; b['dupe'] = True
        # strip reads for unnamed slots: vetoed when the name was already seen this hand on another slot, and
        # dropped when two unnamed slots strip-read the same card
        strips = {}
        for sl in self.slots:
            if sl['name'] or sl['id'] in bad: continue
            v = self._strip(sl)
            if v and self.hand.get(v, sl['id']) == sl['id']: strips.setdefault(v, []).append(sl['id'])
        strip_of = {ids[0]: v for v, ids in strips.items() if len(ids) == 1}
        named_here = {b['carried'] for b in bodies if b['carried']}
        for b in bodies:
            b['strip'] = strip_of.get(b['track']) if not b['carried'] else None
            single = b.get('read') if (b.get('read') and not b.get('dupe') and self.hand.get(b['read'], b['track']) == b['track']
                                      and b['read'] not in named_here) else None
            b['single'] = single if not b['carried'] else None
            b['name'] = b['carried'] or b['strip'] or b['single']
        return bodies

def load(session, tag='v3'):
    z = np.load(f'../scan/{session}/probs-{tag}.npz')
    P = {n: (a.astype(np.float32), b.astype(np.float32)) for n, a, b in zip(z['names'], z['p1'], z['p2'])}
    rows = [json.loads(l) for l in open(f'../scan/{session}/state.jsonl')]
    return rows, P

def run(session, tag='v3', min_conf=0.25, anchored=True, **kw):
    rows, P = load(session, tag); hs = (AnchoredHandState if anchored else HandState)(**kw); out = []
    for r in rows:
        bodies = [dict(d) for d in r['dets'] if d['conf'] >= min_conf]
        cover = [d for d in r['dets'] if d['conf'] >= 0.1]
        for b in bodies:
            if 'crop' in b:
                b['read'] = gate(*P[b['crop']]); b['p'] = (P[b['crop']][0] + P[b['crop']][1]) / 2
        # one copy per identity within the frame for single reads
        seen = {}
        for b in sorted(bodies, key=lambda b: -(P[b['crop']][0].max() + P[b['crop']][1].max()) if 'crop' in b else 0):
            if b.get('read'):
                if b['read'] in seen: b['read'] = None
                else: seen[b['read']] = 1
        (hs.update(r['t'], bodies, cover) if anchored else hs.update(r['t'], bodies))
        slots = [dict(id=sl['id'], x=sl['x'], y=sl['y'], w=sl['w'], h=sl['h'], deg=sl['deg'], first=sl['first'], name=sl['name'],
                      seen=sl['seen'] == r['t']) for sl in hs.slots] if anchored else []
        out.append(dict(t=r['t'], bodies=bodies, slots=slots))
    return out
