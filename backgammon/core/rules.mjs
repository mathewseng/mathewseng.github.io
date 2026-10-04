// SPDX-License-Identifier: GPL-3.0-or-later
// Canonical points[0..23] are Ivory's 1..24. Positive = Ivory (0), negative = Teal (1).
// Ivory moves down; Teal up. bar/off use player indexes. Display orientation never changes state.
export const clone = (value) => structuredClone(value);
export const sign = (player) => (player === 0 ? 1 : -1);
export const distance = (point, player) =>
  player === 0 ? point + 1 : 24 - point;
export const playerName = (p) => (p === 0 ? "Ivory" : "Teal");
export function initialState(options = {}) {
  const points = Array(24).fill(0);
  for (const [p, n] of [
    [23, 2],
    [12, 5],
    [7, 3],
    [5, 5],
    [0, -2],
    [11, -5],
    [16, -3],
    [18, -5],
  ])
    points[p] = n;
  const length = options.matchLength ?? 5;
  const s = {
    version: 1,
    points,
    bar: [0, 0],
    off: [0, 0],
    turn: 0,
    dice: [],
    phase: "opening",
    cube: { value: 1, owner: null },
    scores: [0, 0],
    matchLength: length,
    rules: { jacoby: false, cube: true },
    crawford: length === 1,
    crawfordPlayed: false,
    gameNumber: 1,
    sequence: 0,
    result: null,
    pending: null,
    ...options,
  };
  assertState(s);
  return s;
}
export function errors(s) {
  const e = [];
  const whole = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
  if (!s || s.version !== 1) return ["Unsupported position version."];
  if (
    !Array.isArray(s.points) ||
    s.points.length !== 24 ||
    s.points.some((n) => !whole(n, -15, 15))
  )
    e.push("Points must contain 24 integer checker counts between −15 and 15.");
  for (const field of ["bar", "off", "scores"])
    if (
      !Array.isArray(s[field]) ||
      s[field].length !== 2 ||
      s[field].some((n) => !whole(n, 0, field === "scores" ? 100000 : 15))
    )
      e.push(`${field} must contain two non-negative integer counts.`);
  if (e.length) return e;
  if (!e.length)
    for (let p = 0; p < 2; p++) {
      const total = s.points.reduce(
        (n, v) => n + (v * sign(p) > 0 ? Math.abs(v) : 0),
        s.bar[p] + s.off[p],
      );
      if (total !== 15)
        e.push(
          `${playerName(p)} has ${total} checkers; exactly 15 are required.`,
        );
    }
  if (![0, 1].includes(s.turn)) e.push("Choose the player on turn.");
  if (
    !["opening", "roll", "move", "double", "resign", "over"].includes(s.phase)
  )
    e.push("Unknown turn phase.");
  if (
    !Array.isArray(s.dice) ||
    ![0, 2].includes(s.dice.length) ||
    s.dice.some((d) => !whole(d, 1, 6))
  )
    e.push("Dice must be empty or two values from 1 to 6.");
  else if (s.phase === "move" && s.dice.length !== 2)
    e.push("A checker decision requires two dice.");
  else if (["opening", "roll", "double"].includes(s.phase) && s.dice.length)
    e.push("This phase cannot have rolled dice.");
  if (
    !s.cube ||
    ![null, 0, 1].includes(s.cube.owner) ||
    !whole(s.cube.value, 1, 1024) ||
    !Number.isInteger(Math.log2(s.cube.value))
  )
    e.push("Cube must be a power of two, from 1 to 1024, with a valid owner.");
  else if (s.cube.value === 1 && s.cube.owner !== null)
    e.push("The initial cube must be centered.");
  else if (s.cube.value > 1 && s.cube.owner === null)
    e.push("A turned cube must have an owner.");
  if (!whole(s.matchLength, 0, 25))
    e.push("Match length must be 0 (unlimited) to 25.");
  if (
    !s.rules ||
    typeof s.rules.cube !== "boolean" ||
    s.rules.jacoby !== false ||
    Object.keys(s.rules).some((k) => !["cube", "jacoby"].includes(k))
  )
    e.push("Supported rules: standard backgammon, no Jacoby or beavers.");
  if (typeof s.crawford !== "boolean" || typeof s.crawfordPlayed !== "boolean")
    e.push("Crawford state is required.");
  if (
    s.crawford &&
    (!s.matchLength ||
      s.cube?.value !== 1 ||
      (s.phase !== "over" && !s.scores?.includes(s.matchLength - 1)))
  )
    e.push("Crawford requires a one-away score and an unturned cube.");
  if (
    s.matchLength &&
    s.phase !== "over" &&
    s.scores?.some((n) => n >= s.matchLength)
  )
    e.push("An active match cannot have a score at or above its length.");
  if (s.crawford && s.crawfordPlayed)
    e.push("The current Crawford game cannot also be marked already played.");
  if (s.off?.every((n) => n === 15))
    e.push("Both players cannot have finished.");
  if (!whole(s.sequence, 0, 1000000) || !whole(s.gameNumber, 1, 10000))
    e.push("Invalid game sequence.");
  if (
    s.phase === "double" &&
    (!s.pending || s.pending.type !== "double" || s.pending.by !== s.turn)
  )
    e.push("A cube response needs its original offer.");
  if (
    s.phase === "resign" &&
    (!s.pending ||
      s.pending.type !== "resign" ||
      s.pending.by !== s.turn ||
      !whole(s.pending.level, 1, 3) ||
      !["roll", "move"].includes(s.pending.phase))
  )
    e.push("Invalid resignation offer.");
  if (
    s.bar?.[0] &&
    s.bar?.[1] &&
    s.points?.slice(0, 6).every((n) => n >= 2) &&
    s.points?.slice(18).every((n) => n <= -2)
  )
    e.push("Both players cannot be closed out on the bar.");
  return e;
}
export function assertState(s) {
  const e = errors(s);
  if (e.length) throw new Error(e.join(" "));
  return s;
}
export const boardKey = (s) => [...s.points, ...s.bar, ...s.off].join(",");
export const positionKey = (s) =>
  JSON.stringify([
    boardKey(s),
    s.turn,
    s.dice,
    s.phase,
    s.cube,
    s.scores,
    s.matchLength,
    s.rules,
    s.crawford,
    s.crawfordPlayed,
    s.pending,
  ]);
export function pipCount(s, p) {
  return s.points.reduce(
    (n, v, i) => n + (v * sign(p) > 0 ? Math.abs(v) * distance(i, p) : 0),
    s.bar[p] * 25,
  );
}
export function stepsForDie(s, die, p = s.turn) {
  if (s.off[p] === 15) return [];
  const sg = sign(p),
    dir = -sg,
    sources = s.bar[p]
      ? ["bar"]
      : s.points.flatMap((v, i) => (v * sg > 0 ? [i] : []));
  const home =
    !s.bar[p] && !s.points.some((v, i) => v * sg > 0 && distance(i, p) > 6);
  return sources.flatMap((from) => {
    const to =
      from === "bar" ? (p === 0 ? 24 - die : die - 1) : from + dir * die;
    if (to >= 0 && to < 24)
      return s.points[to] * sg >= -1 ? [{ from, to, die }] : [];
    if (from === "bar" || !home) return [];
    const d = distance(from, p);
    return die === d ||
      (die > d && !s.points.some((v, i) => v * sg > 0 && distance(i, p) > d))
      ? [{ from, to: "off", die }]
      : [];
  });
}
export function applyStep(source, step, p = source.turn) {
  const s = clone(source),
    sg = sign(p);
  if (step.from === "bar") s.bar[p]--;
  else s.points[step.from] -= sg;
  if (step.to === "off") s.off[p]++;
  else {
    if (s.points[step.to] === -sg) {
      s.points[step.to] = 0;
      s.bar[1 - p]++;
    }
    s.points[step.to] += sg;
  }
  return s;
}
const stepEqual = (a, b) =>
  a.from === b.from && a.to === b.to && a.die === b.die;
export function legalPaths(s) {
  if (s.phase !== "move") return [];
  const dice = s.dice[0] === s.dice[1] ? Array(4).fill(s.dice[0]) : s.dice;
  const paths = [];
  function walk(b, remaining, steps) {
    if (!remaining.length || b.off[s.turn] === 15) {
      paths.push({ steps, state: b });
      return;
    }
    let any = false;
    for (const d of new Set(remaining))
      for (const step of stepsForDie(b, d)) {
        any = true;
        const rest = [...remaining];
        rest.splice(rest.indexOf(d), 1);
        walk(applyStep(b, step), rest, [...steps, step]);
      }
    if (!any) paths.push({ steps, state: b });
  }
  walk(s, dice, []);
  const max = Math.max(...paths.map((x) => x.steps.length));
  let valid = paths.filter(
    (x) => x.steps.length === max || x.state.off[s.turn] === 15,
  );
  if (max === 1 && dice[0] !== dice[1]) {
    const high = Math.max(...valid.map((x) => x.steps[0].die));
    valid = valid.filter((x) => x.steps[0].die === high);
  }
  return valid;
}
export function legalTurns(s) {
  const map = new Map();
  for (const path of legalPaths(s)) {
    const key = boardKey(path.state);
    if (!map.has(key)) map.set(key, { ...path, key });
  }
  return [...map.values()];
}
export function matchingPaths(paths, draft) {
  return paths.filter((x) =>
    draft.every((st, i) => x.steps[i] && stepEqual(st, x.steps[i])),
  );
}
export function nextSteps(paths, draft) {
  const seen = new Set();
  return matchingPaths(paths, draft).flatMap((x) => {
    const st = x.steps[draft.length];
    const k = JSON.stringify(st);
    if (!st || seen.has(k)) return [];
    seen.add(k);
    return [st];
  });
}
export function commitTurn(s, steps) {
  if (!Array.isArray(steps) || steps.length > 4)
    throw new Error("Invalid turn.");
  const path = legalPaths(s).find(
    (x) =>
      x.steps.length === steps.length &&
      steps.every((st, i) => stepEqual(st, x.steps[i])),
  );
  if (!path)
    throw new Error("Complete the legal turn using all playable dice.");
  return path.state;
}
export function canDouble(s) {
  return (
    s.phase === "roll" &&
    s.rules.cube &&
    !s.crawford &&
    s.cube.value < 1024 &&
    (s.cube.owner === null || s.cube.owner === s.turn) &&
    (!s.matchLength || s.scores[s.turn] + s.cube.value < s.matchLength)
  );
}
export function winLevel(s, winner) {
  const loser = 1 - winner;
  if (s.off[loser] > 0) return 1;
  return s.bar[loser] ||
    s.points.some((v, i) => v * sign(loser) > 0 && distance(i, winner) <= 6)
    ? 3
    : 2;
}
function finish(s, winner, level, reason) {
  const points = level * s.cube.value;
  s.scores[winner] = s.matchLength
    ? Math.min(s.matchLength, s.scores[winner] + points)
    : s.scores[winner] + points;
  s.result = {
    winner,
    level,
    points,
    reason,
    matchOver: !!s.matchLength && s.scores[winner] >= s.matchLength,
  };
  s.phase = "over";
  s.dice = [];
  s.pending = null;
  return s;
}
export function transition(source, action, actor = source.turn) {
  assertState(source);
  const s = clone(source);
  const responding = ["double", "resign"].includes(s.phase);
  if (action.type !== "next" && actor !== (responding ? 1 - s.turn : s.turn))
    throw new Error("It is not your turn.");
  switch (action.type) {
    case "opening": {
      if (s.phase !== "opening")
        throw new Error("The opening roll is already committed.");
      checkDice(action.dice);
      const [a, b] = action.dice;
      if (a !== b) {
        s.turn = a > b ? 0 : 1;
        s.dice = [a, b];
        s.phase = "move";
      }
      break;
    }
    case "roll":
      if (s.phase !== "roll") throw new Error("Dice cannot be rolled now.");
      checkDice(action.dice);
      s.dice = [...action.dice];
      s.phase = "move";
      break;
    case "move": {
      if (s.phase !== "move") throw new Error("Roll before moving.");
      const b = commitTurn(s, action.steps);
      Object.assign(s, { points: b.points, bar: b.bar, off: b.off });
      if (s.off[s.turn] === 15)
        finish(s, s.turn, winLevel(s, s.turn), "bearoff");
      else {
        s.turn = 1 - s.turn;
        s.phase = "roll";
        s.dice = [];
      }
      break;
    }
    case "double":
      if (!canDouble(s))
        throw new Error("The cube is unavailable at this decision.");
      s.pending = { type: "double", by: s.turn };
      s.phase = "double";
      break;
    case "take":
      if (s.phase !== "double") throw new Error("No cube offer to accept.");
      s.cube = { value: s.cube.value * 2, owner: actor };
      s.phase = "roll";
      s.pending = null;
      break;
    case "pass":
      if (s.phase !== "double") throw new Error("No cube offer to pass.");
      finish(s, s.turn, 1, "cube pass");
      break;
    case "resign":
      if (
        !["roll", "move"].includes(s.phase) ||
        ![1, 2, 3].includes(action.level) ||
        (s.off[s.turn] > 0 && action.level > 1)
      )
        throw new Error(
          "Resignation is unavailable; after bearing off, only a single game can be conceded.",
        );
      s.pending = {
        type: "resign",
        by: s.turn,
        level: action.level,
        phase: s.phase,
      };
      s.phase = "resign";
      break;
    case "accept":
      if (s.phase !== "resign") throw new Error("No resignation to accept.");
      finish(s, actor, s.pending.level, "resignation");
      break;
    case "reject":
      if (s.phase !== "resign") throw new Error("No resignation to reject.");
      s.phase = s.pending.phase;
      s.pending = null;
      break;
    case "next": {
      if (s.phase !== "over" || s.result?.matchOver)
        throw new Error("This match cannot advance.");
      const played = s.crawfordPlayed || s.crawford;
      return initialState({
        scores: [...s.scores],
        matchLength: s.matchLength,
        rules: clone(s.rules),
        crawford:
          !!s.matchLength && !played && s.scores.includes(s.matchLength - 1),
        crawfordPlayed: played,
        gameNumber: s.gameNumber + 1,
        sequence: s.sequence + 1,
      });
    }
    default:
      throw new Error("Unknown action.");
  }
  s.sequence++;
  return assertState(s);
}
function checkDice(d) {
  if (
    !Array.isArray(d) ||
    d.length !== 2 ||
    d.some((n) => !Number.isInteger(n) || n < 1 || n > 6)
  )
    throw new Error("Two valid committed dice are required.");
}
export function cryptoDice(random = crypto) {
  const die = () => {
    const b = new Uint8Array(1);
    do {
      random.getRandomValues(b);
    } while (b[0] >= 252);
    return (b[0] % 6) + 1;
  };
  return [die(), die()];
}
export function seededDice(seed = 1) {
  let n = seed >>> 0;
  return () => {
    const d = () => {
      n = (Math.imul(1664525, n) + 1013904223) >>> 0;
      return 1 + Math.floor((n / 4294967296) * 6);
    };
    return [d(), d()];
  };
}
export function notation(steps, player = 0) {
  return steps.length
    ? steps
        .map(
          (st) =>
            `${st.from === "bar" ? "bar" : distance(st.from, player)}/${st.to === "off" ? "off" : distance(st.to, player)}`,
        )
        .join(" ")
    : "Pass — no legal move";
}
export function replay(initial, events) {
  let s = assertState(clone(initial));
  if (!Array.isArray(events) || events.length > 10000)
    throw new Error("Match history is too large.");
  return events.reduce(
    (states, e) => {
      s = transition(s, e.action, e.actor);
      states.push(s);
      return states;
    },
    [s],
  );
}
