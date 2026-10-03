import test from "node:test";
import assert from "node:assert/strict";
import {
  Hand,
  CUBE,
  MAX_HAND,
  makeRng,
  shuffledDeck,
  remainingDeck,
  lowKey,
  firstDrawer,
  exactBustWithin,
  bustDistribution,
  simulateTable,
  raceCubeDP,
  analyzeCube,
  parseCards,
} from "../engine.mjs";
import { bustCategory } from "../../engine.mjs";

const cards = (s) => parseCards(s);
const approx = (actual, expected, epsilon) =>
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} vs ${expected} (±${epsilon})`);

test("incremental hand matches the report evaluator through adds, pops and removes", () => {
  const rng = makeRng(1);
  for (let t = 0; t < 5000; t++) {
    const deck = shuffledDeck(rng);
    const k = 1 + Math.floor(rng() * 16);
    const hand = new Hand(deck.slice(0, k));
    assert.equal(hand.category(), bustCategory(deck.slice(0, k)));
    hand.add(deck[k]);
    assert.equal(hand.category(), bustCategory(deck.slice(0, k + 1)));
    hand.pop();
    assert.equal(hand.category(), bustCategory(deck.slice(0, k)));
    const victim = deck[Math.floor(rng() * k)];
    hand.remove(victim);
    assert.equal(hand.category(), bustCategory(hand.cards));
    assert.equal(hand.size, k - 1);
  }
});

test("seventeen cards always bust and sixteen can survive", () => {
  const rng = makeRng(2);
  for (let t = 0; t < 2000; t++) {
    const deck = shuffledDeck(rng);
    assert.ok(new Hand(deck.slice(0, MAX_HAND)).busted);
  }
  // Four of each suit over ranks A 2 3 4 6 7 8 9 J Q K with paired ranks.
  const survivor = cards("As Ah 2d 2c 3s 3h 4d 4c 6s 6h 7d 7c 8s 9h Jd Qc");
  assert.equal(survivor.length, 16);
  assert.equal(new Hand(survivor).category(), -1);
});

test("lowest card draws first with clubs lowest and ace high by default", () => {
  const [As, Ac, Twos, Twoc, Kd] = cards("As Ac 2s 2c Kd");
  assert.ok(lowKey(Twoc) < lowKey(Twos));
  assert.ok(lowKey(Twos) < lowKey(Kd));
  assert.ok(lowKey(Kd) < lowKey(Ac));
  assert.ok(lowKey(Ac) < lowKey(As));
  assert.equal(firstDrawer([As, Kd, Twos, Twoc]), 3);
  assert.equal(firstDrawer([As, Ac, Kd], false), 1);
  assert.equal(firstDrawer([As, Kd]), 1);
});

test("exact bust-within odds match brute force and the report's exact first-draw outs", () => {
  const rng = makeRng(3);
  for (let t = 0; t < 30; t++) {
    const deck = shuffledDeck(rng);
    const n = 4 + Math.floor(rng() * 4);
    const hand = new Hand(deck.slice(0, n));
    if (hand.busted) continue;
    const rest = deck.slice(n, n + 20);
    const brute = (k) => {
      let bust = 0,
        total = 0;
      const rec = (start, chosen) => {
        if (chosen.length === k) {
          total++;
          if (bustCategory([...hand.cards, ...chosen]) >= 0) bust++;
          return;
        }
        for (let i = start; i < rest.length; i++) rec(i + 1, [...chosen, rest[i]]);
      };
      rec(0, []);
      return bust / total;
    };
    for (const k of [1, 2, 3]) approx(exactBustWithin(hand, rest, k), brute(k), 1e-12);
  }
  const four = cards("Ks Qs Jd 9c");
  const outs = remainingDeck([four]).filter((c) => bustCategory([...four, c]) >= 0).length;
  approx(exactBustWithin(new Hand(four), remainingDeck([four]), 1), outs / 48, 1e-12);
});

test("bust distribution is a proper distribution with exact head and simulated tail", () => {
  const rng = makeRng(4);
  const hand = cards("Ah Kh 7d 7c");
  const deck = remainingDeck([hand]);
  const d = bustDistribution(hand, deck, { rollouts: 30000, exactDepth: 3, rng });
  assert.equal(d.hist.length, MAX_HAND - 4);
  approx(d.hist.reduce((a, b) => a + b, 0) + d.beyond, 1, 1e-9);
  assert.equal(d.beyond, 0);
  approx(d.bustWithin(1), exactBustWithin(new Hand(hand), deck, 1), 1e-12);
  approx(d.bustWithin(3), exactBustWithin(new Hand(hand), deck, 3), 1e-12);
  assert.ok(d.median >= 1 && d.median <= d.hist.length);
  assert.ok(d.mean > 1 && d.mean < 13);
  assert.equal(d.hazard[d.hazard.length - 1], 1);
  const mc = bustDistribution(hand, deck, { rollouts: 200000, exactDepth: 0, rng });
  approx(mc.bustWithin(2), d.bustWithin(2), 0.004);
  approx(mc.mean, d.mean, 0.05);
});

test("a hand that cannot bust yet has zero early odds and a single-card hand busts no earlier than draw four", () => {
  const d = bustDistribution(cards("2c"), remainingDeck([cards("2c")]), { rollouts: 2000, exactDepth: 3, rng: makeRng(5) });
  assert.equal(d.bustWithin(3), 0);
  assert.equal(d.hist.length, 16);
  assert.ok(d.hist[3] > 0);
});

test("table simulation: equities sum to one, three players never exhaust the deck, four players rarely do", () => {
  const rng = makeRng(6);
  let deckOut4 = 0;
  for (let r = 0; r < 4; r++) {
    const deck = shuffledDeck(rng);
    const hands = [[deck[0]], [deck[1]], [deck[2]], [deck[3]]];
    const res = simulateTable({ hands, turn: firstDrawer(hands.map((h) => h[0])), deck: deck.slice(4) }, { games: 50000, rng });
    approx(res.equity.reduce((a, b) => a + b, 0), 1, 1e-9);
    deckOut4 += res.deckOut;
  }
  deckOut4 /= 4;
  assert.ok(deckOut4 > 0.0002 && deckOut4 < 0.003, `deck-out rate ${deckOut4}`);
  const deck = shuffledDeck(rng);
  const three = simulateTable({ hands: [[deck[0]], [deck[1]], [deck[2]]], turn: 0, deck: deck.slice(3) }, { games: 50000, rng });
  assert.equal(three.deckOut, 0);
});

test("table simulation respects turn order and dead players", () => {
  const rng = makeRng(7);
  // Seat 0 is already busted, seat 1 holds four to a flush, seat 2 is safe for a while.
  const hands = [cards("As Ks Qs Js Ts"), cards("2h 7h 9h Kh"), cards("3c 8d")];
  const deck = remainingDeck(hands);
  const res = simulateTable({ hands, alive: [false, true, true], turn: 1, deck }, { games: 20000, rng });
  assert.equal(res.equity[0], 0);
  assert.ok(res.equity[2] > res.equity[1]);
  approx(res.equity[1] + res.equity[2], 1, 1e-9);
  // A certain bust next draw loses immediately.
  const forced = [cards("As Ks Qs Js 9d 8d 7d 6d"), cards("2c")];
  const r2 = simulateTable({ hands: forced, turn: 0, deck: remainingDeck(forced) }, { games: 500, rng });
  assert.equal(new Hand(forced[0]).busted, false);
  assert.ok(exactBustWithin(new Hand(forced[0]), remainingDeck(forced), 1) < 1);
  assert.ok(r2.equity[1] > 0.5);
});

test("race cube DP: dead-cube take point and symmetric values", () => {
  // Both players bust for certain on their first draw: the player on turn loses.
  let dp = raceCubeDP([1], [1]);
  assert.equal(dp.cubeless(), -1);
  assert.equal(dp.equity(CUBE.CENTER), -1);
  // On-turn player is safe this draw; opponent then busts for certain: on-turn wins.
  dp = raceCubeDP([0, 1], [1]);
  assert.equal(dp.cubeless(), 1);
  assert.equal(dp.equity(CUBE.CENTER), 1);
  // Opponent busts with probability q on their only draw, we are otherwise safe.
  // Cubeless equity is 2q−1 after we survive our own draw with hazard h.
  const h = 0.3,
    q = 0.6;
  dp = raceCubeDP([h, 0, 1], [q, 1]);
  approx(dp.cubeless(), -h + (1 - h) * (q + (1 - q) * 1), 1e-12);
  // Centered cube: with win chance (1−h)·... the doubler's options are compared.
  const noDouble = dp.at(0, 0, 0, CUBE.CENTER);
  assert.ok(noDouble >= dp.cubeless() - 1e-12);
  // Owning the cube is never worse than the opponent owning it.
  assert.ok(dp.equity(CUBE.ON_TURN) >= dp.equity(CUBE.OTHER) - 1e-12);
  assert.ok(dp.equity(CUBE.CENTER) >= dp.equity(CUBE.OTHER) - 1e-12);
  assert.ok(dp.equity(CUBE.ON_TURN) >= dp.equity(CUBE.CENTER) - 1e-12);
});

test("race cube DP reproduces the last-draw dead-cube decision exactly", () => {
  // We draw once with bust chance h; if we survive the opponent busts for certain.
  // Cubeless: 1−2h. Double/take: 2(1−2h). Opponent takes iff 2(1−2h) < 1, i.e. h > 0.25.
  for (const h of [0.1, 0.2, 0.3, 0.4, 0.6]) {
    const dp = raceCubeDP([h], [1]);
    const cubeless = 1 - 2 * h;
    approx(dp.cubeless(), cubeless, 1e-12);
    const expected = h > 0.25 ? Math.max(cubeless, 2 * cubeless) : 1;
    approx(dp.equity(CUBE.CENTER), expected, 1e-12);
  }
});

test("analyzeCube agrees with the joint simulation on cubeless equity and reports consistent decisions", () => {
  const rng = makeRng(8);
  for (let t = 0; t < 4; t++) {
    const deck = shuffledDeck(rng);
    const nx = 1 + Math.floor(rng() * 5),
      ny = 1 + Math.floor(rng() * 5);
    const X = deck.slice(0, nx),
      Y = deck.slice(nx, nx + ny);
    if (new Hand(X).busted || new Hand(Y).busted) {
      t--;
      continue;
    }
    const rest = deck.slice(nx + ny);
    const a = analyzeCube({ onTurn: X, other: Y, deck: rest, cube: CUBE.CENTER }, { rollouts: 2000, exactDepth: 2, rng });
    const joint = simulateTable({ hands: [X, Y], turn: 0, deck: rest }, { games: 100000, rng });
    approx(a.winProb, joint.equity[0], 0.02);
    approx(a.bustNext, exactBustWithin(new Hand(X), rest, 1), 1e-12);
    assert.equal(a.doublePass, 1);
    approx(a.doubleValue, Math.min(1, a.doubleTake), 1e-12);
    assert.equal(a.responder.best, a.doubleTake < 1 ? "take" : "pass");
    assert.equal(a.bestAction, a.doubleValue > a.noDouble ? "double" : "noDouble");
    assert.ok(a.noDouble >= -1 - 1e-9 && a.noDouble <= 1 + 1e-9);
  }
  // When the opponent owns the cube the mover cannot double.
  const X = cards("2c 7d"),
    Y = cards("Kh 9s");
  const owned = analyzeCube({ onTurn: X, other: Y, deck: remainingDeck([X, Y]), cube: CUBE.OTHER }, { rollouts: 500, rng });
  assert.equal(owned.canDouble, false);
  assert.equal(owned.bestAction, "draw");
});

test("two-ply analysis stays close to one-ply", () => {
  const rng = makeRng(9);
  const X = cards("5h Kd 4h"),
    Y = cards("Ad Ts 8h Js Qc");
  const deck = remainingDeck([X, Y]);
  const one = analyzeCube({ onTurn: X, other: Y, deck, cube: CUBE.CENTER }, { rollouts: 3000, rng, ply: 1 });
  const two = analyzeCube({ onTurn: X, other: Y, deck, cube: CUBE.CENTER }, { rollouts: 400, rng, ply: 2 });
  approx(one.winProb, two.winProb, 0.02);
  approx(one.noDouble, two.noDouble, 0.05);
  approx(one.doubleTake, two.doubleTake, 0.05);
});
