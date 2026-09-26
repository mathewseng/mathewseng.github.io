const assert = require("node:assert/strict");
const V = require("../evaluators.js");

const cards = (text) => V.parseCards(text);
const evaluate = (id, hand, ctx = {}) => V.evaluate(id, cards(hand), ctx);
const withBoard = (board, ctx = {}) => ({ ...ctx, board: cards(board) });

// Poker high
assert.equal(evaluate("poker-high", "As Ks Qs Js Ts").label, "Royal flush");
assert.equal(evaluate("poker-high", "5h 4h 3h 2h Ah").label, "Straight flush, Five high");
assert.equal(evaluate("poker-high", "5c 4d 3h 2s Ah").label, "Straight, Five high");
assert.equal(evaluate("poker-high", "Kc Kd Kh 9s 9d").label, "Full house, Kings full of Nines");
assert.equal(evaluate("poker-high", "Qc Qd 7h 7s 2d").label, "Two pair, Queens and Sevens");
assert.equal(evaluate("poker-high", "Ah Kd").label, "High card, Ace");
{
  const result = evaluate("poker-high", "Ah Kh", withBoard("Qh Jh Th 2c 3d"));
  assert.equal(result.label, "Royal flush");
  assert.deepEqual(result.usedBoard, [0, 1, 2]);
}
{
  const flush = evaluate("poker-high", "Ah 2h 7h 9h Jh");
  const straight = evaluate("poker-high", "9c Td Jh Qs Kd");
  assert.equal(V.compare("poker-high", flush, straight), 1);
  assert.deepEqual(V.rankResults("poker-high", [straight, flush, null]), [2, 1, 3]);
}
{
  const wild = V.evaluate("poker-high", [...cards("As Ad Ah"), { rank: "JK", suit: "x" }, ...cards("Ac")], { jokersWild: true });
  assert.equal(wild.label, "Five of a kind, Aces");
}

// Omaha must use exactly two hole cards and three board cards.
{
  const result = evaluate("poker-omaha", "Ah Kh Qh Jh", withBoard("2h 7c 8d 9s 3c"));
  assert.notEqual(result.short, "Flush");
  const flush = evaluate("poker-omaha", "Ah Kh 2c 3d", withBoard("4h 7h 9h Qs Jc"));
  assert.equal(flush.label, "Flush, Ace high");
}

// Lowball
assert.equal(evaluate("low-a5", "5c 4d 3h 2s Ah").label, "Wheel (5-4-3-2-A)");
assert.equal(evaluate("low-a5-8", "9c 4d 3h 2s Ah").label, "No low");
assert.equal(evaluate("low-a5-8", "8c 4d 3h 2s Ah").qualifies, true);
assert.equal(evaluate("low-27", "7c 5d 4h 3s 2c").label, "Number one (7-5-4-3-2)");
assert.equal(evaluate("low-27", "6c 5d 4h 3s 2c").short, "Straight");
assert.equal(V.compare("low-27", evaluate("low-27", "7c 5d 4h 3s 2c"), evaluate("low-27", "8c 5d 4h 3s 2c")), 1);
assert.equal(evaluate("badugi", "Ac 2d 3h 4s").label, "4-card badugi 4-3-2-A");
assert.equal(evaluate("badugi", "Ac 2c 3h 4s").value, 3);

// Casino
assert.equal(evaluate("blackjack", "Ah 6d").label, "Soft 17");
assert.equal(evaluate("blackjack", "Ah Kd").label, "Blackjack!");
assert.equal(evaluate("blackjack", "Th 9d 5c").label, "Bust (24)");
assert.equal(evaluate("blackjack", "2h 3d 4c 2s 5c", { charlie: 5 }).short, "Charlie");
assert.equal(evaluate("baccarat", "4h 5d").label, "Natural 9");
assert.equal(evaluate("baccarat", "Kh 7d 8c").value, 5);

// Cribbage
{
  const perfect = V.evaluate("cribbage-hand", cards("5c 5d 5h Js"), { starter: V.parseCard("5s") });
  assert.equal(perfect.value, 29);
  assert.equal(perfect.label, "29! Perfect hand");
}
{
  const hand = V.evaluate("cribbage-hand", cards("2h 4h 6h 8h"), { starter: V.parseCard("Kc") });
  assert.equal(hand.breakdown.find((part) => part.label === "Flush").points, 4);
  const crib = V.evaluate("cribbage-hand", cards("2h 4h 6h 8h"), { starter: V.parseCard("Kc"), isCrib: true });
  assert.equal(crib.breakdown.some((part) => part.label === "Flush"), false);
}
// Double run of three (6) plus a pair (2); no fifteens.
assert.equal(V.evaluate("cribbage-hand", cards("3c 4d 5h 5s"), {}).value, 8);
assert.equal(evaluate("cribbage-pegging", "Kh 5d").label, "Count 15 · last play +2 (15)");
assert.equal(evaluate("cribbage-pegging", "7h 7d 7c").value, 6);
assert.equal(evaluate("cribbage-pegging", "3h 5d 4c").value, 3);
assert.equal(evaluate("cribbage-pegging", "Kh Qd Jc Ah").count, 31);

// Gin
assert.equal(evaluate("gin-deadwood", "Ah 2h 3h 7c 7d 7s 9c 9d 9h Ks").value, 10);
assert.equal(evaluate("gin-deadwood", "Ah 2h 3h 7c 7d 7s 9c 9d 9h 4h").label, "Gin!");

// Open-face Chinese royalties
assert.equal(evaluate("ofc-top", "Qh Qd 2c").royalty, 7);
assert.equal(evaluate("ofc-top", "2h 2d 2c").royalty, 10);
assert.equal(evaluate("ofc-middle", "Ah 9h 7h 4h 2h").royalty, 8);
assert.equal(evaluate("ofc-bottom", "Kc Kd Kh 9s 9d").royalty, 6);
assert.equal(evaluate("ofc-middle", "Kc Kd").incomplete, true);

// Trick-taking and general
assert.equal(evaluate("hearts-points", "Qs 2h 5h Kc").value, 15);
assert.equal(evaluate("trick", "Kh Ah 2s").short, "A♥ wins");
assert.equal(evaluate("trick", "Kh Ah 2s", { trump: "s" }).short, "2♠ wins");
assert.equal(evaluate("pip-sum", "Ah Kd 5c", { faceTen: true }).value, 16);
assert.equal(evaluate("high-card", "9h Kd 5c").short, "K♦");
assert.equal(V.evaluate("count", cards("9h Kd 5c")).value, 3);
assert.equal(V.evaluate("set-summary", cards("9h 9d 5c 5s 5h")).label.startsWith("Trips: 5"), true);

// Hidden cards mark results partial but still evaluate the visible ones.
{
  const result = V.evaluate("poker-high", [...cards("Ah Ad"), { rank: null, suit: null }]);
  assert.equal(result.label, "Pair of Aces");
  assert.equal(result.partial, true);
}

// Equity: aces are a big favourite over kings preflop.
{
  const deck = [];
  for (const suit of "shdc") for (const rank of "23456789TJQKA") deck.push({ rank, suit });
  const hands = [cards("As Ah"), cards("Ks Kh")];
  const used = new Set(hands.flat().map((card) => card.rank + card.suit));
  const result = V.equity({
    evaluator: "poker-high",
    hands,
    board: [],
    boardSize: 5,
    deck: deck.filter((card) => !used.has(card.rank + card.suit)),
    iterations: 4000,
  });
  assert.ok(result.players[0].share > 0.74 && result.players[0].share < 0.89, "AA vs KK share " + result.players[0].share);
  assert.ok(Math.abs(result.players[0].share + result.players[1].share - 1) < 1e-9);
}

console.log("evaluator tests passed");
