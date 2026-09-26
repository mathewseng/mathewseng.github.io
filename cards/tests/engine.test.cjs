const assert = require("node:assert/strict");
require("../evaluators.js");
const Engine = require("../engine.js");
const Presets = require("../presets.js");

Engine.setRng(Engine.seededRng("card-table-workshop"));

const zoneByKey = (state, key, area = "table") => Engine.orderedZones(state, area).find((zone) => zone.key === key);
const cardsInZones = (state) => Object.values(state.zones).reduce((sum, zone) => sum + zone.cards.length, 0);
const run = (state, label, actor = null) => {
  const macro = state.macros.find((entry) => entry.label === label);
  assert.ok(macro, "missing macro " + label);
  return Engine.reduce(state, { type: "runMacro", id: macro.id }, actor);
};

// Hold'em flow: deal, flop, turn, river, collect.
{
  let state = Engine.createTable(Presets.get("holdem"), { players: 4 });
  const deck = zoneByKey(state, "deck");
  assert.equal(deck.cards.length, 52);
  assert.equal(state.players.length, 4);
  state = run(state, "New hand");
  for (const player of state.players) assert.equal(zoneByKey(state, "hand", player.id).cards.length, 2);
  assert.equal(state.turn.dealer, 1);
  assert.equal(state.turn.index, 2);
  state = run(state, "Flop");
  state = run(state, "Turn");
  state = run(state, "River");
  const board = zoneByKey(state, "board");
  assert.equal(board.cards.length, 5);
  assert.ok(board.cards.every((id) => state.cards[id].faceUp));
  assert.equal(zoneByKey(state, "burn").cards.length, 3);
  assert.equal(zoneByKey(state, "deck").cards.length, 52 - 8 - 5 - 3);
  assert.equal(state.turn.phase, "River");
  state = Engine.reduce(state, { type: "collect", shuffle: true });
  assert.equal(zoneByKey(state, "deck").cards.length, 52);
  assert.ok(Object.values(state.cards).every((card) => !card.faceUp));
}

// Redacted views: owners see their private hand, others see placeholders.
{
  let state = Engine.createTable(Presets.get("holdem"), { players: 3 });
  state = run(state, "New hand");
  const [alice, bob] = state.players;
  const aliceView = Engine.viewFor(state, alice.id);
  const aliceHand = zoneByKey(aliceView, "hand", alice.id);
  const bobHand = zoneByKey(aliceView, "hand", bob.id);
  assert.ok(aliceHand.cards.every((id) => aliceView.cards[id].visible && aliceView.cards[id].rank));
  assert.ok(bobHand.cards.every((id) => id.startsWith("h:") && aliceView.cards[id].rank === null));
  assert.ok(zoneByKey(aliceView, "deck").cards.every((id) => id.startsWith("h:")));
  const spectator = Engine.viewFor(state, "__spectator");
  assert.ok(Object.values(spectator.cards).every((card) => card.hidden));
  const xray = Engine.viewFor(state, "*");
  assert.ok(Object.values(xray.cards).every((card) => card.visible));

  // A guest can act on a redacted card reference and the host resolves it.
  const hidden = zoneByKey(aliceView, "deck").cards.slice(-1)[0];
  const next = Engine.reduce(state, { type: "move", cards: [hidden], to: zoneByKey(state, "hand", alice.id).id }, alice.id);
  assert.equal(zoneByKey(next, "hand", alice.id).cards.length, 3);

  // Peeking reveals a face-down card only to the peeker.
  const boardCard = zoneByKey(next, "deck").cards.slice(-1)[0];
  const peeked = Engine.reduce(next, { type: "peek", cards: [boardCard] }, bob.id);
  assert.ok(Engine.viewFor(peeked, bob.id).cards[boardCard]?.visible);
  assert.equal(Engine.viewFor(peeked, alice.id).cards[boardCard], undefined);
}

// Zone references used by macros.
{
  const state = Engine.createTable(Presets.get("holdem"), { players: 3 });
  const current = state.players[state.turn.index];
  assert.equal(Engine.resolveZones(state, "hand").length, 3);
  assert.deepEqual(Engine.resolveZones(state, "hand@current"), [zoneByKey(state, "hand", current.id).id]);
  assert.deepEqual(Engine.resolveZones(state, "board"), [zoneByKey(state, "board").id]);
  assert.equal(Engine.dealOrder(state)[0].id, state.players[1].id);
}

// Moving inside a group reorders; drawing respects group limits.
{
  let state = Engine.createTable(Presets.get("ofc"), { players: 2 });
  const player = state.players[0];
  const top = zoneByKey(state, "top", player.id);
  state = Engine.reduce(state, { type: "deal", from: zoneByKey(state, "deck").id, to: top.id, count: 5 });
  assert.equal(zoneByKey(state, "top", player.id).cards.length, 3);
  const ids = zoneByKey(state, "top", player.id).cards.slice();
  state = Engine.reduce(state, { type: "move", cards: [ids[0]], to: top.id, index: 3 });
  assert.deepEqual(zoneByKey(state, "top", player.id).cards, [ids[1], ids[2], ids[0]]);
}

// Players, turns, scores and chips.
{
  let state = Engine.createTable(Presets.get("hearts"), { players: ["Ana", "Ben", "Cy", "Di"] });
  assert.equal(state.scores.lowWins, true);
  const [ana, ben, cy] = state.players;
  state = Engine.reduce(state, { type: "adjustScore", player: ana.id, delta: 13 });
  state = Engine.reduce(state, { type: "adjustScore", player: ben.id, delta: 4 });
  state = Engine.reduce(state, { type: "nextRound" });
  state = Engine.reduce(state, { type: "adjustScore", player: ben.id, delta: 26 });
  assert.equal(state.scores.rounds.length, 2);
  assert.deepEqual(Engine.totals(state), { [ana.id]: 13, [ben.id]: 30, [cy.id]: 0, [state.players[3].id]: 0 });
  assert.deepEqual(Engine.leaders(state), [cy.id, state.players[3].id]);

  state = Engine.reduce(state, { type: "updatePlayer", player: ben.id, patch: { out: true } });
  state = Engine.reduce(state, { type: "setTurn", index: 0 });
  state = Engine.reduce(state, { type: "nextTurn" });
  assert.equal(state.players[state.turn.index].id, cy.id);

  // Ben sits out, so only three hands are dealt.
  state = run(state, "Deal all");
  assert.equal(zoneByKey(state, "hand", ben.id).cards.length, 0);
  const deckBefore = zoneByKey(state, "deck").cards.length;
  const handBefore = zoneByKey(state, "hand", cy.id).cards.length;
  assert.equal(deckBefore, 13);
  state = Engine.reduce(state, { type: "removePlayer", player: cy.id });
  assert.equal(state.players.length, 3);
  assert.equal(zoneByKey(state, "deck").cards.length, deckBefore + handBefore);
  assert.equal(cardsInZones(state), 52);
}
{
  let state = Engine.createTable(Presets.get("holdem"), { players: 3 });
  const [a, b, c] = state.players;
  assert.equal(a.chips, 1000);
  state = Engine.reduce(state, { type: "runMacro", steps: [{ op: "ante", amount: 10 }] });
  state = Engine.reduce(state, { type: "bet", player: a.id, amount: 50 });
  assert.equal(state.pot, 80);
  state = Engine.reduce(state, { type: "award", players: [a.id, b.id] });
  assert.equal(state.pot, 0);
  const chips = Object.fromEntries(state.players.map((player) => [player.id, player.chips]));
  assert.equal(chips[a.id] + chips[b.id] + chips[c.id], 3000);
  assert.equal(chips[c.id], 990);
  state = Engine.reduce(state, { type: "transfer", from: a.id, to: c.id, amount: 25 });
  assert.equal(state.players.find((player) => player.id === c.id).chips, 1015);
}

// Deck building, custom cards and removal.
{
  assert.equal(Engine.deckSize({ preset: "pinochle" }), 48);
  assert.equal(Engine.deckSize({ preset: "standard", decks: 6 }), 312);
  assert.equal(Engine.deckSize({ preset: "short", jokers: 2 }), 38);
  let state = Engine.createTable(Presets.get("sandbox"), { players: 2 });
  state = Engine.reduce(state, { type: "rebuildDeck", spec: { preset: "euchre", custom: [{ label: "Skip", text: "Next player loses a turn", count: 3, value: 20 }] } });
  assert.equal(Object.keys(state.cards).length, 27);
  assert.equal(Object.values(state.cards).filter((card) => card.custom).length, 3);
  state = Engine.reduce(state, { type: "addCards", cards: [{ rank: "A", suit: "s" }, { rank: "ZZ", suit: "q" }] });
  assert.equal(Object.keys(state.cards).length, 28);
  const some = zoneByKey(state, "deck").cards.slice(0, 2);
  state = Engine.reduce(state, { type: "removeCards", cards: some });
  assert.equal(Object.keys(state.cards).length, 26);
  assert.equal(cardsInZones(state), 26);
}

// Groups: per-seat templates, updates across seats, deletion returns cards.
{
  let state = Engine.createTable(Presets.get("sandbox"), { players: 3 });
  state = Engine.reduce(state, { type: "addZone", perPlayer: true, zone: { name: "Tableau", layout: "grid", evals: ["pip-sum"] } });
  const keys = state.players.map((player) => Engine.orderedZones(state, player.id).map((zone) => zone.key));
  assert.ok(keys.every((list) => list.includes("tableau")));
  const first = zoneByKey(state, "tableau", state.players[0].id);
  state = Engine.reduce(state, { type: "updateZone", zone: first.id, patch: { visibility: "owner", layout: "bogus" }, allSeats: true });
  assert.ok(state.players.every((player) => zoneByKey(state, "tableau", player.id).visibility === "owner"));
  assert.equal(zoneByKey(state, "tableau", state.players[1].id).layout, "grid");
  state = Engine.reduce(state, { type: "deal", from: zoneByKey(state, "deck").id, to: "tableau", count: 2 });
  state = Engine.reduce(state, { type: "removeZone", zone: first.id, allSeats: true });
  assert.ok(state.players.every((player) => !zoneByKey(state, "tableau", player.id)));
  assert.equal(zoneByKey(state, "deck").cards.length, 52);
  assert.equal(state.seatTemplate.some((tpl) => tpl.key === "tableau"), false);
}

// Saved designs round-trip into new tables; bad files are rejected.
{
  let state = Engine.createTable(Presets.get("cribbage"), { players: 2 });
  state = Engine.reduce(state, { type: "saveMacro", macro: { label: "Peg 2", steps: [{ op: "log", text: "two" }, { op: "bogus" }] } });
  const preset = Engine.toPreset(state);
  assert.equal(preset.macros.find((macro) => macro.label === "Peg 2").steps.length, 1);
  const copy = Engine.createTable(preset, { players: 3 });
  assert.equal(copy.players.length, 3);
  assert.equal(copy.scores.target, 121);
  assert.equal(copy.pegTarget, 121);
  assert.deepEqual(copy.seatTemplate.map((tpl) => tpl.key), ["hand", "played"]);
  assert.throws(() => Engine.migrate({ hello: "world" }), /not a saved card table/);
  const loaded = Engine.reduce(state, { type: "load", state: JSON.parse(JSON.stringify(copy)) });
  assert.equal(loaded.players.length, 3);
  assert.ok(loaded.rev > state.rev);
}

// Every preset builds and every action runs without losing a card.
for (const preset of Presets.PRESETS) {
  let state = Engine.createTable(preset, {});
  const total = Object.keys(state.cards).length;
  assert.equal(total, Engine.deckSize(preset.deck), preset.id);
  for (const macro of state.macros) {
    state = Engine.reduce(state, { type: "runMacro", id: macro.id }, state.players[0]?.id || null);
    assert.equal(cardsInZones(state), total, `${preset.id}: ${macro.label}`);
  }
  assert.ok(Engine.viewFor(state, state.players[0]?.id || "__spectator"));
}
assert.equal(Presets.PRESETS.length, 30);

console.log("engine tests passed");
