import { rollDice } from "./game.mjs";
import { compareRules, scoreRule } from "./matchups.mjs";

export function scoreMatchupRoll({ a, b, handicap = 0 }, roll) {
  // Share the report's rule/handicap validation and exact half-point scoring.
  compareRules(a, b, handicap);
  if (
    !Array.isArray(roll) ||
    roll.length !== 4 ||
    roll.some((face) => !Number.isInteger(face) || face < 1 || face > 6)
  )
    throw new RangeError("Roll four six-sided dice, two for each side.");
  const aRoll = Object.freeze(roll.slice(0, 2));
  const bRoll = Object.freeze(roll.slice(2));
  const aBase = scoreRule(a).score(...aRoll);
  const aScore = aBase + handicap;
  const bScore = scoreRule(b).score(...bRoll);
  const outcome =
    aScore * 2 > bScore * 2
      ? "wins"
      : aScore * 2 < bScore * 2
        ? "losses"
        : "ties";
  return Object.freeze({ aRoll, bRoll, aBase, aScore, bScore, outcome });
}

// A session belongs to one fixed matchup. The UI keeps separate sessions when
// changing rules, so observed frequencies always match the displayed odds.
export function createMatchupSession({ a, b, handicap = 0 }) {
  const rules = Object.freeze({ a, b, handicap });
  const probabilities = Object.freeze(compareRules(a, b, handicap));
  let pending = null,
    rounds = 0,
    history = [];
  let counts = { wins: 0, ties: 0, losses: 0 };
  return {
    rules,
    probabilities,
    get state() {
      return {
        ...counts,
        rounds,
        rolling: pending !== null,
        history: [...history],
      };
    },
    get pendingRoll() {
      return pending ? [...pending.aRoll, ...pending.bRoll] : null;
    },
    begin(randomUint32) {
      if (pending) return false;
      pending = scoreMatchupRoll(rules, rollDice(4, randomUint32));
      return true;
    },
    settle() {
      if (!pending) return null;
      const result = Object.freeze({ ...pending, round: ++rounds });
      pending = null;
      counts[result.outcome]++;
      history = [result, ...history].slice(0, 12);
      return result;
    },
    reset() {
      if (pending) return false;
      rounds = 0;
      counts = { wins: 0, ties: 0, losses: 0 };
      history = [];
      return true;
    },
  };
}
