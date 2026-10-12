import { CYCLE_DEFINITIONS } from "./cycles-data.mjs";

const bases = {
  high: { name: "Highest", formula: "max(a, b)", score: Math.max },
  low: { name: "Lowest", formula: "min(a, b)", score: Math.min },
  sum: { name: "Sum", formula: "(a + b)", score: (a, b) => a + b },
  average: {
    name: "Average",
    formula: "((a + b) / 2)",
    score: (a, b) => (a + b) / 2,
  },
  product: { name: "Product", formula: "(a × b)", score: (a, b) => a * b },
  first: {
    name: "First die",
    formula: "a (chosen before rolling; ignore b)",
    score: (a) => a,
  },
};
const core = {
  high: "max",
  low: "min",
  sum: "sum",
  average: "avg",
  product: "product",
  first: "first",
};
export function cycleRuleId([base, mult, offset]) {
  if (mult === 1 && offset === 0) return core[base];
  if (mult === 2 && offset === 0 && ["high", "low"].includes(base))
    return `double-${core[base]}`;
  return `cycle-${base}-${mult}-${offset < 0 ? "n" : "p"}${Math.abs(offset) * 4}`;
}
const signed = (offset) =>
  offset < 0 ? ` − ${-offset}` : offset > 0 ? ` + ${offset}` : "";
const extras = new Map();
for (const cycle of CYCLE_DEFINITIONS)
  for (const parts of cycle.parts) {
    const id = cycleRuleId(parts);
    if (!id.startsWith("cycle-") || extras.has(id)) continue;
    const [base, mult, offset] = parts,
      rule = bases[base];
    extras.set(
      id,
      Object.freeze({
        id,
        name: `${mult === 1 ? "" : `${mult} × `}${rule.name}${signed(offset)}`,
        formula: `${mult === 1 ? "" : `${mult} × `}${rule.formula}${signed(offset)}`,
        score: (a, b) => mult * rule.score(a, b) + offset,
      }),
    );
  }
export const CYCLE_RULES = Object.freeze([...extras.values()]);
