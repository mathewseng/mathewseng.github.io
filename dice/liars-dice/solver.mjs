// The Liar’s Dice best-move model. Pure: it reads one player’s view (their own
// dice, everyone’s dice counts and this round’s bids) and never a hidden die.
//
// For every sensible move it estimates the chance that this decision costs you
// a die:
//
// - Liar loses when the bid stands: P(matches at the table ≥ quantity).
// - A raise loses when the next player calls Liar and the raise is short. If they
//   raise instead, you still carry a share of the round’s later risk:
//   `carry` / players still in, a little over an even share.
//
// The unknown dice are summed exactly (a convolution over every hand each
// opponent could hold). Each opponent’s hand is weighted by the bids they made
// this round (Bayes’ rule) with this bidder model:
//
//   P(bid | hand) = bluff / faces + (1 − bluff) × face(hand) × plausible(hand)
//
//   face(hand)      softmax over the biddable faces of focus × (matching dice),
//                   so a player tends to bid what they hold;
//   plausible(hand) logistic in P(the bid is true | that hand, the rest of the
//                   table unknown), so a high quantity points to a strong hand.
//
// This is a model of how people bid, not a solution: the quantity term is not
// normalised over every quantity a hand could have bid, and later rounds of
// bidding are folded into `carry`. Your own earlier bids are not evidence to you.
//
// The next player is modelled the same way: they read your bids (the new one
// included) with the same model, and call Liar with a logistic chance that
// falls as the bid’s chance looks better to them.
import { diceOutcomes, binomialAtLeast } from '../table-core.mjs';

// Tuned by self-play against the Normal bot and the old Hard bot (the rates are
// in tests/engine.test.mjs); the results sat on a broad plateau around these.
export const MODEL = {
  bluff: 0.1,       // share of bids made without regard to the hand
  focus: 3,         // softmax weight per matching die when choosing a face
  plausible: 0.65,  // an honest bid is believed true at least about this often…
  spread: 0.2,      // …on this logistic scale
  call: 0.55,       // the next player calls when the bid looks less likely than this…
  callSpread: 0.12, // …on this logistic scale
  carry: 1.25,      // later risk after your raise is raised: carry / players still in
};

const logistic = (x) => 1 / (1 + Math.exp(-x));
export const matchChance = (face, wild) => (wild && face !== 1 ? 1 / 3 : 1 / 6);
const matches = (dice, face, wild) => dice.filter((die) => die === face || (wild && face !== 1 && die === 1)).length;

// Each hand of n dice with its prior chance and its matches for faces 1–6.
const handCache = new Map();
function hands(n, wild) {
  const key = `${n}:${wild}`;
  if (!handCache.has(key)) {
    handCache.set(key, diceOutcomes(n).map(({ dice, p }) => ({ p, m: [0, 1, 2, 3, 4, 5, 6].map((face) => (face ? matches(dice, face, wild) : 0)) })));
  }
  return handCache.get(key);
}

// Distribution helpers: arrays where d[k] = P(count = k).
export function convolve(a, b) {
  const out = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i += 1) {
    if (!a[i]) continue;
    for (let j = 0; j < b.length; j += 1) out[i + j] += a[i] * b[j];
  }
  return out;
}
const atLeast = (dist, k) => {
  let total = 0;
  for (let i = Math.max(0, k); i < dist.length; i += 1) total += dist[i];
  return Math.min(1, Math.max(0, total));
};
const shift = (dist, by) => new Array(by).fill(0).concat(dist);

// P(bid | hand) for one bid by a player holding `n` dice at a table of `total`.
function bidLikelihood(hand, n, bid, total, wild, model) {
  const low = wild ? 2 : 1;
  let norm = 0;
  for (let face = low; face <= 6; face += 1) norm += Math.exp(model.focus * hand.m[face]);
  const face = Math.exp(model.focus * hand.m[bid.face]) / norm;
  const truth = binomialAtLeast(total - n, matchChance(bid.face, wild), bid.quantity - hand.m[bid.face]);
  const plausible = logistic((truth - model.plausible) / model.spread);
  return model.bluff / (7 - low) + (1 - model.bluff) * face * plausible;
}

// Weighted hands of a player with `n` dice given their `bids` this round.
function posterior(n, bids, total, wild, model) {
  const list = hands(n, wild);
  const weights = list.map((hand) => bids.reduce((w, bid) => w * bidLikelihood(hand, n, bid, total, wild, model), hand.p));
  const norm = weights.reduce((a, b) => a + b, 0) || 1;
  return list.map((hand, i) => ({ m: hand.m, w: weights[i] / norm }));
}

function matchDist(post, n, face) {
  const dist = new Array(n + 1).fill(0);
  for (const hand of post) dist[hand.m[face]] += hand.w;
  return dist;
}

const alive = (view) => view.counts.map((count, i) => (count > 0 ? i : -1)).filter((i) => i >= 0);
function nextAlive(view, seat) {
  for (let step = 1; step <= view.counts.length; step += 1) {
    const i = (seat + step) % view.counts.length;
    if (view.counts[i] > 0) return i;
  }
  return seat;
}

// The candidate moves: Liar, and for each face the smallest raise and up to
// three more dice (for an opening bid, every quantity up to two past what you
// expect to be there).
export function candidates(view, seat) {
  const wild = view.wild;
  const low = wild ? 2 : 1;
  const total = view.counts.reduce((a, b) => a + b, 0);
  const mine = view.dice[seat] || [];
  const previous = view.bid;
  const moves = previous ? [{ type: 'liar' }] : [];
  for (let face = low; face <= 6; face += 1) {
    let from;
    let to;
    if (!previous) {
      from = 1;
      to = matches(mine, face, wild) + Math.round((total - mine.length) * matchChance(face, wild)) + 2;
    } else {
      from = face > previous.face ? previous.quantity : previous.quantity + 1;
      to = previous.quantity + 3;
    }
    for (let quantity = from; quantity <= Math.min(total, to); quantity += 1) moves.push({ type: 'bid', quantity, face });
  }
  return moves;
}

// Rank every candidate by its chance to lose a die. Returns [{ action, risk }],
// best first (ties: Liar, then fewer dice, then the higher face).
export function evaluate(view, seat, model = MODEL) {
  const wild = view.wild;
  const total = view.counts.reduce((a, b) => a + b, 0);
  const mine = view.dice[seat] || [];
  const bids = view.bids || [];
  const players = alive(view);
  const opponents = players.filter((i) => i !== seat);
  const next = nextAlive(view, seat);
  const posts = new Map(opponents.map((i) => [i, posterior(view.counts[i], bids.filter((bid) => bid.seat === i), total, wild, model)]));
  const myBids = bids.filter((bid) => bid.seat === seat);
  const carry = model.carry / players.length;

  const distCache = new Map();
  const dist = (i, face) => {
    const key = `${i}:${face}`;
    if (!distCache.has(key)) distCache.set(key, matchDist(posts.get(i), view.counts[i], face));
    return distCache.get(key);
  };
  const others = (face, skip) => opponents.filter((i) => i !== skip).reduce((acc, i) => convolve(acc, dist(i, face)), [1]);

  const results = candidates(view, seat).map((action) => {
    if (action.type === 'liar') {
      const { quantity, face } = view.bid;
      const risk = atLeast(shift(others(face, -1), matches(mine, face, wild)), quantity);
      return { action, risk };
    }
    const { quantity, face } = action;
    const own = matches(mine, face, wild);
    const rest = others(face, next);
    const nextDist = dist(next, face);
    // How the next player sees you: your bids this round, this one included.
    const seen = matchDist(posterior(mine.length, myBids.concat({ seat, quantity, face }), total, wild, model), mine.length, face);
    const theirRest = convolve(seen, rest);
    let risk = 0;
    for (let m = 0; m < nextDist.length; m += 1) {
      if (!nextDist[m]) continue;
      const theyBelieve = atLeast(theirRest, quantity - m);
      const call = logistic((model.call - theyBelieve) / model.callSpread);
      const short = 1 - atLeast(rest, quantity - own - m);
      risk += nextDist[m] * (call * short + (1 - call) * carry);
    }
    return { action, risk };
  });
  // Risks within a tenth of a percent tie (say the next player all but never
  // calls either bid). Ties go to Liar, then to the bid with fewer dice (more
  // dice tested no stronger in self-play), then the higher face.
  const tier = (risk) => Math.round(risk * 1000);
  results.sort((a, b) => tier(a.risk) - tier(b.risk)
    || (a.action.type === 'liar' ? -1 : b.action.type === 'liar' ? 1 : 0)
    || (a.action.type === 'bid' && b.action.type === 'bid' ? a.action.quantity - b.action.quantity || b.action.face - a.action.face : 0)
    || a.risk - b.risk);
  return results;
}

// ---------- Solved endgames ----------
// data/endgame.json (built by scripts/endgame.mjs) holds the exact equilibrium
// of a heads-up round for one die against one (ones wild on or off) and for two
// dice against one (ones wild, either player opening). For each history the
// opponent’s equilibrium play reaches at least 0.5% of the time, it lists per
// hand each action’s chance to lose a die against that play and the
// equilibrium’s chance of playing it. A round is scored as “who loses a die”,
// the same measure as the estimate, so in two against one it is the
// equilibrium of the round, not of the whole game.

let endgame = null;
let endgameLoad = null;
const DATA = new URL('./data/endgame.json', import.meta.url);

export function loadEndgame() {
  endgameLoad ||= (typeof window !== 'undefined' && typeof fetch === 'function'
    ? fetch(DATA).then((response) => (response.ok ? response.json() : null))
    : import('node:fs').then((fs) => JSON.parse(fs.readFileSync(DATA, 'utf8'))))
    .then((data) => { endgame = data || { games: {} }; return endgame; }, () => { endgame = { games: {} }; return endgame; });
  return endgameLoad;
}

// Which solved game this decision belongs to, or null. Pure: from the view.
export function endgameKey(view, seat) {
  const players = alive(view);
  if (players.length !== 2 || !players.includes(seat) || !players.includes(view.starter)) return null;
  const other = players.find((i) => i !== seat);
  const opener = view.starter;
  const second = opener === seat ? other : seat;
  return `${view.counts[opener]}v${view.counts[second]}${view.wild ? 'w' : ''}`;
}

// The exact endgame answer: [{ action, risk, mix }] best first, or null when
// the table is not a solved endgame or the bidding left the equilibrium’s path.
// Returns a Promise while the data loads.
export function solvedEndgame(view, seat) {
  const key = endgameKey(view, seat);
  if (!key) return null;
  if (!endgame) return loadEndgame().then(() => solvedEndgame(view, seat));
  const game = endgame.games?.[key];
  if (!game) return null;
  const low = view.wild ? 2 : 1;
  const faces = 7 - low;
  const total = view.counts.reduce((a, b) => a + b, 0);
  const bids = view.bids || [];
  let mask = 0;
  const other = alive(view).find((i) => i !== view.starter);
  for (const [k, bid] of bids.entries()) {
    // Bids alternate from the opener in a heads-up round.
    if (bid.seat !== (k % 2 === 0 ? view.starter : other)) return null;
    mask |= 2 ** ((bid.quantity - 1) * faces + (bid.face - low));
  }
  const p = seat === view.starter ? 0 : 1;
  if (bids.length % 2 !== p) return null;
  const row = game.table[mask.toString(36)];
  if (!row) return null;
  const hand = (view.dice[seat] || []).slice().sort((a, b) => a - b).join('');
  const h = game.hands[p].indexOf(hand);
  if (h < 0 || !row[h]) return null;
  const last = bids.length ? (view.bid.quantity - 1) * faces + (view.bid.face - low) : -1;
  const actions = last >= 0 ? [{ type: 'liar' }] : [];
  for (let j = last + 1; j < total * faces; j += 1) actions.push({ type: 'bid', quantity: Math.floor(j / faces) + 1, face: (j % faces) + low });
  // Four characters per action: chance to lose a die, then the equilibrium’s
  // chance of playing it, each in thousandths in base 36.
  if (actions.length * 4 !== row[h].length) return null;
  const read = (x, at) => parseInt(row[h].slice(x * 4 + at, x * 4 + at + 2), 36) / 1000;
  const ranked = actions.map((action, x) => ({ action, risk: read(x, 0), mix: read(x, 2) }));
  ranked.sort((a, b) => a.risk - b.risk || b.mix - a.mix);
  return ranked;
}
