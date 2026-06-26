const assert = require("node:assert/strict");
const test = require("node:test");

const {
  PokerRushGame,
  anyScorePossible,
  createDeck,
  evaluateFive,
  findBestScoringHand,
} = require("../game.js");

const deck = createDeck(4);
const byId = new Map(deck.map((card) => [card.baseId, card]));

function cards(ids) {
  return ids.map((id, index) => ({ ...byId.get(id), id: `${id}:${index}`, instanceId: index + 1 }));
}

test("scores every requested poker-rush category", () => {
  assert.equal(evaluateFive(cards(["AS", "KH", "QD", "JC", "TS"])).key, "straight");
  assert.equal(evaluateFive(cards(["AS", "QS", "8S", "5S", "3S"])).key, "flush");
  assert.equal(evaluateFive(cards(["AS", "AH", "AD", "KC", "KH"])).key, "full_house");
  assert.equal(evaluateFive(cards(["AS", "AH", "AD", "AC", "KH"])).key, "four_kind");
  assert.equal(evaluateFive(cards(["9H", "8H", "7H", "6H", "5H"])).key, "straight_flush");
  assert.equal(evaluateFive(cards(["AS", "KS", "QS", "JS", "TS"])).key, "royal_flush");
});

test("jokers complete premium hands as wild cards", () => {
  assert.equal(evaluateFive(cards(["AS", "KS", "QS", "JS", "X1"])).key, "royal_flush");
  assert.equal(evaluateFive(cards(["9H", "8H", "7H", "X1", "5H"])).key, "straight_flush");
  assert.equal(evaluateFive(cards(["AS", "AH", "AD", "X1", "KH"])).key, "four_kind");
});

test("best scoring hand is selected from a seven-card hand", () => {
  const best = findBestScoringHand(cards(["AS", "KS", "QS", "JS", "TS", "2C", "3D"]));
  assert.equal(best.evaluation.key, "royal_flush");
  assert.deepEqual(
    best.cards.map((card) => card.baseId),
    ["AS", "KS", "QS", "JS", "TS"],
  );
});

test("daily-style seeded games are deterministic for the same actions", () => {
  const options = {
    seed: "20260626",
    now: 1000,
    handSize: 7,
    jokers: 1,
    discardMode: "bottom",
    timeLimit: 0,
    endMode: "discards",
  };
  const first = new PokerRushGame(options);
  const second = new PokerRushGame(options);
  for (const index of [0, 3, 1, 6, 2, 0, 4]) {
    first.discardCard(Math.min(index, first.hand.length - 1));
    second.discardCard(Math.min(index, second.hand.length - 1));
  }
  assert.deepEqual(first.snapshot(), second.snapshot());
});

test("discard modes put cards in the requested destination", () => {
  const bottom = new PokerRushGame({
    seed: "mode-bottom",
    now: 1,
    handSize: 7,
    discardMode: "bottom",
    timeLimit: 0,
    endMode: "discards",
  });
  const bottomCard = bottom.hand[0];
  bottom.discardCard(0);
  assert.equal(bottom.deck.at(-1).baseId, bottomCard.baseId);

  const pile = new PokerRushGame({
    seed: "mode-pile",
    now: 1,
    handSize: 7,
    discardMode: "pile",
    timeLimit: 0,
    endMode: "discards",
  });
  const pileCard = pile.hand[0];
  pile.discardCard(0);
  assert.equal(pile.discardPile.at(-1).baseId, pileCard.baseId);

  const infinite = new PokerRushGame({
    seed: "mode-infinite",
    now: 1,
    handSize: 7,
    discardMode: "infinite",
    timeLimit: 0,
    endMode: "seen_count",
  });
  assert.equal(infinite.deck.length, 0);
  infinite.discardCard(0);
  assert.equal(infinite.deck.length, 0);
  assert.equal(infinite.discardPile.length, 0);
});

test("no-score end condition detects exhausted scoring potential", () => {
  assert.equal(anyScorePossible(cards(["AS", "KH", "QD", "JC"])), false);
  assert.equal(anyScorePossible(cards(["AS", "KH", "QD", "JC", "TS"])), true);
  assert.equal(anyScorePossible(cards(["AS", "2S", "3H", "4D", "5D"])), true);
});

test("time limit ends the game on tick", () => {
  const timed = new PokerRushGame({
    seed: "timer",
    now: 1000,
    handSize: 7,
    discardMode: "bottom",
    timeLimit: 15,
    endMode: "discards",
  });
  assert.equal(timed.status, "playing");
  timed.checkTime(17000);
  assert.equal(timed.status, "ended");
  assert.equal(timed.endReason, "Time expired");
});
