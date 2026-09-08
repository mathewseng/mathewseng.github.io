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
    const player = next.players.find((p) => p.id === next.activePlayerId);
    next = Game.submitPlacement(next, Game.ownerId(player), placementForAction(next));
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

const people = [{ id: "a", name: "Ada" }, { id: "b", name: "Ben" }];

{
  assert.equal(Game.normalizeSettings().fantasyMode, "none");
  assert.equal(Game.normalizeSettings().progressive, false);
  assert.equal(Game.normalizeSettings({ variant: "high", ultimate: true }).ultimate, false);
  assert.equal(Game.normalizeSettings({ variant: "progressive", ultimate: true }).ultimate, true);
  assert.equal(Game.normalizeSettings({ variant: "low" }).fantasyMode, "super");
  assert.throws(() => Game.normalizeSettings({ variant: "dealerschoice", dealerChoices: [] }), /Enable at least one/);
  for (const mode of ["none", "super", "stack"]) {
    const p = { inFantasyland: true, fantasyQueue: 0, currentFantasyCards: 17, evaluation: { legal: true, repeatMask: 5 } };
    Game.awardFantasyland(Game.normalizeSettings({ fantasyMode: mode }), p);
    assert.equal(p.nextFantasyCards, mode === "super" ? 15 : 14);
    assert.equal(p.fantasyQueue, mode === "stack" ? 2 : 1);
  }
  for (const ultimate of [true, false]) {
    const p = { inFantasyland: true, fantasyQueue: 0, currentFantasyCards: 17, evaluation: { legal: true, repeatMask: 5 } };
    Game.awardFantasyland(Game.normalizeSettings({ variant: "progressive", ultimate }), p);
    assert.equal(p.nextFantasyCards, ultimate ? 17 : 14);
  }
}

{
  let state = Game.createGame(people, { variant: "dealerschoice", dealerChoices: ["low", "progressive"] }, "dealer");
  assert.equal(state.phase, "choose-variant");
  assert.equal(state.deck.length, 42);
  assert.ok(state.players.every((p) => p.draw.length === 5));
  const original = state.players.map((p) => p.draw.slice());
  assert.throws(() => Game.chooseVariant(state, "b", "low"), /Only BTN/);
  assert.throws(() => Game.chooseVariant(state, "a", "cribbage"), /not enabled/);
  assert.throws(() => Game.submitPlacement(state, "a", {}), /not accepting/);
  state = Game.chooseVariant(state, "a", "progressive");
  assert.equal(Game.scoringVariant(state), "high");
  assert.equal(state.phase, "placement");
  assert.deepEqual(state.players.map((p) => p.draw), original, "choosing does not redeal or consume extra cards");
  assert.throws(() => Game.chooseVariant(state, "a", "low"), /already chosen/);
  state = playNaturalHand(state);
  assert.equal(state.ledger[0].variant, "progressive");
  state = Game.startHand(state);
  assert.equal(state.phase, "choose-variant");
  assert.equal(state.buttonIndex, 1);
}

{
  let state = Game.createGame(people, { seats: "2btn" }, "double-button");
  assert.equal(state.settings.seats, 2);
  assert.equal(state.players.length, 3);
  assert.deepEqual(state.actionQueue.slice(0, 6).map((a) => a.playerId), ["b", "a", "a:second", "b", "a", "a:second"]);
  state = Game.submitPlacement(state, "b", placementForAction(state));
  assert.equal(state.players[2].draw.length, 0, "second hand draw is not dealt until its turn");
  assert.throws(() => Game.submitPlacement(state, "b", placementForAction(state)), /Wait for your turn/);
  state = Game.submitPlacement(state, "a", placementForAction(state));
  assert.equal(state.activePlayerId, "a:second");
  const view = Game.filterStateForPlayer(state, "a");
  assert.equal(view.players[2].draw.length, 5);
  assert.ok(view.players[2].draw.every((id) => id !== "BACK"));
  assert.throws(() => Game.submitPlacement(state, "a:second", placementForAction(state)), /Wait for your turn/);
  state = Game.submitPlacement(state, "a", placementForAction(state));
  state = playNaturalHand(state);
  assert.equal(state.handResult.pairResults.length, 2, "owned boards never score against each other");
  assert.equal(state.players[0].score + state.players[1].score, 0);
  assert.equal(state.players[2].score, 0);
  assert.deepEqual(Object.keys(state.ledger[0].deltas), ["a", "b"]);
  const placed = state.players.flatMap((p) => Object.values(p.board).flat().concat(p.discards));
  assert.equal(new Set(placed).size, 51, "three natural boards use distinct cards");
  state.players[2].fantasyQueue = 1;
  state.players[2].nextFantasyCards = 16;
  state = Game.startHand(state);
  assert.equal(state.players[2].ownerId, "b");
  assert.equal(state.extraHands.a.fantasyQueue, 1, "extra-hand FL stays with its owner");
  state.players.forEach((p) => { p.fantasyQueue = 0; });
  state = Game.startHand(state);
  assert.equal(state.players[2].ownerId, "a");
  assert.equal(state.players[2].inFantasyland, true);
  assert.equal(state.players[2].currentFantasyCards, 16);
  assert.deepEqual(state.actionQueue.slice(0, 3).map((a) => a.playerId), ["b", "a", "a:second"], "a fantasy extra hand still follows BTN's first hand");
}

{
  let state = Game.createGame(people, { seats: "2btn", variant: "dealerschoice" }, "private-choice");
  const view = Game.filterStateForPlayer(state, "a");
  assert.ok(view.players[0].draw.every((id) => id !== "BACK"));
  assert.ok(view.players[2].draw.every((id) => id === "BACK"), "BTN cannot preview second hand while choosing");
  assert.equal("seed" in view, false);
  assert.equal("extraHands" in view, false);
  state = Game.chooseVariant(state, "a", "high");
  state = Game.submitPlacement(state, "b", placementForAction(state));
  assert.ok(Game.filterStateForPlayer(state, "a").players[2].draw.every((id) => id === "BACK"));
  state = Game.submitPlacement(state, "a", placementForAction(state));
  assert.ok(Game.filterStateForPlayer(state, "a").players[2].draw.every((id) => id !== "BACK"));
  state = playNaturalHand(state);
  assert.equal(state.phase, "showdown");
}

for (const variant of Game.VARIANTS.filter((v) => v !== "dealerschoice")) {
  const players = [...people, { id: "c", name: "Cal" }];
  const state = playNaturalHand(Game.createGame(players, { seats: 3, variant }, "all-variants"));
  assert.equal(state.phase, "showdown");
  assert.equal(state.players.reduce((sum, p) => sum + p.score, 0), 0, variant + " is zero-sum");
  assert.ok(state.players.every((p) => Number.isFinite(p.score)));
}
console.log("Dealer's Choice, Progressive, multiple FL, and 2 on BTN tests passed.");
