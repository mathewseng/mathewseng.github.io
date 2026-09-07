const assert = require("node:assert/strict");
const Catalog = require("../game-catalog.js");
const Engine = require("../engine.js");

const players = (count) => Array.from({ length: count }, (_, index) => ({ id: String(index + 1), name: "P" + (index + 1) }));

function finishBetting(state) {
  let next = state;
  while (next.stage === "betting") {
    const legal = Engine.legalActions(next, next.activePlayerId);
    next = Engine.act(next, next.activePlayerId, { type: legal.canCall ? "call" : "check" });
  }
  return next;
}

function finishCommunity(state) {
  let next = state;
  while (next.phase !== "showdown") next = finishBetting(next);
  return next;
}

{
  let state = Engine.createTable(players(2), {
    seats: 2,
    games: ["nlh"],
    startingStack: 1000,
    smallBlind: 5,
    bigBlind: 10,
  }, "holdem");
  state = Engine.startHand(state);
  assert.equal(state.gameId, "nlh");
  assert.equal(state.street, "Preflop");
  assert.equal(state.players[0].hole.length, 2);
  assert.equal(state.players[0].streetBet, 5, "heads-up button posts the small blind");
  assert.equal(state.players[1].streetBet, 10);
  assert.equal(state.activePlayerId, "1", "heads-up button acts first preflop");
  state = finishCommunity(state);
  assert.equal(state.boards[0].length, 5);
  assert.equal(state.ledger.length, 1);
  assert.equal(state.players.reduce((sum, player) => sum + player.stack, 0), 2000);
}

{
  let state = Engine.createTable(players(3), {
    seats: 3,
    games: ["27-td"],
    startingStack: 1000,
  }, "triple-draw");
  state = Engine.startHand(state);
  for (let draw = 1; draw <= 3; draw += 1) {
    state = finishBetting(state);
    assert.equal(state.stage, "draw");
    assert.equal(state.drawNumber, draw);
    while (state.stage === "draw") state = Engine.submitDraw(state, state.activePlayerId, []);
  }
  state = finishBetting(state);
  assert.equal(state.phase, "showdown");
  state.players.forEach((player) => assert.equal(player.hole.length, 5));
}

{
  let state = Engine.createTable(players(3), {
    seats: 3,
    games: ["super-stud8"],
    startingStack: 1000,
  }, "super-stud");
  state = Engine.startHand(state);
  state.players.forEach((player) => {
    assert.equal(player.down.length, 4);
    assert.equal(player.up.length, 1);
  });
  state = finishBetting(state);
  assert.equal(state.stage, "discard");
  while (state.stage === "discard") {
    const player = state.players.find((entry) => entry.id === state.activePlayerId);
    state = Engine.submitSuperDiscard(state, player.id, player.down.slice(0, 2));
  }
  while (state.phase !== "showdown") state = finishBetting(state);
  state.players.forEach((player) => assert.equal(player.down.length + player.up.length + (state.sharedStudCard ? 1 : 0), 7));
}

{
  let state = Engine.createTable(players(3), {
    seats: 3,
    games: ["zombie"],
    startingStack: 1000,
    bombAnte: 10,
  }, "zombie");
  state = Engine.startHand(state);
  assert.equal(state.street, "Flop");
  assert.equal(state.isBombPot, true);
  state = Engine.act(state, state.activePlayerId, { type: "fold" });
  assert.equal(state.zombieBoards.length, 1);
  assert.equal(state.zombieBoards[0].length, 5);
}

{
  const state = Engine.createTable(players(3), { seats: 3, games: ["nlh"] }, "side-pots");
  state.players[0].totalCommitted = 50;
  state.players[1].totalCommitted = 100;
  state.players[2].totalCommitted = 100;
  const pots = Engine.buildSidePots(state);
  assert.deepEqual(pots.map((pot) => pot.amount), [150, 100]);
  assert.deepEqual(pots[1].contributors, ["2", "3"]);
}

for (const game of Catalog.GAMES) {
  let state = Engine.createTable(players(2), {
    seats: 2,
    games: [game.id],
    startingStack: 5000,
  }, "catalog-" + game.id);
  state = Engine.startHand(state);
  let steps = 0;
  while (state.phase !== "showdown" && steps < 100) {
    steps += 1;
    if (state.stage === "betting") {
      const legal = Engine.legalActions(state, state.activePlayerId);
      state = Engine.act(state, state.activePlayerId, { type: legal.canCall ? "call" : "check" });
    } else if (state.stage === "draw") {
      state = Engine.submitDraw(state, state.activePlayerId, []);
    } else if (state.stage === "discard") {
      const player = state.players.find((entry) => entry.id === state.activePlayerId);
      state = Engine.submitSuperDiscard(state, player.id, player.down.slice(0, 2));
    } else {
      throw new Error(game.id + " stalled in " + state.stage);
    }
  }
  assert.equal(state.phase, "showdown", game.id + " reaches showdown");
  assert.equal(state.players.reduce((sum, player) => sum + player.stack, 0), 10000, game.id + " conserves chips");
}

console.log("Mixed poker engine tests passed.");
