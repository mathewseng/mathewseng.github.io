(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.OFCFantasylandCore = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const SUITS = ["s", "h", "d", "c"];
  const RANKS = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
  const RANK_LABEL = { 14: "A", 13: "K", 12: "Q", 11: "J", 10: "T", 9: "9", 8: "8", 7: "7", 6: "6", 5: "5", 4: "4", 3: "3", 2: "2" };
  const RANK_NAME = { 14: "aces", 13: "kings", 12: "queens", 11: "jacks", 10: "tens", 9: "nines", 8: "eights", 7: "sevens", 6: "sixes", 5: "fives", 4: "fours", 3: "threes", 2: "twos" };
  const CATEGORY = { HIGH: 0, PAIR: 1, TWO_PAIR: 2, TRIPS: 3, STRAIGHT: 4, FLUSH: 5, FULL_HOUSE: 6, QUADS: 7, STRAIGHT_FLUSH: 8 };
  const VARIANT_ORDER = ["high", "low", "badeucey", "badugijack", "cribbage"];
  const VARIANTS = {
    high: {
      id: "high",
      seedLabel: "HIGH",
      label: "High",
      middleSize: 5,
      short: "Standard 3–5–5 OFC. Middle and bottom use normal high-poker rankings.",
    },
    low: {
      id: "low",
      seedLabel: "LOW",
      label: "Low",
      middleSize: 5,
      short: "Middle must make an unpaired, non-straight, non-flush 10-low or better.",
    },
    badeucey: {
      id: "badeucey",
      seedLabel: "BADEUCEY",
      label: "Badeucey",
      middleSize: 5,
      short: "Middle must qualify as both 2–7 low and a four-card 2–5 Badugi.",
    },
    badugijack: {
      id: "badugijack",
      seedLabel: "BADUGIJACK",
      label: "BadugiJack",
      middleSize: 6,
      short: "Split six middle cards into a three/four-card Badugi and a two/three-card blackjack hand.",
    },
    cribbage: {
      id: "cribbage",
      seedLabel: "CRIBBAGE",
      label: "Cribbage",
      middleSize: 5,
      short: "Middle uses cribbage scoring and needs at least 12 points to qualify.",
    },
  };
  const RULE_SECTIONS = [
    {
      id: "high",
      title: "High",
      qualification: "Normal OFC: bottom must beat middle, and middle must beat top.",
      scoring: [
        "Top: pairs 66–AA score 1–9; trips 222–AAA score 10–22.",
        "Middle: trips 2, straight 4, flush 8, boat 12, quads 20, straight flush 30, royal flush 50.",
        "Bottom: straight 2, flush 4, boat 6, quads 10, straight flush 15, royal flush 25.",
      ],
      repeat: "Trips on top or quads or better in the middle or bottom.",
    },
    {
      id: "low",
      title: "Low",
      qualification: "Middle needs a 10-high or lower 2–7 low. Pairs, straights, and flushes do not qualify; aces are high.",
      scoring: ["7-high: 4", "8-high: 2", "9-high: 1", "10-high: 0"],
      repeat: "Trips on top, 7-5-4-3-2 in the middle, or quads or better on the bottom.",
    },
    {
      id: "badeucey",
      title: "Badeucey",
      qualification: "The same five middle cards need both a qualifying 2–7 low and four unpaired cards of different suits for 2–5 Badugi. Aces are high.",
      scoring: ["Low: 7-high 4, 8-high 2, 9-high 1.", "Badugi: 5-high 12, 6-high 8, 7-high 4."],
      repeat: "Trips on top; both 7-5-4-3-2 low and a 5-4-3-2 Badugi in the middle; or quads or better on the bottom.",
    },
    {
      id: "badugijack",
      title: "BadugiJack",
      qualification: "Split six middle cards: 3 Badugi + 3 blackjack, or 4 Badugi + 2 blackjack. Badugi cards need unique ranks and suits; blackjack needs 17 or more without busting.",
      scoring: [
        "Four-card Badugi: 9-high 1, 8-high 2, 7-high 3, 6-high 5, 5-high 8, 4-high wheel 13. Aces are low.",
        "Blackjack: 17 scores 0, 18 scores 1, 19 scores 2, 20 scores 3, three-card 21 scores 5, A + ten-value blackjack scores 8, and suited blackjack scores 13.",
      ],
      repeat: "Trips on top; a 5-high or better four-card Badugi plus natural blackjack; or quads or better on the bottom.",
    },
    {
      id: "cribbage",
      title: "Cribbage",
      qualification: "Middle needs at least 12 cribbage points.",
      scoring: [
        "Each combination totaling 15 scores 2. Each pair scores 2.",
        "Runs score their maximal length with duplicate-card multiplicity (for example, 6-7-7-8-8 scores four runs of three).",
        "Four-card flush: 4; five-card flush: 5. Each jack sharing its suit with another card scores 1.",
      ],
      repeat: "Trips on top, 24 or more cribbage points in the middle, or quads or better on the bottom.",
    },
  ];

  const virtualDeck = [];
  SUITS.forEach((suit) => RANKS.forEach((rank) => virtualDeck.push(makeCard(`${RANK_LABEL[rank]}${suit}`))));
  const maskCache = new Map();

  function normalizeVariant(value) {
    const id = String(value || "high").toLowerCase();
    return VARIANTS[id] ? id : "high";
  }

  function makeCard(id) {
    if (/^JK[12]$/i.test(String(id))) return { id: String(id).toUpperCase(), rank: 0, suit: "", joker: true };
    const text = String(id);
    const rankText = text[0].toUpperCase();
    const rank = rankText === "A" ? 14 : rankText === "K" ? 13 : rankText === "Q" ? 12 : rankText === "J" ? 11 : rankText === "T" ? 10 : Number(rankText);
    return { id: `${RANK_LABEL[rank]}${text[1].toLowerCase()}`, rank, suit: text[1].toLowerCase(), joker: false };
  }

  function parseCards(ids) {
    return ids.map((id, handIndex) => ({ ...makeCard(id), handIndex }));
  }

  function encodeStrength(category, ranks) {
    let value = category;
    for (let index = 0; index < 5; index += 1) value = value * 15 + (ranks[index] || 0);
    return value;
  }

  function makeHighEval(category, ranks, name) {
    return { category, ranks, mainRank: ranks[0] || 0, name, strength: encodeStrength(category, ranks) };
  }

  function rankGroups(cards) {
    const counts = new Map();
    cards.forEach((card) => counts.set(card.rank, (counts.get(card.rank) || 0) + 1));
    return Array.from(counts, ([rank, count]) => ({ rank, count })).sort((a, b) => b.count - a.count || b.rank - a.rank);
  }

  function straightHigh(ranks) {
    const unique = Array.from(new Set(ranks)).sort((a, b) => b - a);
    if (unique.includes(14)) unique.push(1);
    for (let index = 0; index <= unique.length - 5; index += 1) {
      if (unique[index] - unique[index + 4] === 4) return unique[index] === 5 ? 5 : unique[index];
    }
    return 0;
  }

  function evaluateHighFive(cards) {
    const groups = rankGroups(cards);
    const ranks = cards.map((card) => card.rank);
    const flush = cards.every((card) => card.suit === cards[0].suit);
    const straight = straightHigh(ranks);
    if (flush && straight) return makeHighEval(CATEGORY.STRAIGHT_FLUSH, [straight], straight === 14 ? "Royal flush" : `${RANK_LABEL[straight]}-high straight flush`);
    if (groups[0].count === 4) return makeHighEval(CATEGORY.QUADS, [groups[0].rank, groups[1].rank], `Four ${RANK_NAME[groups[0].rank]}`);
    if (groups[0].count === 3 && groups[1] && groups[1].count === 2) return makeHighEval(CATEGORY.FULL_HOUSE, [groups[0].rank, groups[1].rank], `${RANK_LABEL[groups[0].rank]} full of ${RANK_LABEL[groups[1].rank]}`);
    const sorted = ranks.slice().sort((a, b) => b - a);
    if (flush) return makeHighEval(CATEGORY.FLUSH, sorted, `${RANK_LABEL[sorted[0]]}-high flush`);
    if (straight) return makeHighEval(CATEGORY.STRAIGHT, [straight], `${RANK_LABEL[straight]}-high straight`);
    if (groups[0].count === 3) {
      const kickers = groups.filter((group) => group.count === 1).map((group) => group.rank).sort((a, b) => b - a);
      return makeHighEval(CATEGORY.TRIPS, [groups[0].rank].concat(kickers), `Three ${RANK_NAME[groups[0].rank]}`);
    }
    if (groups[0].count === 2 && groups[1] && groups[1].count === 2) {
      const pairs = groups.filter((group) => group.count === 2).map((group) => group.rank).sort((a, b) => b - a);
      const kicker = groups.find((group) => group.count === 1).rank;
      return makeHighEval(CATEGORY.TWO_PAIR, pairs.concat(kicker), `${RANK_LABEL[pairs[0]]} and ${RANK_LABEL[pairs[1]]}`);
    }
    if (groups[0].count === 2) {
      const kickers = groups.filter((group) => group.count === 1).map((group) => group.rank).sort((a, b) => b - a);
      return makeHighEval(CATEGORY.PAIR, [groups[0].rank].concat(kickers), `Pair of ${RANK_NAME[groups[0].rank]}`);
    }
    return makeHighEval(CATEGORY.HIGH, sorted, `${RANK_LABEL[sorted[0]]}-high`);
  }

  function evaluateHighTop(cards) {
    const groups = rankGroups(cards);
    if (groups[0].count === 3) return makeHighEval(CATEGORY.TRIPS, [groups[0].rank], `Three ${RANK_NAME[groups[0].rank]}`);
    if (groups[0].count === 2) {
      const kicker = groups.find((group) => group.count === 1)?.rank || 0;
      return makeHighEval(CATEGORY.PAIR, [groups[0].rank, kicker], `Pair of ${RANK_NAME[groups[0].rank]}`);
    }
    const ranks = cards.map((card) => card.rank).sort((a, b) => b - a);
    return makeHighEval(CATEGORY.HIGH, ranks, `${RANK_LABEL[ranks[0]]}-high`);
  }

  function topRoyalty(evaluation) {
    if (evaluation.category === CATEGORY.PAIR && evaluation.mainRank >= 6) return evaluation.mainRank - 5;
    if (evaluation.category === CATEGORY.TRIPS) return evaluation.mainRank + 8;
    return 0;
  }

  function highFiveRoyalty(evaluation, role) {
    const middle = role === "middle";
    if (evaluation.category === CATEGORY.TRIPS) return middle ? 2 : 0;
    if (evaluation.category === CATEGORY.STRAIGHT) return middle ? 4 : 2;
    if (evaluation.category === CATEGORY.FLUSH) return middle ? 8 : 4;
    if (evaluation.category === CATEGORY.FULL_HOUSE) return middle ? 12 : 6;
    if (evaluation.category === CATEGORY.QUADS) return middle ? 20 : 10;
    if (evaluation.category === CATEGORY.STRAIGHT_FLUSH) {
      if (evaluation.mainRank === 14) return middle ? 50 : 25;
      return middle ? 30 : 15;
    }
    return 0;
  }

  function isTopLegalAgainstFive(top, five) {
    if (five.category >= CATEGORY.STRAIGHT) return true;
    if (five.category === CATEGORY.TRIPS) return top.category < CATEGORY.TRIPS || top.mainRank <= five.mainRank;
    if (five.category === CATEGORY.TWO_PAIR) return top.category < CATEGORY.TRIPS;
    if (five.category === CATEGORY.PAIR) return top.category === CATEGORY.HIGH || (top.category === CATEGORY.PAIR && top.mainRank <= five.mainRank);
    return top.category === CATEGORY.HIGH && top.strength <= five.strength;
  }

  function lowQuality(ranks, aceLow) {
    const normalized = ranks.map((rank) => (aceLow && rank === 14 ? 1 : rank)).sort((a, b) => b - a);
    return normalized.reduce((value, rank) => value * 15 + (15 - rank), 0);
  }

  function evaluateDeuceSeven(cards) {
    const groups = rankGroups(cards);
    const ranks = cards.map((card) => card.rank);
    const sorted = ranks.slice().sort((a, b) => b - a);
    const flush = cards.every((card) => card.suit === cards[0].suit);
    const straight = Boolean(straightHigh(ranks));
    const clean = groups.every((group) => group.count === 1) && !flush && !straight;
    const qualifies = clean && sorted[0] <= 10;
    const high = clean ? sorted[0] : 99;
    const points = qualifies ? (high <= 7 ? 4 : high === 8 ? 2 : high === 9 ? 1 : 0) : 0;
    const wheel = qualifies && sorted.join(",") === "7,5,4,3,2";
    const reason = groups.some((group) => group.count > 1) ? "paired" : flush ? "flush" : straight ? "straight" : sorted[0] > 10 ? "above 10-high" : "not qualified";
    return {
      qualifies,
      points,
      repeat: wheel,
      wheel,
      high,
      ranks: sorted,
      quality: clean ? lowQuality(sorted, false) : -1,
      name: qualifies ? `${RANK_LABEL[high]}-high low` : `No low (${reason})`,
    };
  }

  function combinations(items, size) {
    const result = [];
    function visit(start, picked) {
      if (picked.length === size) {
        result.push(picked.slice());
        return;
      }
      for (let index = start; index <= items.length - (size - picked.length); index += 1) {
        picked.push(items[index]);
        visit(index + 1, picked);
        picked.pop();
      }
    }
    visit(0, []);
    return result;
  }

  function isBadugi(cards) {
    return new Set(cards.map((card) => card.rank)).size === cards.length && new Set(cards.map((card) => card.suit)).size === cards.length;
  }

  function bestBadugi(cards, size, aceLow) {
    let best = null;
    combinations(cards, size).forEach((subset) => {
      if (!isBadugi(subset)) return;
      const ranks = subset.map((card) => (aceLow && card.rank === 14 ? 1 : card.rank)).sort((a, b) => b - a);
      const quality = lowQuality(ranks, false);
      const candidate = { cards: subset, ranks, high: ranks[0], quality, qualifies: true };
      if (!best || candidate.quality > best.quality) best = candidate;
    });
    return best;
  }

  function evaluateBadeucey(cards) {
    const low = evaluateDeuceSeven(cards);
    const badugi = bestBadugi(cards, 4, false);
    const badugiPoints = !badugi ? 0 : badugi.high <= 5 ? 12 : badugi.high === 6 ? 8 : badugi.high === 7 ? 4 : 0;
    const qualifies = low.qualifies && Boolean(badugi);
    const repeat = qualifies && low.wheel && badugi.ranks.join(",") === "5,4,3,2";
    const badugiLabel = badugi ? `${RANK_LABEL[badugi.high]}-high Badugi` : "No four-card Badugi";
    const scoreComponents = qualifies
      ? [
          { key: "badugi", label: badugiLabel, points: badugiPoints },
          { key: "low", label: low.name, points: low.points },
        ]
      : [];
    return {
      qualifies,
      points: qualifies ? low.points + badugiPoints : 0,
      repeat,
      quality: qualifies ? low.quality * 1e6 + badugi.quality : -1,
      low,
      badugi: badugi ? { ...badugi, points: badugiPoints } : null,
      scoreComponents,
      name: qualifies ? `${badugiLabel} + ${low.name}` : "Badeucey does not qualify",
      detail: qualifies ? scoreComponents.map((component) => `${component.label} ${component.points}`).join(" + ") : "Needs 10-low and four-card Badugi",
    };
  }

  function blackjackValue(cards) {
    let total = cards.reduce((sum, card) => sum + (card.rank === 14 ? 11 : Math.min(card.rank, 10)), 0);
    let aces = cards.filter((card) => card.rank === 14).length;
    while (total > 21 && aces > 0) {
      total -= 10;
      aces -= 1;
    }
    const natural = cards.length === 2 && cards.some((card) => card.rank === 14) && cards.some((card) => card.rank >= 10 && card.rank <= 13);
    const suitedNatural = natural && cards[0].suit === cards[1].suit;
    return { total, natural, suitedNatural, bust: total > 21 };
  }

  function evaluateBadugiJackConcrete(badugiCards, blackjackCards) {
    const validSizes = (badugiCards.length === 3 && blackjackCards.length === 3) || (badugiCards.length === 4 && blackjackCards.length === 2);
    const badugiValid = validSizes && isBadugi(badugiCards);
    const badugiRanks = badugiCards.map((card) => (card.rank === 14 ? 1 : card.rank)).sort((a, b) => b - a);
    const badugiHigh = badugiValid ? badugiRanks[0] : 99;
    const badugiPointsTable = { 4: 13, 5: 8, 6: 5, 7: 3, 8: 2, 9: 1 };
    const badugiPoints = badugiValid && badugiCards.length === 4 ? badugiPointsTable[badugiHigh] || 0 : 0;
    const blackjack = blackjackValue(blackjackCards);
    const blackjackQualifies = !blackjack.bust && blackjack.total >= 17;
    const blackjackPoints = !blackjackQualifies
      ? 0
      : blackjack.suitedNatural
        ? 13
        : blackjack.natural
          ? 8
          : blackjackCards.length === 3 && blackjack.total === 21
            ? 5
            : blackjack.total === 20
              ? 3
              : blackjack.total === 19
                ? 2
                : blackjack.total === 18
                  ? 1
                  : 0;
    const qualifies = badugiValid && blackjackQualifies;
    const repeat = qualifies && badugiCards.length === 4 && badugiHigh <= 5 && blackjack.natural;
    const badugiLabel = `${RANK_LABEL[badugiHigh] || badugiHigh}-high Badugi`;
    const blackjackLabel = blackjack.suitedNatural
      ? "Suited blackjack"
      : blackjack.natural
        ? "Blackjack"
        : `${blackjack.total} blackjack`;
    const scoreComponents = qualifies
      ? [
          { key: "badugi", label: badugiLabel, points: badugiPoints },
          { key: "blackjack", label: blackjackLabel, points: blackjackPoints },
        ]
      : [];
    return {
      qualifies,
      points: qualifies ? badugiPoints + blackjackPoints : 0,
      repeat,
      quality: qualifies ? (15 - badugiHigh) * 100 + blackjack.total + (blackjack.natural ? 50 : 0) : -1,
      badugi: { valid: badugiValid, ranks: badugiRanks, high: badugiHigh, points: badugiPoints },
      blackjack: { ...blackjack, qualifies: blackjackQualifies, points: blackjackPoints },
      scoreComponents,
      name: qualifies ? `${badugiLabel} + ${blackjackLabel}` : "BadugiJack does not qualify",
      detail: qualifies ? scoreComponents.map((component) => `${component.label} ${component.points}`).join(" + ") : "Needs a valid Badugi and 17+ blackjack",
    };
  }

  function cribbageScore(cards) {
    let fifteens = 0;
    for (let mask = 1; mask < 1 << cards.length; mask += 1) {
      if ((mask & (mask - 1)) === 0) continue;
      let total = 0;
      for (let index = 0; index < cards.length; index += 1) {
        if (mask & (1 << index)) total += cards[index].rank === 14 ? 1 : Math.min(cards[index].rank, 10);
      }
      if (total === 15) fifteens += 2;
    }

    const groups = rankGroups(cards);
    const pairs = groups.reduce((sum, group) => sum + group.count * (group.count - 1), 0);
    const countByRank = new Map(groups.map((group) => [group.rank === 14 ? 1 : group.rank, group.count]));
    let runPoints = 0;
    for (let length = 5; length >= 3 && runPoints === 0; length -= 1) {
      for (let start = 1; start <= 14 - length + 1; start += 1) {
        let multiplier = 1;
        for (let rank = start; rank < start + length; rank += 1) {
          multiplier *= countByRank.get(rank) || 0;
        }
        if (multiplier) runPoints += length * multiplier;
      }
    }

    const suitCounts = new Map();
    cards.forEach((card) => suitCounts.set(card.suit, (suitCounts.get(card.suit) || 0) + 1));
    const maxSuit = Math.max(...suitCounts.values());
    const flush = maxSuit >= 5 ? 5 : maxSuit === 4 ? 4 : 0;
    const nobs = cards.filter((card) => card.rank === 11 && cards.some((other) => other !== card && other.suit === card.suit)).length;
    const total = fifteens + pairs + runPoints + flush + nobs;
    return { total, fifteens, pairs, runs: runPoints, flush, nobs };
  }

  function evaluateCribbage(cards) {
    const breakdown = cribbageScore(cards);
    return {
      qualifies: breakdown.total >= 12,
      points: breakdown.total,
      repeat: breakdown.total >= 24,
      quality: breakdown.total,
      breakdown,
      name: `${breakdown.total} cribbage pts`,
      detail: `${breakdown.fifteens} fifteens · ${breakdown.pairs} pairs · ${breakdown.runs} runs · ${breakdown.flush} flush · ${breakdown.nobs} jacks`,
    };
  }

  function assignmentValue(assignments) {
    let value = 0;
    Array.from(assignments.values()).forEach((card) => {
      value = value * 100 + card.rank * 5 + (SUITS.length - SUITS.indexOf(card.suit));
    });
    return value;
  }

  function enumerateWild(ids, evaluator, options = {}) {
    const cards = ids.map(makeCard);
    const jokers = cards.filter((card) => card.joker);
    const naturals = cards.filter((card) => !card.joker);
    const blocked = new Set(naturals.map((card) => card.id));
    const available = virtualDeck.filter((card) => !blocked.has(card.id));
    const candidates = [];
    const consider = (replacements) => {
      const replacementById = new Map();
      jokers.forEach((joker, index) => replacementById.set(joker.id, replacements[index]));
      const concrete = cards.map((card) => (card.joker ? replacementById.get(card.id) : card));
      const evaluation = evaluator(concrete, replacementById);
      candidates.push({ evaluation, assignments: replacementById, assignmentValue: assignmentValue(replacementById) });
    };
    if (!jokers.length) consider([]);
    else if (jokers.length === 1) available.forEach((card) => consider([card]));
    else {
      available.forEach((first) => available.forEach((second) => {
        if (first.id !== second.id) consider([first, second]);
      }));
    }

    if (options.dedupe === false) return candidates;
    const deduped = new Map();
    candidates.forEach((candidate) => {
      const key = options.key ? options.key(candidate.evaluation) : JSON.stringify(candidate.evaluation);
      const current = deduped.get(key);
      if (!current || candidate.assignmentValue > current.assignmentValue) deduped.set(key, candidate);
    });
    return Array.from(deduped.values());
  }

  function highRowCandidates(ids, role) {
    const top = role === "top";
    return enumerateWild(
      ids,
      (cards) => {
        const evaluation = top ? evaluateHighTop(cards) : evaluateHighFive(cards);
        const points = top ? topRoyalty(evaluation) : highFiveRoyalty(evaluation, role);
        const repeat = top ? evaluation.category === CATEGORY.TRIPS : evaluation.category >= CATEGORY.QUADS;
        return { ...evaluation, points, repeat, qualifies: true, quality: evaluation.strength };
      },
      { key: (evaluation) => String(evaluation.strength) }
    );
  }

  function variantMiddleCandidates(variant, rows) {
    if (variant === "high") return highRowCandidates(rows.middle || [], "middle");
    if (variant === "low") return enumerateWild(rows.middle || [], evaluateDeuceSeven, { key: middleKey });
    if (variant === "badeucey") return enumerateWild(rows.middle || [], evaluateBadeucey, { key: middleKey });
    if (variant === "cribbage") return enumerateWild(rows.middle || [], evaluateCribbage, { key: middleKey });
    if (variant === "badugijack") {
      const badugiIds = rows.middleBadugi || [];
      const blackjackIds = rows.middleBlackjack || [];
      const combined = badugiIds.concat(blackjackIds);
      return enumerateWild(
        combined,
        (cards) => evaluateBadugiJackConcrete(cards.slice(0, badugiIds.length), cards.slice(badugiIds.length)),
        { key: middleKey }
      );
    }
    return [];
  }

  function middleKey(evaluation) {
    return [evaluation.qualifies ? 1 : 0, evaluation.points, evaluation.repeat ? 1 : 0, evaluation.quality, evaluation.name].join("|");
  }

  function bestCandidate(candidates, predicate) {
    let best = null;
    candidates.forEach((candidate) => {
      if (predicate && !predicate(candidate)) return;
      if (!best || compareRowCandidate(candidate, best) > 0) best = candidate;
    });
    return best;
  }

  function compareRowCandidate(left, right) {
    const a = left.evaluation;
    const b = right.evaluation;
    if (Boolean(a.qualifies) !== Boolean(b.qualifies)) return a.qualifies ? 1 : -1;
    if (Boolean(a.repeat) !== Boolean(b.repeat)) return a.repeat ? 1 : -1;
    if ((a.points || 0) !== (b.points || 0)) return (a.points || 0) - (b.points || 0);
    if ((a.quality || 0) !== (b.quality || 0)) return (a.quality || 0) - (b.quality || 0);
    return left.assignmentValue - right.assignmentValue;
  }

  function rowsComplete(variant, rows) {
    if (!rows || (rows.top || []).length !== 3 || (rows.bottom || []).length !== 5) return false;
    if (variant === "badugijack") {
      const badugi = (rows.middleBadugi || []).length;
      const blackjack = (rows.middleBlackjack || []).length;
      return badugi + blackjack === 6 && ((badugi === 3 && blackjack === 3) || (badugi === 4 && blackjack === 2));
    }
    return (rows.middle || []).length === 5;
  }

  function mergeAssignments() {
    const result = new Map();
    Array.from(arguments).forEach((map) => map && map.forEach((card, id) => result.set(id, card)));
    return result;
  }

  function compareBoard(left, right) {
    if (!right) return 1;
    if (Boolean(left.repeat) !== Boolean(right.repeat)) return left.repeat ? 1 : -1;
    if (left.points !== right.points) return left.points - right.points;
    if (left.tieQuality !== right.tieQuality) return left.tieQuality - right.tieQuality;
    return assignmentValue(left.assignments) - assignmentValue(right.assignments);
  }

  function evaluateBoard(cardIds, rows, options = {}) {
    const variant = normalizeVariant(options.variant);
    if (!rowsComplete(variant, rows)) return { legal: false, complete: false, points: 0, repeat: false, assignments: new Map(), rowEvals: {}, rowNames: {} };
    const topCandidates = highRowCandidates(rows.top, "top");
    const bottomCandidates = highRowCandidates(rows.bottom, "bottom");
    const middleCandidates = variantMiddleCandidates(variant, rows);
    let best = null;

    bottomCandidates.forEach((bottom) => middleCandidates.forEach((middle) => topCandidates.forEach((top) => {
      const middleEval = middle.evaluation;
      const legal = variant === "high"
        ? bottom.evaluation.strength >= middleEval.strength && isTopLegalAgainstFive(top.evaluation, middleEval)
        : middleEval.qualifies && isTopLegalAgainstFive(top.evaluation, bottom.evaluation);
      if (!legal) return;
      const points = top.evaluation.points + middleEval.points + bottom.evaluation.points;
      const repeat = top.evaluation.repeat || middleEval.repeat || bottom.evaluation.repeat;
      const candidate = {
        legal: true,
        complete: true,
        points,
        repeat,
        assignments: mergeAssignments(top.assignments, middle.assignments, bottom.assignments),
        rowEvals: { top: top.evaluation, middle: middleEval, bottom: bottom.evaluation },
        rowNames: { top: top.evaluation.name, middle: middleEval.name, bottom: bottom.evaluation.name },
        rowPoints: { top: top.evaluation.points, middle: middleEval.points, bottom: bottom.evaluation.points },
        details: { middle: middleEval.detail || "" },
        tieQuality: top.evaluation.quality + middleEval.quality + bottom.evaluation.quality,
      };
      if (compareBoard(candidate, best) > 0) best = candidate;
    })));

    return best || { legal: false, complete: true, points: 0, repeat: false, assignments: new Map(), rowEvals: {}, rowNames: {} };
  }

  function previewRows(cardIds, rows, options = {}) {
    const variant = normalizeVariant(options.variant);
    if (rowsComplete(variant, rows)) return evaluateBoard(cardIds, rows, { variant });
    const rowEvals = {};
    const assignments = new Map();
    const take = (key, candidates) => {
      const best = bestCandidate(candidates);
      if (!best) return;
      rowEvals[key] = best.evaluation;
      best.assignments.forEach((card, id) => assignments.set(id, card));
    };
    if ((rows.top || []).length === 3) take("top", highRowCandidates(rows.top, "top"));
    if ((rows.bottom || []).length === 5) take("bottom", highRowCandidates(rows.bottom, "bottom"));
    if (variant === "badugijack") {
      const badugi = (rows.middleBadugi || []).length;
      const blackjack = (rows.middleBlackjack || []).length;
      if (badugi + blackjack === 6 && ((badugi === 3 && blackjack === 3) || (badugi === 4 && blackjack === 2))) take("middle", variantMiddleCandidates(variant, rows));
    } else if ((rows.middle || []).length === 5) take("middle", variantMiddleCandidates(variant, rows));
    return { legal: false, complete: false, assignments, rowEvals, rowNames: Object.fromEntries(Object.entries(rowEvals).map(([key, value]) => [key, value.name])) };
  }

  function combinationMasks(n, size) {
    const key = `${n}:${size}`;
    if (maskCache.has(key)) return maskCache.get(key);
    const result = [];
    function visit(start, picked, mask) {
      if (picked === size) {
        result.push(mask);
        return;
      }
      for (let index = start; index <= n - (size - picked); index += 1) visit(index + 1, picked + 1, mask | (1 << index));
    }
    visit(0, 0, 0);
    maskCache.set(key, result);
    return result;
  }

  function idsForMask(ids, mask) {
    const result = [];
    for (let index = 0; index < ids.length; index += 1) if (mask & (1 << index)) result.push(ids[index]);
    return result;
  }

  function maskForIds(allIds, selectedIds) {
    const wanted = new Set(selectedIds);
    let mask = 0;
    allIds.forEach((id, index) => { if (wanted.has(id)) mask |= 1 << index; });
    return mask;
  }

  function bestMiddleForMask(variant, ids) {
    if (variant !== "badugijack") {
      const candidates = variantMiddleCandidates(variant, { middle: ids });
      return bestCandidate(candidates, (candidate) => variant === "high" || candidate.evaluation.qualifies);
    }
    let best = null;
    [3, 4].forEach((badugiSize) => combinations(ids, badugiSize).forEach((badugiIds) => {
      const chosen = new Set(badugiIds);
      const blackjackIds = ids.filter((id) => !chosen.has(id));
      const candidate = bestCandidate(variantMiddleCandidates(variant, { middleBadugi: badugiIds, middleBlackjack: blackjackIds }), (entry) => entry.evaluation.qualifies);
      if (!candidate) return;
      const withSplit = { ...candidate, badugiIds: badugiIds.slice(), blackjackIds };
      if (!best || compareRowCandidate(withSplit, best) > 0) best = withSplit;
    }));
    return best;
  }

  function constraintKey(evaluation) {
    if (evaluation.category >= CATEGORY.STRAIGHT) return "all";
    if (evaluation.category === CATEGORY.TRIPS) return `t${evaluation.mainRank}`;
    if (evaluation.category === CATEGORY.TWO_PAIR) return "no-trips";
    if (evaluation.category === CATEGORY.PAIR) return `p${evaluation.mainRank}`;
    return `h${evaluation.strength}`;
  }

  function chooseTop(ids, topMasks, availableMask, constraint, cache) {
    const key = `${availableMask}:${constraintKey(constraint)}`;
    if (cache.has(key)) return cache.get(key);
    let best = null;
    topMasks.forEach((mask) => {
      if ((mask & availableMask) !== mask) return;
      highRowCandidates(idsForMask(ids, mask), "top").forEach((candidate) => {
        if (!isTopLegalAgainstFive(candidate.evaluation, constraint)) return;
        const entry = { ...candidate, mask, ids: idsForMask(ids, mask) };
        if (!best || compareRowCandidate(entry, best) > 0) best = entry;
      });
    });
    cache.set(key, best);
    return best;
  }

  function maskPatternEstimate(ids, mask, variant, role) {
    const cards = idsForMask(ids, mask).map(makeCard);
    const naturals = cards.filter((card) => !card.joker);
    const groups = rankGroups(naturals);
    const rankCounts = groups.map((group) => group.count).sort((a, b) => b - a);
    const suitCounts = Array.from(new Set(naturals.map((card) => card.suit)), (suit) => naturals.filter((card) => card.suit === suit).length);
    const distinctRanks = new Set(naturals.map((card) => card.rank)).size;
    const distinctSuits = new Set(naturals.map((card) => card.suit)).size;
    const lowRanks = naturals.filter((card) => card.rank <= 10).length;
    const maxRank = naturals.length ? Math.max(...naturals.map((card) => card.rank)) : 0;
    const pairShape = rankCounts.reduce((sum, count) => sum + count * count, 0);
    const flushShape = suitCounts.length ? Math.max(...suitCounts) : 0;

    if (role === "bottom" || variant === "high") {
      let connected = 0;
      const rankSet = new Set(naturals.map((card) => card.rank === 14 ? 1 : card.rank));
      if (naturals.some((card) => card.rank === 14)) rankSet.add(14);
      for (let start = 1; start <= 10; start += 1) {
        let count = 0;
        for (let rank = start; rank < start + 5; rank += 1) if (rankSet.has(rank)) count += 1;
        connected = Math.max(connected, count);
      }
      return pairShape * 10000 + flushShape * 1400 + connected * 500 + naturals.reduce((sum, card) => sum + card.rank, 0);
    }

    if (variant === "low") {
      return distinctRanks * 12000 + lowRanks * 1800 + distinctSuits * 250 - pairShape * 900 - flushShape * 160 - maxRank;
    }
    if (variant === "badeucey") {
      return distinctRanks * 10000 + distinctSuits * 7000 + lowRanks * 1800 - pairShape * 700 - maxRank;
    }
    if (variant === "badugijack") {
      const blackjackCards = naturals.filter((card) => card.rank === 14 || card.rank >= 7).length;
      return distinctRanks * 7000 + distinctSuits * 6500 + blackjackCards * 1200 - pairShape * 350 - maxRank;
    }

    let fifteenShape = 0;
    for (let first = 0; first < naturals.length; first += 1) {
      for (let second = first + 1; second < naturals.length; second += 1) {
        const firstValue = naturals[first].rank === 14 ? 1 : Math.min(naturals[first].rank, 10);
        const secondValue = naturals[second].rank === 14 ? 1 : Math.min(naturals[second].rank, 10);
        if (firstValue + secondValue === 15) fifteenShape += 1;
      }
    }
    return pairShape * 8000 + fifteenShape * 5000 + distinctRanks * 500 + flushShape * 300;
  }

  function maskHash(mask) {
    let value = Math.imul(mask ^ 0x9e3779b9, 0x85ebca6b);
    value ^= value >>> 13;
    return value >>> 0;
  }

  function limitMasks(masks, ids, limit, variant, role) {
    if (!limit || masks.length <= limit) return masks;
    const jokerTotal = ids.filter((id) => makeCard(id).joker).length;
    const entries = masks.map((mask) => {
      const jokerCount = idsForMask(ids, mask).filter((id) => makeCard(id).joker).length;
      return { mask, jokerCount, estimate: maskPatternEstimate(ids, mask, variant, role) };
    });
    const weights = jokerTotal === 2 ? [0.25, 0.5, 0.25] : jokerTotal === 1 ? [0.45, 0.55] : [1];
    const selected = new Set();

    weights.forEach((weight, jokerCount) => {
      const group = entries.filter((entry) => entry.jokerCount === jokerCount);
      const quota = Math.min(group.length, Math.max(1, Math.round(limit * weight)));
      const ranked = group.slice().sort((a, b) => b.estimate - a.estimate || a.mask - b.mask);
      const includeWeak = variant === "high" && role === "middle";
      const weakCount = includeWeak ? Math.floor(quota * 0.2) : 0;
      const bestCount = Math.min(quota - weakCount, Math.ceil(quota * (includeWeak ? 0.6 : 0.8)));
      ranked.slice(0, bestCount).forEach((entry) => selected.add(entry.mask));
      if (weakCount) ranked.slice(-weakCount).forEach((entry) => selected.add(entry.mask));
      ranked.filter((entry) => !selected.has(entry.mask)).sort((a, b) => maskHash(a.mask) - maskHash(b.mask)).slice(0, quota - bestCount - weakCount).forEach((entry) => selected.add(entry.mask));
    });

    if (selected.size < limit) {
      entries.filter((entry) => !selected.has(entry.mask)).sort((a, b) => b.estimate - a.estimate || a.mask - b.mask).slice(0, limit - selected.size).forEach((entry) => selected.add(entry.mask));
    }
    return masks.filter((mask) => selected.has(mask)).slice(0, limit);
  }

  function solveHand(cardIds, options = {}) {
    const started = now();
    const variant = normalizeVariant(options.variant);
    const mode = options.mode === "fast" ? "fast" : "exact";
    const ids = cardIds.slice();
    const n = ids.length;
    const middleSize = VARIANTS[variant].middleSize;
    const boardSize = 3 + middleSize + 5;
    if (n < boardSize || n > 17) throw new Error(`${VARIANTS[variant].label} Fantasyland needs ${boardSize} to 17 cards.`);

    const fullMask = (1 << n) - 1;
    const allMiddleMasks = combinationMasks(n, middleSize);
    const allBottomMasks = combinationMasks(n, 5);
    const topMasks = combinationMasks(n, 3);
    const maskLimit = mode === "fast" && Number.isFinite(options.maskLimit) ? Math.max(24, Math.floor(options.maskLimit)) : 0;
    const middleMasks = limitMasks(allMiddleMasks, ids, maskLimit, variant, "middle");
    const bottomMasks = limitMasks(allBottomMasks, ids, maskLimit, variant, "bottom");
    const middleEntries = [];
    const middleCache = new Map();
    middleMasks.forEach((mask) => {
      const rowIds = idsForMask(ids, mask);
      let candidate;
      if (variant === "high") candidate = null;
      else candidate = bestMiddleForMask(variant, rowIds);
      if (variant !== "high" && !candidate) return;
      middleCache.set(mask, candidate);
      const estimate = variant === "high" ? cheapHighEstimate(rowIds, "middle") : candidate.evaluation.points * 1e7 + candidate.evaluation.quality;
      middleEntries.push({ mask, estimate });
    });

    const bottomEntries = bottomMasks.map((mask) => {
      const rowIds = idsForMask(ids, mask);
      const candidate = bestCandidate(highRowCandidates(rowIds, "bottom"));
      return { mask, candidate, estimate: candidate.evaluation.points * 1e8 + candidate.evaluation.strength };
    });
    const beamLimit = Number.isFinite(options.beamLimit) ? Math.max(16, Math.floor(options.beamLimit)) : variant === "badugijack" ? 260 : 360;
    const middlePool = mode === "fast" ? takeBeam(middleEntries, beamLimit, variant === "high") : middleEntries;
    const bottomPool = mode === "fast" ? takeBeam(bottomEntries, beamLimit) : bottomEntries;
    const topCache = new Map();
    let best = null;
    let bestRoyalty = null;
    let bestRepeat = null;
    let legalBoards = 0;

    middlePool.forEach((middleEntry) => bottomPool.forEach((bottomEntry) => {
      if (middleEntry.mask & bottomEntry.mask) return;
      const bottom = bottomEntry.candidate;
      let middle = middleCache.get(middleEntry.mask);
      if (variant === "high") {
        middle = bestCandidate(highRowCandidates(idsForMask(ids, middleEntry.mask), "middle"), (candidate) => candidate.evaluation.strength <= bottom.evaluation.strength);
        if (!middle) return;
      }
      const availableMask = fullMask ^ middleEntry.mask ^ bottomEntry.mask;
      const topConstraint = variant === "high" ? middle.evaluation : bottom.evaluation;
      const top = chooseTop(ids, topMasks, availableMask, topConstraint, topCache);
      if (!top) return;
      legalBoards += 1;
      const repeat = top.evaluation.repeat || middle.evaluation.repeat || bottom.evaluation.repeat;
      const points = top.evaluation.points + middle.evaluation.points + bottom.evaluation.points;
      const usedMask = top.mask | middleEntry.mask | bottomEntry.mask;
      const solution = {
        points,
        repeat,
        usedMask,
        tieQuality: top.evaluation.quality + middle.evaluation.quality + bottom.evaluation.quality,
        top: { ids: top.ids, mask: top.mask, eval: top.evaluation, points: top.evaluation.points, assignments: top.assignments },
        middle: {
          ids: idsForMask(ids, middleEntry.mask),
          mask: middleEntry.mask,
          eval: middle.evaluation,
          points: middle.evaluation.points,
          assignments: middle.assignments,
          badugiIds: middle.badugiIds || null,
          blackjackIds: middle.blackjackIds || null,
        },
        bottom: { ids: idsForMask(ids, bottomEntry.mask), mask: bottomEntry.mask, eval: bottom.evaluation, points: bottom.evaluation.points, assignments: bottom.assignments },
        assignments: mergeAssignments(top.assignments, middle.assignments, bottom.assignments),
      };
      if (!bestRoyalty || points > bestRoyalty.points || (points === bestRoyalty.points && solution.tieQuality > bestRoyalty.tieQuality)) bestRoyalty = solution;
      if (repeat && (!bestRepeat || points > bestRepeat.points || (points === bestRepeat.points && solution.tieQuality > bestRepeat.tieQuality))) bestRepeat = solution;
      if (compareBoard(solution, best) > 0) best = solution;
    }));

    return {
      variant,
      cards: parseCards(ids),
      best: bestRepeat || best || bestRoyalty,
      bestRoyalty,
      bestRepeat,
      legalBoards,
      elapsedMs: now() - started,
      mode,
    };
  }

  function cheapHighEstimate(ids, role) {
    const candidate = bestCandidate(highRowCandidates(ids, role));
    return candidate.evaluation.points * 1e8 + candidate.evaluation.strength;
  }

  function takeBeam(entries, limit, includeWeak = false) {
    if (entries.length <= limit) return entries;
    const selected = new Map();
    entries.slice().sort((a, b) => b.estimate - a.estimate).slice(0, limit).forEach((entry) => selected.set(entry.mask, entry));
    entries.slice().sort((a, b) => (b.candidate?.evaluation?.strength || b.estimate) - (a.candidate?.evaluation?.strength || a.estimate)).slice(0, Math.ceil(limit / 3)).forEach((entry) => selected.set(entry.mask, entry));
    if (includeWeak) entries.slice().sort((a, b) => a.estimate - b.estimate).slice(0, Math.ceil(limit / 3)).forEach((entry) => selected.set(entry.mask, entry));
    return Array.from(selected.values());
  }

  function hasQualifyingMiddle(cardIds, variantValue) {
    const variant = normalizeVariant(variantValue);
    if (variant === "high") return true;
    const size = VARIANTS[variant].middleSize;
    const masks = combinationMasks(cardIds.length, size);
    for (const mask of masks) {
      if (bestMiddleForMask(variant, idsForMask(cardIds, mask))) return true;
    }
    return false;
  }

  function buildSeed(dateKey, cards, jokers, variantValue, counter) {
    const variant = VARIANTS[normalizeVariant(variantValue)];
    return `${dateKey}-${cards}C-${jokers}J-${variant.seedLabel}-${counter}`;
  }

  function hashSeed(seed) {
    const text = String(seed);
    let hash = 1779033703 ^ text.length;
    for (let index = 0; index < text.length; index += 1) {
      hash = Math.imul(hash ^ text.charCodeAt(index), 3432918353);
      hash = (hash << 13) | (hash >>> 19);
    }
    hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
    return (hash ^ (hash >>> 16)) >>> 0;
  }

  function seededRandom(seed) {
    let value = hashSeed(seed);
    return function next() {
      value += 0x6d2b79f5;
      let result = Math.imul(value ^ (value >>> 15), 1 | value);
      result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
      return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
    };
  }

  function dealSeeded(cards, jokers, seed) {
    const rng = seededRandom(seed);
    const naturals = virtualDeck.map((card) => card.id);
    shuffle(naturals, rng);
    const hand = naturals.slice(0, Math.max(0, cards - jokers));
    for (let index = 1; index <= jokers; index += 1) hand.push(`JK${index}`);
    shuffle(hand, rng);
    return hand.slice(0, cards);
  }

  function shuffle(items, rng) {
    for (let index = items.length - 1; index > 0; index -= 1) {
      const target = Math.floor(rng() * (index + 1));
      [items[index], items[target]] = [items[target], items[index]];
    }
    return items;
  }

  function findQualifyingDeal(base, cards, jokers, variantValue, options = {}) {
    const variant = normalizeVariant(variantValue);
    const daily = options.daily !== false;
    const maxAttempts = options.maxAttempts || 5000;
    for (let counter = 0; counter < maxAttempts; counter += 1) {
      const rawSeed = daily
        ? buildSeed(base, cards, jokers, variant, counter)
        : `RANDOM-${base}-${cards}C-${jokers}J-${VARIANTS[variant].seedLabel}-${counter}`;
      const seed = daily ? rawSeed : hashSeed(rawSeed).toString(16).padStart(8, "0").toUpperCase();
      const ids = dealSeeded(cards, jokers, seed);
      if (hasQualifyingMiddle(ids, variant)) return { seed, rawSeed, counter, ids };
    }
    throw new Error(`Could not find a qualifying ${VARIANTS[variant].label} hand.`);
  }

  function now() {
    return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
  }

  return {
    CATEGORY,
    VARIANTS,
    VARIANT_ORDER,
    RULE_SECTIONS,
    normalizeVariant,
    makeCard,
    evaluateHighFive,
    evaluateHighTop,
    evaluateDeuceSeven,
    evaluateBadeucey,
    evaluateBadugiJackConcrete,
    cribbageScore,
    evaluateCribbage,
    topRoyalty,
    highFiveRoyalty,
    isTopLegalAgainstFive,
    rowsComplete,
    evaluateBoard,
    previewRows,
    solveHand,
    hasQualifyingMiddle,
    buildSeed,
    hashSeed,
    seededRandom,
    dealSeeded,
    findQualifyingDeal,
  };
});
