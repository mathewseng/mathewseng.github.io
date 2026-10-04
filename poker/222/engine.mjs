// 222 engine: card model, Omaha evaluation, the forced three-hand split,
// pairwise scoring, runout statistics, and the perfect-information
// doubling-cube solver.
//
// Rules: every player holds six cards and shares a five-card board. After the
// flop the six cards are split automatically into three two-card Omaha hands
// (exactly two hole cards plus exactly three board cards each):
//   hand 1 = the two hole cards used by the player's best six-card Omaha hand,
//   hand 2 = the best two of the remaining four,
//   hand 3 = the last two.
// Ties between candidate pairs go to the higher-ranked cards, then to the
// higher suit (spades > hearts > diamonds > clubs). Hand 1 is worth 3 points,
// hand 2 is worth 2, hand 3 is worth 1, and winning all three outright scoops
// for a 4-point bonus (10 in all). Ties on a hand split its points. With more
// than two players every pair of players settles separately.

import { DROP_UNIT, DROP_UNITS, MAX_CUBE, chainDepth, levelAfter, dropCost, optionLabel } from "./cube-rules.mjs";
export { DROP_UNIT, DROP_UNITS, MAX_CUBE };
export const RANKS = "23456789TJQKA";
export const SUITS = "cdhs";
export const SYMBOLS = ["♣", "♦", "♥", "♠"];
export const SUIT_NAMES = ["clubs", "diamonds", "hearts", "spades"];
export const FULL_DECK = Array.from({ length: 52 }, (_, c) => c);
export const POINTS = [3, 2, 1];
export const SCOOP_BONUS = 4;
export const MAX_NET = 10; // histogram half-width; every scoring system's net fits in ±MAX_NET
// Scoring systems: points per hand, scoop bonus, largest possible net, and the drop costs offered.
export const SCORINGS = {
  classic: { id: "classic", name: "3-2-1, scoop +4 (10 total)", short: "3-2-1", points: [3, 2, 1], scoop: 4, maxNet: 10, dropUnits: Array.from({ length: 12 }, (_, i) => i + 5), defaultDrop: 6 },
  flat: { id: "flat", name: "1-1-1, scoop +3 (6 total)", short: "1-1-1", points: [1, 1, 1], scoop: 3, maxNet: 6, dropUnits: Array.from({ length: 10 }, (_, i) => i + 1), defaultDrop: 3 },
};
export const SCORING_ORDER = ["classic", "flat"];
export const scoringOf = (sc) => (typeof sc === "string" ? SCORINGS[sc] ?? SCORINGS.classic : sc ?? SCORINGS.classic);
export const CATEGORIES = [
  "High card",
  "Pair",
  "Two pair",
  "Three of a kind",
  "Straight",
  "Flush",
  "Full house",
  "Four of a kind",
  "Straight flush",
];

export const rankOf = (c) => c >> 2;
export const suitOf = (c) => c & 3;
export const cardName = (c) => RANKS[c >> 2] + SUITS[c & 3];
export const cardLabel = (c) => (RANKS[c >> 2] === "T" ? "10" : RANKS[c >> 2]) + SYMBOLS[c & 3];
const rankWord = (r, plural = false) => {
  const words = ["two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "jack", "queen", "king", "ace"];
  const w = words[r];
  return plural ? (w === "six" ? "sixes" : w + "s") : w;
};

export function parseCard(text) {
  const t = String(text).trim();
  const m = /^(10|[2-9TJQKA])\s*([cdhsCDHS♣♦♥♠])$/i.exec(t);
  if (!m) throw new Error(`Bad card: ${text}`);
  const r = m[1] === "10" ? 8 : RANKS.indexOf(m[1].toUpperCase());
  const su = m[2].toLowerCase();
  const s = "cdhs".indexOf(su) >= 0 ? "cdhs".indexOf(su) : SYMBOLS.indexOf(m[2]);
  return r * 4 + s;
}
export function parseCards(text) {
  return String(text)
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(parseCard);
}

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
export function shuffledDeck(rng = Math.random) {
  const d = FULL_DECK.slice();
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}
export function remainingDeck(...groups) {
  const used = new Set();
  for (const g of groups) for (const h of g) if (Array.isArray(h)) for (const c of h) used.add(c);
  else if (h != null) used.add(h);
  return FULL_DECK.filter((c) => !used.has(c));
}
export function dealTable(n, rng = Math.random) {
  const deck = shuffledDeck(rng);
  const hands = Array.from({ length: n }, (_, i) => deck.slice(i * 6, i * 6 + 6).sort((a, b) => b - a));
  const board = deck.slice(n * 6, n * 6 + 5);
  return { hands, board };
}
export function binomial(n, k) {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
}

/* ---------- five-card evaluation ---------- */
// value = category << 26 | primary << 13 | secondary. Higher is better.
const STRAIGHT = new Uint8Array(8192);
for (let m = 0; m < 8192; m++) {
  let h = 0;
  for (let top = 12; top >= 4; top--)
    if ((m & (31 << (top - 4))) === 31 << (top - 4)) {
      h = top + 1;
      break;
    }
  if (!h && (m & 0x100f) === 0x100f) h = 4;
  STRAIGHT[m] = h;
}
export function classify(m1, m2, m3, m4, flush) {
  if (!m2) {
    const s = STRAIGHT[m1];
    if (flush) return s ? (8 << 26) | (s << 13) : (5 << 26) | m1;
    return s ? (4 << 26) | (s << 13) : m1;
  }
  if (m4) return (7 << 26) | (m4 << 13) | (m1 & ~m4);
  if (m3) {
    const p = m2 & ~m3;
    return p ? (6 << 26) | (m3 << 13) | p : (3 << 26) | (m3 << 13) | (m1 & ~m3);
  }
  const singles = m1 & ~m2;
  return m2 & (m2 - 1) ? (2 << 26) | (m2 << 13) | singles : (1 << 26) | (m2 << 13) | singles;
}
export function eval5(cards) {
  let m1 = 0,
    m2 = 0,
    m3 = 0,
    m4 = 0;
  for (const c of cards) {
    const b = 1 << (c >> 2);
    m4 |= m3 & b;
    m3 |= m2 & b;
    m2 |= m1 & b;
    m1 |= b;
  }
  const s = cards[0] & 3;
  const flush = cards.every((c) => (c & 3) === s);
  return classify(m1, m2, m3, m4, flush);
}
export const categoryOf = (value) => value >>> 26;
const highBit = (mask) => 31 - Math.clz32(mask);
const bitsDesc = (mask) => {
  const out = [];
  for (let r = 12; r >= 0; r--) if (mask & (1 << r)) out.push(r);
  return out;
};
export function handLabel(value) {
  const cat = value >>> 26;
  const primary = (value >>> 13) & 0x1fff;
  const secondary = value & 0x1fff;
  switch (cat) {
    case 0:
      return `${rankWord(highBit(secondary))}-high`;
    case 1:
      return `Pair of ${rankWord(highBit(primary), true)}`;
    case 2: {
      const [a, b] = bitsDesc(primary);
      return `Two pair, ${rankWord(a, true)} and ${rankWord(b, true)}`;
    }
    case 3:
      return `Trip ${rankWord(highBit(primary), true)}`;
    case 4:
      return `Straight, ${rankWord(primary - 1)}-high`;
    case 5:
      return `Flush, ${rankWord(highBit(secondary))}-high`;
    case 6:
      return `Full house, ${rankWord(highBit(primary), true)} full of ${rankWord(highBit(secondary), true)}`;
    case 7:
      return `Quad ${rankWord(highBit(primary), true)}`;
    case 8:
      return primary === 13 ? "Royal flush" : `Straight flush, ${rankWord(primary - 1)}-high`;
    default:
      return "";
  }
}

/* ---------- Omaha hands on a board ---------- */
const TRIPLES = [
  [0, 1, 2],
  [0, 1, 3],
  [0, 1, 4],
  [0, 2, 3],
  [0, 2, 4],
  [0, 3, 4],
  [1, 2, 3],
  [1, 2, 4],
  [1, 3, 4],
  [2, 3, 4],
];
// Precomputed partial masks for every three-card subset of the board.
export class Board {
  constructor(cards) {
    this.m1 = new Int32Array(10);
    this.m2 = new Int32Array(10);
    this.m3 = new Int32Array(10);
    this.suit = new Int8Array(10);
    this.n = 0;
    this.cards = [];
    if (cards) this.set(cards);
  }
  set(cards) {
    this.cards = cards;
    const k = cards.length;
    let n = 0;
    for (const [i, j, l] of TRIPLES) {
      if (l >= k) continue;
      const a = cards[i],
        b = cards[j],
        c = cards[l];
      const ba = 1 << (a >> 2),
        bb = 1 << (b >> 2),
        bc = 1 << (c >> 2);
      let m1 = ba,
        m2 = 0,
        m3 = 0;
      m2 |= m1 & bb;
      m1 |= bb;
      m3 |= m2 & bc;
      m2 |= m1 & bc;
      m1 |= bc;
      this.m1[n] = m1;
      this.m2[n] = m2;
      this.m3[n] = m3;
      this.suit[n] = (a & 3) === (b & 3) && (a & 3) === (c & 3) ? a & 3 : -1;
      n++;
    }
    this.n = n;
    return this;
  }
}
// Best five-card value using exactly hole cards a and b plus three board cards.
export function omahaValue(board, a, b) {
  const ba = 1 << (a >> 2),
    bb = 1 << (b >> 2);
  const sa = a & 3,
    sb = b & 3;
  const same = sa === sb;
  let best = 0;
  for (let t = 0; t < board.n; t++) {
    let m1 = board.m1[t],
      m2 = board.m2[t],
      m3 = board.m3[t],
      m4 = m3 & ba;
    m3 |= m2 & ba;
    m2 |= m1 & ba;
    m1 |= ba;
    m4 |= m3 & bb;
    m3 |= m2 & bb;
    m2 |= m1 & bb;
    m1 |= bb;
    const v = classify(m1, m2, m3, m4, same && board.suit[t] === sa);
    if (v > best) best = v;
  }
  return best;
}

// Forced split. `hand` is six cards; `board` is a Board with 3–5 cards.
// Writes the three pairs (hi, lo) into `cards[0..5]` and their values into
// `values[0..2]`. Returns values. Candidate pairs are scanned in descending
// (hi, lo) order with the hand sorted descending, so the first pair reaching a
// value wins ties: higher rank first, then spades > hearts > diamonds > clubs.
export function splitHand(hand, board, values = new Int32Array(3), cards = new Int32Array(6)) {
  const h = hand.slice().sort((a, b) => b - a);
  let used = 0;
  for (let k = 0; k < 2; k++) {
    let best = -1,
      bi = -1,
      bj = -1;
    for (let i = 0; i < 6; i++) {
      if (used & (1 << i)) continue;
      for (let j = i + 1; j < 6; j++) {
        if (used & (1 << j)) continue;
        const v = omahaValue(board, h[i], h[j]);
        if (v > best) {
          best = v;
          bi = i;
          bj = j;
        }
      }
    }
    values[k] = best;
    cards[2 * k] = h[bi];
    cards[2 * k + 1] = h[bj];
    used |= (1 << bi) | (1 << bj);
  }
  let p = 4;
  for (let i = 0; i < 6; i++) if (!(used & (1 << i))) cards[p++] = h[i];
  values[2] = omahaValue(board, cards[4], cards[5]);
  return values;
}
export function describeSplit(hand, boardCards) {
  const board = new Board(boardCards);
  const values = new Int32Array(3),
    cards = new Int32Array(6);
  splitHand(hand, board, values, cards);
  return [0, 1, 2].map((k) => ({
    cards: [cards[2 * k], cards[2 * k + 1]],
    value: values[k],
    label: handLabel(values[k]),
    category: values[k] >>> 26,
  }));
}

/* ---------- scoring ---------- */
// Net points for A against B given both players' three hand values.
export function pairNet(va, vb, oa = 0, ob = 0, scoring = SCORINGS.classic) {
  const pts = scoring.points;
  let net = 0,
    wa = 0,
    wb = 0;
  for (let h = 0; h < 3; h++) {
    const x = va[oa + h],
      y = vb[ob + h];
    if (x > y) {
      net += pts[h];
      wa++;
    } else if (x < y) {
      net -= pts[h];
      wb++;
    }
  }
  if (wa === 3) net += scoring.scoop;
  else if (wb === 3) net -= scoring.scoop;
  return net;
}
// Full settlement of a dealt table on a complete board: pairwise nets per hand.
export function settle(hands, boardCards, scoring = SCORINGS.classic) {
  const POINTS = scoring.points,
    SCOOP_BONUS = scoring.scoop;
  const n = hands.length;
  const board = new Board(boardCards);
  const splits = hands.map((h) => describeSplit(h, boardCards));
  const values = splits.map((s) => s.map((x) => x.value));
  const net = new Array(n).fill(0);
  const perHand = hands.map(() => [0, 0, 0]);
  const scoop = new Array(n).fill(0);
  const pairs = [];
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      let wi = 0,
        wj = 0;
      const detail = [];
      for (let h = 0; h < 3; h++) {
        const x = values[i][h],
          y = values[j][h];
        const d = x > y ? POINTS[h] : x < y ? -POINTS[h] : 0;
        if (d > 0) wi++;
        else if (d < 0) wj++;
        perHand[i][h] += d;
        perHand[j][h] -= d;
        net[i] += d;
        net[j] -= d;
        detail.push(d);
      }
      let bonus = 0;
      if (wi === 3) bonus = SCOOP_BONUS;
      else if (wj === 3) bonus = -SCOOP_BONUS;
      scoop[i] += bonus;
      scoop[j] -= bonus;
      net[i] += bonus;
      net[j] -= bonus;
      pairs.push({ i, j, hands: detail, bonus, net: detail.reduce((s, d) => s + d, 0) + bonus });
    }
  void board;
  return { splits, values, net, perHand, scoop, pairs };
}

/* ---------- runout statistics ---------- */
const CARD_BUF = new Int32Array(6);
// Accumulates sums over board completions. hands: n × 6 cards. boardCards:
// 0–5 known cards. deck: cards still available. Exact mode enumerates every
// completion (optionally only the slice partIndex of partCount, split on the
// first drawn card); sample mode draws `samples` random completions.
export function runoutStats(
  hands,
  boardCards,
  { deck, exact = true, samples = 10000, rng = Math.random, partIndex = 0, partCount = 1, scoring = SCORINGS.classic } = {},
) {
  scoring = scoringOf(scoring);
  const POINTS = scoring.points,
    SCOOP_BONUS = scoring.scoop;
  const n = hands.length;
  const sorted = hands.map((h) => h.slice().sort((a, b) => b - a));
  const need = 5 - boardCards.length;
  deck = deck ?? remainingDeck(hands, [boardCards]);
  const m = deck.length;
  const stats = {
    count: 0,
    ev: new Float64Array(n),
    evHand: new Float64Array(n * 3),
    evScoop: new Float64Array(n),
    win: new Float64Array(n * 3),
    tie: new Float64Array(n * 3),
    scoop: new Float64Array(n),
    hist: new Float64Array(2 * MAX_NET + 1),
    categories: new Float64Array(n * 3 * 9),
  };
  const values = new Int32Array(n * 3);
  const board = new Board();
  const full = boardCards.slice();
  const evaluate = () => {
    board.set(full);
    for (let i = 0; i < n; i++) {
      splitHand(sorted[i], board, values.subarray(i * 3, i * 3 + 3), CARD_BUF);
      for (let h = 0; h < 3; h++) stats.categories[(i * 3 + h) * 9 + (values[i * 3 + h] >>> 26)]++;
    }
    stats.count++;
    for (let i = 0; i < n; i++) {
      let allBest = true;
      for (let h = 0; h < 3; h++) {
        const v = values[i * 3 + h];
        let best = true,
          tied = false;
        for (let j = 0; j < n; j++) {
          if (j === i) continue;
          const w = values[j * 3 + h];
          if (w > v) {
            best = false;
            break;
          }
          if (w === v) tied = true;
        }
        if (best && !tied) stats.win[i * 3 + h]++;
        else if (best) stats.tie[i * 3 + h]++;
        if (!best || tied) allBest = false;
      }
      if (allBest) stats.scoop[i]++;
    }
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        let wi = 0,
          wj = 0,
          net = 0;
        for (let h = 0; h < 3; h++) {
          const x = values[i * 3 + h],
            y = values[j * 3 + h];
          if (x > y) {
            wi++;
            stats.evHand[i * 3 + h] += POINTS[h];
            stats.evHand[j * 3 + h] -= POINTS[h];
            net += POINTS[h];
          } else if (x < y) {
            wj++;
            stats.evHand[i * 3 + h] -= POINTS[h];
            stats.evHand[j * 3 + h] += POINTS[h];
            net -= POINTS[h];
          }
        }
        if (wi === 3) {
          stats.evScoop[i] += SCOOP_BONUS;
          stats.evScoop[j] -= SCOOP_BONUS;
          net += SCOOP_BONUS;
        } else if (wj === 3) {
          stats.evScoop[i] -= SCOOP_BONUS;
          stats.evScoop[j] += SCOOP_BONUS;
          net -= SCOOP_BONUS;
        }
        stats.ev[i] += net;
        stats.ev[j] -= net;
        if (n === 2) stats.hist[net + MAX_NET]++;
      }
  };
  if (need === 0) evaluate();
  else if (exact) {
    const base = boardCards.length;
    const rec = (start, depth) => {
      const left = need - depth;
      for (let i = start; i <= m - left; i++) {
        if (depth === 0 && i % partCount !== partIndex) continue;
        full[base + depth] = deck[i];
        if (left === 1) evaluate();
        else rec(i + 1, depth + 1);
      }
    };
    rec(0, 0);
    full.length = base;
  } else {
    const arr = deck.slice();
    const base = boardCards.length;
    for (let t = 0; t < samples; t++) {
      for (let k = 0; k < need; k++) {
        const i = k + Math.floor(rng() * (m - k));
        const c = arr[i];
        arr[i] = arr[k];
        arr[k] = c;
        full[base + k] = c;
      }
      evaluate();
    }
    full.length = base;
  }
  return stats;
}
export function mergeStats(parts) {
  const out = parts[0];
  for (let p = 1; p < parts.length; p++) {
    const s = parts[p];
    out.count += s.count;
    for (const key of ["ev", "evHand", "evScoop", "win", "tie", "scoop", "hist", "categories"])
      for (let i = 0; i < out[key].length; i++) out[key][i] += s[key][i];
  }
  return out;
}
// Averages a (merged) stats object into per-player numbers.
export function finishStats(stats, n) {
  const c = stats.count || 1;
  const players = [];
  for (let i = 0; i < n; i++)
    players.push({
      ev: stats.ev[i] / c,
      evHand: [0, 1, 2].map((h) => stats.evHand[i * 3 + h] / c),
      evScoop: stats.evScoop[i] / c,
      win: [0, 1, 2].map((h) => stats.win[i * 3 + h] / c),
      tie: [0, 1, 2].map((h) => stats.tie[i * 3 + h] / c),
      scoop: stats.scoop[i] / c,
      categories: [0, 1, 2].map((h) => Array.from(stats.categories.subarray((i * 3 + h) * 9, (i * 3 + h) * 9 + 9), (x) => x / c)),
    });
  const hist = n === 2 ? Array.from(stats.hist, (x) => x / c) : null;
  if (hist) {
    players[0].hist = hist;
    players[1].hist = hist.slice().reverse();
  }
  return { count: stats.count, players, hist };
}

// Statistics for one hand against a range of opponent hands. opponents is
// null (uniform over the unseen cards) or { hands, weights }. With a weighted
// range and at most one card to come the result is exact; otherwise sampled.
export function rangeStats(hero, boardCards, { opponents = null, samples = 20000, rng = Math.random, scoring = SCORINGS.classic } = {}) {
  scoring = scoringOf(scoring);
  const POINTS = scoring.points,
    SCOOP_BONUS = scoring.scoop;
  const need = 5 - boardCards.length;
  const h = hero.slice().sort((a, b) => b - a);
  const used = new Set([...h, ...boardCards]);
  const deck = FULL_DECK.filter((c) => !used.has(c));
  const out = {
    count: 0,
    weight: 0,
    ev: 0,
    evHand: new Float64Array(3),
    evScoop: 0,
    win: new Float64Array(3),
    tie: new Float64Array(3),
    scoop: 0,
    hist: new Float64Array(2 * MAX_NET + 1),
    exact: false,
  };
  const board = new Board();
  const vh = new Int32Array(3),
    vo = new Int32Array(3),
    buf = new Int32Array(6);
  const full = boardCards.slice();
  const evaluate = (opp, w) => {
    board.set(full);
    splitHand(h, board, vh, buf);
    splitHand(opp, board, vo, buf);
    let wins = 0,
      net = 0;
    for (let k = 0; k < 3; k++) {
      if (vh[k] > vo[k]) {
        wins++;
        out.win[k] += w;
        out.evHand[k] += w * POINTS[k];
        net += POINTS[k];
      } else if (vh[k] < vo[k]) {
        out.evHand[k] -= w * POINTS[k];
        net -= POINTS[k];
      } else out.tie[k] += w;
    }
    if (wins === 3) {
      out.scoop += w;
      out.evScoop += w * SCOOP_BONUS;
      net += SCOOP_BONUS;
    } else if (vh[0] < vo[0] && vh[1] < vo[1] && vh[2] < vo[2]) {
      out.evScoop -= w * SCOOP_BONUS;
      net -= SCOOP_BONUS;
    }
    out.ev += w * net;
    out.hist[net + MAX_NET] += w;
    out.weight += w;
    out.count++;
  };
  if (opponents) {
    const list = [];
    opponents.hands.forEach((hand, i) => {
      const w = opponents.weights[i];
      if (w > 0 && !hand.some((c) => used.has(c))) list.push({ hand: hand.slice().sort((a, b) => b - a), w });
    });
    if (!list.length) return finishRange(out);
    if (need <= 1) {
      out.exact = true;
      for (const { hand, w } of list) {
        if (need === 0) evaluate(hand, w);
        else {
          const rest = deck.filter((c) => !hand.includes(c));
          const wr = w / rest.length;
          for (const c of rest) {
            full[boardCards.length] = c;
            evaluate(hand, wr);
          }
          full.length = boardCards.length;
        }
      }
      return finishRange(out);
    }
    const cum = [];
    let acc = 0;
    for (const o of list) cum.push((acc += o.w));
    const arr = deck.slice();
    for (let s = 0; s < samples; s++) {
      const u = rng() * acc;
      let lo = 0,
        hi = cum.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cum[mid] < u) lo = mid + 1;
        else hi = mid;
      }
      const opp = list[lo].hand;
      let k = 0;
      while (k < need) {
        const i = k + Math.floor(rng() * (arr.length - k));
        const c = arr[i];
        if (opp.includes(c)) continue;
        arr[i] = arr[k];
        arr[k] = c;
        full[boardCards.length + k] = c;
        k++;
      }
      evaluate(opp, 1);
    }
    full.length = boardCards.length;
    return finishRange(out);
  }
  const arr = deck.slice();
  const m = arr.length;
  const opp = new Array(6);
  for (let s = 0; s < samples; s++) {
    for (let k = 0; k < 6 + need; k++) {
      const i = k + Math.floor(rng() * (m - k));
      const c = arr[i];
      arr[i] = arr[k];
      arr[k] = c;
      if (k < 6) opp[k] = c;
      else full[boardCards.length + k - 6] = c;
    }
    evaluate(opp, 1);
  }
  full.length = boardCards.length;
  return finishRange(out);
}
function finishRange(out) {
  return out;
}
export function mergeRange(parts) {
  const o = parts[0];
  for (let p = 1; p < parts.length; p++) {
    const s = parts[p];
    o.count += s.count;
    o.weight += s.weight;
    o.ev += s.ev;
    o.evScoop += s.evScoop;
    o.scoop += s.scoop;
    for (let k = 0; k < 3; k++) {
      o.evHand[k] += s.evHand[k];
      o.win[k] += s.win[k];
      o.tie[k] += s.tie[k];
    }
    for (let k = 0; k < o.hist.length; k++) o.hist[k] += s.hist[k];
  }
  return o;
}
export function finishRangeStats(r) {
  const w = r.weight || 1;
  return {
    ev: r.ev / w,
    evHand: Array.from(r.evHand, (x) => x / w),
    evScoop: r.evScoop / w,
    win: Array.from(r.win, (x) => x / w),
    tie: Array.from(r.tie, (x) => x / w),
    scoop: r.scoop / w,
    hist: Array.from(r.hist, (x) => x / w),
    count: r.count,
    exact: r.exact,
  };
}
export function completions(n, boardLength) {
  return binomial(52 - 6 * n - boardLength, 5 - boardLength);
}

/* ---------- doubling cube ---------- */
// Cube play for two players. See cube-rules.mjs for the raise chain. The
// functions here value decisions with both hands face up (used once hands are
// tabled, and for the face-up comparison); the hidden-information equilibrium
// lives in solver.mjs.
const STREET_NAMES = { preflop: "preflop", flop: "flop", river: "river" };
function makeVariant(id, streets) {
  const list = streets.map((x) => STREET_NAMES[x]);
  const name = `${list.map((x, i) => (i === 0 ? x[0].toUpperCase() + x.slice(1) : x)).join(list.length === 3 ? ", " : " and ")} cube`;
  const blurb =
    streets.length === 1
      ? `The button may double on the ${list[0]}.`
      : `Cube streets: ${list.join(", ")}. The button has the first option. Whoever takes a raise holds the cube and has the option on the next cube street; whoever passes up the option hands it to the opponent for the next cube street.`;
  return { id, name, short: streets.map((x) => x[0].toUpperCase()).join("+"), streets, blurb, flopActor: streets.includes("flop") ? "btn" : null, riverActor: streets.includes("river") ? "btn" : null };
}
export const VARIANTS = {
  p: makeVariant("p", ["preflop"]),
  f: makeVariant("f", ["flop"]),
  r: makeVariant("r", ["river"]),
  pf: makeVariant("pf", ["preflop", "flop"]),
  pr: makeVariant("pr", ["preflop", "river"]),
  fr: makeVariant("fr", ["flop", "river"]),
  pfr: makeVariant("pfr", ["preflop", "flop", "river"]),
};
export const VARIANT_ORDER = ["p", "f", "r", "pf", "pr", "fr", "pfr"];
const VARIANT_ALIASES = { flop: "f", river: "r", both: "fr" };
export const variantOf = (v) => (typeof v === "string" ? (VARIANTS[v] ?? VARIANTS[VARIANT_ALIASES[v]]) : v);
export const STREETS = ["preflop", "flop", "turn", "river"];
export const DEFAULT_CUBE = () => ({ level: 1, owner: null });
// Who may double on `street` (seat index), or null when there is no cube action
// there. cube.owner is the seat holding the cube option: null until the first
// cube action (the button starts with the option); after a take the taker
// holds it, after a pass the opponent of the passer holds it.
export function actorOn(variant, street, btn, cube = DEFAULT_CUBE()) {
  const v = variantOf(variant);
  if (!v.streets.includes(street)) return null;
  if (cube.level >= MAX_CUBE) return null;
  return cube.owner ?? btn;
}
// Holder of the option after a chain outcome: m = 0 (no raise) hands it to the
// opponent of the actor; raise m taken leaves it with the taker (the responder
// of raise m: the opponent for odd m, the actor for even m).
export function holderAfter(actor, m) {
  if (m === 0) return 1 - actor;
  return m % 2 === 1 ? 1 - actor : actor;
}
export const flopActor = (variant, btn, cube) => actorOn(variant, "flop", btn, cube);
export const riverActor = (variant, btn, cube) => actorOn(variant, "river", btn, cube);
// Cube streets of the variant after `street`.
export function laterCubeStreets(variant, street) {
  const v = variantOf(variant);
  const i = STREETS.indexOf(street);
  return v.streets.filter((s) => STREETS.indexOf(s) > i);
}
// Face-up view of what follows the current decision: only a river that is the
// sole remaining cube street is valued exactly (last-roll rule); earlier
// streets would need per-board distributions and are treated as cubeless.
export function riverAfter(variant, street, btn, cube, actorSeat) {
  const later = laterCubeStreets(variant, street);
  if (later.length !== 1 || later[0] !== "river") return "none";
  // After a take the responder owns the cube; after no double the cube is unchanged.
  // The face-up model needs one answer, so use the centered-cube actor (the no-double branch).
  const next = actorOn(variant, "river", btn, cube);
  if (next == null) return "none";
  return next === actorSeat ? "actor" : "opponent";
}
export function riverAfterFlop(variant) {
  const v = variantOf(variant);
  if (!v.streets.includes("river")) return "none";
  const flopIdx = v.streets.indexOf("flop");
  return v.streets.indexOf("river") - flopIdx === 1 && flopIdx === 0 ? "opponent" : v.streets.includes("flop") ? "opponent" : "actor";
}
const EPS = 1e-9;
// Face-up value of a raise chain from `base`. cont(L) is the actor-view value
// of playing on at level L. Returns per-node options in the chooser's view.
export function chainValues(cont, base, maxLevel = MAX_CUBE, dropUnit = DROP_UNIT) {
  const D = chainDepth(base, maxLevel);
  const val = new Array(D + 2).fill(0);
  const nodes = new Array(D + 1);
  for (let k = D; k >= 1; k--) {
    const actorActs = k % 2 === 0;
    const prev = levelAfter(base, k - 1),
      L = levelAfter(base, k);
    const drop = actorActs ? -dropUnit * prev : dropUnit * prev; // actor view
    const take = cont(L);
    const opts = [
      { id: "drop", eq: drop },
      { id: "take", eq: take },
    ];
    if (k < D) opts.push({ id: "reraise", eq: val[k + 1] });
    const pick = opts.reduce((m, o) => ((actorActs ? o.eq > m.eq + EPS : o.eq < m.eq - EPS) ? o : m), opts[0]);
    val[k] = pick.eq;
    const sign = actorActs ? 1 : -1;
    nodes[k] = {
      k,
      player: actorActs ? "actor" : "responder",
      offerLevel: L,
      prevLevel: prev,
      options: opts.map((o) => ({ id: o.id, label: optionLabel(o.id, k, base, base, dropUnit), eq: sign * o.eq, prob: o.id === pick.id ? 1 : 0 })),
      best: pick.id,
    };
  }
  const noDouble = cont(base);
  const double = D >= 1 ? val[1] : -Infinity;
  const best = D >= 1 && double > noDouble + EPS ? "double" : "noDouble";
  const options = [{ id: "noDouble", label: optionLabel("noDouble", 0, base, base), eq: noDouble, prob: best === "noDouble" ? 1 : 0 }];
  if (D >= 1) options.push({ id: "double", label: optionLabel("double", 0, base, base), eq: double, prob: best === "double" ? 1 : 0 });
  nodes[0] = { k: 0, player: "actor", offerLevel: levelAfter(base, 1), prevLevel: base, options, best };
  return { nodes, value: Math.max(noDouble, double), noDouble, double, best, depth: D };
}
export const riverBest = (x, level, dropUnit = DROP_UNIT) => chainValues((L) => L * x, level, MAX_CUBE, dropUnit).value;
export function continuationValue(x, level, riverAfter, dropUnit = DROP_UNIT) {
  if (riverAfter === "none") return x * level;
  if (riverAfter === "actor") return riverBest(x, level, dropUnit);
  return -riverBest(-x, level, dropUnit);
}
// Face-up analysis of the decision of the player to act, whose net result (at
// cube 1) over the remaining runouts has probability hist[x + MAX_NET].
// Equities are in points at the current cube from the chooser's view.
export function analyzeDecision({ hist, level = 1, riverAfter = "none", canDouble = true, dropUnit = DROP_UNIT }) {
  const expect = (f) => {
    let s = 0;
    for (let i = 0; i < hist.length; i++) if (hist[i]) s += hist[i] * f(i - MAX_NET);
    return s;
  };
  const cubeless = expect((x) => x);
  const winProb = expect((x) => (x > 0 ? 1 : x === 0 ? 0.5 : 0));
  const cont = (L) => expect((x) => continuationValue(x, L, riverAfter, dropUnit));
  const cv = chainValues(cont, level, canDouble ? MAX_CUBE : level, dropUnit);
  const n1 = cv.nodes[1];
  const tooGood = cv.best === "noDouble" && n1?.best === "drop" && cv.noDouble > dropUnit * level + EPS;
  return {
    level,
    riverAfter,
    canDouble,
    dropUnit,
    cubeless,
    winProb,
    noDouble: cv.noDouble,
    double: cv.double,
    doubleValue: cv.double,
    value: cv.value,
    best: cv.best,
    tooGood,
    gain: cv.double - cv.noDouble,
    response: n1?.best ?? null,
    beaverReply: cv.nodes[2]?.best ?? null,
    nodes: cv.nodes,
  };
}
// Value of the position for the actor's side when no decision is pending now.
export function positionValue({ hist, level = 1, riverAfter = "none", dropUnit = DROP_UNIT }) {
  let s = 0;
  for (let i = 0; i < hist.length; i++) if (hist[i]) s += hist[i] * continuationValue(i - MAX_NET, level, riverAfter, dropUnit);
  return s;
}
export function deltaHist(x) {
  const h = new Array(2 * MAX_NET + 1).fill(0);
  h[x + MAX_NET] = 1;
  return h;
}
export function flipHist(hist) {
  return hist.slice().reverse();
}
// Grades a chosen option at chain node k against the face-up analysis.
export function gradeChoice(a, k, chosen) {
  const node = typeof k === "number" ? a.nodes[k] : a.nodes[k === "double" ? 0 : k === "response" ? 1 : 2];
  const options = node.options.map((o) => ({ ...o }));
  const best = options.reduce((m, o) => (o.eq > m.eq + EPS ? o : m), options[0]);
  const alias = chosen === "beaver" || chosen === "raccoon" ? "reraise" : chosen;
  const pick = options.find((o) => o.id === alias) ?? best;
  return { options, best: best.id, chosen: pick.id, error: Math.max(0, best.eq - pick.eq) };
}
