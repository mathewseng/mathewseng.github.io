// All scoring rules return integers or half-integers. Comparisons use doubled
// scores, so every win/tie/loss count is exact (including half-point handicaps).
export const ROLLS = Object.freeze(
  Array.from({ length: 36 }, (_, i) =>
    Object.freeze([Math.floor(i / 6) + 1, (i % 6) + 1]),
  ),
);

export const SCORE_RULES = [
  { id: "sum", name: "Sum", formula: "a + b", score: (a, b) => a + b },
  {
    id: "max",
    name: "Max",
    formula: "max(a, b) · keep the higher die",
    score: Math.max,
  },
  {
    id: "min",
    name: "Min",
    formula: "min(a, b) · keep the lower die",
    score: Math.min,
  },
  {
    id: "avg",
    name: "Average",
    formula: "(a + b) / 2 · keep half-points",
    score: (a, b) => (a + b) / 2,
  },
  { id: "product", name: "Product", formula: "a × b", score: (a, b) => a * b },
  {
    id: "gap",
    name: "Gap",
    formula: "|a − b| · distance between dice",
    score: (a, b) => Math.abs(a - b),
  },
  {
    id: "mod10",
    name: "Sum mod 10",
    formula: "(a + b) mod 10 · 10→0, 11→1, 12→2",
    score: (a, b) => (a + b) % 10,
  },
  {
    id: "mod7",
    name: "Sum mod 7",
    formula: "(a + b) mod 7 · remainder 0–6",
    score: (a, b) => (a + b) % 7,
  },
  {
    id: "mod6",
    name: "Sum mod 6",
    formula: "(a + b) mod 6 · remainder 0–5",
    score: (a, b) => (a + b) % 6,
  },
  {
    id: "double-max",
    name: "2 × max",
    formula: "2 × max(a, b)",
    score: (a, b) => 2 * Math.max(a, b),
  },
  {
    id: "double-min",
    name: "2 × min",
    formula: "2 × min(a, b)",
    score: (a, b) => 2 * Math.min(a, b),
  },
  {
    id: "doubles",
    name: "Doubles +6",
    formula: "a + b + 6 if doubles; otherwise a + b",
    score: (a, b) => a + b + (a === b ? 6 : 0),
  },
  {
    id: "even",
    name: "Even sum +3",
    formula: "a + b + 3 if sum is even; otherwise a + b",
    score: (a, b) => a + b + ((a + b) % 2 === 0 ? 3 : 0),
  },
  {
    id: "center",
    name: "Near seven",
    formula: "6 − |a + b − 7| · a seven scores 6",
    score: (a, b) => 6 - Math.abs(a + b - 7),
  },
  {
    id: "first",
    name: "First die",
    formula: "a · roll two, ignore the second",
    score: (a) => a,
  },
  {
    id: "minus2",
    name: "Sum −2",
    formula: "a + b − 2",
    score: (a, b) => a + b - 2,
  },
  {
    id: "plus2",
    name: "Sum +2",
    formula: "a + b + 2",
    score: (a, b) => a + b + 2,
  },
  {
    id: "median",
    name: "Median with 3",
    formula: "middle value of a, b, and a fixed 3",
    score: (a, b) => a + b + 3 - Math.min(a, b, 3) - Math.max(a, b, 3),
  },
  {
    id: "floor-avg",
    name: "Average, round down",
    formula: "floor((a + b) / 2)",
    score: (a, b) => Math.floor((a + b) / 2),
  },
  {
    id: "ceil-avg",
    name: "Average, round up",
    formula: "ceil((a + b) / 2)",
    score: (a, b) => Math.ceil((a + b) / 2),
  },
  {
    id: "double-gap",
    name: "2 × gap",
    formula: "2 × |a − b|",
    score: (a, b) => 2 * Math.abs(a - b),
  },
  {
    id: "weighted-max",
    name: "Sum + max",
    formula: "a + b + max(a, b)",
    score: (a, b) => a + b + Math.max(a, b),
  },
  {
    id: "weighted-min",
    name: "Sum + min",
    formula: "a + b + min(a, b)",
    score: (a, b) => a + b + Math.min(a, b),
  },
  {
    id: "product-mod10",
    name: "Product mod 10",
    formula: "(a × b) mod 10 · keep the last digit",
    score: (a, b) => (a * b) % 10,
  },
  {
    id: "product-mod6",
    name: "Product mod 6",
    formula: "(a × b) mod 6 · remainder 0–5",
    score: (a, b) => (a * b) % 6,
  },
  {
    id: "cap7",
    name: "Sum capped at 7",
    formula: "min(a + b, 7) · all higher sums score 7",
    score: (a, b) => Math.min(a + b, 7),
  },
  {
    id: "doubles-only",
    name: "Doubles only",
    formula: "a + b for doubles; otherwise 0",
    score: (a, b) => (a === b ? a + b : 0),
  },
  {
    id: "no-doubles",
    name: "Doubles score zero",
    formula: "0 for doubles; otherwise a + b",
    score: (a, b) => (a === b ? 0 : a + b),
  },
  {
    id: "far7",
    name: "Far from seven",
    formula: "|a + b − 7| · extremes score more",
    score: (a, b) => Math.abs(a + b - 7),
  },
  {
    id: "prime-bonus",
    name: "Prime sum +3",
    formula: "a + b + 3 if sum is prime; otherwise a + b",
    score: (a, b) => a + b + ([2, 3, 5, 7, 11].includes(a + b) ? 3 : 0),
  },
  {
    id: "odd",
    name: "Odd sum +3",
    formula: "a + b + 3 if sum is odd; otherwise a + b",
    score: (a, b) => a + b + ((a + b) % 2 ? 3 : 0),
  },
  {
    id: "mod12",
    name: "Sum mod 12",
    formula: "(a + b) mod 12 · double six scores 0",
    score: (a, b) => (a + b) % 12,
  },
];

const byId = new Map(SCORE_RULES.map((rule) => [rule.id, rule]));
export function scoreRule(id) {
  const rule = byId.get(id);
  if (!rule) throw new RangeError(`Unknown score rule: ${id}`);
  return rule;
}
function validateHandicap(handicap) {
  if (
    !Number.isFinite(handicap) ||
    Math.abs(handicap) > 36 ||
    !Number.isInteger(handicap * 2)
  )
    throw new RangeError("Handicap must be a half-point from −36 to +36.");
}
export function scoreDistribution(id, handicap = 0) {
  validateHandicap(handicap);
  const { score } = scoreRule(id),
    counts = new Map();
  for (const [a, b] of ROLLS) {
    const value = score(a, b) + handicap;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts]
    .sort(([a], [b]) => a - b)
    .map(([score, count]) => ({ score, count }));
}

export function compareRules(aId, bId, handicap = 0) {
  const a = scoreDistribution(aId, handicap),
    b = scoreDistribution(bId);
  const result = { wins: 0, ties: 0, losses: 0, total: 1296 };
  for (const left of a)
    for (const right of b) {
      const key =
        left.score * 2 > right.score * 2
          ? "wins"
          : left.score * 2 === right.score * 2
            ? "ties"
            : "losses";
      result[key] += left.count * right.count;
    }
  return result;
}

export function conditionalRolls(aId, bId, handicap = 0) {
  validateHandicap(handicap);
  const aRule = scoreRule(aId),
    opponents = scoreDistribution(bId);
  return ROLLS.map(([a, b]) => {
    const score = aRule.score(a, b) + handicap;
    const result = { a, b, score, wins: 0, ties: 0, losses: 0, total: 36 };
    for (const other of opponents) {
      const key =
        score * 2 > other.score * 2
          ? "wins"
          : score * 2 === other.score * 2
            ? "ties"
            : "losses";
      result[key] += other.count;
    }
    return result;
  });
}

export function handicapSeries(aId, bId) {
  return Array.from({ length: 49 }, (_, i) => {
    const handicap = i / 2 - 12;
    return { handicap, ...compareRules(aId, bId, handicap) };
  });
}

// The full distribution of A's score minus B's, including A's handicap.
export function marginDistribution(aId, bId, handicap = 0) {
  const counts = new Map();
  for (const a of scoreDistribution(aId, handicap))
    for (const b of scoreDistribution(bId)) {
      const margin = (2 * a.score - 2 * b.score) / 2;
      counts.set(margin, (counts.get(margin) || 0) + a.count * b.count);
    }
  return [...counts]
    .sort(([a], [b]) => a - b)
    .map(([margin, count]) => ({ margin, count }));
}

// Both players use rule X, then both use rule Y on the SAME four dice.
// Rows/columns are A wins, tie, B wins. Unlike compareRules, this compares
// the two ways of judging one contest, not different rules assigned to A/B.
export function ruleAgreement(xId, yId) {
  const x = scoreRule(xId).score,
    y = scoreRule(yId).score;
  const counts = Array.from({ length: 3 }, () => [0, 0, 0]);
  for (const [a, b] of ROLLS)
    for (const [c, d] of ROLLS) {
      const row = 1 - Math.sign(x(a, b) - x(c, d));
      const col = 1 - Math.sign(y(a, b) - y(c, d));
      counts[row][col]++;
    }
  return counts;
}

// Ordered pairs: A's score rule is always first. Every entry has zero handicap.
export const FEATURED_MATCHUPS = [
  ["sum", "sum", "The regular game"],
  ["sum", "max", "Two dice against the higher die"],
  ["max", "min", "Best die against worst die"],
  ["max", "avg", "Best die against the average"],
  ["avg", "min", "Average against the lower die"],
  ["product", "sum", "Multiply against add"],
  ["sum", "mod10", "Regular sum against the last digit"],
  ["sum", "double-max", "Double the higher die"],
  ["sum", "double-min", "Double the lower die"],
  ["product", "double-max", "Product against an amplified max"],
  ["avg", "first", "Same mean, different spread"],
  ["max", "center", "Higher die against closeness to seven"],
  ["min", "gap", "Small die against the gap"],
  ["sum", "doubles", "A six-point bonus for doubles"],
  ["sum", "even", "A three-point bonus on even sums"],
  ["max", "mod10", "Max against the last digit"],
  ["avg", "mod7", "Average against a wrapped sum"],
  ["gap", "mod6", "Gap against a uniform remainder"],
  ["sum", "minus2", "A two-point head start for A"],
  ["sum", "plus2", "A two-point head start for B"],
  ["min", "median", "Low die against the middle of three"],
  ["max", "max", "Best-die mirror match"],
  ["product", "product", "Product mirror match"],
  ["avg", "avg", "Same ordering as sum vs sum"],
  ["max", "sum", "Can the best die beat a whole pair?"],
  ["min", "avg", "The lower-die underdog"],
  ["sum", "avg", "A full sum against a half sum"],
  ["product", "max", "Multiplication against the best die"],
  ["product", "min", "A large scoring advantage"],
  ["product", "weighted-max", "Multiply vs add the higher die twice"],
  ["product", "weighted-min", "Multiply vs add the lower die twice"],
  ["weighted-max", "weighted-min", "Reward the best die or the worst?"],
  ["avg", "floor-avg", "The cost of rounding down"],
  ["avg", "ceil-avg", "The benefit of rounding up"],
  ["floor-avg", "ceil-avg", "Rounding in opposite directions"],
  ["double-gap", "sum", "Spread against total pips"],
  ["gap", "far7", "Different rules, identical distributions"],
  ["center", "far7", "Middle rolls against extreme rolls"],
  ["mod10", "product-mod10", "Last digit: add or multiply?"],
  ["mod6", "product-mod6", "A uniform remainder against a skewed one"],
  ["sum", "cap7", "The cost of a seven-point ceiling"],
  ["cap7", "cap7", "A mirror game with many ties"],
  ["doubles-only", "min", "Rare high scores against steady low scores"],
  ["doubles-only", "doubles-only", "Most contests tie at zero"],
  ["no-doubles", "sum", "Doubles become a penalty"],
  ["prime-bonus", "even", "Prime bonus against even bonus"],
  ["even", "odd", "Same bonus frequency, different outcomes"],
  ["sum", "mod12", "Only double six wraps to zero"],
];

export function matchupCatalogue() {
  return SCORE_RULES.flatMap((a) =>
    SCORE_RULES.map((b) => ({ a: a.id, b: b.id, ...compareRules(a.id, b.id) })),
  );
}

const event = (group, label, predicate) => ({
  group,
  label,
  count: ROLLS.filter(([a, b]) => predicate(a, b)).length,
  total: 36,
});
export function twoDiceEvents() {
  return [
    ...Array.from({ length: 11 }, (_, i) =>
      event("Exact sums", `Sum = ${i + 2}`, (a, b) => a + b === i + 2),
    ),
    ...[4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) =>
      event("Sum thresholds", `Sum ≥ ${n}`, (a, b) => a + b >= n),
    ),
    event("Patterns", "Any doubles", (a, b) => a === b),
    event("Patterns", "Double six", (a, b) => a === 6 && b === 6),
    event("Patterns", "Different faces", (a, b) => a !== b),
    event(
      "Patterns",
      "Consecutive faces (gap = 1)",
      (a, b) => Math.abs(a - b) === 1,
    ),
    event(
      "Patterns",
      "A 1 and a 6, either order",
      (a, b) => Math.min(a, b) === 1 && Math.max(a, b) === 6,
    ),
    event("Patterns", "At least one 6", (a, b) => a === 6 || b === 6),
    event("Patterns", "Exactly one 6", (a, b) => (a === 6) !== (b === 6)),
    event("Patterns", "No sixes", (a, b) => a !== 6 && b !== 6),
    event(
      "Parity & divisibility",
      "Even sum / same parity",
      (a, b) => (a + b) % 2 === 0,
    ),
    event(
      "Parity & divisibility",
      "Odd sum / opposite parity",
      (a, b) => (a + b) % 2 === 1,
    ),
    event(
      "Parity & divisibility",
      "Both dice even",
      (a, b) => a % 2 === 0 && b % 2 === 0,
    ),
    event(
      "Parity & divisibility",
      "Both dice odd / odd product",
      (a, b) => a % 2 === 1 && b % 2 === 1,
    ),
    event("Parity & divisibility", "Even product", (a, b) => (a * b) % 2 === 0),
    event(
      "Parity & divisibility",
      "Sum divisible by 3",
      (a, b) => (a + b) % 3 === 0,
    ),
    event("Parity & divisibility", "Prime sum (2, 3, 5, 7, 11)", (a, b) =>
      [2, 3, 5, 7, 11].includes(a + b),
    ),
    event("Parity & divisibility", "Prime product (2, 3, 5)", (a, b) =>
      [2, 3, 5].includes(a * b),
    ),
    event(
      "Extremes & products",
      "Both dice ≥ 4",
      (a, b) => Math.min(a, b) >= 4,
    ),
    event(
      "Extremes & products",
      "At least one die ≥ 4",
      (a, b) => Math.max(a, b) >= 4,
    ),
    event(
      "Extremes & products",
      "Both dice ≤ 3",
      (a, b) => Math.max(a, b) <= 3,
    ),
    event("Extremes & products", "Gap ≥ 3", (a, b) => Math.abs(a - b) >= 3),
    event("Extremes & products", "Product ≥ 12", (a, b) => a * b >= 12),
    event(
      "Extremes & products",
      "Product > sum (same roll)",
      (a, b) => a * b > a + b,
    ),
    event(
      "Extremes & products",
      "Product = sum (same roll)",
      (a, b) => a * b === a + b,
    ),
    event(
      "Extremes & products",
      "Product < sum (same roll)",
      (a, b) => a * b < a + b,
    ),
    ...["max", "min", "gap", "product"].flatMap((id) =>
      scoreDistribution(id).map(({ score, count }) => ({
        group: `${scoreRule(id).name} distribution`,
        label: `${scoreRule(id).name} = ${score}`,
        count,
        total: 36,
      })),
    ),
    ...[2, 3, 4, 5, 6].flatMap((n) => [
      event(
        "High & low thresholds",
        `Min ≥ ${n} (both dice at least ${n})`,
        (a, b) => Math.min(a, b) >= n,
      ),
      event(
        "High & low thresholds",
        `Max ≥ ${n} (at least one die at least ${n})`,
        (a, b) => Math.max(a, b) >= n,
      ),
    ]),
    ...Array.from({ length: 8 }, (_, i) =>
      event("Sum thresholds", `Sum ≤ ${i + 3}`, (a, b) => a + b <= i + 3),
    ),
    event(
      "Patterns",
      "Sum between 6 and 8, inclusive",
      (a, b) => a + b >= 6 && a + b <= 8,
    ),
    event(
      "Patterns",
      "Both dice prime (2, 3, or 5)",
      (a, b) => [2, 3, 5].includes(a) && [2, 3, 5].includes(b),
    ),
    event(
      "Parity & divisibility",
      "One die divides the other",
      (a, b) => Math.max(a, b) % Math.min(a, b) === 0,
    ),
    event("Parity & divisibility", "Product is a perfect square", (a, b) =>
      Number.isInteger(Math.sqrt(a * b)),
    ),
    ...ROLLS.filter(([a, b]) => a <= b).map(([x, y]) =>
      event(
        "Exact unordered pairs",
        `${x} and ${y}${x === y ? " (doubles)" : ", either order"}`,
        (a, b) => Math.min(a, b) === x && Math.max(a, b) === y,
      ),
    ),
  ];
}

export function fourDiceEvents() {
  const specs = [
    [
      "Shared faces",
      "Identical ordered rolls",
      (a, b, c, d) => a === c && b === d,
    ],
    [
      "Shared faces",
      "Same pair, either order",
      (a, b, c, d) =>
        Math.min(a, b) === Math.min(c, d) && Math.max(a, b) === Math.max(c, d),
    ],
    [
      "Shared faces",
      "At least one face shared by A and B",
      (a, b, c, d) => [a, b].some((n) => n === c || n === d),
    ],
    [
      "Shared faces",
      "No faces shared by A and B",
      (a, b, c, d) => [a, b].every((n) => n !== c && n !== d),
    ],
    [
      "Shared faces",
      "Exactly one distinct face shared",
      (a, b, c, d) =>
        new Set([a, b].filter((n) => n === c || n === d)).size === 1,
    ],
    [
      "Shared faces",
      "Two distinct faces shared",
      (a, b, c, d) => a !== b && ((a === c && b === d) || (a === d && b === c)),
    ],
    [
      "Doubles & repeats",
      "Both players roll doubles",
      (a, b, c, d) => a === b && c === d,
    ],
    [
      "Doubles & repeats",
      "Exactly one player rolls doubles",
      (a, b, c, d) => (a === b) !== (c === d),
    ],
    [
      "Doubles & repeats",
      "Neither player rolls doubles",
      (a, b, c, d) => a !== b && c !== d,
    ],
    [
      "Doubles & repeats",
      "All four dice show different faces",
      (...dice) => new Set(dice).size === 4,
    ],
    [
      "Doubles & repeats",
      "At least one repeated face across four dice",
      (...dice) => new Set(dice).size < 4,
    ],
    [
      "Doubles & repeats",
      "All four dice show the same face",
      (...dice) => new Set(dice).size === 1,
    ],
    [
      "Sixes across four dice",
      "At least one 6 across four dice",
      (...dice) => dice.includes(6),
    ],
    [
      "Sixes across four dice",
      "Exactly one 6 across four dice",
      (...dice) => dice.filter((n) => n === 6).length === 1,
    ],
    [
      "Sixes across four dice",
      "Each player has at least one 6",
      (a, b, c, d) => (a === 6 || b === 6) && (c === 6 || d === 6),
    ],
    ["Totals & margins", "Equal sums", (a, b, c, d) => a + b === c + d],
    [
      "Totals & margins",
      "A’s sum beats B’s sum",
      (a, b, c, d) => a + b > c + d,
    ],
    [
      "Totals & margins",
      "Sums differ by exactly 1",
      (a, b, c, d) => Math.abs(a + b - c - d) === 1,
    ],
    [
      "Totals & margins",
      "Sums differ by at least 5",
      (a, b, c, d) => Math.abs(a + b - c - d) >= 5,
    ],
    [
      "Totals & margins",
      "Both sums have the same parity",
      (a, b, c, d) => (a + b) % 2 === (c + d) % 2,
    ],
    [
      "Totals & margins",
      "Combined total across four dice is 14",
      (a, b, c, d) => a + b + c + d === 14,
    ],
    [
      "Die-for-die contests",
      "A beats B in both corresponding positions",
      (a, b, c, d) => a > c && b > d,
    ],
    [
      "Die-for-die contests",
      "A is no lower in either corresponding position",
      (a, b, c, d) => a >= c && b >= d,
    ],
    [
      "Die-for-die contests",
      "A’s max and min both strictly beat B’s",
      (a, b, c, d) =>
        Math.max(a, b) > Math.max(c, d) && Math.min(a, b) > Math.min(c, d),
    ],
    [
      "Die-for-die contests",
      "A’s lowest die beats B’s highest die",
      (a, b, c, d) => Math.min(a, b) > Math.max(c, d),
    ],
    [
      "Scoring disagreements",
      "A wins on sum but loses on product",
      (a, b, c, d) => a + b > c + d && a * b < c * d,
    ],
    [
      "Scoring disagreements",
      "A wins on max but loses on min",
      (a, b, c, d) =>
        Math.max(a, b) > Math.max(c, d) && Math.min(a, b) < Math.min(c, d),
    ],
    [
      "Scoring disagreements",
      "Equal sums but different products",
      (a, b, c, d) => a + b === c + d && a * b !== c * d,
    ],
    [
      "Scoring disagreements",
      "Equal products but different sums",
      (a, b, c, d) => a * b === c * d && a + b !== c + d,
    ],
  ];
  return specs.map(([group, label, predicate]) => {
    let count = 0;
    for (const [a, b] of ROLLS)
      for (const [c, d] of ROLLS) if (predicate(a, b, c, d)) count++;
    return { group, label, count, total: 1296 };
  });
}

export function fraction(count, total) {
  let a = count,
    b = total;
  while (b) [a, b] = [b, a % b];
  return `${count / a}/${total / a}`;
}
