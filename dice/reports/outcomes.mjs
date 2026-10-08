// Exact counts of ordered rolls. Face-frequency vectors avoid rolling every
// permutation: each vector contributes N! / product(count[face]!).
export const MODES = Object.freeze({
  chosen: "Chosen face",
  single: "Single sets",
  full: "Full sets",
  sum: "Sums",
});
const FULL_CATEGORIES = [
  ["singles", "Singles", "", "Every die shows a different face."],
  ["pair", "Pair", "2", "One pair; all remaining dice are distinct singles."],
  [
    "two-pair",
    "2 pair",
    "2,2",
    "Two pairs; any remaining dice are distinct singles.",
  ],
  ["three-pair", "3 pair", "2,2,2", "Three pairs."],
  [
    "trips",
    "Trips",
    "3",
    "Three of a kind; all remaining dice are distinct singles.",
  ],
  [
    "boat",
    "Boat",
    "3,2",
    "Full house: a triple and a pair, plus a single with six dice.",
  ],
  ["two-trips", "2 trips", "3,3", "Two triples."],
  [
    "quads",
    "Quads",
    "4",
    "Four of a kind; any remaining dice are distinct singles.",
  ],
  ["quads-pair", "Quads + pair", "4,2", "Four of a kind and a pair."],
  ["quints", "Quints", "5", "Five of a kind, plus a single with six dice."],
  ["sexts", "Sexts", "6", "Six of a kind."],
];
const SINGLE_LABELS = ["Singles", "Pair", "Trips", "Quads", "Quints", "Sexts"];
const factorial = [1, 1, 2, 6, 24, 120, 720];
const cache = new Map();
export function validateGame(n, mode = "chosen") {
  if (!Object.hasOwn(MODES, mode))
    throw new RangeError("Unknown hand-ranking mode.");
  const minimum = mode === "sum" ? 1 : 2;
  if (!Number.isInteger(n) || n < minimum || n > 6)
    throw new RangeError(`Choose ${minimum} through 6 dice.`);
}
function categoryKey(counts, mode) {
  if (mode === "single") return `set-${Math.max(...counts)}`;
  const pattern = counts
    .filter((v) => v > 1)
    .sort((a, b) => b - a)
    .join(",");
  return FULL_CATEGORIES.find((row) => row[2] === pattern)[0];
}
export function classifyHand(roll, mode = "full") {
  validateGame(roll.length, mode);
  if (mode === "chosen")
    throw new RangeError("A chosen-face result also needs a chosen number.");
  const counts = Array(6).fill(0);
  for (const face of roll) {
    if (!Number.isInteger(face) || face < 1 || face > 6)
      throw new RangeError("Die faces must be integers from 1 through 6.");
    counts[face - 1]++;
  }
  if (mode === "sum") return `sum-${roll.reduce((a, b) => a + b, 0)}`;
  return categoryKey(counts, mode);
}
export function outcomes(n, mode = "chosen") {
  validateGame(n, mode);
  const cacheKey = `${n}:${mode}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  let categories;
  if (mode === "chosen") {
    let choose = 1;
    categories = Array.from({ length: n + 1 }, (_, k) => {
      if (k) choose = (choose * (n - k + 1)) / k;
      return {
        key: `matches-${k}`,
        label: `${k} ${k === 1 ? "match" : "matches"}`,
        short: String(k),
        detail: `${k} dice match the chosen face.`,
        weight: choose * 5 ** (n - k),
      };
    });
  } else if (mode === "sum") {
    let counts = [1];
    for (let die = 0; die < n; die++) {
      const next = Array(counts.length + 6).fill(0);
      counts.forEach((count, sum) => {
        for (let face = 1; face <= 6; face++) next[sum + face] += count;
      });
      counts = next;
    }
    categories = Array.from({ length: 5 * n + 1 }, (_, i) => ({
      key: `sum-${n + i}`,
      label: `Sum ${n + i}`,
      short: String(n + i),
      detail: `The sum of ${n} ${n === 1 ? "die" : "dice"} is ${n + i}.`,
      weight: counts[n + i],
    }));
  } else {
    const totals = new Map();
    function visit(counts, remaining) {
      if (counts.length === 5) {
        const all = [...counts, remaining],
          key = categoryKey(all, mode);
        const ways =
          factorial[n] / all.reduce((product, v) => product * factorial[v], 1);
        totals.set(key, (totals.get(key) || 0) + ways);
        return;
      }
      for (let v = 0; v <= remaining; v++) visit([...counts, v], remaining - v);
    }
    visit([], n);
    categories = (
      mode === "single"
        ? SINGLE_LABELS.map((label, i) => ({
            key: `set-${i + 1}`,
            label,
            detail:
              i === 0
                ? "Every die shows a different face."
                : `The largest matching group contains ${i + 1} dice; smaller groups do not change this rank.`,
          }))
        : FULL_CATEGORIES.map(([key, label, , detail]) => ({
            key,
            label,
            detail,
          }))
    )
      .filter((row) => totals.has(row.key))
      .map((row) => ({
        ...row,
        short: row.label,
        weight: totals.get(row.key),
      }));
  }
  // Payout ranks may combine distinct patterns. Keep their members explicit so
  // the roll scorer and exact distribution use the same partition.
  categories = categories.map((row) => ({ ...row, members: [row.key] }));
  if (mode === "full" && n === 4) {
    const order = ["singles", "pair", "trips", "two-pair", "quads"];
    categories.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  }
  if (mode === "full" && n === 6) {
    const source = new Map(categories.map((row) => [row.key, row]));
    const group = (key, label, short, members) => ({
      key,
      label,
      short,
      members,
      detail: members.map((member) => source.get(member).detail).join(" Or: "),
      weight: members.reduce(
        (sum, member) => sum + source.get(member).weight,
        0,
      ),
    });
    categories = [
      source.get("singles"),
      source.get("pair"),
      source.get("two-pair"),
      group("trips-boat", "Trips / boat", "3 / boat", ["trips", "boat"]),
      group("three-pair-quads", "3 pair / quads", "3P / 4", [
        "three-pair",
        "quads",
      ]),
      source.get("quads-pair"),
      source.get("two-trips"),
      source.get("quints"),
      source.get("sexts"),
    ];
  }
  categories.forEach((row) => Object.freeze(row.members));
  const frozen = Object.freeze(categories.map(Object.freeze));
  cache.set(cacheKey, frozen);
  return frozen;
}
