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
  ];
}

export function fraction(count, total) {
  let a = count,
    b = total;
  while (b) [a, b] = [b, a % b];
  return `${count / a}/${total / a}`;
}
