(function (root, factory) {
  const core = root.OFCFantasylandCore || (typeof require === "function" ? require("../fantasyland-core.js") : null);
  const api = factory(core);
  root.OFCPineappleGame = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function (Core) {
  "use strict";

  const ROW_LIMITS = Object.freeze({ top: 3, middle: 5, bottom: 5 });
  const VARIANTS = Object.freeze(["high", "progressive", "low", "badeucey", "bdp", "cribbage", "dealerschoice"]);
  const VARIANT_LABELS = Object.freeze({ high: "High", progressive: "Progressive", low: "Low", badeucey: "Badeucey", bdp: "BDP", cribbage: "Cribbage", dealerschoice: "Dealer's Choice" });
  const DEFAULT_SETTINGS = Object.freeze({
    seats: 2,
    variant: "high",
    jokers: false,
    buttonRule: "move",
    topRepeatJacksPlus: false,
    fantasyMode: "none",
    progressive: false,
    ultimate: false,
    badeuceyFantasyCards: 16,
    pointValue: 1,
  });

  function createGame(players, settings = {}, seed = "") {
    assertCore();
    const normalizedSettings = normalizeSettings(settings);
    const seats = players.slice(0, normalizedSettings.seats).map((player, seat) => ({
      id: String(player.id),
      ownerId: String(player.id),
      name: cleanName(player.name),
      seat,
      score: 0,
      fantasyQueue: 0,
      nextFantasyCards: baseFantasyCards(normalizedSettings),
      inFantasyland: false,
      currentFantasyCards: 0,
      board: emptyBoard(),
      draw: [],
      discards: [],
      submitted: false,
      hiddenFantasy: false,
      evaluation: null,
    }));
    if (seats.length < 2) throw new Error("Pineapple OFC needs at least two players.");
    return startHand({
      version: 1,
      settings: normalizedSettings,
      players: seats,
      phase: "lobby",
      handNumber: 0,
      buttonIndex: 0,
      extraHands: {},
      actionQueue: [],
      actionIndex: -1,
      activePlayerId: null,
      deck: [],
      ledger: [],
      handResult: null,
      seed: seed || randomSeed(),
    });
  }

  function normalizeSettings(settings = {}) {
    const merged = { ...DEFAULT_SETTINGS, ...settings };
    const variant = merged.variant === "high" && settings.progressive === true ? "progressive" : merged.variant;
    if (!VARIANTS.includes(variant)) throw new Error("Choose an active OFC variant.");
    const dealerChoices = [...new Set(settings.dealerChoices || VARIANTS.slice(0, -1))].filter((id) => VARIANTS.includes(id) && id !== "dealerschoice");
    if (variant === "dealerschoice" && !dealerChoices.length) throw new Error("Enable at least one Dealer's Choice variant.");
    return {
      seats: merged.twoOnButton ? 2 : Number(merged.seats) === 3 ? 3 : 2,
      twoOnButton: merged.seats === "2btn" || Boolean(merged.twoOnButton),
      variant,
      dealerChoices,
      jokers: Boolean(merged.jokers),
      buttonRule: merged.buttonRule === "hold-fantasyland" ? "hold-fantasyland" : "move",
      topRepeatJacksPlus: Boolean(merged.topRepeatJacksPlus),
      fantasyMode: ["none", "stack", "super"].includes(settings.fantasyMode) ? settings.fantasyMode : ["high", "progressive"].includes(variant) ? "none" : "super",
      progressive: variant === "progressive",
      ultimate: (variant === "progressive" || (variant === "dealerschoice" && dealerChoices.includes("progressive"))) && Boolean(merged.ultimate),
      badeuceyFantasyCards: clampWhole(merged.badeuceyFantasyCards, 14, 17, 16),
      pointValue: clampNumber(merged.pointValue, 0.01, 100000, 1),
    };
  }

  function startHand(source) {
    const state = clone(source);
    state.settings = normalizeSettings(state.settings);
    if (!Array.isArray(state.players) || state.players.length < 2) throw new Error("At least two seated players are required.");
    if (state.handNumber > 0) {
      const button = state.players[state.buttonIndex];
      const hold = state.settings.buttonRule === "hold-fantasyland" && state.players.some((p) => ownerId(p) === ownerId(button) && p.fantasyQueue > 0);
      if (!hold) state.buttonIndex = (state.buttonIndex + 1) % state.settings.seats;
    }
    if (state.settings.twoOnButton) {
      state.extraHands ||= {};
      const previous = state.players.find((p) => p.extraHand);
      if (previous) state.extraHands[ownerId(previous)] = previous;
      state.players = state.players.filter((p) => !p.extraHand);
      const button = state.players[state.buttonIndex];
      const extra = state.extraHands[button.id] || { ...clone(button), fantasyQueue: 0, currentFantasyCards: 0 };
      state.players.push({ ...extra, id: button.id + ":second", ownerId: button.id, name: button.name + " · Hand 2", extraHand: true, score: 0 });
    }
    state.handNumber += 1;
    state.phase = "placement";
    state.handResult = null;
    state.deck = shuffledDeck(state.settings.jokers ? 2 : 0, `${state.seed}-${state.handNumber}`);
    state.handVariant = state.settings.variant === "dealerschoice" ? null : state.settings.variant;
    state.players.forEach((player) => {
      player.inFantasyland = player.fantasyQueue > 0;
      if (player.inFantasyland) player.fantasyQueue -= 1;
      player.currentFantasyCards = player.inFantasyland
        ? clampWhole(player.nextFantasyCards, 14, 17, baseFantasyCards(state.settings))
        : 0;
      player.board = emptyBoard();
      player.draw = [];
      player.discards = [];
      player.submitted = false;
      player.hiddenFantasy = player.inFantasyland;
      player.evaluation = null;
    });
    // Everyone gets their opening five before BTN chooses. Extra BTN draws stay hidden.
    if (state.settings.variant === "dealerschoice") {
      state.players.forEach((p) => { p.draw = drawCards(state, 5); });
      state.phase = "choose-variant";
      state.actionQueue = [];
      state.actionIndex = -1;
      state.activePlayerId = state.players[state.buttonIndex].id;
      return state;
    }
    state.actionQueue = buildActionQueue(state);
    state.actionIndex = -1;
    state.activePlayerId = null;
    return advanceAction(state);
  }

  function buildActionQueue(state) {
    const order = seatOrder(state);
    if (state.settings.twoOnButton) {
      const actions = [];
      for (let round = 0; round < 5; round += 1) {
        order.forEach((playerId) => {
          const fantasy = playerById(state, playerId).inFantasyland;
          if (!fantasy || round === 0) actions.push({ playerId, kind: fantasy ? "fantasy" : "natural", round });
        });
      }
      return actions;
    }
    const fantasy = order.filter((id) => playerById(state, id).inFantasyland)
      .map((playerId) => ({ playerId, kind: "fantasy", round: 0 }));
    const natural = order.filter((id) => !playerById(state, id).inFantasyland);
    const rounds = [];
    for (let round = 0; round < 5; round += 1) {
      natural.forEach((playerId) => rounds.push({ playerId, kind: "natural", round }));
    }
    return fantasy.concat(rounds);
  }

  function seatOrder(state) {
    const order = Array.from({ length: state.settings.seats }, (_, offset) => {
      const index = (state.buttonIndex + 1 + offset) % state.settings.seats;
      return state.players[index].id;
    });
    if (state.settings.twoOnButton) order.push(state.players.find((p) => p.extraHand).id);
    return order;
  }

  function chooseVariant(source, clientId, variant) {
    if (source.phase !== "choose-variant") throw new Error("The variant is already chosen.");
    if (ownerId(source.players[source.buttonIndex]) !== clientId) throw new Error("Only BTN can choose the variant.");
    if (!source.settings.dealerChoices.includes(variant)) throw new Error("This variant is not enabled for this table.");
    const state = clone(source);
    state.handVariant = variant;
    state.phase = "placement";
    state.players.forEach((p) => {
      if (p.inFantasyland) {
        p.currentFantasyCards = variant === "bdp" ? 17 : variant === "badeucey" ? state.settings.badeuceyFantasyCards : p.currentFantasyCards;
      }
    });
    state.actionQueue = buildActionQueue(state);
    state.actionIndex = -1;
    return advanceAction(state);
  }

  function advanceAction(source) {
    const state = clone(source);
    state.actionIndex += 1;
    if (state.actionIndex >= state.actionQueue.length) return settleHand(state);
    const action = state.actionQueue[state.actionIndex];
    const player = playerById(state, action.playerId);
    if (!player) throw new Error("The next player is no longer seated.");
    const count = action.kind === "fantasy" ? player.currentFantasyCards : action.round === 0 ? 5 : 3;
    player.draw.push(...drawCards(state, count - player.draw.length));
    player.submitted = false;
    state.activePlayerId = player.id;
    return state;
  }

  function submitPlacement(source, playerId, payload) {
    const state = clone(source);
    if (state.phase !== "placement") throw new Error("This hand is not accepting placements.");
    const active = playerById(state, state.activePlayerId);
    if (!active || ownerId(active) !== playerId) throw new Error("Wait for your turn.");
    const action = state.actionQueue[state.actionIndex];
    const player = active;
    const draw = new Set(player.draw);
    const placements = Array.isArray(payload?.placements) ? payload.placements : [];
    const discards = Array.isArray(payload?.discards) ? payload.discards.map(String) : [];
    const expectedPlaced = action.kind === "fantasy" ? 13 : action.round === 0 ? 5 : 2;
    const expectedDiscards = player.draw.length - expectedPlaced;
    if (placements.length !== expectedPlaced || discards.length !== expectedDiscards) {
      throw new Error(`Set ${expectedPlaced} card${expectedPlaced === 1 ? "" : "s"} and discard ${expectedDiscards}.`);
    }
    const used = placements.map(({ cardId }) => String(cardId)).concat(discards);
    if (new Set(used).size !== used.length || used.length !== player.draw.length || used.some((id) => !draw.has(id))) {
      throw new Error("Every card from this draw must be used exactly once.");
    }
    const nextBoard = clone(player.board);
    placements.forEach(({ cardId, row }) => {
      const target = String(row);
      if (!Object.prototype.hasOwnProperty.call(ROW_LIMITS, target)) throw new Error("Choose top, middle, or bottom.");
      nextBoard[target].push(String(cardId));
      if (nextBoard[target].length > ROW_LIMITS[target]) throw new Error(`${titleCase(target)} is full.`);
    });
    if (action.kind === "fantasy" && !boardComplete(nextBoard)) throw new Error("Fantasyland must set a complete 3-5-5 board.");
    player.board = nextBoard;
    player.discards.push(...discards);
    player.draw = [];
    player.submitted = true;
    state.activePlayerId = null;
    return advanceAction(state);
  }

  function settleHand(source) {
    const state = clone(source);
    state.phase = "showdown";
    state.activePlayerId = null;
    state.players.forEach((player) => {
      player.hiddenFantasy = false;
      player.draw = [];
      player.evaluation = evaluatePlayer(state, player);
    });

    const pairResults = [];
    const deltas = new Map(state.players.map((player) => [player.id, 0]));
    for (let left = 0; left < state.players.length; left += 1) {
      for (let right = left + 1; right < state.players.length; right += 1) {
        if (ownerId(state.players[left]) === ownerId(state.players[right])) continue;
        const result = scorePair(scoringVariant(state), state.players[left], state.players[right]);
        pairResults.push(result);
        deltas.set(result.leftId, deltas.get(result.leftId) + result.points);
        deltas.set(result.rightId, deltas.get(result.rightId) - result.points);
      }
    }
    state.players.forEach((player) => {
      const owner = playerById(state, ownerId(player));
      owner.score += deltas.get(player.id) || 0;
      awardFantasyland(handSettings(state), player);
    });
    state.handResult = {
      handNumber: state.handNumber,
      buttonId: state.players[state.buttonIndex].id,
      pairResults,
      deltas: Object.fromEntries(deltas),
      completedAt: new Date().toISOString(),
    };
    const owners = state.players.filter((p) => !p.extraHand);
    const ownerDeltas = Object.fromEntries(owners.map((p) => [p.id, state.players.filter((hand) => ownerId(hand) === p.id).reduce((sum, hand) => sum + (deltas.get(hand.id) || 0), 0)]));
    state.ledger.push({
      handNumber: state.handNumber,
      completedAt: state.handResult.completedAt,
      variant: state.handVariant || state.settings.variant,
      deltas: ownerDeltas,
      totals: Object.fromEntries(owners.map((player) => [player.id, player.score])),
      players: Object.fromEntries(owners.map((player) => [player.id, player.name])),
    });
    return state;
  }

  function evaluatePlayer(state, player) {
    const options = { variant: scoringVariant(state) };
    if (state.settings.topRepeatJacksPlus && ["low", "badeucey", "cribbage"].includes(options.variant)) {
      options.topRepeatMinRank = 11;
    }
    return serializeEvaluation(Core.evaluateBoard(Object.values(player.board).flat(), player.board, options));
  }

  function scorePair(variant, left, right) {
    const leftEval = left.evaluation;
    const rightEval = right.evaluation;
    let base = 0;
    let rows = { top: 0, middle: 0, bottom: 0 };
    if (leftEval.legal && !rightEval.legal) {
      base = 6;
      rows = { top: 1, middle: 1, bottom: 1 };
    } else if (!leftEval.legal && rightEval.legal) {
      base = -6;
      rows = { top: -1, middle: -1, bottom: -1 };
    } else if (leftEval.legal && rightEval.legal) {
      rows = {
        top: compareVariantRow(variant, "top", leftEval.rowEvals.top, rightEval.rowEvals.top),
        middle: compareVariantRow(variant, "middle", leftEval.rowEvals.middle, rightEval.rowEvals.middle),
        bottom: compareVariantRow(variant, "bottom", leftEval.rowEvals.bottom, rightEval.rowEvals.bottom),
      };
      base = rows.top + rows.middle + rows.bottom;
      if (base === 3) base += 3;
      if (base === -3) base -= 3;
    }
    const leftRoyalties = leftEval.legal ? leftEval.points : 0;
    const rightRoyalties = rightEval.legal ? rightEval.points : 0;
    const points = base + leftRoyalties - rightRoyalties;
    return { leftId: left.id, rightId: right.id, rows, base, leftRoyalties, rightRoyalties, points };
  }

  function compareVariantRow(variant, row, left, right) {
    let comparison = 0;
    if (row === "middle" && variant === "cribbage") comparison = finite(left.cribbagePoints) - finite(right.cribbagePoints);
    else if ((row === "middle" && ["low", "badeucey", "bdp"].includes(variant)) || (row === "top" && variant === "bdp")) {
      comparison = finite(left.quality) - finite(right.quality);
    } else comparison = finite(left.strength) - finite(right.strength);
    return comparison === 0 ? 0 : comparison > 0 ? 1 : -1;
  }

  function awardFantasyland(settings, player) {
    const evaluation = player.evaluation;
    if (!evaluation.legal) return;
    let awards = 0;
    let nextCards = baseFantasyCards(settings);
    if (player.inFantasyland) {
      awards = bitCount(evaluation.repeatMask);
      if (!awards) return;
      if (settings.variant === "progressive" && settings.ultimate) nextCards = player.currentFantasyCards || 14;
    } else {
      const triggers = Core.naturalFantasyTriggers(settings.variant === "progressive" ? "high" : settings.variant, evaluation);
      awards = triggers.length;
      if (settings.variant === "cribbage" && finite(evaluation.rowEvals?.middle?.cribbagePoints) >= 24) awards += 1;
      if (!awards) return;
      if (settings.variant === "progressive") nextCards = progressiveHighCards(evaluation.rowEvals.top);
    }
    if (settings.variant === "bdp") nextCards = 17;
    if (settings.fantasyMode === "stack") {
      player.fantasyQueue += awards;
      player.nextFantasyCards = nextCards;
    } else {
      player.fantasyQueue = Math.max(player.fantasyQueue, 1);
      player.nextFantasyCards = Math.min(17, nextCards + (settings.fantasyMode === "super" ? Math.max(0, awards - 1) : 0));
    }
  }

  function progressiveHighCards(top) {
    if (top?.category === Core.CATEGORY.TRIPS) return 17;
    if (top?.category === Core.CATEGORY.PAIR && top.mainRank >= 14) return 16;
    if (top?.category === Core.CATEGORY.PAIR && top.mainRank >= 13) return 15;
    return 14;
  }

  function baseFantasyCards(settings) {
    if (settings.variant === "bdp") return 17;
    if (settings.variant === "badeucey") return clampWhole(settings.badeuceyFantasyCards, 14, 17, 16);
    return 14;
  }

  function filterStateForPlayer(source, clientId) {
    const state = clone(source);
    delete state.deck;
    delete state.seed;
    delete state.extraHands;
    state.players.forEach((player) => {
      const mine = ownerId(player) === clientId;
      const locked = player.extraHand && state.activePlayerId !== player.id;
      if (!mine || locked) player.draw = player.draw.map(() => "BACK");
      if (!mine) player.discards = player.discards.map(() => "BACK");
      if (!mine && player.hiddenFantasy && state.phase !== "showdown") {
        player.board = {
          top: player.board.top.map(() => "BACK"),
          middle: player.board.middle.map(() => "BACK"),
          bottom: player.board.bottom.map(() => "BACK"),
        };
      }
    });
    return state;
  }

  function serializeEvaluation(evaluation) {
    const value = clone({ ...evaluation, assignments: undefined });
    value.assignments = evaluation?.assignments instanceof Map
      ? Object.fromEntries(Array.from(evaluation.assignments, ([id, card]) => [id, card.id]))
      : {};
    return value;
  }

  function exportLedger(state) {
    return {
      exportedAt: new Date().toISOString(),
      settings: clone(state.settings),
      players: state.players.filter((p) => !p.extraHand).map(({ id, name }) => ({ id, name })),
      hands: clone(state.ledger),
      totals: Object.fromEntries(state.players.filter((p) => !p.extraHand).map((player) => [player.name, player.score])),
    };
  }

  function ledgerText(state) {
    const lines = [
      "OFC Ledger",
      `${VARIANT_LABELS[state.settings.variant]} · ${state.settings.twoOnButton ? "2 on the BTN" : state.players.length + "-handed"} · ${state.settings.jokers ? "2 jokers" : "no jokers"}`,
      "",
    ];
    state.ledger.forEach((hand) => {
      const deltas = state.players.filter((p) => !p.extraHand).map((player) => `${player.name} ${signed(hand.deltas[player.id] || 0)}`).join(" · ");
      lines.push(`Hand ${hand.handNumber}: ${deltas}`);
    });
    lines.push("", "Totals", ...state.players.filter((p) => !p.extraHand).map((player) => `${player.name}: ${signed(player.score)} pts`));
    return lines.join("\n");
  }

  function drawCards(state, count) {
    if (state.deck.length < count) throw new Error("The deck does not contain enough cards for this table configuration.");
    return state.deck.splice(0, count);
  }

  function shuffledDeck(jokers, seed) {
    const deck = [];
    ["s", "h", "d", "c"].forEach((suit) => ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"].forEach((rank) => deck.push(`${rank}${suit}`)));
    for (let index = 1; index <= jokers; index += 1) deck.push(`JK${index}`);
    const random = seededRandom(seed);
    for (let index = deck.length - 1; index > 0; index -= 1) {
      const target = Math.floor(random() * (index + 1));
      [deck[index], deck[target]] = [deck[target], deck[index]];
    }
    return deck;
  }

  function seededRandom(seed) {
    let value = Core.hashSeed(String(seed));
    return function random() {
      value += 0x6d2b79f5;
      let result = Math.imul(value ^ (value >>> 15), 1 | value);
      result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
      return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randomSeed() {
    const values = new Uint32Array(2);
    if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(values);
    else { values[0] = Date.now(); values[1] = Math.random() * 0xffffffff; }
    return `${values[0].toString(16)}${values[1].toString(16)}`;
  }

  function playerById(state, id) {
    return state.players.find((player) => player.id === id);
  }

  function ownerId(player) { return player.ownerId || player.id; }

  function handSettings(state) {
    const variant = state.handVariant || state.settings.variant;
    return { ...state.settings, variant, progressive: variant === "progressive", ultimate: variant === "progressive" && state.settings.ultimate };
  }

  function scoringVariant(state) {
    const variant = state.handVariant || state.settings.variant;
    return ["progressive", "dealerschoice"].includes(variant) ? "high" : variant;
  }

  function emptyBoard() {
    return { top: [], middle: [], bottom: [] };
  }

  function boardComplete(board) {
    return Object.entries(ROW_LIMITS).every(([row, limit]) => board[row].length === limit);
  }

  function bitCount(value) {
    let count = 0;
    let mask = Math.max(0, Math.trunc(finite(value)));
    while (mask) { count += mask & 1; mask >>>= 1; }
    return count;
  }

  function signed(value) {
    const number = finite(value);
    return number > 0 ? `+${number}` : String(number);
  }

  function cleanName(value) {
    return String(value || "Player").trim().replace(/\s+/g, " ").slice(0, 24) || "Player";
  }

  function titleCase(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function finite(value) {
    return Number.isFinite(Number(value)) ? Number(value) : 0;
  }

  function clampWhole(value, minimum, maximum, fallback) {
    const number = Math.trunc(Number(value));
    return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
  }

  function clampNumber(value, minimum, maximum, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
  }

  function clone(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function assertCore() {
    if (!Core) throw new Error("The OFC rules engine is unavailable.");
  }

  return {
    DEFAULT_SETTINGS,
    VARIANTS,
    VARIANT_LABELS,
    ownerId,
    scoringVariant,
    chooseVariant,
    ROW_LIMITS,
    awardFantasyland,
    boardComplete,
    compareVariantRow,
    createGame,
    exportLedger,
    filterStateForPlayer,
    ledgerText,
    normalizeSettings,
    scorePair,
    startHand,
    submitPlacement,
  };
});
