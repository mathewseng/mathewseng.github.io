(function (root, factory) {
  const api = factory();
  root.MixedPokerCatalog = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const FAMILIES = [
    { id: "holdem", label: "Hold’em" },
    { id: "omaha", label: "Omaha" },
    { id: "stud", label: "Stud / Razz" },
    { id: "draw", label: "Draw / Lowball" },
    { id: "badugi", label: "Badugi family" },
    { id: "dramaha", label: "Dramaha family" },
    { id: "archie", label: "Archie family" },
  ];

  const GAMES = [
    game("lhe", "LHE", "Limit Hold’em", "holdem", "community", "limit", {
      holeCards: 2, evaluator: "holdem-high", maxPlayers: 8,
      summary: "Two hole cards, five community cards, fixed-limit betting.",
    }),
    game("nlh", "NLH", "No-Limit Hold’em", "holdem", "community", "no-limit", {
      holeCards: 2, evaluator: "holdem-high", maxPlayers: 8,
      summary: "Two hole cards, five community cards, no-limit betting.",
    }),

    game("plo4", "PLO", "4-Card Pot-Limit Omaha", "omaha", "community", "pot-limit", {
      holeCards: 4, evaluator: "omaha-high", maxPlayers: 8,
      summary: "Use exactly two hole cards and three board cards.",
    }),
    game("plo5", "PLO5", "5-Card Pot-Limit Omaha", "omaha", "community", "pot-limit", {
      holeCards: 5, evaluator: "omaha-high", maxPlayers: 8,
      summary: "Five hole cards; use exactly two with three board cards.",
    }),
    game("plo6", "PLO6", "6-Card Pot-Limit Omaha", "omaha", "community", "pot-limit", {
      holeCards: 6, evaluator: "omaha-high", maxPlayers: 7,
      summary: "Six hole cards; use exactly two with three board cards.",
    }),
    game("o8", "O8", "Limit Omaha Hi-Lo 8 or Better", "omaha", "community", "limit", {
      holeCards: 4, evaluator: "omaha-eight", split: true, maxPlayers: 8,
      summary: "Exactly two hole and three board cards for both high and qualifying eight-low.",
    }),
    game("plo8", "PLO8", "4-Card Pot-Limit Omaha Hi-Lo", "omaha", "community", "pot-limit", {
      holeCards: 4, evaluator: "omaha-eight", split: true, maxPlayers: 8,
      summary: "Pot-limit Omaha split between high and a qualifying eight-low.",
    }),
    game("big-o", "BIG O", "5-Card Pot-Limit Omaha Hi-Lo", "omaha", "community", "pot-limit", {
      holeCards: 5, evaluator: "omaha-eight", split: true, maxPlayers: 8,
      summary: "Five-card PLO8; exactly two hole cards play for each half.",
    }),
    game("dbo", "DBO", "Double Board Omaha High", "omaha", "community", "pot-limit", {
      holeCards: 4, evaluator: "double-omaha", boards: 2, split: true, maxPlayers: 8,
      summary: "Two Omaha boards; each board receives half the pot.",
    }),
    game("zombie", "ZOMBIE", "Zombie", "omaha", "zombie", "pot-limit", {
      holeCards: 5, evaluator: "zombie", bombPot: true, maxPlayers: 8,
      summary: "PLO5 bomb pot. A flop- or turn-folded hand is shuffled into an additional board.",
    }),

    game("stud", "STUD", "Seven Card Stud", "stud", "stud", "limit", {
      evaluator: "stud-high", maxPlayers: 7,
      summary: "Two down, four up, one down; best five-card high hand.",
    }),
    game("stud8", "STUD8", "Seven Card Stud Hi-Lo 8 or Better", "stud", "stud", "limit", {
      evaluator: "stud-eight", split: true, maxPlayers: 7,
      summary: "Stud high split with a qualifying five-card eight-low.",
    }),
    game("super-stud8", "SUPER STUD8", "Super Stud Hi-Lo 8 or Better", "stud", "super-stud", "limit", {
      evaluator: "stud-eight", split: true, superStud: true, maxPlayers: 6,
      summary: "Four down and one up; discard two down cards after third-street betting.",
    }),
    game("razz", "RAZZ", "Razz", "stud", "stud", "limit", {
      evaluator: "razz-a5", maxPlayers: 7,
      summary: "Seven-card stud played for the best ace-to-five low.",
    }),
    game("razz-27", "2-7 RAZZ", "2-7 Razz", "stud", "stud", "limit", {
      evaluator: "razz-27", maxPlayers: 7,
      summary: "Seven-card stud played for deuce-to-seven low; straights and flushes count.",
    }),
    game("super-razzdeucey", "SUPER RAZZDEUCEY", "Super Razzdeucey", "stud", "super-stud", "limit", {
      evaluator: "razzdeucey", split: true, superStud: true, maxPlayers: 6,
      summary: "Super Stud deal split between 2-7 low and 2-5 Badugi.",
    }),

    game("a5-td", "A-5 TD", "Limit A-5 Triple Draw", "draw", "draw", "limit", {
      holeCards: 5, draws: 3, evaluator: "draw-a5", maxPlayers: 7,
      summary: "Three draws for the best ace-to-five low; straights and flushes are ignored.",
    }),
    game("27-td", "2-7 TD", "Limit 2-7 Triple Draw", "draw", "draw", "limit", {
      holeCards: 5, draws: 3, evaluator: "draw-27", maxPlayers: 7,
      summary: "Three draws for deuce-to-seven low; 7-5-4-3-2 is best.",
    }),
    game("pl-27-td", "PL 2-7 TD", "Pot-Limit 2-7 Triple Draw", "draw", "draw", "pot-limit", {
      holeCards: 5, draws: 3, evaluator: "draw-27", maxPlayers: 7,
      summary: "Deuce-to-seven triple draw with pot-limit betting.",
    }),
    game("nl-27-sd", "NL 2-7 SD", "No-Limit 2-7 Single Draw", "draw", "draw", "no-limit", {
      holeCards: 5, draws: 1, evaluator: "draw-27", maxPlayers: 7,
      summary: "One draw for deuce-to-seven low with no-limit betting.",
    }),
    game("5cd", "5CD", "Five-Card Draw", "draw", "draw", "limit", {
      holeCards: 5, draws: 1, evaluator: "draw-high", maxPlayers: 7,
      summary: "One draw; best five-card high hand wins.",
    }),
    game("pl-5c-dd", "PL 5C DD", "Pot-Limit Five-Card Double Draw", "draw", "draw", "pot-limit", {
      holeCards: 5, draws: 2, evaluator: "draw-high", maxPlayers: 7,
      summary: "Two draws for high with pot-limit betting.",
    }),

    game("badugi", "BADUGI", "Badugi", "badugi", "draw", "limit", {
      holeCards: 4, draws: 3, evaluator: "badugi", maxPlayers: 8,
      summary: "Four-card triple draw; unique suits and ranks, aces low.",
    }),
    game("badacey", "BADACEY", "Badacey", "badugi", "draw", "limit", {
      holeCards: 5, draws: 3, evaluator: "badacey", split: true, maxPlayers: 7,
      summary: "Split between A-5 low and A-4-3-2 Badugi.",
    }),
    game("badeucy", "BADEUCY", "Badeucy", "badugi", "draw", "limit", {
      holeCards: 5, draws: 3, evaluator: "badeucy", split: true, maxPlayers: 7,
      summary: "Split between 2-7 low and 2-5-4-3 Badugi; aces are high.",
    }),

    game("dramaha", "DRAMAHA", "Dramaha High", "dramaha", "dramaha", "pot-limit", {
      holeCards: 5, draws: 1, evaluator: "dramaha-high", split: true, maxPlayers: 8,
      summary: "Split between Omaha high and the five-card draw hand.",
    }),
    game("dramaha-27", "2-7 DRAMAHA", "2-7 Dramaha", "dramaha", "dramaha", "pot-limit", {
      holeCards: 5, draws: 1, evaluator: "dramaha-27", split: true, maxPlayers: 8,
      summary: "Split between Omaha high and the hole-card 2-7 low.",
    }),
    game("dramadugi", "DRAMADUGI", "Dramadugi", "dramaha", "dramaha", "pot-limit", {
      holeCards: 5, draws: 1, evaluator: "dramadugi", split: true, maxPlayers: 8,
      summary: "Split between Omaha high and the best hole-card Badugi.",
    }),

    game("archie", "ARCHIE", "Archie", "archie", "draw", "limit", {
      holeCards: 5, draws: 3, evaluator: "archie", split: true, maxPlayers: 7,
      summary: "Triple draw split: pair of nines or better for high, eight-or-better A-5 low.",
    }),
    game("ari", "ARI", "Ari", "archie", "ari", "limit", {
      holeCards: 5, draws: 3, evaluator: "ari", split: true, boardCards: 1, maxPlayers: 7,
      summary: "Archie with one community card available to the high half only.",
    }),
  ];

  const BY_ID = Object.fromEntries(GAMES.map((entry) => [entry.id, entry]));

  function game(id, short, name, family, format, structure, options) {
    return Object.freeze({
      id,
      short,
      name,
      family,
      format,
      structure,
      split: false,
      maxPlayers: 8,
      holeCards: 0,
      draws: 0,
      boards: 1,
      ...options,
    });
  }

  function getGame(id) {
    const value = BY_ID[String(id)];
    if (!value) throw new Error("Unknown mixed-game variant.");
    return value;
  }

  function gamesByFamily(family) {
    return GAMES.filter((entry) => entry.family === family);
  }

  return {
    FAMILIES,
    GAMES,
    BY_ID,
    getGame,
    gamesByFamily,
  };
});
