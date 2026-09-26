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
  // Everyone passes three cards; when the last Pass pile fills, the cards move left and play starts.
  assert.throws(() => act(state, { type: "move", cards: [zone(state, "hand", current(state)).cards[0]], to: zone(state, "trick").id }, current(state)), /only takes cards during Play/);
  const passed = state.players.map((p) => zone(state, "hand", p.id).cards.slice(0, 3));
  state.players.forEach((p, i) => { state = act(state, { type: "move", cards: passed[i], to: zone(state, "pass", p.id).id }, p.id); });
  assert.equal(state.turn.phase, "Play");
  state.players.forEach((p, i) => {
    assert.equal(zone(state, "hand", p.id).cards.length, 13);
    assert.ok(passed[(i + 3) % 4].every((id) => zone(state, "hand", p.id).cards.includes(id)), "cards passed left");
  });
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
  assert.equal(zone(state, "hand", ana).cards.length, 7, "going out deals the next hand");
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

// Bots: legal plays follow the rules; a whole Hearts hand can be auto-played.
{
  let state = Engine.createTable(Presets.get("hearts"), { players: 4 });
  state = run(state, "Deal all");
  state = act(state, { type: "setPhase", phase: "Play" });
  const leader = current(state);
  const opening = Engine.legalPlays(state, leader);
  assert.equal(opening.length, 13, "any card can lead");
  assert.ok(opening.every((play) => play.to === zone(state, "trick").id));
  assert.equal(Engine.legalPlays(state, state.players.find((p) => p.id !== leader).id).length, 0, "not your turn, nothing is legal");
  let guard = 0;
  while (zone(state, "hand", current(state)).cards.length && guard < 60) {
    const plays = Engine.legalPlays(state, current(state));
    assert.ok(plays.length > 0);
    const led = zone(state, "trick").cards[0];
    if (led) {
      const suit = state.cards[led].suit;
      const hand = zone(state, "hand", current(state)).cards;
      if (hand.some((id) => state.cards[id].suit === suit)) assert.ok(plays.every((play) => state.cards[play.card].suit === suit), "bots must follow suit");
    }
    const play = plays[Math.floor(Math.random() * plays.length)];
    state = act(state, { type: "move", cards: [play.card], to: play.to }, current(state));
    guard += 1;
  }
  assert.equal(guard, 52);
  assert.equal(Object.values(Engine.totals(state)).reduce((a, b) => a + b, 0), 26);
}

// Melds: sets and runs, with wild jokers filling gaps.
{
  const cards = (text) => text.split(" ").map((spec) => (spec === "JK" ? { rank: "JK", suit: "x" } : Engine.parseCardSpec(spec)));
  assert.equal(Engine.meldOk(cards("7h 7s 7d"), { meld: "set" }), true);
  assert.equal(Engine.meldOk(cards("7h 7s 8d"), { meld: "set" }), false);
  assert.equal(Engine.meldOk(cards("5h 6h 7h"), { meld: "run" }), true);
  assert.equal(Engine.meldOk(cards("5h 7h"), { meld: "run" }), false);
  assert.equal(Engine.meldOk([...cards("5h 7h"), { rank: "JK", suit: "x" }], { meld: "run" }), true);
  assert.equal(Engine.meldOk(cards("Qh Kh Ah"), { meld: "run" }), true, "aces high");
  assert.equal(Engine.meldOk(cards("Ah 2h 3h"), { meld: "run" }), true, "aces low");
  assert.equal(Engine.meldOk(cards("5h 6s 7h"), { meld: "setOrRun" }), false);
  let state = Engine.createTable(Presets.get("sandbox"), { players: 1 });
  const me = state.players[0].id;
  state = act(state, { type: "addZone", area: "table", zone: { name: "Meld", rule: { meld: "run", place: "anyone" } } });
  state = act(state, { type: "setRules", mode: "enforce" });
  const meld = zone(state, "meld").id;
  state = pull(state, "4c 5c 6c 9d", zone(state, "hand", me).id, "up");
  state = act(state, { type: "move", cards: ["4c", "5c"].map((spec) => cardIn(state, spec)), to: meld }, me);
  assert.throws(() => act(state, { type: "move", cards: [cardIn(state, "9d")], to: meld }, me), /must be a run/);
  state = act(state, { type: "move", cards: [cardIn(state, "6c")], to: meld }, me);
  assert.equal(zone(state, "meld").cards.length, 3);
  assert.match(Engine.describeGame(state), /must form a run/);
}

// Refill up to N, group limits, and teams from presets.
{
  let state = Engine.createTable(Presets.get("five-card-draw"), { players: 3 });
  state = act(state, { type: "runMacro", steps: [{ op: "refill", from: "deck", to: "hand", count: 5 }] });
  assert.ok(state.players.every((p) => zone(state, "hand", p.id).cards.length === 5));
  const first = state.players[0].id;
  state = act(state, { type: "move", cards: zone(state, "hand", first).cards.slice(0, 2), to: zone(state, "muck").id });
  state = act(state, { type: "runMacro", steps: [{ op: "refill", from: "deck", to: "hand", count: 5 }] });
  assert.equal(zone(state, "hand", first).cards.length, 5);
  assert.equal(zone(state, "deck").cards.length, 52 - 17);
  let ofc = Engine.createTable(Presets.get("ofc"), { players: 2 });
  ofc = act(ofc, { type: "setRules", mode: "enforce" });
  const p1 = ofc.players[0].id;
  ofc = pull(ofc, "As Ks Qs Js", zone(ofc, "draw", p1).id, "up");
  assert.throws(() => act(ofc, { type: "move", cards: ["As", "Ks", "Qs", "Js"].map((spec) => cardIn(ofc, spec)), to: zone(ofc, "top", p1).id }, p1), /at most 3/);
  const spades = Engine.createTable(Presets.get("spades"), { players: 4 });
  assert.deepEqual(spades.players.map((p) => p.team), ["North–South", "East–West", "North–South", "East–West"]);
  const c8 = Engine.createTable(Presets.get("crazy-eights"), { players: 2 });
  assert.equal(Engine.findMacro(c8, c8.botFallback).label, "Draw");
  assert.equal(Engine.toPreset(c8).botFallback, "Draw");
}

console.log("bot, meld and refill tests passed");

// Card-played triggers drive action cards; bots can play whole games to the end.
{
  Engine.setRng(Engine.seededRng("clash"));
  let state = Engine.createTable(Presets.get("color-clash"), { players: ["Ana", "Ben", "Cy"] });
  state = act(state, { type: "setRules", mode: "enforce" });
  state = run(state, "Deal 7");
  const discard = zone(state, "discard").id;
  const [ana, ben, cy] = state.players.map((p) => p.id);
  const give = (label, suit, to) => {
    const id = Object.values(state.cards).find((card) => card.label === label && card.suit === suit && !zone(state, "discard").cards.includes(card.id)).id;
    state = act(state, { type: "move", cards: [id], to: zone(state, "hand", to).id });
    return id;
  };
  // Put a red 5 on the discard, then Ana plays a red Skip: Ben is skipped.
  state = act(state, { type: "move", cards: [Object.values(state.cards).find((c) => c.label === "5" && c.suit === "Red").id], to: discard });
  state = act(state, { type: "setTurn", index: 0 });
  const skip = give("Skip", "Red", ana);
  state = act(state, { type: "move", cards: [skip], to: discard }, ana);
  assert.equal(current(state), cy, "Skip jumps over Ben");
  // Cy plays a red Draw Two: Ana draws two and loses her turn.
  const anaCards = zone(state, "hand", ana).cards.length;
  const plus2 = give("Draw Two", "Red", cy);
  state = act(state, { type: "move", cards: [plus2], to: discard }, cy);
  assert.equal(zone(state, "hand", ana).cards.length, anaCards + 2);
  assert.equal(current(state), ben);
  // Ben plays a red Reverse: direction flips and play goes back to Cy.
  const rev = give("Reverse", "Red", ben);
  state = act(state, { type: "move", cards: [rev], to: discard }, ben);
  assert.equal(state.turn.dir, -1);
  assert.equal(current(state), ana, "after Ben's reverse, play goes the other way from Ben");
  // Triggers can be limited to a phase.
  state = act(state, { type: "saveMacro", macro: { label: "Cheer", steps: [{ op: "log", text: "cheer" }] } });
  state = act(state, { type: "saveTrigger", trigger: { event: "played", zone: "discard", macro: "Cheer", during: "Bonus" } });
  const cheerCard = give("3", "Red", ana);
  state = act(state, { type: "move", cards: [cheerCard], to: discard }, ana);
  assert.equal(state.log.some((e) => e.text === "cheer"), false);
}
{
  Engine.setRng(Engine.seededRng("autoplay"));
  const hearts = Engine.playOut(Engine.createTable(Presets.get("hearts"), { players: 4 }), { deal: "Deal all", maxSteps: 20000 });
  assert.ok(hearts.finished, `hearts finished in ${hearts.steps} steps`);
  assert.ok(Object.values(Engine.totals(hearts.state)).some((t) => t >= 100));
  const c8 = Engine.playOut(Engine.createTable(Presets.get("crazy-eights"), { players: 3 }), { deal: "Deal", maxSteps: 20000 });
  assert.ok(c8.finished, `crazy eights finished in ${c8.steps} steps`);
  const clash = Engine.playOut(Engine.createTable(Presets.get("color-clash"), { players: 4 }), { deal: "Deal 7", maxSteps: 40000 });
  assert.ok(clash.finished, `color clash finished in ${clash.steps} steps`);
  console.log(`autoplay: hearts ${hearts.steps} steps / ${hearts.deals} deals, crazy eights ${c8.steps}, color clash ${clash.steps}`);
}
console.log("card effect and autoplay tests passed");

// The design wizard produces playable games for every style.
{
  Engine.setRng(Engine.seededRng("wizard"));
  for (const style of Object.keys(Presets.WIZARD_STYLES)) {
    const design = Presets.fromWizard({ style, name: "Test " + style, min: 2, max: 5, players: 4, target: style === "tricks" ? 10 : style === "draft" ? 3 : 100, trickScoring: "tricks" });
    const state = Engine.createTable(design, { players: 4 });
    assert.equal(state.players.length, 4, style);
    assert.ok(state.macros.length >= 3, style);
    for (const macro of state.macros) Engine.reduce(state, { type: "runMacro", id: macro.id });
    if (style === "shedding" || style === "tricks") {
      const out = Engine.playOut(state, { deal: state.macros[0].id, maxSteps: 30000 });
      assert.ok(out.finished, `${style} game finishes (${out.steps} steps)`);
    }
    assert.match(Engine.describeGame(state), new RegExp(`# Test ${style}`));
  }
  const hearts = Presets.fromWizard({ style: "tricks", trickScoring: "hearts", target: 50 });
  assert.equal(hearts.scoring.lowWins, true);
  const wild = Presets.fromWizard({ style: "shedding", wild: "8, 2", match: "suit" });
  assert.deepEqual(wild.table[1].rule.wild, ["8", "2"]);
  assert.equal(wild.table[1].rule.accept, "suit");
}
console.log("wizard tests passed");

// Deal-until, value conditions, and smart bots.
{
  Engine.setRng(Engine.seededRng("dealer"));
  for (let i = 0; i < 20; i += 1) {
    let state = Engine.createTable(Presets.get("blackjack"), { players: 2 });
    state = run(state, "Deal round");
    state = run(state, "Dealer plays");
    const dealer = zone(state, "dealer");
    const total = V.evaluate("blackjack", dealer.cards.map((id) => ({ rank: state.cards[id].rank, suit: state.cards[id].suit })), {}).value;
    assert.ok(total >= 17, `dealer stops at 17+ (${total})`);
    const withoutLast = V.evaluate("blackjack", dealer.cards.slice(0, -1).map((id) => ({ rank: state.cards[id].rank, suit: state.cards[id].suit })), {}).value;
    if (dealer.cards.length > 2) assert.ok(withoutLast < 17, "dealer didn't overdraw");
    assert.ok(dealer.cards.every((id) => state.cards[id].faceUp));
  }
  let state = Engine.createTable(Presets.get("blackjack"), { players: 1 });
  state = pull(state, "Kh 9d", zone(state, "dealer").id, "up");
  const stopped = act(state, { type: "runMacro", steps: [{ op: "stopIf", zone: "dealer", evaluator: "blackjack", cmp: ">=", n: 17 }, { op: "log", text: "not reached" }] });
  assert.notEqual(lastLog(stopped), "not reached");
}
{
  // A smart Hearts bot takes fewer points than random bots.
  Engine.setRng(Engine.seededRng("smart-hearts"));
  const design = Presets.get("hearts");
  let smartPoints = 0;
  let otherPoints = 0;
  for (let game = 0; game < 12; game += 1) {
    const start = Engine.createTable(design, { players: [{ name: "Smart", botStyle: "smart" }, "R1", "R2", "R3"] });
    const out = Engine.playOut(start, { deal: "Deal all", maxSteps: 20000 });
    const totals = Engine.totals(out.state);
    smartPoints += totals[out.state.players[0].id];
    otherPoints += (totals[out.state.players[1].id] + totals[out.state.players[2].id] + totals[out.state.players[3].id]) / 3;
  }
  assert.ok(smartPoints < otherPoints * 0.8, `smart ${smartPoints} vs random avg ${otherPoints.toFixed(1)}`);
  // Smart drafting builds better hands than random.
  let smartBetter = 0;
  for (let game = 0; game < 200; game += 1) {
    let state = Engine.createTable(Presets.get("draft-poker"), { players: [{ name: "Smart", botStyle: "smart" }, { name: "Random", botStyle: "random" }] });
    state = run(state, "Deal packs");
    for (let pick = 0; pick < 5; pick += 1) {
      for (const player of state.players) {
        const play = Engine.pickPlay(state, player.id, player.botStyle);
        state = act(state, { type: "move", cards: [play.card], to: play.to }, player.id);
      }
      if (pick < 4) state = run(state, "Pass packs");
    }
    if (state.lastWinner === state.players[0].id) smartBetter += 1;
  }
  assert.ok(smartBetter >= 115, `smart drafter won ${smartBetter}/200`);
  console.log(`smart bots: hearts ${smartPoints} vs ${otherPoints.toFixed(0)}, draft ${smartBetter}/200`);
}
console.log("deal-until and smart bot tests passed");

// Design check.
{
  for (const preset of Presets.PRESETS) {
    const errors = Engine.lintDesign(Engine.createTable(preset, {})).filter((issue) => issue.level === "error");
    assert.deepEqual(errors, [], `${preset.id} has no design errors`);
  }
  let state = Engine.createTable(Presets.get("hearts"), { players: 4 });
  state = act(state, { type: "saveMacro", macro: { label: "Broken", steps: [{ op: "deal", from: "deck", to: "nowhere", count: 1 }, { op: "counter", name: "Lives", amount: 1 }, { op: "deal", from: "deck", to: "hand", count: 20 }] } });
  state = act(state, { type: "saveTrigger", trigger: { event: "phase", phase: "Bidding", macro: "Broken" } });
  const text = Engine.lintDesign(state).map((issue) => `${issue.level}: ${issue.message}`).join("\n");
  assert.match(text, /error: .*“nowhere”, which isn't a group/);
  assert.match(text, /error: .*counter that doesn't exist/);
  assert.match(text, /warn: .*dealing 81 cards needs more than the 52/);
  assert.match(text, /warn: .*phase “Bidding”/);
  const noPass = Engine.createTable({ table: [{ key: "deck", name: "Deck", kind: "deck" }, { key: "pile", name: "Pile", rule: { place: "turn" } }], seat: [{ key: "hand", name: "Hand", kind: "hand" }] }, { players: 2 });
  assert.match(Engine.lintDesign(noPass).map((issue) => issue.message).join("\n"), /nothing passes the turn/);
}
console.log("design check tests passed");

// Plays per turn, Kings in the Corner and Golf.
{
  Engine.setRng(Engine.seededRng("kings"));
  const out = Engine.playOut(Engine.createTable(Presets.get("kings-corner"), { players: 3 }), { deal: "Deal", maxSteps: 30000 });
  assert.ok(out.finished, `kings in the corner finishes (${out.steps} steps)`);
  let state = Engine.createTable(Presets.get("kings-corner"), { players: 2 });
  state = run(state, "Deal");
  const me = current(state);
  state = act(state, { type: "nextTurn" });
  state = act(state, { type: "nextTurn" });
  assert.equal(zone(state, "hand", me).cards.length, 8, "the turn trigger drew a card when the turn came back");
  state = act(state, { type: "setRules", mode: "enforce" });
  const corner = zone(state, "corner-1").id;
  state = pull(state, "Kh Qs", zone(state, "hand", me).id);
  assert.throws(() => act(state, { type: "move", cards: [cardIn(state, "Qs")], to: corner }, me), /must start with King/);
  state = act(state, { type: "move", cards: [cardIn(state, "Kh")], to: corner }, me);
  state = act(state, { type: "move", cards: [cardIn(state, "Qs")], to: corner }, me);
  assert.equal(current(state), me, "several plays per turn");
  const golf = Engine.createTable(Presets.get("golf"), { players: 3 });
  let g = run(golf, "Deal");
  assert.ok(g.players.every((p) => zone(g, "grid", p.id).cards.filter((id) => g.cards[id].faceUp).length === 2));
  g = run(g, "Score hole");
  assert.equal(g.turn.round, 2);
  assert.equal(Engine.lintDesign(golf).filter((issue) => issue.level === "error").length, 0);
}
console.log("kings corner and golf tests passed");

// Formula scoring, counters and score triggers; Spades scores itself.
{
  assert.equal(Engine.evalFormula("tricks >= bid ? 10 * bid + (tricks - bid) : -10 * bid", { tricks: 5, bid: 4 }), 41);
  assert.equal(Engine.evalFormula("tricks >= bid ? 10 * bid + (tricks - bid) : -10 * bid", { tricks: 2, bid: 4 }), -40);
  assert.equal(Engine.evalFormula("max(1, 2 * 3) + abs(-2) % 3 - -1", {}), 9);
  assert.equal(Engine.evalFormula("!(a > 1) || b == 2 && true", { a: 5, b: 2 }), 1);
  assert.throws(() => Engine.evalFormula("tricks +", { tricks: 1 }), /ends too soon/);
  assert.throws(() => Engine.evalFormula("nope * 2", { tricks: 1 }), /Unknown name “nope”/);
  assert.throws(() => Engine.evalFormula("alert(1)", {}), /Unknown function/);
  assert.throws(() => Engine.evalFormula("1; 2", {}), /Can't read/);
  Engine.setRng(Engine.seededRng("spades"));
  let state = Engine.createTable(Presets.get("spades"), { players: 4 });
  state = act(state, { type: "setRules", mode: "enforce" });
  const [bid] = state.counterDefs;
  for (const player of state.players) state = act(state, { type: "counter", player: player.id, id: bid.id, value: 3 });
  state = run(state, "Deal all");
  let plays = 0;
  while (zone(state, "hand", current(state)).cards.length && plays < 60) {
    const play = Engine.pickPlay(state, current(state), "smart");
    state = act(state, { type: "move", cards: [play.card], to: play.to }, current(state));
    plays += 1;
  }
  assert.equal(plays, 52);
  assert.equal(state.turn.round, 2, "the hand scored itself");
  const tricks = state.counterDefs.find((def) => def.name === "Tricks");
  assert.ok(state.players.every((p) => p.counters[tricks.id] === 0), "trick counters reset");
  const scored = Engine.totals(state);
  for (const player of state.players) assert.ok(scored[player.id] === -30 || scored[player.id] >= 30, `score ${scored[player.id]}`);
  // A score trigger fires once when a player crosses the line.
  let s2 = Engine.createTable(Presets.get("sandbox"), { players: 2 });
  s2 = act(s2, { type: "saveMacro", macro: { label: "Halfway", steps: [{ op: "log", text: "{subject} is halfway" }] } });
  s2 = act(s2, { type: "saveTrigger", trigger: { event: "score", n: 50, macro: "Halfway" } });
  s2 = act(s2, { type: "adjustScore", player: s2.players[1].id, delta: 60 });
  s2 = act(s2, { type: "adjustScore", player: s2.players[1].id, delta: 5 });
  assert.equal(s2.log.filter((e) => /halfway/.test(e.text)).length, 1);
  assert.equal(lastLog(s2).includes("halfway"), false);
  assert.equal(Engine.lintDesign(Engine.createTable(Presets.get("spades"), {})).filter((i) => i.level === "error").length, 0);
}
console.log("formula tests passed");

// Peeking at the top of the deck and showing a card to one player.
{
  let state = Engine.createTable(Presets.get("holdem"), { players: 3 });
  const [a, b, c] = state.players.map((p) => p.id);
  state = act(state, { type: "setTurn", index: 0 });
  state = act(state, { type: "runMacro", steps: [{ op: "peekTop", zone: "deck", count: 3, who: "current" }] });
  const top = zone(state, "deck").cards.slice(-3);
  assert.ok(top.every((id) => Engine.viewFor(state, a).cards[id]?.visible));
  assert.ok(top.every((id) => !Engine.viewFor(state, b).cards[id]));
  state = run(state, "New hand");
  const card = zone(state, "hand", b).cards[0];
  assert.throws(() => act(state, { type: "showTo", cards: [card], player: c }, a, { strict: true }), /private/);
  state = act(state, { type: "showTo", cards: [card], player: c }, b, { strict: true });
  assert.ok(Engine.viewFor(state, c).cards[card]?.visible);
  assert.equal(Engine.viewFor(state, a).cards[card], undefined);
}
console.log("peek and show tests passed");

// Deck-building: custom cards start in market piles, buying costs coins, decks reshuffle.
{
  Engine.setRng(Engine.seededRng("market"));
  let state = Engine.createTable(Presets.get("market-builder"), { players: 2 });
  assert.equal(zone(state, "copper").cards.length, 60);
  assert.equal(zone(state, "castle").cards.length, 12);
  assert.equal(zone(state, "trash").cards.length, 0);
  state = run(state, "Set up");
  const [a, b] = state.players.map((p) => p.id);
  for (const id of [a, b]) {
    assert.equal(zone(state, "hand", id).cards.length + zone(state, "play", id).cards.length, 5, "five drawn (the first player's are already in play)");
    assert.equal(zone(state, "deck", id).cards.length, 5);
  }
  state = act(state, { type: "setTurn", index: 0 });
  state = run(state, "Play treasures");
  const coinsDef = state.counterDefs[0];
  const coins = state.players[0].counters[coinsDef.id];
  const coppers = zone(state, "play", a).cards.filter((id) => state.cards[id].label === "Copper").length;
  assert.equal(coins, coppers, "coins = coppers in play");
  const silver = zone(state, "silver").cards.slice(-1);
  const gold = zone(state, "gold").cards.slice(-1);
  assert.throws(() => act(state, { type: "move", cards: gold, to: zone(state, "discard", a).id }, a), /costs 6 Coins/);
  if (coins >= 3) {
    state = act(state, { type: "move", cards: silver, to: zone(state, "discard", a).id }, a);
    assert.equal(state.players[0].counters[coinsDef.id], coins - 3);
    assert.equal(zone(state, "silver").cards.length, 39);
  }
  state = run(state, "End turn");
  assert.equal(zone(state, "hand", a).cards.length, 5);
  assert.equal(state.players[0].counters[coinsDef.id], 0);
  assert.equal(zone(state, "hand", b).cards.length, 0, "the next player's treasures were laid out automatically");
  // Second turn for A empties the deck, so the third turn reshuffles the discard.
  state = act(state, { type: "setTurn", index: 0 });
  state = run(state, "End turn");
  state = act(state, { type: "setTurn", index: 0 });
  state = run(state, "End turn");
  assert.equal(zone(state, "hand", a).cards.length, 5, "drew five after reshuffling");
  // Buying the last castle ends the game with victory points.
  state = act(state, { type: "setRules", mode: "off" });
  state = act(state, { type: "move", cards: zone(state, "castle").cards.slice(0, 11), to: zone(state, "discard", b).id }, null);
  state = act(state, { type: "setRules", mode: "enforce" });
  state = act(state, { type: "setTurn", index: 0 });
  const def = state.counterDefs[0];
  state = act(state, { type: "counter", player: a, id: def.id, value: 8 });
  state = act(state, { type: "move", cards: zone(state, "castle").cards.slice(-1), to: zone(state, "discard", a).id }, a);
  assert.ok(state.gameOver, "game over when the castles run out");
  assert.deepEqual(state.gameOver.winners, [b]);
  assert.equal(Engine.lintDesign(Engine.createTable(Presets.get("market-builder"), {})).filter((i) => i.level === "error").length, 0);
}
console.log("deck-building tests passed");

// Bots can play a whole deck-building game.
{
  Engine.setRng(Engine.seededRng("market-bots"));
  const start = Engine.createTable(Presets.get("market-builder"), { players: [{ name: "Smart", botStyle: "smart" }, { name: "Random", botStyle: "random" }] });
  let smartWins = 0;
  let finished = 0;
  for (let game = 0; game < 10; game += 1) {
    const out = Engine.playOut(start, { deal: "Set up", maxSteps: 20000 });
    if (!out.finished) continue;
    finished += 1;
    if (out.state.gameOver.winners[0] === out.state.players[0].id) smartWins += 1;
  }
  assert.equal(finished, 10, "every market game ends");
  assert.ok(smartWins >= 7, `smart buyer won ${smartWins}/10`);
  console.log(`market builder: smart won ${smartWins}/10`);
}

// Must play if able.
{
  let state = Engine.createTable(Presets.get("crazy-eights"), { players: ["Ana", "Ben"] });
  assert.equal(state.mustPlay, true);
  state = act(state, { type: "setRules", mode: "enforce" });
  state = run(state, "Deal");
  state = act(state, { type: "setTurn", index: 0 });
  const ana = state.players[0].id;
  const keep = ["8c"].map((spec) => cardIn(state, spec));
  state = act(state, { type: "move", cards: keep, to: zone(state, "hand", ana).id });
  assert.throws(() => run(state, "Draw", ana), /legal play/);
  state = act(state, { type: "setBotFallback", macro: state.botFallback, mustPlay: false });
  state = run(state, "Draw", ana);
  assert.equal(Engine.toPreset(Engine.createTable(Presets.get("crazy-eights"), {})).mustPlay, true);
}
console.log("must-play tests passed");

// Climbing: sets that match size and beat rank; passes clear the pile; finishers score.
{
  Engine.setRng(Engine.seededRng("president"));
  let state = Engine.createTable(Presets.get("president"), { players: 4 });
  state = run(state, "Deal");
  assert.ok(state.players.every((p) => zone(state, "hand", p.id).cards.length === 13));
  const p0 = current(state);
  const pile = zone(state, "pile").id;
  // Rig: current player gets a pair of 5s, the next a pair of 9s and a single king.
  const give = (specs, to) => { state = act(state, { type: "move", cards: specs.map((spec) => cardIn(state, spec)), to: zone(state, "hand", to).id }); };
  const order = state.players.map((p) => p.id);
  const next = order[(order.indexOf(p0) + 1) % 4];
  give(["5s", "5h"], p0);
  give(["9s", "9h", "Kd"], next);
  assert.throws(() => act(state, { type: "move", cards: ["5s", "9s"].map((s) => cardIn(state, s)), to: pile }, p0), /one rank/);
  state = act(state, { type: "move", cards: ["5s", "5h"].map((s) => cardIn(state, s)), to: pile }, p0);
  assert.equal(current(state), next);
  assert.throws(() => act(state, { type: "move", cards: [cardIn(state, "Kd")], to: pile }, next), /Play 2 cards/);
  const plays = Engine.legalPlays(state, next);
  assert.ok(plays.some((play) => play.cards.length === 2), "bots see pair plays");
  assert.ok(plays.every((play) => play.cards.length === 2));
  state = act(state, { type: "move", cards: ["9s", "9h"].map((s) => cardIn(state, s)), to: pile }, next);
  // Everyone else passes: the pile clears and the 9s player leads.
  for (let i = 0; i < 3; i += 1) state = run(state, "Pass", current(state));
  assert.equal(zone(state, "pile").cards.length, 0);
  assert.equal(current(state), next);
  const out = Engine.playOut(Engine.createTable(Presets.get("president"), { players: 4 }), { deal: "Deal", maxSteps: 40000 });
  assert.ok(out.finished, `president finishes (${out.steps} steps)`);
  assert.equal(Engine.lintDesign(Engine.createTable(Presets.get("president"), {})).filter((i) => i.level === "error").length, 0);
}
console.log("climbing tests passed");

// Counter triggers: three strikes sits a player out; a table counter ends the game.
{
  let state = Engine.createTable(Presets.get("sandbox"), { players: ["Ana", "Ben", "Cy"] });
  state = act(state, { type: "addCounter", name: "Strikes", start: 0 });
  state = act(state, { type: "addCounter", name: "Doom", scope: "table", start: 0 });
  state = act(state, { type: "saveMacro", macro: { label: "Out", steps: [{ op: "sitOut", who: "subject" }, { op: "log", text: "{subject} struck out" }] } });
  state = act(state, { type: "saveMacro", macro: { label: "Doomsday", steps: [{ op: "endGame" }] } });
  state = act(state, { type: "saveTrigger", trigger: { event: "counter", counter: "strikes", n: 3, macro: "Out" } });
  state = act(state, { type: "saveTrigger", trigger: { event: "counter", counter: "Doom", n: 2, macro: "Doomsday" } });
  assert.equal(Engine.describeTrigger(state.triggers[0], state), "When strikes reaches 3");
  assert.equal(Engine.lintDesign(state).filter((i) => /counter/.test(i.message)).length, 0);
  const [ana, ben] = state.players;
  const def = state.counterDefs[0];
  state = act(state, { type: "counter", player: ben.id, id: def.id, delta: 2 });
  assert.ok(!state.players[1].out);
  state = act(state, { type: "counter", player: ben.id, id: def.id, delta: 1 });
  assert.ok(state.players[1].out, "third strike sits Ben out");
  assert.ok(state.log.some((entry) => entry.text === "Ben struck out"));
  state = act(state, { type: "counter", player: ben.id, id: def.id, delta: 1 });
  assert.equal(state.log.filter((entry) => entry.text === "Ben struck out").length, 1, "fires only on crossing");
  assert.ok(!state.players[0].out && ana);
  const doom = state.tableCounters[0];
  state = act(state, { type: "runMacro", steps: [{ op: "counter", name: "Doom", amount: 2 }] });
  assert.ok(state.gameOver, "table counter trigger ended the game");
  let bad = act(state, { type: "saveTrigger", trigger: { event: "counter", counter: "Nope", n: 1, macro: "Out" } });
  assert.ok(Engine.lintDesign(bad).some((i) => i.level === "error" && /counter “Nope”/.test(i.message)));
  assert.ok(doom);
}
console.log("counter trigger tests passed");

// Card balance tracking in bot games.
{
  const out = Engine.playOut(Engine.createTable(Presets.get("color-clash"), { players: 3 }), { deal: "Deal", maxSteps: 6000, trackCards: true });
  const played = Object.values(out.cardsPlayed || {});
  assert.ok(played.length >= 2, "several players played cards");
  const keys = played.flatMap((counts) => Object.keys(counts));
  assert.ok(keys.some((key) => /Skip|Reverse|Draw|Wild|\d/.test(key)), JSON.stringify(played).slice(0, 200));
  assert.ok(played.every((counts) => Object.values(counts).every((n) => Number.isInteger(n) && n > 0)));
  assert.equal(Engine.cardKey({ rank: "Q", suit: "s" }), "Q");
  assert.equal(Engine.cardKey({ custom: true, label: "Skip" }), "Skip");
  const plain = Engine.playOut(Engine.createTable(Presets.get("crazy-eights"), { players: 2 }), { deal: "Deal", maxSteps: 3000 });
  assert.equal(plain.cardsPlayed, undefined, "only tracked on request");
}
console.log("card balance tests passed");

// Slapping: Slapjack flow, wrong and late slaps, rule variants, guests slap as themselves.
{
  let state = Engine.createTable(Presets.get("slapjack"), { players: ["Ana", "Ben", "Cy"] });
  const [ana, ben, cy] = state.players.map((player) => player.id);
  const pile = zone(state, "pile");
  state = run(state, "Deal out");
  assert.equal(zone(state, "stack", ana).cards.length + zone(state, "stack", ben).cards.length + zone(state, "stack", cy).cards.length, 52);
  state = pull(state, "3h 7c", pile.id, "up");
  assert.equal(Engine.slapReason(state, state.zones[pile.id]), "");
  const benBefore = zone(state, "stack", ben).cards.length;
  state = act(state, { type: "slap", zone: pile.id, player: ben }, null);
  assert.equal(zone(state, "stack", ben).cards.length, benBefore - 1, "wrong slap burns a card");
  assert.equal(state.zones[pile.id].cards.length, 3);
  assert.match(lastLog(state), /Ben slapped wrong/);
  state = pull(state, "Jd", pile.id, "up");
  assert.equal(Engine.slapReason(state, state.zones[pile.id]), "a Jack");
  const top = state.zones[pile.id].cards.slice(-1)[0];
  const cyBefore = zone(state, "stack", cy).cards.length;
  state = act(state, { type: "slap", zone: pile.id, top, player: cy }, null);
  assert.equal(state.zones[pile.id].cards.length, 0);
  assert.equal(zone(state, "stack", cy).cards.length, cyBefore + 4);
  assert.ok(zone(state, "stack", cy).cards.slice(0, 4).every((id) => !state.cards[id].faceUp), "won cards go face down under the stack");
  assert.equal(state.players[state.turn.index].id, cy, "the slapper plays next");
  const afterWin = zone(state, "stack", ana).cards.length;
  state = act(state, { type: "slap", zone: pile.id, top, player: ana }, null);
  assert.match(lastLog(state), /too late/);
  assert.equal(zone(state, "stack", ana).cards.length, afterWin, "a late slap costs nothing");
  // A guest can't slap as someone else.
  state = pull(state, "Jc", pile.id, "up");
  const jc = state.zones[pile.id].cards.slice(-1)[0];
  state = act(state, { type: "slap", zone: pile.id, top: jc, player: cy }, ben, { strict: true });
  assert.match(lastLog(state), /Ben slapped a Jack/);
  // Rule variants.
  const variant = (slap, specs) => {
    let s = act(state, { type: "updateZone", zone: pile.id, patch: { rule: { slap, slapTo: "stack" } } });
    s = act(s, { type: "clearZone", zone: pile.id, to: zone(s, "deck").id });
    s = pull(s, specs, pile.id, "up");
    return Engine.slapReason(s, s.zones[pile.id]);
  };
  assert.equal(variant("pair", "4s 9h 9d"), "a pair");
  assert.equal(variant("pair", "9h 4s 9d"), "");
  assert.equal(variant("sandwich", "9h 4s 9d"), "a sandwich");
  assert.equal(variant("ratscrew", "2c Kh Qd"), "a marriage");
  assert.equal(variant("ratscrew", "5c 8h 2d 5s"), "top and bottom");
  assert.equal(variant("ratscrew", "5c 8h 2d 6s"), "");
  assert.match(Engine.describeRule(state.zones[pile.id].rule, state.zones[pile.id]), /slap it when top card is a jack to win the pile into your stack/i);
  // Bot games finish with slaps.
  const out = Engine.playOut(Engine.createTable(Presets.get("slapjack"), { players: 3 }), { deal: "Deal out", maxSteps: 20000 });
  assert.ok(out.finished, `slapjack finishes (${out.steps} steps)`);
}
console.log("slap tests passed");

// Bluffing: claims, calls both ways, privacy of the claim, bots.
{
  let state = Engine.createTable(Presets.get("cheat"), { players: ["Ana", "Ben", "Cy"] });
  const [ana, ben, cy] = state.players.map((player) => player.id);
  const pile = zone(state, "pile").id;
  state = act(state, { type: "setTurn", index: 0 });
  state = pull(state, "Ah Ad 7c", zone(state, "hand", ana).id, "down");
  assert.equal(Engine.nextClaimRank(state.zones[pile]), "A");
  state = act(state, { type: "move", cards: [cardIn(state, "Ah"), cardIn(state, "Ad")], to: pile }, ana);
  assert.deepEqual({ by: state.zones[pile].claim.by, rank: state.zones[pile].claim.rank, count: state.zones[pile].claim.count }, { by: ana, rank: "A", count: 2 });
  assert.match(lastLog(state), /Ana claims 2 × Aces/);
  assert.equal(current(state), ben, "turn passes after a claim");
  assert.ok(state.zones[pile].cards.every((id) => !state.cards[id].faceUp));
  // Guests see the claim but not which cards made it.
  const benView = Engine.viewFor(state, ben);
  const viewPile = Object.values(benView.zones).find((z) => z.key === "pile");
  assert.equal(viewPile.claim.count, 2);
  assert.equal(viewPile.claim.cards, undefined);
  assert.throws(() => act(state, { type: "callBluff", zone: pile, player: ana }, ana, { strict: true }), /own claim/);
  // A true claim: the caller takes the pile.
  let called = act(state, { type: "callBluff", zone: pile, player: ben }, ben, { strict: true });
  assert.match(lastLog(called), /True! Ben takes the pile \(2 cards\)/);
  assert.equal(called.zones[pile].cards.length, 0);
  assert.equal(called.zones[pile].claim, undefined);
  // A lie: Ben claims 2s with a 9; Cy calls and Ben takes it.
  state = pull(state, "9s", zone(state, "hand", ben).id, "down");
  state = act(state, { type: "move", cards: [cardIn(state, "9s")], to: pile }, ben);
  assert.equal(state.zones[pile].claim.rank, "2");
  const benHand = zone(state, "hand", ben).cards.length;
  state = act(state, { type: "callBluff", zone: pile, player: cy }, cy);
  assert.match(lastLog(state), /A bluff! Ben takes the pile \(3 cards\)/);
  assert.equal(zone(state, "hand", ben).cards.length, benHand + 3);
  assert.throws(() => act(state, { type: "callBluff", zone: pile, player: cy }, cy), /no claim/);
  // Too many cards at once is against the rules.
  state = pull(state, "2c 2d 2h 2s 3c", zone(state, "hand", cy).id, "down");
  const ranks = zone(state, "hand", cy).cards.slice(0, 5);
  state = act(state, { type: "setRules", mode: "enforce" });
  state = act(state, { type: "setTurn", index: 2 });
  assert.throws(() => act(state, { type: "move", cards: ranks, to: pile }, cy), /one to four/);
  // Bots: honest when they hold the rank, and a hand that proves a lie always calls.
  let fresh = run(Engine.createTable(Presets.get("cheat"), { players: 3 }), "Deal");
  const who = current(fresh);
  const play = Engine.claimPlay(fresh, who, fresh.zones[pile] || Object.values(fresh.zones).find((z) => z.key === "pile"));
  const needed = Engine.nextClaimRank(Object.values(fresh.zones).find((z) => z.key === "pile"));
  const holds = zone(fresh, "hand", who).cards.some((id) => fresh.cards[id].rank === needed);
  assert.equal(play.bluff, !holds);
  if (!play.bluff) assert.ok(play.cards.every((id) => fresh.cards[id].rank === needed));
  const counts = {};
  for (const id of zone(fresh, "hand", who).cards) counts[fresh.cards[id].rank] = (counts[fresh.cards[id].rank] || 0) + 1;
  const [rank, held] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const fake = { rule: { claim: "sequence", claimTo: "hand" }, claim: { by: "nobody", rank, count: 5 - held } };
  assert.equal(Engine.botCalls(fresh, who, fake), true, `holding ${held} of ${rank} disproves a claim of ${5 - held}`);
  const out = Engine.playOut(Engine.createTable(Presets.get("cheat"), { players: 4 }), { deal: "Deal", maxSteps: 8000 });
  assert.ok(out.finished, `cheat finishes (${out.steps} steps)`);
}
console.log("bluffing tests passed");

// Design diffs: readable changes between two saved designs.
{
  let state = Engine.createTable(Presets.get("crazy-eights"), { players: 3 });
  const before = Engine.toPreset(state);
  assert.deepEqual(Engine.diffDesigns(before, before), []);
  const discard = zone(state, "discard");
  state = act(state, { type: "updateZone", zone: discard.id, patch: { rule: { ...discard.rule, wild: ["8", "2"] } } });
  state = act(state, { type: "saveMacro", macro: { label: "Bonus", steps: [{ op: "score", who: "current", amount: 5 }] } });
  state = act(state, { type: "addZone", area: "table", zone: { name: "Graveyard" } });
  state = act(state, { type: "rebuildDeck", spec: { preset: "standard", jokers: 2 } });
  state = act(state, { type: "setRules", mode: "enforce" });
  const changes = Engine.diffDesigns(before, Engine.toPreset(state));
  const find = (area, pattern) => changes.find((change) => change.area === area && pattern.test(change.text));
  assert.ok(find("Rules", /warn → enforce/));
  assert.ok(find("Table groups", /Discard: rules .*8 is wild.* → .*8, 2 are wild/));
  assert.equal(find("Table groups", /Graveyard/)?.kind, "added");
  assert.equal(find("Actions", /^Bonus/)?.kind, "added");
  assert.ok(find("Deck", /52 cards\) → .*2 jokers \(54 cards\)/));
  const back = Engine.diffDesigns(Engine.toPreset(state), before);
  assert.equal(back.find((change) => change.area === "Actions" && change.text === "Bonus")?.kind, "removed");
}
console.log("design diff tests passed");

// Trading: offers need consent, show cards only to the two traders, and move cards and chips together.
{
  let state = Engine.createTable(Presets.get("holdem"), { players: ["Ana", "Ben", "Cy"] });
  const [ana, ben, cy] = state.players.map((player) => player.id);
  state = pull(state, "As Kd", zone(state, "hand", ana).id, "down");
  state = pull(state, "2c 3c", zone(state, "hand", ben).id, "down");
  const offered = [cardIn(state, "As"), cardIn(state, "Kd")];
  assert.throws(() => act(state, { type: "offerTrade", to: ana, cards: offered }, ana), /another player/);
  state = act(state, { type: "offerTrade", to: ben, cards: offered, want: 1, chips: 50 }, ana, { strict: true });
  assert.match(lastLog(state), /Ana offers Ben 2 cards \+ 50 chips for 1 card/);
  const offer = state.offers[0];
  assert.deepEqual(Engine.viewFor(state, ben).offers[0].show, ["A♠", "K♦"]);
  assert.equal(Engine.viewFor(state, cy).offers[0].show, null, "bystanders see only the count");
  assert.equal(Engine.viewFor(state, cy).offers[0].cards, undefined);
  assert.equal(Engine.viewFor(state, cy).offers[0].count, 2);
  // Only Ben can accept, and he must pick exactly one card to give back.
  assert.throws(() => act(state, { type: "answerTrade", id: offer.id, accept: true, cards: [] }, cy, { strict: true }), /isn't yours/);
  assert.throws(() => act(state, { type: "answerTrade", id: offer.id, accept: true, cards: [] }, ben, { strict: true }), /Pick 1/);
  assert.throws(() => act(state, { type: "answerTrade", id: offer.id, accept: true, cards: [cardIn(state, "As")] }, ben, { strict: true }), /Pick 1/, "can't give back the other player's card");
  const done = act(state, { type: "answerTrade", id: offer.id, accept: true, cards: [cardIn(state, "2c")] }, ben, { strict: true });
  assert.ok(zone(done, "hand", ben).cards.includes(cardIn(done, "As")) && zone(done, "hand", ben).cards.includes(cardIn(done, "Kd")));
  assert.ok(zone(done, "hand", ana).cards.includes(cardIn(done, "2c")));
  assert.equal(done.players[0].chips, 950);
  assert.equal(done.players[1].chips, 1050);
  assert.equal(done.offers.length, 0);
  // Declining and withdrawing both clear the offer; moved cards void it.
  assert.equal(act(state, { type: "answerTrade", id: offer.id, accept: false }, ben, { strict: true }).offers.length, 0);
  assert.equal(act(state, { type: "answerTrade", id: offer.id, accept: false }, ana, { strict: true }).offers.length, 0);
  const moved = act(state, { type: "move", cards: [cardIn(state, "As")], to: zone(state, "board").id }, ana);
  assert.throws(() => act(moved, { type: "answerTrade", id: offer.id, accept: true, cards: [cardIn(moved, "2c")] }, ben), /moved/);
  // A new offer to the same player replaces the old one.
  const again = act(state, { type: "offerTrade", to: ben, cards: [offered[0]], want: 0 }, ana);
  assert.equal(again.offers.length, 1);
  assert.equal(again.offers[0].cards.length, 1);
}
console.log("trading tests passed");

// Wizard styles for the new mechanics, Egyptian Ratscrew, and design checks for slap/bluff targets.
{
  for (const style of ["slap", "bluff"]) {
    const table = Engine.createTable(Presets.fromWizard({ style, name: style, players: 3, target: 2 }), {});
    assert.equal(Engine.lintDesign(table).filter((i) => i.level !== "info").length, 0, style);
    const out = Engine.playOut(table, { deal: table.macros[0].id, maxSteps: 20000 });
    assert.ok(out.finished, `${style} wizard game finishes`);
  }
  const rat = Engine.createTable(Presets.get("ratscrew"), { players: 3 });
  assert.equal(Engine.lintDesign(rat).filter((i) => i.level !== "info").length, 0);
  assert.ok(Engine.playOut(rat, { deal: "Deal out", maxSteps: 20000 }).finished);
  const pile = zone(rat, "pile");
  const broken = act(rat, { type: "updateZone", zone: pile.id, patch: { rule: { slap: "pair", slapTo: "nowhere" } } });
  assert.ok(Engine.lintDesign(broken).some((i) => i.level === "error" && /nowhere/.test(i.message)));
}
console.log("wizard mechanics tests passed");

// Ratscrew challenges: face cards demand an answer within 1–4 flips.
{
  let state = Engine.createTable(Presets.get("ratscrew"), { players: ["Ana", "Ben", "Cy"] });
  const [ana, ben, cy] = state.players.map((player) => player.id);
  const pile = zone(state, "pile").id;
  state = act(state, { type: "setTurn", index: 0 });
  // Stack everyone's top cards: Ana flips a Queen; Ben answers with 5 then 7 (two chances, no face): Ana wins.
  state = pull(state, "Qh", zone(state, "stack", ana).id, "down");
  state = pull(state, "9c 7c 5c", zone(state, "stack", ben).id, "down");
  state = pull(state, "2d", zone(state, "stack", cy).id, "down");
  state = run(state, "Flip", ana);
  assert.deepEqual(state.zones[pile].challenge, { by: ana, left: 2 });
  assert.equal(current(state), ben);
  state = run(state, "Flip", ben);
  assert.equal(current(state), ben, "Ben keeps flipping while the challenge stands");
  assert.equal(state.zones[pile].challenge.left, 1);
  state = run(state, "Flip", ben);
  assert.equal(state.zones[pile].cards.length, 0);
  assert.match(state.log.map((entry) => entry.text).join("\n"), /Ana wins the challenge and takes the pile \(3 cards\)/);
  assert.equal(current(state), ana, "the winner plays next");
  // An answered challenge passes on: Ana flips a Jack, Ben answers with a King, Cy must answer in 3.
  let s2 = Engine.createTable(Presets.get("ratscrew"), { players: ["Ana", "Ben", "Cy"] });
  s2 = act(s2, { type: "setTurn", index: 0 });
  s2 = pull(s2, "Jh", zone(s2, "stack", s2.players[0].id).id, "down");
  s2 = pull(s2, "Kd", zone(s2, "stack", s2.players[1].id).id, "down");
  s2 = pull(s2, "3c 4c", zone(s2, "stack", s2.players[2].id).id, "down");
  s2 = run(s2, "Flip", s2.players[0].id);
  s2 = run(s2, "Flip", s2.players[1].id);
  assert.deepEqual(s2.zones[pile].challenge, { by: s2.players[1].id, left: 3 });
  assert.equal(current(s2), s2.players[2].id);
  // Cy runs out of cards before answering: Ben takes the pile.
  s2 = run(s2, "Flip", s2.players[2].id);
  s2 = run(s2, "Flip", s2.players[2].id);
  assert.equal(s2.zones[pile].cards.length, 0, "out of cards to answer with");
  assert.match(s2.log.map((entry) => entry.text).join("\n"), /Ben wins the challenge/);
  // A good slap ends a challenge.
  let s3 = Engine.createTable(Presets.get("ratscrew"), { players: 2 });
  s3 = act(s3, { type: "setTurn", index: 0 });
  s3 = pull(s3, "Kh Ks", zone(s3, "pile").id, "up");
  s3.zones[pile].challenge = { by: s3.players[0].id, left: 3 };
  s3 = act(s3, { type: "slap", zone: pile, player: s3.players[1].id }, null);
  assert.equal(s3.zones[pile].challenge, undefined);
  // Bot games with challenges and slaps finish.
  for (let i = 0; i < 5; i += 1) {
    const out = Engine.playOut(Engine.createTable(Presets.get("ratscrew"), { players: 3 }), { deal: "Deal out", maxSteps: 30000 });
    assert.ok(out.finished, `ratscrew finishes (${out.steps} steps)`);
  }
}
console.log("ratscrew challenge tests passed");

// Real time (Speed): any player plays any time, ranks wrap, per-seat refill, win check.
{
  let state = Engine.createTable(Presets.get("speed"), {});
  assert.equal(state.realtime, true);
  const [ana, ben] = state.players.map((player) => player.id);
  state = run(state, "Deal");
  assert.equal(zone(state, "hand", ana).cards.length, 5);
  assert.equal(zone(state, "stock", ben).cards.length, 15);
  const left = zone(state, "left").id;
  state = act(state, { type: "clearZone", zone: left, to: zone(state, "deck").id });
  state = pull(state, "Kc", left, "up");
  state = pull(state, "As", zone(state, "hand", ben).id, "down");
  const spare = zone(state, "hand", ben).cards.find((id) => id !== cardIn(state, "As"));
  state = act(state, { type: "move", cards: [spare], to: zone(state, "deck").id }, null);
  state = act(state, { type: "setTurn", index: 0 });
  // Ben plays out of turn, and A on K wraps.
  state = act(state, { type: "move", cards: [cardIn(state, "As")], to: left }, ben);
  assert.equal(state.zones[left].cards.slice(-1)[0], cardIn(state, "As"));
  assert.equal(zone(state, "hand", ben).cards.length, 5, "per-seat refill topped Ben back up");
  assert.equal(zone(state, "stock", ben).cards.length, 14);
  state = pull(state, "7h", zone(state, "hand", ana).id, "down");
  assert.throws(() => act(state, { type: "move", cards: [cardIn(state, "7h")], to: left }, ana), /one higher or lower/);
  assert.ok(Engine.describeRule(state.zones[left].rule, state.zones[left]).includes("King and Ace wrap"));
  // Toggle and round-trip the flag.
  const off = act(state, { type: "setBotFallback", macro: state.botFallback, realtime: false });
  assert.equal(off.realtime, false);
  assert.equal(Engine.toPreset(state).realtime, true);
  assert.ok(Engine.diffDesigns(Engine.toPreset(state), Engine.toPreset(off)).some((change) => /Real time/.test(change.text)));
  const out = Engine.playOut(Engine.createTable(Presets.get("speed"), {}), { deal: "Deal", maxSteps: 6000 });
  assert.ok(out.finished && /played every card/.test(out.state.gameOver.reason));
}
console.log("real-time tests passed");

// Real-time shedding from the wizard, and the rules document says so.
{
  const design = Presets.fromWizard({ style: "shedding", name: "Frenzy", players: 3, realtime: true, target: 30 });
  const table = Engine.createTable(design, {});
  assert.equal(table.realtime, true);
  const discard = Object.values(table.zones).find((z) => z.kind === "discard");
  assert.equal(discard.rule.place, "players");
  assert.equal(discard.rule.advance, undefined);
  assert.match(Engine.describeGame(table), /Real time: there are no turns/);
  assert.doesNotMatch(Engine.describeGame(Engine.createTable(Presets.fromWizard({ style: "shedding" }), {})), /Real time/);
  const out = Engine.playOut(table, { deal: table.macros[0].id, maxSteps: 30000 });
  assert.ok(out.finished, `real-time shedding finishes (${out.steps})`);
}
console.log("real-time wizard tests passed");

// Table talk: per-player tallies for slaps, calls, challenges and trades.
{
  let state = Engine.createTable(Presets.get("slapjack"), { players: ["Ana", "Ben"] });
  const [ana, ben] = state.players.map((player) => player.id);
  const pile = zone(state, "pile").id;
  state = run(state, "Deal out");
  state = pull(state, "3h", pile, "up");
  state = act(state, { type: "slap", zone: pile, player: ben }, null);
  state = pull(state, "Jd", pile, "up");
  state = act(state, { type: "slap", zone: pile, player: ben }, null);
  assert.deepEqual(state.stats[ben], { wrongSlaps: 1, slaps: 1 });
  assert.equal(state.stats[ana], undefined);
  let cheat = Engine.createTable(Presets.get("cheat"), { players: ["Ana", "Ben", "Cy"] });
  const cp = zone(cheat, "pile").id;
  cheat = act(cheat, { type: "setTurn", index: 0 });
  cheat = pull(cheat, "9s", zone(cheat, "hand", cheat.players[0].id).id, "down");
  cheat = act(cheat, { type: "move", cards: [cardIn(cheat, "9s")], to: cp }, cheat.players[0].id);
  cheat = act(cheat, { type: "callBluff", zone: cp, player: cheat.players[1].id }, cheat.players[1].id);
  assert.deepEqual(cheat.stats[cheat.players[1].id], { calls: 1, rightCalls: 1 });
  assert.deepEqual(cheat.stats[cheat.players[0].id], { caught: 1 });
  assert.ok(Engine.viewFor(cheat, cheat.players[2].id).stats, "tallies are public");
}
console.log("table talk tests passed");
