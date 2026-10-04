// Hidden-information cube solver for two players.
//
// Hands are private, so every cube decision is a game between ranges. The
// solver samples hands for both players (the actual hands, when known, are
// index 0 of their side), samples the unknown board cards (flops, then
// turn-and-river runouts), and runs counterfactual regret minimization
// (CFR+) over the whole tree of cube decisions that remain:
//
//   entry street: a raise chain (double; drop / take / beaver; drop / take /
//   raccoon; ... up to MAX_CUBE), then for every later cube street of the
//   variant another chain in every reachable cube state (no double, taken at
//   2x, 4x, ... with the matching owner), conditioned on everything before.
//
// Cube states whose level is beyond the modeled multipliers reuse the deepest
// modeled state's river play scaled to their level; their equilibrium reach is
// tiny. The solve runs until the counterfactual-regret bound on exploitability
// drops below the tolerance (or the iteration cap), then removes residual
// probability from options that are strictly worse than the best, so every
// reported mix is consistent with the reported equities. Equities are in
// points at the cube level of the decision, from the chooser's view, against
// the opponent's equilibrium range.
import { Board, splitHand, pairNet, FULL_DECK, variantOf, scoringOf, actorOn, holderAfter, STREETS, makeRng, binomial } from "./engine.mjs";
import { DROP_UNIT, MAX_CUBE, chainDepth, levelAfter, optionLabel } from "./cube-rules.mjs";

export const SOLVER_PRECISION = {
  fast: { label: "Fast", hands: { river: 180, flop: 90, preflop: 72 }, runouts: 24, flops: 8, boards: 36, multipliers: 2, iterations: 220, tolerance: 0.02 },
  standard: { label: "Standard", hands: { river: 280, flop: 110, preflop: 90 }, runouts: 36, flops: 12, boards: 48, multipliers: 3, iterations: 400, tolerance: 0.008 },
  deep: { label: "Deep", hands: { river: 400, flop: 150, preflop: 110 }, runouts: 56, flops: 20, boards: 72, multipliers: 4, iterations: 800, tolerance: 0.004 },
};
const UPDATE = 0,
  EVAL = 1;
const EPS_P = 1e-4; // opponent-reach floor so unreached nodes still get well-defined equities
const CLEAN_PROB = 0.01;
const EVENT_MASS_MIN = 1e-6; // product of both sides' mean reach below which a street state is skipped

/* ---------- sampling ---------- */
function maskPair(cards) {
  let lo = 0,
    hi = 0;
  for (const c of cards) {
    if (c < 26) lo |= 1 << c;
    else hi |= 1 << (c - 26);
  }
  return [lo, hi];
}
export function sampleHands(deck, n, rng, known = null) {
  const hands = [];
  if (known) hands.push(known.slice().sort((a, b) => b - a));
  const arr = deck.slice();
  const m = arr.length;
  while (hands.length < n) {
    for (let k = 0; k < 6; k++) {
      const i = k + Math.floor(rng() * (m - k));
      const t = arr[i];
      arr[i] = arr[k];
      arr[k] = t;
    }
    hands.push(arr.slice(0, 6).sort((a, b) => b - a));
  }
  return hands;
}
export function sampleCombos(deck, need, k, rng) {
  if (need === 0) return [[]];
  const total = binomial(deck.length, need);
  if (total <= k) {
    const out = [];
    const rec = (start, acc) => {
      if (acc.length === need) {
        out.push(acc.slice());
        return;
      }
      for (let i = start; i < deck.length; i++) {
        acc.push(deck[i]);
        rec(i + 1, acc);
        acc.pop();
      }
    };
    rec(0, []);
    return out;
  }
  const out = [];
  const seen = new Set();
  const arr = deck.slice();
  const m = arr.length;
  while (out.length < k) {
    for (let t = 0; t < need; t++) {
      const i = t + Math.floor(rng() * (m - t));
      const c = arr[i];
      arr[i] = arr[t];
      arr[t] = c;
    }
    const r = arr.slice(0, need).sort((a, b) => a - b);
    const key = r.join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}
export const sampleRunouts = sampleCombos;
// Split values of every hand on every full board (base + leaf cards). Invalid (card clash) entries are flagged.
function splitTable(hands, masks, base, leaves) {
  const n = hands.length,
    K = leaves.length;
  const values = new Int32Array(n * K * 3);
  const valid = new Uint8Array(n * K);
  const b = new Board();
  const cards = new Int32Array(6);
  for (let r = 0; r < K; r++) {
    const [rlo, rhi] = maskPair(leaves[r]);
    b.set(base.concat(leaves[r]));
    for (let i = 0; i < n; i++) {
      if (masks[i][0] & rlo || masks[i][1] & rhi) continue;
      valid[i * K + r] = 1;
      splitHand(hands[i], b, values.subarray((i * K + r) * 3, (i * K + r) * 3 + 3), cards);
    }
  }
  return { values, valid };
}

/* ---------- chain stage ---------- */
// Strategies for one street: for every cube state entering the street, every
// chance node (runout) and every hand, the mix at every chain node.
class ChainStage {
  constructor(states, K, n, dropUnit = DROP_UNIT) {
    this.states = states; // [{ base, owner, actorSide (null = no action), depth }]
    this.K = K;
    this.n = n;
    this.dropUnit = dropUnit;
    this.nMax = Math.max(n[0], n[1]);
    this.offset = new Int32Array(states.length);
    let size = 0;
    states.forEach((st, s) => {
      this.offset[s] = size;
      if (st.actorSide != null) size += (st.depth + 1) * K * this.nMax * 3;
    });
    this.size = size;
    this.reg = new Float64Array(size);
    this.avg = new Float64Array(size);
    this.evSum = new Float64Array(size);
    this.cfSum = new Float64Array(size);
    this.ownW = new Float64Array(size);
    this.aggReach = new Float64Array(states.length * 8);
    this.aggAct = new Float64Array(states.length * 8 * 3);
    this.sc = { p: new Float64Array(24), cf: new Float64Array(8), rA: new Float64Array(8), rB: new Float64Array(8), val: new Float64Array(8), b: new Int32Array(8) };
    this.cur = new Float64Array(size);
    this.stamp = new Int32Array(size / 3 + 1);
    this.passId = 0;
    this.perturb = false;
    this.useAvg = false;
    this.updateSide = -1; // -1: update both players; 0/1: alternating updates
    this.avgWeight = 1;
  }
  idx(s, k, r, h) {
    return this.offset[s] + ((k * this.K + r) * this.nMax + h) * 3;
  }
  nActs(st, k) {
    return k === 0 ? 2 : k < st.depth ? 3 : 2;
  }
  actorSideOf(s) {
    return this.states[s].actorSide;
  }
  side(st, k) {
    return (k & 1) === 0 ? st.actorSide : 1 - st.actorSide;
  }
  // Current mix at infoset b (3 entries written into out at o). The average
  // strategy is undefined at infosets the player never reaches; there the
  // regret-matched (current) mix is used, which is the learned best reply.
  mix(b, nActs, out, o) {
    if (!this.useAvg) {
      // Regret matching, frozen per pass: the first visit in a pass fixes the
      // mix so later regret updates in the same pass do not leak into it.
      const si = (b / 3) | 0;
      const cur = this.cur;
      if (this.stamp[si] !== this.passId) {
        const reg = this.reg;
        const s0 = Math.max(0, reg[b]),
          s1 = Math.max(0, reg[b + 1]),
          s2 = nActs === 3 ? Math.max(0, reg[b + 2]) : 0;
        const sum = s0 + s1 + s2;
        if (sum > 0) {
          cur[b] = s0 / sum;
          cur[b + 1] = s1 / sum;
          cur[b + 2] = s2 / sum;
        } else {
          const u = 1 / nActs;
          cur[b] = u;
          cur[b + 1] = u;
          cur[b + 2] = nActs === 3 ? u : 0;
        }
        this.stamp[si] = this.passId;
      }
      out[o] = cur[b];
      out[o + 1] = cur[b + 1];
      out[o + 2] = cur[b + 2];
      return;
    }
    let src = this.avg;
    let s0 = src[b],
      s1 = src[b + 1],
      s2 = nActs === 3 ? src[b + 2] : 0;
    let sum = s0 + s1 + s2;
    if (sum <= 0) {
      src = this.reg;
      s0 = Math.max(0, src[b]);
      s1 = Math.max(0, src[b + 1]);
      s2 = nActs === 3 ? Math.max(0, src[b + 2]) : 0;
      sum = s0 + s1 + s2;
    }
    if (sum > 0) {
      out[o] = s0 / sum;
      out[o + 1] = s1 / sum;
      out[o + 2] = s2 / sum;
    } else {
      const u = 1 / nActs;
      out[o] = u;
      out[o + 1] = u;
      out[o + 2] = nActs === 3 ? u : 0;
    }
  }
  clip() {
    const reg = this.reg;
    for (let i = 0; i < reg.length; i++) if (reg[i] < 0) reg[i] = 0;
  }
  resetEval() {
    this.evSum.fill(0);
    this.cfSum.fill(0);
    this.ownW.fill(0);
    this.aggReach.fill(0);
    this.aggAct.fill(0);
  }
  // Own reach of hand h (on `side`) to each outcome event of state s at chance
  // r: out[0] = no raise taken (stage ends unchanged), out[m] = raise m taken.
  outcomeReach(s, r, side, h, out, depth = null) {
    const st = this.states[s];
    out.fill(0);
    if (st.actorSide == null) {
      out[0] = 1;
      return out;
    }
    const D = depth ?? st.depth;
    const p = this.sc.p;
    const actor = side === st.actorSide;
    // node 0
    this.mix(this.idx(s, 0, r, h), 2, p, 0);
    if (actor) out[0] = p[0];
    else out[0] = 1;
    let prod = actor ? p[1] : 1; // own reach to node 1
    for (let m = 1; m <= D; m++) {
      const o = m;
      if (this.side(st, m) === side) {
        // My node: I take (outcome m) or re-raise (continue).
        const nA = this.nActs(st, m);
        this.mix(this.idx(s, m, r, h), nA, p, 0);
        const take = p[1],
          re = p[2];
        out[o] += prod * take;
        prod *= re;
      } else {
        // The opponent's node: if they take, my reach to outcome m is my path so far.
        out[o] += prod;
      }
      if (prod === 0) break;
    }
    return out;
  }
  // One chain instance. x: terminal net for the actor (used when ctab is
  // null); ctab: actor-view continuation per raise count k (0 = play on at
  // the base). Returns the actor-view value at node 0.
  walk(s, r, hA, hB, baseW, rA0, rB0, x, ctab, mode, t, baseOv = null, depthOv = null) {
    const st = this.states[s];
    const D = depthOv ?? st.depth,
      base = baseOv ?? st.base;
    const sc = this.sc;
    const p = sc.p,
      cf = sc.cf,
      RA = sc.rA,
      RB = sc.rB,
      val = sc.val,
      B = sc.b;
    const off = this.offset[s],
      K = this.K,
      nMax = this.nMax;
    const perturb = this.perturb;
    let rA = rA0,
      rB = rB0;
    // The entry reach is floored for counterfactual purposes so that a street
    // state nobody reaches yet still trains (otherwise an untrained reply there
    // can make the move leading to it look bad forever).
    let rAp = Math.max(rA0, EPS_P),
      rBp = Math.max(rB0, EPS_P);
    let needed = true,
      kmax = -1;
    for (let k = 0; k <= D; k++) {
      const aSide = (k & 1) === 0;
      const h = aSide ? hA : hB;
      const cfk = baseW * (aSide ? rBp : rAp);
      if (!needed && cfk <= 0) break;
      kmax = k;
      cf[k] = cfk;
      RA[k] = rA;
      RB[k] = rB;
      const b = off + ((k * K + r) * nMax + h) * 3;
      B[k] = b;
      const nA = k === 0 ? 2 : k < D ? 3 : 2;
      this.mix(b, nA, p, k * 3);
      if (k === D) break;
      const pAct = k === 0 ? p[1] : p[k * 3 + 2];
      needed = cfk > 0 || (needed && pAct > 0);
      const pp = perturb ? Math.max(pAct, EPS_P) : pAct;
      if (aSide) {
        rA *= pAct;
        rAp *= pp;
      } else {
        rB *= pAct;
        rBp *= pp;
      }
    }
    for (let k = kmax; k >= 0; k--) {
      const b = B[k],
        cfk = cf[k],
        aSide = (k & 1) === 0;
      const p0 = p[k * 3],
        p1 = p[k * 3 + 1],
        p2 = p[k * 3 + 2];
      let u0, u1, u2, v;
      if (k === 0) {
        u0 = ctab ? ctab[0] : x * base;
        u1 = kmax >= 1 ? val[1] : 0;
        u2 = 0;
        v = p0 * u0 + p1 * u1;
      } else {
        const prev = base * (1 << (k - 1)),
          L = base * (1 << k);
        u0 = aSide ? -this.dropUnit * prev : this.dropUnit * prev;
        u1 = ctab ? ctab[k] : x * L;
        u2 = k < kmax ? val[k + 1] : 0;
        v = p0 * u0 + p1 * u1 + p2 * u2;
      }
      val[k] = v;
      if (mode === UPDATE) {
        if (cfk > 0 && (this.updateSide < 0 || (aSide ? this.actorSideOf(s) : 1 - this.actorSideOf(s)) === this.updateSide)) {
          const sgn = aSide ? cfk : -cfk;
          const reg = this.reg;
          reg[b] += sgn * (u0 - v);
          reg[b + 1] += sgn * (u1 - v);
          if (k > 0 && k < D) reg[b + 2] += sgn * (u2 - v);
        }
        const ow = (aSide ? RA[k] : RB[k]) * this.avgWeight;
        if (ow > 0) {
          const avg = this.avg;
          avg[b] += ow * p0;
          avg[b + 1] += ow * p1;
          avg[b + 2] += ow * p2;
        }
      } else if (mode === EVAL) {
        if (cfk > 0) {
          const sgn = aSide ? cfk : -cfk;
          const ev = this.evSum;
          ev[b] += sgn * u0;
          ev[b + 1] += sgn * u1;
          if (k > 0 && k < D) ev[b + 2] += sgn * u2;
          this.cfSum[b] += cfk;
          this.ownW[b] = aSide ? RA[k] : RB[k];
        }
        const joint = baseW * RA[k] * RB[k];
        if (joint > 0) {
          const a = s * 8 + k;
          this.aggReach[a] += joint;
          this.aggAct[a * 3] += joint * p0;
          this.aggAct[a * 3 + 1] += joint * p1;
          this.aggAct[a * 3 + 2] += joint * p2;
        }
      }
    }
    return val[0];
  }
  // First-order exploitability from the EVAL sums: how much each player could
  // gain by changing one decision, weighted by how often that decision is
  // actually reached (own reach times the opponent's counterfactual reach).
  localRegret() {
    let total = 0;
    const p = new Float64Array(3);
    this.states.forEach((st, s) => {
      if (st.actorSide == null) return;
      for (let k = 0; k <= st.depth; k++) {
        const nA = this.nActs(st, k);
        const nh = this.n[this.side(st, k)];
        for (let r = 0; r < this.K; r++)
          for (let h = 0; h < nh; h++) {
            const b = this.idx(s, k, r, h);
            const c = this.cfSum[b];
            if (c <= 0) continue;
            const w = this.ownW[b] * c;
            if (w <= 0) continue;
            this.mix(b, nA, p, 0);
            let best = -Infinity,
              mixed = 0;
            for (let a = 0; a < nA; a++) {
              const e = this.evSum[b + a] / c;
              if (e > best) best = e;
              mixed += p[a] * e;
            }
            total += w * (best - mixed);
          }
      }
    });
    return total;
  }
  // Final strategies: the average strategy with residual probability below
  // CLEAN_PROB removed, and options whose equity (from the EVAL sums) trails
  // the best option by more than `deficit` per unit of the cube removed too
  // (the average strategy lags; such options cannot be in the support). At
  // infosets never reached the learned best reply is kept. Written into `avg`.
  clean(deficit = 0) {
    const p = new Float64Array(3);
    this.states.forEach((st, s) => {
      if (st.actorSide == null) return;
      for (let k = 0; k <= st.depth; k++) {
        const nA = this.nActs(st, k);
        const nh = this.n[this.side(st, k)];
        const scale = k === 0 ? st.base : st.base * (1 << (k - 1));
        for (let r = 0; r < this.K; r++)
          for (let h = 0; h < nh; h++) {
            const b = this.idx(s, k, r, h);
            this.mix(b, nA, p, 0);
            const c = this.cfSum[b];
            let bestEv = -Infinity;
            if (deficit > 0 && c > 0) {
              for (let a = 0; a < nA; a++) bestEv = Math.max(bestEv, this.evSum[b + a] / c);
              for (let a = 0; a < nA; a++) if (this.evSum[b + a] / c < bestEv - deficit * scale) p[a] = 0;
            }
            let sum = 0,
              bestA = 0;
            for (let a = 0; a < nA; a++) {
              if (p[a] < CLEAN_PROB) p[a] = 0;
              if (p[a] > p[bestA]) bestA = a;
              sum += p[a];
            }
            if (sum <= 0) {
              p.fill(0);
              p[bestA] = 1;
              sum = 1;
            }
            this.avg[b] = p[0] / sum;
            this.avg[b + 1] = p[1] / sum;
            this.avg[b + 2] = nA === 3 ? p[2] / sum : 0;
          }
      }
    });
  }
}

/* ---------- subgames ---------- */
// A continuation after the entry street: a flop stage (optional) and a river
// stage (optional) over the leaves (full boards) of one sampled flop, or a
// river stage over a set of sampled boards.
class Subgame {
  constructor(model, { flop = null, leaves, entryEvents, entryStates, hasFlop, hasRiver }) {
    this.model = model;
    const { hands, masks, n, pairs, variant, nMult } = model;
    this.flop = flop;
    this.base = flop ?? [];
    this.leaves = leaves;
    this.K = leaves.length;
    const [SB, SO] = [0, 1].map((side) => splitTable(hands[side], masks[side], this.base, leaves));
    const [flo, fhi] = maskPair(this.base);
    const gq = [];
    for (let q = 0; q < pairs.P; q++) {
      const i = pairs.I[q],
        j = pairs.J[q];
      if (masks[0][i][0] & flo || masks[0][i][1] & fhi || masks[1][j][0] & flo || masks[1][j][1] & fhi) continue;
      gq.push(q);
    }
    this.gq = Int32Array.from(gq);
    const Pl = gq.length;
    this.P = Pl;
    this.X = new Int8Array(Pl * this.K);
    this.cnt = new Uint16Array(Pl);
    this.V = new Float64Array(Pl);
    this.lw = new Float64Array(Pl);
    let wsum = 0;
    for (let l = 0; l < Pl; l++) {
      const q = gq[l],
        i = pairs.I[q],
        j = pairs.J[q];
      let c = 0,
        sum = 0;
      for (let r = 0; r < this.K; r++) {
        if (SB.valid[i * this.K + r] && SO.valid[j * this.K + r]) {
          const x = pairNet(SB.values, SO.values, (i * this.K + r) * 3, (j * this.K + r) * 3, model.scoring);
          this.X[l * this.K + r] = x;
          sum += x;
          c++;
        } else this.X[l * this.K + r] = -128;
      }
      this.cnt[l] = c;
      this.V[l] = c ? sum / c : 0;
      this.lw[l] = c ? pairs.pw[q] : 0;
      wsum += this.lw[l];
    }
    for (let l = 0; l < Pl; l++) this.lw[l] /= wsum || 1;
    // Entry events: every outcome of the entry chain (exact level and owner);
    // entryStates: the modeled states whose strategies the events share (event
    // m uses modeled state min(m, nMult - 1)).
    this.entryEvents = entryEvents;
    this.entryStates = entryStates;
    this.hasFlop = hasFlop;
    this.hasRiver = hasRiver;
    this.U = new Float64Array(entryEvents.length * Pl); // BTN-view value per entry event and local pair
    if (hasFlop) {
      const fs = entryStates.map((e) => stateFor(variant, "flop", e));
      this.flopStage = new ChainStage(fs, 1, n, model.dropUnit);
      this.flopStates = fs;
      // Flop events per entry event: (event index, flop raise count mf) -> modeled river state, actual level.
      this.flopEvents = entryEvents.map((ev) => {
        const fst = fs[Math.min(ev.m, nMult - 1)];
        const stateIdx = Math.min(ev.m, nMult - 1);
        const actorSide = actorOn(variant, "flop", 0, { level: ev.level, owner: ev.owner });
        const depth = actorSide == null ? 0 : chainDepth(ev.level);
        const events = [];
        for (let mf = 0; mf <= depth; mf++) events.push({ mf, level: levelAfter(ev.level, mf), owner: actorSide == null ? ev.owner : holderAfter(actorSide, mf), actorSide });
        return { stateIdx, state: fst, depth, actorSide, events };
      });
      if (hasRiver) {
        const rs = [];
        this.riverIndex = [];
        fs.forEach((f, e) => {
          const row = [];
          for (const o of outcomesOf(f, nMult)) {
            row.push(rs.length);
            rs.push(stateFor(variant, "river", o));
          }
          this.riverIndex.push(row);
        });
        this.riverStage = new ChainStage(rs, this.K, n, model.dropUnit);
        this.riverStates = rs;
        // River events: one per (entry event, flop event), sharing the modeled river state.
        this.riverEvents = [];
        this.flopEvents.forEach((fe, ei) => {
          fe.events.forEach((fev) => {
            const row = this.riverIndex[fe.stateIdx];
            const sIdx = row[Math.min(fev.mf, row.length - 1)];
            const actorSide = actorOn(variant, "river", 0, { level: fev.level, owner: fev.owner });
            this.riverEvents.push({ ei, mf: fev.mf, s: sIdx, level: fev.level, actorSide, depth: actorSide == null ? 0 : chainDepth(fev.level) });
          });
        });
        this.Ur = new Float64Array(this.riverEvents.length * Pl);
        this.riverReach = [0, 1].map((side) => new Float64Array(this.riverEvents.length * n[side]));
      }
    } else if (hasRiver) {
      const rs = entryStates.map((e) => stateFor(variant, "river", e));
      this.riverStage = new ChainStage(rs, this.K, n, model.dropUnit);
      this.riverStates = rs;
      this.riverEvents = entryEvents.map((ev, ei) => {
        const sIdx = Math.min(ev.m, nMult - 1);
        const actorSide = actorOn(variant, "river", 0, { level: ev.level, owner: ev.owner });
        return { ei, mf: 0, s: sIdx, level: ev.level, actorSide, depth: actorSide == null ? 0 : chainDepth(ev.level) };
      });
    }
    this.ctab = new Float64Array(8);
    this.outTmp = new Float64Array(8);
  }
  stages() {
    return [this.flopStage, this.riverStage].filter(Boolean);
  }
  // entryReach: per entry event: [Float64Array(N), Float64Array(M)] own reach of each hand.
  pass(mode, t, entryReach) {
    const { pairs, n } = this.model;
    const Pl = this.P,
      K = this.K;
    const I = pairs.I,
      J = pairs.J;
    const U = this.U;
    U.fill(0);
    // Total reach mass of an event on each side; events nobody reaches are valued cubeless.
    const massOf = (reachOf, ri, side) => {
      let m = 0;
      for (let h = 0; h < n[side]; h++) m += reachOf(ri, side, h);
      return m / n[side];
    };
    const riverPass = (events, reachOf, out) => {
      const rst = this.riverStage;
      events.forEach((rev, ri) => {
        const st = this.riverStates[rev.s];
        const sign = rev.actorSide === 0 ? 1 : -1;
        const dead = rev.actorSide != null && mode === UPDATE && massOf(reachOf, ri, 0) * massOf(reachOf, ri, 1) < EVENT_MASS_MIN;
        for (let l = 0; l < Pl; l++) {
          const c = this.cnt[l];
          if (!c) continue;
          const i = I[this.gq[l]],
            j = J[this.gq[l]];
          if (rev.actorSide == null || dead) {
            out[ri * Pl + l] = this.V[l] * rev.level;
            continue;
          }
          const hA = rev.actorSide === 1 ? j : i,
            hB = rev.actorSide === 1 ? i : j;
          const ra0 = reachOf(ri, rev.actorSide, hA),
            rb0 = reachOf(ri, 1 - rev.actorSide, hB);
          if (ra0 <= 0 && rb0 <= 0 && mode === UPDATE) {
            out[ri * Pl + l] = this.V[l] * rev.level;
            continue;
          }
          const baseW = this.lw[l] / c;
          let acc = 0;
          for (let r = 0; r < K; r++) {
            const xb = this.X[l * K + r];
            if (xb === -128) continue;
            acc += rst.walk(rev.s, r, hA, hB, baseW, ra0, rb0, sign * xb, null, mode, t, rev.level, rev.depth);
          }
          out[ri * Pl + l] = (sign * acc) / c;
        }
        void st;
      });
    };
    if (this.hasFlop) {
      const fst = this.flopStage;
      if (this.hasRiver) {
        const RR = this.riverReach;
        const out = this.outTmp;
        this.riverEvents.forEach((rev, ri) => {
          const fe = this.flopEvents[rev.ei];
          for (const side of [0, 1])
            for (let h = 0; h < n[side]; h++) {
              const er = entryReach[rev.ei][side][h];
              if (fe.actorSide == null) RR[side][ri * n[side] + h] = er;
              else {
                fst.outcomeReach(fe.stateIdx, 0, side, h, out, fe.depth);
                RR[side][ri * n[side] + h] = er * out[rev.mf];
              }
            }
        });
        riverPass(this.riverEvents, (ri, side, h) => RR[side][ri * n[side] + h], this.Ur);
      }
      // River event lookup per (entry event, flop raise count).
      const riverAt = new Map();
      if (this.hasRiver) this.riverEvents.forEach((rev, ri) => riverAt.set(rev.ei * 16 + rev.mf, ri));
      this.flopEvents.forEach((fe, ei) => {
        const sign = fe.actorSide === 0 ? 1 : -1;
        const dead = fe.actorSide != null && mode === UPDATE && massOf((ri, side, h) => entryReach[ri][side][h], ei, 0) * massOf((ri, side, h) => entryReach[ri][side][h], ei, 1) < EVENT_MASS_MIN;
        for (let l = 0; l < Pl; l++) {
          if (!this.cnt[l]) continue;
          const i = I[this.gq[l]],
            j = J[this.gq[l]];
          if (dead) {
            U[ei * Pl + l] = this.V[l] * this.entryEvents[ei].level;
            continue;
          }
          if (fe.actorSide == null) {
            U[ei * Pl + l] = this.hasRiver ? this.Ur[riverAt.get(ei * 16) * Pl + l] : this.V[l] * this.entryEvents[ei].level;
            continue;
          }
          const hA = fe.actorSide === 1 ? j : i,
            hB = fe.actorSide === 1 ? i : j;
          const ra0 = entryReach[ei][fe.actorSide][hA],
            rb0 = entryReach[ei][1 - fe.actorSide][hB];
          const ctab = this.ctab;
          for (let k = 0; k <= fe.depth; k++) ctab[k] = this.hasRiver ? sign * this.Ur[riverAt.get(ei * 16 + k) * Pl + l] : sign * this.V[l] * levelAfter(this.entryEvents[ei].level, k);
          const v0 = fst.walk(fe.stateIdx, 0, hA, hB, this.lw[l], ra0, rb0, 0, ctab, mode, t, this.entryEvents[ei].level, fe.depth);
          U[ei * Pl + l] = sign * v0;
        }
      });
    } else if (this.hasRiver) {
      riverPass(this.riverEvents, (ri, side, h) => entryReach[ri][side][h], U);
    } else {
      this.entryEvents.forEach((ev, ei) => {
        for (let l = 0; l < Pl; l++) U[ei * Pl + l] = this.V[l] * ev.level;
      });
    }
  }
}
// Outcome events of a chain at `state`: m = 0 unchanged, m >= 1 raise m taken.
function eventsOf(state) {
  if (state.actorSide == null) return [{ m: 0, level: state.base, owner: state.owner }];
  const out = [{ m: 0, level: state.base, owner: holderAfter(state.actorSide, 0) }];
  for (let m = 1; m <= state.depth; m++) out.push({ m, level: levelAfter(state.base, m), owner: holderAfter(state.actorSide, m) });
  return out;
}
function outcomesOf(state, nMult) {
  // Modeled outcome states of a chain at `state`: no raise (the option passes to
  // the opponent), then taken at 2x, 4x, ... (the taker holds the cube).
  if (state.actorSide == null) return [state];
  const out = [{ base: state.base, owner: holderAfter(state.actorSide, 0) }];
  for (let m = 1; m < nMult; m++) {
    const level = levelAfter(state.base, m);
    if (level > MAX_CUBE) break;
    out.push({ base: level, owner: holderAfter(state.actorSide, m) });
  }
  return out;
}
function stateFor(variant, street, s) {
  const actorSide = actorOn(variant, street, 0, { level: s.base, owner: s.owner });
  return { base: s.base, owner: s.owner, actorSide, depth: actorSide == null ? 0 : chainDepth(s.base) };
}
const stateKey = (st) => `${st.base}:${st.owner == null ? "c" : st.owner}`;

/* ---------- subgame host (runs in-process or inside a worker) ---------- */
// Holds a set of continuation subgames for a shared model. The coordinator
// drives it one pass at a time with the entry reach of every hand.
export class SubgameHost {
  constructor(modelSpec, subgameSpecs) {
    const { hands, weights, variant, nMult, entryOutcomes, entryEvents, board = [], dropUnit = DROP_UNIT, scoring = "classic" } = modelSpec;
    this.model = buildModel(hands, weights, variantOf(variant), nMult, board, dropUnit, scoringOf(scoring));
    this.entryOutcomes = entryOutcomes;
    this.entryEvents = entryEvents;
    this.subgames = subgameSpecs.map((g) => new Subgame(this.model, { flop: g.flop, leaves: g.leaves, entryEvents, entryStates: entryOutcomes.map((e) => ({ ...e })), hasFlop: g.hasFlop, hasRiver: g.hasRiver }));
    this.stages = this.subgames.flatMap((g) => g.stages());
    const P = this.model.pairs.P;
    this.U = new Float64Array(entryEvents.length * P);
    this.Ucnt = new Uint16Array(P);
    this.Vsum = new Float64Array(P);
    this.Vcnt = new Uint16Array(P);
    for (const g of this.subgames)
      for (let l = 0; l < g.P; l++)
        if (g.cnt[l]) {
          this.Vsum[g.gq[l]] += g.V[l];
          this.Vcnt[g.gq[l]]++;
        }
  }
  setMode({ useAvg, perturb, updateSide, passId, avgWeight }) {
    for (const st of this.stages) {
      st.useAvg = useAvg;
      st.perturb = perturb;
      st.updateSide = updateSide;
      st.passId = passId;
      st.avgWeight = avgWeight;
    }
  }
  // entryReach: array over outcomes of [Float64Array(N), Float64Array(M)].
  pass(mode, t, entryReach, modeSpec) {
    this.setMode(modeSpec);
    const P = this.model.pairs.P;
    const U = this.U,
      Ucnt = this.Ucnt;
    U.fill(0);
    Ucnt.fill(0);
    for (const g of this.subgames) {
      g.pass(mode, t, entryReach);
      for (let l = 0; l < g.P; l++) {
        if (!g.cnt[l]) continue;
        const q = g.gq[l];
        for (let o = 0; o < this.entryEvents.length; o++) U[o * P + q] += g.U[o * g.P + l];
        Ucnt[q]++;
      }
    }
    return { U, Ucnt };
  }
  clip() {
    for (const st of this.stages) st.clip();
  }
  resetEval() {
    for (const st of this.stages) st.resetEval();
  }
  regret() {
    let r = 0;
    for (const st of this.stages) r += st.localRegret();
    return r;
  }
  clean(deficit = 0) {
    for (const st of this.stages) st.clean(deficit);
  }
  aggregates() {
    const agg = {};
    const add = (street, stage, states) => {
      states.forEach((st, s) => {
        if (st.actorSide == null) return;
        const key = stateKey(st);
        if (!agg[street]) agg[street] = {};
        const nodes = [];
        for (let k = 0; k <= st.depth; k++) {
          const a = s * 8 + k;
          nodes.push({ k, side: stage.side(st, k), reach: stage.aggReach[a], act: [stage.aggAct[a * 3], stage.aggAct[a * 3 + 1], stage.aggAct[a * 3 + 2]] });
        }
        if (!agg[street][key]) agg[street][key] = { level: st.base, owner: st.owner, actorSide: st.actorSide, depth: st.depth, count: 0, nodes: nodes.map((nd) => ({ ...nd, act: [0, 0, 0], reach: 0 })) };
        const tgt = agg[street][key];
        tgt.count++;
        nodes.forEach((nd, k) => {
          tgt.nodes[k].reach += nd.reach;
          for (let x = 0; x < 3; x++) tgt.nodes[k].act[x] += nd.act[x];
        });
      });
    };
    for (const g of this.subgames) {
      if (g.flopStage) add("flop", g.flopStage, g.flopStates);
      if (g.riverStage) add("river", g.riverStage, g.riverStates);
    }
    return { agg, subgames: this.subgames.length };
  }
}
function buildModel(hands, weights, variant, nMult, board = [], dropUnit = DROP_UNIT, scoring = scoringOf("classic")) {
  const masks = hands.map((hs) => hs.map(maskPair));
  const n = [hands[0].length, hands[1].length];
  const wB = weights?.btn ?? null,
    wO = weights?.opp ?? null;
  // Hands that clash with the known board are impossible: weight 0.
  const [blo, bhi] = maskPair(board);
  const clash = (side, h) => Boolean(masks[side][h][0] & blo || masks[side][h][1] & bhi);
  const I = [],
    J = [],
    W = [];
  for (let i = 0; i < n[0]; i++)
    for (let j = 0; j < n[1]; j++) {
      if (masks[0][i][0] & masks[1][j][0] || masks[0][i][1] & masks[1][j][1]) continue;
      if (clash(0, i) || clash(1, j)) continue;
      const w = (wB ? wB[i] : 1) * (wO ? wO[j] : 1);
      if (w <= 0) continue;
      I.push(i);
      J.push(j);
      W.push(w);
    }
  const P = I.length;
  const pw = new Float64Array(W);
  let wsum = 0;
  for (let q = 0; q < P; q++) wsum += pw[q];
  for (let q = 0; q < P; q++) pw[q] /= wsum || 1;
  return { hands, masks, n, pairs: { I: Int32Array.from(I), J: Int32Array.from(J), P, pw }, variant, nMult, dropUnit, scoring };
}
// In-process executor: the same interface the worker pool exposes.
export function localExecutor() {
  let host = null;
  return {
    init(modelSpec, subgameSpecs) {
      host = new SubgameHost(modelSpec, subgameSpecs);
    },
    pass(mode, t, entryReach, modeSpec) {
      const { U, Ucnt } = host.pass(mode, t, entryReach, modeSpec);
      return { U: U.slice(), Ucnt: Ucnt.slice() };
    },
    clip() {
      host.clip();
    },
    resetEval() {
      host.resetEval();
    },
    regret() {
      return host.regret();
    },
    clean(deficit) {
      host.clean(deficit);
    },
    aggregates() {
      return host.aggregates();
    },
    free() {
      host = null;
    },
  };
}

/* ---------- solve ---------- */
// spec: { variant, board (0 | 3 | 5 cards), btnHand, oppHand, entry: {level, owner},
//         weights: {btnHands, oppHands, btn, opp}, precision, seed, overrides... }
// executors: optional array of executors (workers) that take the subgames;
// without them everything runs in-process.
export async function solve(spec, executors = null) {
  const t0 = Date.now();
  const p = SOLVER_PRECISION[spec.precision] ?? SOLVER_PRECISION.standard;
  const rng = makeRng(spec.seed ?? 12345);
  const variant = variantOf(spec.variant);
  const board = spec.board ?? [];
  const entryStreet = board.length === 0 ? "preflop" : board.length === 3 ? "flop" : "river";
  const streetsLeft = variant.streets.filter((s) => STREETS.indexOf(s) >= STREETS.indexOf(entryStreet));
  const entryCube = spec.entry ?? { level: 1, owner: null };
  const entryState = stateFor(variant, entryStreet, { base: entryCube.level, owner: entryCube.owner });
  const hasFlop = streetsLeft.includes("flop") && entryStreet === "preflop";
  const hasRiver = streetsLeft.includes("river") && entryStreet !== "river";
  const nMult = spec.multipliers ?? p.multipliers;
  const scoring = scoringOf(spec.scoring);
  const dropUnit = spec.dropUnit ?? scoring.defaultDrop;
  const deck = FULL_DECK.filter((c) => !board.includes(c));
  const handCount = spec.hands ?? p.hands[entryStreet];
  const btnHands = spec.weights?.btnHands ?? sampleHands(deck, handCount, rng, spec.btnHand);
  const oppHands = spec.weights?.oppHands ?? sampleHands(deck, handCount, rng, spec.oppHand);
  const hands = [btnHands, oppHands];
  const weights = spec.weights ? { btn: spec.weights.btn, opp: spec.weights.opp } : null;
  const model = buildModel(hands, weights, variant, nMult, board, dropUnit, scoring);
  const { n, pairs } = model;
  const { I, J, P, pw } = pairs;
  const entryOutcomes = (entryState.actorSide != null ? outcomesOf(entryState, nMult) : [entryState]).map((o) => ({ base: o.base, owner: o.owner }));
  const entryEvents = eventsOf(entryState);
  const nEv = entryEvents.length;
  // Chance structure → subgame specs.
  // Three-street solves carry a river stage inside every sampled flop; trim their runouts.
  const K2 = spec.runouts ?? (hasFlop && hasRiver ? Math.max(12, Math.round(p.runouts * 0.6)) : p.runouts);
  const subgameSpecs = [];
  let terminalX = null;
  if (entryStreet === "preflop") {
    if (hasFlop) {
      const flops = spec.flopSet ?? sampleCombos(deck, 3, spec.flops ?? p.flops, rng);
      for (const flop of flops) {
        const rest = deck.filter((c) => !flop.includes(c));
        subgameSpecs.push({ flop, leaves: sampleCombos(rest, 2, K2, rng), hasFlop: true, hasRiver });
      }
    } else {
      const leaves = sampleCombos(deck, 5, spec.boards ?? p.boards, rng);
      // Split the boards into groups so they can be spread across executors.
      const groups = Math.max(1, Math.min(executors?.length ?? 1, leaves.length));
      for (let g = 0; g < groups; g++) subgameSpecs.push({ flop: null, leaves: leaves.filter((_, i) => i % groups === g), hasFlop: false, hasRiver });
    }
  } else if (entryStreet === "flop") {
    const leaves = sampleCombos(deck, 2, K2, rng);
    const groups = Math.max(1, Math.min(executors?.length ?? 1, leaves.length));
    for (let g = 0; g < groups; g++) subgameSpecs.push({ flop: board, leaves: leaves.filter((_, i) => i % groups === g), hasFlop: false, hasRiver });
  } else {
    const [SB, SO] = [0, 1].map((side) => splitTable(hands[side], model.masks[side], board, [[]]));
    terminalX = new Float64Array(P);
    for (let q = 0; q < P; q++) terminalX[q] = pairNet(SB.values, SO.values, I[q] * 3, J[q] * 3, scoring);
  }
  // Executors: the subgames are distributed round-robin.
  const execs = subgameSpecs.length ? (executors && executors.length ? executors.slice(0, Math.min(executors.length, subgameSpecs.length)) : [localExecutor()]) : [];
  const modelSpec = { hands, weights, variant: variant.id, nMult, entryOutcomes, entryEvents, board, dropUnit, scoring: scoring.id };
  const execSubgames = execs.map(() => []);
  subgameSpecs.forEach((g, i) => execSubgames[i % execs.length].push(g));
  await Promise.all(execs.map((ex, i) => ex.init(modelSpec, execSubgames[i])));
  const subgameCount = subgameSpecs.length;
  const Vglobal = (q) => (nEv ? U[q] / entryEvents[0].level : 0); // event 0 keeps the level of entry; only for debugging
  // The entry stage (if the entry street has an action).
  const entryStage = entryState.actorSide != null ? new ChainStage([entryState], 1, n, dropUnit) : null;
  const fixedReach = [0, 1].map((side) => (side === 0 ? (weights?.btn ? Float64Array.from(weights.btn) : new Float64Array(n[0]).fill(1)) : weights?.opp ? Float64Array.from(weights.opp) : new Float64Array(n[1]).fill(1)));
  // Hands that clash with the known board can never be held here.
  {
    const [blo, bhi] = maskPair(board);
    for (const side of [0, 1]) for (let h = 0; h < n[side]; h++) if (model.masks[side][h][0] & blo || model.masks[side][h][1] & bhi) fixedReach[side][h] = 0;
  }
  const U = new Float64Array(nEv * P);
  const Ucnt = new Float64Array(P);
  const entryReach = entryEvents.map(() => [new Float64Array(n[0]), new Float64Array(n[1])]);
  const outTmp = new Float64Array(8);
  function computeEntryReach() {
    if (!entryStage) {
      for (const side of [0, 1]) entryReach[0][side].set(fixedReach[side]);
      return;
    }
    for (const side of [0, 1])
      for (let h = 0; h < n[side]; h++) {
        entryStage.outcomeReach(0, 0, side, h, outTmp);
        for (let o = 0; o < nEv; o++) entryReach[o][side][h] = fixedReach[side][h] * outTmp[o];
      }
  }
  let passCounter = 0;
  let modeSpec = null;
  function setMode(useAvg, perturb, updateSide = -1, t = 0) {
    passCounter++;
    const w = t > avgDelay ? Math.pow(t - avgDelay, avgPower) : 0;
    modeSpec = { useAvg, perturb, updateSide, passId: passCounter, avgWeight: w };
    if (entryStage) {
      entryStage.useAvg = useAvg;
      entryStage.perturb = perturb;
      entryStage.passId = passCounter;
      entryStage.updateSide = updateSide;
      entryStage.avgWeight = w;
    }
  }
  const avgDelay = spec.avgDelay ?? Math.min(20, Math.floor((spec.iterations ?? p.iterations) / 10));
  const avgPower = spec.avgPower ?? 2;
  async function runSubgames(mode, t) {
    if (!execs.length) return;
    const parts = await Promise.all(execs.map((ex) => ex.pass(mode, t, entryReach, modeSpec)));
    U.fill(0);
    Ucnt.fill(0);
    for (const part of parts) {
      for (let k = 0; k < U.length; k++) U[k] += part.U[k];
      for (let q = 0; q < P; q++) Ucnt[q] += part.Ucnt[q];
    }
    for (let q = 0; q < P; q++) {
      const c = Ucnt[q];
      for (let o = 0; o < nEv; o++) U[o * P + q] = c ? U[o * P + q] / c : 0;
    }
  }
  let entryValue = 0;
  const ctab = new Float64Array(8);
  function runEntry(mode, t) {
    if (!entryStage) return;
    const st = entryState;
    const sign = st.actorSide === 0 ? 1 : -1;
    entryValue = 0;
    for (let q = 0; q < P; q++) {
      const i = I[q],
        j = J[q];
      const hA = st.actorSide === 1 ? j : i,
        hB = st.actorSide === 1 ? i : j;
      const ra0 = fixedReach[st.actorSide][hA],
        rb0 = fixedReach[1 - st.actorSide][hB];
      let x = 0,
        tab = null;
      if (terminalX) x = sign * terminalX[q];
      else {
        tab = ctab;
        for (let k = 0; k <= st.depth; k++) tab[k] = sign * U[k * P + q];
      }
      const v0 = entryStage.walk(0, 0, hA, hB, pw[q], ra0, rb0, x, tab, mode, t);
      entryValue += pw[q] * sign * v0;
    }
  }
  async function evaluate(perturb) {
    setMode(true, perturb);
    if (entryStage) entryStage.resetEval();
    await Promise.all(execs.map((ex) => ex.resetEval()));
    computeEntryReach();
    await runSubgames(EVAL, 0);
    runEntry(EVAL, 0);
    let bound = entryStage ? entryStage.localRegret() : 0;
    const parts = await Promise.all(execs.map((ex) => ex.regret()));
    for (const r of parts) bound += r;
    return bound;
  }
  const iterations = spec.iterations ?? p.iterations;
  const tolerance = spec.tolerance ?? p.tolerance;
  const alternating = spec.alternating ?? true;
  let bound = Infinity,
    used = 0;
  for (let t = 1; t <= iterations; t++) {
    for (const side of alternating ? [0, 1] : [-1]) {
      setMode(false, false, side, t);
      computeEntryReach();
      await runSubgames(UPDATE, t);
      runEntry(UPDATE, t);
      if (entryStage) entryStage.clip();
      await Promise.all(execs.map((ex) => ex.clip()));
    }
    used = t;
    if (t >= 40 && t % 20 === 0) {
      bound = await evaluate(false);
      if (spec.debug) console.log(`  t=${t} bound=${bound.toFixed(4)} ${Date.now() - t0}ms`);
      if (bound < tolerance) break;
    }
    if (spec.onProgress) spec.onProgress(t, iterations);
  }
  if (!Number.isFinite(bound)) bound = await evaluate(false);
  // One conservative purification round: options clearly below the best cannot be in the support.
  const deficit = Math.max(0.1, 3 * bound);
  await evaluate(true);
  if (entryStage) entryStage.clean(deficit);
  await Promise.all(execs.map((ex) => ex.clean(deficit)));
  const cleanBound = await evaluate(false);
  await evaluate(true);
  /* ---------- report ---------- */
  const out = {
    entry: entryStreet,
    variant: variant.id,
    ms: 0,
    iterations: used,
    exploitability: bound,
    cleanedRegret: cleanBound,
    hands: { btn: btnHands, opp: oppHands },
    sampled: { pairs: P, flops: hasFlop ? subgameCount : 0, runouts: K2, multipliers: nMult },
    cube: { level: entryState.base, owner: entryState.owner },
    dropUnit,
    scoring: scoring.id,
  };
  if (entryStage) {
    const st = entryState;
    const nodes = [];
    const p3 = new Float64Array(3);
    // Prior mass of each actual hand (index 0 of its side), to turn cf sums into reach probabilities.
    const mass = [0, 0];
    for (let q = 0; q < P; q++) {
      if (I[q] === 0) mass[0] += pw[q];
      if (J[q] === 0) mass[1] += pw[q];
    }
    for (let k = 0; k <= st.depth; k++) {
      const side = entryStage.side(st, k);
      const nA = entryStage.nActs(st, k);
      const a = k;
      const reach = entryStage.aggReach[a];
      const ids = k === 0 ? ["noDouble", "double"] : ["drop", "take", "reraise"];
      const freq = {};
      for (let x = 0; x < nA; x++) freq[ids[x]] = reach > 0 ? entryStage.aggAct[a * 3 + x] / reach : 0;
      const b = entryStage.idx(0, k, 0, 0);
      entryStage.mix(b, nA, p3, 0);
      const c = entryStage.cfSum[b];
      const options = [];
      let best = -Infinity,
        mixed = 0;
      for (let x = 0; x < nA; x++) {
        const ev = c > 0 ? entryStage.evSum[b + x] / c : 0;
        options.push({ id: ids[x], label: optionLabel(ids[x], k, st.base, st.base, dropUnit), prob: p3[x], ev });
        if (ev > best) best = ev;
        mixed += p3[x] * ev;
      }
      const own = entryStage.ownW[b];
      const joint = Math.min(1, own) * Math.min(1, mass[side] > 0 ? c / mass[side] : 0);
      nodes.push({ k, side, offerLevel: levelAfter(st.base, k === 0 ? 1 : k), prevLevel: k === 0 ? st.base : levelAfter(st.base, k - 1), reach, freq, options, ownReach: own, joint, regret: Math.max(0, best - mixed), reached: joint > 1e-3 });
    }
    out.stage = { street: entryStreet, base: st.base, owner: st.owner, actorSide: st.actorSide, depth: st.depth, value: entryValue, nodes };
    // Consistency of the actual hands' displayed mixes, weighted by how often each node is actually reached.
    out.tolerance = Math.max(...nodes.map((nd) => nd.regret * nd.joint));
    out.reach = {};
    const tmp = new Float64Array(8);
    for (let k = 0; k <= st.depth; k++) {
      const lv = { base: levelAfter(st.base, k), owner: holderAfter(st.actorSide, k) };
      const r = { btn: new Array(n[0]).fill(0), opp: new Array(n[1]).fill(0), level: lv.base, owner: lv.owner };
      for (const side of [0, 1])
        for (let h = 0; h < n[side]; h++) {
          entryStage.outcomeReach(0, 0, side, h, tmp);
          r[side === 0 ? "btn" : "opp"][h] = fixedReach[side][h] * tmp[k];
        }
      out.reach[stateKey(lv)] = r;
    }
  } else {
    out.stage = null;
    out.tolerance = 0;
    out.reach = { [stateKey(entryState)]: { btn: Array.from(fixedReach[0]), opp: Array.from(fixedReach[1]), level: entryState.base, owner: entryState.owner } };
  }
  // Aggregated later-street play per cube state, averaged over the sampled flops / board groups.
  const aggParts = await Promise.all(execs.map((ex) => ex.aggregates()));
  const agg = {};
  for (const part of aggParts)
    for (const street of Object.keys(part.agg))
      for (const key of Object.keys(part.agg[street])) {
        const src = part.agg[street][key];
        if (!agg[street]) agg[street] = {};
        if (!agg[street][key]) agg[street][key] = { level: src.level, owner: src.owner, actorSide: src.actorSide, depth: src.depth, count: 0, nodes: src.nodes.map((nd) => ({ k: nd.k, side: nd.side, reach: 0, act: [0, 0, 0] })) };
        const tgt = agg[street][key];
        tgt.count += src.count;
        src.nodes.forEach((nd, k) => {
          tgt.nodes[k].reach += nd.reach;
          for (let x = 0; x < 3; x++) tgt.nodes[k].act[x] += nd.act[x];
        });
      }
  for (const street of Object.keys(agg))
    for (const key of Object.keys(agg[street])) {
      const tgt = agg[street][key];
      const c = tgt.count || 1;
      tgt.entry = tgt.nodes[0].reach / c;
      tgt.nodes = tgt.nodes.map((nd, k) => {
        const ids = k === 0 ? ["noDouble", "double"] : ["drop", "take", "reraise"];
        const freq = {};
        const nA = k === 0 ? 2 : k < tgt.depth ? 3 : 2;
        for (let x = 0; x < nA; x++) freq[ids[x]] = nd.reach > 0 ? nd.act[x] / nd.reach : 0;
        return { k, side: nd.side, offerLevel: levelAfter(tgt.level, k === 0 ? 1 : k), prevLevel: k === 0 ? tgt.level : levelAfter(tgt.level, k - 1), reach: nd.reach / c, freq };
      });
      delete tgt.count;
    }
  out.aggregates = agg;
  if (spec.debugU) {
    const meanU = [],
      meanV = [];
    for (let o = 0; o < nEv; o++) {
      let su = 0,
        sv = 0;
      for (let q = 0; q < P; q++) {
        su += pw[q] * U[o * P + q];
        sv += pw[q] * Vglobal(q) * entryEvents[o].level;
      }
      meanU.push(su);
      meanV.push(sv);
    }
    out.debug = { meanU, meanV };
  }
  await Promise.all(execs.map((ex) => ex.free()));
  out.ms = Date.now() - t0;
  return out;
}
