// Solves heads-up Liar’s Dice rounds exactly (CFR+) and writes the equilibrium
// to ../data/endgame.json for the best-move strip and the Hard bot.
//
//   node dice/liars-dice/scripts/endgame.mjs [iterations]
//
// A round is a two-player zero-sum game: exactly one player loses a die. The
// opener (A) holds `a` dice and the other player (B) holds `b`. Each holds a
// multiset of dice drawn with its chance; a history is a strictly increasing
// run of bids, so it is the set of bids made (a bitmask). The solver runs CFR+
// with alternating updates and linear averaging, then checks the average
// strategy with an exact best response (exploitability).
//
// The file keeps, for every decision a player can face where the opponent’s
// equilibrium play reaches the history at least 0.5% of the time (rarer lines
// fall back to the estimate): games[key].table[history in base 36][hand] is a
// string with four characters per action (Liar first, then each raise in
// order): the chance to lose a die against the opponent’s equilibrium play,
// then the equilibrium’s chance of taking it, each in thousandths, base 36.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { diceOutcomes } from '../../table-core.mjs';

const here = dirname(fileURLToPath(import.meta.url));

export function makeGame(a, b, wild) {
  const low = wild ? 2 : 1;
  const total = a + b;
  const bids = [];
  for (let quantity = 1; quantity <= total; quantity += 1) for (let face = low; face <= 6; face += 1) bids.push({ quantity, face });
  const handsOf = (n) => diceOutcomes(n).map(({ dice, p }) => ({
    dice,
    p,
    m: [0, 1, 2, 3, 4, 5, 6].map((face) => (face ? dice.filter((d) => d === face || (wild && face !== 1 && d === 1)).length : 0)),
  }));
  const hands = [handsOf(a), handsOf(b)];
  // lossA[bid][i * nB + k]: does A lose a die when bid `bid` is called, given who bid it?
  // holds[bid][i * nB + k] = 1 when the bid stands.
  const nA = hands[0].length;
  const nB = hands[1].length;
  const holds = bids.map(({ quantity, face }) => {
    const out = new Uint8Array(nA * nB);
    for (let i = 0; i < nA; i += 1) for (let k = 0; k < nB; k += 1) out[i * nB + k] = hands[0][i].m[face] + hands[1][k].m[face] >= quantity ? 1 : 0;
    return out;
  });
  return { a, b, wild, bids, hands, holds, K: bids.length, nA, nB };
}

const popcount = (x) => { let c = 0; while (x) { x &= x - 1; c += 1; } return c; };
const highest = (mask) => (mask ? 31 - Math.clz32(mask) : -1);

// Actions at a history: index 0 is Liar (when there is a bid), then each raise.
function actionsAt(game, mask) {
  const last = highest(mask);
  const list = last >= 0 ? [-1] : [];
  for (let j = last + 1; j < game.K; j += 1) list.push(j);
  return list;
}

export function solve(game, iterations = 2000, report = () => {}) {
  const nodes = new Map();
  const node = (mask) => {
    let entry = nodes.get(mask);
    if (!entry) {
      const actor = popcount(mask) % 2;
      const actions = actionsAt(game, mask);
      const n = actor ? game.nB : game.nA;
      entry = { actor, actions, regret: new Float64Array(n * actions.length), avg: new Float64Array(n * actions.length) };
      nodes.set(mask, entry);
    }
    return entry;
  };
  const current = (entry, h) => {
    const A = entry.actions.length;
    let norm = 0;
    for (let x = 0; x < A; x += 1) norm += Math.max(0, entry.regret[h * A + x]);
    const out = new Float64Array(A);
    for (let x = 0; x < A; x += 1) out[x] = norm > 0 ? Math.max(0, entry.regret[h * A + x]) / norm : 1 / A;
    return out;
  };

  // Terminal: the actor at `mask` called Liar on the last bid. Returns, for the
  // updating player `p`, the counterfactual loss of each of p’s hands.
  function terminal(mask, p, oppReach) {
    const bid = highest(mask);
    const caller = popcount(mask) % 2;
    const holds = game.holds[bid];
    const n = p ? game.nB : game.nA;
    const out = new Float64Array(n);
    const opp = game.hands[1 - p];
    for (let h = 0; h < n; h += 1) {
      let v = 0;
      for (let o = 0; o < opp.length; o += 1) {
        const w = oppReach[o];
        if (!w) continue;
        const stands = p === 0 ? holds[h * game.nB + o] : holds[o * game.nB + h];
        // The caller loses when the bid stands; the bidder when it falls.
        const lose = (p === caller) === (stands === 1) ? 1 : 0;
        v += w * lose;
      }
      out[h] = v;
    }
    return out;
  }

  // CFR+ pass for player p: returns p’s counterfactual loss per hand.
  function walk(mask, p, ownReach, oppReach, t) {
    const entry = node(mask);
    const A = entry.actions.length;
    const n = p ? game.nB : game.nA;
    const no = p ? game.nA : game.nB;
    if (entry.actor === p) {
      const values = new Float64Array(n);
      const actionValues = [];
      const strategies = [];
      for (let h = 0; h < n; h += 1) strategies.push(current(entry, h));
      for (let x = 0; x < A; x += 1) {
        const action = entry.actions[x];
        let v;
        if (action < 0) v = terminal(mask, p, oppReach);
        else {
          const reach = new Float64Array(n);
          for (let h = 0; h < n; h += 1) reach[h] = ownReach[h] * strategies[h][x];
          v = walk(mask | (1 << action), p, reach, oppReach, t);
        }
        actionValues.push(v);
        for (let h = 0; h < n; h += 1) values[h] += strategies[h][x] * v[h];
      }
      for (let h = 0; h < n; h += 1) {
        for (let x = 0; x < A; x += 1) {
          // Losses: regret is how much better (lower) the action did.
          const r = entry.regret[h * A + x] + (values[h] - actionValues[x][h]);
          entry.regret[h * A + x] = Math.max(0, r);
          entry.avg[h * A + x] += t * ownReach[h] * strategies[h][x];
        }
      }
      return values;
    }
    const values = new Float64Array(n);
    const mixes = Array.from({ length: no }, (_, o) => current(entry, o));
    for (let x = 0; x < A; x += 1) {
      const action = entry.actions[x];
      // No pruning when the opponent never takes this action: the average
      // strategy below must still count every iteration.
      const reach = new Float64Array(no);
      for (let o = 0; o < no; o += 1) reach[o] = oppReach[o] * mixes[o][x];
      const v = action < 0 ? terminal(mask, p, reach) : walk(mask | (1 << action), p, ownReach, reach, t);
      for (let h = 0; h < n; h += 1) values[h] += v[h];
    }
    return values;
  }

  const prior = (p) => Float64Array.from(game.hands[p].map((hand) => hand.p));
  for (let t = 1; t <= iterations; t += 1) {
    for (let p = 0; p < 2; p += 1) walk(0, p, prior(p).map(() => 1), prior(1 - p), t);
    if (t % 200 === 0) report(t, exploitability(game, nodes));
  }
  return nodes;
}

export function averageStrategy(entry, h) {
  const A = entry.actions.length;
  let norm = 0;
  for (let x = 0; x < A; x += 1) norm += entry.avg[h * A + x];
  return Array.from({ length: A }, (_, x) => (norm > 0 ? entry.avg[h * A + x] / norm : 1 / A));
}

// Loss of player p’s hands against a fixed opponent strategy, either playing
// a fixed strategy too (best = false) or best-responding (best = true).
// `strategy(mask, h)` gives the actor’s mix at that history with hand h.
export function evaluateTree(game, p, oppStrategy, ownStrategy, best) {
  function walk(mask, oppReach) {
    const actor = popcount(mask) % 2;
    const actions = actionsAt(game, mask);
    const n = p ? game.nB : game.nA;
    const no = p ? game.nA : game.nB;
    if (actor === p) {
      const actionValues = actions.map((action) => (action < 0 ? terminalLoss(game, mask, p, oppReach) : walk(mask | (1 << action), oppReach)));
      const values = new Float64Array(n);
      for (let h = 0; h < n; h += 1) {
        if (best) values[h] = Math.min(...actionValues.map((v) => v[h]));
        else {
          const mix = ownStrategy(mask, h);
          for (let x = 0; x < actions.length; x += 1) values[h] += mix[x] * actionValues[x][h];
        }
      }
      return values;
    }
    const values = new Float64Array(n);
    const mixes = Array.from({ length: no }, (_, o) => oppStrategy(mask, o));
    actions.forEach((action, x) => {
      const reach = new Float64Array(no);
      let any = false;
      for (let o = 0; o < no; o += 1) { reach[o] = oppReach[o] * mixes[o][x]; if (reach[o] > 0) any = true; }
      if (!any) return;
      const v = action < 0 ? terminalLoss(game, mask, p, reach) : walk(mask | (1 << action), reach);
      for (let h = 0; h < n; h += 1) values[h] += v[h];
    });
    return values;
  }
  const v = walk(0, Float64Array.from(game.hands[1 - p].map((hand) => hand.p)));
  return game.hands[p].reduce((total, hand, h) => total + hand.p * v[h], 0);
}

function terminalLoss(game, mask, p, oppReach) {
  const bid = highest(mask);
  const caller = popcount(mask) % 2;
  const holds = game.holds[bid];
  const n = p ? game.nB : game.nA;
  const out = new Float64Array(n);
  for (let h = 0; h < n; h += 1) {
    let v = 0;
    for (let o = 0; o < oppReach.length; o += 1) {
      if (!oppReach[o]) continue;
      const stands = p === 0 ? holds[h * game.nB + o] : holds[o * game.nB + h];
      if ((p === caller) === (stands === 1)) v += oppReach[o];
    }
    out[h] = v;
  }
  return out;
}

// How much a best response gains against the average strategy, summed over
// both seats (0 at an exact equilibrium). Also returns A’s equilibrium loss.
export function exploitability(game, nodes) {
  const strategy = (mask, h) => {
    const entry = nodes.get(mask);
    return entry ? averageStrategy(entry, h) : new Array(actionsAt(game, mask).length).fill(1 / actionsAt(game, mask).length);
  };
  const lossA = evaluateTree(game, 0, strategy, strategy, false);
  const brA = evaluateTree(game, 0, strategy, null, true);
  const brB = evaluateTree(game, 1, strategy, null, true);
  // A’s loss + B’s loss = 1 in every round, so a best response for both sums under 1.
  return { gap: 1 - (brA + brB), lossA };
}

// Per decision: the equilibrium mix and each action’s chance to lose a die
// against the opponent’s equilibrium, with play continuing at equilibrium.
// Thousandths in two base-36 characters (“0r” = 27 → 2.7%).
export const pack = (x) => Math.round(Math.min(1, Math.max(0, x)) * 1000).toString(36).padStart(2, '0');
export const unpack = (text) => parseInt(text, 36) / 1000;

export function table(game, nodes, minReach = 0.005) {
  const strategy = (mask, h) => averageStrategy(nodes.get(mask), h);
  const out = {};
  // Loss for player p’s hands from `mask` on, both playing the equilibrium.
  function continuation(mask, p, oppReach) {
    const n = p ? game.nB : game.nA;
    const no = oppReach.length;
    const entry = nodes.get(mask);
    const values = new Float64Array(n);
    if (entry.actor === p) {
      entry.actions.forEach((action, x) => {
        const v = action < 0 ? terminalLoss(game, mask, p, oppReach) : continuation(mask | (1 << action), p, oppReach);
        for (let h = 0; h < n; h += 1) values[h] += strategy(mask, h)[x] * v[h];
      });
      return values;
    }
    entry.actions.forEach((action, x) => {
      const reach = new Float64Array(no);
      let any = false;
      for (let o = 0; o < no; o += 1) { reach[o] = oppReach[o] * strategy(mask, o)[x]; if (reach[o] > 0) any = true; }
      if (!any) return;
      const v = action < 0 ? terminalLoss(game, mask, p, reach) : continuation(mask | (1 << action), p, reach);
      for (let h = 0; h < n; h += 1) values[h] += v[h];
    });
    return values;
  }
  // Every history either player might face: walk with the opponent at
  // equilibrium and the actor taking every action (reach 1).
  function explore(mask, reach, seen) {
    if (seen.has(mask)) return;
    seen.add(mask);
    walkOne(mask, reach);
    const entry = nodes.get(mask);
    entry.actions.forEach((action, x) => {
      if (action < 0) return;
      const p = entry.actor;
      const next = [reach[0], reach[1]];
      next[p] = reach[p].map((r, h) => r * strategy(mask, h)[x]);
      explore(mask | (1 << action), next, seen);
    });
  }
  function walkOne(mask, reach) {
    const entry = nodes.get(mask);
    const p = entry.actor;
    const oppReach = reach[1 - p];
    const total = oppReach.reduce((x, y) => x + y, 0);
    if (!(total > minReach)) return;
    const values = entry.actions.map((action) => (action < 0
      ? terminalLoss(game, mask, p, oppReach)
      : continuation(mask | (1 << action), p, oppReach)));
    const n = p ? game.nB : game.nA;
    out[mask.toString(36)] = Array.from({ length: n }, (_, h) => entry.actions
      .map((_, x) => pack(values[x][h] / total) + pack(strategy(mask, h)[x])).join(''));
  }
  explore(0, [Float64Array.from(game.hands[0].map((h) => h.p)), Float64Array.from(game.hands[1].map((h) => h.p))], new Set());
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const iterations = Number(process.argv[2]) || 2000;
  const data = { version: 2, iterations, games: {} };
  // Two dice against one with ones wild too (both seats opening); with ones
  // wild off that tree has 2^18 histories, too large to solve here.
  for (const wild of [true, false]) {
    for (const [a, b] of wild ? [[1, 1], [2, 1], [1, 2]] : [[1, 1]]) {
      const game = makeGame(a, b, wild);
      const nodes = solve(game, iterations, (t, { gap, lossA }) => console.log(`${a}v${b} wild=${wild} t=${t} gap=${gap.toExponential(2)} opener loses ${lossA.toFixed(4)}`));
      const { gap, lossA } = exploitability(game, nodes);
      data.games[`${a}v${b}${wild ? 'w' : ''}`] = { a, b, wild, gap: Number(gap.toExponential(2)), openerLoses: Math.round(lossA * 10000) / 10000, hands: game.hands.map((list) => list.map((hand) => hand.dice.join(''))), table: table(game, nodes) };
    }
  }
  mkdirSync(join(here, '../data'), { recursive: true });
  writeFileSync(join(here, '../data/endgame.json'), `${JSON.stringify(data)}\n`);
  console.log('wrote data/endgame.json');
}
