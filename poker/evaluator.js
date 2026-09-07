(function (root, factory) {
  const catalog = root.MixedPokerCatalog || (typeof require === "function" ? require("./game-catalog.js") : null);
  const api = factory(catalog);
  root.MixedPokerEvaluator = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function (Catalog) {
  "use strict";

  const RANKS = "23456789TJQKA";
  const RANK_LABEL = { 14: "A", 13: "K", 12: "Q", 11: "J", 10: "T", 9: "9", 8: "8", 7: "7", 6: "6", 5: "5", 4: "4", 3: "3", 2: "2", 1: "A" };
  const CATEGORY_NAME = ["High card", "Pair", "Two pair", "Trips", "Straight", "Flush", "Full house", "Quads", "Straight flush"];
  const BASE = 15;

  function makeCard(value) {
    if (typeof value === "object" && value && Number.isFinite(value.rank)) return value;
    const id = String(value);
    const rank = RANKS.indexOf(id[0].toUpperCase()) + 2;
    const suit = id[1]?.toLowerCase();
    if (rank < 2 || !["s", "h", "d", "c"].includes(suit)) throw new Error("Invalid card: " + id);
    return { id: RANK_LABEL[rank] + suit, rank, suit };
  }

  function evaluateFiveHigh(values, options = {}) {
    const cards = values.map(makeCard);
    if (cards.length !== 5) throw new Error("High evaluation needs exactly five cards.");
    const ranks = cards.map((card) => card.rank).sort(descending);
    const counts = rankCounts(ranks);
    const groups = Array.from(counts, ([rank, count]) => ({ rank, count })).sort((left, right) => right.count - left.count || right.rank - left.rank);
    const flush = cards.every((card) => card.suit === cards[0].suit);
    const straightHigh = straightHighRank(ranks, options.wheelStraight !== false);
    let category = 0;
    let tie = ranks;

    if (straightHigh && flush) {
      category = 8;
      tie = [straightHigh];
    } else if (groups[0].count === 4) {
      category = 7;
      tie = [groups[0].rank, groups[1].rank];
    } else if (groups[0].count === 3 && groups[1].count === 2) {
      category = 6;
      tie = [groups[0].rank, groups[1].rank];
    } else if (flush) {
      category = 5;
      tie = ranks;
    } else if (straightHigh) {
      category = 4;
      tie = [straightHigh];
    } else if (groups[0].count === 3) {
      category = 3;
      tie = [groups[0].rank].concat(groups.filter((group) => group.count === 1).map((group) => group.rank).sort(descending));
    } else if (groups[0].count === 2 && groups[1].count === 2) {
      const pairs = groups.filter((group) => group.count === 2).map((group) => group.rank).sort(descending);
      category = 2;
      tie = pairs.concat(groups.find((group) => group.count === 1).rank);
    } else if (groups[0].count === 2) {
      category = 1;
      tie = [groups[0].rank].concat(groups.filter((group) => group.count === 1).map((group) => group.rank).sort(descending));
    }

    const quality = category * Math.pow(BASE, 5) + pack(tie);
    const mainRank = tie[0] || 0;
    return {
      category,
      categoryName: CATEGORY_NAME[category],
      mainRank,
      tie,
      quality,
      name: highName(category, tie),
      cards: cards.map((card) => card.id),
    };
  }

  function bestHigh(values, selection) {
    const cards = values.map(makeCard);
    const candidates = selection ? selection(cards) : combinations(cards, 5);
    return bestByQuality(candidates.map((combo) => evaluateFiveHigh(combo)));
  }

  function bestOmahaHigh(holeValues, boardValues) {
    const holes = holeValues.map(makeCard);
    const board = boardValues.map(makeCard);
    if (board.length < 3) return null;
    const results = [];
    combinations(holes, 2).forEach((holePair) => {
      combinations(board, 3).forEach((boardTriple) => results.push(evaluateFiveHigh(holePair.concat(boardTriple))));
    });
    return bestByQuality(results);
  }

  function evaluateFiveA5(values) {
    const cards = values.map(makeCard);
    if (cards.length !== 5) throw new Error("A-5 low evaluation needs five cards.");
    const ranks = cards.map((card) => card.rank === 14 ? 1 : card.rank).sort(descending);
    const groups = Array.from(rankCounts(ranks), ([rank, count]) => ({ rank, count })).sort((left, right) => right.count - left.count || right.rank - left.rank);
    let category = 0;
    let tie = ranks;
    if (groups[0].count === 4) {
      category = 5;
      tie = [groups[0].rank, groups[1].rank];
    } else if (groups[0].count === 3 && groups[1].count === 2) {
      category = 4;
      tie = [groups[0].rank, groups[1].rank];
    } else if (groups[0].count === 3) {
      category = 3;
      tie = [groups[0].rank].concat(groups.filter((group) => group.count === 1).map((group) => group.rank).sort(descending));
    } else if (groups[0].count === 2 && groups[1].count === 2) {
      category = 2;
      tie = groups.filter((group) => group.count === 2).map((group) => group.rank).sort(descending)
        .concat(groups.find((group) => group.count === 1).rank);
    } else if (groups[0].count === 2) {
      category = 1;
      tie = [groups[0].rank].concat(groups.filter((group) => group.count === 1).map((group) => group.rank).sort(descending));
    }
    const lowCode = category * Math.pow(BASE, 5) + pack(tie);
    return {
      category,
      tie,
      quality: 1000000000 - lowCode,
      qualifiesEight: category === 0 && tie[0] <= 8,
      name: lowName(tie, category, "A-5"),
      cards: cards.map((card) => card.id),
    };
  }

  function bestA5(values) {
    const cards = values.map(makeCard);
    return bestByQuality(combinations(cards, 5).map(evaluateFiveA5));
  }

  function bestOmahaA5(holeValues, boardValues) {
    const holes = holeValues.map(makeCard);
    const board = boardValues.map(makeCard);
    if (board.length < 3) return null;
    const results = [];
    combinations(holes, 2).forEach((holePair) => {
      combinations(board, 3).forEach((boardTriple) => results.push(evaluateFiveA5(holePair.concat(boardTriple))));
    });
    return bestByQuality(results);
  }

  function evaluateFiveDeuce(values) {
    const high = evaluateFiveHigh(values, { wheelStraight: false });
    const lowCode = high.category * Math.pow(BASE, 5) + pack(high.tie);
    return {
      category: high.category,
      tie: high.tie,
      quality: 1000000000 - lowCode,
      name: lowName(high.tie, high.category, "2-7"),
      cards: high.cards,
    };
  }

  function bestDeuce(values) {
    const cards = values.map(makeCard);
    return bestByQuality(combinations(cards, 5).map(evaluateFiveDeuce));
  }

  function bestBadugi(values, options = {}) {
    const cards = values.map(makeCard);
    const aceLow = options.aceLow !== false;
    let best = null;
    for (let count = 1; count <= Math.min(4, cards.length); count += 1) {
      combinations(cards, count).forEach((combo) => {
        const ranks = combo.map((card) => aceLow && card.rank === 14 ? 1 : card.rank);
        const suits = combo.map((card) => card.suit);
        if (new Set(ranks).size !== count || new Set(suits).size !== count) return;
        const sorted = ranks.slice().sort(descending);
        const quality = count * 100000000 + (99999999 - pack(sorted));
        const candidate = {
          count,
          tie: sorted,
          quality,
          name: badugiName(sorted, count),
          cards: combo.map((card) => card.id),
        };
        if (!best || candidate.quality > best.quality) best = candidate;
      });
    }
    return best;
  }

  function evaluateGame(gameValue, playerValues, boardsValue = [[]]) {
    const game = typeof gameValue === "string" ? Catalog.getGame(gameValue) : gameValue;
    const cards = playerValues.map(makeCard);
    const boards = normalizeBoards(boardsValue);
    const board = boards[0] || [];
    const component = (key, label, result, qualifies = true) => ({
      key,
      label,
      quality: result?.quality ?? -Infinity,
      name: result?.name || "No hand",
      cards: result?.cards || [],
      qualifies: Boolean(result) && Boolean(qualifies),
    });
    const high = () => bestHigh(cards.concat(board));
    const omaha = (targetBoard = board) => bestOmahaHigh(cards, targetBoard);
    const studHigh = () => bestHigh(cards);
    const a5 = () => bestA5(cards);
    const deuce = () => bestDeuce(cards);

    switch (game.evaluator) {
      case "holdem-high":
        return [component("high", "High", high())];
      case "omaha-high":
        return [component("high", "High", omaha())];
      case "omaha-eight": {
        const low = bestOmahaA5(cards, board);
        return [
          component("high", "High", omaha()),
          component("low", "8-low", low, low?.qualifiesEight),
        ];
      }
      case "double-omaha":
      case "zombie":
        return boards.map((targetBoard, index) => component("board-" + (index + 1), "Board " + (index + 1), bestOmahaHigh(cards, targetBoard)));
      case "stud-high":
        return [component("high", "High", studHigh())];
      case "stud-eight": {
        const low = a5();
        return [
          component("high", "High", studHigh()),
          component("low", "8-low", low, low?.qualifiesEight),
        ];
      }
      case "razz-a5":
      case "draw-a5":
        return [component("low", "A-5 low", a5())];
      case "razz-27":
      case "draw-27":
        return [component("low", "2-7 low", deuce())];
      case "razzdeucey":
        return [
          component("low", "2-7 low", deuce()),
          component("badugi", "2-5 Badugi", bestBadugi(cards, { aceLow: false })),
        ];
      case "draw-high":
        return [component("high", "High", bestHigh(cards))];
      case "badugi":
        return [component("badugi", "Badugi", bestBadugi(cards))];
      case "badacey":
        return [
          component("low", "A-5 low", a5()),
          component("badugi", "A-4-3-2 Badugi", bestBadugi(cards)),
        ];
      case "badeucy":
        return [
          component("low", "2-7 low", deuce()),
          component("badugi", "2-5 Badugi", bestBadugi(cards, { aceLow: false })),
        ];
      case "dramaha-high":
        return [
          component("omaha", "Omaha", omaha()),
          component("draw", "Draw", bestHigh(cards)),
        ];
      case "dramaha-27":
        return [
          component("omaha", "Omaha", omaha()),
          component("draw", "2-7 draw", deuce()),
        ];
      case "dramadugi":
        return [
          component("omaha", "Omaha", omaha()),
          component("badugi", "Badugi", bestBadugi(cards)),
        ];
      case "archie": {
        const highResult = bestHigh(cards);
        const lowResult = a5();
        const highQualifies = highResult.category > 1 || highResult.category === 1 && highResult.mainRank >= 9;
        return [
          component("high", "High", highResult, highQualifies),
          component("low", "8-low", lowResult, lowResult?.qualifiesEight),
        ];
      }
      case "ari": {
        const highResult = bestHigh(cards.concat(board));
        const lowResult = a5();
        const highQualifies = highResult.category > 1 || highResult.category === 1 && highResult.mainRank >= 9;
        return [
          component("high", "High + board", highResult, highQualifies),
          component("low", "8-low", lowResult, lowResult?.qualifiesEight),
        ];
      }
      default:
        throw new Error("No evaluator is registered for " + game.id + ".");
    }
  }

  function compareComponents(left, right) {
    const a = left?.qualifies ? left.quality : -Infinity;
    const b = right?.qualifies ? right.quality : -Infinity;
    return a === b ? 0 : a > b ? 1 : -1;
  }

  function normalizeBoards(value) {
    if (!Array.isArray(value)) return [[]];
    if (!value.length) return [[]];
    if (typeof value[0] === "string" || value[0]?.rank) return [value.map(makeCard)];
    return value.map((board) => board.map(makeCard));
  }

  function bestByQuality(results) {
    return results.reduce((best, result) => !best || result.quality > best.quality ? result : best, null);
  }

  function rankCounts(ranks) {
    const map = new Map();
    ranks.forEach((rank) => map.set(rank, (map.get(rank) || 0) + 1));
    return map;
  }

  function straightHighRank(ranks, allowWheel) {
    const unique = Array.from(new Set(ranks)).sort(descending);
    if (unique.length !== 5) return 0;
    if (allowWheel && unique.join(",") === "14,5,4,3,2") return 5;
    return unique[0] - unique[4] === 4 ? unique[0] : 0;
  }

  function pack(values) {
    const padded = values.slice(0, 5).concat(Array(5).fill(0)).slice(0, 5);
    return padded.reduce((total, value) => total * BASE + value, 0);
  }

  function highName(category, tie) {
    if (category === 8) return tie[0] === 14 ? "Royal flush" : RANK_LABEL[tie[0]] + "-high straight flush";
    if (category === 7) return "Quad " + pluralRank(tie[0]);
    if (category === 6) return pluralRank(tie[0]) + " full of " + pluralRank(tie[1]);
    if (category === 5) return RANK_LABEL[tie[0]] + "-high flush";
    if (category === 4) return RANK_LABEL[tie[0]] + "-high straight";
    if (category === 3) return "Trip " + pluralRank(tie[0]);
    if (category === 2) return pluralRank(tie[0]) + " and " + pluralRank(tie[1]);
    if (category === 1) return "Pair of " + pluralRank(tie[0]);
    return RANK_LABEL[tie[0]] + "-high";
  }

  function lowName(tie, category, scale) {
    if (category === 0) return tie.map((rank) => RANK_LABEL[rank]).join("-") + " " + scale;
    return scale + " " + CATEGORY_NAME[Math.min(category, CATEGORY_NAME.length - 1)].toLowerCase();
  }

  function badugiName(ranks, count) {
    const rankText = ranks.map((rank) => RANK_LABEL[rank]).join("-");
    return count === 4 ? rankText + " Badugi" : count + "-card " + rankText;
  }

  function pluralRank(rank) {
    return { 14: "aces", 13: "kings", 12: "queens", 11: "jacks", 10: "tens", 9: "nines", 8: "eights", 7: "sevens", 6: "sixes", 5: "fives", 4: "fours", 3: "threes", 2: "twos" }[rank];
  }

  function combinations(values, count) {
    const result = [];
    const choose = (start, picked) => {
      if (picked.length === count) {
        result.push(picked.slice());
        return;
      }
      for (let index = start; index <= values.length - (count - picked.length); index += 1) {
        picked.push(values[index]);
        choose(index + 1, picked);
        picked.pop();
      }
    };
    choose(0, []);
    return result;
  }

  function descending(left, right) {
    return right - left;
  }

  return {
    CATEGORY_NAME,
    RANK_LABEL,
    bestA5,
    bestBadugi,
    bestDeuce,
    bestHigh,
    bestOmahaA5,
    bestOmahaHigh,
    combinations,
    compareComponents,
    evaluateFiveA5,
    evaluateFiveDeuce,
    evaluateFiveHigh,
    evaluateGame,
    makeCard,
  };
});
