const assert = require("node:assert/strict");
const test = require("node:test");

const {
  PokerRushGame,
  PokerRushMultiplayerGame,
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

test("best scoring hand breaks rank-equivalent ties by suit priority", () => {
  const best = findBestScoringHand(cards(["AH", "AS", "KH", "KS", "QD", "JC", "TS"]));
  assert.equal(best.evaluation.key, "straight");
  assert.deepEqual(
    best.cards.map((card) => card.baseId),
    ["AS", "KS", "QD", "JC", "TS"],
  );
});

test("hands are sorted by rank then suit after deal and scoring replacement", () => {
  const game = new PokerRushGame({
    seed: "sort-and-score",
    now: 1,
    handSize: 7,
    discardMode: "bottom",
    timeLimit: 0,
    endMode: "discards",
  });
  game.hand = cards(["2C", "AS", "2S", "KH", "KD", "KC", "KS"]);
  game.deck = cards(["9C", "8D", "7H", "4S", "3C"]);
  game.scoredHands = [];
  game.score = 0;
  game.sortHand();
  assert.deepEqual(
    game.hand.map((card) => card.baseId),
    ["AS", "KS", "KH", "KD", "KC", "2S", "2C"],
  );
  game.resolveScores();
  assert.equal(game.scoredHands[0].evaluation.key, "four_kind");
  assert.equal(game.hand.length, 7);
  assert.deepEqual(
    game.hand.map((card) => card.baseId),
    ["9C", "8D", "7H", "4S", "3C", "2S", "2C"],
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

test("manual end game sets a player-ended reason", () => {
  const game = new PokerRushGame({
    seed: "manual-end",
    now: 1,
    handSize: 7,
    discardMode: "bottom",
    timeLimit: 0,
    endMode: "discards",
  });
  assert.equal(game.endGame(), true);
  assert.equal(game.status, "ended");
  assert.equal(game.endReason, "Ended by player");
});

test("multiplayer forces compatible discard mode and deals sorted player hands", () => {
  const game = new PokerRushMultiplayerGame(
    {
      seed: "multi-basic",
      now: 1,
      handSize: 5,
      discardMode: "bottom",
      timeLimit: 0,
      endMode: "discards",
    },
    [
      { id: "host", name: "Host" },
      { id: "guest", name: "Guest" },
    ],
  );
  assert.equal(game.options.discardMode, "random");
  assert.equal(game.players.length, 2);
  assert.equal(game.players[0].hand.length, 5);
  assert.equal(game.players[1].hand.length, 5);
  for (const player of game.players) {
    const sorted = player.hand.slice().sort((a, b) => {
      const rankDiff = b.value - a.value;
      if (rankDiff) return rankDiff;
      return { S: 4, H: 3, D: 2, C: 1 }[b.suit] - { S: 4, H: 3, D: 2, C: 1 }[a.suit];
    });
    assert.deepEqual(
      player.hand.map((card) => card.baseId),
      sorted.map((card) => card.baseId),
    );
  }
});

test("multiplayer draw positions spread players across the deck", () => {
  const game = new PokerRushMultiplayerGame(
    {
      seed: "multi-draw",
      now: 1,
      handSize: 5,
      discardMode: "random",
      timeLimit: 0,
      endMode: "discards",
    },
    [
      { id: "p1", name: "One" },
      { id: "p2", name: "Two" },
      { id: "p3", name: "Three" },
    ],
  );
  game.deck = cards(["AS", "KH", "QD", "JC", "TS"]);
  assert.equal(game.drawCardForPlayer("p1").baseId, "AS");
  assert.equal(game.drawCardForPlayer("p2").baseId, "JC");
  assert.equal(game.drawCardForPlayer("p3").baseId, "TS");
});

test("multiplayer views are per-player and host discard updates shared state", () => {
  const game = new PokerRushMultiplayerGame(
    {
      seed: "multi-view",
      now: 1,
      handSize: 5,
      discardMode: "random",
      timeLimit: 0,
      endMode: "discards",
    },
    [
      { id: "host", name: "Host" },
      { id: "guest", name: "Guest" },
    ],
  );
  game.players[0].hand = cards(["AS", "KH", "QD", "JC", "9S"]);
  game.players[1].hand = cards(["8S", "7H", "6D", "5C", "4S"]);
  game.deck = cards(["2C", "3D", "4H", "5S"]);
  game.players.forEach((player) => game.sortPlayerHand(player));
  const beforeGuest = game.viewForPlayer("guest");
  assert.deepEqual(
    beforeGuest.hand.map((card) => card.baseId),
    ["8S", "7H", "6D", "5C", "4S"],
  );
  const result = game.discardCard("host", 0);
  assert.equal(result.ok, true);
  const hostView = game.viewForPlayer("host");
  const guestView = game.viewForPlayer("guest");
  assert.equal(hostView.players.length, 2);
  assert.equal(guestView.players.length, 2);
  assert.equal(hostView.userDiscardCount, 1);
  assert.equal(guestView.userDiscardCount, 1);
  assert.notDeepEqual(
    hostView.hand.map((card) => card.baseId),
    beforeGuest.hand.map((card) => card.baseId),
  );
});
