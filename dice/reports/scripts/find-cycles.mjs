// Rebuild the curated catalogue: node dice/reports/scripts/find-cycles.mjs
// Search small multiples of familiar rules, with quarter-point fixed offsets.
import { writeFileSync } from "node:fs";
const rolls = Array.from({ length: 36 }, (_, i) => [
  1 + Math.floor(i / 6),
  1 + (i % 6),
]);
const bases = [
  ["sum", (a, b) => a + b],
  ["high", Math.max],
  ["low", Math.min],
  ["product", (a, b) => a * b],
  ["average", (a, b) => (a + b) / 2],
  ["first", (a) => a],
];
const rules = bases.flatMap(([base, score]) =>
  (["product", "average"].includes(base) ? [1] : [1, 2, 3]).map((mult) => ({
    base,
    mult,
    values: rolls.map(([a, b]) => 4 * mult * score(a, b)),
  })),
);
const compare = (a, b, h) => {
  const counts = [0, 0, 0];
  for (const x of a.values)
    for (const y of b.values) counts[x + h > y ? 0 : x + h === y ? 1 : 2]++;
  return counts;
};
const lookup = rules.map((a) =>
  rules.map((b) =>
    Array.from({ length: 289 }, (_, i) => compare(a, b, i - 144)),
  ),
);
const penalty = (parts) =>
  parts.reduce(
    (p, [base, mult, offset]) =>
      p +
      (base === "first"
        ? 1
        : base === "product" || base === "average"
          ? 0.5
          : 0) +
      (mult === 1 ? 0 : mult === 2 ? 1 : 1.5) +
      (offset === 0 ? 0 : 2) +
      Math.abs(offset) / 10 +
      (Number.isInteger(offset) ? 0 : Number.isInteger(offset * 2) ? 0.5 : 1),
    0,
  );
const candidates = [];
for (let a = 0; a < rules.length; a++)
  for (let b = a + 1; b < rules.length; b++)
    for (let c = b + 1; c < rules.length; c++) {
      if (new Set([a, b, c].map((i) => rules[i].base)).size < 3) continue;
      for (let hb = -72; hb <= 72; hb++)
        for (let hc = -72; hc <= 72; hc++) {
          const rows = [
            lookup[a][b][144 - hb],
            lookup[b][c][144 + hb - hc],
            lookup[c][a][144 + hc],
          ];
          if (
            !rows.every((e) => e[0] > e[2]) &&
            !rows.every((e) => e[0] < e[2])
          )
            continue;
          const reverse = rows[0][0] < rows[0][2];
          const indices = reverse ? [a, c, b] : [a, b, c],
            offsets = reverse ? [0, hc / 4, hb / 4] : [0, hb / 4, hc / 4];
          const edges = reverse
            ? [rows[2], rows[1], rows[0]].map(([w, t, l]) => [l, t, w])
            : rows;
          let parts,
            cost = Infinity;
          for (const shift of offsets) {
            const trial = indices.map((i, j) => [
              rules[i].base,
              rules[i].mult,
              offsets[j] - shift,
            ]);
            if (trial.some((p) => Math.abs(p[2]) > 12)) continue;
            if (penalty(trial) < cost) {
              parts = trial;
              cost = penalty(trial);
            }
          }
          if (parts)
            candidates.push({
              parts,
              cost,
              minimum: Math.min(...edges.map((e) => e[0] - e[2])),
            });
        }
    }
// Ignore rotation, common scale, and handicap-only variants of the same shape.
// One explicit whole-number version of the first cycle is retained for ease of play.
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
function shape(parts) {
  const normalized = parts.map(([b, m]) => [
    b === "average" ? "sum" : b,
    m * (b === "average" ? 1 : 2),
  ]);
  const divisor = normalized.reduce((g, p) => gcd(g, p[1]), 0);
  const names = normalized.map(([b, m]) => `${b}:${m / divisor}`);
  return names
    .map((_, i) => [...names.slice(i), ...names.slice(0, i)].join("|"))
    .sort()[0];
}
const chosen = [
  {
    id: "high-sum-low",
    title: "High, sum & low",
    note: "Three familiar rules. The two 50.23% advantages are small, but exact.",
    parts: [
      ["high", 1, 0],
      ["sum", 1, -2.25],
      ["low", 1, 2.25],
    ],
  },
  {
    id: "whole-number-trio",
    title: "The whole-number version",
    note: "The same pairwise odds as High, sum & low, using only whole-number scores.",
    parts: [
      ["high", 3, 0],
      ["sum", 3, -7],
      ["low", 3, 7],
    ],
  },
  {
    id: "one-point-trio",
    title: "One-point handicaps",
    note: "Use a designated first die for rule C, chosen before rolling. Each arrow wins more often than it loses; ties are separate.",
    parts: [
      ["high", 1, -1],
      ["low", 1, 1],
      ["first", 1, 0],
    ],
  },
  {
    id: "double-high-trio",
    title: "Twice the highest",
    note: "A half-point alternative to High, sum & low, with the same pairwise odds.",
    parts: [
      ["high", 2, 0],
      ["sum", 2, -4.5],
      ["low", 2, 5],
    ],
  },
];
const seen = new Set(chosen.map((c) => shape(c.parts)));
candidates.sort((a, b) => a.cost - b.cost || b.minimum - a.minimum);
for (const c of candidates) {
  const key = shape(c.parts);
  if (seen.has(key)) continue;
  seen.add(key);
  const names = {
    sum: "Sum",
    high: "High",
    low: "Low",
    product: "Product",
    average: "Average",
    first: "First die",
  };
  chosen.push({
    id: `simple-${chosen.length + 1}`,
    title: c.parts.map((p) => names[p[0]]).join(" · "),
    parts: c.parts,
  });
  if (chosen.length === 36) break;
}
const target = new URL("../cycles-data.mjs", import.meta.url);
writeFileSync(
  target,
  "// Generated by scripts/find-cycles.mjs. Each triple is [base, multiplier, fixed offset].\nexport const CYCLE_DEFINITIONS = " +
    JSON.stringify(chosen, null, 2) +
    ";\n",
);
console.log(
  `Selected ${chosen.length} cycles from ${candidates.length} valid candidates. Written ${target.pathname}`,
);
