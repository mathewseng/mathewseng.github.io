(function (root, factory) {
  const api = factory();
  root.CardPresets = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  /*
   * Game presets. Each preset describes table groups, the per-seat template,
   * the deck, one-tap actions (macros), phases and scoring. Everything here is
   * editable once the table is created, and any table can be saved back out
   * as a custom preset.
   *
   * Zone reference syntax inside macro steps: see CardEngine.resolveZones.
   */

  // ---- zone helpers --------------------------------------------------
  const deck = (extra = {}) => ({ key: "deck", name: "Deck", kind: "deck", layout: "stack", visibility: "hidden", face: "down", ...extra });
  const discard = (extra = {}) => ({ key: "discard", name: "Discard", kind: "discard", layout: "stack", visibility: "public", face: "up", ...extra });
  const muck = (extra = {}) => ({ key: "muck", name: "Muck", kind: "discard", layout: "stack", visibility: "hidden", face: "down", ...extra });
  const board = (extra = {}) => ({ key: "board", name: "Board", kind: "board", layout: "spread", visibility: "public", face: "up", ...extra });
  const hand = (extra = {}) => ({ key: "hand", name: "Hand", kind: "hand", layout: "fan", visibility: "owner", face: "down", ...extra });
  const row = (key, name, extra = {}) => ({ key, name, kind: "row", layout: "spread", visibility: "public", face: "up", ...extra });

  // ---- step helpers --------------------------------------------------
  const collect = (to = "deck") => ({ op: "collect", to, shuffle: true });
  const deal = (to, count, face, from = "deck") => ({ op: "deal", from, to, count, ...(face ? { face } : {}) });
  const flip = (zone, face = "up", count) => ({ op: "flip", zone, face, ...(count ? { count } : {}) });
  const say = (text) => ({ op: "log", text });
  const phase = (text) => ({ op: "phase", text });
  // A trick: players play in turn, must follow suit, one card each; the turn passes after each play.
  const trick = (extra = {}) => ({ key: "trick", name: "Trick", kind: "board", layout: "spread", visibility: "public", face: "up", evals: ["trick"], rule: { place: "turn", follow: true, once: true, advance: true }, ...extra });
  const takeTrick = (face, extra = []) => ({
    label: "Take trick",
    hint: "The trick's winner takes it and leads next",
    steps: [{ op: "findWinner", zone: "trick" }, { op: "clear", from: "trick", to: "tricks@winner", ...(face ? { face } : {}) }, ...extra, { op: "setTurn", who: "winner" }],
  });

  // Color Clash: a custom-card shedding deck built entirely from custom cards.
  const CLASH_COLORS = [["Red", "#d9434b"], ["Yellow", "#b98a00"], ["Green", "#23915a"], ["Blue", "#3b63d9"]];
  function clashDeck() {
    const custom = [];
    for (const [suit, color] of CLASH_COLORS) {
      custom.push({ label: "0", rank: "0", suit, color, value: 0, count: 1 });
      for (let n = 1; n <= 9; n += 1) custom.push({ label: String(n), rank: String(n), suit, color, value: n, count: 2 });
      custom.push({ label: "Skip", rank: "Skip", suit, color, value: 20, count: 2, icon: "⊘", text: "The next player loses their turn." });
      custom.push({ label: "Reverse", rank: "Reverse", suit, color, value: 20, count: 2, icon: "⇄", text: "Reverse the direction of play." });
      custom.push({ label: "Draw Two", rank: "+2", suit, color, value: 20, count: 2, icon: "+2", text: "The next player draws two and loses their turn." });
    }
    custom.push({ label: "Wild", rank: "Wild", suit: "Wild", color: "#2a2d36", value: 50, count: 4, icon: "✦", text: "Name the next color." });
    custom.push({ label: "Wild Draw Four", rank: "Wild+4", suit: "Wild", color: "#2a2d36", value: 50, count: 4, icon: "+4", text: "Name the color; the next player draws four." });
    return { preset: "none", custom };
  }

  // Market Builder: a small deck-builder made of custom cards that start in market piles.
  function marketDeck() {
    const stack = (label, count, extra) => {
      const out = [];
      for (let left = count; left > 0; left -= 20) out.push({ label, count: Math.min(20, left), ...extra });
      return out;
    };
    return {
      preset: "none",
      back: { color: "#6b4f2a", text: "MARKET" },
      custom: [
        ...stack("Copper", 60, { suit: "Treasure", color: "#b87333", value: 0, icon: "●", text: "+1 coin", home: "copper" }),
        ...stack("Silver", 40, { suit: "Treasure", color: "#8a949e", value: 3, icon: "●●", text: "+2 coins", home: "silver" }),
        ...stack("Gold", 30, { suit: "Treasure", color: "#c9a227", value: 6, icon: "●●●", text: "+3 coins", home: "gold" }),
        ...stack("Acre", 24, { suit: "Victory", color: "#3f8f4e", value: 2, icon: "🌾", text: "1 victory point", home: "acre" }),
        ...stack("Manor", 12, { suit: "Victory", color: "#2f6fb0", value: 5, icon: "🏠", text: "3 victory points", home: "manor" }),
        ...stack("Castle", 12, { suit: "Victory", color: "#7a3fb0", value: 8, icon: "🏰", text: "6 victory points", home: "castle" }),
      ],
    };
  }
  const marketPile = (key, name) => ({ key, name, kind: "pile", layout: "stack", visibility: "public", face: "up", rule: { place: "nobody", cost: "Coins" } });

  const PRESETS = [
    {
      id: "sandbox",
      name: "Sandbox",
      family: "Freeform",
      tagline: "Free-drag felt, one deck, a hand per seat",
      description: "A blank canvas like a physical table: drag cards anywhere on the felt, build any groups you need, and attach scoring to them.",
      players: { min: 1, max: 12, default: 2 },
      deck: { preset: "standard" },
      table: [deck(), { key: "felt", name: "Felt", kind: "free", layout: "free", visibility: "public", face: "up", wide: true }, discard()],
      seat: [hand({ evals: ["poker-high", "set-summary"] })],
      macros: [
        { label: "Deal 5 each", hint: "Shuffle and deal five to every hand", steps: [collect(), deal("hand", 5)] },
        { label: "Draw 1", hint: "Current player draws one", steps: [deal("hand@current", 1)] },
        { label: "Flip 1 to felt", steps: [deal("felt", 1, "up")] },
        { label: "Collect & shuffle", steps: [collect()] },
      ],
      scoring: { target: 0 },
      rules: "Sandbox table.\n\nDrag cards onto the felt to place them anywhere. Use + Group to add new piles, rows, or hands, and attach evaluators (poker, blackjack, cribbage...) to any group.",
    },
    {
      id: "holdem",
      name: "Texas Hold'em",
      family: "Poker",
      tagline: "2 hole cards, 5 community, live hand ranks + equity",
      description: "Two hole cards and a five-card board. Hands are ranked live against the board, and the equity tool runs Monte Carlo odds.",
      players: { min: 2, max: 10, default: 4 },
      deck: { preset: "standard" },
      table: [deck(), muck({ key: "burn", name: "Burn" }), board({ evals: ["poker-high"] }), muck()],
      seat: [hand({ evals: ["poker-high"], ctx: { board: "board" } })],
      phases: ["Preflop", "Flop", "Turn", "River", "Showdown"],
      macros: [
        { label: "New hand", hint: "Collect, shuffle, pass the button, deal two each", steps: [collect(), { op: "nextDealer" }, deal("hand", 2), phase("Preflop"), { op: "setTurn", who: "next" }] },
        { label: "Flop", steps: [deal("burn", 1), deal("board", 3, "up"), phase("Flop")] },
        { label: "Turn", steps: [deal("burn", 1), deal("board", 1, "up"), phase("Turn")] },
        { label: "River", steps: [deal("burn", 1), deal("board", 1, "up"), phase("River")] },
        { label: "Showdown", steps: [flip("hand"), phase("Showdown")] },
      ],
      scoring: { chips: 1000, label: "Chips" },
      rules: "Texas Hold'em\n\n• Each player gets 2 hole cards.\n• Betting rounds: preflop, flop (3), turn (1), river (1).\n• Best five-card hand from hole cards + board wins.\n\nUse the chip panel for blinds/bets, then award the pot to the winner (the ranking badge crowns the best hand at showdown).",
    },
    {
      id: "omaha",
      name: "Pot-Limit Omaha",
      family: "Poker",
      tagline: "4 hole cards, must use exactly 2",
      description: "Four hole cards; every hand uses exactly two hole cards and three from the board.",
      players: { min: 2, max: 9, default: 4 },
      deck: { preset: "standard" },
      table: [deck(), muck({ key: "burn", name: "Burn" }), board(), muck()],
      seat: [hand({ evals: ["poker-omaha"], ctx: { board: "board" } })],
      phases: ["Preflop", "Flop", "Turn", "River", "Showdown"],
      macros: [
        { label: "New hand", steps: [collect(), { op: "nextDealer" }, deal("hand", 4), phase("Preflop"), { op: "setTurn", who: "next" }] },
        { label: "Flop", steps: [deal("burn", 1), deal("board", 3, "up"), phase("Flop")] },
        { label: "Turn", steps: [deal("burn", 1), deal("board", 1, "up"), phase("Turn")] },
        { label: "River", steps: [deal("burn", 1), deal("board", 1, "up"), phase("River")] },
        { label: "Showdown", steps: [flip("hand"), phase("Showdown")] },
      ],
      scoring: { chips: 1000, label: "Chips" },
      rules: "Pot-Limit Omaha\n\nFour hole cards. You must use exactly two hole cards and three board cards.",
    },
    {
      id: "ultimate-omaha",
      name: "Ultimate Omaha",
      family: "Poker",
      tagline: "Two boards, qualify on both, multipliers",
      description: "Four hole cards against two separate boards; each hand is ranked on both boards at once.",
      players: { min: 1, max: 10, default: 3 },
      deck: { preset: "standard" },
      table: [deck(), board({ key: "board-1", name: "Board 1" }), board({ key: "board-2", name: "Board 2" })],
      seat: [hand({ evals: ["poker-omaha@board-1", "poker-omaha@board-2"] })],
      phases: ["Preflop", "Flop", "Showdown"],
      macros: [
        { label: "Deal", steps: [collect(), deal("hand", 4), deal("board-1", 5, "down"), deal("board-2", 5, "down"), phase("Preflop")] },
        { label: "Flop both", steps: [flip("board-1", "up", 5), flip("board-2", "up", 5), { op: "flip", zone: "board-1", face: "down", count: 2 }, { op: "flip", zone: "board-2", face: "down", count: 2 }, phase("Flop")] },
        { label: "Showdown", steps: [flip("board-1"), flip("board-2"), flip("hand"), phase("Showdown")] },
      ],
      scoring: { chips: 100, label: "Chips" },
      rules: "Ultimate Omaha\n\n• 4 hole cards, two 5-card boards.\n• Omaha rules on each board (exactly two hole cards).\n• Qualify with a pair of aces or better on BOTH boards.\n• Multipliers per board: pair–trips 1×, straight/flush 2×, boat 3×, quads 4×, straight flush 5×, royal 10×. Total = board 1 × board 2.\n• Players may double their bet preflop and on the flop.",
    },
    {
      id: "five-card-draw",
      name: "Five-Card Draw",
      family: "Poker",
      tagline: "Deal 5, discard & draw",
      description: "Classic draw poker. Select cards, send them to the muck, then draw replacements.",
      players: { min: 2, max: 7, default: 4 },
      deck: { preset: "standard" },
      table: [deck(), muck()],
      seat: [hand({ evals: ["poker-high"] })],
      phases: ["Deal", "Draw", "Showdown"],
      macros: [
        { label: "New hand", steps: [collect(), { op: "nextDealer" }, deal("hand", 5), phase("Deal"), { op: "setTurn", who: "next" }] },
        { label: "Draw 1 (current)", steps: [deal("hand@current", 1)] },
        { label: "Showdown", steps: [flip("hand"), phase("Showdown")] },
      ],
      scoring: { chips: 500, label: "Chips" },
      rules: "Five-Card Draw\n\nDeal five each. In turn, discard up to five (select cards → Muck) and draw that many (Draw 1 repeatedly, or use the deck's Draw N). Best high hand wins.",
    },
    {
      id: "stud",
      name: "Seven-Card Stud",
      family: "Poker",
      tagline: "Down, down, up… up cards visible to all",
      description: "Two down, four up, one down. Up cards are visible to every player; down cards only to their owner.",
      players: { min: 2, max: 7, default: 4 },
      deck: { preset: "standard" },
      table: [deck(), muck()],
      seat: [hand({ layout: "overlap", evals: ["poker-high"] })],
      phases: ["3rd street", "4th street", "5th street", "6th street", "7th street", "Showdown"],
      macros: [
        { label: "3rd street", steps: [collect(), deal("hand", 2, "down"), deal("hand", 1, "up"), phase("3rd street")] },
        { label: "Next street (up)", steps: [deal("hand", 1, "up"), { op: "phase", text: "Up street" }] },
        { label: "7th street (down)", steps: [deal("hand", 1, "down"), phase("7th street")] },
        { label: "Showdown", steps: [flip("hand"), phase("Showdown")] },
      ],
      scoring: { chips: 500, label: "Chips" },
      rules: "Seven-Card Stud\n\n2 down + 1 up, then three more up cards, then a final down card. Best five of seven.\n\nSwap the hand evaluator to A-5 Low for Razz.",
    },
    {
      id: "triple-draw",
      name: "2-7 Triple Draw",
      family: "Poker",
      tagline: "Lowball with three draws",
      description: "Deuce-to-seven lowball: straights and flushes count against you; 7-5-4-3-2 is the nuts.",
      players: { min: 2, max: 6, default: 4 },
      deck: { preset: "standard" },
      table: [deck(), muck()],
      seat: [hand({ evals: ["low-27", "badugi"] })],
      phases: ["Deal", "Draw 1", "Draw 2", "Draw 3", "Showdown"],
      macros: [
        { label: "New hand", steps: [collect(), { op: "nextDealer" }, deal("hand", 5), phase("Deal")] },
        { label: "Draw 1 (current)", steps: [deal("hand@current", 1)] },
        { label: "Showdown", steps: [flip("hand"), phase("Showdown")] },
      ],
      scoring: { chips: 500, label: "Chips" },
      rules: "2-7 Triple Draw\n\nFive cards, three drawing rounds. Lowest hand wins; aces are high, straights and flushes count.",
    },
    {
      id: "badugi",
      name: "Badugi",
      family: "Poker",
      tagline: "4 cards, all suits & ranks different",
      description: "Four-card triple draw for the best rainbow low hand.",
      players: { min: 2, max: 6, default: 4 },
      deck: { preset: "standard" },
      table: [deck(), muck()],
      seat: [hand({ evals: ["badugi"] })],
      phases: ["Deal", "Draw 1", "Draw 2", "Draw 3", "Showdown"],
      macros: [
        { label: "New hand", steps: [collect(), { op: "nextDealer" }, deal("hand", 4), phase("Deal")] },
        { label: "Draw 1 (current)", steps: [deal("hand@current", 1)] },
        { label: "Showdown", steps: [flip("hand"), phase("Showdown")] },
      ],
      scoring: { chips: 500, label: "Chips" },
      rules: "Badugi\n\nFour cards; the best hand has four different suits and four different ranks, aces low (A-2-3-4 rainbow).",
    },
    {
      id: "edge-the-dealer",
      name: "Edge the Dealer",
      family: "Poker",
      tagline: "Barely beat the dealer's 7",
      description: "5-card draw against a 7-card dealer hand. If anyone beats the dealer, the LOWEST beating hand wins.",
      players: { min: 1, max: 9, default: 3 },
      deck: { preset: "standard" },
      table: [deck(), board({ key: "dealer", name: "Dealer", evals: ["poker-high"] }), muck()],
      seat: [hand({ evals: ["poker-high"] })],
      phases: ["Deal", "Draw 1", "Draw 2", "Showdown"],
      macros: [
        { label: "Deal", steps: [collect(), deal("hand", 5), deal("dealer", 7, "up"), phase("Deal")] },
        { label: "Draw 1 (current)", steps: [deal("hand@current", 1)] },
        { label: "Showdown", steps: [flip("hand"), phase("Showdown")] },
      ],
      scoring: { chips: 100, label: "Chips" },
      rules: "Edge the Dealer\n\n• Everyone antes; each player gets 5 private cards, the dealer shows 7 (best 5 play).\n• 1–4 simultaneous draw rounds.\n• If one or more players beat the dealer, the LOWEST hand that beats the dealer wins the pot.\n• If nobody beats the dealer, the HIGHEST player hand wins.",
    },
    {
      id: "blackjack",
      name: "Blackjack",
      family: "Casino",
      tagline: "6-deck shoe, soft/hard totals, splits",
      description: "Dealer hand plus per-seat hands with live totals. Includes a split group per seat.",
      players: { min: 1, max: 7, default: 3 },
      deck: { preset: "standard", decks: 6 },
      table: [deck({ name: "Shoe" }), board({ key: "dealer", name: "Dealer", layout: "overlap", face: "keep", evals: ["blackjack"] }), discard({ face: "down", visibility: "hidden" })],
      seat: [
        { key: "hand", name: "Hand", kind: "hand", layout: "overlap", visibility: "public", face: "up", evals: ["blackjack"], ctx: { charlie: 0 } },
        { key: "split", name: "Split", kind: "hand", layout: "overlap", visibility: "public", face: "up", evals: ["blackjack"] },
      ],
      phases: ["Bets", "Player turns", "Dealer", "Settle"],
      macros: [
        { label: "Deal round", hint: "Clears to discard, then deals like a casino", steps: [
          { op: "clear", from: "hand", to: "discard" }, { op: "clear", from: "split", to: "discard" }, { op: "clear", from: "dealer", to: "discard" },
          deal("hand", 1, "up"), deal("dealer", 1, "up"), deal("hand", 1, "up"), deal("dealer", 1, "down"), phase("Player turns"), { op: "setTurn", who: "next" },
        ] },
        { label: "Hit", hint: "Current player takes a card", steps: [deal("hand@current", 1, "up")] },
        { label: "Hit split", steps: [deal("split@current", 1, "up")] },
        { label: "Dealer plays", hint: "Reveal and draw to 17", steps: [flip("dealer"), { op: "dealUntil", from: "shoe", to: "dealer", face: "up", evaluator: "blackjack", cmp: ">=", n: 17 }, phase("Settle")] },
        { label: "Dealer hits", steps: [deal("dealer", 1, "up")] },
        { label: "Reshuffle shoe", steps: [collect()] },
      ],
      scoring: { chips: 500, label: "Chips" },
      rules: "Blackjack\n\n• Get closer to 21 than the dealer without busting. Blackjack (A + ten) pays 3:2.\n• Dealer plays reveals the hole card and draws to 17 automatically (a “Deal until” step you can edit).\n• To split: drag one card to your Split group and Hit split.\n• Settle each bet with the chip panel (Transfer / Bet / Award).",
    },
    {
      id: "baccarat",
      name: "Baccarat",
      family: "Casino",
      tagline: "Player vs Banker, 8-deck shoe",
      description: "Punto banco with live point totals for both hands.",
      players: { min: 1, max: 8, default: 2 },
      deck: { preset: "standard", decks: 8 },
      table: [deck({ name: "Shoe" }), board({ key: "player", name: "Player", evals: ["baccarat"] }), board({ key: "banker", name: "Banker", evals: ["baccarat"] }), discard({ face: "down", visibility: "hidden" })],
      seat: [],
      macros: [
        { label: "Deal coup", steps: [{ op: "clear", from: "player", to: "discard" }, { op: "clear", from: "banker", to: "discard" }, deal("player", 1, "up"), deal("banker", 1, "up"), deal("player", 1, "up"), deal("banker", 1, "up")] },
        { label: "Player third", steps: [deal("player", 1, "up")] },
        { label: "Banker third", steps: [deal("banker", 1, "up")] },
      ],
      scoring: { chips: 1000, label: "Chips" },
      rules: "Baccarat (punto banco)\n\nTwo cards each to Player and Banker. Totals are mod 10. Naturals (8/9) stand. Player draws on 0–5; Banker's third-card rule depends on the player's third card.",
    },
    {
      id: "cribbage",
      name: "Cribbage",
      family: "Cribbage",
      tagline: "Crib, starter, pegging count, peg board to 121",
      description: "Hands are scored with the starter (15s, pairs, runs, flush, nobs); the pegging pile tracks the count and last-play points.",
      players: { min: 2, max: 4, default: 2 },
      deck: { preset: "standard" },
      table: [
        deck(),
        { key: "starter", name: "Starter", kind: "pile", layout: "stack", visibility: "public", face: "up", limit: 1 },
        { key: "pegging", name: "Pegging", kind: "board", layout: "overlap", visibility: "public", face: "up", evals: ["cribbage-pegging"], rule: { place: "turn", advance: true } },
        { key: "crib", name: "Crib", kind: "pile", layout: "spread", visibility: "hidden", face: "down", evals: ["cribbage-hand"], ctx: { starter: "starter", isCrib: true } },
      ],
      seat: [
        hand({ evals: ["cribbage-hand"], ctx: { starter: "starter" } }),
        { key: "played", name: "Played", kind: "pile", layout: "overlap", visibility: "public", face: "up" },
      ],
      phases: ["Discard to crib", "Cut", "Pegging", "Show", "Crib"],
      macros: [
        { label: "Deal 6 each", steps: [collect(), { op: "nextDealer" }, deal("hand", 6), phase("Discard to crib"), { op: "setTurn", who: "next" }] },
        { label: "Cut starter", steps: [{ op: "cut", zone: "deck" }, deal("starter", 1, "up"), phase("Pegging")] },
        { label: "New count (31/go)", hint: "Clears the pegging pile to the players' played piles", steps: [{ op: "clear", from: "pegging", to: "played@current", face: "up" }, say("New count")] },
        { label: "Return played", hint: "Take played cards back into hands for the show", steps: [{ op: "clear", from: "played", to: "hand", perSeat: true }, phase("Show")] },
        { label: "Show crib", steps: [flip("crib"), phase("Crib")] },
      ],
      scoring: { target: 121, peg: 121, label: "Points" },
      rules: "Cribbage\n\n• Deal 6 (2 players). Each discards 2 to the dealer's crib (drag to Crib).\n• Cut the starter; a Jack turned up gives the dealer 2 (“his heels”).\n• Pegging: play cards into Pegging; the badge shows the running count and points for the last card (15 = 2, 31 = 2, pairs, runs). Go/last card = 1.\n• Show: hands score with the starter — 15s, pairs, runs, flush, nobs — then the crib.\n• First to 121 wins. Use the Scores tab peg board.",
    },
    {
      id: "ofc",
      name: "OFC Pineapple",
      family: "Poker",
      tagline: "Top / middle / bottom rows with royalties",
      description: "Open-face Chinese poker. Each row shows its hand and royalty points; build bottom ≥ middle ≥ top or foul.",
      players: { min: 2, max: 3, default: 2 },
      deck: { preset: "standard" },
      table: [deck(), muck({ key: "discard", name: "Discards" })],
      seat: [
        row("top", "Top", { evals: ["ofc-top"], limit: 3 }),
        row("middle", "Middle", { evals: ["ofc-middle"], limit: 5 }),
        row("bottom", "Bottom", { evals: ["ofc-bottom"], limit: 5 }),
        hand({ key: "draw", name: "Draw" }),
      ],
      phases: ["Initial 5", "Street 2", "Street 3", "Street 4", "Street 5", "Scoring"],
      macros: [
        { label: "Initial 5", steps: [collect(), { op: "nextDealer" }, deal("draw", 5), phase("Initial 5")] },
        { label: "Pineapple 3", hint: "Deal three; place two, discard one", steps: [deal("draw", 3), { op: "phase", text: "Pineapple street" }] },
        { label: "Fantasyland 14", steps: [deal("draw@current", 14)] },
      ],
      scoring: { label: "Points" },
      rules: "Pineapple Open-Face Chinese\n\n• Rows: top (3), middle (5), bottom (5). Bottom must beat middle, middle must beat top, or you foul.\n• Start with 5 cards, then 4 streets of 3 (place 2, discard 1).\n• Royalties show on each row. Score 1 per row won + 3 scoop bonus + royalty differences.\n• Fantasyland: QQ+ on top (no foul) → 14 cards next hand.",
    },
    {
      id: "gin",
      name: "Gin Rummy",
      family: "Rummy",
      tagline: "10 cards, live deadwood & melds",
      description: "Stock and discard, with the best meld arrangement and deadwood computed live.",
      players: { min: 2, max: 2, default: 2 },
      deck: { preset: "standard" },
      table: [deck({ name: "Stock" }), discard({ rule: { place: "turn", advance: true } })],
      seat: [
        hand({ evals: ["gin-deadwood"] }),
        ...[1, 2, 3].map((n) => ({ key: "meld-" + n, name: "Meld " + n, kind: "pile", layout: "overlap", visibility: "public", face: "up", rule: { place: "owner", meld: "setOrRun" } })),
      ],
      phases: ["Draw", "Discard", "Knock"],
      macros: [
        { label: "Deal", steps: [collect(), { op: "nextDealer" }, deal("hand", 10), deal("discard", 1, "up"), { op: "setTurn", who: "next" }] },
        { label: "Draw stock", steps: [deal("hand@current", 1)] },
        { label: "Take discard", steps: [deal("hand@current", 1, undefined, "discard")] },
        { label: "Lay down", hint: "Reveal hands for the knock", steps: [flip("hand"), phase("Knock")] },
      ],
      scoring: { target: 100, label: "Points" },
      rules: "Gin Rummy\n\n• Meld groups only accept a set (one rank) or a run (one suit, in sequence); discarding passes the turn.\n• 10 cards each; draw from stock or discard, then discard one.\n• Knock with 10 or less deadwood; gin (0 deadwood) scores 25 bonus, big gin 31.\n• Undercut: defender's deadwood ≤ knocker's → defender scores difference + 25.\n• Game to 100.",
    },
    {
      id: "hearts",
      name: "Hearts",
      family: "Trick-taking",
      tagline: "Trick winner detection, point piles, low score wins",
      description: "Four players, 13 cards each. The trick group names the winner; won tricks count heart points.",
      players: { min: 3, max: 6, default: 4 },
      deck: { preset: "standard" },
      table: [deck(), trick({ rule: { place: "turn", follow: true, once: true, advance: true, phase: "Play" } })],
      seat: [
        hand({ evals: ["hearts-points"] }),
        { key: "pass", name: "Pass", kind: "pile", layout: "spread", visibility: "owner", face: "down", limit: 3, rule: { place: "owner", phase: "Pass" } },
        { key: "tricks", name: "Tricks won", kind: "pile", layout: "overlap", visibility: "public", face: "up", evals: ["hearts-points"] },
      ],
      phases: ["Pass", "Play"],
      macros: [
        { label: "Deal all", steps: [collect(), { op: "nextDealer" }, deal("hand", 13), { op: "sort", zone: "hand", by: "suit" }, phase("Pass"), { op: "setTurn", who: "next" }] },
        { label: "Pass cards", hint: "Runs by itself once everyone has put 3 cards in Pass", steps: [{ op: "passZones", zone: "pass", dir: "left" }, { op: "clear", from: "pass", to: "hand", perSeat: true }, { op: "sort", zone: "hand", by: "suit" }, phase("Play"), { op: "setTurn", who: "next" }, say("Cards passed left")] },
        takeTrick(),
        { label: "Score hand", hint: "Everyone scores the hearts in their tricks", steps: [{ op: "scoreZones", zone: "tricks", evaluator: "hearts-points" }, say("Hand scored"), { op: "nextRound" }] },
      ],
      triggers: [
        { event: "allFull", zone: "pass", n: 3, macro: "Pass cards" },
        { event: "count", zone: "trick", n: 0, macro: "Take trick" },
        { event: "allEmpty", zone: "hand", macro: "Score hand" },
      ],
      scoring: { target: 100, lowWins: true, label: "Points" },
      rules: "Hearts\n\n• Pass 3 cards (left, right, across, hold).\n• 2♣ leads. Follow suit if you can. Hearts can't lead until broken.\n• Each heart = 1, Q♠ = 13. Shooting the moon: 0 for you, 26 for everyone else.\n• Game ends at 100; lowest score wins.\n\nAutomated: put 3 cards in your Pass pile and when everyone has, they pass left and play starts; the trick checks follow-suit and turn order, the winner takes it and leads, and each hand is scored when every hand is empty. (Passing is always to the left here: edit the Pass cards action to rotate it.)",
    },
    {
      id: "spades",
      name: "Spades",
      family: "Trick-taking",
      tagline: "Spades trump, bids & tricks counters",
      description: "Partnership trick-taking with spades as trump. Bid and trick counters on every seat.",
      players: { min: 4, max: 4, default: 4 },
      deck: { preset: "standard" },
      table: [deck(), trick({ ctx: { trump: "s" } })],
      seat: [hand(), { key: "tricks", name: "Tricks", kind: "pile", layout: "stack", visibility: "public", face: "down" }],
      counters: [{ name: "Bid" }, { name: "Tricks" }, { name: "Bags" }],
      teams: ["North–South", "East–West"],
      macros: [
        { label: "Deal all", steps: [collect(), { op: "nextDealer" }, deal("hand", 13), { op: "sort", zone: "hand", by: "suit" }, { op: "setTurn", who: "next" }] },
        takeTrick("down", [{ op: "counter", who: "winner", name: "Tricks", amount: 1 }]),
        { label: "Score hand", hint: "Made your bid: 10 × bid + overtricks; missed it: −10 × bid", steps: [
          { op: "scoreFormula", who: "all", formula: "tricks >= bid ? 10 * bid + (tricks - bid) : -10 * bid" },
          { op: "counterFormula", who: "all", name: "Bags", formula: "bags + max(tricks - bid, 0)" },
          { op: "scoreFormula", who: "all", formula: "bags >= 10 ? -100 : 0" },
          { op: "counterFormula", who: "all", name: "Bags", formula: "bags >= 10 ? bags - 10 : bags" },
          { op: "setCounter", who: "all", name: "Tricks", amount: 0 },
          say("Hand scored: set your bids for the next hand"),
          { op: "nextRound" },
        ] },
      ],
      triggers: [
        { event: "count", zone: "trick", n: 0, macro: "Take trick" },
        { event: "allEmpty", zone: "hand", macro: "Score hand" },
      ],
      scoring: { target: 500, label: "Points" },
      rules: "Spades\n\n• Partners sit across. Before each hand, set your Bid counter (Scores → Counters). Spades are always trump.\n• Make your bid: 10 × bid + 1 per overtrick (bag); miss it: −10 × bid. 10 bags = −100.\n• Nil bid: +/−100 (score it by hand).\n\nAutomated: tricks resolve and count themselves, and when the hands run out a formula scores everyone (Score hand shows the formula).",
    },
    {
      id: "euchre",
      name: "Euchre",
      family: "Trick-taking",
      tagline: "24-card deck, kitty, trump counter",
      description: "Four players, five cards each, a four-card kitty with the top card turned.",
      players: { min: 4, max: 4, default: 4 },
      deck: { preset: "euchre" },
      table: [deck(), { key: "kitty", name: "Kitty", kind: "pile", layout: "stack", visibility: "hidden", face: "down" }, trick()],
      seat: [hand(), { key: "tricks", name: "Tricks", kind: "pile", layout: "stack", visibility: "public", face: "down" }],
      counters: [{ name: "Tricks" }],
      teams: ["North–South", "East–West"],
      macros: [
        { label: "Deal", steps: [collect(), { op: "nextDealer" }, deal("hand", 5), { op: "clear", from: "deck", to: "kitty", face: "down" }, flip("kitty", "up", 1), { op: "setTurn", who: "next" }] },
        takeTrick("down", [{ op: "counter", who: "winner", name: "Tricks", amount: 1 }]),
      ],
      triggers: [{ event: "count", zone: "trick", n: 0, macro: "Take trick" }],
      scoring: { target: 10, label: "Points" },
      rules: "Euchre\n\n• 9–A deck. Right bower (J of trump) is highest, left bower (other J of same color) second.\n• Set the trick group's trump in its settings once trump is named (bowers are not modelled — workshop them!).\n• Makers: 3–4 tricks = 1, march = 2. Euchred = 2 to defenders. Game to 10.",
    },
    {
      id: "crazy-eights",
      name: "Crazy Eights",
      family: "Shedding",
      tagline: "Match suit or rank, eights are wild",
      description: "Shedding game with a face-up discard pile and a stock.",
      players: { min: 2, max: 7, default: 4 },
      deck: { preset: "standard" },
      table: [deck({ name: "Stock" }), discard({ rule: { place: "turn", accept: "suitOrRank", wild: ["8"], advance: true } })],
      seat: [hand({ evals: ["points:c8"] })],
      schemes: [{ id: "c8", name: "Penalty points", low: true, ranks: { 8: 50 } }],
      macros: [
        { label: "Deal", steps: [collect(), deal("hand", 7), deal("discard", 1, "up"), { op: "setTurn", who: "next" }] },
        { label: "Draw", steps: [deal("hand@current", 1)] },
        { label: "Pass", steps: [{ op: "nextTurn" }] },
        { label: "Reshuffle stock", hint: "Discards except the top card become the stock", steps: [{ op: "clear", from: "discard", to: "stock", face: "down", keep: 1 }, { op: "shuffle", zone: "stock" }] },
        { label: "Out!", hint: "The player who went out scores everyone else's cards; a new hand is dealt", steps: [{ op: "scoreZones", zone: "hand", evaluator: "points:c8", target: "winner" }, say("{winner} went out!"), { op: "nextRound" }, { op: "runAction", macro: "Deal" }] },
      ],
      triggers: [
        { event: "empty", zone: "stock", macro: "Reshuffle stock" },
        { event: "empty", zone: "hand", macro: "Out!" },
      ],
      botFallback: "Draw",
      mustPlay: true,
      scoring: { target: 200, label: "Points" },
      rules: "Crazy Eights\n\nOn your turn, play a card matching the top discard by suit or rank, or draw. 8s are wild: play one any time and name the next suit.\n\nWhen someone plays their last card they score the penalty points left in every other hand (8 = 50, faces 10, others pip value). First to 200 wins.\n\nAutomated: plays are checked against the discard, the turn passes after a play, the stock reshuffles itself, and going out scores the round.",
    },
    {
      id: "war",
      name: "War",
      family: "Kids",
      tagline: "Flip, compare, winner takes both",
      description: "Each player flips the top of their stack into battle; the high card wins.",
      players: { min: 2, max: 4, default: 2 },
      deck: { preset: "standard" },
      table: [deck()],
      seat: [
        { key: "stack", name: "Stack", kind: "pile", layout: "stack", visibility: "hidden", face: "down" },
        { key: "battle", name: "Battle", kind: "board", layout: "overlap", visibility: "public", face: "up", evals: ["high-card"], ctx: { topOnly: true } },
        { key: "won", name: "Won", kind: "pile", layout: "stack", visibility: "public", face: "down" },
      ],
      macros: [
        { label: "Deal out", steps: [collect(), deal("stack", 26)] },
        { label: "Battle!", steps: [{ op: "deal", from: "stack", to: "battle", count: 1, face: "up", perSeat: true }, { op: "findWinner", zone: "battle" }] },
        { label: "War (3 down)", steps: [{ op: "deal", from: "stack", to: "battle", count: 3, face: "down", perSeat: true }, { op: "deal", from: "stack", to: "battle", count: 1, face: "up", perSeat: true }, { op: "findWinner", zone: "battle" }] },
        { label: "Winner takes", hint: "The last battle's winner collects every battle card", steps: [{ op: "clear", from: "battle", to: "won@winner", face: "down" }] },
      ],
      scoring: { label: "Cards" },
      rules: "War\n\nFlip the top card; the higher card takes both. On a tie, go to war: three face down, one up.\n\nBattle! names the winner from the top cards; Winner takes moves every battle card to their Won pile.",
    },
    {
      id: "go-fish",
      name: "Go Fish",
      family: "Kids",
      tagline: "Ask for ranks, lay down books",
      description: "A pond, a hand per player and a books group with set counting.",
      players: { min: 2, max: 6, default: 3 },
      deck: { preset: "standard" },
      table: [deck({ name: "Pond", layout: "stack" })],
      seat: [hand({ evals: ["set-summary"] }), { key: "books", name: "Books", kind: "pile", layout: "overlap", visibility: "public", face: "up", evals: ["count"] }],
      macros: [
        { label: "Deal 7", steps: [collect(), deal("hand", 7), { op: "sort", zone: "hand", by: "rank" }] },
        { label: "Go fish!", steps: [deal("hand@current", 1)] },
      ],
      scoring: { label: "Books" },
      rules: "Go Fish\n\nAsk another player for a rank; if they have any, they hand them over. Otherwise go fish. Four of a kind makes a book.",
    },
    {
      id: "color-clash",
      name: "Color Clash",
      family: "Shedding",
      tagline: "108 custom cards: match color or number",
      description: "A shedding game built only from custom cards, with action cards, wilds, automatic turn passing and reshuffles.",
      players: { min: 2, max: 8, default: 4 },
      deck: clashDeck(),
      table: [
        deck({ name: "Draw pile", rule: { place: "nobody" } }),
        discard({ rule: { place: "turn", accept: "suitOrRank", wild: ["Wild", "Wild+4"], advance: true } }),
      ],
      seat: [hand({ evals: ["points:clash"] })],
      schemes: [{ id: "clash", name: "Card points", low: true, ranks: { A: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, T: 0, J: 0, Q: 0, K: 0 }, customValues: true }],
      phases: ["Play"],
      macros: [
        { label: "Deal 7", steps: [collect(), { op: "nextDealer" }, deal("hand", 7), deal("discard", 1, "up"), { op: "setTurn", who: "next" }, phase("Play")] },
        { label: "Draw 1", hint: "Current player draws", steps: [deal("hand@current", 1)] },
        { label: "Pass", steps: [{ op: "nextTurn" }] },
        { label: "Skip", hint: "Runs by itself when a Skip is played", steps: [{ op: "nextTurn" }, say("{subject} skips a player")] },
        { label: "Reverse", hint: "Runs by itself when a Reverse is played", steps: [{ op: "reverse" }, { op: "setTurn", who: "subject" }, { op: "nextTurn" }] },
        { label: "Draw 2 & skip", hint: "Runs by itself after a Draw Two", steps: [deal("hand@current", 2), say("{current} draws two"), { op: "nextTurn" }] },
        { label: "Draw 4 & skip", hint: "Runs by itself after a Wild Draw Four", steps: [deal("hand@current", 4), say("{current} draws four"), { op: "nextTurn" }] },
        { label: "Reshuffle", hint: "Discards except the top become the draw pile", steps: [{ op: "clear", from: "discard", to: "draw pile", face: "down", keep: 1 }, { op: "shuffle", zone: "draw pile" }] },
        { label: "Out!", hint: "Whoever went out scores the other hands, then a new hand is dealt", steps: [{ op: "scoreZones", zone: "hand", evaluator: "points:clash", target: "winner" }, say("{winner} is out!"), { op: "nextRound" }, { op: "runAction", macro: "Deal 7" }] },
      ],
      triggers: [
        { event: "played", zone: "discard", card: "Skip", macro: "Skip" },
        { event: "played", zone: "discard", card: "Reverse", macro: "Reverse" },
        { event: "played", zone: "discard", card: "+2", macro: "Draw 2 & skip" },
        { event: "played", zone: "discard", card: "Wild+4", macro: "Draw 4 & skip" },
        { event: "empty", zone: "draw pile", macro: "Reshuffle" },
        { event: "empty", zone: "hand", macro: "Out!" },
      ],
      botFallback: "Draw 1",
      scoring: { target: 500, label: "Points" },
      rules: "Color Clash\n\n• Deal 7 each and turn one card up.\n• On your turn play a card matching the discard's color or number/symbol, or draw one.\n• Skip, Reverse and Draw Two are colored action cards; Wilds let you name the next color.\n• First to empty their hand scores every card left in the other hands: numbers at face value, actions 20, wilds 50. First to 500 wins.\n\nAutomated: action cards take effect when played (Rules → Automation shows the card-played triggers), the draw pile reshuffles, and going out scores the hand and deals the next one. Make every seat a bot to watch it play itself.\n\nEverything here is custom cards: open the Deck tab to see how the deck is defined, or import your own from a spreadsheet.",
    },
    {
      id: "draft-poker",
      name: "Draft Poker",
      family: "Drafting",
      tagline: "Pick one, pass the pack, build the best hand",
      description: "Everyone drafts from a pack that rotates around the table; after five picks the best poker hand wins the round.",
      players: { min: 2, max: 6, default: 4 },
      deck: { preset: "standard" },
      table: [deck(), muck()],
      seat: [
        hand({ key: "pack", name: "Pack", evals: ["set-summary"] }),
        { key: "picks", name: "Picks", kind: "hand", layout: "spread", visibility: "owner", face: "down", limit: 5, evals: ["poker-high"], rule: { place: "owner" } },
      ],
      phases: ["Pick", "Showdown"],
      macros: [
        { label: "Deal packs", hint: "Five cards to every pack", steps: [collect(), deal("pack", 5), phase("Pick")] },
        { label: "Pass packs", hint: "Everyone passes their pack left", steps: [{ op: "passZones", zone: "pack", dir: "left" }] },
        { label: "Showdown", steps: [flip("picks"), { op: "findWinner", zone: "picks", evaluator: "poker-high" }, { op: "score", who: "winner", amount: 1 }, phase("Showdown"), { op: "nextRound" }] },
      ],
      triggers: [{ event: "allEmpty", zone: "pack", macro: "Showdown" }],
      scoring: { target: 5, label: "Rounds" },
      rules: "Draft Poker\n\n• Everyone gets a pack of five.\n• Pick one card from your pack into your Picks, then press Pass packs.\n• When every pack is empty, the picks are revealed and the best poker hand scores a point. First to 5 rounds wins.\n\nA small demo of drafting: “Pass groups around” rotates any per-seat group, and the showdown fires on its own when the packs run out.",
    },
    {
      id: "kings-corner",
      name: "Kings in the Corner",
      family: "Shedding",
      tagline: "Build down in alternating colors; kings take the corners",
      description: "Four side piles and four corners. Draw, then play as many cards as you can; first to empty their hand wins the round.",
      players: { min: 2, max: 4, default: 3 },
      deck: { preset: "standard" },
      table: [
        deck({ name: "Draw pile", rule: { place: "nobody" } }),
        ...["North", "East", "South", "West"].map((name, i) => ({ key: "side-" + (i + 1), name, kind: "pile", layout: "overlap", visibility: "public", face: "up", rule: { place: "turn", accept: "altColor", order: "downOne" } })),
        ...[1, 2, 3, 4].map((n) => ({ key: "corner-" + n, name: "Corner " + n, kind: "pile", layout: "overlap", visibility: "public", face: "up", rule: { place: "turn", first: "K", accept: "altColor", order: "downOne" } })),
      ],
      seat: [hand({ evals: ["points:left"] })],
      schemes: [{ id: "left", name: "Cards left", low: true, ranks: { K: 10 } }],
      macros: [
        { label: "Deal", steps: [collect(), { op: "nextDealer" }, deal("hand", 7), ...[1, 2, 3, 4].map((n) => deal("side-" + n, 1, "up")), { op: "setTurn", who: "next" }] },
        { label: "Draw", hint: "Runs by itself at the start of each turn", steps: [deal("hand@current", 1, undefined, "draw pile")] },
        { label: "End turn", steps: [{ op: "nextTurn" }] },
        { label: "Out!", hint: "Everyone else scores the cards left in their hand", steps: [{ op: "scoreZones", zone: "hand", evaluator: "points:left" }, say("{winner} went out!"), { op: "nextRound" }, { op: "runAction", macro: "Deal" }] },
      ],
      triggers: [
        { event: "turn", macro: "Draw" },
        { event: "empty", zone: "hand", macro: "Out!" },
      ],
      botFallback: "End turn",
      playsPerTurn: 0,
      scoring: { target: 60, lowWins: true, label: "Penalty" },
      rules: "Kings in the Corner\n\n• Deal 7 each and one card face up to each side pile.\n• Your turn starts by drawing a card (automatic). Then play as many cards as you like: build down in alternating colors on any pile; only Kings may start a corner.\n• Press End turn when you're done.\n• First to empty their hand ends the round; everyone else scores the cards left (faces 10, others pip value). Lowest total when someone passes 60 wins.\n\nBots here keep playing until they're stuck (Play → Bots → plays per turn).",
    },
    {
      id: "golf",
      name: "Golf",
      family: "Draw & discard",
      tagline: "Six face-down cards, swap to go low",
      description: "A 2×3 grid each. Draw from the pile or discard and swap into your grid; after nine holes the lowest total wins.",
      players: { min: 2, max: 6, default: 4 },
      deck: { preset: "standard" },
      table: [deck({ name: "Draw pile" }), discard()],
      seat: [
        { key: "grid", name: "Grid", kind: "row", layout: "grid", visibility: "public", face: "down", limit: 6, evals: ["points:golf"] },
        { key: "drawn", name: "Drawn card", kind: "hand", layout: "spread", visibility: "public", face: "up", limit: 1 },
      ],
      schemes: [{ id: "golf", name: "Golf strokes", low: true, ranks: { 2: -2, K: 0 } }],
      phases: ["Tee off", "Play", "Score"],
      macros: [
        { label: "Deal", steps: [collect(), { op: "nextDealer" }, deal("grid", 6, "down"), deal("discard", 1, "up"), flip("grid", "up", 2), phase("Tee off"), { op: "setTurn", who: "next" }] },
        { label: "Draw", hint: "Current player draws from the pile", steps: [deal("drawn@current", 1, "up", "draw pile"), phase("Play")] },
        { label: "Take discard", steps: [deal("drawn@current", 1, "up", "discard")] },
        { label: "Discard drawn", hint: "Throw the drawn card away and pass", steps: [{ op: "clear", from: "drawn@current", to: "discard", face: "up" }, { op: "nextTurn" }] },
        { label: "Score hole", hint: "Reveal every grid and add the strokes", steps: [flip("grid", "up"), { op: "scoreZones", zone: "grid", evaluator: "points:golf" }, phase("Score"), { op: "nextRound" }] },
      ],
      scoring: { rounds: 9, lowWins: true, label: "Strokes" },
      rules: "Golf\n\n• Each player has a 2×3 grid of face-down cards and turns two face up.\n• On your turn draw from the pile (or take the discard), then swap it with any grid card (drag it into your grid and the replaced card to the discard), or discard it.\n• When a player's grid is all face up, everyone else gets one more turn, then Score hole.\n• Strokes: A = 1, 2 = −2, 3–10 face value, J/Q = 10, K = 0. Nine holes; lowest total wins.",
    },
    {
      id: "market-builder",
      name: "Market Builder",
      family: "Deck-building",
      tagline: "Buy cards with coins, grow your deck, grab the castles",
      description: "Everyone starts with a small deck of coins and acres. Play your coins, buy better cards from the market, and when the castles run out the most victory points wins.",
      players: { min: 2, max: 4, default: 2 },
      deck: marketDeck(),
      rulesMode: "enforce",
      table: [
        { key: "trash", name: "Trash", kind: "deck", layout: "stack", visibility: "public", face: "up" },
        marketPile("copper", "Copper · 0"),
        marketPile("silver", "Silver · 3"),
        marketPile("gold", "Gold · 6"),
        marketPile("acre", "Acre · 2"),
        marketPile("manor", "Manor · 5"),
        marketPile("castle", "Castle · 8"),
      ],
      seat: [
        { key: "deck", name: "Deck", kind: "deck", layout: "stack", visibility: "hidden", face: "down" },
        hand({ evals: ["points:treasure"] }),
        { key: "play", name: "In play", kind: "row", layout: "spread", visibility: "public", face: "up", evals: ["points:treasure"], rule: { place: "owner" } },
        { key: "discard", name: "Discard", kind: "discard", layout: "stack", visibility: "public", face: "up" },
      ],
      counters: [{ name: "Coins" }],
      schemes: [
        { id: "treasure", name: "Coins", ranks: { A: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, T: 0, J: 0, Q: 0, K: 0 }, customValues: false, cards: "Copper=1, Silver=2, Gold=3" },
        { id: "vp", name: "Victory points", ranks: { A: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, T: 0, J: 0, Q: 0, K: 0 }, customValues: false, cards: "Acre=1, Manor=3, Castle=6" },
      ],
      macros: [
        { label: "Set up", hint: "7 Copper and 3 Acres each, then draw 5", steps: [
          { op: "deal", from: "copper", to: "deck", count: 7 }, { op: "deal", from: "acre", to: "deck", count: 3 },
          { op: "shuffle", zone: "deck" }, { op: "deal", from: "deck", to: "hand", count: 5, perSeat: true },
          { op: "setCounter", who: "all", name: "Coins", amount: 0 }, { op: "setTurn", who: "next" }, { op: "runAction", macro: "Play treasures" },
        ] },
        { label: "Play treasures", hint: "Runs by itself at the start of each turn: lay out your hand and count your coins", steps: [{ op: "clear", from: "hand@current", to: "play@current", face: "up" }, { op: "counterFormula", who: "current", name: "Coins", formula: "play_value" }] },
        { label: "End turn", hint: "Discard everything, draw 5, pass", steps: [
          { op: "clear", from: "play@current", to: "discard@current", face: "up" }, { op: "clear", from: "hand@current", to: "discard@current", face: "up" },
          { op: "setCounter", who: "current", name: "Coins", amount: 0 }, { op: "runAction", macro: "Draw 5" }, { op: "nextTurn" },
        ] },
        { label: "Draw 5", hint: "Refill to 5, reshuffling your discard if the deck runs out", steps: [
          { op: "refill", from: "deck@current", to: "hand@current", count: 5 }, { op: "stopIf", zone: "hand@current", cmp: ">=", n: 5 },
          { op: "clear", from: "discard@current", to: "deck@current", face: "down" }, { op: "shuffle", zone: "deck@current" },
          { op: "refill", from: "deck@current", to: "hand@current", count: 5 },
        ] },
        { label: "Final score", hint: "Count everyone's victory points and end the game", steps: [
          { op: "clear", from: "hand", to: "deck", perSeat: true }, { op: "clear", from: "play", to: "deck", perSeat: true }, { op: "clear", from: "discard", to: "deck", perSeat: true },
          { op: "scoreZones", zone: "deck", evaluator: "points:vp" }, { op: "endGame" },
        ] },
      ],
      triggers: [
        { event: "turn", macro: "Play treasures" },
        { event: "empty", zone: "castle", macro: "Final score" },
      ],
      botFallback: "End turn",
      playsPerTurn: 0,
      scoring: { label: "Victory points" },
      rules: "Market Builder\n\n• Press Set up: everyone gets 7 Copper and 3 Acres, shuffled, and draws 5.\n• At the start of your turn your hand is laid out and your coins counted (Coins counter). Buy: drag cards from the market piles to your Discard. Each card costs the number on its pile, paid automatically; you can't overspend.\n• Press End turn: everything goes to your discard, you draw 5 (reshuffling your discard when your deck runs out), and play passes.\n• When the last Castle is bought the game ends: Acre 1, Manor 3, Castle 6 victory points.\n\nBuilt entirely from general tools: custom cards that start in their own piles, a cost rule on the market, counters, formulas and triggers.",
    },
    {
      id: "klondike",
      name: "Klondike Solitaire",
      family: "Solitaire",
      tagline: "7 tableau columns, 4 foundations",
      description: "Classic solitaire layout built from ordinary groups, showing how far the zone system stretches.",
      players: { min: 1, max: 1, default: 1 },
      deck: { preset: "standard" },
      rulesMode: "enforce",
      table: [
        deck({ name: "Stock", rule: { place: "nobody" } }),
        { key: "waste", name: "Waste", kind: "discard", layout: "stack", visibility: "public", face: "up", rule: { place: "nobody" } },
        ...["♠", "♥", "♦", "♣"].map((suit, i) => ({ key: "f" + (i + 1), name: "Foundation " + (i + 1), kind: "pile", layout: "stack", visibility: "public", face: "up", rule: { first: "A", accept: "suit", order: "upOne" } })),
        ...[1, 2, 3, 4, 5, 6, 7].map((n) => ({ key: "t" + n, name: "Column " + n, kind: "pile", layout: "overlap", visibility: "public", face: "keep", rule: { first: "K", accept: "altColor", order: "downOne", flipTop: true } })),
      ],
      seat: [],
      macros: [
        { label: "Deal layout", steps: [collect(), ...[1, 2, 3, 4, 5, 6, 7].map((n) => deal("t" + n, n, "down")), ...[1, 2, 3, 4, 5, 6, 7].map((n) => flip("t" + n, "up", 1))] },
        { label: "Turn 1", steps: [deal("waste", 1, "up", "stock")] },
        { label: "Turn 3", steps: [deal("waste", 3, "up", "stock")] },
        { label: "Recycle waste", steps: [{ op: "clear", from: "waste", to: "stock", face: "down" }] },
      ],
      scoring: {},
      rules: "Klondike\n\nBuild foundations up by suit from Ace to King. Tableau builds down in alternating colors; only a King fills an empty column. Turn cards from the stock to the waste.\n\nRules are enforced: illegal moves are refused, and a column turns its new top card face up when you move cards off it. Switch the rules to Warn or Off (Rules tab) to experiment.",
    },
  ];

  const FAMILIES = Array.from(new Set(PRESETS.map((preset) => preset.family)));

  const WIZARD_STYLES = {
    shedding: { label: "Shedding", hint: "Match the top card of a discard pile; first to empty their hand wins the hand." },
    tricks: { label: "Trick-taking", hint: "Follow suit, highest card wins the trick, score tricks or points in them." },
    draft: { label: "Drafting", hint: "Pick one card from a pack, pass the rest, build the best hand." },
    poker: { label: "Poker-style", hint: "Private hands plus a shared board, ranked like poker, with chips." },
    sandbox: { label: "Freeform", hint: "Hands and a free play area; add your own rules later." },
  };

  const num = (value, min, max, fallback) => {
    const n = Math.round(Number(value));
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
  };

  /** Build a playable game design from a few wizard answers. */
  function fromWizard(o = {}) {
    const style = WIZARD_STYLES[o.style] ? o.style : "shedding";
    const name = String(o.name || "").trim().slice(0, 48) || "My game";
    const min = num(o.min, 1, 12, 2);
    const max = Math.max(min, num(o.max, 1, 12, 6));
    const handSize = num(o.handSize, 0, 30, style === "tricks" ? 0 : style === "poker" ? 2 : 7);
    const target = num(o.target, 0, 100000, 0);
    const rounds = num(o.rounds, 0, 999, 0);
    const wild = String(o.wild || "").split(",").map((rank) => rank.trim()).filter(Boolean);
    const table = [deck({ name: "Draw pile", rule: { place: "nobody" } })];
    const seat = [];
    const macros = [];
    const triggers = [];
    const schemes = [];
    let phases = [];
    let botFallback = "";
    let lowWins = Boolean(o.lowWins);
    let chips = 0;
    const handZone = (extra = {}) => hand({ visibility: o.openHands ? "public" : "owner", face: o.openHands ? "up" : "down", ...extra });
    const dealSteps = (count, extra = []) => [collect(), { op: "nextDealer" }, ...(count ? [deal("hand", count)] : []), ...extra];
    switch (style) {
      case "shedding": {
        schemes.push({ id: "penalty", name: "Cards left", low: true });
        seat.push(handZone({ evals: ["points:penalty"] }));
        table.push(discard({ rule: { place: "turn", accept: o.match || "suitOrRank", advance: true, ...(wild.length ? { wild } : {}) } }));
        macros.push(
          { label: "Deal", steps: dealSteps(handSize || 7, [deal("discard", 1, "up"), { op: "setTurn", who: "next" }]) },
          { label: "Draw", hint: "Current player draws", steps: [deal("hand@current", 1, undefined, "draw pile")] },
          { label: "Pass", steps: [{ op: "nextTurn" }] },
          { label: "Reshuffle", hint: "Discards except the top become the draw pile", steps: [{ op: "clear", from: "discard", to: "draw pile", face: "down", keep: 1 }, { op: "shuffle", zone: "draw pile" }] },
          { label: "Out!", hint: "Whoever went out scores the cards left in other hands", steps: [{ op: "scoreZones", zone: "hand", evaluator: "points:penalty", target: "winner" }, say("{winner} went out!"), { op: "nextRound" }, { op: "runAction", macro: "Deal" }] },
        );
        triggers.push({ event: "empty", zone: "draw pile", macro: "Reshuffle" }, { event: "empty", zone: "hand", macro: "Out!" });
        botFallback = "Draw";
        break;
      }
      case "tricks": {
        const hearts = o.trickScoring === "hearts";
        seat.push(handZone(), { key: "tricks", name: "Tricks won", kind: "pile", layout: "overlap", visibility: "public", face: "up", ...(hearts ? { evals: ["hearts-points"] } : {}) });
        table.push(trick(o.trump ? { ctx: { trump: o.trump } } : {}));
        macros.push(
          { label: "Deal", hint: "Deal the whole deck", steps: [collect(), { op: "nextDealer" }, deal("hand", handSize || 13), { op: "sort", zone: "hand", by: "suit" }, { op: "setTurn", who: "next" }] },
          { label: "Take trick", hint: "The winner takes the trick and leads", steps: [{ op: "findWinner", zone: "trick" }, { op: "clear", from: "trick", to: "tricks@winner" }, ...(hearts ? [] : [{ op: "score", who: "winner", amount: 1 }]), { op: "setTurn", who: "winner" }] },
          { label: "End of hand", steps: [...(hearts ? [{ op: "scoreZones", zone: "tricks", evaluator: "hearts-points" }] : []), say("Hand over"), { op: "nextRound" }] },
        );
        triggers.push({ event: "count", zone: "trick", n: 0, macro: "Take trick" }, { event: "allEmpty", zone: "hand", macro: "End of hand" });
        if (hearts) lowWins = true;
        break;
      }
      case "draft": {
        seat.push(hand({ key: "pack", name: "Pack" }), { key: "picks", name: "Picks", kind: "hand", layout: "spread", visibility: "owner", face: "down", limit: handSize || 5, evals: ["poker-high"], rule: { place: "owner" } });
        macros.push(
          { label: "Deal packs", steps: [collect(), deal("pack", handSize || 5)] },
          { label: "Pass packs", steps: [{ op: "passZones", zone: "pack", dir: "left" }] },
          { label: "Showdown", steps: [flip("picks"), { op: "findWinner", zone: "picks" }, { op: "score", who: "winner", amount: 1 }, { op: "nextRound" }] },
        );
        triggers.push({ event: "allEmpty", zone: "pack", macro: "Showdown" });
        break;
      }
      case "poker": {
        table.push(board({ evals: ["poker-high"] }), muck());
        seat.push(handZone({ evals: ["poker-high"], ctx: { board: "board" } }));
        phases = ["Deal", "Board", "Showdown"];
        chips = 1000;
        macros.push(
          { label: "New hand", steps: dealSteps(handSize || 2, [{ op: "ante", amount: 10 }, phase("Deal"), { op: "setTurn", who: "next" }]) },
          { label: "Board card", steps: [deal("board", 1, "up"), phase("Board")] },
          { label: "Showdown", steps: [flip("hand"), { op: "findWinner", zone: "hand" }, { op: "awardPot", who: "winner" }, phase("Showdown")] },
        );
        break;
      }
      default: {
        table.push({ key: "felt", name: "Felt", kind: "free", layout: "free", visibility: "public", face: "up", wide: true }, discard());
        seat.push(handZone({ evals: ["set-summary"] }));
        macros.push(
          { label: "Deal", steps: dealSteps(handSize || 5) },
          { label: "Draw 1", steps: [deal("hand@current", 1, undefined, "draw pile")] },
          { label: "Collect & shuffle", steps: [collect()] },
        );
      }
    }
    return {
      id: "wizard-" + style,
      name,
      family: WIZARD_STYLES[style].label,
      tagline: String(o.tagline || "").slice(0, 90) || `A ${WIZARD_STYLES[style].label.toLowerCase()} game`,
      description: WIZARD_STYLES[style].hint,
      players: { min, max, default: Math.max(min, Math.min(max, num(o.players, 1, 12, Math.min(max, 4)))) },
      deck: { preset: o.deck || "standard", decks: num(o.decks, 1, 8, 1), jokers: num(o.jokers, 0, 8, 0) },
      table,
      seat,
      macros,
      triggers,
      schemes,
      phases,
      rulesMode: ["off", "warn", "enforce"].includes(o.rulesMode) ? o.rulesMode : "warn",
      botFallback,
      scoring: { target, rounds, lowWins, chips, label: style === "poker" ? "Chips" : "Points" },
      rules: "",
    };
  }

  function get(id) {
    return PRESETS.find((preset) => preset.id === id) || PRESETS[0];
  }

  return { PRESETS, FAMILIES, WIZARD_STYLES, get, fromWizard };
});
