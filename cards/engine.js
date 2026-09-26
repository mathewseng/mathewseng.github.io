(function (root, factory) {
  const api = factory();
  root.CardEngine = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  /*
   * Card Table Workshop engine.
   *
   * The whole table is one JSON-serialisable state object. Every change goes
   * through reduce(state, action, actorId) which returns a NEW state, so the
   * host can keep an undo stack and broadcast snapshots to peers.
   *
   * Conventions
   * - zone.cards[0] is the bottom of a stack / the left-most card of a hand.
   *   The "top" of a stack is the LAST element.
   * - zone.area is "table" or a player id. Zones created from the seat
   *   template share a `key` (e.g. "hand") so macros can target "hand" and
   *   reach every player's copy.
   * - zone.visibility: "public" (faces follow card.faceUp), "owner" (the
   *   owning player always sees faces, others only see face-up cards),
   *   "hidden" (nobody sees face-down cards, e.g. a deck).
   */

  const VERSION = 1;
  const STD_RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K"];
  const STD_SUITS = ["s", "h", "d", "c"];
  const SUIT_INFO = {
    s: { name: "Spades", symbol: "♠", color: "black" },
    h: { name: "Hearts", symbol: "♥", color: "red" },
    d: { name: "Diamonds", symbol: "♦", color: "red" },
    c: { name: "Clubs", symbol: "♣", color: "black" },
    x: { name: "Joker", symbol: "★", color: "black" },
  };
  const RANK_NAMES = { A: "Ace", T: "10", J: "Jack", Q: "Queen", K: "King", JK: "Joker" };
  const RANK_ORDER = { A: 14, K: 13, Q: 12, J: 11, T: 10, 9: 9, 8: 8, 7: 7, 6: 6, 5: 5, 4: 4, 3: 3, 2: 2, JK: 15 };
  const SUIT_ORDER = { s: 0, h: 1, c: 2, d: 3, x: 4 };
  const PLAYER_COLORS = ["#45d6ff", "#ff5c92", "#bdf46b", "#f4c95d", "#9f7dff", "#ff9f43", "#4ee6b4", "#ff7a6b", "#7aa2ff", "#e58cff"];

  const DECK_PRESETS = {
    standard: { label: "Standard 52", ranks: STD_RANKS },
    short: { label: "Short deck 36 (6–A)", ranks: ["A", "6", "7", "8", "9", "T", "J", "Q", "K"] },
    piquet: { label: "Piquet 32 (7–A)", ranks: ["A", "7", "8", "9", "T", "J", "Q", "K"] },
    euchre: { label: "Euchre 24 (9–A)", ranks: ["A", "9", "T", "J", "Q", "K"] },
    pinochle: { label: "Pinochle 48 (9–A ×2)", ranks: ["A", "9", "T", "J", "Q", "K"], copies: 2 },
    faces: { label: "Face cards only", ranks: ["A", "J", "Q", "K"] },
    numbers: { label: "Numbers only (A–10)", ranks: ["A", "2", "3", "4", "5", "6", "7", "8", "9", "T"] },
    none: { label: "No standard cards (custom only)", ranks: [] },
  };

  // Group play rules. Rules only judge manual moves by a known player; dealing
  // and actions (macros) always go through.
  const RULE_WHO = {
    anyone: "Anyone",
    owner: "Owner (dealer for table groups)",
    turn: "Current player",
    ownerTurn: "Owner, on their turn",
    nobody: "Nobody (actions only)",
  };
  const RULE_ACCEPT = {
    any: "Any card",
    suit: "Same suit as the top card",
    rank: "Same rank as the top card",
    suitOrRank: "Same suit or rank",
    color: "Same color",
    altColor: "Alternating color",
  };
  const RULE_ORDER = {
    any: "Any rank",
    up: "Higher than the top card",
    down: "Lower than the top card",
    atLeast: "Equal or higher",
    atMost: "Equal or lower",
    upOne: "Exactly one higher",
    downOne: "Exactly one lower",
    adjacent: "One higher or lower",
  };
  const RULE_MELD = {
    none: "Any mix of cards",
    set: "A set (all one rank)",
    run: "A run (one suit, in sequence)",
    setOrRun: "A set or a run",
  };
  const RULE_SLAP = {
    none: "No slapping",
    jack: "Top card is a Jack",
    pair: "Top two cards match",
    sandwich: "Pair or sandwich (top and third match)",
    ratscrew: "Pair, sandwich, K-Q marriage or top matches bottom",
  };
  const RULES_MODES = { off: "Off", warn: "Warn", enforce: "Enforce" };

  const DEFAULT_DECK = Object.freeze({ preset: "standard", decks: 1, jokers: 0, suits: STD_SUITS.slice(), ranks: null, custom: [] });

  let rng = () => {
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      const buffer = new Uint32Array(1);
      crypto.getRandomValues(buffer);
      return buffer[0] / 4294967296;
    }
    return Math.random();
  };

  function setRng(fn) { rng = fn; }
  function getRng() { return rng; }

  function seededRng(seed) {
    let h = 1779033703 ^ String(seed).length;
    for (let i = 0; i < String(seed).length; i += 1) {
      h = Math.imul(h ^ String(seed).charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    let a = h >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------------------------------------------------------------- helpers

  function clone(value) {
    if (value === undefined) return undefined;
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function nextId(state, prefix) {
    state.seq = (state.seq || 1) + 1;
    return prefix + state.seq.toString(36);
  }

  function shuffleArray(list) {
    for (let i = list.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  function clampInt(value, min, max, fallback) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  }

  function cleanText(value, max = 40, fallback = "") {
    const text = String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
    return text || fallback;
  }

  function cardName(card) {
    if (!card || card.rank == null) return "a hidden card";
    if (card.custom) return card.label || card.rank;
    if (card.rank === "JK") return "Joker";
    return (card.rank === "T" ? "10" : card.rank) + (SUIT_INFO[card.suit]?.symbol || "");
  }

  function parseCardSpec(text) {
    const raw = String(text || "").trim();
    if (/^(jk|joker)$/i.test(raw)) return { joker: true };
    const match = /^(10|[2-9TJQKA])([shdc♠♥♦♣])$/i.exec(raw);
    if (!match) return null;
    return { rank: match[1] === "10" ? "T" : match[1].toUpperCase(), suit: { "♠": "s", "♥": "h", "♦": "d", "♣": "c" }[match[2]] || match[2].toLowerCase() };
  }

  function playerById(state, id) {
    return state.players.find((player) => player.id === id) || null;
  }

  function zoneOf(state, cardId) {
    for (const zone of Object.values(state.zones)) {
      if (zone.cards.includes(cardId)) return zone;
    }
    return null;
  }

  function orderedZones(state, area) {
    return Object.values(state.zones)
      .filter((zone) => area === undefined || zone.area === area)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  function areaLabel(state, area) {
    if (area === "table") return "table";
    return playerById(state, area)?.name || "player";
  }

  function zoneLabel(state, zone) {
    if (!zone) return "?";
    return zone.area === "table" ? zone.name : `${areaLabel(state, zone.area)}'s ${zone.name}`;
  }

  // ------------------------------------------------------------------ decks

  function normalizeDeckSpec(spec = {}) {
    const preset = DECK_PRESETS[spec.preset] ? spec.preset : spec.preset === "custom" ? "custom" : "standard";
    const suits = Array.isArray(spec.suits) && spec.suits.length ? spec.suits.filter((suit) => STD_SUITS.includes(suit)) : STD_SUITS.slice();
    const ranks = Array.isArray(spec.ranks) && spec.ranks.length
      ? spec.ranks.filter((rank) => STD_RANKS.includes(rank))
      : null;
    const custom = Array.isArray(spec.custom) ? spec.custom.slice(0, 120).map(normalizeCustomCard) : [];
    const back = {
      color: /^#[0-9a-f]{6}$/i.test(spec.back?.color || "") ? spec.back.color : "",
      text: cleanText(spec.back?.text, 14, "").replace(/["'\\<>]/g, ""),
    };
    return {
      preset,
      decks: clampInt(spec.decks, 1, 8, 1),
      jokers: clampInt(spec.jokers, 0, 8, 0),
      suits: suits.length ? suits : STD_SUITS.slice(),
      ranks,
      custom,
      back,
    };
  }

  /**
   * A custom card type. `suit` and `rank` are free text used by play rules
   * (e.g. suit "Red", rank "7"); `label` is the printed title.
   */
  function normalizeCustomCard(item = {}) {
    return {
      label: cleanText(item.label, 24, "Card"),
      text: cleanText(item.text, 140, ""),
      color: /^#[0-9a-f]{6}$/i.test(item.color || "") ? item.color : "#9f7dff",
      value: Number.isFinite(Number(item.value)) ? Number(item.value) : 0,
      count: clampInt(item.count, 1, 20, 1),
      suit: cleanText(item.suit, 12, ""),
      rank: cleanText(item.rank, 8, ""),
      icon: cleanText(item.icon, 4, ""),
      image: cleanImageUrl(item.image),
      home: cleanText(item.home, 24, ""),
    };
  }

  /** Card art links: plain https URLs only, with nothing that could break out of CSS url(). */
  function cleanImageUrl(value) {
    const url = String(value || "").trim();
    return url.length <= 400 && /^https:\/\/[^\s"'()<>\\]+$/i.test(url) ? url : "";
  }

  function customCard(state, item, extra = {}) {
    const clean = normalizeCustomCard(item);
    return {
      id: nextId(state, "k"),
      rank: clean.rank || clean.label,
      suit: clean.suit || "x",
      custom: true,
      label: clean.label,
      text: clean.text,
      color: clean.color,
      value: clean.value,
      icon: clean.icon,
      image: clean.image,
      faceUp: false,
      ...extra,
    };
  }

  function deckRanks(spec) {
    if (spec.ranks && spec.ranks.length) return spec.ranks;
    return (DECK_PRESETS[spec.preset] || DECK_PRESETS.standard).ranks;
  }

  function buildCards(state, rawSpec) {
    const spec = normalizeDeckSpec(rawSpec);
    const copies = (DECK_PRESETS[spec.preset]?.copies || 1) * spec.decks;
    const ranks = deckRanks(spec);
    const cards = [];
    for (let deck = 0; deck < copies; deck += 1) {
      for (const suit of spec.suits) {
        for (const rank of ranks) cards.push({ id: nextId(state, "k"), rank, suit, deck, faceUp: false });
      }
    }
    for (let j = 0; j < spec.jokers; j += 1) {
      cards.push({ id: nextId(state, "k"), rank: "JK", suit: "x", deck: j, faceUp: false, jokerColor: j % 2 ? "red" : "black" });
    }
    spec.custom.forEach((item, index) => {
      for (let n = 0; n < item.count; n += 1) cards.push(customCard(state, item, { deck: index }));
    });
    return cards;
  }

  function deckSize(rawSpec) {
    const spec = normalizeDeckSpec(rawSpec);
    const copies = (DECK_PRESETS[spec.preset]?.copies || 1) * spec.decks;
    return copies * spec.suits.length * deckRanks(spec).length + spec.jokers + spec.custom.reduce((sum, item) => sum + item.count, 0);
  }

  // ------------------------------------------------------------ constructors

  const ZONE_DEFAULTS = {
    key: "",
    name: "Group",
    kind: "pile",
    layout: "spread",
    visibility: "public",
    face: "keep",
    evals: [],
    ctx: {},
    limit: 0,
    note: "",
    locked: false,
    collapsed: false,
    wide: false,
    rule: {},
  };

  function makeZone(state, area, template = {}) {
    const zone = { ...clone(ZONE_DEFAULTS), ...clone(template) };
    zone.id = nextId(state, "z");
    zone.area = area;
    zone.name = cleanText(zone.name, 32, "Group");
    zone.cards = [];
    zone.evals = Array.isArray(zone.evals) ? zone.evals.slice(0, 6) : [];
    zone.ctx = zone.ctx && typeof zone.ctx === "object" ? zone.ctx : {};
    zone.rule = sanitizeRule(zone.rule);
    const siblings = orderedZones(state, area);
    zone.order = siblings.length ? (siblings[siblings.length - 1].order ?? 0) + 1 : 0;
    state.zones[zone.id] = zone;
    return zone;
  }

  function templateFrom(zone) {
    const { id, area, cards, order, ...rest } = clone(zone);
    return rest;
  }

  function createPlayer(state, options = {}) {
    const index = state.players.length;
    const player = {
      id: nextId(state, "p"),
      name: cleanText(options.name, 24, `Player ${index + 1}`),
      color: options.color || PLAYER_COLORS[index % PLAYER_COLORS.length],
      clientId: options.clientId || null,
      chips: Number.isFinite(Number(options.chips)) ? Number(options.chips) : Number(state.chipStart || 0),
      counters: {},
      out: false,
      note: "",
      bot: Boolean(options.bot),
      botStyle: BOT_STYLES[options.botStyle] ? options.botStyle : "",
      team: cleanText(options.team, 16, ""),
    };
    state.players.push(player);
    for (const template of state.seatTemplate || []) makeZone(state, player.id, template);
    return player;
  }

  function emptyState() {
    return {
      v: VERSION,
      title: "Untitled table",
      presetId: "blank",
      notes: "",
      deckSpec: clone(DEFAULT_DECK),
      cards: {},
      zones: {},
      players: [],
      seatTemplate: [],
      turn: { index: 0, dealer: 0, dir: 1, round: 1, phase: "" },
      phases: [],
      scores: { rounds: [], target: 0, maxRounds: 0, lowWins: false, label: "Points" },
      pot: 0,
      chipStart: 0,
      counterDefs: [],
      tableCounters: [],
      macros: [],
      triggers: [],
      schemes: [],
      meta: {},
      rulesMode: "warn",
      guestMode: "play",
      botFallback: "",
      playsPerTurn: 1,
      mustPlay: false,
      gameOver: null,
      lastWinner: null,
      log: [],
      seq: 1,
      rev: 0,
    };
  }

  /**
   * Create a table from a preset (see presets.js). `options.players` is a
   * number or array of names.
   */
  function createTable(preset = {}, options = {}) {
    const state = emptyState();
    state.title = cleanText(options.title || preset.name, 48, "Untitled table");
    state.presetId = preset.id || "blank";
    state.notes = String(preset.rules || "");
    state.deckSpec = normalizeDeckSpec(preset.deck || {});
    state.seatTemplate = clone(preset.seat || []).map((zone) => ({ ...clone(ZONE_DEFAULTS), ...zone }));
    state.phases = clone(preset.phases || []);
    state.turn.phase = state.phases[0] || "";
    state.scores.target = Number(preset.scoring?.target) || 0;
    state.scores.lowWins = Boolean(preset.scoring?.lowWins);
    state.scores.label = cleanText(preset.scoring?.label, 20, "Points");
    state.chipStart = Number(preset.scoring?.chips) || 0;
    state.pegTarget = Number(preset.scoring?.peg) || 0;
    state.scores.maxRounds = Number(preset.scoring?.rounds) || 0;
    state.counterDefs = clone(preset.counters || []).map((def) => ({ id: nextId(state, "c"), name: cleanText(def.name, 20, "Counter"), start: Number(def.start) || 0 }));
    state.tableCounters = clone(preset.tableCounters || []).map((def) => ({ id: nextId(state, "t"), name: cleanText(def.name, 20, "Tracker"), value: Number(def.value) || 0 }));
    state.macros = clone(preset.macros || []).map((macro) => ({ id: nextId(state, "m"), label: cleanText(macro.label, 28, "Macro"), hint: String(macro.hint || ""), steps: macro.steps || [] }));
    state.schemes = clone(preset.schemes || []).map((scheme) => sanitizeScheme(state, scheme));
    state.triggers = clone(preset.triggers || []).map((trigger) => sanitizeTrigger(state, trigger));
    linkMacroRefs(state);
    state.rulesMode = RULES_MODES[preset.rulesMode] ? preset.rulesMode : "warn";
    state.botFallback = findMacro(state, preset.botFallback)?.id || "";
    state.playsPerTurn = preset.playsPerTurn === 0 ? 0 : 1;
    state.mustPlay = Boolean(preset.mustPlay);
    state.meta = sanitizeMeta(preset.meta || {
      family: preset.family,
      tagline: preset.tagline,
      description: preset.description,
      players: preset.players,
    });
    if (preset.custom && preset.id) state.designId = preset.id;

    for (const template of preset.table || [{ key: "deck", name: "Deck", kind: "deck", layout: "stack", visibility: "hidden", face: "down" }]) {
      makeZone(state, "table", template);
    }
    const names = Array.isArray(options.players)
      ? options.players
      : Array.from({ length: clampInt(options.players ?? preset.players?.default ?? 2, 0, 12, 2) }, (_, i) => `Player ${i + 1}`);
    names.forEach((name, index) => {
      const options = typeof name === "object" ? { ...name } : { name };
      if (!options.team && Array.isArray(preset.teams) && preset.teams.length) options.team = preset.teams[index % preset.teams.length];
      const player = createPlayer(state, options);
      state.counterDefs.forEach((def) => { player.counters[def.id] = def.start; });
    });
    state.scores.rounds = [{ id: nextId(state, "r"), label: "Round 1", scores: {} }];
    placeNewCards(state, buildCards(state, state.deckSpec));
    state.startedAt = Date.now();
    pushLog(state, null, `Table created: ${state.title}`);
    return state;
  }

  /** Put freshly built cards in the deck, or in their type's home group (e.g. a market pile). */
  function placeNewCards(state, cards) {
    const deck = findDeckZone(state);
    const homes = new Map();
    for (const item of normalizeDeckSpec(state.deckSpec).custom) if (item.home) homes.set(item.label + "|" + (item.suit || ""), findZoneRef(state, item.home, "table"));
    const touched = new Set();
    for (const card of cards) {
      state.cards[card.id] = card;
      const home = card.custom ? homes.get(card.label + "|" + (card.suit === "x" ? "" : card.suit)) : null;
      const target = home || deck;
      if (!target) continue;
      target.cards.push(card.id);
      applyFace(card, target);
      touched.add(target);
    }
    if (deck && touched.has(deck)) shuffleArray(deck.cards);
    return deck;
  }

  function findDeckZone(state) {
    const zones = orderedZones(state, "table");
    return zones.find((zone) => zone.key === "deck") || zones.find((zone) => zone.kind === "deck") || zones[0] || null;
  }

  function pushLog(state, actor, text, kind = "action") {
    const who = actor ? playerById(state, actor)?.name || "Someone" : "";
    state.log.push({ t: Date.now(), who, text, kind });
    if (state.log.length > 400) state.log.splice(0, state.log.length - 400);
  }

  // ---------------------------------------------------------- zone resolving

  /** Seat order for dealing: starts left of the dealer and wraps around. */
  function dealOrder(state) {
    const active = state.players.map((player, index) => ({ player, index })).filter((entry) => !entry.player.out);
    if (!active.length) return [];
    const n = state.players.length;
    const dir = state.turn.dir || 1;
    const result = [];
    for (let step = 1; step <= n; step += 1) {
      const index = ((state.turn.dealer + dir * step) % n + n) % n;
      const player = state.players[index];
      if (player && !player.out) result.push(player);
    }
    return result;
  }

  /**
   * Resolve a zone reference used by macros/actions.
   *   "z12"             -> exact zone id
   *   "deck"            -> table zone with key/name "deck"
   *   "hand"            -> every player's "hand" zone, in deal order
   *   "hand@current"    -> current player's hand
   *   "hand@dealer" / "hand@me" / "hand@next" / "hand@p:<id>"
   *   "hand@after"      -> the player after the current one
   *   "hand@winner"     -> winner found by the running action (or the last winner)
   *   "hand@subject"    -> the player a trigger fired for (e.g. who emptied their hand)
   *   "hand@others"     -> everyone except the winner / subject / current player
   */
  function resolveZones(state, ref, actorId = null, ctx = {}) {
    if (!ref) return [];
    if (state.zones[ref]) return [ref];
    const [keyPart, scope] = String(ref).split("@");
    const key = keyPart.trim().toLowerCase();
    const matches = (zone) => (zone.key || "").toLowerCase() === key || zone.name.toLowerCase() === key;
    const tableHit = orderedZones(state, "table").filter(matches);
    if (!scope && tableHit.length) return tableHit.map((zone) => zone.id);
    let players;
    if (!scope || scope === "all") players = dealOrder(state);
    else if (scope === "current") players = [state.players[state.turn.index]].filter(Boolean);
    else if (scope === "dealer") players = [state.players[state.turn.dealer]].filter(Boolean);
    else if (scope === "next") players = [dealOrder(state)[0]].filter(Boolean);
    else if (scope === "me") players = [playerById(state, actorId) || state.players[state.turn.index]].filter(Boolean);
    else if (scope === "after") players = [playerAfter(state)].filter(Boolean);
    else if (scope === "winner") players = [playerById(state, ctx.winner || state.lastWinner)].filter(Boolean);
    else if (scope === "subject") players = [playerById(state, ctx.subject)].filter(Boolean);
    else if (scope === "others") {
      const skip = ctx.winner || ctx.subject || state.players[state.turn.index]?.id;
      players = dealOrder(state).filter((player) => player.id !== skip);
    } else if (scope.startsWith("p:")) players = [playerById(state, scope.slice(2))].filter(Boolean);
    else players = [];
    const ids = [];
    for (const player of players) {
      const zone = orderedZones(state, player.id).find(matches);
      if (zone) ids.push(zone.id);
    }
    if (!ids.length && tableHit.length) return tableHit.map((zone) => zone.id);
    return ids;
  }

  /** The next seated, active player after the current one in play direction. */
  function playerAfter(state) {
    const n = state.players.length;
    if (!n) return null;
    let index = state.turn.index;
    for (let i = 0; i < n; i += 1) {
      index = ((index + (state.turn.dir || 1)) % n + n) % n;
      if (!state.players[index].out) return state.players[index];
    }
    return null;
  }

  /** Card references may be real ids or redacted "h:<zoneId>:<index>". */
  function resolveCard(state, ref) {
    if (state.cards[ref]) return ref;
    const match = /^h:([^:]+):(\d+)$/.exec(String(ref));
    if (!match) return null;
    return state.zones[match[1]]?.cards[Number(match[2])] || null;
  }

  function resolveCards(state, refs) {
    const out = [];
    for (const ref of refs || []) {
      const id = resolveCard(state, ref);
      if (id && !out.includes(id)) out.push(id);
    }
    return out;
  }

  // ---------------------------------------------------------- card movement

  function applyFace(card, zone, face) {
    const rule = face || zone.face || "keep";
    if (rule === "up") card.faceUp = true;
    else if (rule === "down") card.faceUp = false;
    delete card.peek;
  }

  function detach(state, cardId) {
    const zone = zoneOf(state, cardId);
    if (zone) zone.cards.splice(zone.cards.indexOf(cardId), 1);
    return zone;
  }

  function moveCards(state, cardIds, toId, options = {}) {
    const target = state.zones[toId];
    if (!target) throw new Error("That group no longer exists.");
    let index = Number.isInteger(options.index) ? options.index : target.cards.length;
    const moved = [];
    for (const id of cardIds) {
      const card = state.cards[id];
      if (!card) continue;
      const fromZone = zoneOf(state, id);
      const fromPos = fromZone ? fromZone.cards.indexOf(id) : -1;
      const from = detach(state, id);
      // Removing from earlier in the same zone shifts the insertion point.
      if (from === target && fromPos < index) index -= 1;
      target.cards.splice(Math.max(0, Math.min(index, target.cards.length)), 0, id);
      index += 1;
      if (from !== target || options.face) applyFace(card, target, options.face);
      // Remember who played a card so trick-style groups can name a winner.
      if (!options.keepBy) {
        if (options.by) card.playedBy = options.by;
        else delete card.playedBy;
      }
      if (target.layout === "free") {
        card.x = Number.isFinite(options.x) ? clamp01(options.x + moved.length * 0.03) : card.x ?? clamp01(0.1 + rng() * 0.6);
        card.y = Number.isFinite(options.y) ? clamp01(options.y + moved.length * 0.02) : card.y ?? clamp01(0.1 + rng() * 0.6);
      }
      moved.push(card);
    }
    return moved;
  }

  function clamp01(value) {
    return Math.max(0, Math.min(0.92, value));
  }

  function takeTop(state, zoneId, count) {
    const zone = state.zones[zoneId];
    if (!zone) return [];
    return zone.cards.slice(Math.max(0, zone.cards.length - count)).reverse();
  }

  function dealCards(state, fromId, targetIds, count, face, actor) {
    const from = state.zones[fromId];
    if (!from) throw new Error("Choose a group to deal from.");
    const targets = targetIds.filter((id) => state.zones[id] && id !== fromId);
    if (!targets.length) throw new Error("Nothing to deal to.");
    let dealt = 0;
    const perTarget = new Map(targets.map((id) => [id, 0]));
    for (let round = 0; round < count; round += 1) {
      for (const targetId of targets) {
        if (!from.cards.length) break;
        const target = state.zones[targetId];
        if (target.limit && target.cards.length >= target.limit) continue;
        const cardId = from.cards[from.cards.length - 1];
        moveCards(state, [cardId], targetId, { face });
        perTarget.set(targetId, perTarget.get(targetId) + 1);
        dealt += 1;
      }
    }
    const short = from.cards.length === 0 && dealt < count * targets.length;
    if (targets.length === 1) {
      pushLog(state, actor, `${dealt} card${dealt === 1 ? "" : "s"} from ${zoneLabel(state, from)} → ${zoneLabel(state, state.zones[targets[0]])}${short ? " (ran out)" : ""}`);
    } else {
      pushLog(state, actor, `Dealt ${count} to ${targets.length} groups from ${zoneLabel(state, from)}${short ? " (ran out)" : ""}`);
    }
    return dealt;
  }

  function sortZone(state, zoneId, by = "rank") {
    const zone = state.zones[zoneId];
    if (!zone) return;
    const value = (id) => {
      const card = state.cards[id];
      if (card.custom) return 100;
      return RANK_ORDER[card.rank] ?? 50;
    };
    const suit = (id) => SUIT_ORDER[state.cards[id].suit] ?? 9;
    if (by === "reverse") zone.cards.reverse();
    else if (by === "suit") zone.cards.sort((a, b) => suit(a) - suit(b) || value(b) - value(a));
    else if (by === "rankAsc") zone.cards.sort((a, b) => value(a) - value(b) || suit(a) - suit(b));
    else if (by === "aceLow") zone.cards.sort((a, b) => (value(a) % 14) - (value(b) % 14) || suit(a) - suit(b));
    else zone.cards.sort((a, b) => value(b) - value(a) || suit(a) - suit(b));
  }

  function returnAllTo(state, targetId, options = {}) {
    const target = state.zones[targetId];
    if (!target) return 0;
    let moved = 0;
    for (const zone of Object.values(state.zones)) {
      if (zone.id === targetId) continue;
      if (options.keepLocked && zone.locked) continue;
      const ids = zone.cards.slice();
      for (const id of ids) {
        moveCards(state, [id], targetId, { face: "down" });
        const card = state.cards[id];
        card.rot = 0;
        delete card.mark;
        moved += 1;
      }
    }
    for (const id of target.cards) state.cards[id].faceUp = false;
    if (options.shuffle) shuffleArray(target.cards);
    return moved;
  }

  // --------------------------------------------------------------- scoring

  function currentRound(state) {
    if (!state.scores.rounds.length) state.scores.rounds.push({ id: nextId(state, "r"), label: "Round 1", scores: {} });
    return state.scores.rounds[state.scores.rounds.length - 1];
  }

  function totals(state) {
    const out = {};
    for (const player of state.players) out[player.id] = 0;
    for (const round of state.scores.rounds) {
      for (const [pid, value] of Object.entries(round.scores)) {
        if (pid in out) out[pid] += Number(value) || 0;
      }
    }
    return out;
  }

  function leaders(state) {
    const t = totals(state);
    const values = state.players.map((player) => t[player.id]);
    if (!values.length) return [];
    const best = state.scores.lowWins ? Math.min(...values) : Math.max(...values);
    return state.players.filter((player) => t[player.id] === best).map((player) => player.id);
  }

  // ------------------------------------------------------------- redaction

  function canSee(state, card, zone, viewerId) {
    if (!card) return false;
    if (card.faceUp) return true;
    if (!viewerId) return false;
    if (zone && zone.visibility === "owner" && zone.area === viewerId) return true;
    if (Array.isArray(card.peek) && card.peek.includes(viewerId)) return true;
    return false;
  }

  /**
   * Produce the view of the table for one viewer. viewerId === "*" is the
   * omniscient view (local workshop / god mode). Hidden cards are replaced by
   * opaque placeholders whose ids encode their position, so peers can't track
   * a card's identity through shuffles.
   */
  function viewFor(state, viewerId) {
    const view = clone(state);
    if (viewerId === "*") {
      for (const zone of Object.values(view.zones)) {
        for (const id of zone.cards) view.cards[id].visible = true;
      }
      return view;
    }
    const cards = {};
    // "*hands": a shared-screen view — every hand is visible, but decks and
    // face-down table cards stay hidden.
    const sees = viewerId === "*hands"
      ? (card, zone) => card.faceUp || zone.visibility === "owner" || (Array.isArray(card.peek) && card.peek.length > 0)
      : (card, zone) => canSee(state, card, zone, viewerId);
    for (const zone of Object.values(view.zones)) {
      zone.cards = zone.cards.map((id, index) => {
        const card = state.cards[id];
        if (sees(card, state.zones[zone.id])) {
          cards[id] = { ...clone(card), visible: true };
          return id;
        }
        const hiddenId = `h:${zone.id}:${index}`;
        cards[hiddenId] = { id: hiddenId, hidden: true, rank: null, suit: null, faceUp: false, rot: card.rot || 0, x: card.x, y: card.y, custom: Boolean(card.custom), mark: card.mark };
        return hiddenId;
      });
    }
    view.cards = cards;
    return view;
  }

  // ------------------------------------------------------------ play rules

  const SUIT_WORD = { s: "spades", h: "hearts", d: "diamonds", c: "clubs" };
  const suitWord = (suit) => SUIT_WORD[suit] || String(suit);
  const rankWord = (rank) => RANK_NAMES[rank] || String(rank);
  const normRank = (rank) => {
    const text = String(rank ?? "").trim().toLowerCase();
    return text === "10" ? "t" : text;
  };
  const sameText = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();

  function rankValue(card, aceHigh) {
    if (!card || card.rank == null) return null;
    if (card.custom) {
      const n = Number(card.rank);
      return Number.isFinite(n) ? n : null;
    }
    if (card.rank === "A") return aceHigh ? 14 : 1;
    return card.rank === "JK" ? null : RANK_ORDER[card.rank] ?? null;
  }

  function colorOf(card) {
    return card.custom ? String(card.suit || "").toLowerCase() : SUIT_INFO[card.suit]?.color || "";
  }

  function whoAllows(state, who, zone, actor) {
    const current = state.players[state.turn.index]?.id;
    const owner = zone.area === "table" ? state.players[state.turn.dealer]?.id : zone.area;
    switch (who) {
      case "owner": return owner === actor;
      case "turn": return current === actor;
      case "ownerTurn": return owner === actor && current === actor;
      case "nobody": return false;
      default: return true;
    }
  }

  function whoPhrase(who, zone) {
    switch (who) {
      case "owner": return zone.area === "table" ? "the dealer" : "its owner";
      case "turn": return "the current player";
      case "ownerTurn": return zone.area === "table" ? "the dealer, on their turn," : "its owner, on their turn,";
      default: return "an action";
    }
  }

  /** A seat group whose face-down cards only its owner should touch. */
  function isPrivateTo(zone, actor) {
    return Boolean(zone) && zone.area !== "table" && zone.area !== actor && zone.visibility !== "public";
  }

  /** Guests (opts.strict) may never take, reveal or rearrange another player's private cards. */
  function guardPrivate(state, zones, actor, opts) {
    if (!opts || !opts.strict) return;
    for (const zone of zones) {
      if (isPrivateTo(zone, actor)) throw new Error(`${zoneLabel(state, zone)} is private.`);
    }
  }

  function placeProblem(state, rule, zone, card, top, fromZone) {
    const name = cardName(card);
    const wild = (rule.wild || []).map(normRank);
    const isWild = (c) => Boolean(c) && wild.includes(normRank(c.rank));
    if (rule.follow && zone.cards.length && fromZone) {
      const led = state.cards[zone.cards[0]];
      const canFollow = led && fromZone.cards.some((id) => id !== card.id && sameText(state.cards[id]?.suit, led.suit));
      if (led && !sameText(card.suit, led.suit) && canFollow) return `Follow suit: ${suitWord(led.suit)} were led.`;
    }
    if (!top) {
      if (rule.first && normRank(card.rank) !== normRank(rule.first) && !isWild(card)) return `${zone.name} must start with ${rankWord(rule.first)}.`;
      return "";
    }
    if (isWild(card) || isWild(top)) return "";
    const accept = rule.accept || "any";
    const matches = {
      any: true,
      suit: sameText(card.suit, top.suit),
      rank: normRank(card.rank) === normRank(top.rank),
      suitOrRank: sameText(card.suit, top.suit) || normRank(card.rank) === normRank(top.rank),
      color: colorOf(card) === colorOf(top),
      altColor: colorOf(card) !== colorOf(top),
    }[accept];
    if (matches === false) return `${name} can't go on ${cardName(top)}: ${RULE_ACCEPT[accept].toLowerCase()}.`;
    const order = rule.order || "any";
    if (order !== "any") {
      const a = rankValue(card, rule.aceHigh);
      const b = rankValue(top, rule.aceHigh);
      if (a != null && b != null) {
        const ok = { up: a > b, down: a < b, atLeast: a >= b, atMost: a <= b, upOne: a === b + 1, downOne: a === b - 1, adjacent: Math.abs(a - b) === 1 }[order];
        if (ok === false) return `${name} can't go on ${cardName(top)}: ${RULE_ORDER[order].toLowerCase()}.`;
      }
    }
    return "";
  }

  /**
   * Judge a manual move. `hard` problems always stop it (privacy for guests);
   * `soft` problems are the table's play rules: logged in warn mode, refused
   * in enforce mode, ignored when rules are off or nobody in particular moved.
   */
  function checkMove(state, ids, toId, actor, opts = {}) {
    const hard = [];
    const soft = [];
    const target = state.zones[toId];
    const sources = new Map();
    for (const id of ids) {
      const zone = zoneOf(state, id);
      if (zone) sources.set(zone.id, zone);
    }
    if (opts.strict) {
      for (const zone of sources.values()) if (isPrivateTo(zone, actor)) hard.push(`${zoneLabel(state, zone)} is private.`);
    }
    if (!actor || (state.rulesMode === "off" && !opts.force)) return { hard, soft };
    for (const zone of sources.values()) {
      if (zone.id === toId) continue;
      const take = zone.rule?.take;
      if (take && !whoAllows(state, take, zone, actor)) soft.push(`Only ${whoPhrase(take, zone)} may take from ${zone.name}.`);
      if (zone.rule?.cost) {
        const price = ids.filter((id) => zoneOf(state, id) === zone).reduce((sum, id) => sum + (Number(state.cards[id]?.value) || 0), 0);
        const purse = counterValue(state, actor, zone.rule.cost);
        if (purse === null) soft.push(`${zone.name} costs ${zone.rule.cost}, but there's no counter with that name.`);
        else if (price > purse) soft.push(`That costs ${fmt(price)} ${zone.rule.cost}; you have ${fmt(purse)}.`);
      }
    }
    if (!target || (sources.size === 1 && sources.has(toId))) return { hard, soft };
    const rule = target.rule || {};
    if (rule.place && !whoAllows(state, rule.place, target, actor)) soft.push(`Only ${whoPhrase(rule.place, target)} may play to ${target.name}.`);
    if (rule.phase && !sameText(rule.phase, state.turn.phase)) soft.push(`${target.name} only takes cards during ${rule.phase}.`);
    if (rule.once && (ids.length > 1 || target.cards.some((id) => state.cards[id]?.playedBy === actor))) soft.push(`One card each in ${target.name}.`);
    if (rule.climb) {
      const problem = climbProblem(state, rule, target, ids);
      if (problem) soft.push(problem);
    } else {
      let top = target.cards.length ? state.cards[target.cards[target.cards.length - 1]] : null;
      for (const id of ids) {
        const card = state.cards[id];
        if (!card) continue;
        const problem = placeProblem(state, rule, target, card, top, zoneOf(state, id));
        if (problem) {
          soft.push(problem);
          break;
        }
        top = card;
      }
    }
    if (rule.meld && rule.meld !== "none") {
      const all = [...target.cards, ...ids.filter((id) => !target.cards.includes(id))].map((id) => state.cards[id]).filter(Boolean);
      if (!meldOk(all, rule)) soft.push(`${target.name} must be ${RULE_MELD[rule.meld].toLowerCase()}.`);
    }
    if (target.limit && target.cards.length + ids.filter((id) => !target.cards.includes(id)).length > target.limit) soft.push(`${target.name} holds at most ${target.limit}.`);
    return { hard, soft };
  }

  /** Climbing (President-style): a set of one rank, the same size as the last play, and higher. */
  /** Why this pile can be slapped right now ("a pair"…), or "" when it can't. */
  function slapReason(state, zone) {
    const kind = zone?.rule?.slap;
    const ids = zone?.cards || [];
    if (!kind || !ids.length) return "";
    const at = (i) => state.cards[ids[ids.length - 1 - i]];
    const name = (card) => (card ? (card.custom ? card.label : card.rank) : null);
    const top = at(0);
    const second = at(1);
    const third = at(2);
    if (!top || !top.faceUp) return "";
    if (kind === "jack") return top.rank === "J" ? "a Jack" : "";
    if (second?.faceUp && name(top) === name(second)) return "a pair";
    if (kind === "pair") return "";
    if (third?.faceUp && name(top) === name(third)) return "a sandwich";
    if (kind === "sandwich") return "";
    if (second?.faceUp && ((top.rank === "K" && second.rank === "Q") || (top.rank === "Q" && second.rank === "K"))) return "a marriage";
    const bottom = at(ids.length - 1);
    if (ids.length > 2 && bottom?.faceUp && name(top) === name(bottom)) return "top and bottom";
    return "";
  }

  function climbProblem(state, rule, target, ids) {
    const cards = ids.map((id) => state.cards[id]).filter(Boolean);
    if (!cards.length) return "";
    const rank = normRank(cards[0].rank);
    if (cards.some((card) => normRank(card.rank) !== rank)) return "Play cards of one rank together.";
    if (!target.cards.length) return "";
    const pile = target.cards.map((id) => state.cards[id]);
    const top = pile[pile.length - 1];
    let previous = 0;
    for (let i = pile.length - 1; i >= 0 && normRank(pile[i].rank) === normRank(top.rank); i -= 1) previous += 1;
    if (cards.length !== previous) return `Play ${previous} card${previous === 1 ? "" : "s"} to match the last play.`;
    const aceHigh = rule.aceHigh !== false;
    const a = rankValue(cards[0], aceHigh);
    const b = rankValue(top, aceHigh);
    if (a != null && b != null && a <= b) return `Beat the ${cardName(top)}: play a higher rank.`;
    return "";
  }

  /** Does this pile form a valid (possibly unfinished) set or run? Jokers and wild ranks fill gaps. */
  function meldOk(cards, rule) {
    const wild = (rule.wild || []).map(normRank);
    const isWild = (card) => card.rank === "JK" || wild.includes(normRank(card.rank));
    const plain = cards.filter((card) => !isWild(card));
    const wilds = cards.length - plain.length;
    if (plain.length <= 1) return true;
    const isSet = plain.every((card) => normRank(card.rank) === normRank(plain[0].rank));
    const isRun = (aceHigh) => {
      if (!plain.every((card) => sameText(card.suit, plain[0].suit))) return false;
      const values = plain.map((card) => rankValue(card, aceHigh));
      if (values.some((value) => value == null) || new Set(values).size !== values.length) return false;
      const sorted = values.slice().sort((a, b) => a - b);
      return sorted[sorted.length - 1] - sorted[0] + 1 - sorted.length <= wilds;
    };
    const run = isRun(false) || isRun(true);
    if (rule.meld === "set") return isSet;
    if (rule.meld === "run") return run;
    return isSet || run;
  }

  function holdsCards(state, playerId) {
    return orderedZones(state, playerId).some((zone) => zone.kind !== "deck" && (zone.visibility !== "public" || zone.kind === "hand") && zone.cards.length);
  }

  const BOT_STYLES = { random: "Random legal card", smart: "Smart (plays to the scoring)", low: "Lowest legal card", high: "Highest legal card" };

  /**
   * How good a play looks to the "smart" bot. Trick groups: in low-score games
   * duck under the winning card (or dump the most dangerous card), otherwise
   * win as cheaply as possible. Table piles: shed the card worth the most in
   * your hand's scoring, keeping wilds. Your own scored groups: build the best
   * hand one card at a time.
   */
  function scorePlay(state, playerId, play) {
    const target = state.zones[play.to];
    const card = state.cards[play.card];
    const rank = rankValue(card, true) ?? (Number(card.value) || 0);
    const jitter = rng() * 0.01;
    if (play.buy) return 1000 + (Number(card.value) || 0) * 10 + jitter;
    if (target.rule?.climb) return (play.cards?.length || 1) * 30 - rank + jitter;
    if ((target.evals || []).includes("trick")) {
      const trial = [...target.cards, play.card];
      const result = evaluateSpec(state, { ...target, cards: trial }, "trick");
      const wins = result && result.winnerIndex === trial.length - 1;
      const danger = Number(evaluateSpec(state, { ...target, cards: [play.card] }, "hearts-points")?.value) || 0;
      if (state.scores.lowWins) return (wins ? -100 - rank - danger * 3 : 100 + rank + danger * 5) + jitter;
      return (wins ? 200 - rank : -rank) + jitter;
    }
    if (target.area === "table") {
      const from = state.zones[play.from];
      const spec = from.evals?.[0];
      const wild = (target.rule?.wild || []).map(normRank).includes(normRank(card.rank));
      let shed = rank;
      if (spec) {
        const before = Number(evaluateSpec(state, from, spec)?.value) || 0;
        const after = Number(evaluateSpec(state, { ...from, cards: from.cards.filter((id) => id !== play.card) }, spec)?.value) || 0;
        shed = before - after;
      }
      return shed - (wild ? 1000 : 0) + jitter;
    }
    const spec = target.evals?.[0];
    if (spec) return (Number(evaluateSpec(state, { ...target, cards: [...target.cards, play.card] }, spec)?.score) || 0) + jitter;
    return jitter;
  }

  /** A bot's choice among its legal plays (random choices follow seeded shuffles). */
  function pickPlay(state, playerId, style = "random") {
    const plays = legalPlays(state, playerId);
    if (!plays.length) return null;
    const onTable = plays.filter((play) => state.zones[play.to]?.area === "table");
    const pool = onTable.length ? onTable : plays;
    if (style === "smart") {
      let best = null;
      let bestScore = -Infinity;
      for (const play of pool) {
        const score = scorePlay(state, playerId, play);
        if (score > bestScore) { best = play; bestScore = score; }
      }
      return best;
    }
    if (style !== "low" && style !== "high") return pool[Math.floor(rng() * pool.length)];
    const value = (play) => rankValue(state.cards[play.card], true) ?? 0;
    return pool.slice().sort((a, b) => (style === "low" ? value(a) - value(b) : value(b) - value(a)))[0];
  }

  /**
   * One bot turn: a legal play; else the table's "can't play" action and a
   * retry; else pass. Returns the new state and what happened ("idle" means
   * the bot holds nothing and has no fallback, so nothing changed).
   */
  function botStep(state, playerId, opts = {}) {
    const style = BOT_STYLES[playerById(state, playerId)?.botStyle] ? playerById(state, playerId).botStyle : opts.style;
    const tryPlay = (source) => {
      const play = pickPlay(source, playerId, style);
      if (!play) return null;
      const advances = Boolean(source.zones[play.to]?.rule?.advance) && source.rulesMode !== "off";
      const before = source.turn.index;
      let next = reduce(source, { type: "move", cards: play.cards || [play.card], to: play.to }, playerId);
      // One play per turn unless the design lets players keep going until they're stuck.
      if (!advances && source.playsPerTurn !== 0 && next.turn.index === before && next.players[before]?.id === playerId) next = reduce(next, { type: "nextTurn" }, playerId);
      return { next, cards: (play.cards || [play.card]).map((id) => source.cards[id]).filter(Boolean) };
    };
    const played = tryPlay(state);
    if (played) return { state: played.next, did: "play", cards: played.cards };
    const fallback = state.botFallback ? findMacro(state, state.botFallback) : null;
    if (!fallback && !holdsCards(state, playerId)) return { state, did: "idle" };
    let next = state;
    const before = next.turn.index;
    if (fallback) {
      next = reduce(next, { type: "runMacro", id: fallback.id }, playerId);
      if (next.turn.index !== before) return { state: next, did: "fallback" };
      const retry = tryPlay(next);
      if (retry) return { state: retry.next, did: "play", cards: retry.cards };
    }
    if (next.players[next.turn.index]?.id === playerId) next = reduce(next, { type: "nextTurn" }, playerId);
    return { state: next, did: "pass" };
  }

  /**
   * Autoplay a whole game with every seat as a bot, starting each round with
   * the `deal` action whenever nobody can move. Used to balance-test designs.
   */
  function playOut(start, opts = {}) {
    let state = clone(start);
    state.log = [];
    state.gameOver = null;
    state.players.forEach((player) => { player.bot = true; });
    const deal = opts.deal ? findMacro(state, opts.deal) : null;
    const maxSteps = clampInt(opts.maxSteps, 10, 50000, 4000);
    let steps = 0;
    let idle = 0;
    let deals = 0;
    const played = opts.trackCards ? {} : null;
    if (deal) { state = reduce(state, { type: "runMacro", id: deal.id }); deals += 1; }
    while (steps < maxSteps && !state.gameOver) {
      const player = state.players[state.turn.index];
      steps += 1;
      const result = player && !player.out ? botStep(state, player.id, opts) : { state: reduce(state, { type: "nextTurn" }), did: "pass" };
      if (played && result.cards) {
        const mine = played[player.id] || (played[player.id] = {});
        for (const card of result.cards) mine[cardKey(card)] = (mine[cardKey(card)] || 0) + 1;
      }
      state = result.state;
      // Real-time slaps: whenever a pile can be slapped, a random player gets there first.
      for (const zone of orderedZones(state, "table")) {
        if (state.gameOver || !slapReason(state, zone)) continue;
        const slapper = state.players[Math.floor(rng() * state.players.length)];
        if (slapper) state = reduce(state, { type: "slap", zone: zone.id, player: slapper.id }, slapper.id);
      }
      if (state.log.length > 60) state.log = state.log.slice(-10);
      if (result.did !== "idle") { idle = 0; continue; }
      idle += 1;
      if (idle < state.players.length) { state = reduce(state, { type: "nextTurn" }); continue; }
      if (!deal || deals > 500) break;
      state = reduce(state, { type: "runMacro", id: deal.id });
      deals += 1;
      idle = 0;
    }
    const out = { state, steps, deals, finished: Boolean(state.gameOver) };
    if (played) out.cardsPlayed = played;
    return out;
  }

  /** How card-balance reports group cards: custom cards by name, standard cards by rank. */
  function cardKey(card) {
    if (!card) return "?";
    if (card.custom) return card.label || card.rank || "Card";
    return card.rank === "JK" ? "Joker" : card.rank;
  }

  /**
   * Every single-card play this player could legally make right now: from
   * their own groups to any group with play rules (checked as if enforced).
   */
  function legalPlays(state, playerId) {
    const player = playerById(state, playerId);
    if (!player) return [];
    const sources = orderedZones(state, playerId).filter((zone) => zone.kind !== "deck" && (zone.visibility !== "public" || zone.kind === "hand"));
    const targets = [...orderedZones(state, "table"), ...orderedZones(state, playerId)].filter((zone) => zone.rule && zone.rule.place);
    const out = [];
    for (const from of sources) {
      for (const cardId of from.cards) {
        for (const to of targets) {
          if (to.id === from.id || to.rule.climb) continue;
          const check = checkMove(state, [cardId], to.id, playerId, { force: true });
          if (!check.hard.length && !check.soft.length) out.push({ card: cardId, from: from.id, to: to.id });
        }
      }
    }
    // Climbing groups take sets: every size of every rank you hold.
    for (const to of targets.filter((zone) => zone.rule.climb)) {
      for (const from of sources) {
        if (from.id === to.id) continue;
        const byRank = new Map();
        for (const id of from.cards) {
          const key = normRank(state.cards[id]?.rank);
          byRank.set(key, [...(byRank.get(key) || []), id]);
        }
        for (const group of byRank.values()) {
          for (let size = 1; size <= group.length; size += 1) {
            const cards = group.slice(0, size);
            const check = checkMove(state, cards, to.id, playerId, { force: true });
            if (!check.hard.length && !check.soft.length) out.push({ card: cards[0], cards, from: from.id, to: to.id });
          }
        }
      }
    }
    // Buying: the top card of a market pile (a group with a cost) into your own discard pile.
    const discard = orderedZones(state, playerId).find((zone) => zone.kind === "discard");
    if (discard) {
      for (const market of orderedZones(state, "table")) {
        if (!market.rule?.cost || !market.cards.length) continue;
        const cardId = market.cards[market.cards.length - 1];
        const check = checkMove(state, [cardId], discard.id, playerId, { force: true });
        if (!check.hard.length && !check.soft.length) out.push({ card: cardId, from: market.id, to: discard.id, buy: true });
      }
    }
    return out;
  }

  function counterValue(state, playerId, name) {
    const def = state.counterDefs.find((entry) => sameText(entry.name, name));
    if (def) return Number(playerById(state, playerId)?.counters?.[def.id]) || 0;
    const tracker = state.tableCounters.find((entry) => sameText(entry.name, name));
    return tracker ? Number(tracker.value) || 0 : null;
  }

  function applyCheck(state, result, actor) {
    if (result.hard.length) throw new Error(result.hard[0]);
    if (!result.soft.length) return;
    if (state.rulesMode === "enforce") throw new Error(result.soft[0]);
    pushLog(state, actor, "⚠ " + result.soft.join(" "), "warn");
  }

  function describeRule(rule = {}, zone = {}) {
    const parts = [];
    if (rule.place) parts.push(`only ${whoPhrase(rule.place, zone).replace(/,$/, "")} may play here`);
    if (rule.take) parts.push(`only ${whoPhrase(rule.take, zone).replace(/,$/, "")} may take from here`);
    if (rule.first) parts.push(`starts with ${rankWord(rule.first)}`);
    if (rule.accept) parts.push(RULE_ACCEPT[rule.accept].toLowerCase());
    if (rule.order) parts.push(RULE_ORDER[rule.order].toLowerCase() + (rule.aceHigh ? " (aces high)" : ""));
    if (rule.wild?.length) parts.push(`${rule.wild.join(", ")} ${rule.wild.length === 1 ? "is" : "are"} wild`);
    if (rule.meld) parts.push(`must form ${RULE_MELD[rule.meld].toLowerCase()}`);
    if (rule.phase) parts.push(`only during ${rule.phase}`);
    if (rule.cost) parts.push(`taking a card costs its value in ${rule.cost}`);
    if (rule.climb) parts.push("play a set of one rank that matches the last play's size and beats its rank");
    if (rule.follow) parts.push("must follow the led suit when able");
    if (rule.once) parts.push("one card per player");
    if (rule.advance) parts.push("the turn passes after playing here");
    if (rule.flipTop) parts.push("the new top card turns face up");
    if (rule.slap) parts.push(`slap it when ${RULE_SLAP[rule.slap].charAt(0).toLowerCase() + RULE_SLAP[rule.slap].slice(1)} to win the pile into your ${rule.slapTo}; a wrong slap burns a card`);
    return parts.join("; ");
  }

  // ------------------------------------------------------- evaluator bridge

  let evaluatorApi = null;
  /** Evaluators live in evaluators.js; the engine finds them on the global object unless one is injected. */
  function setEvaluator(api) { evaluatorApi = api; }
  function evaluators() {
    return evaluatorApi || (typeof globalThis !== "undefined" ? globalThis.CardEvaluators : null) || null;
  }

  function findZoneRef(source, ref, area) {
    if (!ref) return null;
    if (source.zones[ref]) return source.zones[ref];
    const key = String(ref).toLowerCase();
    const match = (zone) => (zone.key || "").toLowerCase() === key || zone.name.toLowerCase() === key;
    return orderedZones(source, "table").find(match) || (area ? orderedZones(source, area).find(match) : null) || null;
  }

  function evalCards(source, zone, visibleOnly) {
    return zone.cards.map((id) => {
      const card = source.cards[id] || {};
      if ((visibleOnly && !card.visible) || card.rank == null) return { rank: null, suit: null };
      if (card.custom) return { rank: card.rank, suit: "x", custom: true, value: Number(card.value) || 0, label: card.label, group: card.suit };
      return { rank: card.rank, suit: card.suit };
    });
  }

  /** Everything an evaluator needs for one spec such as "poker-omaha@board-2" or "points:<scheme id>". */
  function evalInput(source, zone, spec, visibleOnly = false) {
    const [rawId, boardRef] = String(spec).split("@");
    let id = rawId;
    const ctx = { ...(zone.ctx || {}) };
    const boardZone = findZoneRef(source, boardRef || ctx.board, zone.area);
    delete ctx.board;
    if (boardZone && boardZone.id !== zone.id) ctx.board = evalCards(source, boardZone, visibleOnly).filter((card) => card.rank);
    const starterZone = findZoneRef(source, ctx.starter, zone.area);
    delete ctx.starter;
    if (starterZone && starterZone.cards.length) {
      const top = evalCards(source, starterZone, visibleOnly).slice(-1)[0];
      if (top?.rank) ctx.starter = top;
    }
    let scheme = null;
    if (id.startsWith("points:")) {
      scheme = (source.schemes || []).find((entry) => entry.id === id.slice(7)) || null;
      ctx.scheme = scheme;
      id = "custom-points";
    }
    let cards = evalCards(source, zone, visibleOnly);
    if (ctx.topOnly) cards = cards.slice(-1);
    return { id, spec: String(spec), cards, ctx, boardZone, scheme };
  }

  function evaluateSpec(source, zone, spec, visibleOnly = false) {
    const api = evaluators();
    if (!api || !zone || !spec) return null;
    const input = evalInput(source, zone, spec, visibleOnly);
    if (!input.cards.some((card) => card.rank)) return null;
    try { return api.evaluate(input.id, input.cards, input.ctx); } catch (error) { return null; }
  }

  // -------------------------------------------------------------- formulas

  /**
   * A tiny, safe expression language for scoring (no eval): numbers, names,
   * + - * / %, comparisons, && || !, a ? b : c, and min/max/abs/floor/ceil/round.
   */
  function evalFormula(expr, vars = {}) {
    const text = String(expr || "");
    const tokens = [];
    const re = /\s*(\d+(?:\.\d+)?|[A-Za-z_][A-Za-z0-9_]*|<=|>=|==|!=|&&|\|\||[-+*/%()?:,<>!])/y;
    let at = 0;
    while (at < text.length) {
      re.lastIndex = at;
      const m = re.exec(text);
      if (!m) {
        if (/^\s*$/.test(text.slice(at))) break;
        throw new Error(`Can't read “${text.slice(at).trim().slice(0, 12)}” in the formula.`);
      }
      tokens.push(m[1]);
      at = re.lastIndex;
    }
    let i = 0;
    const peek = () => tokens[i];
    const take = (tok) => { if (tokens[i] !== tok) throw new Error(`Expected “${tok}” in the formula.`); i += 1; };
    const FUNCS = { min: Math.min, max: Math.max, abs: Math.abs, floor: Math.floor, ceil: Math.ceil, round: Math.round };
    const primary = () => {
      const tok = tokens[i++];
      if (tok === undefined) throw new Error("The formula ends too soon.");
      if (tok === "(") { const value = ternary(); take(")"); return value; }
      if (/^\d/.test(tok)) return Number(tok);
      if (/^[A-Za-z_]/.test(tok)) {
        const name = tok.toLowerCase();
        if (peek() === "(") {
          i += 1;
          const args = [];
          if (peek() !== ")") { args.push(ternary()); while (peek() === ",") { i += 1; args.push(ternary()); } }
          take(")");
          if (!FUNCS[name]) throw new Error(`Unknown function “${tok}”.`);
          return FUNCS[name](...args);
        }
        if (name === "true") return 1;
        if (name === "false") return 0;
        if (!(name in vars)) throw new Error(`Unknown name “${tok}”. Try: ${Object.keys(vars).slice(0, 8).join(", ")}.`);
        return Number(vars[name]) || 0;
      }
      throw new Error(`Unexpected “${tok}” in the formula.`);
    };
    const unary = () => {
      if (peek() === "-") { i += 1; return -unary(); }
      if (peek() === "+") { i += 1; return unary(); }
      if (peek() === "!") { i += 1; return unary() ? 0 : 1; }
      return primary();
    };
    const mul = () => {
      let value = unary();
      while (["*", "/", "%"].includes(peek())) {
        const op = tokens[i++];
        const right = unary();
        value = op === "*" ? value * right : op === "/" ? (right ? value / right : 0) : right ? value % right : 0;
      }
      return value;
    };
    const add = () => {
      let value = mul();
      while (peek() === "+" || peek() === "-") value = tokens[i++] === "+" ? value + mul() : value - mul();
      return value;
    };
    const cmp = () => {
      const value = add();
      const op = peek();
      if (!["<", "<=", ">", ">=", "==", "!="].includes(op)) return value;
      i += 1;
      const right = add();
      return { "<": value < right, "<=": value <= right, ">": value > right, ">=": value >= right, "==": value === right, "!=": value !== right }[op] ? 1 : 0;
    };
    const and = () => { let value = cmp(); while (peek() === "&&") { i += 1; const right = cmp(); value = value && right ? 1 : 0; } return value; };
    const or = () => { let value = and(); while (peek() === "||") { i += 1; const right = and(); value = value || right ? 1 : 0; } return value; };
    const ternary = () => {
      const test = or();
      if (peek() !== "?") return test;
      i += 1;
      const yes = ternary();
      take(":");
      const no = ternary();
      return test ? yes : no;
    };
    const result = ternary();
    if (i < tokens.length) throw new Error(`Unexpected “${tokens[i]}” in the formula.`);
    return Number.isFinite(result) ? Math.round(result * 1000) / 1000 : 0;
  }

  const varName = (text) => String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

  /** The names a formula can use for one player. */
  function formulaVars(state, playerId) {
    const vars = {};
    const player = playerById(state, playerId);
    const t = totals(state);
    for (const def of state.counterDefs) vars[varName(def.name)] = Number(player?.counters?.[def.id]) || 0;
    for (const tracker of state.tableCounters) vars[varName(tracker.name)] = Number(tracker.value) || 0;
    for (const zone of orderedZones(state, playerId)) {
      const key = varName(zone.key || zone.name);
      vars[key + "_cards"] = zone.cards.length;
      if (zone.evals?.[0]) vars[key + "_value"] = Number(evaluateSpec(state, zone, zone.evals[0])?.value) || 0;
    }
    for (const zone of orderedZones(state, "table")) vars[varName(zone.key || zone.name) + "_cards"] = zone.cards.length;
    vars.score = t[playerId] || 0;
    vars.round = state.turn.round;
    vars.players = activeCount(state);
    vars.chips = Number(player?.chips) || 0;
    vars.pot = Number(state.pot) || 0;
    return vars;
  }

  // ---------------------------------------------------------------- macros

  const MACRO_OPS = {
    shuffle: { label: "Shuffle", fields: ["zone"] },
    cut: { label: "Cut", fields: ["zone"] },
    deal: { label: "Deal", fields: ["from", "to", "count", "face"] },
    flip: { label: "Flip", fields: ["zone", "face", "count"] },
    clear: { label: "Move all", fields: ["from", "to", "face", "keep"] },
    collect: { label: "Collect all into", fields: ["to", "shuffle"] },
    sort: { label: "Sort", fields: ["zone", "by"] },
    refill: { label: "Refill up to", fields: ["from", "to", "count"] },
    dealUntil: { label: "Deal until", fields: ["from", "to", "face", "evaluator", "cmp", "n"] },
    peekTop: { label: "Peek at top cards", fields: ["zone", "count", "who"] },
    passZones: { label: "Pass groups around", fields: ["zone", "dir"] },
    findWinner: { label: "Find winner", fields: ["zone", "evaluator", "low"] },
    score: { label: "Score points", fields: ["who", "amount"] },
    scoreZones: { label: "Score groups", fields: ["zone", "evaluator", "sign", "target"] },
    counter: { label: "Change counter", fields: ["who", "name", "amount"] },
    setCounter: { label: "Set counter", fields: ["who", "name", "amount"] },
    scoreFormula: { label: "Score by formula", fields: ["who", "formula"] },
    counterFormula: { label: "Counter by formula", fields: ["who", "name", "formula"] },
    ante: { label: "Everyone antes", fields: ["amount"] },
    awardPot: { label: "Award pot", fields: ["who"] },
    nextTurn: { label: "Next turn", fields: [] },
    setTurn: { label: "Turn to", fields: ["who"] },
    reverse: { label: "Reverse direction", fields: [] },
    nextDealer: { label: "Pass the deal", fields: [] },
    nextRound: { label: "Next round", fields: [] },
    endGame: { label: "End the game", fields: ["text"] },
    phase: { label: "Set phase", fields: ["text"] },
    nextPhase: { label: "Next phase", fields: [] },
    stopIf: { label: "Stop if", fields: ["zone", "evaluator", "cmp", "n", "formula"] },
    sitOut: { label: "Sit out", fields: ["who"] },
    bringBack: { label: "Bring everyone back", fields: [] },
    runAction: { label: "Run another action", fields: ["macro", "times"] },
    log: { label: "Announce", fields: ["text"] },
  };

  const WHO_OPTIONS = {
    current: "Current player",
    after: "Next player",
    dealer: "Dealer",
    winner: "Winner",
    subject: "Trigger's player",
    all: "Everyone",
    others: "Everyone else",
  };
  const TURN_OPTIONS = { next: "Left of dealer", after: "Next player", dealer: "Dealer", winner: "Winner", subject: "Trigger's player" };
  const STOP_CMP = { "==": "=", "!=": "≠", ">": ">", ">=": "≥", "<": "<", "<=": "≤" };

  const signed = (n) => {
    const value = Number(n) || 0;
    return (value >= 0 ? "+" : "") + fmt(value);
  };

  function findMacro(state, ref) {
    if (!ref) return null;
    return state.macros.find((macro) => macro.id === ref) || state.macros.find((macro) => sameText(macro.label, ref)) || null;
  }

  function describeStep(step, state = null) {
    const op = MACRO_OPS[step.op];
    if (!op) return step.op;
    const who = (value, fallback = "current") => (WHO_OPTIONS[value || fallback] || value || fallback).toLowerCase();
    switch (step.op) {
      case "deal": return `Deal ${step.count || 1} ${step.face === "up" ? "up" : step.face === "down" ? "down" : ""} ${step.from || "deck"} → ${step.to}${step.perSeat ? " (per seat)" : ""}`.replace(/\s+/g, " ");
      case "flip": return `Flip ${step.count ? "top " + step.count + " of " : ""}${step.zone} ${step.face || ""}`.trim();
      case "clear": return `Move all ${step.from} → ${step.to}${step.keep ? ` (keep top ${step.keep})` : ""}${step.perSeat ? " (per seat)" : ""}`;
      case "collect": return `Collect all → ${step.to || "deck"}${step.shuffle !== false ? " + shuffle" : ""}`;
      case "shuffle": return `Shuffle ${step.zone || "deck"}`;
      case "cut": return `Cut ${step.zone || "deck"}`;
      case "sort": return `Sort ${step.zone} by ${step.by || "rank"}`;
      case "refill": return `Refill every ${step.to || "hand"} to ${step.count || 1} from ${step.from || "deck"}`;
      case "peekTop": return `${who(step.who)} peek${step.who === "all" || step.who === "others" ? "" : "s"} at the top ${step.count || 1} of ${step.zone || "deck"}`;
      case "passZones": return `Pass every ${step.zone || "hand"} ${step.dir === "right" ? "right" : "left"}`;
      case "findWinner": return `Winner of ${step.zone || "trick"}${step.evaluator ? " by " + step.evaluator : ""}${step.low ? " (lowest)" : ""}`;
      case "score": return `${signed(step.amount)} pts → ${who(step.who)}`;
      case "scoreZones": return `Score each ${step.zone}${step.evaluator ? " (" + step.evaluator + ")" : ""}${step.target === "winner" ? " → winner" : ""}${step.sign === "-" ? ", subtract" : ""}`;
      case "counter": return `${step.name || "Counter"} ${signed(step.amount)} → ${who(step.who)}`;
      case "setCounter": return `${step.name || "Counter"} = ${fmt(step.amount)} for ${who(step.who)}`;
      case "scoreFormula": return `Score ${who(step.who, "all")}: ${step.formula || "?"}`;
      case "counterFormula": return `${step.name || "Counter"} = ${step.formula || "?"} for ${who(step.who, "all")}`;
      case "ante": return `Ante ${step.amount}`;
      case "awardPot": return `Pot → ${who(step.who, "winner")}`;
      case "setTurn": return `Turn → ${(TURN_OPTIONS[step.who || "next"] || step.who).toLowerCase()}`;
      case "phase": return `Phase: ${step.text}`;
      case "sitOut": return `${who(step.who)} sit${step.who === "all" || step.who === "others" ? "" : "s"} out`;
      case "bringBack": return "Everyone back in";
      case "stopIf": if (step.formula) return `Stop if ${step.formula}`;
        return `Stop if ${step.zone}${step.evaluator ? " scores" : " has"} ${STOP_CMP[step.cmp || "=="] || step.cmp} ${step.n ?? 0}${step.evaluator ? "" : " cards"}`;
      case "dealUntil": return `Deal ${step.from || "deck"} → ${step.to} until it scores ${STOP_CMP[step.cmp || ">="] || step.cmp} ${step.n ?? 0}`;
      case "runAction": {
        const macro = state ? findMacro(state, step.macro) : null;
        return `Run “${macro?.label || step.macro || "?"}”${Number(step.times) > 1 ? " ×" + step.times : ""}`;
      }
      case "log": return `Say “${step.text}”`;
      default: return op.label;
    }
  }

  function fillText(state, text, ctx = {}) {
    const name = (id) => playerById(state, id)?.name || "nobody";
    return String(text || "").replace(/\{(winner|subject|current|next|dealer|round|phase|pot)\}/g, (match, key) => {
      switch (key) {
        case "winner": return name(ctx.winner || state.lastWinner);
        case "subject": return name(ctx.subject);
        case "current": return state.players[state.turn.index]?.name || "";
        case "next": return playerAfter(state)?.name || "";
        case "dealer": return state.players[state.turn.dealer]?.name || "";
        case "round": return String(state.turn.round);
        case "phase": return state.turn.phase || "";
        case "pot": return fmt(state.pot);
        default: return match;
      }
    });
  }

  function playersFor(state, who, ctx = {}, actor = null) {
    if (String(who || "").startsWith("p:")) return [playerById(state, String(who).slice(2))].filter(Boolean);
    const active = state.players.filter((player) => !player.out);
    switch (who) {
      case "dealer": return [state.players[state.turn.dealer]].filter(Boolean);
      case "after": return [playerAfter(state)].filter(Boolean);
      case "winner": return [playerById(state, ctx.winner || state.lastWinner)].filter(Boolean);
      case "subject": return [playerById(state, ctx.subject)].filter(Boolean);
      case "me": return [playerById(state, actor)].filter(Boolean);
      case "all": return active;
      case "others": {
        const skip = ctx.winner || ctx.subject || state.players[state.turn.index]?.id;
        return active.filter((player) => player.id !== skip);
      }
      default: return [state.players[state.turn.index]].filter(Boolean);
    }
  }

  function addScore(state, playerId, delta, actor, reason = "") {
    const player = playerById(state, playerId);
    const value = Number(delta);
    if (!player || !Number.isFinite(value) || !value) return;
    const round = currentRound(state);
    round.scores[player.id] = (Number(round.scores[player.id]) || 0) + value;
    pushLog(state, actor, `${player.name} ${value > 0 ? "+" : ""}${fmt(value)} ${state.scores.label.toLowerCase()}${reason ? " (" + cleanText(reason, 40) + ")" : ""}`, "score");
  }

  function passZones(state, ref, dir) {
    const key = String(ref || "hand").split("@")[0].trim().toLowerCase();
    const zones = state.players
      .filter((player) => !player.out)
      .map((player) => orderedZones(state, player.id).find((zone) => (zone.key || "").toLowerCase() === key || zone.name.toLowerCase() === key))
      .filter(Boolean);
    const n = zones.length;
    if (n < 2) return 0;
    const contents = zones.map((zone) => zone.cards);
    const shift = (dir === "right" ? -1 : 1) * (state.turn.dir || 1);
    zones.forEach((zone, i) => { zone.cards = contents[((i - shift) % n + n) % n]; });
    for (const zone of zones) for (const id of zone.cards) delete state.cards[id].peek;
    return n;
  }

  function findWinner(state, step, actor, ctx) {
    const ids = resolveZones(state, step.zone || "trick", actor, ctx);
    const specFor = (zone) => step.evaluator || zone.evals?.[0] || "high-card";
    let winner = null;
    let label = "";
    const single = ids.length === 1 && state.zones[ids[0]].area === "table" ? state.zones[ids[0]] : null;
    if (single) {
      const result = evaluateSpec(state, single, specFor(single));
      const index = Number.isInteger(result?.winnerIndex) ? result.winnerIndex : result?.used?.[0];
      const card = Number.isInteger(index) ? state.cards[single.cards[index]] : null;
      winner = card?.playedBy || null;
      label = result ? `${result.label}${card ? " — " + cardName(card) : ""}` : "";
    } else {
      let best = null;
      for (const id of ids) {
        const zone = state.zones[id];
        if (zone.area === "table") continue;
        const result = evaluateSpec(state, zone, specFor(zone));
        if (!result) continue;
        const score = step.low ? -result.score : result.score;
        if (!best || score > best.score) best = { score, player: zone.area, label: result.label, tied: false };
        else if (score === best.score) best.tied = true;
      }
      if (best) {
        winner = best.player;
        label = best.label + (best.tied ? " (tie: first in deal order)" : "");
      }
    }
    ctx.winner = winner;
    if (winner) {
      state.lastWinner = winner;
      pushLog(state, actor, `🏆 ${playerById(state, winner)?.name || "?"} wins ${step.zone || "trick"}${label ? ": " + label : ""}`, "score");
    } else {
      pushLog(state, actor, `No winner for ${step.zone || "trick"}${single ? " (cards need to be played by players)" : ""}`, "note");
    }
    return winner;
  }

  function scoreZones(state, step, actor, ctx) {
    const sign = step.sign === "-" ? -1 : 1;
    const toWinner = step.target === "winner";
    const receiver = ctx.winner || state.lastWinner;
    let pool = 0;
    for (const id of resolveZones(state, step.zone, actor, ctx)) {
      const zone = state.zones[id];
      const spec = step.evaluator || zone.evals?.[0];
      if (!spec) continue;
      const value = Number(evaluateSpec(state, zone, spec)?.value) || 0;
      if (!value) continue;
      if (toWinner) {
        if (zone.area !== receiver) pool += value;
      } else if (zone.area !== "table") addScore(state, zone.area, sign * value, actor, zone.name);
    }
    if (toWinner && receiver && pool) addScore(state, receiver, sign * pool, actor, `others' ${step.zone}`);
  }

  function bumpCounter(state, step, ctx, actor, set = false) {
    const name = String(step.name || "").trim().toLowerCase();
    const amount = Number(step.amount) || 0;
    const def = state.counterDefs.find((entry) => entry.name.toLowerCase() === name);
    if (def) {
      for (const player of playersFor(state, step.who, ctx, actor)) player.counters[def.id] = set ? amount : (Number(player.counters[def.id]) || 0) + amount;
      return;
    }
    const tracker = state.tableCounters.find((entry) => entry.name.toLowerCase() === name);
    if (!tracker) throw new Error(`No counter named “${step.name}”.`);
    tracker.value = set ? amount : tracker.value + amount;
  }

  function countIn(state, ref, actor, ctx) {
    return resolveZones(state, ref, actor, ctx).reduce((sum, id) => sum + state.zones[id].cards.length, 0);
  }

  /** Total evaluator value of the groups a reference names (e.g. a blackjack total). */
  function valueIn(state, ref, spec, actor, ctx) {
    return resolveZones(state, ref, actor, ctx).reduce((sum, id) => {
      const zone = state.zones[id];
      const result = evaluateSpec(state, zone, spec || zone.evals?.[0]);
      return sum + (Number(result?.value) || 0);
    }, 0);
  }

  function compare(a, cmp, b) {
    return { "==": a === b, "!=": a !== b, ">": a > b, ">=": a >= b, "<": a < b, "<=": a <= b }[cmp || "=="];
  }

  function runSteps(state, steps, actor, ctx = {}) {
    for (const step of steps || []) {
      if (runStep(state, step, actor, ctx) === "stop") return "stop";
    }
    return "";
  }

  function runStep(state, step, actor, ctx = {}) {
    const zones = (ref) => resolveZones(state, ref, actor, ctx);
    switch (step.op) {
      case "shuffle":
        for (const id of zones(step.zone || "deck")) shuffleArray(state.zones[id].cards);
        pushLog(state, actor, `Shuffled ${step.zone || "deck"}`);
        break;
      case "cut":
        for (const id of zones(step.zone || "deck")) cutZone(state.zones[id]);
        break;
      case "deal": {
        if (step.perSeat) {
          // Each player deals from their own group to their own group (e.g. War).
          for (const player of dealOrder(state)) {
            const from = resolveZones(state, `${step.from}@p:${player.id}`, actor, ctx)[0];
            const to = resolveZones(state, `${step.to}@p:${player.id}`, actor, ctx)[0];
            if (from && to && from !== to && state.zones[from].cards.length) {
              moveCards(state, takeTop(state, from, clampInt(step.count, 1, 60, 1)), to, { face: step.face || undefined });
            }
          }
          pushLog(state, actor, `Each player: ${step.from} → ${step.to}`);
          break;
        }
        const from = zones(step.from || "deck")[0];
        dealCards(state, from, zones(step.to), clampInt(step.count, 1, 60, 1), step.face || undefined, actor);
        break;
      }
      case "flip":
        for (const id of zones(step.zone)) {
          const zone = state.zones[id];
          const ids = step.count ? zone.cards.slice(-clampInt(step.count, 1, 99, 1)) : zone.cards;
          for (const cardId of ids) {
            const card = state.cards[cardId];
            card.faceUp = step.face === "up" ? true : step.face === "down" ? false : !card.faceUp;
          }
        }
        break;
      case "clear": {
        const keep = clampInt(step.keep, 0, 99, 0);
        const movable = (id) => {
          const cards = state.zones[id].cards;
          return cards.slice(0, Math.max(0, cards.length - keep));
        };
        if (step.perSeat) {
          for (const player of dealOrder(state)) {
            const from = resolveZones(state, `${step.from}@p:${player.id}`, actor, ctx)[0];
            const to = resolveZones(state, `${step.to}@p:${player.id}`, actor, ctx)[0];
            if (from && to && from !== to) moveCards(state, movable(from), to, { face: step.face });
          }
          break;
        }
        const to = zones(step.to)[0];
        if (!to) break;
        for (const id of zones(step.from)) if (id !== to) moveCards(state, movable(id), to, { face: step.face });
        break;
      }
      case "collect": {
        const to = zones(step.to || "deck")[0] || findDeckZone(state)?.id;
        if (to) returnAllTo(state, to, { shuffle: step.shuffle !== false, keepLocked: true });
        pushLog(state, actor, "Collected all cards" + (step.shuffle !== false ? " and shuffled" : ""));
        break;
      }
      case "sort":
        for (const id of zones(step.zone)) sortZone(state, id, step.by);
        break;
      case "refill": {
        const from = zones(step.from || "deck")[0];
        const want = clampInt(step.count, 1, 60, 1);
        const targets = zones(step.to || "hand").filter((id) => id !== from);
        if (!from || !targets.length) break;
        let dealt = 0;
        for (let pass = 0; pass < want; pass += 1) {
          for (const id of targets) {
            const source = state.zones[from];
            if (!source.cards.length) break;
            if (state.zones[id].cards.length >= want) continue;
            moveCards(state, [source.cards[source.cards.length - 1]], id, {});
            dealt += 1;
          }
        }
        if (dealt) pushLog(state, actor, `Refilled ${step.to || "hand"} to ${want} (${dealt} card${dealt === 1 ? "" : "s"})`);
        break;
      }
      case "passZones": {
        const n = passZones(state, step.zone, step.dir);
        if (n) pushLog(state, actor, `Passed every ${step.zone || "hand"} ${step.dir === "right" ? "right" : "left"}`);
        break;
      }
      case "findWinner": findWinner(state, step, actor, ctx); break;
      case "score":
        for (const player of playersFor(state, step.who, ctx, actor)) addScore(state, player.id, Number(step.amount) || 0, actor);
        break;
      case "scoreZones": scoreZones(state, step, actor, ctx); break;
      case "counter": bumpCounter(state, step, ctx, actor); break;
      case "setCounter": bumpCounter(state, step, ctx, actor, true); break;
      case "scoreFormula": {
        const players = playersFor(state, step.who || "all", ctx, actor);
        const points = players.map((player) => [player, evalFormula(step.formula, formulaVars(state, player.id))]);
        for (const [player, value] of points) addScore(state, player.id, value, actor, "formula");
        break;
      }
      case "counterFormula": {
        const players = playersFor(state, step.who || "all", ctx, actor);
        const values = players.map((player) => [player, evalFormula(step.formula, formulaVars(state, player.id))]);
        for (const [player, value] of values) bumpCounter(state, { ...step, amount: value, who: "p:" + player.id }, ctx, actor, true);
        break;
      }
      case "ante": {
        const amount = Math.max(0, Number(step.amount) || 0);
        for (const player of state.players) {
          if (player.out) continue;
          player.chips -= amount;
          state.pot += amount;
        }
        pushLog(state, actor, `Everyone antes ${amount}`);
        break;
      }
      case "awardPot": {
        const ids = playersFor(state, step.who || "winner", ctx, actor).map((player) => player.id);
        if (ids.length && state.pot > 0) HANDLERS.award(state, { players: ids }, actor);
        break;
      }
      case "nextTurn": advanceTurn(state, 1); break;
      case "nextDealer": passDeal(state); break;
      case "setTurn": setTurnTo(state, step.who || "next", ctx); break;
      case "reverse":
        state.turn.dir = (state.turn.dir || 1) * -1;
        pushLog(state, actor, `Play direction: ${state.turn.dir > 0 ? "clockwise" : "counter-clockwise"}`);
        break;
      case "nextRound": nextRound(state, actor); break;
      case "endGame": endGameNow(state, step.text ? cleanText(fillText(state, step.text, ctx), 80, "") || undefined : undefined); break;
      case "phase": state.turn.phase = cleanText(fillText(state, step.text, ctx), 40, ""); break;
      case "nextPhase": HANDLERS.nextPhase(state, {}, actor); break;
      case "sitOut":
        for (const player of playersFor(state, step.who, ctx, actor)) player.out = true;
        if (state.players[state.turn.index]?.out) advanceTurn(state, 1);
        break;
      case "bringBack": state.players.forEach((player) => { player.out = false; }); break;
      case "stopIf": {
        if (step.formula) {
          const viewer = state.players[state.turn.index]?.id || state.players[0]?.id;
          if (viewer && evalFormula(step.formula, formulaVars(state, viewer))) return "stop";
          break;
        }
        const measured = step.evaluator ? valueIn(state, step.zone, step.evaluator, actor, ctx) : countIn(state, step.zone, actor, ctx);
        if (compare(measured, step.cmp || "==", Number(step.n) || 0)) return "stop";
        break;
      }
      case "peekTop": {
        const zone = state.zones[zones(step.zone || "deck")[0]];
        if (!zone) break;
        const ids = zone.cards.slice(-clampInt(step.count, 1, 60, 1));
        const viewers = playersFor(state, step.who, ctx, actor);
        for (const id of ids) state.cards[id].peek = Array.from(new Set([...(state.cards[id].peek || []), ...viewers.map((player) => player.id)]));
        pushLog(state, actor, `${viewers.map((player) => player.name).join(", ")} looked at the top ${ids.length} of ${zone.name}`);
        break;
      }
      case "dealUntil": {
        const from = zones(step.from || "deck")[0];
        const to = zones(step.to)[0];
        if (!from || !to || from === to) break;
        const target = Number(step.n) || 0;
        let dealt = 0;
        while (dealt < 20 && state.zones[from].cards.length && !compare(valueIn(state, to, step.evaluator, actor, ctx), step.cmp || ">=", target)) {
          moveCards(state, takeTop(state, from, 1), to, { face: step.face || undefined });
          dealt += 1;
        }
        pushLog(state, actor, `${zoneLabel(state, state.zones[to])} drew ${dealt} (now ${fmt(valueIn(state, to, step.evaluator, actor, ctx))})`);
        break;
      }
      case "runAction": {
        const macro = findMacro(state, step.macro);
        if (!macro) throw new Error(`No action called “${step.macro}”.`);
        const depth = ctx.depth || 0;
        if (depth >= 4) throw new Error("Actions call each other too deeply.");
        ctx.depth = depth + 1;
        const times = clampInt(step.times, 1, 100, 1);
        for (let i = 0; i < times; i += 1) if (runSteps(state, macro.steps, actor, ctx) === "stop") break;
        ctx.depth = depth;
        break;
      }
      case "log": pushLog(state, actor, cleanText(fillText(state, step.text, ctx), 160, ""), "note"); break;
      default: throw new Error("Unknown macro step: " + step.op);
    }
    return "";
  }

  function cutZone(zone, at) {
    if (zone.cards.length < 2) return;
    const n = zone.cards.length;
    const point = Number.isInteger(at) ? Math.max(1, Math.min(n - 1, at)) : Math.max(1, Math.floor(n * (0.25 + rng() * 0.5)));
    const top = zone.cards.splice(n - point, point);
    zone.cards.unshift(...top);
  }

  function activeIndexes(state) {
    return state.players.map((player, index) => (player.out ? -1 : index)).filter((index) => index >= 0);
  }

  function advanceTurn(state, step = 1) {
    const n = state.players.length;
    if (!n) return;
    const dir = (state.turn.dir || 1) * step;
    let index = state.turn.index;
    for (let i = 0; i < n; i += 1) {
      index = ((index + Math.sign(dir)) % n + n) % n;
      if (!state.players[index].out) break;
    }
    state.turn.index = index;
  }

  function passDeal(state) {
    const n = state.players.length;
    if (!n) return;
    let index = state.turn.dealer;
    for (let i = 0; i < n; i += 1) {
      index = ((index + (state.turn.dir || 1)) % n + n) % n;
      if (!state.players[index].out) break;
    }
    state.turn.dealer = index;
  }

  function setTurnTo(state, who, ctx = {}) {
    const n = state.players.length;
    if (!n) return;
    const indexOf = (id) => state.players.findIndex((player) => player.id === id);
    if (who === "dealer") state.turn.index = state.turn.dealer;
    else if (who === "next" || who === "left") {
      const first = dealOrder(state)[0];
      if (first) state.turn.index = state.players.indexOf(first);
    } else if (who === "after") {
      const next = playerAfter(state);
      if (next) state.turn.index = indexOf(next.id);
    } else if (who === "winner" || who === "subject") {
      const index = indexOf(who === "winner" ? ctx.winner || state.lastWinner : ctx.subject);
      if (index >= 0) state.turn.index = index;
    } else if (who !== "current" && Number.isInteger(Number(who))) state.turn.index = clampInt(who, 0, n - 1, 0);
    if (state.players[state.turn.index]?.out) advanceTurn(state, 1);
  }

  function nextRound(state, actor) {
    state.turn.round += 1;
    const round = currentRound(state);
    if (Object.keys(round.scores).length) state.scores.rounds.push({ id: nextId(state, "r"), label: `Round ${state.scores.rounds.length + 1}`, scores: {} });
    state.turn.phase = state.phases[0] || "";
    pushLog(state, actor, `Round ${state.turn.round}`, "round");
  }

  // --------------------------------------------------------------- triggers

  const TRIGGER_EVENTS = {
    played: { label: "A card is played to a group", fields: ["zone", "card"] },
    empty: { label: "A group becomes empty", fields: ["zone"] },
    allEmpty: { label: "Every copy of a group is empty", fields: ["zone"] },
    count: { label: "A group reaches N cards", fields: ["zone", "n"] },
    allFull: { label: "Every copy of a group reaches N cards", fields: ["zone", "n"] },
    phase: { label: "A phase starts", fields: ["phase"] },
    turn: { label: "The turn passes", fields: [] },
    round: { label: "A new round starts", fields: [] },
    score: { label: "A player's score reaches N", fields: ["n"] },
    counter: { label: "A counter reaches N", fields: ["counter", "n"] },
    gameOver: { label: "The game ends", fields: [] },
  };

  // Only play actions fire triggers; setup changes (collecting, editing groups…) never do.
  const TRIGGERING = new Set(["move", "draw", "drawBottom", "deal", "clearZone", "runMacro", "nextTurn", "passDeal", "nextRound", "setPhase", "nextPhase", "setTurn", "adjustScore", "setRoundScore", "flip", "flipZone", "revealAll", "pullCards", "counter", "slap"]);

  /** Display name for a zone reference such as "trick" or "hand@current". */
  function refName(state, ref) {
    if (!state || !ref) return ref || "";
    const [key, scope] = String(ref).split("@");
    const k = key.trim().toLowerCase();
    const match = (zone) => (zone.key || "").toLowerCase() === k || String(zone.name).toLowerCase() === k;
    const zone = state.zones[key] || orderedZones(state, "table").find(match) || (state.seatTemplate || []).find(match);
    return zone ? zone.name + (scope ? ` (${scope})` : "") : ref;
  }

  function describeTrigger(trigger, state = null) {
    const n = Number(trigger.n) || 0;
    const name = refName(state, trigger.zone);
    switch (trigger.event) {
      case "played": return `When ${trigger.card ? `a ${trigger.card}` : "a card"} is played to ${name || "a group"}`;
      case "empty": return `When ${name || "a group"} is empty`;
      case "allEmpty": return `When every ${name || "group"} is empty`;
      case "allFull": return `When every ${name || "group"} has ${n || 1} card${(n || 1) === 1 ? "" : "s"}`;
      case "count": return `When ${name || "a group"} has ${n || "one card per player"}${n ? " card" + (n === 1 ? "" : "s") : ""}`;
      case "phase": return `When the ${trigger.phase || "?"} phase starts`;
      case "turn": return "When the turn passes";
      case "round": return "When a new round starts";
      case "score": return `When a player's score reaches ${fmt(n)}`;
      case "counter": return `When ${trigger.counter || "a counter"} reaches ${fmt(n)}`;
      case "gameOver": return "When the game ends";
      default: return trigger.event;
    }
  }

  function activeCount(state) {
    return state.players.filter((player) => !player.out).length;
  }

  function subjectOf(state, zone) {
    if (zone.area !== "table") return zone.area;
    const top = state.cards[zone.cards[zone.cards.length - 1]];
    return top?.playedBy || state.players[state.turn.index]?.id || null;
  }

  /** Does a card match a trigger's card filter: "Qs", a rank ("8", "Skip"), a label or a suit word? */
  function cardMatches(card, filter) {
    if (!filter) return true;
    const spec = parseCardSpec(filter);
    if (spec?.joker) return card.rank === "JK";
    if (spec) return !card.custom && card.rank === spec.rank && card.suit === spec.suit;
    return normRank(card.rank) === normRank(filter) || sameText(card.label, filter) || sameText(card.suit, filter) || sameText(suitWord(card.suit), filter);
  }

  function firedTriggers(before, state, actor) {
    const out = [];
    const count = (source, id) => source.zones[id]?.cards.length;
    for (const trigger of state.triggers || []) {
      if (trigger.off) continue;
      if (trigger.during && !sameText(trigger.during, state.turn.phase)) continue;
      switch (trigger.event) {
        case "played": {
          for (const id of resolveZones(state, trigger.zone)) {
            const was = new Set(before.zones[id]?.cards || []);
            if (!before.zones[id]) continue;
            for (const cardId of state.zones[id].cards) {
              const card = state.cards[cardId];
              if (was.has(cardId) || !card?.playedBy || !cardMatches(card, trigger.card)) continue;
              out.push({ trigger, subject: card.playedBy });
            }
          }
          break;
        }
        case "empty":
        case "count": {
          const need = trigger.event === "count" ? Number(trigger.n) || activeCount(state) : 0;
          for (const id of resolveZones(state, trigger.zone)) {
            const now = count(state, id);
            const was = count(before, id);
            if (was === undefined) continue;
            const hit = trigger.event === "empty" ? was > 0 && now === 0 : was < need && now >= need;
            if (hit) out.push({ trigger, subject: subjectOf(state, state.zones[id]) });
          }
          break;
        }
        case "allEmpty": {
          const ids = resolveZones(state, trigger.zone);
          if (!ids.length) break;
          const emptyNow = ids.every((id) => !count(state, id));
          const emptyBefore = ids.every((id) => !count(before, id));
          if (emptyNow && !emptyBefore) out.push({ trigger, subject: actor || state.players[state.turn.index]?.id || null });
          break;
        }
        case "allFull": {
          const ids = resolveZones(state, trigger.zone);
          const need = Number(trigger.n) || 1;
          if (!ids.length) break;
          const fullNow = ids.every((id) => (count(state, id) || 0) >= need);
          const fullBefore = ids.every((id) => (count(before, id) || 0) >= need);
          if (fullNow && !fullBefore) out.push({ trigger, subject: actor || state.players[state.turn.index]?.id || null });
          break;
        }
        case "phase":
          if (!sameText(state.turn.phase, before.turn.phase) && sameText(state.turn.phase, trigger.phase)) out.push({ trigger, subject: state.players[state.turn.index]?.id || null });
          break;
        case "turn":
          if (state.turn.index !== before.turn.index) out.push({ trigger, subject: state.players[state.turn.index]?.id || null });
          break;
        case "round":
          if (state.turn.round > before.turn.round) out.push({ trigger, subject: state.players[state.turn.dealer]?.id || null });
          break;
        case "gameOver":
          if (state.gameOver && !before.gameOver) out.push({ trigger, subject: state.gameOver.winners?.[0] || null });
          break;
        case "score": {
          const now = totals(state);
          const was = totals(before);
          const n = Number(trigger.n) || 0;
          for (const player of state.players) if ((was[player.id] ?? 0) < n && now[player.id] >= n) out.push({ trigger, subject: player.id });
          break;
        }
        case "counter": {
          const n = Number(trigger.n) || 0;
          const def = state.counterDefs.find((entry) => sameText(entry.name, trigger.counter));
          if (def) {
            for (const player of state.players) {
              const previous = playerById(before, player.id);
              if (!previous) continue;
              if ((Number(previous.counters?.[def.id]) || 0) < n && (Number(player.counters?.[def.id]) || 0) >= n) out.push({ trigger, subject: player.id });
            }
            break;
          }
          const tracker = state.tableCounters.find((entry) => sameText(entry.name, trigger.counter));
          const old = before.tableCounters.find((entry) => entry.id === tracker?.id);
          if (tracker && old && (Number(old.value) || 0) < n && (Number(tracker.value) || 0) >= n) out.push({ trigger, subject: actor || state.players[state.turn.index]?.id || null });
          break;
        }
        default: break;
      }
    }
    return out;
  }

  function runTriggers(before, state, actor, depth = 0) {
    if (!state.triggers?.length || depth > 4) return;
    const fired = firedTriggers(before, state, actor);
    if (!fired.length) return;
    const snapshot = clone(state);
    for (const { trigger, subject } of fired) {
      const macro = findMacro(state, trigger.macro);
      if (!macro) continue;
      pushLog(state, null, `⚡ ${trigger.label || describeTrigger(trigger, state)} → ${macro.label}`, "macro");
      try {
        runSteps(state, macro.steps, actor, { subject, winner: subject, depth: 1 });
      } catch (error) {
        pushLog(state, null, `⚠ ${macro.label} stopped: ${error.message}`, "warn");
      }
      checkGameOver(state);
    }
    runTriggers(snapshot, state, actor, depth + 1);
  }

  // --------------------------------------------------------------- game end

  /** End the game right away; the best total wins. */
  function endGameNow(state, reason = "the game was ended") {
    if (state.gameOver || !state.players.length) return;
    const t = totals(state);
    const values = state.players.map((player) => t[player.id]);
    const best = state.scores.lowWins ? Math.min(...values) : Math.max(...values);
    const winners = state.players.filter((player) => t[player.id] === best).map((player) => player.id);
    state.gameOver = { winners, reason, score: best, t: Date.now(), dismissed: false };
    state.lastWinner = winners[0];
    pushLog(state, null, `🏁 Game over, ${reason}: ${winners.map((id) => playerById(state, id)?.name).join(" & ")} win${winners.length > 1 ? "" : "s"} with ${fmt(best)}`, "round");
  }

  function checkGameOver(state) {
    if (state.gameOver || !state.players.length) return;
    const target = Number(state.scores.target) || 0;
    const maxRounds = Number(state.scores.maxRounds) || 0;
    const t = totals(state);
    const values = state.players.map((player) => t[player.id]);
    let reason = "";
    if (target > 0 && values.some((value) => value >= target)) reason = `${fmt(target)} reached`;
    else if (maxRounds > 0 && state.turn.round > maxRounds) reason = `${maxRounds} round${maxRounds === 1 ? "" : "s"} played`;
    if (!reason) return;
    const best = state.scores.lowWins ? Math.min(...values) : Math.max(...values);
    const winners = state.players.filter((player) => t[player.id] === best).map((player) => player.id);
    state.gameOver = { winners, reason, score: best, t: Date.now(), dismissed: false };
    state.lastWinner = winners[0];
    const names = winners.map((id) => playerById(state, id)?.name).join(" & ");
    pushLog(state, null, `🏁 Game over, ${reason}: ${names} win${winners.length > 1 ? "" : "s"} with ${fmt(best)}`, "round");
  }

  // ------------------------------------------------------------ sanitizing

  const PIP_DEFAULT = { A: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, T: 10, J: 10, Q: 10, K: 10 };

  function sanitizeRule(raw = {}) {
    const rule = {};
    if (!raw || typeof raw !== "object") return rule;
    if (RULE_WHO[raw.place] && raw.place !== "anyone") rule.place = raw.place;
    if (RULE_WHO[raw.take] && raw.take !== "anyone") rule.take = raw.take;
    if (RULE_ACCEPT[raw.accept] && raw.accept !== "any") rule.accept = raw.accept;
    if (RULE_ORDER[raw.order] && raw.order !== "any") rule.order = raw.order;
    if (RULE_MELD[raw.meld] && raw.meld !== "none") rule.meld = raw.meld;
    const cost = cleanText(raw.cost, 20, "");
    if (cost) rule.cost = cost;
    const phase = cleanText(raw.phase, 40, "");
    if (phase) rule.phase = phase;
    const first = cleanText(raw.first, 8, "");
    if (first) rule.first = first;
    const wild = (Array.isArray(raw.wild) ? raw.wild : String(raw.wild || "").split(",")).map((rank) => cleanText(rank, 12, "")).filter(Boolean).slice(0, 12);
    if (wild.length) rule.wild = wild;
    for (const flag of ["follow", "once", "advance", "flipTop", "aceHigh", "climb"]) if (raw[flag]) rule[flag] = true;
    if (RULE_SLAP[raw.slap] && raw.slap !== "none") {
      rule.slap = raw.slap;
      rule.slapTo = cleanText(raw.slapTo, 40, "") || "hand";
    }
    return rule;
  }

  function sanitizeScheme(state, raw = {}, keepId = true) {
    const num = (value, fallback = 0) => (value !== "" && value != null && Number.isFinite(Number(value)) ? Number(value) : fallback);
    const ranks = {};
    for (const rank of STD_RANKS) ranks[rank] = num(raw.ranks?.[rank], PIP_DEFAULT[rank]);
    const suits = {};
    for (const suit of STD_SUITS) suits[suit] = num(raw.suits?.[suit], 0);
    const id = keepId && /^[a-z0-9_-]{1,24}$/i.test(raw.id || "") ? raw.id : nextId(state, "s");
    return {
      id,
      name: cleanText(raw.name, 28, "Card points"),
      low: Boolean(raw.low),
      ranks,
      suits,
      joker: num(raw.joker),
      cards: cleanText(raw.cards, 240, ""),
      customValues: raw.customValues !== false,
      pair: num(raw.pair),
      trips: num(raw.trips),
      quads: num(raw.quads),
      run: num(raw.run),
      runMin: clampInt(raw.runMin, 2, 13, 3),
      runSuited: Boolean(raw.runSuited),
      flush: num(raw.flush),
      flushMin: clampInt(raw.flushMin, 2, 13, 5),
    };
  }

  function sanitizeTrigger(state, raw = {}, keepId = false) {
    return {
      id: keepId && /^[a-z0-9]{1,16}$/i.test(raw.id || "") ? raw.id : nextId(state, "g"),
      event: TRIGGER_EVENTS[raw.event] ? raw.event : "empty",
      zone: cleanText(raw.zone, 40, ""),
      n: clampInt(raw.n, 0, 100000, 0),
      phase: cleanText(raw.phase, 40, ""),
      card: cleanText(raw.card, 24, ""),
      counter: cleanText(raw.counter, 20, ""),
      during: cleanText(raw.during, 40, ""),
      macro: String(raw.macro || "").slice(0, 40),
      label: cleanText(raw.label, 60, ""),
      off: Boolean(raw.off),
    };
  }

  function sanitizeMeta(raw = {}) {
    const players = raw.players || {};
    const min = clampInt(players.min, 1, 12, 1);
    const max = Math.max(min, clampInt(players.max, 1, 12, 12));
    return {
      family: cleanText(raw.family, 24, ""),
      tagline: cleanText(raw.tagline, 90, ""),
      description: cleanText(raw.description, 400, ""),
      players: { min, max, default: Math.max(min, Math.min(max, clampInt(players.default, 1, 12, Math.min(max, 4)))) },
    };
  }

  /** Macros are referenced by id inside a table and by label inside saved designs. */
  function linkMacroRefs(state) {
    const toId = (ref) => findMacro(state, ref)?.id || ref;
    for (const trigger of state.triggers) trigger.macro = toId(trigger.macro);
    for (const macro of state.macros) for (const step of macro.steps) if (step.op === "runAction") step.macro = toId(step.macro);
  }

  function macroLabel(state, ref) {
    return findMacro(state, ref)?.label || ref;
  }

  // ---------------------------------------------------------------- reducer

  /**
   * Apply one action. `actor` is the player id acting (null = referee/god
   * mode, no play rules). `opts.strict` marks an untrusted guest: another
   * player's private cards are off limits no matter the rules mode.
   */
  function reduce(previous, action, actor = null, opts = {}) {
    if (!action || typeof action.type !== "string") throw new Error("Invalid action.");
    const state = clone(previous);
    const handler = HANDLERS[action.type];
    if (!handler) throw new Error("Unknown action: " + action.type);
    const result = handler(state, action, actor, opts || {});
    if (result && result.state) return result.state;
    checkGameOver(state);
    if (TRIGGERING.has(action.type) || (state.gameOver && !previous.gameOver)) runTriggers(previous, state, actor);
    state.rev = (state.rev || 0) + 1;
    return state;
  }

  const HANDLERS = {
    move(state, action, actor, opts) {
      const ids = resolveCards(state, action.cards);
      const target = state.zones[action.to];
      if (!ids.length || !target) return;
      const from = zoneOf(state, ids[0]);
      const sources = Array.from(new Set(ids.map((id) => zoneOf(state, id)).filter(Boolean)));
      const sameZone = ids.every((id) => zoneOf(state, id) === target);
      applyCheck(state, checkMove(state, ids, action.to, actor, opts), actor);
      const prices = sameZone || state.rulesMode === "off" ? [] : sources.filter((zone) => zone.rule?.cost && zone !== target).map((zone) => ({ zone, price: ids.filter((id) => zone.cards.includes(id)).reduce((sum, id) => sum + (Number(state.cards[id]?.value) || 0), 0) }));
      moveCards(state, ids, action.to, { index: action.index, face: action.face, x: action.x, y: action.y, by: actor, keepBy: sameZone });
      for (const { zone, price } of prices) {
        if (!price || !actor) continue;
        const def = state.counterDefs.find((entry) => sameText(entry.name, zone.rule.cost));
        const player = playerById(state, actor);
        if (def && player) player.counters[def.id] = (Number(player.counters[def.id]) || 0) - price;
        pushLog(state, actor, `Paid ${fmt(price)} ${zone.rule.cost}`, "chips");
      }
      if (!sameZone || action.log) {
        const visibleName = ids.length === 1 && state.cards[ids[0]].faceUp ? cardName(state.cards[ids[0]]) : `${ids.length} card${ids.length === 1 ? "" : "s"}`;
        pushLog(state, actor, `${visibleName}: ${zoneLabel(state, from)} → ${zoneLabel(state, target)}`);
      }
      if (sameZone) return;
      for (const zone of sources) {
        const top = state.cards[zone.cards[zone.cards.length - 1]];
        if (zone.rule?.flipTop && top && !top.faceUp) top.faceUp = true;
      }
      if (target.rule?.advance && actor && state.rulesMode !== "off") advanceTurn(state, 1);
    },

    flip(state, action, actor, opts) {
      const ids = resolveCards(state, action.cards);
      guardPrivate(state, ids.map((id) => zoneOf(state, id)), actor, opts);
      for (const id of ids) {
        const card = state.cards[id];
        card.faceUp = action.face === "up" ? true : action.face === "down" ? false : !card.faceUp;
        delete card.peek;
      }
      const shown = ids.filter((id) => state.cards[id].faceUp).map((id) => cardName(state.cards[id]));
      if (shown.length) pushLog(state, actor, `Revealed ${shown.join(" ")}`);
      else if (ids.length) pushLog(state, actor, `Turned ${ids.length} card${ids.length === 1 ? "" : "s"} face down`);
    },

    flipZone(state, action, actor, opts) {
      const zone = state.zones[action.zone];
      if (!zone) return;
      guardPrivate(state, [zone], actor, opts);
      const up = action.face ? action.face === "up" : !zone.cards.every((id) => state.cards[id].faceUp);
      zone.cards.forEach((id) => { state.cards[id].faceUp = up; delete state.cards[id].peek; });
      pushLog(state, actor, `${up ? "Revealed" : "Hid"} ${zoneLabel(state, zone)}`);
    },

    revealAll(state, action, actor) {
      for (const zone of Object.values(state.zones)) {
        if (zone.kind === "deck" || zone.visibility === "hidden") continue;
        if (action.key && zone.key !== action.key) continue;
        zone.cards.forEach((id) => { state.cards[id].faceUp = true; });
      }
      pushLog(state, actor, action.key ? `Showdown: revealed every ${action.key}` : "Showdown: revealed all hands");
    },

    peek(state, action, actor, opts) {
      if (!actor) return;
      const ids = resolveCards(state, action.cards);
      guardPrivate(state, ids.map((id) => zoneOf(state, id)), actor, opts);
      for (const id of ids) {
        const card = state.cards[id];
        card.peek = Array.from(new Set([...(card.peek || []), actor]));
      }
      pushLog(state, actor, `Peeked at ${ids.length} card${ids.length === 1 ? "" : "s"}`);
    },

    showTo(state, action, actor, opts) {
      const ids = resolveCards(state, action.cards);
      const viewer = playerById(state, action.player);
      if (!ids.length || !viewer) return;
      guardPrivate(state, ids.map((id) => zoneOf(state, id)), actor, opts);
      for (const id of ids) state.cards[id].peek = Array.from(new Set([...(state.cards[id].peek || []), viewer.id]));
      pushLog(state, actor, `Showed ${ids.length} card${ids.length === 1 ? "" : "s"} to ${viewer.name}`);
    },

    rotate(state, action) {
      for (const id of resolveCards(state, action.cards)) {
        const card = state.cards[id];
        card.rot = ((card.rot || 0) + (action.deg || 90)) % 360;
      }
    },

    mark(state, action) {
      for (const id of resolveCards(state, action.cards)) {
        if (!action.color || state.cards[id].mark === action.color) delete state.cards[id].mark;
        else state.cards[id].mark = action.color;
      }
    },

    shuffle(state, action, actor, opts) {
      const zone = state.zones[action.zone];
      if (!zone) return;
      guardPrivate(state, [zone], actor, opts);
      shuffleArray(zone.cards);
      if (action.faceDown) zone.cards.forEach((id) => { state.cards[id].faceUp = false; });
      pushLog(state, actor, `Shuffled ${zoneLabel(state, zone)}`);
    },

    cut(state, action, actor, opts) {
      const zone = state.zones[action.zone];
      if (!zone) return;
      guardPrivate(state, [zone], actor, opts);
      cutZone(zone, action.at);
      pushLog(state, actor, `Cut ${zoneLabel(state, zone)}`);
    },

    draw(state, action, actor, opts) {
      const from = action.from || findDeckZone(state)?.id;
      const to = action.to;
      if (!state.zones[from] || !state.zones[to]) throw new Error("Pick where to draw from and to.");
      guardPrivate(state, [state.zones[from]], actor, opts);
      if (!state.zones[from].cards.length) throw new Error(`${state.zones[from].name} is empty.`);
      dealCards(state, from, [to], clampInt(action.count, 1, 99, 1), action.face, actor);
    },

    drawBottom(state, action, actor, opts) {
      const from = state.zones[action.from];
      if (!from || !from.cards.length || !state.zones[action.to]) return;
      guardPrivate(state, [from], actor, opts);
      moveCards(state, [from.cards[0]], action.to, { face: action.face });
      pushLog(state, actor, `Took the bottom card of ${zoneLabel(state, from)}`);
    },

    deal(state, action, actor, opts) {
      guardPrivate(state, [state.zones[action.from]], actor, opts);
      const targets = Array.isArray(action.to) ? action.to.flatMap((ref) => resolveZones(state, ref, actor)) : resolveZones(state, action.to, actor);
      dealCards(state, action.from, targets, clampInt(action.count, 1, 60, 1), action.face, actor);
    },

    sort(state, action, actor, opts) {
      guardPrivate(state, [state.zones[action.zone]], actor, opts);
      sortZone(state, action.zone, action.by);
    },

    arrange(state, action, actor, opts) {
      const zone = state.zones[action.zone];
      if (!zone) return;
      guardPrivate(state, [zone], actor, opts);
      const ids = resolveCards(state, action.cards);
      if (ids.length !== zone.cards.length || !ids.every((id) => zone.cards.includes(id))) return;
      zone.cards = ids;
    },

    clearZone(state, action, actor, opts) {
      const zone = state.zones[action.zone];
      const target = state.zones[action.to] || findDeckZone(state);
      if (!zone || !target || zone === target) return;
      guardPrivate(state, [zone], actor, opts);
      const count = zone.cards.length;
      moveCards(state, zone.cards.slice(), target.id, { face: action.face });
      pushLog(state, actor, `Moved ${count} from ${zoneLabel(state, zone)} → ${zoneLabel(state, target)}`);
    },

    collect(state, action, actor) {
      const target = state.zones[action.to] || findDeckZone(state);
      if (!target) return;
      returnAllTo(state, target.id, { shuffle: action.shuffle !== false });
      pushLog(state, actor, `Collected every card into ${zoneLabel(state, target)}${action.shuffle !== false ? " and shuffled" : ""}`);
    },

    rebuildDeck(state, action, actor) {
      if (action.spec) state.deckSpec = normalizeDeckSpec(action.spec);
      const target = findDeckZone(state);
      if (!target) throw new Error("Add a deck group first.");
      for (const zone of Object.values(state.zones)) zone.cards = [];
      state.cards = {};
      placeNewCards(state, buildCards(state, state.deckSpec));
      pushLog(state, actor, `New deck: ${Object.keys(state.cards).length} cards, shuffled`);
    },

    addCards(state, action, actor) {
      const target = state.zones[action.to] || findDeckZone(state);
      if (!target) return;
      const list = Array.isArray(action.cards) ? action.cards.slice(0, 60) : [];
      for (const raw of list) {
        let card;
        if (raw.custom) {
          card = customCard(state, raw);
        } else if (STD_RANKS.includes(raw.rank) && STD_SUITS.includes(raw.suit)) {
          card = { id: nextId(state, "k"), rank: raw.rank, suit: raw.suit, deck: 9, faceUp: false };
        } else if (raw.rank === "JK") {
          card = { id: nextId(state, "k"), rank: "JK", suit: "x", deck: 9, faceUp: false, jokerColor: raw.jokerColor || "black" };
        } else continue;
        state.cards[card.id] = card;
        target.cards.push(card.id);
        applyFace(card, target, action.face);
      }
      pushLog(state, actor, `Added ${list.length} card${list.length === 1 ? "" : "s"} to ${zoneLabel(state, target)}`);
    },

    removeCards(state, action, actor, opts) {
      const ids = resolveCards(state, action.cards);
      guardPrivate(state, ids.map((id) => zoneOf(state, id)), actor, opts);
      for (const id of ids) {
        detach(state, id);
        delete state.cards[id];
      }
      pushLog(state, actor, `Removed ${ids.length} card${ids.length === 1 ? "" : "s"} from the game`);
    },

    // ------------------------------------------------------------- zones
    addZone(state, action, actor) {
      const template = { ...action.zone };
      if (action.perPlayer) {
        const tpl = { ...clone(ZONE_DEFAULTS), ...template, key: template.key || slug(template.name || "group", state) };
        state.seatTemplate.push(tpl);
        for (const player of state.players) makeZone(state, player.id, tpl);
        pushLog(state, actor, `Added “${tpl.name}” to every seat`);
        return;
      }
      const area = action.area && (action.area === "table" || playerById(state, action.area)) ? action.area : "table";
      const zone = makeZone(state, area, template);
      if (action.cards?.length) moveCards(state, resolveCards(state, action.cards), zone.id, {});
      pushLog(state, actor, `New group “${zone.name}” on ${areaLabel(state, area)}`);
    },

    updateZone(state, action) {
      const zone = state.zones[action.zone];
      if (!zone) return;
      const patch = sanitizeZonePatch(action.patch || {});
      const targets = action.allSeats && zone.key && zone.area !== "table"
        ? Object.values(state.zones).filter((other) => other.key === zone.key && other.area !== "table")
        : [zone];
      for (const target of targets) Object.assign(target, clone(patch));
      if (action.allSeats && zone.key) {
        const tpl = state.seatTemplate.find((entry) => entry.key === zone.key);
        if (tpl) Object.assign(tpl, clone(patch));
      }
    },

    removeZone(state, action, actor) {
      const zone = state.zones[action.zone];
      if (!zone) return;
      const targets = action.allSeats && zone.key && zone.area !== "table"
        ? Object.values(state.zones).filter((other) => other.key === zone.key && other.area !== "table")
        : [zone];
      if (action.allSeats) state.seatTemplate = state.seatTemplate.filter((tpl) => tpl.key !== zone.key);
      const deck = findDeckZone(state);
      for (const target of targets) {
        if (deck && deck.id !== target.id) moveCards(state, target.cards.slice(), deck.id, { face: "down" });
        delete state.zones[target.id];
      }
      pushLog(state, actor, `Removed group “${zone.name}”`);
    },

    reorderZone(state, action) {
      const zone = state.zones[action.zone];
      if (!zone) return;
      const siblings = orderedZones(state, zone.area);
      const index = siblings.indexOf(zone);
      const swap = siblings[index + (action.dir < 0 ? -1 : 1)];
      if (!swap) return;
      [zone.order, swap.order] = [swap.order, zone.order];
    },

    // ----------------------------------------------------------- players
    addPlayer(state, action, actor) {
      if (state.players.length >= 12) throw new Error("12 seats is the maximum.");
      const player = createPlayer(state, { name: action.name, color: action.color, clientId: action.clientId });
      state.counterDefs.forEach((def) => { player.counters[def.id] = def.start; });
      pushLog(state, actor, `${player.name} sat down`);
      return player;
    },

    removePlayer(state, action, actor) {
      const index = state.players.findIndex((player) => player.id === action.player);
      if (index < 0) return;
      const [player] = state.players.splice(index, 1);
      const deck = findDeckZone(state);
      for (const zone of Object.values(state.zones)) {
        if (zone.area !== player.id) continue;
        if (deck) moveCards(state, zone.cards.slice(), deck.id, { face: "down" });
        delete state.zones[zone.id];
      }
      for (const round of state.scores.rounds) delete round.scores[player.id];
      const n = state.players.length;
      if (state.turn.index >= index && state.turn.index > 0) state.turn.index -= 1;
      if (state.turn.dealer >= index && state.turn.dealer > 0) state.turn.dealer -= 1;
      state.turn.index = n ? Math.min(state.turn.index, n - 1) : 0;
      state.turn.dealer = n ? Math.min(state.turn.dealer, n - 1) : 0;
      pushLog(state, actor, `${player.name} left the table`);
    },

    updatePlayer(state, action) {
      const player = playerById(state, action.player);
      if (!player) return;
      const patch = action.patch || {};
      if ("name" in patch) player.name = cleanText(patch.name, 24, player.name);
      if ("color" in patch && /^#[0-9a-f]{6}$/i.test(patch.color)) player.color = patch.color;
      if ("out" in patch) player.out = Boolean(patch.out);
      if ("note" in patch) player.note = cleanText(patch.note, 120, "");
      if ("bot" in patch) player.bot = Boolean(patch.bot);
      if ("botStyle" in patch) player.botStyle = BOT_STYLES[patch.botStyle] ? patch.botStyle : "";
      if ("team" in patch) player.team = cleanText(patch.team, 16, "");
    },

    movePlayer(state, action) {
      const index = state.players.findIndex((player) => player.id === action.player);
      const target = index + (action.dir < 0 ? -1 : 1);
      if (index < 0 || target < 0 || target >= state.players.length) return;
      const currentId = state.players[state.turn.index]?.id;
      const dealerId = state.players[state.turn.dealer]?.id;
      [state.players[index], state.players[target]] = [state.players[target], state.players[index]];
      state.turn.index = Math.max(0, state.players.findIndex((player) => player.id === currentId));
      state.turn.dealer = Math.max(0, state.players.findIndex((player) => player.id === dealerId));
    },

    claimSeat(state, action, actor) {
      const player = playerById(state, action.player);
      if (!player) return;
      for (const other of state.players) if (other.clientId === action.clientId) other.clientId = null;
      player.clientId = action.clientId || null;
      if (action.name) player.name = cleanText(action.name, 24, player.name);
      pushLog(state, null, `${player.name} took seat ${state.players.indexOf(player) + 1}`);
    },

    releaseSeat(state, action) {
      for (const player of state.players) if (player.clientId === action.clientId) player.clientId = null;
    },

    // -------------------------------------------------------------- turn
    setTurn(state, action) {
      if (Number.isInteger(action.index)) state.turn.index = clampInt(action.index, 0, Math.max(0, state.players.length - 1), 0);
      if (Number.isInteger(action.dealer)) state.turn.dealer = clampInt(action.dealer, 0, Math.max(0, state.players.length - 1), 0);
      if (action.who) setTurnTo(state, action.who);
    },
    nextTurn(state, action) { advanceTurn(state, action.back ? -1 : 1); },
    passDeal(state, action, actor) {
      passDeal(state);
      setTurnTo(state, "next");
      pushLog(state, actor, `${state.players[state.turn.dealer]?.name || "Next player"} deals`);
    },
    reverseDirection(state, action, actor) {
      state.turn.dir = (state.turn.dir || 1) * -1;
      pushLog(state, actor, `Play direction: ${state.turn.dir > 0 ? "clockwise" : "counter-clockwise"}`);
    },
    nextRound(state, action, actor) { nextRound(state, actor); },
    setPhase(state, action) { state.turn.phase = cleanText(action.phase, 40, ""); },
    setPhases(state, action) {
      state.phases = (action.phases || []).map((phase) => cleanText(phase, 40, "")).filter(Boolean).slice(0, 16);
    },
    nextPhase(state, action, actor) {
      if (!state.phases.length) return;
      const index = state.phases.indexOf(state.turn.phase);
      state.turn.phase = state.phases[(index + 1) % state.phases.length];
      pushLog(state, actor, `Phase: ${state.turn.phase}`, "round");
    },

    // ------------------------------------------------------------ scores
    adjustScore(state, action, actor) {
      addScore(state, action.player, action.delta, actor, action.reason || "");
    },
    setRoundScore(state, action) {
      const round = state.scores.rounds.find((entry) => entry.id === action.round);
      if (!round || !playerById(state, action.player)) return;
      const value = Number(action.value);
      if (action.value === "" || !Number.isFinite(value)) delete round.scores[action.player];
      else round.scores[action.player] = value;
    },
    renameRound(state, action) {
      const round = state.scores.rounds.find((entry) => entry.id === action.round);
      if (round) round.label = cleanText(action.label, 24, round.label);
    },
    addRound(state) {
      state.scores.rounds.push({ id: nextId(state, "r"), label: `Round ${state.scores.rounds.length + 1}`, scores: {} });
    },
    deleteRound(state, action) {
      state.scores.rounds = state.scores.rounds.filter((round) => round.id !== action.round);
      currentRound(state);
    },
    resetScores(state, action, actor) {
      state.scores.rounds = [{ id: nextId(state, "r"), label: "Round 1", scores: {} }];
      state.gameOver = null;
      pushLog(state, actor, "Scores reset", "score");
    },
    scoreConfig(state, action) {
      if ("target" in action) state.scores.target = Math.max(0, Number(action.target) || 0);
      if ("lowWins" in action) state.scores.lowWins = Boolean(action.lowWins);
      if ("label" in action) state.scores.label = cleanText(action.label, 20, "Points");
      if ("pegTarget" in action) state.pegTarget = Math.max(0, Number(action.pegTarget) || 0);
      if ("maxRounds" in action) state.scores.maxRounds = clampInt(action.maxRounds, 0, 999, 0);
      state.gameOver = null;
    },
    dismissGameOver(state) {
      if (state.gameOver) state.gameOver.dismissed = true;
    },

    // ------------------------------------------------------------- chips
    bet(state, action, actor) {
      const player = playerById(state, action.player);
      const amount = Number(action.amount);
      if (!player || !Number.isFinite(amount) || amount <= 0) return;
      player.chips -= amount;
      state.pot += amount;
      pushLog(state, actor, `${player.name} puts ${fmt(amount)} in the pot`, "chips");
    },
    award(state, action, actor) {
      const ids = (action.players || [action.player]).filter((id) => playerById(state, id));
      if (!ids.length || state.pot <= 0) return;
      const total = action.amount ? Math.min(state.pot, Number(action.amount)) : state.pot;
      const share = Math.floor((total / ids.length) * 100) / 100;
      let remainder = Math.round((total - share * ids.length) * 100) / 100;
      for (const id of ids) {
        const player = playerById(state, id);
        player.chips += share + (remainder > 0 ? remainder : 0);
        remainder = 0;
      }
      state.pot = Math.round((state.pot - total) * 100) / 100;
      pushLog(state, actor, `${ids.map((id) => playerById(state, id).name).join(" & ")} ${ids.length > 1 ? "split" : "wins"} ${fmt(total)}`, "chips");
    },
    setChips(state, action) {
      const player = playerById(state, action.player);
      const value = Number(action.value);
      if (player && Number.isFinite(value)) player.chips = value;
    },
    transfer(state, action, actor) {
      const from = playerById(state, action.from);
      const to = playerById(state, action.to);
      const amount = Number(action.amount);
      if (!from || !to || !Number.isFinite(amount) || amount <= 0) return;
      from.chips -= amount;
      to.chips += amount;
      pushLog(state, actor, `${from.name} pays ${to.name} ${fmt(amount)}`, "chips");
    },
    setPot(state, action) {
      const value = Number(action.value);
      if (Number.isFinite(value)) state.pot = Math.max(0, value);
    },
    chipConfig(state, action, actor) {
      state.chipStart = Math.max(0, Number(action.start) || 0);
      if (action.resetAll) {
        state.players.forEach((player) => { player.chips = state.chipStart; });
        state.pot = 0;
        pushLog(state, actor, `Stacks reset to ${fmt(state.chipStart)}`, "chips");
      }
    },

    // ----------------------------------------------------------- counters
    addCounter(state, action) {
      const name = cleanText(action.name, 20, "Counter");
      if (action.scope === "table") {
        state.tableCounters.push({ id: nextId(state, "t"), name, value: Number(action.start) || 0 });
        return;
      }
      const def = { id: nextId(state, "c"), name, start: Number(action.start) || 0 };
      state.counterDefs.push(def);
      state.players.forEach((player) => { player.counters[def.id] = def.start; });
    },
    removeCounter(state, action) {
      state.counterDefs = state.counterDefs.filter((def) => def.id !== action.id);
      state.tableCounters = state.tableCounters.filter((def) => def.id !== action.id);
      state.players.forEach((player) => { delete player.counters[action.id]; });
    },
    slap(state, action, actor, opts) {
      const zone = state.zones[action.zone];
      if (!zone?.rule?.slap) throw new Error("That pile can't be slapped.");
      // Guests always slap as themselves; a shared screen can name the slapper.
      const player = playerById(state, opts.strict ? actor : action.player || actor);
      if (!player) throw new Error("Pick a seat to slap with.");
      const topId = zone.cards[zone.cards.length - 1];
      // Two players slapped the same card: the later slap just missed, no penalty.
      if (action.top !== undefined && action.top !== topId) {
        pushLog(state, player.id, `${player.name} slapped too late`, "info");
        return;
      }
      const home = resolveZones(state, `${zone.rule.slapTo || "hand"}@p:${player.id}`)[0];
      const reason = slapReason(state, zone);
      if (reason) {
        const won = zone.cards.slice();
        if (home) {
          moveCards(state, won, home, { index: 0 });
          player.out = false;
        }
        pushLog(state, player.id, `👋 ${player.name} slapped ${reason} and takes ${won.length} card${won.length === 1 ? "" : "s"}`, "move");
        state.turn.index = state.players.indexOf(player);
        state.lastWinner = player.id;
        return;
      }
      const burn = home ? state.zones[home].cards[state.zones[home].cards.length - 1] : null;
      if (burn) moveCards(state, [burn], zone.id, { index: 0, face: "up" });
      pushLog(state, player.id, `✋ ${player.name} slapped wrong${burn ? " and burns a card under the pile" : ""}`, "warn");
    },
    counter(state, action) {
      const delta = Number(action.delta) || 0;
      const set = action.value !== undefined ? Number(action.value) : null;
      if (action.player) {
        const player = playerById(state, action.player);
        if (!player) return;
        player.counters[action.id] = set !== null && Number.isFinite(set) ? set : (Number(player.counters[action.id]) || 0) + delta;
      } else {
        const tracker = state.tableCounters.find((entry) => entry.id === action.id);
        if (tracker) tracker.value = set !== null && Number.isFinite(set) ? set : tracker.value + delta;
      }
    },

    // -------------------------------------------------------------- macros
    runMacro(state, action, actor) {
      const macro = action.steps ? { label: "Quick action", steps: action.steps } : findMacro(state, action.id);
      if (!macro) throw new Error("That action no longer exists.");
      // "Must play if able": the can't-play action (e.g. Draw) is only for players with no legal play.
      if (state.mustPlay && actor && macro.id && macro.id === state.botFallback && state.players[state.turn.index]?.id === actor && legalPlays(state, actor).length) {
        applyCheck(state, { hard: [], soft: [`You have a legal play, so you can't ${macro.label.toLowerCase()} yet.`] }, actor);
      }
      pushLog(state, actor, `▶ ${macro.label}`, "macro");
      runSteps(state, macro.steps, actor, {});
    },
    saveMacro(state, action) {
      const macro = action.macro || {};
      const clean = {
        id: macro.id && state.macros.some((entry) => entry.id === macro.id) ? macro.id : nextId(state, "m"),
        label: cleanText(macro.label, 28, "Action"),
        hint: cleanText(macro.hint, 80, ""),
        steps: (macro.steps || []).filter((step) => step && MACRO_OPS[step.op]).slice(0, 40).map((step) => clone(step)),
      };
      const index = state.macros.findIndex((entry) => entry.id === clean.id);
      if (index >= 0) state.macros[index] = clean;
      else state.macros.push(clean);
    },
    deleteMacro(state, action) {
      state.macros = state.macros.filter((entry) => entry.id !== action.id);
      state.triggers = state.triggers.filter((trigger) => trigger.macro !== action.id);
      if (state.botFallback === action.id) state.botFallback = "";
    },

    // ------------------------------------------------------ rules & design
    setRules(state, action, actor) {
      if (!RULES_MODES[action.mode]) return;
      state.rulesMode = action.mode;
      pushLog(state, actor, `Play rules: ${RULES_MODES[action.mode].toLowerCase()}`);
    },
    setBotFallback(state, action) {
      state.botFallback = findMacro(state, action.macro)?.id || "";
      if ("playsPerTurn" in action) state.playsPerTurn = Number(action.playsPerTurn) === 0 ? 0 : 1;
      if ("mustPlay" in action) state.mustPlay = Boolean(action.mustPlay);
    },
    setGuestMode(state, action) {
      if (action.mode === "play" || action.mode === "full") state.guestMode = action.mode;
    },
    saveTrigger(state, action) {
      const trigger = sanitizeTrigger(state, action.trigger || {}, true);
      trigger.macro = findMacro(state, trigger.macro)?.id || "";
      if (!trigger.macro) throw new Error("Pick an action for the trigger to run.");
      const index = state.triggers.findIndex((entry) => entry.id === trigger.id);
      if (index >= 0) state.triggers[index] = trigger;
      else state.triggers.push(trigger);
    },
    deleteTrigger(state, action) {
      state.triggers = state.triggers.filter((entry) => entry.id !== action.id);
    },
    saveScheme(state, action) {
      const scheme = sanitizeScheme(state, action.scheme || {}, true);
      const index = state.schemes.findIndex((entry) => entry.id === scheme.id);
      if (index >= 0) state.schemes[index] = scheme;
      else state.schemes.push(scheme);
      return { scheme };
    },
    deleteScheme(state, action) {
      state.schemes = state.schemes.filter((entry) => entry.id !== action.id);
      const spec = "points:" + action.id;
      for (const zone of Object.values(state.zones)) zone.evals = zone.evals.filter((entry) => entry.split("@")[0] !== spec);
      for (const tpl of state.seatTemplate) tpl.evals = (tpl.evals || []).filter((entry) => entry.split("@")[0] !== spec);
    },
    setMeta(state, action) {
      state.meta = sanitizeMeta({ ...state.meta, ...(action.meta || {}) });
    },
    /** Put specific cards ("As Kd 7h", custom labels) into a group to set up a test scenario. */
    pullCards(state, action, actor) {
      const target = state.zones[action.to];
      if (!target) throw new Error("Pick a group to set up.");
      const wanted = (Array.isArray(action.specs) ? action.specs : String(action.specs || "").split(/[\s,]+/)).map((spec) => String(spec).trim()).filter(Boolean).slice(0, 60);
      const deck = findDeckZone(state);
      const order = [deck, ...orderedZones(state, "table").filter((zone) => zone !== deck), ...Object.values(state.zones).filter((zone) => zone.area !== "table")].filter(Boolean);
      const picked = [];
      const missing = [];
      for (const spec of wanted) {
        const parsed = parseCardSpec(spec);
        const found = order.flatMap((zone) => zone.cards.slice().reverse()).find((id) => {
          if (picked.includes(id) || target.cards.includes(id)) return false;
          const card = state.cards[id];
          if (parsed?.joker) return card.rank === "JK";
          if (parsed) return !card.custom && card.rank === parsed.rank && card.suit === parsed.suit;
          return card.custom && (sameText(card.label, spec) || sameText(card.rank, spec));
        });
        if (found) picked.push(found);
        else missing.push(spec);
      }
      if (!picked.length) throw new Error(missing.length ? `Couldn't find ${missing.join(", ")} outside ${target.name}.` : "List the cards to pull, e.g. As Kd 7h.");
      moveCards(state, picked, target.id, { face: action.face || undefined });
      pushLog(state, actor, `Set up ${zoneLabel(state, target)}: ${picked.map((id) => cardName(state.cards[id])).join(" ")}${missing.length ? ` (missing ${missing.join(", ")})` : ""}`);
    },
    moveMacro(state, action) {
      const index = state.macros.findIndex((entry) => entry.id === action.id);
      const target = index + (action.dir < 0 ? -1 : 1);
      if (index < 0 || target < 0 || target >= state.macros.length) return;
      [state.macros[index], state.macros[target]] = [state.macros[target], state.macros[index]];
    },

    // --------------------------------------------------------------- misc
    setTitle(state, action) { state.title = cleanText(action.title, 48, state.title); },
    setNotes(state, action) { state.notes = String(action.notes || "").slice(0, 20000); },
    chat(state, action, actor) {
      const text = cleanText(action.text, 240, "");
      if (text) pushLog(state, actor, text, "chat");
    },
    feedback(state, action, actor) {
      const text = cleanText(action.text, 400, "");
      if (text) pushLog(state, actor, "💡 " + text, "feedback");
    },
    linkDesign(state, action) {
      state.designId = action.id ? String(action.id).slice(0, 60) : null;
    },
    roll(state, action, actor) {
      const sides = clampInt(action.sides, 2, 1000, 6);
      const count = clampInt(action.count, 1, 20, 1);
      const rolls = Array.from({ length: count }, () => 1 + Math.floor(rng() * sides));
      const total = rolls.reduce((a, b) => a + b, 0);
      state.lastRoll = { sides, rolls, total, t: Date.now() };
      pushLog(state, actor, `🎲 ${count}d${sides}: ${rolls.join(", ")}${count > 1 ? " = " + total : ""}`, "roll");
    },
    coin(state, action, actor) {
      const result = rng() < 0.5 ? "Heads" : "Tails";
      state.lastRoll = { coin: result, t: Date.now() };
      pushLog(state, actor, `Coin flip: ${result}`, "roll");
    },
    randomPlayer(state, action, actor) {
      const active = state.players.filter((player) => !player.out);
      if (!active.length) return;
      const pick = active[Math.floor(rng() * active.length)];
      pushLog(state, actor, `Random pick: ${pick.name}`, "roll");
    },
    load(state, action) {
      const next = migrate(action.state);
      next.rev = (state.rev || 0) + 1;
      return { state: next };
    },
  };

  function sanitizeZonePatch(patch) {
    const out = {};
    if ("name" in patch) out.name = cleanText(patch.name, 32, "Group");
    if ("kind" in patch && ["deck", "hand", "board", "pile", "discard", "free", "row"].includes(patch.kind)) out.kind = patch.kind;
    if ("layout" in patch && ["fan", "spread", "stack", "free", "grid", "overlap"].includes(patch.layout)) out.layout = patch.layout;
    if ("visibility" in patch && ["public", "owner", "hidden"].includes(patch.visibility)) out.visibility = patch.visibility;
    if ("face" in patch && ["up", "down", "keep"].includes(patch.face)) out.face = patch.face;
    if ("evals" in patch && Array.isArray(patch.evals)) out.evals = patch.evals.map(String).slice(0, 6);
    if ("ctx" in patch && patch.ctx && typeof patch.ctx === "object") out.ctx = clone(patch.ctx);
    if ("limit" in patch) out.limit = clampInt(patch.limit, 0, 200, 0);
    if ("note" in patch) out.note = cleanText(patch.note, 140, "");
    if ("locked" in patch) out.locked = Boolean(patch.locked);
    if ("collapsed" in patch) out.collapsed = Boolean(patch.collapsed);
    if ("wide" in patch) out.wide = Boolean(patch.wide);
    if ("key" in patch) out.key = cleanText(patch.key, 24, "").toLowerCase().replace(/[^a-z0-9-]/g, "-");
    if ("rule" in patch) out.rule = sanitizeRule(patch.rule);
    return out;
  }

  function slug(name, state) {
    const base = String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "group";
    const used = new Set(Object.values(state.zones).map((zone) => zone.key).concat(state.seatTemplate.map((tpl) => tpl.key)));
    let key = base;
    let n = 2;
    while (used.has(key)) { key = `${base}-${n}`; n += 1; }
    return key;
  }

  function fmt(value) {
    const n = Number(value) || 0;
    return Number.isInteger(n) ? String(n) : n.toFixed(2);
  }

  function migrate(raw) {
    if (!raw || typeof raw !== "object" || !raw.zones || !raw.cards || !Array.isArray(raw.players)) {
      throw new Error("That file is not a saved card table.");
    }
    const state = { ...emptyState(), ...clone(raw) };
    state.turn = { ...emptyState().turn, ...(raw.turn || {}) };
    state.scores = { ...emptyState().scores, ...(raw.scores || {}) };
    if (!state.scores.rounds.length) state.scores.rounds = [{ id: nextId(state, "r"), label: "Round 1", scores: {} }];
    for (const zone of Object.values(state.zones)) {
      Object.assign(zone, { ...clone(ZONE_DEFAULTS), ...zone });
      zone.cards = zone.cards.filter((id) => state.cards[id]);
      zone.rule = sanitizeRule(zone.rule);
    }
    state.triggers = (Array.isArray(state.triggers) ? state.triggers : []).map((trigger) => sanitizeTrigger(state, trigger, true));
    state.schemes = (Array.isArray(state.schemes) ? state.schemes : []).map((scheme) => sanitizeScheme(state, scheme, true));
    state.meta = sanitizeMeta(state.meta || {});
    if (!RULES_MODES[state.rulesMode]) state.rulesMode = "warn";
    if (state.guestMode !== "full") state.guestMode = "play";
    for (const player of state.players) {
      player.counters = player.counters || {};
      player.chips = Number(player.chips) || 0;
      player.bot = Boolean(player.bot);
      player.botStyle = BOT_STYLES[player.botStyle] ? player.botStyle : "";
      player.team = cleanText(player.team, 16, "");
    }
    return state;
  }

  /** Extract a reusable game design (no cards in play) from a table. */
  function toPreset(state) {
    const table = orderedZones(state, "table").map(templateFrom);
    return {
      id: "custom-" + Date.now().toString(36),
      name: state.title,
      family: state.meta?.family || "Custom",
      custom: true,
      tagline: state.meta?.tagline || "",
      description: state.meta?.description || (state.notes || "").split("\n")[0].slice(0, 140) || "Custom game design",
      players: { min: state.meta?.players?.min || 1, max: state.meta?.players?.max || 12, default: state.players.length || state.meta?.players?.default || 2 },
      deck: clone(state.deckSpec),
      table,
      seat: clone(state.seatTemplate),
      macros: state.macros.map(({ id, ...rest }) => ({
        ...clone(rest),
        steps: rest.steps.map((step) => (step.op === "runAction" ? { ...clone(step), macro: macroLabel(state, step.macro) } : clone(step))),
      })),
      phases: clone(state.phases),
      counters: state.counterDefs.map((def) => ({ name: def.name, start: def.start })),
      tableCounters: state.tableCounters.map((def) => ({ name: def.name, value: def.value })),
      triggers: state.triggers.map(({ id, ...rest }) => ({ ...clone(rest), macro: macroLabel(state, rest.macro) })),
      schemes: clone(state.schemes),
      rulesMode: state.rulesMode,
      botFallback: state.botFallback ? macroLabel(state, state.botFallback) : "",
      playsPerTurn: state.playsPerTurn === 0 ? 0 : 1,
      mustPlay: Boolean(state.mustPlay),
      meta: clone(state.meta),
      scoring: { target: state.scores.target, rounds: state.scores.maxRounds, lowWins: state.scores.lowWins, label: state.scores.label, chips: state.chipStart, peg: state.pegTarget },
      rules: state.notes,
    };
  }

  const LAYOUT_WORD = { fan: "fanned hand", spread: "row", overlap: "overlapping row", stack: "stack", grid: "grid", free: "free-placement area" };
  const VIS_WORD = { owner: "private to its owner", public: "public", hidden: "hidden" };

  function evalName(state, spec) {
    const [id, board] = String(spec).split("@");
    if (id.startsWith("points:")) return (state.schemes.find((entry) => entry.id === id.slice(7))?.name || "custom points") + (board ? ` vs ${board}` : "");
    const def = (evaluators()?.EVALUATORS || []).find((entry) => entry.id === id);
    return (def ? def.label : id) + (board ? ` vs ${board}` : "");
  }

  function describeZone(state, zone) {
    const bits = [`${LAYOUT_WORD[zone.layout] || zone.layout}, ${VIS_WORD[zone.visibility] || zone.visibility}`];
    if (zone.face === "up" || zone.face === "down") bits.push(`cards arrive face ${zone.face}`);
    if (zone.limit) bits.push(`holds at most ${zone.limit} card${zone.limit === 1 ? "" : "s"}`);
    if (zone.evals?.length) bits.push(`scored as ${zone.evals.map((spec) => evalName(state, spec)).join(" + ")}`);
    const rule = describeRule(zone.rule, zone);
    if (rule) bits.push(rule);
    return `- **${zone.name}**: ${bits.join("; ")}.${zone.note ? " " + zone.note : ""}`;
  }

  /** A Markdown rules draft generated from the table's setup. */
  function describeGame(state) {
    const lines = [];
    const meta = state.meta || {};
    const spec = normalizeDeckSpec(state.deckSpec);
    const deckInfo = DECK_PRESETS[spec.preset] || DECK_PRESETS.standard;
    lines.push(`# ${state.title}`);
    if (meta.tagline) lines.push("", `_${meta.tagline}_`);
    if (meta.description) lines.push("", meta.description);
    const players = meta.players || {};
    lines.push("", "## Players", `- ${players.min && players.max ? (players.min === players.max ? players.min : `${players.min}–${players.max}`) : state.players.length} players.`);
    lines.push("", "## Components");
    const ranksNote = spec.ranks?.length ? ` using only ${spec.ranks.map((rank) => (rank === "T" ? "10" : rank)).join(", ")}` : "";
    if (deckInfo.ranks.length || spec.ranks?.length) {
      lines.push(`- ${spec.decks > 1 ? spec.decks + " × " : ""}${deckInfo.label}${ranksNote}${spec.suits.length < 4 ? ` in ${spec.suits.map(suitWord).join(", ")}` : ""}.`);
    }
    if (spec.jokers) lines.push(`- ${spec.jokers} joker${spec.jokers === 1 ? "" : "s"}.`);
    for (const item of spec.custom.slice(0, 30)) {
      const tags = [item.suit, item.rank && item.rank !== item.label ? item.rank : "", item.value ? `worth ${fmt(item.value)}` : ""].filter(Boolean).join(", ");
      lines.push(`- ${item.count} × **${item.label}**${tags ? ` (${tags})` : ""}${item.text ? `: ${item.text}` : ""}`);
    }
    lines.push(`- ${deckSize(spec)} cards in total.`);
    if (state.chipStart) lines.push(`- Chips: everyone starts with ${fmt(state.chipStart)}.`);
    if (state.counterDefs.length) lines.push(`- Player counters: ${state.counterDefs.map((def) => def.name).join(", ")}.`);
    if (state.tableCounters.length) lines.push(`- Table trackers: ${state.tableCounters.map((def) => def.name).join(", ")}.`);
    const tableZones = orderedZones(state, "table");
    if (tableZones.length) lines.push("", "## The table", ...tableZones.map((zone) => describeZone(state, zone)));
    if (state.seatTemplate.length) lines.push("", "## Each player has", ...state.seatTemplate.map((zone) => describeZone(state, zone)));
    if (state.phases.length) lines.push("", "## Turn structure", `- Phases: ${state.phases.join(" → ")}.`);
    if (state.macros.length) {
      lines.push("", "## Actions");
      state.macros.forEach((macro, index) => {
        lines.push(`${index + 1}. **${macro.label}**${macro.hint ? ` (${macro.hint})` : ""}: ${macro.steps.map((step) => describeStep(step, state)).join("; ")}.`);
      });
    }
    if (state.triggers.length) {
      lines.push("", "## Automatic rules");
      for (const trigger of state.triggers) lines.push(`- ${trigger.label || describeTrigger(trigger, state)}: ${macroLabel(state, trigger.macro)}${trigger.off ? " (off)" : ""}.`);
    }
    lines.push("", "## Scoring");
    const scoring = [];
    if (state.scores.target) scoring.push(`The game ends when someone reaches ${fmt(state.scores.target)} ${state.scores.label.toLowerCase()}.`);
    if (state.scores.maxRounds) scoring.push(`The game ends after ${state.scores.maxRounds} rounds.`);
    scoring.push(state.scores.lowWins ? "The lowest total wins." : "The highest total wins.");
    lines.push(...scoring.map((line) => `- ${line}`));
    for (const scheme of state.schemes) lines.push(`- **${scheme.name}**: ${describeScheme(scheme)}`);
    lines.push("", `_Rule checks: ${{ off: "off", warn: "warn (broken rules are logged)", enforce: "enforced (illegal plays are refused)" }[state.rulesMode]}._`);
    return lines.join("\n");
  }

  function describeScheme(scheme) {
    const parts = [];
    const ranks = STD_RANKS.map((rank) => `${rank === "T" ? "10" : rank}=${fmt(scheme.ranks[rank])}`);
    const pipDefault = STD_RANKS.every((rank) => scheme.ranks[rank] === PIP_DEFAULT[rank]);
    parts.push(pipDefault ? "cards count their pips (faces 10, aces 1)" : `card values ${ranks.join(", ")}`);
    const suits = STD_SUITS.filter((suit) => scheme.suits[suit]).map((suit) => `${suitWord(suit)} ${signed(scheme.suits[suit])}`);
    if (suits.length) parts.push(`suit bonus: ${suits.join(", ")}`);
    if (scheme.cards) parts.push(`specific cards: ${scheme.cards}`);
    if (scheme.joker) parts.push(`jokers ${fmt(scheme.joker)}`);
    if (scheme.customValues) parts.push("custom cards use their printed value");
    if (scheme.pair) parts.push(`pairs ${signed(scheme.pair)}`);
    if (scheme.trips) parts.push(`three of a kind ${signed(scheme.trips)}`);
    if (scheme.quads) parts.push(`four of a kind ${signed(scheme.quads)}`);
    if (scheme.run) parts.push(`runs of ${scheme.runMin}+${scheme.runSuited ? " in one suit" : ""} ${signed(scheme.run)} per card`);
    if (scheme.flush) parts.push(`${scheme.flushMin}+ cards of one suit ${signed(scheme.flush)}`);
    return parts.join("; ") + (scheme.low ? "; lower is better." : ".");
  }

  /**
   * Check a design for problems a playtest would trip over: dangling
   * references, turns that never pass, decks too small for the deal, games
   * that never end. Returns [{ level: "error" | "warn" | "info", message }].
   */
  function lintDesign(state) {
    const issues = [];
    const add = (level, message) => issues.push({ level, message });
    const keys = new Set();
    for (const zone of orderedZones(state, "table")) { keys.add((zone.key || "").toLowerCase()); keys.add(zone.name.toLowerCase()); }
    for (const tpl of state.seatTemplate) { keys.add((tpl.key || "").toLowerCase()); keys.add(String(tpl.name).toLowerCase()); }
    keys.delete("");
    const refOk = (ref) => {
      if (!ref) return true;
      if (state.zones[ref]) return true;
      return keys.has(String(ref).split("@")[0].trim().toLowerCase());
    };
    const api = evaluators();
    const evalOk = (spec) => {
      if (!spec) return true;
      const id = String(spec).split("@")[0];
      if (id.startsWith("points:")) return state.schemes.some((scheme) => scheme.id === id.slice(7));
      return !api || api.EVALUATORS.some((def) => def.id === id);
    };
    const counters = new Set([...state.counterDefs, ...state.tableCounters].map((def) => def.name.toLowerCase()));
    const size = Object.keys(state.cards).length || deckSize(state.deckSpec);
    const seats = Math.max(1, state.players.filter((player) => !player.out).length);
    for (const macro of state.macros) {
      if (!macro.steps.length) add("warn", `Action “${macro.label}” has no steps.`);
      let dealt = 0;
      for (const step of macro.steps) {
        const where = `Action “${macro.label}” (${describeStep(step, state)})`;
        for (const field of ["zone", "from", "to"]) {
          if (step[field] && !refOk(step[field])) add("error", `${where} uses “${step[field]}”, which isn't a group.`);
        }
        if (step.evaluator && !evalOk(step.evaluator)) add("error", `${where} scores with a missing evaluator.`);
        if (step.op === "runAction" && !findMacro(state, step.macro)) add("error", `${where} runs an action that no longer exists.`);
        if ((step.op === "counter" || step.op === "setCounter" || step.op === "counterFormula") && !counters.has(String(step.name || "").toLowerCase())) add("error", `${where} changes a counter that doesn't exist.`);
        if ((step.op === "scoreFormula" || step.op === "counterFormula" || (step.op === "stopIf" && step.formula)) && state.players.length) {
          try { evalFormula(step.formula, formulaVars(state, state.players[0].id)); } catch (error) { add("error", `${where}: ${error.message}`); }
        }
        if (step.op === "collect") dealt = 0;
        if (step.op === "deal" && !step.perSeat) {
          const perSeat = state.seatTemplate.some((tpl) => sameText(tpl.key, String(step.to || "").split("@")[0])) && !String(step.to).includes("@");
          // A count as big as the deck means "deal it all out", however many play.
          dealt = (Number(step.count) || 1) >= size ? size : dealt + (Number(step.count) || 1) * (perSeat ? seats : 1);
          if (dealt > size) add("warn", `${where}: dealing ${dealt} cards needs more than the ${size} in the deck with ${seats} players.`);
        }
      }
    }
    for (const trigger of state.triggers) {
      const label = trigger.label || describeTrigger(trigger, state);
      if (!findMacro(state, trigger.macro)) add("error", `Trigger “${label}” runs an action that no longer exists.`);
      if (TRIGGER_EVENTS[trigger.event]?.fields.includes("zone") && !refOk(trigger.zone)) add("error", `Trigger “${label}” watches “${trigger.zone}”, which isn't a group.`);
      if (trigger.event === "counter" && !counters.has(String(trigger.counter || "").toLowerCase())) add("error", `Trigger “${label}” watches the counter “${trigger.counter}”, which doesn't exist.`);
      for (const phase of [trigger.event === "phase" ? trigger.phase : "", trigger.during]) {
        if (phase && state.phases.length && !state.phases.some((entry) => sameText(entry, phase))) add("warn", `Trigger “${label}” mentions the phase “${phase}”, which isn't in the phase list.`);
      }
    }
    const allZones = [...orderedZones(state, "table"), ...state.seatTemplate];
    for (const zone of allZones) {
      for (const spec of zone.evals || []) if (!evalOk(spec)) add("error", `${zone.name} is scored by something that no longer exists (${spec}).`);
      for (const key of ["board", "starter"]) if (zone.ctx?.[key] && !refOk(zone.ctx[key])) add("error", `${zone.name}'s ${key} group “${zone.ctx[key]}” doesn't exist.`);
    }
    const ruled = allZones.filter((zone) => zone.rule && zone.rule.place);
    const turnBased = ruled.some((zone) => zone.rule.place === "turn" || zone.rule.place === "ownerTurn");
    const passes = allZones.some((zone) => zone.rule?.advance) || state.macros.some((macro) => macro.steps.some((step) => ["nextTurn", "setTurn"].includes(step.op))) || state.triggers.some((trigger) => trigger.event === "turn");
    if (turnBased && !passes) add("warn", "Groups only accept the current player, but nothing passes the turn: add “Turn passes after playing here” or a Next turn step.");
    if (!ruled.length) add("info", "No group says who may play to it, so bots and play hints have nothing to work with.");
    if (!state.scores.target && !state.scores.maxRounds && !state.macros.some((macro) => macro.steps.some((step) => step.op === "endGame"))) add("info", "The game never ends on its own: set a target score or round limit (Scores → End of game) to use Bot games and results.");
    const deckRanksKnown = new Set([...deckRanks(normalizeDeckSpec(state.deckSpec)), ...normalizeDeckSpec(state.deckSpec).custom.map((item) => normRank(item.rank || item.label))].map(normRank));
    for (const zone of allZones) {
      for (const wild of zone.rule?.wild || []) if (!deckRanksKnown.has(normRank(wild)) && normRank(wild) !== "jk") add("warn", `${zone.name} treats “${wild}” as wild, but no card in the deck has that rank.`);
    }
    if (state.players.length && state.seatTemplate.length === 0 && !orderedZones(state, "table").some((zone) => zone.kind !== "deck")) add("info", "There's nowhere to put cards yet: add a group to the table or every seat.");
    const order = { error: 0, warn: 1, info: 2 };
    return issues.sort((a, b) => order[a.level] - order[b.level]);
  }

  function summary(state) {
    const zones = Object.values(state.zones);
    const inPlay = zones.filter((zone) => zone.kind !== "deck").reduce((sum, zone) => sum + zone.cards.length, 0);
    return { cards: Object.keys(state.cards).length, inPlay, zones: zones.length, players: state.players.length };
  }

  return {
    VERSION,
    STD_RANKS,
    STD_SUITS,
    SUIT_INFO,
    RANK_NAMES,
    RANK_ORDER,
    PLAYER_COLORS,
    DECK_PRESETS,
    MACRO_OPS,
    createTable,
    emptyState,
    reduce,
    viewFor,
    canSee,
    resolveZones,
    resolveCard,
    dealOrder,
    orderedZones,
    zoneOf,
    zoneLabel,
    findDeckZone,
    playerById,
    totals,
    leaders,
    currentRound,
    describeStep,
    normalizeDeckSpec,
    deckSize,
    cardName,
    migrate,
    toPreset,
    summary,
    describeGame,
    lintDesign,
    evalFormula,
    formulaVars,
    describeScheme,
    describeRule,
    describeTrigger,
    describeZone,
    refName,
    RULE_WHO,
    RULE_ACCEPT,
    RULE_ORDER,
    RULES_MODES,
    TRIGGER_EVENTS,
    cardKey,
    WHO_OPTIONS,
    TURN_OPTIONS,
    STOP_CMP,
    PIP_DEFAULT,
    checkMove,
    legalPlays,
    pickPlay,
    scorePlay,
    BOT_STYLES,
    botStep,
    playOut,
    cardMatches,
    meldOk,
    RULE_MELD,
    RULE_SLAP,
    slapReason,
    evalInput,
    evaluateSpec,
    findZoneRef,
    findMacro,
    fillText,
    parseCardSpec,
    playerAfter,
    sanitizeScheme,
    sanitizeRule,
    setEvaluator,
    setRng,
    getRng,
    seededRng,
    clone,
    fmt,
  };
});
