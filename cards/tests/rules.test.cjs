const assert = require("node:assert/strict");
const V = require("../evaluators.js");
const Engine = require("../engine.js");
const Presets = require("../presets.js");

Engine.setRng(Engine.seededRng("rules"));

const zone = (state, key, area = "table") => Engine.orderedZones(state, area).find((entry) => entry.key === key || entry.name.toLowerCase() === key);
const act = (state, action, actor = null, opts) => Engine.reduce(state, action, actor, opts);
const pull = (state, specs, to, face) => act(state, { type: "pullCards", specs, to, face });
const run = (state, label, actor = null) => act(state, { type: "runMacro", id: state.macros.find((macro) => macro.label === label).id }, actor);
const cardIn = (state, spec) => Object.values(state.cards).find((card) => {
  const parsed = Engine.parseCardSpec(spec);
  return parsed ? card.rank === parsed.rank && card.suit === parsed.suit : card.custom && card.label === spec;
}).id;
const current = (state) => state.players[state.turn.index].id;
const lastLog = (state) => state.log[state.log.length - 1].text;
const totalCards = (state) => Object.values(state.zones).reduce((sum, entry) => sum + entry.cards.length, 0);

// Klondike: enforced building rules.
{
  let state = Engine.createTable(Presets.get("klondike"), {});
  assert.equal(state.rulesMode, "enforce");
  const me = state.players[0].id;
  const f1 = zone(state, "f1").id;
  const t1 = zone(state, "t1").id;
  state = pull(state, "2s As Kh Qs Qh", zone(state, "waste").id, "up");
  assert.throws(() => act(state, { type: "move", cards: [cardIn(state, "2s")], to: f1 }, me), /must start with Ace/);
  state = act(state, { type: "move", cards: [cardIn(state, "As")], to: f1 }, me);
  state = act(state, { type: "move", cards: [cardIn(state, "2s")], to: f1 }, me);
  assert.equal(zone(state, "f1").cards.length, 2);
  assert.throws(() => act(state, { type: "move", cards: [cardIn(state, "Kh")], to: f1 }, me), /same suit/);
  assert.throws(() => act(state, { type: "move", cards: [cardIn(state, "Qs")], to: zone(state, "deck").id }, me), /Only an action/);
  // Referee (no actor) moves always go through.
  state = act(state, { type: "move", cards: [cardIn(state, "Kh")], to: t1 }, null);
  state = act(state, { type: "move", cards: zone(state, "t1").cards.slice(0, -1), to: zone(state, "waste").id }, null);
  assert.throws(() => act(state, { type: "move", cards: [cardIn(state, "Qh")], to: t1 }, me), /alternating color/);
  state = act(state, { type: "move", cards: [cardIn(state, "Qs")], to: t1 }, me);
  assert.deepEqual(zone(state, "t1").cards.map((id) => Engine.cardName(state.cards[id])), ["K♥", "Q♠"]);
  // Warn mode lets the move through and logs the broken rule.
  state = act(state, { type: "setRules", mode: "warn" });
  state = act(state, { type: "move", cards: [cardIn(state, "Qh")], to: t1 }, me);
  assert.match(lastLog(state), /Q♥: Waste → Column 1/);
  assert.ok(state.log.some((entry) => entry.kind === "warn" && /exactly one lower/.test(entry.text)));
  // Moving cards off a column turns its new top card face up.
  state = act(state, { type: "setRules", mode: "enforce" });
  const t2 = zone(state, "t2");
  state = run(state, "Deal layout", me);
  const t3 = zone(state, "t3");
  assert.equal(state.cards[t3.cards[1]].faceUp, false);
  state = act(state, { type: "move", cards: [t3.cards[2]], to: zone(state, "waste").id }, null);
  assert.equal(zone(state, "t3").cards.length, 2);
  state = act(state, { type: "setRules", mode: "off" });
  state = act(state, { type: "move", cards: [zone(state, "t3").cards[1]], to: t2.id }, me);
  assert.equal(state.cards[zone(state, "t3").cards[0]].faceUp, true);
}

// Guests can't take, reveal or peek at another player's private cards.
{
  let state = Engine.createTable(Presets.get("holdem"), { players: 3 });
  state = run(state, "New hand");
  const [a, b] = state.players.map((player) => player.id);
  const aHand = zone(state, "hand", a);
  const bHand = zone(state, "hand", b);
  const strict = { strict: true };
  assert.throws(() => act(state, { type: "move", cards: [bHand.cards[0]], to: aHand.id }, a, strict), /private/);
  assert.throws(() => act(state, { type: "flip", cards: [bHand.cards[0]] }, a, strict), /private/);
  assert.throws(() => act(state, { type: "peek", cards: [bHand.cards[0]] }, a, strict), /private/);
  assert.throws(() => act(state, { type: "flipZone", zone: bHand.id }, a, strict), /private/);
  assert.throws(() => act(state, { type: "sort", zone: bHand.id }, a, strict), /private/);
  assert.throws(() => act(state, { type: "draw", from: bHand.id, to: aHand.id }, a, strict), /private/);
  // Their own hand, the deck and giving a card away are fine.
  let next = act(state, { type: "flip", cards: [aHand.cards[0]] }, a, strict);
  next = act(next, { type: "draw", from: zone(state, "deck").id, to: aHand.id }, a, strict);
  next = act(next, { type: "move", cards: [aHand.cards[1]], to: bHand.id }, a, strict);
  assert.equal(zone(next, "hand", b).cards.length, 3);
  // Rules off still keeps hands private for guests.
  next = act(next, { type: "setRules", mode: "off" });
  assert.throws(() => act(next, { type: "move", cards: [zone(next, "hand", b).cards[0]], to: aHand.id }, a, strict), /private/);
}

// Hearts plays itself legally: follow suit, one card each, trick winner leads, hand scored at the end.
{
  let state = Engine.createTable(Presets.get("hearts"), { players: ["Ana", "Ben", "Cy", "Di"] });
  state = act(state, { type: "setRules", mode: "enforce" });
  state = run(state, "Deal all");
  assert.equal(state.players[state.turn.index].name, "Cy");
  const trickId = zone(state, "trick").id;
  // Illegal: a second card from the same player, or not following suit.
  const leader = current(state);
  const leadCard = zone(state, "hand", leader).cards[0];
  let tmp = act(state, { type: "move", cards: [leadCard], to: trickId }, leader);
  assert.notEqual(current(tmp), leader, "turn passes after playing to the trick");
  assert.throws(() => act(tmp, { type: "move", cards: [zone(tmp, "hand", leader).cards[0]], to: trickId }, leader), /Only the current player/);
  const ledSuit = tmp.cards[leadCard].suit;
  const follower = current(tmp);
  const followerHand = zone(tmp, "hand", follower).cards;
  const offSuit = followerHand.find((id) => tmp.cards[id].suit !== ledSuit);
  if (offSuit && followerHand.some((id) => tmp.cards[id].suit === ledSuit)) {
    assert.throws(() => act(tmp, { type: "move", cards: [offSuit], to: trickId }, follower), /Follow suit/);
  }
  // Play all 13 tricks with legal cards.
  let tricks = 0;
  while (zone(state, "hand", current(state)).cards.length) {
    const player = current(state);
    const hand = zone(state, "hand", player).cards;
    const trick = zone(state, "trick").cards;
    const led = trick.length ? state.cards[trick[0]].suit : null;
    const card = hand.find((id) => state.cards[id].suit === led) || hand[0];
    const before = zone(state, "trick").cards.length;
    state = act(state, { type: "move", cards: [card], to: trickId }, player);
    if (before === 3) {
      tricks += 1;
      assert.equal(zone(state, "trick").cards.length, 0, "full trick is taken automatically");
      assert.equal(current(state), state.lastWinner, "winner leads");
    }
  }
  assert.equal(tricks, 13);
  const totals = Engine.totals(state);
  assert.equal(Object.values(totals).reduce((a, b) => a + b, 0), 26);
  assert.equal(state.turn.round, 2);
  assert.ok(state.log.some((entry) => /⚡ .* → Score hand/.test(entry.text)));
}

// Crazy Eights: matching, wild eights, auto-reshuffle, going out scores the others.
{
  let state = Engine.createTable(Presets.get("crazy-eights"), { players: ["Ana", "Ben"] });
  state = act(state, { type: "setRules", mode: "enforce" });
  state = run(state, "Deal");
  const discard = zone(state, "discard").id;
  const ana = state.players[0].id;
  const ben = state.players[1].id;
  state = act(state, { type: "setTurn", index: 0 });
  // Rig the table: discard shows 5♥, Ana holds K♠ 8♣ 7♥ (never emptying her hand, which would count as going out).
  const keep = ["Ks", "8c", "7h"].map((spec) => cardIn(state, spec));
  state = act(state, { type: "move", cards: keep, to: zone(state, "hand", ana).id });
  state = act(state, { type: "move", cards: zone(state, "hand", ana).cards.filter((id) => !keep.includes(id)), to: zone(state, "stock").id });
  state = pull(state, "5h", discard, "up");
  assert.equal(state.turn.round, 1);
  assert.throws(() => act(state, { type: "move", cards: [cardIn(state, "Ks")], to: discard }, ana), /suit or rank/);
  state = act(state, { type: "move", cards: [cardIn(state, "8c")], to: discard }, ana);
  assert.equal(current(state), ben);
  state = act(state, { type: "setTurn", index: 0 });
  state = act(state, { type: "move", cards: [cardIn(state, "Ks")], to: discard }, ana); // anything goes on a wild 8
  state = act(state, { type: "setTurn", index: 0 });
  const benPenalty = V.evaluate("custom-points", zone(state, "hand", ben).cards.map((id) => ({ rank: state.cards[id].rank, suit: state.cards[id].suit })), { scheme: state.schemes[0] }).value;
  assert.throws(() => act(state, { type: "move", cards: [cardIn(state, "7h")], to: discard }, ana), /suit or rank/);
  state = act(state, { type: "setRules", mode: "warn" });
  state = act(state, { type: "move", cards: [cardIn(state, "7h")], to: discard }, ana);
  assert.equal(zone(state, "hand", ana).cards.length, 0);
  assert.equal(Engine.totals(state)[ana], benPenalty, "going out scores the other hand");
  assert.equal(state.turn.round, 2);
  // Emptying the stock reshuffles the discards (keeping the top card).
  const stock = zone(state, "stock");
  const discardBefore = zone(state, "discard").cards.length;
  state = act(state, { type: "deal", from: stock.id, to: zone(state, "hand", ben).id, count: stock.cards.length });
  assert.equal(zone(state, "discard").cards.length, 1);
  assert.equal(zone(state, "stock").cards.length, discardBefore - 1);
  assert.ok(zone(state, "stock").cards.every((id) => !state.cards[id].faceUp));
  assert.equal(totalCards(state), 52);
}

// Drafting: pass packs left, the showdown fires when every pack is empty.
{
  let state = Engine.createTable(Presets.get("draft-poker"), { players: 3 });
  state = run(state, "Deal packs");
  const packs = state.players.map((player) => zone(state, "pack", player.id).cards.slice());
  state = run(state, "Pass packs");
  state.players.forEach((player, i) => assert.deepEqual(zone(state, "pack", player.id).cards, packs[(i + 2) % 3]));
  for (let pick = 0; pick < 5; pick += 1) {
    for (const player of state.players) {
      const pack = zone(state, "pack", player.id);
      state = act(state, { type: "move", cards: [pack.cards[0]], to: zone(state, "picks", player.id).id }, player.id);
    }
    if (pick < 4) state = run(state, "Pass packs");
  }
  assert.ok(state.log.some((entry) => /→ Showdown/.test(entry.text)));
  assert.equal(Object.values(Engine.totals(state)).reduce((a, b) => a + b, 0), 1);
  assert.ok(state.players.every((player) => zone(state, "picks", player.id).cards.every((id) => state.cards[id].faceUp)));
}

// War names the battle winner from the top cards only.
{
  let state = Engine.createTable(Presets.get("war"), { players: 2 });
  state = run(state, "Deal out");
  const [a, b] = state.players.map((player) => player.id);
  state = pull(state, "2c 3c 4c Ks", zone(state, "battle", a).id, "up");
  state = pull(state, "Ad 5d 6d Qh", zone(state, "battle", b).id, "up");
  state = act(state, { type: "runMacro", steps: [{ op: "findWinner", zone: "battle" }] });
  assert.equal(state.lastWinner, a);
  state = run(state, "Winner takes");
  assert.equal(zone(state, "won", a).cards.length, 8);
}

// Action steps: counters, stop-if, nested actions, scores, pot, templated text.
{
  let state = Engine.createTable(Presets.get("sandbox"), { players: ["Ana", "Ben", "Cy"] });
  state = act(state, { type: "addCounter", name: "Lives", start: 3 });
  state = act(state, { type: "addCounter", name: "Rounds left", scope: "table", start: 2 });
  state = act(state, { type: "chipConfig", start: 100, resetAll: true });
  state = act(state, { type: "saveMacro", macro: { label: "Tick", steps: [{ op: "counter", who: "all", name: "Lives", amount: -1 }, { op: "stopIf", zone: "deck", cmp: "<", n: 52 }, { op: "deal", from: "deck", to: "hand@after", count: 1 }] } });
  state = act(state, { type: "saveMacro", macro: { label: "Tick twice", steps: [{ op: "runAction", macro: "Tick", times: 2 }, { op: "log", text: "{current} → {next}, round {round}" }] } });
  state = run(state, "Tick twice");
  assert.deepEqual(state.players.map((player) => player.counters[state.counterDefs[0].id]), [1, 1, 1]);
  assert.equal(zone(state, "deck").cards.length, 51, "the second pass stopped before dealing");
  assert.equal(zone(state, "hand", state.players[1].id).cards.length, 1, "@after is the next player");
  assert.equal(lastLog(state), "Ana → Ben, round 1");
  state = act(state, { type: "runMacro", steps: [{ op: "ante", amount: 10 }, { op: "score", who: "others", amount: 2 }, { op: "setTurn", who: "after" }, { op: "awardPot", who: "current" }, { op: "counter", who: "current", name: "Rounds left", amount: -1 }] });
  assert.deepEqual(Object.values(Engine.totals(state)), [0, 2, 2]);
  assert.equal(state.players[1].chips, 120);
  assert.equal(state.tableCounters[0].value, 1);
  assert.throws(() => act(state, { type: "runMacro", steps: [{ op: "counter", name: "Nope", amount: 1 }] }), /No counter/);
  // Actions calling themselves stop instead of looping forever.
  state = act(state, { type: "saveMacro", macro: { label: "Loop", steps: [{ op: "runAction", macro: "Loop" }] } });
  assert.throws(() => run(state, "Loop"), /too deeply/);
}

// Custom scoring schemes.
{
  const scheme = Engine.sanitizeScheme(Engine.emptyState(), { name: "Test", ranks: { K: 5 }, suits: { h: 1 }, cards: "Qs=13, 7=0, Wild=50", pair: 10, run: 2, runMin: 3, flush: 20, flushMin: 4 });
  const score = (text, extra = []) => V.evaluate("custom-points", [...V.parseCards(text), ...extra], { scheme });
  assert.equal(score("Qs").value, 13);
  assert.equal(score("Kh").value, 6);
  assert.equal(score("7h").value, 1, "rank override then suit bonus");
  assert.equal(score("5c 5d").value, 20);
  assert.equal(score("3c 4d 5s").value, 12 + 6);
  assert.equal(score("2h 4h 6h 9h").value, 21 + 4 + 20);
  assert.equal(score("", [{ rank: "Wild", suit: "x", custom: true, label: "Wild", value: 5 }]).value, 50);
  assert.equal(score("", [{ rank: "Skip", suit: "x", custom: true, label: "Skip", value: 20 }]).value, 20);
  assert.equal(V.evaluate("custom-points", V.parseCards("Kh"), { scheme: { ...scheme, low: true } }).score, -6);
}

// Game over by target and by round limit; resetting scores clears it.
{
  let state = Engine.createTable(Presets.get("sandbox"), { players: ["Ana", "Ben"] });
  state = act(state, { type: "scoreConfig", target: 10 });
  state = act(state, { type: "adjustScore", player: state.players[1].id, delta: 12 });
  assert.deepEqual(state.gameOver.winners, [state.players[1].id]);
  state = act(state, { type: "dismissGameOver" });
  assert.equal(state.gameOver.dismissed, true);
  state = act(state, { type: "resetScores" });
  assert.equal(state.gameOver, null);
  state = act(state, { type: "scoreConfig", target: 0, maxRounds: 2, lowWins: true });
  state = act(state, { type: "adjustScore", player: state.players[0].id, delta: 5 });
  state = act(state, { type: "nextRound" });
  assert.equal(state.gameOver, null);
  state = act(state, { type: "nextRound" });
  assert.deepEqual(state.gameOver.winners, [state.players[1].id]);
}

// Triggers: saved by the user, labels survive a save/load round trip, setup actions don't fire them.
{
  let state = Engine.createTable(Presets.get("sandbox"), { players: 2 });
  state = act(state, { type: "saveMacro", macro: { label: "Refill", steps: [{ op: "log", text: "{subject} emptied a hand" }] } });
  state = act(state, { type: "saveTrigger", trigger: { event: "empty", zone: "hand", macro: "Refill" } });
  assert.equal(state.triggers[0].macro, state.macros.find((macro) => macro.label === "Refill").id);
  assert.throws(() => act(state, { type: "saveTrigger", trigger: { event: "empty", zone: "hand", macro: "Missing" } }), /Pick an action/);
  state = act(state, { type: "deal", from: zone(state, "deck").id, to: "hand", count: 1 });
  state = act(state, { type: "collect" });
  assert.equal(state.log.some((entry) => /emptied a hand/.test(entry.text)), false, "collecting never fires triggers");
  state = act(state, { type: "deal", from: zone(state, "deck").id, to: "hand", count: 1 });
  const first = state.players[0].id;
  state = act(state, { type: "move", cards: zone(state, "hand", first).cards, to: zone(state, "discard").id }, first);
  assert.equal(lastLog(state), `${state.players[0].name} emptied a hand`);
  const preset = Engine.toPreset(state);
  assert.equal(preset.triggers[0].macro, "Refill");
  const copy = Engine.createTable(preset, { players: 3 });
  assert.equal(copy.triggers[0].macro, copy.macros.find((macro) => macro.label === "Refill").id);
  assert.equal(copy.rulesMode, "warn");
  state = act(state, { type: "deleteMacro", id: state.triggers[0].macro });
  assert.equal(state.triggers.length, 0);
}

// Color Clash: a deck made only of custom cards with custom suits.
{
  let state = Engine.createTable(Presets.get("color-clash"), { players: 3 });
  assert.equal(Object.keys(state.cards).length, 108);
  assert.ok(Object.values(state.cards).every((card) => card.custom));
  state = act(state, { type: "setRules", mode: "enforce" });
  state = run(state, "Deal 7");
  const discard = zone(state, "discard").id;
  const player = current(state);
  const find = (label, suit) => Object.values(state.cards).find((card) => card.label === label && card.suit === suit && !zone(state, "discard").cards.includes(card.id)).id;
  state = act(state, { type: "move", cards: [find("7", "Red")], to: discard }, null);
  assert.throws(() => act(state, { type: "move", cards: [find("3", "Blue")], to: discard }, player), /suit or rank/);
  state = act(state, { type: "move", cards: [find("7", "Blue")], to: discard }, player);
  const next = current(state);
  state = act(state, { type: "move", cards: [find("Wild", "Wild")], to: discard }, next);
  state = act(state, { type: "move", cards: [find("2", "Green")], to: discard }, current(state));
  assert.equal(totalCards(state), 108);
}

// Scenario setup and the generated rules document.
{
  let state = Engine.createTable(Presets.get("holdem"), { players: 2 });
  assert.throws(() => pull(state, "Zz", zone(state, "board").id), /Couldn't find Zz/);
  state = pull(state, "As Ks 10h", zone(state, "board").id, "up");
  assert.deepEqual(zone(state, "board").cards.map((id) => Engine.cardName(state.cards[id])), ["A♠", "K♠", "10♥"]);
  const doc = Engine.describeGame(Engine.createTable(Presets.get("hearts"), {}));
  assert.match(doc, /## Automatic rules/);
  assert.match(doc, /When Trick has one card per player: Take trick/);
  assert.match(doc, /must follow the led suit/);
  assert.match(Engine.describeGame(Engine.createTable(Presets.get("crazy-eights"), {})), /\*\*Penalty points\*\*: card values .*8=50/);
}

console.log("rules tests passed");
