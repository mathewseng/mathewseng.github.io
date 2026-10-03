// Hidden-information cube solver for two players.
//
// Hands are private, so a cube decision is a game between ranges. The solver
// samples a set of possible hands for each player (the actual hands, when
// known, are index 0 of their side), samples turn-and-river runouts, and runs
// counterfactual regret minimization (CFR+) over the full decision tree:
//
//   flop:  button doubles or not; opponent drops / takes / beavers; button
//          takes or drops the beaver.
//   river: (variant "both") the non-button, as owner or with a centered cube,
//          redoubles or not with the same reply structure. Variant "river"
//          gives the button that river decision instead.
//
// Equities are in points at the current cube from the acting player's view.
// The result reports each actual hand's equilibrium strategy and the equity
// of every option against the opponent's equilibrium range, plus range
// frequencies and the weights needed to condition later streets on earlier
// cube actions.
import { Board, splitHand, pairNet, FULL_DECK, DROP_UNIT, VARIANTS, makeRng, binomial } from "./engine.mjs";

export const SOLVER_PRECISION = {
  fast: { label: "Fast", hands: 90, runouts: 32, iterations: 100 },
  standard: { label: "Standard", hands: 120, runouts: 44, iterations: 140 },
  deep: { label: "Deep", hands: 170, runouts: 72, iterations: 260 },
};
export const STATES = ["c1", "o2", "o4"]; // after no double / take / beaver-take
const STATE_LEVEL = { c1: 1, o2: 2, o4: 4 };

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
export function sampleRunouts(deck, need, k, rng) {
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
// Split values of every hand on every runout. Invalid (card clash) entries are flagged.
function splitTable(hands, board, runouts) {
  const n = hands.length,
    K = runouts.length;
  const values = new Int32Array(n * K * 3);
  const valid = new Uint8Array(n * K);
  const masks = hands.map(maskPair);
  const b = new Board();
  const cards = new Int32Array(6);
  for (let r = 0; r < K; r++) {
    const ro = runouts[r];
    const [rlo, rhi] = maskPair(ro);
    b.set(board.concat(ro));
    for (let i = 0; i < n; i++) {
      if (masks[i][0] & rlo || masks[i][1] & rhi) continue;
      valid[i * K + r] = 1;
      splitHand(hands[i], b, values.subarray((i * K + r) * 3, (i * K + r) * 3 + 3), cards);
    }
  }
  return { values, valid, masks };
}
const uniform = (n) => new Float64Array(n).fill(1 / n);
// An infoset the equilibrium never reaches keeps a uniform mix; show the best option instead.
function argmaxMix(obj, _labels, keys) {
  let best = keys[0];
  for (const k of keys) if (obj[k] > obj[best]) best = k;
  for (const k of keys) obj["p" + k[0].toUpperCase() + k.slice(1)] = k === best ? 1 : 0;
}

// spec: { board, variant, stage: "flop"|"river", btnHand, oppHand, level,
//         actorSide (river stage: 0 = button, 1 = opponent), weights:
//         { btnHands, oppHands, btn, opp } (optional, conditions the ranges),
//         precision, seed }
export function solve(spec) {
  const t0 = Date.now();
  const p = SOLVER_PRECISION[spec.precision] ?? SOLVER_PRECISION.standard;
  const rng = makeRng(spec.seed ?? 12345);
  const variant = VARIANTS[spec.variant];
  const board = spec.board;
  const stage = spec.stage;
  const deck = FULL_DECK.filter((c) => !board.includes(c));
  const hands = spec.hands ?? p.hands;
  const btnHands = spec.weights?.btnHands ?? sampleHands(deck, hands, rng, spec.btnHand);
  const oppHands = spec.weights?.oppHands ?? sampleHands(deck, hands, rng, spec.oppHand);
  const N = btnHands.length,
    M = oppHands.length;
  const need = 5 - board.length;
  const runouts = stage === "river" ? [[]] : sampleRunouts(deck, need, spec.runouts ?? p.runouts, rng);
  const K = runouts.length;
  const SB = splitTable(btnHands, board, runouts);
  const SO = splitTable(oppHands, board, runouts);
  // Pair table: X[(pair)*K + r] = net for the button, -128 when the runout clashes.
  const pairI = [],
    pairJ = [];
  const wB = spec.weights?.btn ?? uniform(N);
  const wO = spec.weights?.opp ?? uniform(M);
  for (let i = 0; i < N; i++)
    for (let j = 0; j < M; j++) {
      if (SB.masks[i][0] & SO.masks[j][0] || SB.masks[i][1] & SO.masks[j][1]) continue;
      if (wB[i] * wO[j] <= 0) continue;
      pairI.push(i);
      pairJ.push(j);
    }
  const P = pairI.length;
  const X = new Int8Array(P * K);
  const cnt = new Uint16Array(P);
  const pw = new Float64Array(P);
  let wsum = 0;
  for (let q = 0; q < P; q++) {
    const i = pairI[q],
      j = pairJ[q];
    let c = 0;
    for (let r = 0; r < K; r++) {
      if (SB.valid[i * K + r] && SO.valid[j * K + r]) {
        X[q * K + r] = pairNet(SB.values, SO.values, (i * K + r) * 3, (j * K + r) * 3);
        c++;
      } else X[q * K + r] = -128;
    }
    cnt[q] = c;
    pw[q] = c ? wB[i] * wO[j] : 0;
    wsum += pw[q];
  }
  for (let q = 0; q < P; q++) pw[q] /= wsum || 1;

  const hasFlop = stage === "flop";
  let states; // river states
  let riverActorSide;
  if (stage === "river") {
    states = [{ id: "now", level: spec.level ?? 1 }];
    riverActorSide = spec.actorSide ?? 0;
  } else if (variant.riverActor) {
    states = STATES.map((id) => ({ id, level: STATE_LEVEL[id] }));
    riverActorSide = variant.riverActor === "btn" ? 0 : 1;
  } else states = [];
  const S = states.length;
  const hasRiver = S > 0;
  const iterations = spec.iterations ?? p.iterations;
  const D = DROP_UNIT;

  // Flop infosets.
  const regSigN = new Float64Array(N),
    regSigD = new Float64Array(N),
    avgSigD = new Float64Array(N),
    avgSigW = new Float64Array(N);
  const regTau = new Float64Array(M * 3),
    avgTau = new Float64Array(M * 3);
  const regRhoT = new Float64Array(N),
    regRhoD = new Float64Array(N),
    avgRhoT = new Float64Array(N),
    avgRhoW = new Float64Array(N);
  // River infosets: actor side A (nA hands), responder side B (nB hands), per state and runout.
  const nA = riverActorSide === 0 ? N : M,
    nB = riverActorSide === 0 ? M : N;
  const RA = S * K * nA,
    RB = S * K * nB;
  const regAlN = new Float64Array(RA),
    regAlD = new Float64Array(RA),
    avgAlD = new Float64Array(RA),
    avgAlW = new Float64Array(RA);
  const regBe = new Float64Array(RB * 3),
    avgBe = new Float64Array(RB * 3);
  const regGaT = new Float64Array(RA),
    regGaD = new Float64Array(RA),
    avgGaT = new Float64Array(RA),
    avgGaW = new Float64Array(RA);
  // Current strategies.
  const sigD = new Float64Array(N),
    rhoT = new Float64Array(N),
    tau = new Float64Array(M * 3);
  const alD = new Float64Array(RA),
    gaT = new Float64Array(RA),
    be = new Float64Array(RB * 3);
  const U = new Float64Array(S * P); // river continuation per state and pair (button view)

  const rm2 = (ra, rb) => {
    const a = Math.max(0, ra),
      b = Math.max(0, rb);
    const s = a + b;
    return s > 0 ? a / s : 0.5;
  };
  function strategies(average) {
    for (let i = 0; i < N; i++) {
      sigD[i] = average ? (avgSigW[i] > 0 ? avgSigD[i] / avgSigW[i] : 0.5) : rm2(regSigD[i], regSigN[i]);
      rhoT[i] = average ? (avgRhoW[i] > 0 ? avgRhoT[i] / avgRhoW[i] : 0.5) : rm2(regRhoT[i], regRhoD[i]);
    }
    for (let j = 0; j < M; j++) rm3(average ? avgTau : regTau, tau, j, average);
    for (let k = 0; k < RA; k++) {
      alD[k] = average ? (avgAlW[k] > 0 ? avgAlD[k] / avgAlW[k] : 0.5) : rm2(regAlD[k], regAlN[k]);
      gaT[k] = average ? (avgGaW[k] > 0 ? avgGaT[k] / avgGaW[k] : 0.5) : rm2(regGaT[k], regGaD[k]);
    }
    for (let k = 0; k < RB; k++) rm3(average ? avgBe : regBe, be, k, average);
  }
  function rm3(src, dst, k, average) {
    const a = average ? src[k * 3] : Math.max(0, src[k * 3]);
    const b = average ? src[k * 3 + 1] : Math.max(0, src[k * 3 + 1]);
    const c = average ? src[k * 3 + 2] : Math.max(0, src[k * 3 + 2]);
    const s = a + b + c;
    if (s > 0) {
      dst[k * 3] = a / s;
      dst[k * 3 + 1] = b / s;
      dst[k * 3 + 2] = c / s;
    } else {
      dst[k * 3] = dst[k * 3 + 1] = dst[k * 3 + 2] = 1 / 3;
    }
  }
  // Reach of each side to a river state, from the flop strategies.
  const reachB = new Float64Array(S * N),
    reachO = new Float64Array(S * M);
  function computeReach() {
    for (let s = 0; s < S; s++) {
      const id = states[s].id;
      for (let i = 0; i < N; i++) reachB[s * N + i] = !hasFlop ? 1 : id === "c1" ? 1 - sigD[i] : id === "o2" ? sigD[i] : sigD[i] * rhoT[i];
      for (let j = 0; j < M; j++) reachO[s * M + j] = !hasFlop ? 1 : id === "c1" ? 1 : id === "o2" ? tau[j * 3 + 1] : tau[j * 3 + 2];
    }
  }
  // One pass over the tree. update: accumulate regrets and averages with weight t.
  function riverPass(update, t) {
    U.fill(0);
    for (let s = 0; s < S; s++) {
      const v = states[s].level;
      for (let q = 0; q < P; q++) {
        const i = pairI[q],
          j = pairJ[q];
        const p = pw[q];
        if (!p) continue;
        const rb = reachB[s * N + i],
          ro = reachO[s * M + j];
        const a = riverActorSide === 0 ? i : j; // actor hand index
        const b = riverActorSide === 0 ? j : i; // responder hand index
        const reachActor = riverActorSide === 0 ? rb : ro;
        const reachResp = riverActorSide === 0 ? ro : rb;
        const sign = riverActorSide === 0 ? 1 : -1;
        const inv = 1 / cnt[q];
        let acc = 0;
        for (let r = 0; r < K; r++) {
          const xb = X[q * K + r];
          if (xb === -128) continue;
          const x = sign * xb; // actor view
          const ka = (s * K + r) * nA + a,
            kb = (s * K + r) * nB + b;
          const aD = alD[ka],
            gT = gaT[ka];
          const bDrop = be[kb * 3],
            bTake = be[kb * 3 + 1],
            bBeav = be[kb * 3 + 2];
          const vN = x * v;
          const vBeaver = gT * 4 * v * x + (1 - gT) * -2 * D * v; // responder beavers: actor takes (4vx) or drops (-10v)
          const vD = bDrop * D * v + bTake * 2 * v * x + bBeav * vBeaver;
          const vNode = (1 - aD) * vN + aD * vD;
          acc += vNode;
          if (update) {
            const cfA = p * reachResp; // actor's counterfactual reach
            regAlN[ka] += cfA * (vN - vNode);
            regAlD[ka] += cfA * (vD - vNode);
            const wA = reachActor * t;
            avgAlD[ka] += wA * aD;
            avgAlW[ka] += wA;
            const cfB = p * reachActor * aD; // responder's counterfactual reach (responder utility = -actor)
            regBe[kb * 3] += cfB * (vD - D * v);
            regBe[kb * 3 + 1] += cfB * (vD - 2 * v * x);
            regBe[kb * 3 + 2] += cfB * (vD - vBeaver);
            const wBt = reachResp * aD * t;
            avgBe[kb * 3] += wBt * bDrop;
            avgBe[kb * 3 + 1] += wBt * bTake;
            avgBe[kb * 3 + 2] += wBt * bBeav;
            const cfG = cfA * bBeav;
            regGaT[ka] += cfG * (4 * v * x - vBeaver);
            regGaD[ka] += cfG * (-2 * D * v - vBeaver);
            const wG = reachActor * aD * bBeav * t;
            avgGaT[ka] += wG * gT;
            avgGaW[ka] += wG;
          }
        }
        U[s * P + q] = sign * acc * inv; // back to button view
      }
    }
  }
  // Flop continuation values for a pair (button view).
  const V = new Float64Array(P);
  for (let q = 0; q < P; q++) {
    let sum = 0;
    for (let r = 0; r < K; r++) if (X[q * K + r] !== -128) sum += X[q * K + r];
    V[q] = cnt[q] ? sum / cnt[q] : 0;
  }
  const contN = (q) => (hasRiver ? U[q] : V[q]);
  const contT = (q) => (hasRiver ? U[P + q] : 2 * V[q]);
  const contBT = (q) => (hasRiver ? U[2 * P + q] : 4 * V[q]);
  let value = 0;
  function flopPass(update, t) {
    value = 0;
    for (let q = 0; q < P; q++) {
      const i = pairI[q],
        j = pairJ[q];
      const p = pw[q];
      if (!p) continue;
      const cN = contN(q),
        cT = contT(q),
        cBT = contBT(q);
      const sD = sigD[i],
        rT = rhoT[i];
      const tDrop = tau[j * 3],
        tTake = tau[j * 3 + 1],
        tBeav = tau[j * 3 + 2];
      const vBeaver = rT * cBT + (1 - rT) * -2 * D;
      const vD = tDrop * D + tTake * cT + tBeav * vBeaver;
      const vRoot = (1 - sD) * cN + sD * vD;
      value += p * vRoot;
      if (update) {
        regSigN[i] += p * (cN - vRoot);
        regSigD[i] += p * (vD - vRoot);
        avgSigD[i] += t * sD;
        avgSigW[i] += t;
        const cfT = p * sD;
        regTau[j * 3] += cfT * (vD - D);
        regTau[j * 3 + 1] += cfT * (vD - cT);
        regTau[j * 3 + 2] += cfT * (vD - vBeaver);
        avgTau[j * 3] += t * tDrop;
        avgTau[j * 3 + 1] += t * tTake;
        avgTau[j * 3 + 2] += t * tBeav;
        const cfR = p * tBeav;
        regRhoT[i] += cfR * (cBT - vBeaver);
        regRhoD[i] += cfR * (-2 * D - vBeaver);
        avgRhoT[i] += t * sD * rT;
        avgRhoW[i] += t * sD;
      }
    }
  }
  function clip(arr) {
    for (let k = 0; k < arr.length; k++) if (arr[k] < 0) arr[k] = 0;
  }
  for (let t = 1; t <= iterations; t++) {
    strategies(false);
    computeReach();
    if (hasRiver) riverPass(true, t);
    if (hasFlop) flopPass(true, t);
    for (const arr of [regSigN, regSigD, regTau, regRhoT, regRhoD, regAlN, regAlD, regBe, regGaT, regGaD]) clip(arr);
  }
  // Final pass with average strategies.
  strategies(true);
  computeReach();
  if (hasRiver) riverPass(false, 0);
  if (hasFlop) flopPass(false, 0);

  /* ---------- report ---------- */
  const pB = new Float64Array(N),
    pO = new Float64Array(M);
  for (let q = 0; q < P; q++) {
    pB[pairI[q]] += pw[q];
    pO[pairJ[q]] += pw[q];
  }
  const out = { stage, variant: spec.variant, ms: 0, hands: { btn: btnHands, opp: oppHands }, sampled: { pairs: P, runouts: K, iterations } };
  if (hasFlop) {
    // Button's options with its actual hand (index 0), responder's with theirs.
    let evN = 0,
      evD = 0,
      wi = 0;
    let evTake = 0,
      evBeav = 0,
      wj = 0;
    let evBT = 0,
      wbt = 0;
    let fD = 0,
      fDrop = 0,
      fTake = 0,
      fBeav = 0,
      fBT = 0;
    for (let q = 0; q < P; q++) {
      const i = pairI[q],
        j = pairJ[q],
        p = pw[q];
      const cN = contN(q),
        cT = contT(q),
        cBT = contBT(q);
      const rT = rhoT[i];
      const vBeaver = rT * cBT + (1 - rT) * -2 * D;
      const tDrop = tau[j * 3],
        tTake = tau[j * 3 + 1],
        tBeav = tau[j * 3 + 2];
      const vD = tDrop * D + tTake * cT + tBeav * vBeaver;
      if (i === 0) {
        evN += p * cN;
        evD += p * vD;
        wi += p;
        const pb = p * tBeav;
        evBT += pb * cBT;
        wbt += pb;
      }
      if (j === 0) {
        const post = p * sigD[i];
        evTake += post * cT;
        evBeav += post * vBeaver;
        wj += post;
      }
      fD += p * sigD[i];
      fDrop += p * sigD[i] * tDrop;
      fTake += p * sigD[i] * tTake;
      fBeav += p * sigD[i] * tBeav;
      fBT += p * sigD[i] * tBeav * rT;
    }
    const resp = { pDrop: tau[0], pTake: tau[1], pBeaver: tau[2], drop: -D, take: wj ? -evTake / wj : 0, beaver: wj ? -evBeav / wj : 0 };
    if (avgTau[0] + avgTau[1] + avgTau[2] === 0) argmaxMix(resp, ["Drop", "Take", "Beaver"], ["drop", "take", "beaver"]);
    const reply = { pTake: rhoT[0], take: wbt ? evBT / wbt : 0, drop: -2 * D };
    if (avgRhoW[0] === 0) reply.pTake = reply.take >= reply.drop ? 1 : 0;
    out.flop = {
      level: 1,
      actorSide: 0,
      value,
      actor: { pDouble: sigD[0], noDouble: wi ? evN / wi : 0, double: wi ? evD / wi : 0 },
      responder: resp,
      beaverReply: reply,
      freq: { double: fD, drop: fD ? fDrop / fD : 0, take: fD ? fTake / fD : 0, beaver: fD ? fBeav / fD : 0, beaverTake: fBeav ? fBT / fBeav : 0 },
    };
    // Reach weights per river state for conditioning later streets.
    out.reach = {};
    for (const id of STATES) {
      const b = new Float64Array(N),
        o = new Float64Array(M);
      for (let i = 0; i < N; i++) b[i] = (id === "c1" ? 1 - sigD[i] : id === "o2" ? sigD[i] : sigD[i] * rhoT[i]) * (pB[i] > 0 ? 1 : 0);
      for (let j = 0; j < M; j++) o[j] = (id === "c1" ? 1 : id === "o2" ? tau[j * 3 + 1] : tau[j * 3 + 2]) * (pO[j] > 0 ? 1 : 0);
      out.reach[id] = { btn: Array.from(b), opp: Array.from(o) };
    }
    out.strategy = { btnDouble: Array.from(sigD), oppDrop: Array.from({ length: M }, (_, j) => tau[j * 3]), oppTake: Array.from({ length: M }, (_, j) => tau[j * 3 + 1]), oppBeaver: Array.from({ length: M }, (_, j) => tau[j * 3 + 2]), btnBeaverTake: Array.from(rhoT) };
  }
  if (hasRiver) {
    // Frequencies of river actions per state, weighted by reach; and for a
    // single-runout river solve, the actual hands' option equities.
    out.river = {};
    for (let s = 0; s < S; s++) {
      const v = states[s].level;
      let reach = 0,
        fD = 0,
        fDrop = 0,
        fTake = 0,
        fBeav = 0,
        fGT = 0;
      let evN = 0,
        evD = 0,
        wa = 0,
        evTake = 0,
        evBeav = 0,
        wb = 0,
        evGT = 0,
        wg = 0,
        val = 0;
      for (let q = 0; q < P; q++) {
        const i = pairI[q],
          j = pairJ[q];
        const p = pw[q] * reachB[s * N + i] * reachO[s * M + j];
        if (!p) continue;
        const a = riverActorSide === 0 ? i : j,
          b = riverActorSide === 0 ? j : i;
        const sign = riverActorSide === 0 ? 1 : -1;
        const inv = 1 / cnt[q];
        for (let r = 0; r < K; r++) {
          const xb = X[q * K + r];
          if (xb === -128) continue;
          const x = sign * xb;
          const ka = (s * K + r) * nA + a,
            kb = (s * K + r) * nB + b;
          const aD = alD[ka],
            gT = gaT[ka];
          const bDrop = be[kb * 3],
            bTake = be[kb * 3 + 1],
            bBeav = be[kb * 3 + 2];
          const vN = x * v;
          const vBeaver = gT * 4 * v * x + (1 - gT) * -2 * D * v;
          const vD = bDrop * D * v + bTake * 2 * v * x + bBeav * vBeaver;
          const pr = p * inv;
          reach += pr;
          fD += pr * aD;
          fDrop += pr * aD * bDrop;
          fTake += pr * aD * bTake;
          fBeav += pr * aD * bBeav;
          fGT += pr * aD * bBeav * gT;
          val += pr * ((1 - aD) * vN + aD * vD);
          if (a === 0) {
            evN += pr * vN;
            evD += pr * vD;
            wa += pr;
            evGT += pr * bBeav * 4 * v * x;
            wg += pr * bBeav;
          }
          if (b === 0) {
            evTake += pr * aD * 2 * v * x;
            evBeav += pr * aD * vBeaver;
            wb += pr * aD;
          }
        }
      }
      const k0 = (s * K + 0) * nA + 0,
        kb0 = (s * K + 0) * nB + 0;
      const resp = K === 1 ? { pDrop: be[kb0 * 3], pTake: be[kb0 * 3 + 1], pBeaver: be[kb0 * 3 + 2], drop: -D * v, take: wb ? -evTake / wb : 0, beaver: wb ? -evBeav / wb : 0 } : null;
      if (resp && avgBe[kb0 * 3] + avgBe[kb0 * 3 + 1] + avgBe[kb0 * 3 + 2] === 0) argmaxMix(resp, ["Drop", "Take", "Beaver"], ["drop", "take", "beaver"]);
      const reply = K === 1 ? { pTake: gaT[k0], take: wg ? evGT / wg : 0, drop: -2 * D * v } : null;
      if (reply && avgGaW[k0] === 0) reply.pTake = reply.take >= reply.drop ? 1 : 0;
      const act = K === 1 ? { pDouble: alD[k0], noDouble: wa ? evN / wa : 0, double: wa ? evD / wa : 0 } : null;
      if (act && avgAlW[k0] === 0) act.pDouble = act.double > act.noDouble ? 1 : 0;
      out.river[states[s].id] = {
        level: v,
        actorSide: riverActorSide,
        reach,
        value: reach ? val / reach : 0, // actor view
        freq: { double: reach ? fD / reach : 0, drop: fD ? fDrop / fD : 0, take: fD ? fTake / fD : 0, beaver: fD ? fBeav / fD : 0, beaverTake: fBeav ? fGT / fBeav : 0 },
        actor: act,
        responder: resp,
        beaverReply: reply,
      };
    }
  }
  out.ms = Date.now() - t0;
  return out;
}
