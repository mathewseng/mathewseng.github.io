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
  };

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
    const custom = Array.isArray(spec.custom) ? spec.custom.slice(0, 60).map((item) => ({
      label: cleanText(item.label, 24, "Card"),
      text: cleanText(item.text, 140, ""),
      color: /^#[0-9a-f]{6}$/i.test(item.color || "") ? item.color : "#9f7dff",
      value: Number.isFinite(Number(item.value)) ? Number(item.value) : 0,
      count: clampInt(item.count, 1, 20, 1),
    })) : [];
    return {
      preset,
      decks: clampInt(spec.decks, 1, 8, 1),
      jokers: clampInt(spec.jokers, 0, 8, 0),
      suits: suits.length ? suits : STD_SUITS.slice(),
      ranks,
      custom,
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
      for (let n = 0; n < item.count; n += 1) {
        cards.push({ id: nextId(state, "k"), rank: item.label, suit: "x", custom: true, label: item.label, text: item.text, color: item.color, value: item.value, deck: index, faceUp: false });
      }
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
  };

  function makeZone(state, area, template = {}) {
    const zone = { ...clone(ZONE_DEFAULTS), ...clone(template) };
    zone.id = nextId(state, "z");
    zone.area = area;
    zone.name = cleanText(zone.name, 32, "Group");
    zone.cards = [];
    zone.evals = Array.isArray(zone.evals) ? zone.evals.slice(0, 6) : [];
    zone.ctx = zone.ctx && typeof zone.ctx === "object" ? zone.ctx : {};
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
      scores: { rounds: [], target: 0, lowWins: false, label: "Points" },
      pot: 0,
      chipStart: 0,
      counterDefs: [],
      tableCounters: [],
      macros: [],
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
    state.counterDefs = clone(preset.counters || []).map((def) => ({ id: nextId(state, "c"), name: cleanText(def.name, 20, "Counter"), start: Number(def.start) || 0 }));
    state.tableCounters = clone(preset.tableCounters || []).map((def) => ({ id: nextId(state, "t"), name: cleanText(def.name, 20, "Tracker"), value: Number(def.value) || 0 }));
    state.macros = clone(preset.macros || []).map((macro) => ({ id: nextId(state, "m"), label: cleanText(macro.label, 28, "Macro"), hint: String(macro.hint || ""), steps: macro.steps || [] }));

    for (const template of preset.table || [{ key: "deck", name: "Deck", kind: "deck", layout: "stack", visibility: "hidden", face: "down" }]) {
      makeZone(state, "table", template);
    }
    const names = Array.isArray(options.players)
      ? options.players
      : Array.from({ length: clampInt(options.players ?? preset.players?.default ?? 2, 0, 12, 2) }, (_, i) => `Player ${i + 1}`);
    names.forEach((name) => {
      const player = createPlayer(state, typeof name === "object" ? name : { name });
      state.counterDefs.forEach((def) => { player.counters[def.id] = def.start; });
    });
    state.scores.rounds = [{ id: nextId(state, "r"), label: "Round 1", scores: {} }];
    const deckZone = findDeckZone(state);
    if (deckZone) {
      for (const card of buildCards(state, state.deckSpec)) {
        state.cards[card.id] = card;
        deckZone.cards.push(card.id);
      }
      shuffleArray(deckZone.cards);
    }
    pushLog(state, null, `Table created: ${state.title}`);
    return state;
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
   */
  function resolveZones(state, ref, actorId = null) {
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
    else if (scope.startsWith("p:")) players = [playerById(state, scope.slice(2))].filter(Boolean);
    else players = [];
    const ids = [];
    for (const player of players) {
      const zone = orderedZones(state, player.id).find(matches);
      if (zone) ids.push(zone.id);
    }
    if (!ids.length && tableHit.length) return tableHit.map((zone) => zone.id);
    return ids;
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

  // ---------------------------------------------------------------- macros

  const MACRO_OPS = {
    shuffle: { label: "Shuffle", fields: ["zone"] },
    cut: { label: "Cut", fields: ["zone"] },
    deal: { label: "Deal", fields: ["from", "to", "count", "face"] },
    flip: { label: "Flip", fields: ["zone", "face", "count"] },
    clear: { label: "Move all", fields: ["from", "to", "face"] },
    collect: { label: "Collect all into", fields: ["to", "shuffle"] },
    sort: { label: "Sort", fields: ["zone", "by"] },
    ante: { label: "Everyone antes", fields: ["amount"] },
    nextTurn: { label: "Next turn", fields: [] },
    nextDealer: { label: "Pass the deal", fields: [] },
    setTurn: { label: "Turn to", fields: ["who"] },
    nextRound: { label: "Next round", fields: [] },
    phase: { label: "Set phase", fields: ["text"] },
    log: { label: "Announce", fields: ["text"] },
  };

  function describeStep(step) {
    const op = MACRO_OPS[step.op];
    if (!op) return step.op;
    switch (step.op) {
      case "deal": return `Deal ${step.count || 1} ${step.face === "up" ? "up" : step.face === "down" ? "down" : ""} ${step.from || "deck"} → ${step.to}`.replace(/\s+/g, " ");
      case "flip": return `Flip ${step.count ? "top " + step.count + " of " : ""}${step.zone} ${step.face || ""}`.trim();
      case "clear": return `Move all ${step.from} → ${step.to}`;
      case "collect": return `Collect all → ${step.to || "deck"}${step.shuffle ? " + shuffle" : ""}`;
      case "shuffle": return `Shuffle ${step.zone || "deck"}`;
      case "cut": return `Cut ${step.zone || "deck"}`;
      case "sort": return `Sort ${step.zone} by ${step.by || "rank"}`;
      case "ante": return `Ante ${step.amount}`;
      case "setTurn": return `Turn → ${step.who || "left of dealer"}`;
      case "phase": return `Phase: ${step.text}`;
      case "log": return `Say “${step.text}”`;
      default: return op.label;
    }
  }

  function runStep(state, step, actor) {
    const zones = (ref) => resolveZones(state, ref, actor);
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
            const from = resolveZones(state, `${step.from}@p:${player.id}`, actor)[0];
            const to = resolveZones(state, `${step.to}@p:${player.id}`, actor)[0];
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
        if (step.perSeat) {
          for (const player of dealOrder(state)) {
            const from = resolveZones(state, `${step.from}@p:${player.id}`, actor)[0];
            const to = resolveZones(state, `${step.to}@p:${player.id}`, actor)[0];
            if (from && to && from !== to) moveCards(state, state.zones[from].cards.slice(), to, { face: step.face });
          }
          break;
        }
        const to = zones(step.to)[0];
        if (!to) break;
        for (const id of zones(step.from)) moveCards(state, state.zones[id].cards.slice(), to, { face: step.face });
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
      case "nextTurn": advanceTurn(state, 1); break;
      case "nextDealer": passDeal(state); break;
      case "setTurn": setTurnTo(state, step.who || "next"); break;
      case "nextRound": nextRound(state, actor); break;
      case "phase": state.turn.phase = cleanText(step.text, 40, ""); break;
      case "log": pushLog(state, actor, cleanText(step.text, 160, ""), "note"); break;
      default: throw new Error("Unknown macro step: " + step.op);
    }
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

  function setTurnTo(state, who) {
    const n = state.players.length;
    if (!n) return;
    if (who === "dealer") state.turn.index = state.turn.dealer;
    else if (who === "next" || who === "left") {
      const first = dealOrder(state)[0];
      if (first) state.turn.index = state.players.indexOf(first);
    } else if (Number.isInteger(Number(who))) state.turn.index = clampInt(who, 0, n - 1, 0);
  }

  function nextRound(state, actor) {
    state.turn.round += 1;
    const round = currentRound(state);
    if (Object.keys(round.scores).length) state.scores.rounds.push({ id: nextId(state, "r"), label: `Round ${state.scores.rounds.length + 1}`, scores: {} });
    state.turn.phase = state.phases[0] || "";
    pushLog(state, actor, `Round ${state.turn.round}`, "round");
  }

  // ---------------------------------------------------------------- reducer

  function reduce(previous, action, actor = null) {
    if (!action || typeof action.type !== "string") throw new Error("Invalid action.");
    const state = clone(previous);
    const handler = HANDLERS[action.type];
    if (!handler) throw new Error("Unknown action: " + action.type);
    const result = handler(state, action, actor);
    state.rev = (state.rev || 0) + 1;
    return result && result.state ? result.state : state;
  }

  const HANDLERS = {
    move(state, action, actor) {
      const ids = resolveCards(state, action.cards);
      const target = state.zones[action.to];
      if (!ids.length || !target) return;
      const from = zoneOf(state, ids[0]);
      const sameZone = ids.every((id) => zoneOf(state, id) === target);
      moveCards(state, ids, action.to, { index: action.index, face: action.face, x: action.x, y: action.y });
      if (!sameZone || action.log) {
        const visibleName = ids.length === 1 && state.cards[ids[0]].faceUp ? cardName(state.cards[ids[0]]) : `${ids.length} card${ids.length === 1 ? "" : "s"}`;
        pushLog(state, actor, `${visibleName}: ${zoneLabel(state, from)} → ${zoneLabel(state, target)}`);
      }
    },

    flip(state, action, actor) {
      const ids = resolveCards(state, action.cards);
      for (const id of ids) {
        const card = state.cards[id];
        card.faceUp = action.face === "up" ? true : action.face === "down" ? false : !card.faceUp;
        delete card.peek;
      }
      const shown = ids.filter((id) => state.cards[id].faceUp).map((id) => cardName(state.cards[id]));
      if (shown.length) pushLog(state, actor, `Revealed ${shown.join(" ")}`);
      else if (ids.length) pushLog(state, actor, `Turned ${ids.length} card${ids.length === 1 ? "" : "s"} face down`);
    },

    flipZone(state, action, actor) {
      const zone = state.zones[action.zone];
      if (!zone) return;
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

    peek(state, action, actor) {
      if (!actor) return;
      const ids = resolveCards(state, action.cards);
      for (const id of ids) {
        const card = state.cards[id];
        card.peek = Array.from(new Set([...(card.peek || []), actor]));
      }
      pushLog(state, actor, `Peeked at ${ids.length} card${ids.length === 1 ? "" : "s"}`);
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

    shuffle(state, action, actor) {
      const zone = state.zones[action.zone];
      if (!zone) return;
      shuffleArray(zone.cards);
      if (action.faceDown) zone.cards.forEach((id) => { state.cards[id].faceUp = false; });
      pushLog(state, actor, `Shuffled ${zoneLabel(state, zone)}`);
    },

    cut(state, action, actor) {
      const zone = state.zones[action.zone];
      if (!zone) return;
      cutZone(zone, action.at);
      pushLog(state, actor, `Cut ${zoneLabel(state, zone)}`);
    },

    draw(state, action, actor) {
      const from = action.from || findDeckZone(state)?.id;
      const to = action.to;
      if (!state.zones[from] || !state.zones[to]) throw new Error("Pick where to draw from and to.");
      if (!state.zones[from].cards.length) throw new Error(`${state.zones[from].name} is empty.`);
      dealCards(state, from, [to], clampInt(action.count, 1, 99, 1), action.face, actor);
    },

    drawBottom(state, action, actor) {
      const from = state.zones[action.from];
      if (!from || !from.cards.length || !state.zones[action.to]) return;
      moveCards(state, [from.cards[0]], action.to, { face: action.face });
      pushLog(state, actor, `Took the bottom card of ${zoneLabel(state, from)}`);
    },

    deal(state, action, actor) {
      const targets = Array.isArray(action.to) ? action.to.flatMap((ref) => resolveZones(state, ref, actor)) : resolveZones(state, action.to, actor);
      dealCards(state, action.from, targets, clampInt(action.count, 1, 60, 1), action.face, actor);
    },

    sort(state, action) {
      sortZone(state, action.zone, action.by);
    },

    arrange(state, action) {
      const zone = state.zones[action.zone];
      if (!zone) return;
      const ids = resolveCards(state, action.cards);
      if (ids.length !== zone.cards.length || !ids.every((id) => zone.cards.includes(id))) return;
      zone.cards = ids;
    },

    clearZone(state, action, actor) {
      const zone = state.zones[action.zone];
      const target = state.zones[action.to] || findDeckZone(state);
      if (!zone || !target || zone === target) return;
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
      for (const card of buildCards(state, state.deckSpec)) {
        state.cards[card.id] = card;
        target.cards.push(card.id);
      }
      shuffleArray(target.cards);
      pushLog(state, actor, `New deck: ${target.cards.length} cards, shuffled`);
    },

    addCards(state, action, actor) {
      const target = state.zones[action.to] || findDeckZone(state);
      if (!target) return;
      const list = Array.isArray(action.cards) ? action.cards.slice(0, 60) : [];
      for (const raw of list) {
        let card;
        if (raw.custom) {
          card = { id: nextId(state, "k"), rank: cleanText(raw.label, 24, "Card"), suit: "x", custom: true, label: cleanText(raw.label, 24, "Card"), text: cleanText(raw.text, 140, ""), color: raw.color || "#9f7dff", value: Number(raw.value) || 0, faceUp: false };
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

    removeCards(state, action, actor) {
      const ids = resolveCards(state, action.cards);
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
      const player = playerById(state, action.player);
      const delta = Number(action.delta);
      if (!player || !Number.isFinite(delta) || !delta) return;
      const round = currentRound(state);
      round.scores[player.id] = (Number(round.scores[player.id]) || 0) + delta;
      pushLog(state, actor, `${player.name} ${delta > 0 ? "+" : ""}${delta} ${state.scores.label.toLowerCase()}${action.reason ? " (" + cleanText(action.reason, 40) + ")" : ""}`, "score");
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
      pushLog(state, actor, "Scores reset", "score");
    },
    scoreConfig(state, action) {
      if ("target" in action) state.scores.target = Math.max(0, Number(action.target) || 0);
      if ("lowWins" in action) state.scores.lowWins = Boolean(action.lowWins);
      if ("label" in action) state.scores.label = cleanText(action.label, 20, "Points");
      if ("pegTarget" in action) state.pegTarget = Math.max(0, Number(action.pegTarget) || 0);
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
      const macro = action.steps ? { label: "Quick action", steps: action.steps } : state.macros.find((entry) => entry.id === action.id);
      if (!macro) throw new Error("That action no longer exists.");
      pushLog(state, actor, `▶ ${macro.label}`, "macro");
      for (const step of macro.steps) runStep(state, step, actor);
    },
    saveMacro(state, action) {
      const macro = action.macro || {};
      const clean = {
        id: macro.id && state.macros.some((entry) => entry.id === macro.id) ? macro.id : nextId(state, "m"),
        label: cleanText(macro.label, 28, "Action"),
        hint: cleanText(macro.hint, 80, ""),
        steps: (macro.steps || []).filter((step) => MACRO_OPS[step.op]).slice(0, 40),
      };
      const index = state.macros.findIndex((entry) => entry.id === clean.id);
      if (index >= 0) state.macros[index] = clean;
      else state.macros.push(clean);
    },
    deleteMacro(state, action) {
      state.macros = state.macros.filter((entry) => entry.id !== action.id);
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
    }
    for (const player of state.players) {
      player.counters = player.counters || {};
      player.chips = Number(player.chips) || 0;
    }
    return state;
  }

  /** Extract a reusable game design (no cards in play) from a table. */
  function toPreset(state) {
    const table = orderedZones(state, "table").map(templateFrom);
    return {
      id: "custom-" + Date.now().toString(36),
      name: state.title,
      family: "Custom",
      custom: true,
      description: (state.notes || "").split("\n")[0].slice(0, 140) || "Custom game design",
      players: { min: 1, max: 12, default: state.players.length || 2 },
      deck: clone(state.deckSpec),
      table,
      seat: clone(state.seatTemplate),
      macros: state.macros.map(({ id, ...rest }) => clone(rest)),
      phases: clone(state.phases),
      counters: state.counterDefs.map((def) => ({ name: def.name, start: def.start })),
      tableCounters: state.tableCounters.map((def) => ({ name: def.name, value: def.value })),
      scoring: { target: state.scores.target, lowWins: state.scores.lowWins, label: state.scores.label, chips: state.chipStart, peg: state.pegTarget },
      rules: state.notes,
    };
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
    setRng,
    seededRng,
    clone,
    fmt,
  };
});
