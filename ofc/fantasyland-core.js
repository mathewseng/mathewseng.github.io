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
  const VARIANT_ORDER = ["high", "low", "badeucey", "bdp", "badugijack", "doubleblackjack", "cribbage"];
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
      short: "Middle must make an unpaired, non-straight, non-flush Thi or better 2–7 low.",
    },
    badeucey: {
      id: "badeucey",
      seedLabel: "BADEUCEY",
      label: "Badeucey",
      minCards: 16,
      middleSize: 5,
      short: "16–17 cards. Middle must qualify as both 2–7 low and a four-card 2–5 Badugi.",
    },
    bdp: {
      id: "bdp",
      seedLabel: "BDP",
      label: "BDP",
      minCards: 17,
      middleSize: 5,
      short: "17 cards. Badugi on top, 2–7 low in the middle, and a pair or better on the bottom.",
    },
    badugijack: {
      id: "badugijack",
      seedLabel: "BADUGIJACK",
      label: "BadugiJack",
      middleSize: 6,
      boardSize: 13,
      short: "Place exactly 13 cards across the board, with a three/four-card Badugi and a two/three-card blackjack hand in the middle.",
    },
    doubleblackjack: {
      id: "doubleblackjack",
      seedLabel: "DOUBLEBLACKJACK",
      label: "Double Blackjack",
      compactLabel: "Double BJ",
      middleSize: 5,
      short: "Split the middle into fixed three-card and two-card blackjack hands; both need 17 or more without busting.",
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
        {
          label: "Top",
          items: [
            "Pair 66: 1pt",
            "Pair 77: 2pts",
            "Pair 88: 3pts",
            "Pair 99: 4pts",
            "Pair TT: 5pts",
            "Pair JJ: 6pts",
            "Pair QQ: 7pts",
            "Pair KK: 8pts",
            "Pair AA: 9pts",
            "Trips 222: 10pts",
            "Trips 333: 11pts",
            "Trips 444: 12pts",
            "Trips 555: 13pts",
            "Trips 666: 14pts",
            "Trips 777: 15pts",
            "Trips 888: 16pts",
            "Trips 999: 17pts",
            "Trips TTT: 18pts",
            "Trips JJJ: 19pts",
            "Trips QQQ: 20pts",
            "Trips KKK: 21pts",
            "Trips AAA: 22pts",
          ],
        },
        {
          label: "Middle",
          items: [
            "Trips: 2pts",
            "Straight: 4pts",
            "Flush: 8pts",
            "Boat: 12pts",
            "Quads: 20pts",
            "Straight Flush: 30pts",
            "Royal Flush: 50pts",
          ],
        },
        {
          label: "Bottom",
          items: [
            "Straight: 2pts",
            "Flush: 4pts",
            "Boat: 6pts",
            "Quads: 10pts",
            "Straight Flush: 15pts",
            "Royal Flush: 25pts",
          ],
        },
      ],
      repeat: "Trips on top or quads or better in the middle or bottom.",
    },
    {
      id: "low",
      title: "Low",
      qualification: "Middle needs Thi or lower in 2–7 low. Pairs, straights, and flushes do not qualify; aces are high.",
      scoring: [{ label: "Middle", items: ["7hi: 4pts", "8hi: 2pts", "9hi: 1pt", "Thi: 0pts"] }],
      repeat: "Trips on top, 7-5-4-3-2 in the middle, or quads or better on the bottom.",
    },
    {
      id: "badeucey",
      title: "Badeucey",
      qualification: "Fantasyland uses 16 or 17 cards. The same five middle cards need both a qualifying 2–7 low and four unpaired cards of different suits for 2–5 Badugi. Aces are high.",
      scoring: [
        { label: "2–7 Low", items: ["7hi: 4pts", "8hi: 2pts", "9hi: 1pt", "Thi: 0pts"] },
        { label: "Badugi", items: ["5hi: 12pts", "6hi: 8pts", "7hi: 4pts", "8hi: 0pts", "9hi: 0pts", "Thi: 0pts"] },
      ],
      repeat: "Trips on top; both 7-5-4-3-2 low and a 5-4-3-2 Badugi in the middle; or quads or better on the bottom.",
    },
    {
      id: "bdp",
      title: "BDP",
      qualification: "Fantasyland uses 17 cards. Badugi, Deuce, Pair: top needs three unpaired cards of different suits with aces low; middle needs Thi or lower in 2–7 low; bottom needs a pair or better.",
      scoring: [
        { label: "Top · 3-card Badugi", items: ["3hi: 12pts", "4hi: 8pts", "5hi: 4pts", "6hi or higher: 0pts"] },
        { label: "Middle · 2–7 Low", items: ["7hi: 12pts", "8hi: 6pts", "9hi: 3pts", "Thi: 0pts"] },
        {
          label: "Bottom · 3× royalties",
          items: ["Pair, Two Pair, Trips: 0pts", "Straight: 6pts", "Flush: 12pts", "Boat: 18pts", "Quads: 30pts", "Straight Flush: 45pts", "Royal Flush: 75pts"],
        },
      ],
      repeat: "Quads or better on the bottom.",
    },
    {
      id: "badugijack",
      title: "BadugiJack",
      qualification: "Place exactly 13 cards across the 15 available slots. Badugi needs 3 or 4 unique ranks and suits, with aces low; blackjack needs 2 or 3 cards totaling 17 or more without busting. The two empty slots may be in any row.",
      scoring: [
        {
          label: "Four-card Badugi",
          items: ["9hi: 1pt", "8hi: 2pts", "7hi: 3pts", "6hi: 5pts", "5hi: 8pts", "4hi wheel: 13pts"],
        },
        {
          label: "Blackjack",
          items: ["17: 0pts", "18: 1pt", "19: 2pts", "20: 3pts", "Three-card 21: 5pts", "BJ: 8pts", "Suited 21: 13pts", "Suited BJ: 13pts"],
        },
      ],
      repeat: "Trips on top; a 5hi or better four-card Badugi plus natural blackjack; or quads or better on the bottom.",
    },
    {
      id: "doubleblackjack",
      title: "Double Blackjack",
      qualification: "Split the five middle cards into the marked three-card and two-card hands. Both hands need 17 or more and neither may bust.",
      scoring: [
        {
          label: "3-card blackjack",
          items: ["17: 0pts", "18: 1pt", "19: 2pts", "20: 3pts", "21: 5pts", "Suited 21: 13pts"],
        },
        {
          label: "2-card blackjack",
          items: ["17: 0pts", "18: 1pt", "19: 2pts", "20: 3pts", "BJ: 8pts", "Suited BJ: 13pts"],
        },
      ],
      repeat: "Trips on top; suited 21 plus blackjack in either middle-hand order; or quads or better on the bottom.",
    },
    {
      id: "cribbage",
      title: "Cribbage",
      qualification: "Middle needs at least 12 cribbage points.",
      scoring: [
        { label: "Fifteens", items: ["15: 2pts", "2 15s: 4pts", "3 15s: 6pts", "4 15s: 8pts", "Each additional 15: +2pts"] },
        { label: "Pairs", items: ["Pair: 2pts", "2 Pairs: 4pts", "Trips: 6pts", "Boat: 8pts", "Quads: 12pts"] },
        {
          label: "Runs",
          items: ["Run of 3: 3pts", "2 Runs of 3: 6pts", "3 Runs of 3: 9pts", "4 Runs of 3: 12pts", "Run of 4: 4pts", "2 Runs of 4: 8pts", "Run of 5: 5pts"],
        },
        { label: "Flushes", items: ["Four-card flush: 4pts", "Five-card flush: 5pts"] },
        { label: "Suited jacks", items: ["Suited J: 1pt", "2 Suited Js: 2pts"] },
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

  function variantCardCounts(value) {
    const variant = VARIANTS[normalizeVariant(value)];
    const minimum = Number(variant.minCards) || 14;
    return [14, 15, 16, 17].filter((cards) => cards >= minimum);
  }

  function variantScenarios(value) {
    const cardCounts = variantCardCounts(value);
    return [0, 1, 2].flatMap((jokers) => cardCounts.map((cards) => ({ cards, jokers })));
  }

  function supportsVariantCardCount(value, cards) {
    return variantCardCounts(value).includes(Number(cards));
  }

  function assertVariantCardCount(value, cards) {
    const variant = VARIANTS[normalizeVariant(value)];
    const supported = variantCardCounts(variant.id);
    if (supported.includes(Number(cards))) return;
    const requirement = supported.length === 1 ? `${supported[0]} cards` : `${supported[0]} to ${supported[supported.length - 1]} cards`;
    throw new RangeError(`${variant.label} Fantasyland needs ${requirement}.`);
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

  function evaluateHighPartial(cards) {
    const groups = rankGroups(cards);
    const sorted = cards.map((card) => card.rank).sort((a, b) => b - a);
    if (!groups.length) return makeHighEval(CATEGORY.HIGH, [], "Empty");
    if (groups[0].count === 4) return makeHighEval(CATEGORY.QUADS, [groups[0].rank], `Four ${RANK_NAME[groups[0].rank]}`);
    if (groups[0].count === 3) {
      const kickers = groups.filter((group) => group.count === 1).map((group) => group.rank).sort((a, b) => b - a);
      return makeHighEval(CATEGORY.TRIPS, [groups[0].rank].concat(kickers), `Three ${RANK_NAME[groups[0].rank]}`);
    }
    if (groups[0].count === 2 && groups[1] && groups[1].count === 2) {
      const pairs = groups.filter((group) => group.count === 2).map((group) => group.rank).sort((a, b) => b - a);
      return makeHighEval(CATEGORY.TWO_PAIR, pairs, `${RANK_LABEL[pairs[0]]} and ${RANK_LABEL[pairs[1]]}`);
    }
    if (groups[0].count === 2) {
      const kickers = groups.filter((group) => group.count === 1).map((group) => group.rank).sort((a, b) => b - a);
      return makeHighEval(CATEGORY.PAIR, [groups[0].rank].concat(kickers), `Pair of ${RANK_NAME[groups[0].rank]}`);
    }
    return makeHighEval(CATEGORY.HIGH, sorted, `${RANK_LABEL[sorted[0]]}-high`);
  }

  function evaluateHighFive(cards) {
    if (cards.length < 5) return evaluateHighPartial(cards);
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

  function highCardLabel(rank) {
    return `${RANK_LABEL[rank] || rank}hi`;
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
    const label = qualifies ? highCardLabel(high) : clean && high !== 99 ? `${highCardLabel(high)} Foul` : "Foul";
    return {
      qualifies,
      points,
      repeat: wheel,
      wheel,
      high,
      ranks: sorted,
      quality: clean ? lowQuality(sorted, false) : -1,
      status: qualifies ? "ok" : "foul",
      scoreComponents: [{ key: "low", label, points: qualifies && points ? points : null, status: qualifies ? "ok" : "foul" }],
      name: label,
      detail: qualifies ? label : reason,
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
    const badugiLabel = badugi ? highCardLabel(badugi.high) : "Foul";
    const scoreComponents = qualifies
      ? [
          { key: "badugi", label: badugiLabel, points: badugiPoints || null, status: "ok" },
          { key: "low", label: low.name, points: low.points || null, status: "ok" },
        ]
      : [{ key: "foul", label: "Foul", points: null, status: "foul" }];
    return {
      qualifies,
      points: qualifies ? low.points + badugiPoints : 0,
      repeat,
      quality: qualifies ? low.quality * 1e6 + badugi.quality : -1,
      low,
      badugi: badugi ? { ...badugi, points: badugiPoints } : null,
      scoreComponents,
      name: qualifies ? `${badugiLabel} + ${low.name}` : "Badeucey does not qualify",
      detail: qualifies ? scoreComponents.map((component) => component.label).join(" + ") : "Foul",
    };
  }

  function evaluateBdpTop(cards) {
    const complete = cards.length === 3;
    const badugi = complete ? bestBadugi(cards, 3, true) : null;
    const qualifies = Boolean(badugi);
    const points = !badugi ? 0 : badugi.high <= 3 ? 12 : badugi.high === 4 ? 8 : badugi.high === 5 ? 4 : 0;
    const label = qualifies ? highCardLabel(badugi.high) : complete ? "Foul" : "";
    return {
      qualifies,
      points,
      repeat: false,
      quality: qualifies ? badugi.quality : -1,
      badugi: badugi ? { ...badugi, points } : null,
      status: qualifies ? "ok" : complete ? "foul" : "pending",
      scoreComponents: label ? [{ key: "badugi", label, points: points || null, status: qualifies ? "ok" : "foul" }] : [],
      name: label,
      detail: label,
    };
  }

  function evaluateBdpLow(cards) {
    const low = evaluateDeuceSeven(cards);
    const points = low.qualifies ? (low.high <= 7 ? 12 : low.high === 8 ? 6 : low.high === 9 ? 3 : 0) : 0;
    const label = low.name;
    return {
      ...low,
      points,
      repeat: false,
      scoreComponents: [{ key: "low", label, points: points || null, status: low.status }],
      name: label,
      detail: label,
    };
  }

  function bdpBottomLabel(evaluation) {
    if (evaluation.category === CATEGORY.PAIR) return "Pair";
    if (evaluation.category === CATEGORY.TWO_PAIR) return "Two Pair";
    if (evaluation.category === CATEGORY.TRIPS) return "Trips";
    if (evaluation.category === CATEGORY.STRAIGHT) return "Straight";
    if (evaluation.category === CATEGORY.FLUSH) return "Flush";
    if (evaluation.category === CATEGORY.FULL_HOUSE) return "Boat";
    if (evaluation.category === CATEGORY.QUADS) return "Quads";
    if (evaluation.category === CATEGORY.STRAIGHT_FLUSH) return evaluation.mainRank === 14 ? "Royal Flush" : "Straight Flush";
    return "Foul";
  }

  function evaluateBdpBottom(cards) {
    const complete = cards.length === 5;
    const high = complete ? evaluateHighFive(cards) : null;
    const qualifies = Boolean(high && high.category >= CATEGORY.PAIR);
    const points = qualifies ? highFiveRoyalty(high, "bottom") * 3 : 0;
    const label = high ? bdpBottomLabel(high) : "";
    const status = qualifies ? "ok" : complete ? "foul" : "pending";
    return {
      ...(high || {}),
      qualifies,
      points,
      repeat: qualifies && high.category >= CATEGORY.QUADS,
      quality: qualifies ? high.strength : -1,
      status,
      scoreComponents: label ? [{ key: "bottom", label, points: points || null, status }] : [],
      name: label,
      detail: label,
    };
  }

  function blackjackValue(cards) {
    const aceCount = cards.filter((card) => card.rank === 14).length;
    const hardTotal = cards.reduce((sum, card) => sum + (card.rank === 14 ? 1 : Math.min(card.rank, 10)), 0);
    const softTotal = aceCount > 0 && hardTotal + 10 <= 21 ? hardTotal + 10 : null;
    const total = softTotal === null ? hardTotal : softTotal;
    const natural = cards.length === 2 && cards.some((card) => card.rank === 14) && cards.some((card) => card.rank >= 10 && card.rank <= 13);
    const suitedNatural = natural && cards[0].suit === cards[1].suit;
    return { total, hardTotal, softTotal, soft: softTotal !== null, natural, suitedNatural, bust: total > 21 };
  }

  function blackjackTotalLabel(cards, value) {
    if (cards.length === 1 && value.soft && cards[0].rank === 14) return "A";
    return value.soft ? `${value.hardTotal}/${value.softTotal}` : String(value.total);
  }

  function evaluateBlackjack(cards, options = {}) {
    const final = options.final !== false;
    const value = blackjackValue(cards);
    const requiredCards = Number.isFinite(options.requiredCards) ? Number(options.requiredCards) : 0;
    const complete = requiredCards ? cards.length === requiredCards : cards.length >= 2 && cards.length <= 3;
    const natural = options.allowNatural !== false && value.natural;
    const suitedNatural = natural && value.suitedNatural;
    const sameSuit = cards.length > 1 && cards.every((card) => card.suit === cards[0].suit);
    const suitedTwentyOne = complete && value.total === 21 && sameSuit && (cards.length === 3 || suitedNatural);
    const qualifies = complete && !value.bust && value.total >= 17;
    let points = 0;
    let label = blackjackTotalLabel(cards, value);
    let status = "ok";

    if (value.bust) {
      label = `${value.total} Bust`;
      status = "bust";
    } else if (suitedNatural) {
      label = "Suited BJ";
      points = 13;
    } else if (natural) {
      label = "BJ";
      points = 8;
    } else if (suitedTwentyOne) {
      label = value.soft ? `Suited ${blackjackTotalLabel(cards, value)}` : "Suited 21";
      points = 13;
    } else if (cards.length === 3 && value.total === 21) {
      label = blackjackTotalLabel(cards, value);
      points = 5;
    } else if (qualifies) {
      points = value.total === 20 ? 3 : value.total === 19 ? 2 : value.total === 18 ? 1 : 0;
    } else if (final && complete) {
      label = `${blackjackTotalLabel(cards, value)} Foul`;
      status = "foul";
    } else {
      status = "pending";
    }

    return {
      ...value,
      natural,
      suitedNatural,
      complete,
      qualifies,
      suitedTwentyOne,
      points: qualifies ? points : 0,
      label,
      name: label,
      status,
      quality: qualifies ? value.total + (natural ? 30 : 0) + (suitedTwentyOne ? 60 : 0) : -1,
    };
  }

  function evaluateBadugiCards(cards, options = {}) {
    const minimumSize = Number.isFinite(options.minimumSize) ? options.minimumSize : 3;
    const final = options.final !== false;
    const validSize = cards.length >= minimumSize && cards.length <= 4;
    const valid = validSize && isBadugi(cards);
    const ranks = cards.map((card) => (card.rank === 14 ? 1 : card.rank)).sort((a, b) => b - a);
    const high = valid ? ranks[0] : 99;
    const pointsTable = options.pointsTable || { 4: 13, 5: 8, 6: 5, 7: 3, 8: 2, 9: 1 };
    const points = valid && cards.length === 4 ? pointsTable[high] || 0 : 0;
    const label = valid ? highCardLabel(high) : final && cards.length >= minimumSize ? "Foul" : "";
    return {
      valid,
      qualifies: valid,
      ranks,
      high,
      points,
      label,
      name: label,
      status: valid ? "ok" : final && cards.length >= minimumSize ? "foul" : "pending",
      quality: valid ? lowQuality(ranks, false) : -1,
    };
  }

  function evaluateBadugiJackConcrete(badugiCards, blackjackCards) {
    const validSizes = badugiCards.length >= 3 && badugiCards.length <= 4 && blackjackCards.length >= 2 && blackjackCards.length <= 3;
    const badugi = evaluateBadugiCards(badugiCards, { final: badugiCards.length >= 3 });
    const blackjack = evaluateBlackjack(blackjackCards, { final: blackjackCards.length >= 2 });
    const qualifies = validSizes && badugi.qualifies && blackjack.qualifies;
    const repeat = qualifies && badugiCards.length === 4 && badugi.high <= 5 && blackjack.natural;
    const scoreComponents = [];
    if (badugi.label) scoreComponents.push({ key: "badugi", label: badugi.label, points: badugi.points || null, status: badugi.status });
    if (blackjackCards.length) scoreComponents.push({ key: "blackjack", label: blackjack.label, points: blackjack.points || null, status: blackjack.status });
    return {
      qualifies,
      points: qualifies ? badugi.points + blackjack.points : 0,
      repeat,
      quality: qualifies ? (15 - badugi.high) * 100 + blackjack.total + (blackjack.natural ? 50 : 0) + (blackjack.suitedTwentyOne ? 25 : 0) : -1,
      badugi,
      blackjack,
      scoreComponents,
      name: scoreComponents.map((component) => component.label).join(" + ") || "BadugiJack",
      detail: qualifies ? scoreComponents.map((component) => component.label).join(" + ") : "Foul",
    };
  }

  function combineDoubleBlackjackEvaluations(three, two, validSizes, threePresent = true, twoPresent = true) {
    const qualifies = validSizes && three.qualifies && two.qualifies;
    const repeat = qualifies && ((three.suitedTwentyOne && two.natural) || (three.total === 21 && two.suitedNatural));
    const scoreComponents = [];
    if (threePresent) scoreComponents.push({ key: "blackjackThree", label: three.label, points: three.points || null, status: three.status });
    if (twoPresent) scoreComponents.push({ key: "blackjackTwo", label: two.label, points: two.points || null, status: two.status });
    return {
      qualifies,
      points: qualifies ? three.points + two.points : 0,
      repeat,
      quality: qualifies ? three.quality * 1000 + two.quality : -1,
      blackjackThree: three,
      blackjackTwo: two,
      scoreComponents,
      name: scoreComponents.map((component) => component.label).join(" + ") || "Double Blackjack",
      detail: qualifies ? scoreComponents.map((component) => component.label).join(" + ") : "Foul",
    };
  }

  function evaluateDoubleBlackjackConcrete(threeCardHand, twoCardHand) {
    const validSizes = threeCardHand.length === 3 && twoCardHand.length === 2;
    const three = evaluateBlackjack(threeCardHand, { final: threeCardHand.length === 3, requiredCards: 3, allowNatural: false });
    const two = evaluateBlackjack(twoCardHand, { final: twoCardHand.length === 2, requiredCards: 2 });
    return combineDoubleBlackjackEvaluations(three, two, validSizes, threeCardHand.length > 0, twoCardHand.length > 0);
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
    let runLength = 0;
    for (let length = 5; length >= 3 && runPoints === 0; length -= 1) {
      for (let start = 1; start <= 14 - length + 1; start += 1) {
        let multiplier = 1;
        for (let rank = start; rank < start + length; rank += 1) {
          multiplier *= countByRank.get(rank) || 0;
        }
        if (multiplier) {
          runPoints += length * multiplier;
          runLength = length;
        }
      }
    }

    const suitCounts = new Map();
    cards.forEach((card) => suitCounts.set(card.suit, (suitCounts.get(card.suit) || 0) + 1));
    const maxSuit = suitCounts.size ? Math.max(...suitCounts.values()) : 0;
    const flush = maxSuit >= 5 ? 5 : maxSuit === 4 ? 4 : 0;
    const nobs = cards.filter((card) => card.rank === 11 && cards.some((other) => other !== card && other.suit === card.suit)).length;
    const total = fifteens + pairs + runPoints + flush + nobs;
    const pairCounts = groups.map((group) => group.count).filter((count) => count >= 2).sort((a, b) => b - a);
    let pairLabel = "";
    if (pairCounts[0] === 4) pairLabel = "Quads";
    else if (pairCounts[0] === 3 && pairCounts[1] === 2) pairLabel = "Boat";
    else if (pairCounts[0] === 3) pairLabel = "Trips";
    else if (pairCounts.filter((count) => count === 2).length === 2) pairLabel = "2 Pairs";
    else if (pairCounts[0] === 2) pairLabel = "Pair";
    const fifteenCount = fifteens / 2;
    const runCount = runLength ? runPoints / runLength : 0;
    const scoreComponents = [];
    if (flush) scoreComponents.push({ key: "flush", label: `${flush} Card Flush`, points: flush, status: "ok" });
    if (runPoints) scoreComponents.push({ key: "runs", label: runCount === 1 ? `Run of ${runLength}` : `${runCount} Runs of ${runLength}`, points: runPoints, status: "ok" });
    if (pairs) scoreComponents.push({ key: "pairs", label: pairLabel, points: pairs, status: "ok" });
    if (fifteens) scoreComponents.push({ key: "fifteens", label: fifteenCount === 1 ? "15" : `${fifteenCount} 15s`, points: fifteens, status: "ok" });
    if (nobs) scoreComponents.push({ key: "nobs", label: nobs === 1 ? "Suited J" : `${nobs} Suited Js`, points: nobs, status: "ok" });
    return { total, fifteens, fifteenCount, pairs, pairLabel, runs: runPoints, runLength, runCount, flush, nobs, scoreComponents };
  }

  function evaluateCribbage(cards) {
    const breakdown = cribbageScore(cards);
    const complete = cards.length === 5;
    return {
      qualifies: complete && breakdown.total >= 12,
      points: breakdown.total,
      repeat: complete && breakdown.total >= 24,
      quality: breakdown.total,
      breakdown,
      scoreComponents: breakdown.scoreComponents,
      name: `${breakdown.total}pts`,
      detail: breakdown.scoreComponents.map((component) => component.label).join(" + "),
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
    (options.blockedIds || []).forEach((id) => blocked.add(id));
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

  function enumerateTopWild(ids, evaluator) {
    const cards = ids.map(makeCard);
    const jokers = cards.filter((card) => card.joker);
    if (!jokers.length) return enumerateWild(ids, evaluator, { key: (evaluation) => String(evaluation.strength) });

    const blocked = new Set(cards.filter((card) => !card.joker).map((card) => card.id));
    const availableByRank = new Map(RANKS.map((rank) => [rank, virtualDeck.filter((card) => card.rank === rank && !blocked.has(card.id))]));
    const candidates = [];
    const selected = [];

    const visit = (index) => {
      if (index === jokers.length) {
        const replacementById = new Map();
        jokers.forEach((joker, jokerIndex) => replacementById.set(joker.id, selected[jokerIndex]));
        const concrete = cards.map((card) => (card.joker ? replacementById.get(card.id) : card));
        candidates.push({ evaluation: evaluator(concrete), assignments: replacementById, assignmentValue: assignmentValue(replacementById) });
        return;
      }

      RANKS.forEach((rank) => {
        const used = new Set(selected.map((card) => card.id));
        const replacement = availableByRank.get(rank).find((card) => !used.has(card.id));
        if (!replacement) return;
        selected.push(replacement);
        visit(index + 1);
        selected.pop();
      });
    };
    visit(0);

    const deduped = new Map();
    candidates.forEach((candidate) => {
      const key = String(candidate.evaluation.strength);
      const current = deduped.get(key);
      if (!current || candidate.assignmentValue > current.assignmentValue) deduped.set(key, candidate);
    });
    return Array.from(deduped.values());
  }

  function highRowCandidates(ids, role) {
    const top = role === "top";
    const evaluator = (cards) => {
      const evaluation = top ? evaluateHighTop(cards) : evaluateHighFive(cards);
      const points = top ? topRoyalty(evaluation) : highFiveRoyalty(evaluation, role);
      const repeat = top ? evaluation.category === CATEGORY.TRIPS : evaluation.category >= CATEGORY.QUADS;
      return { ...evaluation, points, repeat, qualifies: true, quality: evaluation.strength };
    };
    return top ? enumerateTopWild(ids, evaluator) : enumerateWild(ids, evaluator, { key: (evaluation) => String(evaluation.strength) });
  }

  function variantTopCandidates(variant, ids) {
    if (variant === "bdp") return enumerateWild(ids, evaluateBdpTop, { key: middleKey });
    return highRowCandidates(ids, "top");
  }

  function variantBottomCandidates(variant, ids) {
    if (variant === "bdp") return enumerateWild(ids, evaluateBdpBottom, { key: middleKey });
    return highRowCandidates(ids, "bottom");
  }

  function doubleBlackjackCandidates(threeIds, twoIds) {
    const allNaturals = threeIds.concat(twoIds).filter((id) => !makeCard(id).joker);
    const threeCandidates = enumerateWild(
      threeIds,
      (cards) => evaluateBlackjack(cards, { final: cards.length === 3, requiredCards: 3, allowNatural: false }),
      { dedupe: false, blockedIds: allNaturals }
    );
    const twoCandidates = enumerateWild(
      twoIds,
      (cards) => evaluateBlackjack(cards, { final: cards.length === 2, requiredCards: 2 }),
      { dedupe: false, blockedIds: allNaturals }
    );
    const deduped = new Map();

    threeCandidates.forEach((three) => twoCandidates.forEach((two) => {
      const replacementIds = [];
      three.assignments.forEach((card) => replacementIds.push(card.id));
      two.assignments.forEach((card) => replacementIds.push(card.id));
      if (new Set(replacementIds).size !== replacementIds.length) return;
      const assignments = mergeAssignments(three.assignments, two.assignments);
      const evaluation = combineDoubleBlackjackEvaluations(
        three.evaluation,
        two.evaluation,
        threeIds.length === 3 && twoIds.length === 2,
        threeIds.length > 0,
        twoIds.length > 0
      );
      const candidate = { evaluation, assignments, assignmentValue: assignmentValue(assignments) };
      const key = middleKey(evaluation);
      const current = deduped.get(key);
      if (!current || candidate.assignmentValue > current.assignmentValue) deduped.set(key, candidate);
    }));

    return Array.from(deduped.values());
  }

  function variantMiddleCandidates(variant, rows) {
    if (variant === "high") return highRowCandidates(rows.middle || [], "middle");
    if (variant === "low") return enumerateWild(rows.middle || [], evaluateDeuceSeven, { key: middleKey });
    if (variant === "badeucey") return enumerateWild(rows.middle || [], evaluateBadeucey, { key: middleKey });
    if (variant === "bdp") return enumerateWild(rows.middle || [], evaluateBdpLow, { key: middleKey });
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
    if (variant === "doubleblackjack") {
      const threeIds = rows.middleBlackjackThree || [];
      const twoIds = rows.middleBlackjackTwo || [];
      return doubleBlackjackCandidates(threeIds, twoIds);
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
    if (!rows) return false;
    if (variant === "badugijack") {
      const top = (rows.top || []).length;
      const bottom = (rows.bottom || []).length;
      const badugi = (rows.middleBadugi || []).length;
      const blackjack = (rows.middleBlackjack || []).length;
      return top >= 1 && top <= 3 && bottom >= 3 && bottom <= 5 && badugi >= 3 && badugi <= 4 && blackjack >= 2 && blackjack <= 3 && top + bottom + badugi + blackjack === 13;
    }
    if ((rows.top || []).length !== 3 || (rows.bottom || []).length !== 5) return false;
    if (variant === "doubleblackjack") {
      return (rows.middleBlackjackThree || []).length === 3 && (rows.middleBlackjackTwo || []).length === 2;
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
    const topCandidates = variantTopCandidates(variant, rows.top);
    const bottomCandidates = variantBottomCandidates(variant, rows.bottom);
    const middleCandidates = variantMiddleCandidates(variant, rows);
    let best = null;

    bottomCandidates.forEach((bottom) => middleCandidates.forEach((middle) => topCandidates.forEach((top) => {
      const middleEval = middle.evaluation;
      const legal = variant === "high"
        ? bottom.evaluation.strength >= middleEval.strength && isTopLegalAgainstFive(top.evaluation, middleEval)
        : variant === "bdp"
          ? top.evaluation.qualifies && middleEval.qualifies && bottom.evaluation.qualifies
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

    if (best) return best;
    if (variant === "bdp") {
      const top = bestCandidate(topCandidates);
      const middle = bestCandidate(middleCandidates);
      const bottom = bestCandidate(bottomCandidates);
      if (top && middle && bottom) {
        const points = top.evaluation.points + middle.evaluation.points + bottom.evaluation.points;
        return {
          legal: false,
          complete: true,
          points,
          repeat: false,
          assignments: mergeAssignments(top.assignments, middle.assignments, bottom.assignments),
          rowEvals: { top: top.evaluation, middle: middle.evaluation, bottom: bottom.evaluation },
          rowNames: { top: top.evaluation.name, middle: middle.evaluation.name, bottom: bottom.evaluation.name },
          rowPoints: { top: top.evaluation.points, middle: middle.evaluation.points, bottom: bottom.evaluation.points },
          details: { middle: middle.evaluation.detail || "" },
        };
      }
    }
    return { legal: false, complete: true, points: 0, repeat: false, assignments: new Map(), rowEvals: {}, rowNames: {} };
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
    const flexibleOuterRows = variant === "badugijack";
    if ((rows.top || []).length === 3 || (flexibleOuterRows && (rows.top || []).length > 0)) take("top", variantTopCandidates(variant, rows.top));
    if ((rows.bottom || []).length === 5 || (flexibleOuterRows && (rows.bottom || []).length > 0)) take("bottom", variantBottomCandidates(variant, rows.bottom));
    if (variant === "badugijack") {
      const badugi = (rows.middleBadugi || []).length;
      const blackjack = (rows.middleBlackjack || []).length;
      if (badugi + blackjack > 0) take("middle", variantMiddleCandidates(variant, rows));
    } else if (variant === "doubleblackjack") {
      if ((rows.middleBlackjackThree || []).length + (rows.middleBlackjackTwo || []).length > 0) take("middle", variantMiddleCandidates(variant, rows));
    } else if (variant === "cribbage") {
      if ((rows.middle || []).length > 0) take("middle", variantMiddleCandidates(variant, rows));
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
    if (variant !== "badugijack" && variant !== "doubleblackjack") {
      const candidates = variantMiddleCandidates(variant, { middle: ids });
      return bestCandidate(candidates, (candidate) => variant === "high" || candidate.evaluation.qualifies);
    }
    let best = null;
    if (variant === "badugijack") {
      [3, 4].filter((badugiSize) => ids.length - badugiSize >= 2 && ids.length - badugiSize <= 3).forEach((badugiSize) => combinations(ids, badugiSize).forEach((badugiIds) => {
        const chosen = new Set(badugiIds);
        const blackjackIds = ids.filter((id) => !chosen.has(id));
        const candidate = bestCandidate(variantMiddleCandidates(variant, { middleBadugi: badugiIds, middleBlackjack: blackjackIds }), (entry) => entry.evaluation.qualifies);
        if (!candidate) return;
        const withSplit = { ...candidate, badugiIds: badugiIds.slice(), blackjackIds };
        if (!best || compareRowCandidate(withSplit, best) > 0) best = withSplit;
      }));
      return best;
    }

    combinations(ids, 3).forEach((threeIds) => {
      const chosen = new Set(threeIds);
      const twoIds = ids.filter((id) => !chosen.has(id));
      const candidate = bestCandidate(
        variantMiddleCandidates(variant, { middleBlackjackThree: threeIds, middleBlackjackTwo: twoIds }),
        (entry) => entry.evaluation.qualifies
      );
      if (!candidate) return;
      const withSplit = { ...candidate, blackjackThreeIds: threeIds.slice(), blackjackTwoIds: twoIds };
      if (!best || compareRowCandidate(withSplit, best) > 0) best = withSplit;
    });
    return best;
  }

  function constraintKey(evaluation) {
    if (evaluation.category >= CATEGORY.STRAIGHT) return "all";
    if (evaluation.category === CATEGORY.TRIPS) return `t${evaluation.mainRank}`;
    if (evaluation.category === CATEGORY.TWO_PAIR) return "no-trips";
    if (evaluation.category === CATEGORY.PAIR) return `p${evaluation.mainRank}`;
    return `h${evaluation.strength}`;
  }

  function chooseTop(ids, topMasks, availableMask, constraint, cache, candidateCache = null, variant = "high") {
    const bdp = variant === "bdp";
    const key = `${variant}:${availableMask}:${bdp ? "qualify" : constraintKey(constraint)}`;
    if (cache.has(key)) return cache.get(key);
    let best = null;
    topMasks.forEach((mask) => {
      if ((mask & availableMask) !== mask) return;
      let candidates = candidateCache ? candidateCache.get(mask) : null;
      if (!candidates) {
        candidates = variantTopCandidates(variant, idsForMask(ids, mask));
        if (candidateCache) candidateCache.set(mask, candidates);
      }
      candidates.forEach((candidate) => {
        if (bdp ? !candidate.evaluation.qualifies : !isTopLegalAgainstFive(candidate.evaluation, constraint)) return;
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
    if (variant === "bdp") {
      return distinctRanks * 12000 + lowRanks * 1800 + distinctSuits * 250 - pairShape * 900 - flushShape * 160 - maxRank;
    }
    if (variant === "badugijack") {
      const blackjackCards = naturals.filter((card) => card.rank === 14 || card.rank >= 7).length;
      return distinctRanks * 7000 + distinctSuits * 6500 + blackjackCards * 1200 - pairShape * 350 - maxRank;
    }
    if (variant === "doubleblackjack") {
      const blackjackCards = naturals.filter((card) => card.rank === 14 || card.rank >= 6).length;
      return blackjackCards * 9000 + naturals.reduce((sum, card) => sum + Math.min(card.rank, 10), 0) * 350 - pairShape * 120;
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

  function solveBadugiJackHand(ids, options, started, mode) {
    const n = ids.length;
    if (n < 13 || n > 17) throw new Error("BadugiJack Fantasyland needs 13 to 17 cards.");

    const layouts = [
      { middleSize: 5, topSize: 3, bottomSize: 5 },
      { middleSize: 6, topSize: 2, bottomSize: 5 },
      { middleSize: 6, topSize: 3, bottomSize: 4 },
      { middleSize: 7, topSize: 1, bottomSize: 5 },
      { middleSize: 7, topSize: 2, bottomSize: 4 },
      { middleSize: 7, topSize: 3, bottomSize: 3 },
    ];
    const fullMask = (1 << n) - 1;
    const maskLimit = mode === "fast" && Number.isFinite(options.maskLimit) ? Math.max(24, Math.floor(options.maskLimit)) : 0;
    const beamLimit = Number.isFinite(options.beamLimit) ? Math.max(16, Math.floor(options.beamLimit)) : 260;
    const middlePools = new Map();
    const bottomPools = new Map();
    const topMasks = new Map();
    const topCaches = new Map();
    const topCandidateCache = new Map();
    let best = null;
    let bestRoyalty = null;
    let bestRepeat = null;
    let legalBoards = 0;

    const getMiddlePool = (size) => {
      if (middlePools.has(size)) return middlePools.get(size);
      const masks = limitMasks(combinationMasks(n, size), ids, maskLimit, "badugijack", "middle");
      const entries = [];
      masks.forEach((mask) => {
        const candidate = bestMiddleForMask("badugijack", idsForMask(ids, mask));
        if (!candidate) return;
        entries.push({ mask, candidate, estimate: candidate.evaluation.points * 1e7 + candidate.evaluation.quality });
      });
      const pool = mode === "fast" ? takeBeam(entries, beamLimit) : entries;
      middlePools.set(size, pool);
      return pool;
    };

    const getBottomPool = (size) => {
      if (bottomPools.has(size)) return bottomPools.get(size);
      const masks = limitMasks(combinationMasks(n, size), ids, maskLimit, "badugijack", "bottom");
      const entries = masks.map((mask) => {
        const candidate = bestCandidate(highRowCandidates(idsForMask(ids, mask), "bottom"));
        return { mask, candidate, estimate: candidate.evaluation.points * 1e8 + candidate.evaluation.strength };
      });
      const pool = mode === "fast" ? takeBeam(entries, beamLimit) : entries;
      bottomPools.set(size, pool);
      return pool;
    };

    layouts.forEach((layout) => {
      const middlePool = getMiddlePool(layout.middleSize);
      const bottomPool = getBottomPool(layout.bottomSize);
      if (!topMasks.has(layout.topSize)) topMasks.set(layout.topSize, combinationMasks(n, layout.topSize));
      if (!topCaches.has(layout.topSize)) topCaches.set(layout.topSize, new Map());
      const layoutTopMasks = topMasks.get(layout.topSize);
      const topCache = topCaches.get(layout.topSize);

      middlePool.forEach((middleEntry) => bottomPool.forEach((bottomEntry) => {
        if (middleEntry.mask & bottomEntry.mask) return;
        const middle = middleEntry.candidate;
        const bottom = bottomEntry.candidate;
        const availableMask = fullMask ^ middleEntry.mask ^ bottomEntry.mask;
        const top = chooseTop(ids, layoutTopMasks, availableMask, bottom.evaluation, topCache, topCandidateCache);
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
    });

    return {
      variant: "badugijack",
      cards: parseCards(ids),
      best: bestRepeat || best || bestRoyalty,
      bestRoyalty,
      bestRepeat,
      legalBoards,
      elapsedMs: now() - started,
      mode,
    };
  }

  function solveHand(cardIds, options = {}) {
    const started = now();
    const variant = normalizeVariant(options.variant);
    const mode = options.mode === "fast" ? "fast" : "exact";
    const ids = cardIds.slice();
    const n = ids.length;
    assertVariantCardCount(variant, n);
    if (variant === "badugijack") return solveBadugiJackHand(ids, options, started, mode);
    const middleSize = VARIANTS[variant].middleSize;

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

    const bottomEntries = [];
    bottomMasks.forEach((mask) => {
      const rowIds = idsForMask(ids, mask);
      const candidate = bestCandidate(variantBottomCandidates(variant, rowIds), (entry) => variant !== "bdp" || entry.evaluation.qualifies);
      if (!candidate) return;
      bottomEntries.push({ mask, candidate, estimate: candidate.evaluation.points * 1e8 + candidate.evaluation.quality });
    });
    const beamLimit = Number.isFinite(options.beamLimit) ? Math.max(16, Math.floor(options.beamLimit)) : variant === "badugijack" || variant === "doubleblackjack" ? 260 : 360;
    const middlePool = mode === "fast" ? takeBeam(middleEntries, beamLimit, variant === "high") : middleEntries;
    const bottomPool = mode === "fast" ? takeBeam(bottomEntries, beamLimit) : bottomEntries;
    const topCache = new Map();
    const topCandidateCache = new Map();
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
      const top = chooseTop(ids, topMasks, availableMask, topConstraint, topCache, topCandidateCache, variant);
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
          blackjackThreeIds: middle.blackjackThreeIds || null,
          blackjackTwoIds: middle.blackjackTwoIds || null,
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
    if (!supportsVariantCardCount(variant, cardIds.length)) return false;
    if (variant === "high") return true;
    if (variant === "bdp") {
      return Boolean(solveHand(cardIds, { variant, mode: "fast", maskLimit: 180, beamLimit: 120 }).best);
    }
    const sizes = variant === "badugijack" ? [5, 6, 7] : [VARIANTS[variant].middleSize];
    for (const size of sizes) {
      const masks = combinationMasks(cardIds.length, size);
      for (const mask of masks) {
        if (bestMiddleForMask(variant, idsForMask(cardIds, mask))) return true;
      }
    }
    return false;
  }

  function buildSeed(dateKey, cards, jokers, variantValue, counter) {
    const variantId = normalizeVariant(variantValue);
    assertVariantCardCount(variantId, cards);
    const variant = VARIANTS[variantId];
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
    assertVariantCardCount(variant, cards);
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
    variantCardCounts,
    variantScenarios,
    supportsVariantCardCount,
    makeCard,
    evaluateHighFive,
    evaluateHighTop,
    evaluateDeuceSeven,
    evaluateBadeucey,
    evaluateBdpTop,
    evaluateBdpLow,
    evaluateBdpBottom,
    evaluateBlackjack,
    evaluateBadugiJackConcrete,
    evaluateDoubleBlackjackConcrete,
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
