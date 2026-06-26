(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.PokerRushCore = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const SUITS = ["S", "H", "D", "C"];
  const SUIT_NAMES = {
    S: "Spades",
    H: "Hearts",
    D: "Diamonds",
    C: "Clubs",
  };
  const SUIT_PRIORITY = {
    S: 4,
    H: 3,
    D: 2,
    C: 1,
    X: 0,
  };
  const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
  const RANK_VALUES = {
    "2": 2,
    "3": 3,
    "4": 4,
    "5": 5,
    "6": 6,
    "7": 7,
    "8": 8,
    "9": 9,
    T: 10,
    J: 11,
    Q: 12,
    K: 13,
    A: 14,
  };
  const VALUES_TO_RANK = Object.fromEntries(Object.entries(RANK_VALUES).map(([rank, value]) => [value, rank]));
  const STRAIGHTS = [
    { high: 14, ranks: [14, 13, 12, 11, 10] },
    { high: 13, ranks: [13, 12, 11, 10, 9] },
    { high: 12, ranks: [12, 11, 10, 9, 8] },
    { high: 11, ranks: [11, 10, 9, 8, 7] },
    { high: 10, ranks: [10, 9, 8, 7, 6] },
    { high: 9, ranks: [9, 8, 7, 6, 5] },
    { high: 8, ranks: [8, 7, 6, 5, 4] },
    { high: 7, ranks: [7, 6, 5, 4, 3] },
    { high: 6, ranks: [6, 5, 4, 3, 2] },
    { high: 5, ranks: [14, 5, 4, 3, 2] },
  ];
  const ROYAL_VALUES = new Set([10, 11, 12, 13, 14]);
  const HAND_TYPES = {
    straight: {
      key: "straight",
      label: "Straight",
      points: 1,
      strength: 1,
    },
    flush: {
      key: "flush",
      label: "Flush",
      points: 1,
      strength: 2,
    },
    full_house: {
      key: "full_house",
      label: "Full House",
      points: 1,
      strength: 3,
    },
    four_kind: {
      key: "four_kind",
      label: "Four of a Kind",
      points: 3,
      strength: 4,
    },
    straight_flush: {
      key: "straight_flush",
      label: "Straight Flush",
      points: 5,
      strength: 5,
    },
    royal_flush: {
      key: "royal_flush",
      label: "Royal Flush",
      points: 10,
      strength: 6,
    },
  };
  const DEFAULT_OPTIONS = {
    handSize: 7,
    discardMode: "bottom",
    timeLimit: 60,
    endMode: "no_scores",
    jokers: 0,
    seed: "poker-rush",
    now: undefined,
  };

  function xmur3(seedString) {
    let h = 1779033703 ^ seedString.length;
    for (let i = 0; i < seedString.length; i += 1) {
      h = Math.imul(h ^ seedString.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return h >>> 0;
    };
  }

  function createRng(seed) {
    const hash = xmur3(String(seed));
    let a = hash();
    let b = hash();
    let c = hash();
    let d = hash();
    return {
      next() {
        a >>>= 0;
        b >>>= 0;
        c >>>= 0;
        d >>>= 0;
        const t = (a + b) | 0;
        a = b ^ (b >>> 9);
        b = (c + (c << 3)) | 0;
        c = (c << 21) | (c >>> 11);
        d = (d + 1) | 0;
        const result = (t + d) | 0;
        c = (c + result) | 0;
        return (result >>> 0) / 4294967296;
      },
      int(max) {
        return Math.floor(this.next() * max);
      },
    };
  }

  function createDeck(jokers = 0) {
    const deck = [];
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({
          baseId: `${rank}${suit}`,
          id: `${rank}${suit}`,
          rank,
          value: RANK_VALUES[rank],
          suit,
          suitName: SUIT_NAMES[suit],
          isJoker: false,
        });
      }
    }
    for (let i = 1; i <= jokers; i += 1) {
      deck.push({
        baseId: `X${i}`,
        id: `X${i}`,
        rank: "X",
        value: 0,
        suit: "X",
        suitName: "Joker",
        jokerIndex: i,
        isJoker: true,
      });
    }
    return deck;
  }

  function cloneCard(card, instanceId) {
    return {
      ...card,
      instanceId,
      id: `${card.baseId}:${instanceId}`,
    };
  }

  function shuffle(cards, rng) {
    const copy = cards.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = rng.int(i + 1);
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function combinations(length, size) {
    const results = [];
    const combo = [];
    function walk(start) {
      if (combo.length === size) {
        results.push(combo.slice());
        return;
      }
      for (let i = start; i <= length - (size - combo.length); i += 1) {
        combo.push(i);
        walk(i + 1);
        combo.pop();
      }
    }
    walk(0);
    return results;
  }

  function countBy(cards, field) {
    const counts = new Map();
    for (const card of cards) {
      if (!card || card.isJoker) continue;
      const key = card[field];
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
  }

  function jokerCount(cards) {
    return cards.reduce((count, card) => count + (card && card.isJoker ? 1 : 0), 0);
  }

  function naturalCards(cards) {
    return cards.filter((card) => card && !card.isJoker);
  }

  function hasDuplicateNaturalRanks(cards) {
    const naturals = naturalCards(cards);
    const uniqueRanks = new Set(naturals.map((card) => card.value));
    return uniqueRanks.size !== naturals.length;
  }

  function naturalRanksFitSequence(cards, sequence) {
    const sequenceValues = new Set(sequence.ranks);
    return naturalCards(cards).every((card) => sequenceValues.has(card.value));
  }

  function canMakeStraightFromFive(cards) {
    if (hasDuplicateNaturalRanks(cards)) return null;
    const wilds = jokerCount(cards);
    const naturals = naturalCards(cards);
    for (const sequence of STRAIGHTS) {
      if (!naturalRanksFitSequence(cards, sequence)) continue;
      if (sequence.ranks.length - naturals.length <= wilds) {
        return sequence;
      }
    }
    return null;
  }

  function canMakeFlushFromFive(cards) {
    const suits = new Set(naturalCards(cards).map((card) => card.suit));
    return suits.size <= 1;
  }

  function canMakeRoyalFlushFromFive(cards) {
    if (!canMakeFlushFromFive(cards)) return null;
    if (hasDuplicateNaturalRanks(cards)) return null;
    const naturals = naturalCards(cards);
    if (!naturals.every((card) => ROYAL_VALUES.has(card.value))) return null;
    const missing = 5 - new Set(naturals.map((card) => card.value)).size;
    return missing <= jokerCount(cards) ? { high: 14, ranks: [14, 13, 12, 11, 10] } : null;
  }

  function canMakeStraightFlushFromFive(cards) {
    if (!canMakeFlushFromFive(cards)) return null;
    return canMakeStraightFromFive(cards);
  }

  function canMakeFourKindFromFive(cards) {
    const wilds = jokerCount(cards);
    const counts = countBy(cards, "value");
    for (const value of Object.values(RANK_VALUES)) {
      if ((counts.get(value) || 0) + wilds >= 4) {
        return { rank: value };
      }
    }
    return null;
  }

  function canMakeFullHouseFromCounts(rankCounts, wilds, strictFiveCardHand) {
    const rankValues = Object.values(RANK_VALUES);
    for (const tripleRank of rankValues) {
      for (const pairRank of rankValues) {
        if (pairRank === tripleRank) continue;
        let unusableNatural = false;
        let needed = 0;
        for (const rankValue of rankValues) {
          const count = rankCounts.get(rankValue) || 0;
          if (rankValue === tripleRank) {
            if (strictFiveCardHand && count > 3) {
              unusableNatural = true;
              break;
            }
            needed += Math.max(0, 3 - Math.min(count, 3));
          } else if (rankValue === pairRank) {
            if (strictFiveCardHand && count > 2) {
              unusableNatural = true;
              break;
            }
            needed += Math.max(0, 2 - Math.min(count, 2));
          } else if (strictFiveCardHand && count > 0) {
            unusableNatural = true;
            break;
          }
        }
        if (!unusableNatural && needed <= wilds) {
          return { tripleRank, pairRank };
        }
      }
    }
    return null;
  }

  function evaluateFive(cards) {
    if (!Array.isArray(cards) || cards.length !== 5) {
      throw new Error("evaluateFive expects exactly five cards");
    }
    const rankCounts = countBy(cards, "value");
    const royal = canMakeRoyalFlushFromFive(cards);
    if (royal) return { ...HAND_TYPES.royal_flush, high: royal.high };

    const straightFlush = canMakeStraightFlushFromFive(cards);
    if (straightFlush) return { ...HAND_TYPES.straight_flush, high: straightFlush.high };

    const fourKind = canMakeFourKindFromFive(cards);
    if (fourKind) return { ...HAND_TYPES.four_kind, high: fourKind.rank };

    const fullHouse = canMakeFullHouseFromCounts(rankCounts, jokerCount(cards), true);
    if (fullHouse) return { ...HAND_TYPES.full_house, high: fullHouse.tripleRank };

    if (canMakeFlushFromFive(cards)) {
      const naturals = naturalCards(cards).map((card) => card.value);
      const high = naturals.length ? Math.max(...naturals) : 14;
      return { ...HAND_TYPES.flush, high };
    }

    const straight = canMakeStraightFromFive(cards);
    if (straight) return { ...HAND_TYPES.straight, high: straight.high };

    return null;
  }

  function compareEvaluations(a, b) {
    if (!b) return 1;
    if (!a) return -1;
    if (a.strength !== b.strength) return a.strength - b.strength;
    return (a.high || 0) - (b.high || 0);
  }

  function compareVectors(a, b) {
    const length = Math.max(a.length, b.length);
    for (let i = 0; i < length; i += 1) {
      const diff = (a[i] || 0) - (b[i] || 0);
      if (diff) return diff;
    }
    return 0;
  }

  function rankTieVector(cards) {
    return cards
      .map((card) => (card && !card.isJoker ? card.value : 0))
      .sort((a, b) => b - a);
  }

  function suitTieVector(cards) {
    return cards
      .slice()
      .sort((a, b) => {
        const valueDiff = (b && !b.isJoker ? b.value : 0) - (a && !a.isJoker ? a.value : 0);
        if (valueDiff) return valueDiff;
        return (SUIT_PRIORITY[b ? b.suit : "X"] || 0) - (SUIT_PRIORITY[a ? a.suit : "X"] || 0);
      })
      .map((card) => (card && !card.isJoker ? SUIT_PRIORITY[card.suit] || 0 : SUIT_PRIORITY.S));
  }

  function compareIndexPreference(a, b) {
    for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
      const left = a[i] ?? Infinity;
      const right = b[i] ?? Infinity;
      if (left !== right) return right - left;
    }
    return 0;
  }

  function compareCardsForHand(a, b) {
    const rankDiff = (b && !b.isJoker ? b.value : 0) - (a && !a.isJoker ? a.value : 0);
    if (rankDiff) return rankDiff;
    return (SUIT_PRIORITY[b ? b.suit : "X"] || 0) - (SUIT_PRIORITY[a ? a.suit : "X"] || 0);
  }

  function sortCards(cards) {
    return cards.filter(Boolean).slice().sort(compareCardsForHand);
  }

  function compareScoringCandidates(a, b) {
    if (!b) return 1;
    const evaluationCompare = compareEvaluations(a.evaluation, b.evaluation);
    if (evaluationCompare) return evaluationCompare;

    const rankCompare = compareVectors(a.rankTie, b.rankTie);
    if (rankCompare) return rankCompare;

    const suitCompare = compareVectors(a.suitTie, b.suitTie);
    if (suitCompare) return suitCompare;

    return compareIndexPreference(a.indexes, b.indexes);
  }

  function findBestScoringHand(hand) {
    if (!Array.isArray(hand)) return null;
    const indexedHand = hand
      .map((card, index) => ({ card, index }))
      .filter(({ card }) => Boolean(card));
    if (indexedHand.length < 5) return null;
    let best = null;
    for (const comboIndexes of combinations(indexedHand.length, 5)) {
      const entries = comboIndexes.map((index) => indexedHand[index]);
      const indexes = entries.map((entry) => entry.index);
      const cards = entries.map((entry) => entry.card);
      const evaluation = evaluateFive(cards);
      if (!evaluation) continue;
      const candidate = {
        indexes,
        cards,
        evaluation,
        rankTie: rankTieVector(cards),
        suitTie: suitTieVector(cards),
      };
      if (!best || compareScoringCandidates(candidate, best) > 0) {
        best = candidate;
      }
    }
    return best;
  }

  function canMakeStraightPotential(cards, suit) {
    const wilds = jokerCount(cards);
    const rankSet = new Set();
    for (const card of cards) {
      if (card.isJoker) continue;
      if (suit && card.suit !== suit) continue;
      rankSet.add(card.value);
    }
    for (const sequence of STRAIGHTS) {
      let missing = 0;
      for (const rank of sequence.ranks) {
        if (!rankSet.has(rank)) missing += 1;
      }
      if (missing <= wilds) return true;
    }
    return false;
  }

  function canMakeRoyalFlushPotential(cards, suit) {
    const wilds = jokerCount(cards);
    const rankSet = new Set();
    for (const card of cards) {
      if (card.isJoker) continue;
      if (card.suit === suit && ROYAL_VALUES.has(card.value)) {
        rankSet.add(card.value);
      }
    }
    return 5 - rankSet.size <= wilds;
  }

  function canMakeFlushPotential(cards) {
    const wilds = jokerCount(cards);
    const suitCounts = countBy(cards, "suit");
    return SUITS.some((suit) => (suitCounts.get(suit) || 0) + wilds >= 5);
  }

  function canMakeFourKindPotential(cards) {
    const wilds = jokerCount(cards);
    const rankCounts = countBy(cards, "value");
    return Object.values(RANK_VALUES).some((rank) => (rankCounts.get(rank) || 0) + wilds >= 4);
  }

  function canMakeFullHousePotential(cards) {
    return Boolean(canMakeFullHouseFromCounts(countBy(cards, "value"), jokerCount(cards), false));
  }

  function anyScorePossible(cards) {
    if (!Array.isArray(cards) || cards.length < 5) return false;
    for (const suit of SUITS) {
      if (canMakeRoyalFlushPotential(cards, suit)) return true;
      if (canMakeStraightPotential(cards, suit)) return true;
    }
    return (
      canMakeFourKindPotential(cards) ||
      canMakeFullHousePotential(cards) ||
      canMakeFlushPotential(cards) ||
      canMakeStraightPotential(cards)
    );
  }

  function normalizeOptions(options) {
    const merged = { ...DEFAULT_OPTIONS, ...options };
    const handSize = Number(merged.handSize);
    const jokers = Number(merged.jokers);
    const timeLimit = merged.timeLimit === "unlimited" || merged.timeLimit === 0 ? 0 : Number(merged.timeLimit);
    return {
      ...merged,
      handSize: [5, 6, 7].includes(handSize) ? handSize : DEFAULT_OPTIONS.handSize,
      discardMode: ["bottom", "pile", "random", "infinite"].includes(merged.discardMode)
        ? merged.discardMode
        : DEFAULT_OPTIONS.discardMode,
      timeLimit: [0, 15, 30, 60].includes(timeLimit) ? timeLimit : DEFAULT_OPTIONS.timeLimit,
      endMode: ["discards", "seen_count", "seen_all", "no_scores"].includes(merged.endMode)
        ? merged.endMode
        : DEFAULT_OPTIONS.endMode,
      jokers: [0, 1, 2, 3, 4].includes(jokers) ? jokers : DEFAULT_OPTIONS.jokers,
      seed: String(merged.seed || DEFAULT_OPTIONS.seed),
    };
  }

  class PokerRushGame {
    constructor(options = {}) {
      this.options = normalizeOptions(options);
      this.seed = this.options.seed;
      this.rng = createRng(this.seed);
      this.instanceCounter = 0;
      this.baseDeck = createDeck(this.options.jokers);
      this.deck =
        this.options.discardMode === "infinite"
          ? []
          : shuffle(
              this.baseDeck.map((card) => cloneCard(card, this.nextInstanceId())),
              this.rng,
            );
      this.discardPile = [];
      this.hand = [];
      this.scoredHands = [];
      this.score = 0;
      this.userDiscardCount = 0;
      this.drawnCount = 0;
      this.seenCounts = new Map();
      this.discardedCounts = new Map();
      this.scoredCounts = new Map();
      this.status = "playing";
      this.endReason = "";
      this.startedAt = typeof this.options.now === "number" ? this.options.now : Date.now();
      this.lastEvents = [];

      this.dealToHand();
      this.resolveScores();
      this.checkEnd();
    }

    nextInstanceId() {
      this.instanceCounter += 1;
      return this.instanceCounter;
    }

    freshRandomCard() {
      return cloneCard(this.baseDeck[this.rng.int(this.baseDeck.length)], this.nextInstanceId());
    }

    canDraw() {
      if (this.options.discardMode === "infinite") return true;
      if (this.deck.length > 0) return true;
      return this.options.discardMode === "pile" && this.discardPile.length > 0;
    }

    refillDeckFromDiscardPile() {
      if (this.options.discardMode !== "pile") return;
      if (this.deck.length > 0 || this.discardPile.length === 0) return;
      this.deck = shuffle(this.discardPile, this.rng);
      this.discardPile = [];
      this.lastEvents.push({ type: "reshuffle" });
    }

    drawCard() {
      let card = null;
      if (this.options.discardMode === "infinite") {
        card = this.freshRandomCard();
      } else {
        this.refillDeckFromDiscardPile();
        card = this.deck.shift() || null;
      }
      if (card) this.markSeen(card);
      return card;
    }

    markSeen(card) {
      this.drawnCount += 1;
      this.seenCounts.set(card.baseId, (this.seenCounts.get(card.baseId) || 0) + 1);
    }

    markDiscarded(card) {
      this.discardedCounts.set(card.baseId, (this.discardedCounts.get(card.baseId) || 0) + 1);
    }

    markScored(card) {
      this.scoredCounts.set(card.baseId, (this.scoredCounts.get(card.baseId) || 0) + 1);
    }

    dealToHand() {
      let dealt = 0;
      while (this.hand.length < this.options.handSize && this.canDraw()) {
        const card = this.drawCard();
        if (!card) break;
        this.hand.push(card);
        dealt += 1;
      }
      this.sortHand();
      if (dealt) this.lastEvents.push({ type: "draw", count: dealt });
      return dealt;
    }

    sortHand() {
      this.hand = sortCards(this.hand);
    }

    placeDiscard(card) {
      if (this.options.discardMode === "infinite") return;
      if (this.options.discardMode === "bottom") {
        this.deck.push(card);
        return;
      }
      if (this.options.discardMode === "pile") {
        this.discardPile.push(card);
        return;
      }
      if (this.options.discardMode === "random") {
        if (this.deck.length <= 0) {
          this.deck.push(card);
          return;
        }
        const insertAt = 1 + this.rng.int(this.deck.length);
        this.deck.splice(insertAt, 0, card);
      }
    }

    discardCard(index) {
      this.lastEvents = [];
      if (this.status !== "playing") {
        return { ok: false, reason: "Game is over" };
      }
      if (index < 0 || index >= this.hand.length || !this.hand[index]) {
        return { ok: false, reason: "No card in that slot" };
      }
      this.checkTime();
      if (this.status !== "playing") {
        return { ok: false, reason: this.endReason };
      }
      if (!this.canDraw()) {
        this.end("No cards left to draw");
        return { ok: false, reason: this.endReason };
      }
      const discarded = this.hand[index];
      const drawn = this.drawCard();
      this.hand[index] = drawn;
      this.userDiscardCount += 1;
      this.markDiscarded(discarded);
      this.placeDiscard(discarded);
      this.sortHand();
      this.lastEvents.push({ type: "discard", card: discarded, drawn });
      this.resolveScores();
      this.checkEnd();
      return { ok: true, discarded, drawn, events: this.lastEvents.slice() };
    }

    resolveScores() {
      let scoredCount = 0;
      while (this.status === "playing") {
        const best = findBestScoringHand(this.hand);
        if (!best) break;
        const sortedIndexes = best.indexes.slice().sort((a, b) => a - b);
        const removed = [];
        const replacements = [];
        for (const index of sortedIndexes) {
          const card = this.hand[index];
          removed.push(card);
          this.markScored(card);
        }
        for (const index of sortedIndexes) {
          const card = this.drawCard();
          this.hand[index] = card;
          replacements.push({ index, card });
        }
        this.sortHand();
        const sequence = this.scoredHands.length + 1;
        const record = {
          id: `${this.seed}:${sequence}:${best.evaluation.key}`,
          sequence,
          cards: removed,
          indexes: sortedIndexes,
          replacements,
          evaluation: best.evaluation,
          points: best.evaluation.points,
        };
        this.scoredHands.unshift(record);
        this.score += record.points;
        this.lastEvents.push({ type: "score", record });
        scoredCount += 1;
        if (scoredCount > 200) {
          this.end("Scoring chain limit reached");
          break;
        }
        if (this.hand.filter(Boolean).length < 5 && !this.canDraw()) break;
      }
      return scoredCount;
    }

    accessibleCards() {
      if (this.options.discardMode === "infinite") {
        return this.baseDeck;
      }
      return this.hand.filter(Boolean).concat(this.deck, this.discardPile);
    }

    uniqueSeenCount() {
      let count = 0;
      for (const card of this.baseDeck) {
        if ((this.seenCounts.get(card.baseId) || 0) > 0) count += 1;
      }
      return count;
    }

    checkTime(now = Date.now()) {
      if (this.status !== "playing") return false;
      if (!this.options.timeLimit) return false;
      const elapsedSeconds = (now - this.startedAt) / 1000;
      if (elapsedSeconds >= this.options.timeLimit) {
        this.end("Time expired");
        return true;
      }
      return false;
    }

    remainingSeconds(now = Date.now()) {
      if (!this.options.timeLimit) return null;
      return Math.max(0, this.options.timeLimit - (now - this.startedAt) / 1000);
    }

    checkEnd() {
      if (this.status !== "playing") return true;
      if (this.options.endMode === "discards" && this.userDiscardCount >= 52) {
        this.end("Discard limit reached");
        return true;
      }
      if (this.options.endMode === "seen_count" && this.drawnCount >= this.baseDeck.length) {
        this.end("Seen-card limit reached");
        return true;
      }
      if (this.options.endMode === "seen_all" && this.uniqueSeenCount() >= this.baseDeck.length) {
        this.end("Every card has appeared");
        return true;
      }
      if (this.options.endMode === "no_scores") {
        const scoreInHand = findBestScoringHand(this.hand);
        if (!scoreInHand && !anyScorePossible(this.accessibleCards())) {
          this.end("No more scoring hands are possible");
          return true;
        }
      }
      if (this.hand.filter(Boolean).length < 5 && !this.canDraw() && !findBestScoringHand(this.hand)) {
        this.end("No cards left to draw");
        return true;
      }
      return false;
    }

    end(reason) {
      this.status = "ended";
      this.endReason = reason;
      this.lastEvents.push({ type: "end", reason });
    }

    endGame() {
      this.lastEvents = [];
      if (this.status !== "playing") return false;
      this.end("Ended by player");
      return true;
    }

    snapshot() {
      return {
        options: { ...this.options },
        seed: this.seed,
        hand: this.hand.slice(),
        deckCount: this.options.discardMode === "infinite" ? Infinity : this.deck.length,
        discardPileCount: this.discardPile.length,
        scoredHands: this.scoredHands.slice(),
        score: this.score,
        userDiscardCount: this.userDiscardCount,
        drawnCount: this.drawnCount,
        uniqueSeenCount: this.uniqueSeenCount(),
        totalCards: this.baseDeck.length,
        status: this.status,
        endReason: this.endReason,
      };
    }
  }

  return {
    SUITS,
    SUIT_NAMES,
    SUIT_PRIORITY,
    RANKS,
    RANK_VALUES,
    VALUES_TO_RANK,
    HAND_TYPES,
    PokerRushGame,
    anyScorePossible,
    createDeck,
    createRng,
    evaluateFive,
    findBestScoringHand,
    normalizeOptions,
    sortCards,
  };
});
