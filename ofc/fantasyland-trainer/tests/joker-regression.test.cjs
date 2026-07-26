const assert = require("assert").strict;
const core = require("../app.js");

const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
const SUITS = ["s", "h", "d", "c"];
const VIRTUAL_DECK = RANKS.flatMap((rank) => SUITS.map((suit) => `${rank}${suit}`));
const COMPLETE_BOARD_SAMPLES = 250;

function emptyRows() {
  return { top: [], middle: [], bottom: [], discard: [] };
}

function rowRoyalty(rowKey, evaluation) {
  return rowKey === "top"
    ? core.topRoyalty(evaluation)
    : core.fiveRoyalty(evaluation, rowKey === "middle" ? "middle" : "back", "none");
}

function inspectRow(rowKey, cards, allCards = cards) {
  const rows = emptyRows();
  rows[rowKey] = cards;
  const result = core.evaluateTrainerDisplayRows(allCards, rows, { fiveKindRule: "none" });
  return {
    result,
    evaluation: result.rowEvals[rowKey],
    assignments: result.assignments,
  };
}

function assignmentIds(assignments) {
  return Array.from(assignments.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([joker, card]) => `${joker}=${card.id}`);
}

function assertRowCase(testCase) {
  const inspected = inspectRow(testCase.row, testCase.cards, testCase.allCards || testCase.cards);
  assert.ok(inspected.evaluation, `${testCase.name}: row should be evaluated`);
  assert.equal(inspected.evaluation.name, testCase.hand, `${testCase.name}: hand name`);
  assert.equal(rowRoyalty(testCase.row, inspected.evaluation), testCase.points, `${testCase.name}: royalty`);
  assert.deepEqual(assignmentIds(inspected.assignments), testCase.assignments, `${testCase.name}: assignments`);
}

const completeRowCases = [
  {
    name: "bottom pair with one joker",
    row: "bottom",
    cards: ["As", "Kd", "9c", "6h", "JK1"],
    hand: "Pair of aces",
    points: 0,
    assignments: ["JK1=Ah"],
  },
  {
    name: "bottom trips with one joker",
    row: "bottom",
    cards: ["Qs", "Qh", "Ac", "8d", "JK1"],
    hand: "Three queens",
    points: 0,
    assignments: ["JK1=Qd"],
  },
  {
    name: "bottom Broadway straight with one joker",
    row: "bottom",
    cards: ["As", "Kh", "Qd", "Jc", "JK1"],
    hand: "Ace-high straight",
    points: 2,
    assignments: ["JK1=Ts"],
  },
  {
    name: "bottom wheel straight with one joker",
    row: "bottom",
    cards: ["As", "2h", "3d", "4c", "JK1"],
    hand: "5-high straight",
    points: 2,
    assignments: ["JK1=5s"],
  },
  {
    name: "bottom flush with one joker",
    row: "bottom",
    cards: ["As", "Js", "8s", "4s", "JK1"],
    hand: "Ace-high flush",
    points: 4,
    assignments: ["JK1=Ks"],
  },
  {
    name: "bottom full house with one joker",
    row: "bottom",
    cards: ["9s", "9h", "Kc", "Kd", "JK1"],
    hand: "King full of nines",
    points: 6,
    assignments: ["JK1=Ks"],
  },
  {
    name: "bottom quads with one joker",
    row: "bottom",
    cards: ["9s", "9h", "9d", "Kc", "JK1"],
    hand: "Four nines",
    points: 10,
    assignments: ["JK1=9c"],
  },
  {
    name: "bottom straight flush with one joker",
    row: "bottom",
    cards: ["9s", "8s", "7s", "6s", "JK1"],
    hand: "Ten-high straight flush",
    points: 15,
    assignments: ["JK1=Ts"],
  },
  {
    name: "bottom royal flush with one joker",
    row: "bottom",
    cards: ["As", "Ks", "Qs", "Js", "JK1"],
    hand: "Royal flush",
    points: 25,
    assignments: ["JK1=Ts"],
  },
  {
    name: "bottom trips with two jokers",
    row: "bottom",
    cards: ["As", "Kd", "9c", "JK1", "JK2"],
    hand: "Three aces",
    points: 0,
    assignments: ["JK1=Ah", "JK2=Ad"],
  },
  {
    name: "bottom quads with two jokers",
    row: "bottom",
    cards: ["Qs", "Qh", "9c", "JK1", "JK2"],
    hand: "Four queens",
    points: 10,
    assignments: ["JK1=Qd", "JK2=Qc"],
  },
  {
    name: "bottom royal flush with two jokers",
    row: "bottom",
    cards: ["As", "Ks", "Qs", "JK1", "JK2"],
    hand: "Royal flush",
    points: 25,
    assignments: ["JK1=Js", "JK2=Ts"],
  },
  {
    name: "middle trips with one joker",
    row: "middle",
    cards: ["Qs", "Qh", "Ac", "8d", "JK1"],
    hand: "Three queens",
    points: 2,
    assignments: ["JK1=Qd"],
  },
  {
    name: "middle straight with one joker",
    row: "middle",
    cards: ["As", "Kh", "Qd", "Jc", "JK1"],
    hand: "Ace-high straight",
    points: 4,
    assignments: ["JK1=Ts"],
  },
  {
    name: "middle flush with one joker",
    row: "middle",
    cards: ["As", "Js", "8s", "4s", "JK1"],
    hand: "Ace-high flush",
    points: 8,
    assignments: ["JK1=Ks"],
  },
  {
    name: "middle full house with one joker",
    row: "middle",
    cards: ["9s", "9h", "Kc", "Kd", "JK1"],
    hand: "King full of nines",
    points: 12,
    assignments: ["JK1=Ks"],
  },
  {
    name: "middle quads with one joker",
    row: "middle",
    cards: ["9s", "9h", "9d", "Kc", "JK1"],
    hand: "Four nines",
    points: 20,
    assignments: ["JK1=9c"],
  },
  {
    name: "middle straight flush with one joker",
    row: "middle",
    cards: ["9s", "8s", "7s", "6s", "JK1"],
    hand: "Ten-high straight flush",
    points: 30,
    assignments: ["JK1=Ts"],
  },
  {
    name: "middle royal flush with one joker",
    row: "middle",
    cards: ["As", "Ks", "Qs", "Js", "JK1"],
    hand: "Royal flush",
    points: 50,
    assignments: ["JK1=Ts"],
  },
  {
    name: "top pair with one joker",
    row: "top",
    cards: ["As", "Kd", "JK1"],
    hand: "Pair of aces",
    points: 9,
    assignments: ["JK1=Ah"],
  },
  {
    name: "top trips with one joker",
    row: "top",
    cards: ["Qs", "Qh", "JK1"],
    hand: "Three queens",
    points: 20,
    assignments: ["JK1=Qd"],
  },
  {
    name: "top trips with two jokers",
    row: "top",
    cards: ["Js", "JK1", "JK2"],
    hand: "Three jacks",
    points: 19,
    assignments: ["JK1=Jh", "JK2=Jd"],
  },
];

completeRowCases.forEach(assertRowCase);

const screenshotCards = [
  "As",
  "Ks",
  "Qs",
  "Js",
  "JK1",
  "Ah",
  "Qd",
  "Jh",
  "Jd",
  "Ts",
  "Th",
  "9s",
  "8s",
  "8h",
  "6d",
  "4c",
];
assertRowCase({
  name: "reported screenshot allows a tray T-spade to be reused",
  row: "bottom",
  cards: ["As", "Ks", "Qs", "Js", "JK1"],
  allCards: screenshotCards,
  hand: "Royal flush",
  points: 25,
  assignments: ["JK1=Ts"],
});

const partialTop = inspectRow("top", ["Qs", "JK1"]);
assert.equal(partialTop.evaluation.name, "Pair of queens", "partial top: joker should complete a pair");
assert.equal(core.topRoyalty(partialTop.evaluation), 7, "partial top: pair royalty should be visible");
assert.deepEqual(assignmentIds(partialTop.assignments), ["JK1=Qh"], "partial top: deterministic assignment");

const partialMiddle = inspectRow("middle", ["8s", "8h", "JK1"]);
assert.equal(partialMiddle.evaluation.name, "Three eights", "partial middle: joker should complete trips");
assert.equal(core.fiveRoyalty(partialMiddle.evaluation, "middle", "none"), 2, "partial middle: trips royalty");
assert.deepEqual(assignmentIds(partialMiddle.assignments), ["JK1=8d"], "partial middle: deterministic assignment");

const partialBottom = inspectRow("bottom", ["9s", "9h", "9d", "JK1"]);
assert.equal(partialBottom.evaluation.name, "Four nines", "partial bottom: joker should complete quads");
assert.equal(core.fiveRoyalty(partialBottom.evaluation, "back", "none"), 10, "partial bottom: quads royalty");
assert.deepEqual(assignmentIds(partialBottom.assignments), ["JK1=9c"], "partial bottom: deterministic assignment");

function scoreBoard(rows) {
  const ids = [...rows.top, ...rows.middle, ...rows.bottom, ...(rows.discard || [])];
  return core.scoreTrainerRows(ids, rows, {
    repeatRule: "pineapple",
    fiveKindRule: "none",
  });
}

const constrainedBoards = [
  {
    name: "top joker downgrades from fouling trips to a legal pair",
    rows: {
      top: ["Js", "Jh", "JK1"],
      middle: ["Ts", "Th", "Td", "9c", "8c"],
      bottom: ["As", "Ks", "Qs", "Js", "Ts"],
      discard: [],
    },
    legal: true,
    points: 33,
    hands: ["Pair of jacks", "Three tens", "Royal flush"],
    assignments: ["JK1=As"],
  },
  {
    name: "top joker downgrades from an overpair to legal high card",
    rows: {
      top: ["As", "Qh", "JK1"],
      middle: ["Js", "Jh", "9d", "8c", "7s"],
      bottom: ["2s", "3s", "4s", "5s", "6s"],
      discard: [],
    },
    legal: true,
    points: 15,
    hands: ["Ace-high", "Pair of jacks", "6-high straight flush"],
    assignments: ["JK1=Ks"],
  },
  {
    name: "middle joker downgrades from trips to legal two pair",
    rows: {
      top: ["2s", "3h", "4d"],
      middle: ["Qs", "Qh", "Ac", "8d", "JK1"],
      bottom: ["Ks", "Kh", "Jc", "Jd", "2c"],
      discard: [],
    },
    legal: true,
    points: 0,
    hands: ["4-high", "Queen and eights", "King and jacks"],
    assignments: ["JK1=8s"],
  },
  {
    name: "middle joker downgrades from trips and two pair to a legal pair",
    rows: {
      top: ["2s", "3h", "4d"],
      middle: ["Qs", "Qh", "Ac", "Kd", "JK1"],
      bottom: ["Ks", "Kh", "Jc", "9d", "8c"],
      discard: [],
    },
    legal: true,
    points: 0,
    hands: ["4-high", "Pair of queens", "Pair of kings"],
    assignments: ["JK1=Js"],
  },
  {
    name: "middle joker downgrades from a pair to legal high card",
    rows: {
      top: ["2s", "3h", "4d"],
      middle: ["As", "Kh", "Qd", "9c", "JK1"],
      bottom: ["Ah", "Kd", "Qc", "Js", "8d"],
      discard: [],
    },
    legal: true,
    points: 0,
    hands: ["4-high", "Ace-high", "Ace-high"],
    assignments: ["JK1=Ts"],
  },
  {
    name: "middle joker stays below the exact bottom flush boundary",
    rows: {
      top: ["Jh", "Jd", "Ah"],
      middle: ["9s", "8s", "6s", "3s", "JK1"],
      bottom: ["Kc", "Tc", "9c", "6c", "4c"],
      discard: ["3h", "5d", "4d"],
    },
    legal: true,
    points: 18,
    hands: ["Pair of jacks", "King-high flush", "King-high flush"],
    assignments: ["JK1=Ks"],
  },
  {
    name: "unavoidable top overpair remains a foul",
    rows: {
      top: ["As", "Ah", "JK1"],
      middle: ["Ks", "Kh", "Qd", "9c", "8d"],
      bottom: ["2s", "3s", "4s", "5s", "6s"],
      discard: [],
    },
    legal: false,
    points: 0,
    hands: ["Three aces", "Pair of kings", "6-high straight flush"],
    assignments: ["JK1=Ad"],
  },
];

constrainedBoards.forEach((testCase) => {
  const result = scoreBoard(testCase.rows);
  assert.equal(result.legal, testCase.legal, `${testCase.name}: legality`);
  assert.equal(result.points, testCase.points, `${testCase.name}: royalties`);
  assert.deepEqual(
    [result.rowNames.top, result.rowNames.middle, result.rowNames.bottom],
    testCase.hands,
    `${testCase.name}: hand names`
  );
  assert.deepEqual(assignmentIds(result.assignments), testCase.assignments, `${testCase.name}: assignments`);
});

const independentRows = scoreBoard({
  top: ["7s", "7c", "2h"],
  middle: ["As", "Kh", "Qs", "Jd", "JK1"],
  bottom: ["Th", "Td", "Tc", "JK2", "9s"],
  discard: [],
});
assert.equal(independentRows.legal, true, "independent rows: board should be legal");
assert.deepEqual(
  assignmentIds(independentRows.assignments),
  ["JK1=Ts", "JK2=Ts"],
  "independent rows: separate rows may reuse the same virtual card"
);

const sameRow = inspectRow("middle", ["As", "Ks", "Qs", "JK1", "JK2"]);
assert.deepEqual(
  assignmentIds(sameRow.assignments),
  ["JK1=Js", "JK2=Ts"],
  "same row: two jokers should complete a royal with distinct cards"
);
assert.notEqual(
  sameRow.assignments.get("JK1").id,
  sameRow.assignments.get("JK2").id,
  "same row: two jokers may not represent the same physical card"
);

function candidateRows(rowKey, ids) {
  const jokerIds = ids.filter((id) => id.startsWith("JK"));
  const naturalIds = ids.filter((id) => !id.startsWith("JK"));
  const available = VIRTUAL_DECK.filter((id) => !naturalIds.includes(id));
  const candidates = [];

  const addCandidate = (replacementIds) => {
    const cards = naturalIds.concat(replacementIds).map(core.cardFromId);
    const evaluation = rowKey === "top" ? core.evaluateBestTop(cards) : core.evaluateBestFive(cards);
    candidates.push({
      evaluation,
      points: rowRoyalty(rowKey, evaluation),
    });
  };

  if (!jokerIds.length) {
    addCandidate([]);
  } else if (jokerIds.length === 1) {
    available.forEach((first) => addCandidate([first]));
  } else {
    available.forEach((first) => {
      available.forEach((second) => {
        if (second !== first) addCandidate([first, second]);
      });
    });
  }

  return candidates;
}

function exhaustiveBoardScore(rows) {
  const bottomCandidates = candidateRows("bottom", rows.bottom);
  const middleCandidates = candidateRows("middle", rows.middle);
  const topCandidates = candidateRows("top", rows.top);
  let bestPoints = null;

  bottomCandidates.forEach((bottom) => {
    middleCandidates.forEach((middle) => {
      if (bottom.evaluation.strength < middle.evaluation.strength) return;
      topCandidates.forEach((top) => {
        if (!core.isTopLegalAgainstMiddle(top.evaluation, middle.evaluation)) return;
        const points = bottom.points + middle.points + top.points;
        if (bestPoints === null || points > bestPoints) bestPoints = points;
      });
    });
  });

  return bestPoints;
}

function makeRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function shuffle(items, random) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }
  return items;
}

const random = makeRandom(0x5eedc0de);
for (let sample = 0; sample < COMPLETE_BOARD_SAMPLES; sample += 1) {
  const naturals = shuffle(VIRTUAL_DECK.slice(), random).slice(0, 11);
  const hand = shuffle(naturals.concat(["JK1", "JK2"]), random);
  const rows = {
    top: hand.slice(0, 3),
    middle: hand.slice(3, 8),
    bottom: hand.slice(8, 13),
    discard: [],
  };
  const expectedPoints = exhaustiveBoardScore(rows);
  const scored = scoreBoard(rows);
  const displayed = core.evaluateTrainerDisplayRows(hand, rows, { fiveKindRule: "none" });
  const label = `exhaustive sample ${sample + 1}`;

  assert.equal(scored.legal, expectedPoints !== null, `${label}: legality should match exhaustive search`);
  assert.equal(scored.points, expectedPoints === null ? 0 : expectedPoints, `${label}: maximum legal royalties`);
  assert.deepEqual(
    assignmentIds(displayed.assignments),
    assignmentIds(scored.assignments),
    `${label}: display and scoring assignments`
  );

  ["top", "middle", "bottom"].forEach((rowKey) => {
    assert.equal(
      displayed.rowEvals[rowKey].strength,
      scored.rowEvals[rowKey].strength,
      `${label}: ${rowKey} display strength`
    );
    const rowNaturals = new Set(rows[rowKey].filter((id) => !id.startsWith("JK")));
    const rowAssignments = rows[rowKey]
      .filter((id) => id.startsWith("JK"))
      .map((id) => scored.assignments.get(id).id);
    assert.equal(
      new Set(rowAssignments).size,
      rowAssignments.length,
      `${label}: ${rowKey} joker assignments should be distinct`
    );
    rowAssignments.forEach((id) => {
      assert.equal(rowNaturals.has(id), false, `${label}: ${rowKey} joker may not duplicate a natural in its row`);
    });
  });
}

console.log(
  `Joker regression suite passed: ${completeRowCases.length} complete-row cases, ` +
    `${constrainedBoards.length} legality boundaries, and ${COMPLETE_BOARD_SAMPLES} exhaustive two-joker boards.`
);
