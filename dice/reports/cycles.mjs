import { CYCLE_DEFINITIONS } from "./cycles-data.mjs";
import { cycleRuleId } from "./cycle-rules.mjs";
import { compareRules, scoreRule } from "./matchups.mjs";

// Fixed scores travel with the rules; no opponent-dependent handicaps.
export const SIMPLE_CYCLES = CYCLE_DEFINITIONS.map((definition) => {
  const rules = definition.parts.map(cycleRuleId);
  const edges = rules.map((a, i) => ({
    a,
    b: rules[(i + 1) % 3],
    ...compareRules(a, rules[(i + 1) % 3]),
  }));
  if (edges.some((e) => e.wins <= e.losses))
    throw new Error(`Invalid cycle: ${definition.id}`);
  return Object.freeze({
    ...definition,
    rules,
    edges,
    noTies: edges.every((e) => e.ties === 0),
    majority: edges.every((e) => e.wins > 648),
    wholeNumbers: definition.parts.every(
      ([base, , offset]) => base !== "average" && Number.isInteger(offset),
    ),
    usesFirst: definition.parts.some(([base]) => base === "first"),
    smallestEdge: Math.min(...edges.map((e) => e.wins - e.losses)),
    searchText: [definition.title, ...rules.map((id) => scoreRule(id).name)]
      .join(" ")
      .toLowerCase(),
  });
});
