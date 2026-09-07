const assert = require("node:assert/strict");

const Core = require("../../fantasyland-core.js");
const Game = require("../game.js");

function placementForAction(state) {
  const action = state.actionQueue[state.actionIndex];
  const player = state.players.find((entry) => entry.id === state.activePlayerId);
  const draw = player.draw.slice();
  const rowsByRound = action.round === 0
    ? ["top", "top", "top", "middle", "middle"]
    : action.round === 1
      ? ["middle", "middle"]
      : action.round === 2
        ? ["middle", "bottom"]
        : ["bottom", "bottom"];
  return {
    placements: rowsByRound.map((row, index) => ({ cardId: draw[index], row })),
    discards: draw.slice(rowsByRound.length),
  };
}

function playNaturalHand(state) {
  let next = state;
  while (next.phase === "placement") {
    next = Game.submitPlacement(next, next.activePlayerId, placementForAction(next));
  }
  return next;
}

{
  let state = Game.createGame([
    { id: "a", name: "Ada" },
    { id: "b", name: "Ben" },
  ], { variant: "high" }, "cadence");
  assert.equal(state.phase, "placement");
  assert.equal(state.actionQueue.length, 10, "two natural players take five turns each");
  assert.equal(state.players.find((player) => player.id === state.activePlayerId).draw.length, 5);

  const firstPlayer = state.activePlayerId;
  state = Game.submitPlacement(state, firstPlayer, placementForAction(state));
  assert.notEqual(state.activePlayerId, firstPlayer);
  assert.equal(state.players.find((player) => player.id === state.activePlayerId).draw.length, 5);
  state = Game.submitPlacement(state, state.activePlayerId, placementForAction(state));
  assert.equal(state.activePlayerId, firstPlayer);
  assert.equal(state.players.find((player) => player.id === state.activePlayerId).draw.length, 3);

  state = playNaturalHand(state);
  assert.equal(state.phase, "showdown");
  assert.equal(state.ledger.length, 1);
  state.players.forEach((player) => {
    assert.deepEqual(Object.fromEntries(Object.entries(player.board).map(([row, cards]) => [row, cards.length])), {
      top: 3,
      middle: 5,
      bottom: 5,
    });
    assert.equal(player.discards.length, 4);
    assert.ok(Number.isFinite(player.score));
    assert.ok(Number.isFinite(player.evaluation.points));
  });
}

{
  const state = Game.createGame([
    { id: "a", name: "Ada" },
    { id: "b", name: "Ben" },
  ], { variant: "high" }, "validation");
  const draw = state.players.find((player) => player.id === state.activePlayerId).draw;
  assert.throws(() => Game.submitPlacement(state, state.activePlayerId, {
    placements: draw.slice(0, 5).map((cardId) => ({ cardId, row: "top" })),
    discards: [],
  }), /Top is full/);
  assert.throws(() => Game.submitPlacement(state, state.activePlayerId, {
    placements: draw.slice(0, 4).map((cardId) => ({ cardId, row: "bottom" })),
    discards: [],
  }), /Set 5 cards/);
}

{
  const full = Game.createGame([
    { id: "a", name: "Ada" },
    { id: "b", name: "Ben" },
  ], { variant: "high" }, "privacy");
  const activeId = full.activePlayerId;
  const otherId = activeId === "a" ? "b" : "a";
  const otherView = Game.filterStateForPlayer(full, otherId);
  assert.equal("deck" in otherView, false);
  assert.ok(otherView.players.find((player) => player.id === activeId).draw.every((card) => card === "BACK"));
  const ownView = Game.filterStateForPlayer(full, activeId);
  assert.ok(ownView.players.find((player) => player.id === activeId).draw.every((card) => card !== "BACK"));
}

{
  const player = {
    inFantasyland: false,
    fantasyQueue: 0,
    nextFantasyCards: 14,
    evaluation: {
      legal: true,
      rowEvals: {
        top: { category: Core.CATEGORY.PAIR, mainRank: 13 },
        middle: { cribbagePoints: 0 },
        bottom: { category: Core.CATEGORY.HIGH },
      },
    },
  };
  Game.awardFantasyland(Game.normalizeSettings({ variant: "high", progressive: true }), player);
  assert.equal(player.fantasyQueue, 1);
  assert.equal(player.nextFantasyCards, 15, "progressive high awards 15 cards for kings");
}

{
  const player = {
    inFantasyland: false,
    fantasyQueue: 0,
    nextFantasyCards: 17,
    evaluation: {
      legal: true,
      rowEvals: {
        top: { wheel: true },
        middle: { wheel: true },
        bottom: { category: Core.CATEGORY.FLUSH },
      },
    },
  };
  Game.awardFantasyland(Game.normalizeSettings({ variant: "bdp", fantasyMode: "stack" }), player);
  assert.equal(player.fantasyQueue, 3, "BDP Natural triggers stack independently");
  assert.equal(player.nextFantasyCards, 17);
}

{
  const player = {
    inFantasyland: false,
    fantasyQueue: 0,
    nextFantasyCards: 14,
    evaluation: {
      legal: true,
      rowEvals: {
        top: { category: Core.CATEGORY.HIGH },
        middle: { cribbagePoints: 24 },
        bottom: { category: Core.CATEGORY.HIGH },
      },
    },
  };
  Game.awardFantasyland(Game.normalizeSettings({ variant: "cribbage", fantasyMode: "super" }), player);
  assert.equal(player.fantasyQueue, 1);
  assert.equal(player.nextFantasyCards, 15, "24 cribbage points earns an extra Fantasyland card");
}

console.log("OFC play game tests passed.");
