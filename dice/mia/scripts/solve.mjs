// Solves heads-up Mia exactly: a Nash equilibrium for the chance of winning the match.
// Usage: node dice/mia/scripts/solve.mjs
//
// Structure. With two players left, a round is a chain of subgames G(p): someone rolls in secret
// and must announce a value above p (p = null opens the round). Nothing earlier matters to G(p):
// the dice before it were discarded unseen, and lives only change when the round ends. So G(p) is
// a one-shot signalling game. The announcer's type is the roll (every roll at or below p is the
// same "bust" type: any announcement is a bluff), the move is a value v > p, and the decider,
// seeing only v, calls or believes (concedes, at Mia). Believing hands the decider G(v) as its
// announcer. Payoffs are the chance of winning the match, so they come from the values of later
// rounds: the loser of a round starts the next, and every round costs a life, so V(a, b) (the
// opener's chance with a lives against b) needs only positions with fewer lives in total.
//
// Each G(p) is solved by linear programming (announcer's maximin over behaviour strategies, dense
// simplex with Bland's rule). The decider's minimax calling chances are the LP's dual prices. The
// strategies are rounded and written to data/mia-equilibrium.json; exploitability() then measures
// the rounded table by exact best responses over the whole match, for both seats.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const RANKING = [31, 32, 41, 42, 43, 51, 52, 53, 54, 61, 62, 63, 64, 65, 11, 22, 33, 44, 55, 66, 21];
export const MAX_LIVES = 6;
const TOP = RANKING.length - 1;
const MIA = TOP;
const chance = (r) => (RANKING[r] % 11 === 0 ? 1 : 2) / 36;
const DIGITS = 4; // strategy probabilities in the table
const EPS = 1e-10;
// Trembles: the solver's announcer makes every legal announcement at least this often (a
// perturbed game, so calls answer off-path claims sensibly). engine.mjs uses the same posterior.
export const TREMBLE = 1e-6;

// ---------- Linear programming ----------
// maximize c·x subject to rows { a, op: '<=' | '=', b >= 0 }, x >= 0. Returns x, the value and the
// dual price of every row.
export function simplex(c, rows) {
  const n = c.length;
  const m = rows.length;
  const slack = [];
  const art = [];
  let width = n;
  rows.forEach((row, i) => { slack[i] = row.op === '<=' ? width++ : -1; });
  rows.forEach((row, i) => { art[i] = row.op === '=' ? width++ : -1; });
  const T = rows.map((row, i) => {
    if (row.b < 0) throw new Error('rhs must be non-negative');
    const line = new Float64Array(width + 1);
    line.set(row.a);
    if (slack[i] >= 0) line[slack[i]] = 1;
    if (art[i] >= 0) line[art[i]] = 1;
    line[width] = row.b;
    return line;
  });
  const basis = rows.map((_, i) => (slack[i] >= 0 ? slack[i] : art[i]));
  const isArt = new Uint8Array(width);
  art.forEach((j) => { if (j >= 0) isArt[j] = 1; });

  const pivot = (r, j, obj) => {
    const row = T[r];
    const p = row[j];
    for (let k = 0; k <= width; k += 1) row[k] /= p;
    for (let i = 0; i < m; i += 1) {
      if (i === r) continue;
      const f = T[i][j];
      if (Math.abs(f) < 1e-15) continue;
      const line = T[i];
      for (let k = 0; k <= width; k += 1) line[k] -= f * row[k];
    }
    const f = obj[j];
    if (Math.abs(f) > 1e-15) for (let k = 0; k <= width; k += 1) obj[k] -= f * row[k];
    basis[r] = j;
  };
  const run = (obj, allowed) => {
    for (let guard = 0; guard < 100000; guard += 1) {
      let enter = -1;
      for (let j = 0; j < width; j += 1) if (allowed(j) && obj[j] < -1e-11) { enter = j; break; } // Bland
      if (enter < 0) return;
      let leave = -1;
      let best = Infinity;
      for (let i = 0; i < m; i += 1) {
        const a = T[i][enter];
        if (a > 1e-11) {
          const ratio = T[i][width] / a;
          if (ratio < best - 1e-12 || (Math.abs(ratio - best) <= 1e-12 && basis[i] < basis[leave])) { best = ratio; leave = i; }
        }
      }
      if (leave < 0) throw new Error('unbounded LP');
      pivot(leave, enter, obj);
    }
    throw new Error('simplex did not converge');
  };

  // Phase 1: drive the artificial variables to zero.
  const obj1 = new Float64Array(width + 1);
  for (let i = 0; i < m; i += 1) if (art[i] >= 0) for (let k = 0; k <= width; k += 1) obj1[k] -= T[i][k];
  art.forEach((j) => { if (j >= 0) obj1[j] = 0; });
  run(obj1, () => true);
  if (obj1[width] < -1e-9) throw new Error('infeasible LP');
  for (let i = 0; i < m; i += 1) {
    if (!isArt[basis[i]]) continue;
    for (let j = 0; j < width; j += 1) if (!isArt[j] && Math.abs(T[i][j]) > 1e-9) { pivot(i, j, obj1); break; }
  }
  // Phase 2: the real objective, artificials barred from entering.
  const obj = new Float64Array(width + 1);
  for (let j = 0; j < n; j += 1) obj[j] = -c[j];
  for (let i = 0; i < m; i += 1) {
    const cb = basis[i] < n ? c[basis[i]] : 0;
    if (cb) for (let k = 0; k <= width; k += 1) obj[k] += cb * T[i][k];
  }
  run(obj, (j) => !isArt[j]);
  const x = new Float64Array(n);
  for (let i = 0; i < m; i += 1) if (basis[i] < n) x[basis[i]] = T[i][width];
  const duals = rows.map((_, i) => obj[slack[i] >= 0 ? slack[i] : art[i]]);
  return { x, value: obj[width], duals };
}

// ---------- The game ----------
// The announcer's types in G(p): index 0 is the bust type (any roll at or below p) when p is not
// null, then one type per value above p.
export function typesAt(p) {
  const floor = p < 0 ? -1 : p;
  const types = [];
  if (floor >= 0) {
    let bust = 0;
    for (let r = 0; r <= floor; r += 1) bust += chance(r);
    types.push({ rank: floor, prob: bust, bust: true });
  }
  for (let r = floor + 1; r <= TOP; r += 1) types.push({ rank: r, prob: chance(r), bust: false });
  return types;
}

// The values that may be announced over p (ranks).
export const movesAt = (p) => RANKING.map((_, r) => r).filter((r) => r > p);

// Payoffs for the player with `mine` lives against `theirs`, given V (V[a][b]: opener's chance).
export function stakes(V, mine, theirs) {
  const meLose = (k) => (mine - k <= 0 ? 0 : V[mine - k][theirs]);
  const themLose = (k) => (theirs - k <= 0 ? 1 : 1 - V[theirs - k][mine]);
  return { meLose, themLose };
}

// C(t, v): the announcer's chance when v is called with type t.
const calledValue = (S, type, v) => (type.rank >= v ? S.themLose(v === MIA ? 2 : 1) : S.meLose(1));

export function solve() {
  const L = MAX_LIVES;
  const V = Array.from({ length: L + 1 }, () => new Float64Array(L + 1));
  // G[a][b][p + 1]: announcer's chance in G(p) with a lives against b; p = -1 is the opening.
  const G = Array.from({ length: L + 1 }, () => Array.from({ length: L + 1 }, () => new Float64Array(TOP + 1)));
  const nodes = Array.from({ length: L + 1 }, () => Array.from({ length: L + 1 }, () => []));
  let lps = 0;
  let gap = 0;
  for (let total = 2; total <= 2 * L; total += 1) {
    const pairs = [];
    for (let a = 1; a <= L; a += 1) { const b = total - a; if (b >= 1 && b <= L) pairs.push([a, b]); }
    for (let p = TOP - 1; p >= -1; p -= 1) {
      for (const [a, b] of pairs) {
        const S = stakes(V, a, b);
        const types = typesAt(p);
        const moves = movesAt(p);
        // Believing v hands the decider G(v); conceding Mia costs the decider a life.
        const believed = moves.map((v) => (v === MIA ? S.themLose(1) : 1 - G[b][a][v + 1]));
        const nT = types.length;
        const nV = moves.length;
        const width = nT * nV + nV;
        const c = new Float64Array(width);
        for (let v = 0; v < nV; v += 1) c[nT * nV + v] = 1;
        const rows = [];
        for (let v = 0; v < nV; v += 1) {
          const call = new Float64Array(width);
          const trust = new Float64Array(width);
          call[nT * nV + v] = 1;
          trust[nT * nV + v] = 1;
          types.forEach((type, t) => {
            call[t * nV + v] = -type.prob * calledValue(S, type, moves[v]);
            trust[t * nV + v] = -type.prob * believed[v];
          });
          // x = TREMBLE + x′: every type makes every announcement a little, so every value is on
          // the path and the decider's answer to it is a best response to a real posterior.
          let callFloor = 0;
          let trustFloor = 0;
          types.forEach((type) => {
            callFloor += TREMBLE * type.prob * calledValue(S, type, moves[v]);
            trustFloor += TREMBLE * type.prob * believed[v];
          });
          rows.push({ a: call, op: '<=', b: callFloor }, { a: trust, op: '<=', b: trustFloor });
        }
        types.forEach((_, t) => {
          const a = new Float64Array(width);
          for (let v = 0; v < nV; v += 1) a[t * nV + v] = 1;
          rows.push({ a, op: '=', b: 1 - nV * TREMBLE });
        });
        const { x, value, duals } = simplex(c, rows);
        lps += 1;
        // The decider's calling chance at v: α / (α + β) from the dual prices.
        const calls = moves.map((_, v) => {
          const alpha = Math.max(0, duals[2 * v]);
          const beta = Math.max(0, duals[2 * v + 1]);
          return alpha + beta > EPS ? alpha / (alpha + beta) : 0;
        });
        const mixes = types.map((_, t) => moves.map((__, v) => TREMBLE + Math.max(0, x[t * nV + v])));
        // The decider's guarantee from its LP dual (μ): how far the two LPs disagree.
        let guarantee = 0;
        types.forEach((type, t) => {
          let top = 0;
          moves.forEach((mv, v) => { top = Math.max(top, calls[v] * calledValue(S, type, mv) + (1 - calls[v]) * believed[v]); });
          guarantee += type.prob * top;
        });
        gap = Math.max(gap, guarantee - value);
        G[a][b][p + 1] = value;
        nodes[a][b][p + 1] = { calls, mixes };
      }
    }
    for (const [a, b] of pairs) V[a][b] = G[a][b][0];
  }
  return { V, G, nodes, lps, gap };
}

const round = (value, digits) => Number(value.toFixed(digits));

// Rounds a mixed strategy to DIGITS while keeping it a distribution.
function roundMix(mix) {
  const scale = 10 ** DIGITS;
  const units = mix.map((p) => Math.floor(p * scale + 1e-9));
  let missing = scale - units.reduce((s, u) => s + u, 0);
  const order = mix.map((p, i) => [p * scale - units[i], i]).sort((x, y) => y[0] - x[0]);
  for (let k = 0; missing > 0; k += 1, missing -= 1) units[order[k % order.length][1]] += 1;
  return units.map((u) => u / scale);
}

// The published table. For lives "a,b" and every p (index p + 1, 0 = the opening):
//   y: the decider's calling chance for each value above p (in ladder order),
//   x: per announcer type (bust first when p ≥ 0, then each value above p) the announcements it
//      makes as [rank, chance] pairs.
// `g` holds G(p) for the announcer. Values are recomputed by the engine from y, x and g.
export function toTable(solution) {
  const lives = {};
  for (let a = 1; a <= MAX_LIVES; a += 1) {
    for (let b = 1; b <= MAX_LIVES; b += 1) {
      const nodes = solution.nodes[a][b].map((node, i) => {
        const p = i - 1;
        const moves = movesAt(p);
        return {
          y: node.calls.map((y) => round(Math.min(1, Math.max(0, y)), DIGITS)),
          x: node.mixes.map((mix) => {
            const shares = roundMix(mix.map((q) => (q < 5e-5 ? 0 : q)).map((q, _, all) => q / all.reduce((s, z) => s + z, 0)));
            return shares.flatMap((q, v) => (q > 0 ? [[moves[v], q]] : []));
          }),
        };
      });
      lives[`${a},${b}`] = { g: Array.from(solution.G[a][b], (g) => round(g, 7)), nodes };
    }
  }
  return { version: 1, maxLives: MAX_LIVES, ranking: RANKING, lives };
}


// ---------- Exploitability ----------
// Exact best responses to the table's strategy, over the whole match. Returns, for every start
// (a, b), how much a best-responding opener and a best-responding second player gain over the
// table's own value; exploitability is their sum (zero at an exact equilibrium).
export function exploitability(table) {
  const L = table.maxLives;
  const node = (a, b, p) => table.lives[`${a},${b}`].nodes[p + 1];
  // W[a][b]: the best responder's chance with a lives against b (the table plays b), when the
  // best responder opens (W.open) or the table opens (W.second).
  const open = Array.from({ length: L + 1 }, () => new Float64Array(L + 1));
  const second = Array.from({ length: L + 1 }, () => new Float64Array(L + 1));
  const self = Array.from({ length: L + 1 }, () => new Float64Array(L + 1)); // table vs table
  for (let total = 2; total <= 2 * L; total += 1) {
    const pairs = [];
    for (let a = 1; a <= L; a += 1) { const b = total - a; if (b >= 1 && b <= L) pairs.push([a, b]); }
    // B[me][them][p+1]: best responder's chance in G(p) as announcer (BA) or decider (BD).
    const BA = new Map();
    const BD = new Map();
    const SA = new Map(); // table vs table, announcer's chance
    const key = (a, b, p) => `${a},${b},${p}`;
    // Best responder losing k / the table losing k.
    const brMe = (me, them) => ({
      meLose: (k) => (me - k <= 0 ? 0 : open[me - k][them]),
      themLose: (k) => (them - k <= 0 ? 1 : second[me][them - k]),
    });
    const selfStakes = (me, them) => ({
      meLose: (k) => (me - k <= 0 ? 0 : self[me - k][them]),
      themLose: (k) => (them - k <= 0 ? 1 : 1 - self[them - k][me]),
    });
    for (let p = TOP - 1; p >= -1; p -= 1) {
      for (const [me, them] of pairs) {
        const types = typesAt(p);
        const moves = movesAt(p);
        // Best responder announces against the table's calling chances at (me, them).
        {
          const S = brMe(me, them);
          const { y } = node(me, them, p);
          let total2 = 0;
          for (const type of types) {
            let top = 0;
            moves.forEach((v, i) => {
              const trust = v === MIA ? S.themLose(1) : BD.get(key(me, them, v));
              const value = y[i] * calledValue(S, type, v) + (1 - y[i]) * trust;
              if (value > top) top = value;
            });
            total2 += type.prob * top;
          }
          BA.set(key(me, them, p), total2);
        }
        // The table announces (with them lives against me); the best responder decides.
        {
          const S = brMe(me, them);
          const { x } = node(them, me, p);
          const mass = new Map();
          types.forEach((type, t) => {
            for (const [v, q] of x[t]) {
              const entry = mass.get(v) || { q: 0, truth: 0 };
              entry.q += type.prob * q;
              if (type.rank >= v) entry.truth += type.prob * q;
              mass.set(v, entry);
            }
          });
          let total2 = 0;
          for (const [v, { q, truth }] of mass) {
            const call = truth * S.meLose(v === MIA ? 2 : 1) + (q - truth) * S.themLose(1);
            const trust = v === MIA ? q * S.meLose(1) : q * BA.get(key(me, them, v));
            total2 += Math.max(call, trust);
          }
          BD.set(key(me, them, p), total2);
        }
        // Table against itself, for the reference value.
        {
          const S = selfStakes(me, them);
          const { x } = node(me, them, p);
          const { y } = node(them, me, p);
          let total2 = 0;
          types.forEach((type, t) => {
            for (const [v, q] of x[t]) {
              const i = moves.indexOf(v);
              const trust = v === MIA ? S.themLose(1) : 1 - SA.get(key(them, me, v));
              total2 += type.prob * q * (y[i] * calledValue(S, type, v) + (1 - y[i]) * trust);
            }
          });
          SA.set(key(me, them, p), total2);
        }
      }
    }
    for (const [me, them] of pairs) {
      open[me][them] = BA.get(key(me, them, -1));
      second[me][them] = BD.get(key(me, them, -1));
      self[me][them] = SA.get(key(me, them, -1));
    }
  }
  const starts = [];
  let worst = 0;
  for (let a = 1; a <= L; a += 1) {
    for (let b = 1; b <= L; b += 1) {
      // Opener best responds (gain over self[a][b]) plus second seat best responds.
      const value = self[a][b];
      const exploit = (open[a][b] - value) + (second[b][a] - (1 - value));
      starts.push({ a, b, value, open: open[a][b], second: second[b][a], exploit });
      worst = Math.max(worst, exploit);
    }
  }
  return { starts, worst, at: (a, b) => starts.find((s) => s.a === a && s.b === b) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const started = Date.now();
  const solution = solve();
  const table = toTable(solution);
  const outDir = new URL('../data/', import.meta.url);
  mkdirSync(outDir, { recursive: true });
  const json = JSON.stringify(table);
  writeFileSync(new URL('mia-equilibrium.json', outDir), json);
  const check = exploitability(table);
  console.log(`${solution.lps} LPs in ${((Date.now() - started) / 1000).toFixed(1)} s; largest primal/dual gap ${solution.gap.toExponential(2)}`);
  console.log(`opener's chance: 6 v 6 ${(solution.V[6][6] * 100).toFixed(3)}%, 3 v 3 ${(solution.V[3][3] * 100).toFixed(3)}%`);
  for (const [a, b] of [[6, 6], [3, 3], [1, 1]]) {
    const s = check.at(a, b);
    console.log(`${a} v ${b}: table value ${(s.value * 100).toFixed(4)}%, best-response gains ${((s.open - s.value) * 100).toFixed(5)} + ${((s.second - 1 + s.value) * 100).toFixed(5)} points`);
  }
  console.log(`worst exploitability over all starts: ${(check.worst * 100).toExponential(3)} points`);
  console.log(`wrote data/mia-equilibrium.json (${(json.length / 1024).toFixed(1)} KB)`);
}

