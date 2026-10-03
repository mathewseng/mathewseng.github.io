// Dodge table simulator and doubling-cube solver.
//
// Rules: 2–4 players, one card each to start. The lowest card draws first (suit
// breaks ties, clubs lowest), then play proceeds clockwise one card at a time.
// A player who makes a straight or better busts and stops drawing. The last
// player still drawing wins. If the deck runs out first, the survivors split.
//
// "Draws to bust" (T) counts a player's own further draws including the bust
// card. Seventeen cards always bust (five of one suit is forced), so a hand of
// n cards has T ≤ 17 − n.
import {
  RANKS,
  SUITS,
  SYMBOLS,
  CATEGORIES,
  cardName,
  handName,
  parseCards,
} from "../engine.mjs";

export { RANKS, SUITS, SYMBOLS, CATEGORIES, cardName, handName, parseCards };

export const MAX_HAND = 17;
export const FULL_DECK = Array.from({ length: 52 }, (_, c) => c);
export const CUBE = { CENTER: 0, ON_TURN: 1, OTHER: 2 };

// mulberry32: small, fast, seedable.
export function makeRng(seed = (Math.random() * 2 ** 32) >>> 0) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function straightHigh(mask) {
  for (let top = 12; top >= 4; top--)
    if ((mask & (31 << (top - 4))) === 31 << (top - 4)) return top + 2;
  return (mask & 0x100f) === 0x100f ? 5 : 0;
}

// Incremental hand: add/pop are O(1) and category() is O(1).
export class Hand {
  constructor(cards = []) {
    this.cards = [];
    this.rankCount = new Uint8Array(13);
    this.suitCount = new Uint8Array(4);
    this.suitMask = new Uint16Array(4);
    this.rankMask = 0;
    this.multi = 0;
    this.trips = 0;
    this.quads = 0;
    for (const c of cards) this.add(c);
  }
  get size() {
    return this.cards.length;
  }
  add(c) {
    const r = c >> 2,
      s = c & 3;
    this.cards.push(c);
    const n = ++this.rankCount[r];
    if (n === 2) this.multi++;
    else if (n === 3) this.trips++;
    else if (n === 4) this.quads++;
    this.suitCount[s]++;
    this.suitMask[s] |= 1 << (12 - r);
    this.rankMask |= 1 << (12 - r);
    return this.category();
  }
  pop() {
    const c = this.cards.pop();
    const r = c >> 2,
      s = c & 3;
    const n = this.rankCount[r]--;
    if (n === 2) this.multi--;
    else if (n === 3) this.trips--;
    else if (n === 4) this.quads--;
    this.suitCount[s]--;
    this.suitMask[s] &= ~(1 << (12 - r));
    if (n === 1) this.rankMask &= ~(1 << (12 - r));
    return c;
  }
  remove(c) {
    const i = this.cards.lastIndexOf(c);
    if (i < 0) return false;
    const tail = this.cards.slice(i + 1);
    for (let k = 0; k <= tail.length; k++) this.pop();
    for (const t of tail) this.add(t);
    return true;
  }
  truncate(size) {
    while (this.cards.length > size) this.pop();
  }
  category() {
    if (this.cards.length < 5) return -1;
    let sf = 0;
    for (let s = 0; s < 4; s++)
      if (this.suitCount[s] >= 5) {
        const h = straightHigh(this.suitMask[s]);
        if (h > sf) sf = h;
      }
    if (sf) return sf === 14 ? 5 : 4;
    if (this.quads) return 3;
    if (this.trips && this.multi >= 2) return 2;
    if (
      this.suitCount[0] >= 5 ||
      this.suitCount[1] >= 5 ||
      this.suitCount[2] >= 5 ||
      this.suitCount[3] >= 5
    )
      return 1;
    return straightHigh(this.rankMask) ? 0 : -1;
  }
  get busted() {
    return this.category() >= 0;
  }
}

export function remainingDeck(hands) {
  const held = new Set();
  for (const h of hands) for (const c of h) held.add(c);
  return FULL_DECK.filter((c) => !held.has(c));
}

// Lower key draws first. Suit order: clubs < diamonds < hearts < spades.
export function lowKey(card, aceHigh = true) {
  const r = card >> 2;
  const value = aceHigh ? 12 - r : r === 0 ? -1 : 12 - r;
  return value * 4 + (3 - (card & 3));
}
export function firstDrawer(firstCards, aceHigh = true) {
  let best = 0;
  for (let i = 1; i < firstCards.length; i++)
    if (lowKey(firstCards[i], aceHigh) < lowKey(firstCards[best], aceHigh))
      best = i;
  return best;
}

function binomial(n, k) {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
}

// Exact P(bust within k further draws): fraction of k-subsets of the deck that
// bust. Bust is monotone in the card set, so once a prefix busts every
// completion busts too.
export function exactBustWithin(hand, deck, k) {
  const n = deck.length;
  if (k > n) k = n;
  if (k <= 0) return hand.busted ? 1 : 0;
  if (hand.busted) return 1;
  let bust = 0;
  const total = binomial(n, k);
  const rec = (start, depth) => {
    const need = k - depth;
    for (let i = start; i <= n - need; i++) {
      if (hand.add(deck[i]) >= 0) bust += binomial(n - i - 1, need - 1);
      else if (need > 1) rec(i + 1, depth + 1);
      hand.pop();
    }
  };
  rec(0, 0);
  return total ? bust / total : 0;
}

// Marginal distribution of T (further draws to bust) for one hand drawing alone
// from `deck`. The first `exactDepth` draws are exact; the tail is Monte Carlo
// renormalized onto the exact survival mass. `beyond` is the probability that
// the deck runs out before the hand busts (only possible with a short deck).
export function bustDistribution(
  handCards,
  deck,
  { rollouts = 4000, exactDepth = 2, rng = Math.random } = {},
) {
  const hand = handCards instanceof Hand ? handCards : new Hand(handCards);
  const n = hand.size;
  if (hand.busted) return finishDistribution([], 0, 0, 0);
  const L = Math.min(MAX_HAND - n, deck.length);
  const d = Math.min(exactDepth, L);
  const exactCum = [0];
  for (let k = 1; k <= d; k++) exactCum.push(exactBustWithin(hand, deck, k));
  const counts = new Float64Array(L + 2);
  const arr = deck.slice();
  const base = hand.size;
  for (let t = 0; t < rollouts; t++) {
    let m = arr.length,
      k = 0,
      busted = false;
    while (m > 0 && k < L) {
      k++;
      const i = Math.floor(rng() * m);
      const c = arr[i];
      arr[i] = arr[--m];
      arr[m] = c;
      if (hand.add(c) >= 0) {
        busted = true;
        break;
      }
    }
    counts[busted ? k : L + 1]++;
    hand.truncate(base);
  }
  const hist = new Array(L).fill(0);
  for (let k = 1; k <= d; k++) hist[k - 1] = exactCum[k] - exactCum[k - 1];
  const survive = 1 - exactCum[d];
  let tail = 0;
  for (let k = d + 1; k <= L + 1; k++) tail += counts[k];
  let beyond = 0;
  if (survive > 0) {
    if (tail > 0) {
      for (let k = d + 1; k <= L; k++) hist[k - 1] = (survive * counts[k]) / tail;
      beyond = (survive * counts[L + 1]) / tail;
    } else hist[Math.min(d, L - 1)] += survive;
  }
  return finishDistribution(hist, beyond, rollouts, d);
}

function finishDistribution(hist, beyond, rollouts, exactDepth) {
  const L = hist.length;
  const cum = [];
  let c = 0;
  for (const p of hist) {
    c += p;
    cum.push(Math.min(1, c));
  }
  const survival = [1, ...cum.map((x) => Math.max(0, 1 - x))];
  const hazard = hist.map((p, i) =>
    survival[i] > 1e-12 ? Math.min(1, p / survival[i]) : 1,
  );
  if (hazard.length) hazard[hazard.length - 1] = beyond > 1e-9 ? hazard[hazard.length - 1] : 1;
  let mean = hist.reduce((s, p, i) => s + p * (i + 1), 0) + beyond * (L + 1);
  const quantile = (q) => {
    let acc = 0;
    for (let i = 0; i < L; i++) {
      acc += hist[i];
      if (acc + 1e-12 >= q) return i + 1;
    }
    return L + 1;
  };
  return {
    hist,
    cum,
    survival,
    hazard,
    beyond,
    mean,
    median: quantile(0.5),
    bustWithin: (k) => (k <= 0 ? 0 : k > L ? 1 - beyond : cum[k - 1]),
    rollouts,
    exactDepth,
  };
}

// Joint Monte Carlo of the whole table from the current state.
// table = { hands: [[cards]...], alive: [bool...], turn: seat, deck: [cards] }
export function simulateTable(table, { games = 20000, rng = Math.random } = {}) {
  const n = table.hands.length;
  const hands = table.hands.map((h) => new Hand(h));
  const base = hands.map((h) => h.size);
  const alive0 = table.alive ?? hands.map((h) => !h.busted);
  const wins = new Float64Array(n);
  const busts = new Float64Array(n);
  const arr = table.deck.slice();
  let deckOut = 0;
  const alive = new Array(n);
  for (let g = 0; g < games; g++) {
    let count = 0;
    for (let i = 0; i < n; i++) {
      alive[i] = alive0[i];
      if (alive[i]) count++;
    }
    let cur = table.turn;
    let m = arr.length;
    while (count > 1 && m > 0) {
      while (!alive[cur]) cur = (cur + 1) % n;
      const i = Math.floor(rng() * m);
      const c = arr[i];
      arr[i] = arr[--m];
      arr[m] = c;
      if (hands[cur].add(c) >= 0) {
        alive[cur] = false;
        busts[cur]++;
        count--;
      }
      cur = (cur + 1) % n;
    }
    if (count === 1) {
      for (let i = 0; i < n; i++) if (alive[i]) wins[i]++;
    } else {
      deckOut++;
      for (let i = 0; i < n; i++) if (alive[i]) wins[i] += 1 / count;
    }
    for (let i = 0; i < n; i++) hands[i].truncate(base[i]);
  }
  return {
    games,
    equity: Array.from(wins, (w) => w / games),
    bustRate: Array.from(busts, (b) => b / games),
    deckOut: deckOut / games,
  };
}

// Race-model cube DP. hOn = hazards of the player on turn (hOn[i] is the
// probability that their (i+1)-th further draw busts given survival so far),
// hOff = hazards of the other player. Equities are from the on-turn player's
// point of view in units of the current cube. cube: CENTER, ON_TURN (on-turn
// player owns it), OTHER. `cubeless` disables doubling.
export function raceCubeDP(hOn, hOff) {
  const LA = hOn.length,
    LB = hOff.length;
  const W = LB + 2,
    SZ = (LA + 2) * W * 2 * 3;
  const memo = new Float64Array(SZ).fill(NaN);
  const memoLess = new Float64Array((LA + 2) * W * 2).fill(NaN);
  const hz = (h, i) => (i < h.length ? h[i] : 1);
  // Equity for player A (hOn) given i draws survived by A, j by B, turn (0 = A), cube from A's view.
  function E(i, j, turn, cube) {
    const idx = ((i * W + j) * 2 + turn) * 3 + cube;
    let v = memo[idx];
    if (!Number.isNaN(v)) return v;
    if (turn === 0) {
      const h = hz(hOn, i);
      const draw = (c) => -h + (1 - h) * (h >= 1 ? 0 : E(i + 1, j, 1, c));
      const noDouble = draw(cube);
      if (cube === CUBE.CENTER || cube === CUBE.ON_TURN) {
        const doubleTake = 2 * draw(CUBE.OTHER);
        v = Math.max(noDouble, Math.min(1, doubleTake));
      } else v = noDouble;
    } else {
      const h = hz(hOff, j);
      const draw = (c) => h + (1 - h) * (h >= 1 ? 0 : E(i, j + 1, 0, c));
      const noDouble = draw(cube);
      if (cube === CUBE.CENTER || cube === CUBE.OTHER) {
        const doubleTake = 2 * draw(CUBE.ON_TURN);
        v = Math.min(noDouble, Math.max(-1, doubleTake));
      } else v = noDouble;
    }
    memo[idx] = v;
    return v;
  }
  function C(i, j, turn) {
    const idx = (i * W + j) * 2 + turn;
    let v = memoLess[idx];
    if (!Number.isNaN(v)) return v;
    if (turn === 0) {
      const h = hz(hOn, i);
      v = -h + (1 - h) * (h >= 1 ? 0 : C(i + 1, j, 1));
    } else {
      const h = hz(hOff, j);
      v = h + (1 - h) * (h >= 1 ? 0 : C(i, j + 1, 0));
    }
    memoLess[idx] = v;
    return v;
  }
  return {
    equity: (cube) => E(0, 0, 0, cube),
    cubeless: () => C(0, 0, 0),
    at: E,
  };
}

// Position values for the player on turn: equities (their point of view, units
// of the current cube) with their own cube decision already resolved, for each
// cube state. ply = 0 values the position with the race-model DP on marginal
// hazards; ply ≥ 1 expands every possible next card exactly and recurses.
export function positionValues(onTurn, other, deck, opts, ply = 0) {
  if (ply <= 0) {
    const dX = bustDistribution(onTurn, deck, opts);
    const dY = bustDistribution(other, deck, opts);
    const dp = raceCubeDP(dX.hazard, dY.hazard);
    return {
      cubeless: dp.cubeless(),
      center: dp.equity(CUBE.CENTER),
      onOwns: dp.equity(CUBE.ON_TURN),
      otherOwns: dp.equity(CUBE.OTHER),
    };
  }
  const d = drawValues(onTurn, other, deck, opts, ply);
  const doubled = Math.min(1, 2 * d.otherOwns);
  return {
    cubeless: d.cubeless,
    center: Math.max(d.center, doubled),
    onOwns: Math.max(d.onOwns, doubled),
    otherOwns: d.otherOwns,
  };
}

// Expected equity of drawing now (no cube action) for each cube state, averaged
// exactly over every card left in the deck.
export function drawValues(onTurn, other, deck, opts, ply = 1) {
  const x = onTurn instanceof Hand ? onTurn : new Hand(onTurn);
  const otherCards = other instanceof Hand ? other.cards.slice() : other;
  const n = deck.length;
  let cubeless = 0,
    center = 0,
    onOwns = 0,
    otherOwns = 0,
    bustOuts = 0;
  const children = opts.children ? [] : null;
  for (let idx = 0; idx < n; idx++) {
    const c = deck[idx];
    if (x.add(c) >= 0) {
      x.pop();
      bustOuts++;
      cubeless -= 1;
      center -= 1;
      onOwns -= 1;
      otherOwns -= 1;
      if (children) children.push({ card: c, bust: true });
      continue;
    }
    const rest = deck.filter((d) => d !== c);
    const child = positionValues(otherCards, x.cards.slice(), rest, { ...opts, children: false }, ply - 1);
    x.pop();
    // The other player is on turn in the child; flip sides and swap ownership.
    cubeless -= child.cubeless;
    center -= child.center;
    onOwns -= child.otherOwns;
    otherOwns -= child.onOwns;
    if (children)
      children.push({
        card: c,
        bust: false,
        cubeless: -child.cubeless,
        center: -child.center,
        onOwns: -child.otherOwns,
        otherOwns: -child.onOwns,
      });
  }
  return {
    cubeless: cubeless / n,
    center: center / n,
    onOwns: onOwns / n,
    otherOwns: otherOwns / n,
    bustNext: bustOuts / n,
    children,
  };
}

// Full cube analysis for the player on turn in a two-player game.
// state = { onTurn: [cards], other: [cards], deck: [cards], cube: CUBE.* }
// Returns equities from the on-turn player's point of view in units of the
// current cube, plus the responder's take/pass view.
export function analyzeCube(
  state,
  { rollouts = 3000, exactDepth = 2, rng = Math.random, ply = 1, children = false } = {},
) {
  const d = drawValues(state.onTurn, state.other, state.deck, { rollouts, exactDepth, rng, children }, ply);
  const cube = state.cube ?? CUBE.CENTER;
  const canDouble = cube !== CUBE.OTHER;
  const noDouble = cube === CUBE.CENTER ? d.center : cube === CUBE.ON_TURN ? d.onOwns : d.otherOwns;
  const doubleTake = 2 * d.otherOwns;
  const doublePass = 1;
  const doubleValue = Math.min(doublePass, doubleTake);
  const responderTakes = doubleTake < doublePass;
  const bestAction = !canDouble ? "draw" : doubleValue > noDouble ? "double" : "noDouble";
  return {
    cube,
    ply,
    canDouble,
    bustNext: d.bustNext,
    cubeless: d.cubeless,
    winProb: (d.cubeless + 1) / 2,
    noDouble,
    doubleTake,
    doublePass,
    doubleValue,
    bestAction,
    responder: {
      take: -doubleTake,
      pass: -doublePass,
      best: responderTakes ? "take" : "pass",
    },
    children: d.children,
  };
}

// Per-player view used by the simulator: marginal draws-to-bust distribution.
export function playerDistribution(cards, deck, opts) {
  return bustDistribution(cards, deck, opts);
}

export function describeCategory(category) {
  return category >= 0 ? CATEGORIES[category] : null;
}

export function shuffledDeck(rng = Math.random) {
  const d = FULL_DECK.slice();
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}
