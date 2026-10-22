/* Scoundrel rules. Pure transitions shared by the UI, solver, and Node tests. */
(function (root) {
  "use strict";
  const MAX_HEALTH = 20;
  const VALUES = { T: 10, J: 11, Q: 12, K: 13, A: 14 };
  const SYMBOLS = { s: "♠", c: "♣", d: "♦", h: "♥" };
  const SUITS = { s: "spades", c: "clubs", d: "diamonds", h: "hearts" };

  function card(id) {
    if (typeof id === "object") id = id.id;
    const match = String(id).match(/^([2-9TJQKA])([scdh])$/);
    if (!match) throw new Error("Invalid dungeon card");
    const [, rank, suit] = match;
    const value = VALUES[rank] || Number(rank);
    if ((suit === "h" || suit === "d") && value > 10) throw new Error("Red face cards are not in the dungeon");
    return { id, rank, suit, value, type: suit === "h" ? "potion" : suit === "d" ? "weapon" : "monster" };
  }

  function makeDeck() {
    const deck = [];
    for (const suit of ["s", "c", "d", "h"])
      for (let value = 2; value <= (suit === "s" || suit === "c" ? 14 : 10); value++)
        deck.push(card((value < 10 ? String(value) : "TJQKA"[value - 10]) + suit));
    return deck;
  }

  function random(seed) {
    let n = 2166136261;
    for (const char of String(seed)) n = Math.imul(n ^ char.charCodeAt(0), 16777619);
    return () => {
      n += 0x6d2b79f5;
      let t = Math.imul(n ^ (n >>> 15), n | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffled(seed) {
    const deck = makeDeck();
    const rng = random(seed);
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  function createGame(options = {}) {
    const seed = String(options.seed || Date.now().toString(36));
    const deck = options.deck ? options.deck.map(card) : shuffled(seed);
    const initialDeck = deck.map((c) => c.id);
    return {
      version: 1, id: options.id || seed + "-" + Date.now().toString(36), seed, initialDeck,
      room: deck.splice(0, 4), deck, health: MAX_HEALTH, deathHealth: null,
      weapon: null, slain: [], discard: [], roomNumber: 1, resolved: 0,
      potionUsed: false, fledPrevious: false, phase: "playing", lastCard: null,
      history: [], steps: 0, monstersSlain: 0, roomsFled: 0,
    };
  }

  const label = (c) => c.rank + SYMBOLS[c.suit];
  const remaining = (s) => s.deck.length + s.room.filter(Boolean).length;
  const weaponLimit = (s) => s.slain.length ? s.slain[s.slain.length - 1].value : 15;
  const canUseWeapon = (s, c) => !!s.weapon && c.type === "monster" && c.value < weaponLimit(s);
  const canFlee = (s) => s.phase === "playing" && s.resolved === 0 && !s.fledPrevious && s.room.filter(Boolean).length === 4;

  function actions(s) {
    if (s.phase === "ready") return [{ type: "descend" }];
    if (s.phase !== "playing") return [];
    const list = [];
    for (const c of s.room.filter(Boolean)) {
      if (c.type === "monster") {
        if (canUseWeapon(s, c)) list.push({ type: "fight", id: c.id, mode: "weapon" });
        list.push({ type: "fight", id: c.id, mode: "bare" });
      } else list.push({ type: c.type === "weapon" ? "equip" : "drink", id: c.id });
    }
    if (canFlee(s)) list.push({ type: "flee" });
    return list;
  }

  function score(s) {
    if (s.phase === "won") return s.health + (s.health === 20 && s.lastCard?.type === "potion" ? s.lastCard.value : 0);
    if (s.phase === "lost") return (s.deathHealth ?? 0) - [...s.deck, ...s.room.filter(Boolean)].reduce((n, c) => n + (c.type === "monster" ? c.value : 0), 0);
    return null;
  }

  function describe(s, a) {
    if (a.type === "flee") return "Avoid this room";
    if (a.type === "descend") return "Enter the next room";
    const c = s.room.find((c) => c?.id === a.id);
    if (!c) return "";
    if (a.type === "equip") return "Equip " + label(c);
    if (a.type === "drink") return (s.potionUsed ? "Discard " : "Drink ") + label(c);
    return "Fight " + label(c) + (a.mode === "weapon" ? " with your weapon" : " barehanded");
  }

  function transition(state, action) {
    if (!actions(state).some((a) => a.type === action.type && a.id === action.id && a.mode === action.mode))
      throw new Error("That action is not available");
    const s = { ...state, room: state.room.slice(), deck: state.deck.slice(), discard: state.discard.slice(), slain: state.slain.slice(), history: state.history.slice() };
    let message, kind = "room", delta = 0;
    if (action.type === "flee") {
      s.deck.push(...s.room.filter(Boolean));
      s.room = s.deck.splice(0, 4);
      s.roomNumber++;
      s.fledPrevious = true;
      s.roomsFled++;
      s.potionUsed = false;
      message = "Room avoided. Its cards return to the bottom of the dungeon.";
    } else if (action.type === "descend") {
      s.room = s.room.filter(Boolean);
      while (s.room.length < 4 && s.deck.length) s.room.push(s.deck.shift());
      s.roomNumber++;
      s.resolved = 0;
      s.potionUsed = false;
      s.fledPrevious = false;
      s.phase = "playing";
      message = "Entered room " + s.roomNumber + ".";
    } else {
      const index = s.room.findIndex((c) => c?.id === action.id);
      const c = s.room[index];
      s.room[index] = null;
      s.resolved++;
      s.lastCard = c;
      kind = c.type;
      if (c.type === "weapon") {
        if (s.weapon) s.discard.push(s.weapon, ...s.slain);
        s.weapon = c;
        s.slain = [];
        message = "Equipped " + label(c) + ". Weapon power " + c.value + ".";
      } else if (c.type === "potion") {
        delta = s.potionUsed ? 0 : Math.min(c.value, MAX_HEALTH - s.health);
        s.health += delta;
        message = s.potionUsed ? label(c) + " discarded. One potion per room." : label(c) + " restored " + delta + " health.";
        s.potionUsed = true;
        s.discard.push(c);
      } else {
        const damage = action.mode === "weapon" ? Math.max(0, c.value - s.weapon.value) : c.value;
        delta = -damage;
        const health = s.health - damage;
        s.health = Math.max(0, health);
        if (health <= 0) { s.phase = "lost"; s.deathHealth = health; }
        if (action.mode === "weapon") s.slain.push(c);
        else s.discard.push(c);
        s.monstersSlain++;
        message = "Defeated " + label(c) + (action.mode === "weapon" ? " with your weapon" : " barehanded") + ". " + damage + " damage.";
      }
      if (s.phase !== "lost") {
        if (!remaining(s)) s.phase = "won";
        else if (s.resolved === 3 && s.deck.length) s.phase = "ready";
      }
    }
    s.steps++;
    s.history.push({ step: s.steps, room: s.roomNumber, message, kind, delta });
    return s;
  }

  function restore(raw) {
    try {
      const s = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (s.version !== 1 || typeof s.seed !== "string" || typeof s.id !== "string" || !["playing", "ready", "won", "lost"].includes(s.phase)) return null;
      for (const key of ["deck", "room", "discard", "slain", "initialDeck", "history"]) if (!Array.isArray(s[key])) return null;
      if (!Number.isInteger(s.health) || s.health < 0 || s.health > 20 || !Number.isInteger(s.resolved) || s.resolved < 0 || s.resolved > 4 || s.room.length > 4) return null;
      const restored = { ...s, deck: s.deck.map(card), room: s.room.map((c) => c && card(c)), discard: s.discard.map(card), slain: s.slain.map(card), weapon: s.weapon && card(s.weapon), lastCard: s.lastCard && card(s.lastCard) };
      const all = [...restored.deck, ...restored.room.filter(Boolean), ...restored.discard, ...restored.slain, ...(restored.weapon ? [restored.weapon] : [])].map((c) => c.id);
      const valid = makeDeck().map((c) => c.id).sort().join();
      if (all.sort().join() !== valid || s.initialDeck.map((id) => card(id).id).sort().join() !== valid) return null;
      if (restored.weapon && restored.weapon.type !== "weapon") return null;
      if (restored.slain.some((c) => c.type !== "monster") || (!restored.weapon && restored.slain.length)) return null;
      for (let i = 1; i < restored.slain.length; i++) if (restored.slain[i].value >= restored.slain[i - 1].value) return null;
      if (!Number.isInteger(s.steps) || s.steps < 0 || s.history.length > 10000 || !Number.isInteger(s.roomNumber) || s.roomNumber < 1) return null;
      if (s.history.some((h) => typeof h.message !== "string" || !Number.isFinite(h.delta))) return null;
      return restored;
    } catch { return null; }
  }

  const api = { MAX_HEALTH, SYMBOLS, SUITS, card, makeDeck, random, shuffled, createGame, label, remaining, weaponLimit, canUseWeapon, canFlee, actions, score, describe, transition, restore };
  root.Scoundrel = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : globalThis);
