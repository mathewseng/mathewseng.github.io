// SPDX-License-Identifier: GPL-3.0-or-later
// Table policy, separate from the rules used by editors and training exercises.
import {
  clone,
  transition,
  legalTurns,
  replay,
  decisionPlayer,
  legalPaths,
  matchingPaths,
  nextSteps,
  boardKey,
  applyStep,
} from "./rules.mjs";

const forcedCache = new WeakMap(),
  undoCache = new WeakMap();
// Play state objects are immutable. Equivalent legal paths count as one choice.
export function forcedTurn(state) {
  if (state.phase !== "move") return null;
  if (!forcedCache.has(state)) {
    const turns = legalTurns(state);
    forcedCache.set(state, turns.length === 1 ? turns[0] : null);
  }
  return forcedCache.get(state);
}

// Follow forced steps without choosing between genuinely different outcomes.
// A completed user draft is left for Confirm; only an unfinished forced suffix
// is auto-completed. Dice-order equivalents count as the same final outcome.
export function forcedContinuation(
  state,
  draft = [],
  paths = legalPaths(state),
) {
  let prefix = [...draft];
  for (;;) {
    const matches = matchingPaths(paths, prefix);
    if (
      !matches.length ||
      matches.some((p) => p.steps.length === prefix.length)
    )
      return {
        steps: prefix.slice(draft.length),
        complete: prefix.length > draft.length,
      };
    if (new Set(matches.map((p) => boardKey(p.state))).size === 1)
      return {
        steps: matches[0].steps.slice(draft.length),
        complete: true,
      };
    // A compulsory step need not be first in every dice order. It is safe
    // to play first only when EVERY distinct final board remains reachable.
    // Counting paths (or playable dice) would confuse order with a choice.
    const outcomes = new Set(matches.map((p) => boardKey(p.state)));
    const next = nextSteps(paths, prefix).find(
      (step) =>
        new Set(
          matchingPaths(matches, [...prefix, step]).map((p) =>
            boardKey(p.state),
          ),
        ).size === outcomes.size,
    );
    if (!next) return { steps: prefix.slice(draft.length), complete: false };
    prefix.push(next);
  }
}

// Preview automation never authorizes a commit. Only forcedTurn() can advance
// without Confirm. A fresh forward choice may fill its unavoidable suffix;
// undo/reset/recovery only restore the globally mandatory initial prefix.
export function draftAutomation(state, draft, paths, advance = false) {
  const initial = forcedContinuation(state, [], paths);
  const mandatory = initial.complete ? [] : initial.steps;
  const same = (a, b) =>
    a && b && a.from === b.from && a.to === b.to && a.die === b.die;
  const starts = (steps) => mandatory.every((s, i) => same(s, steps[i]));
  let normalized = draft;
  if (draft.length && mandatory.length && !starts(draft)) {
    // Recover drafts saved by an older policy without locking a chosen die.
    // Reorder the same steps (or add only missing compulsory steps), keeping
    // the exact set of choices the user had before recovery.
    const counts = (steps) => {
      const m = new Map();
      for (const step of steps) {
        const k = `${step.from}/${step.to}/${step.die}`;
        m.set(k, (m.get(k) || 0) + 1);
      }
      return m;
    };
    const required = counts(draft);
    for (const [k, n] of counts(mandatory))
      required.set(k, Math.max(n, required.get(k) || 0));
    const length = [...required.values()].reduce((a, b) => a + b, 0);
    const outcomes = new Set(
      matchingPaths(paths, draft).map((p) => boardKey(p.state)),
    );
    const current = boardKey(draft.reduce((s, st) => applyStep(s, st), state));
    const dice = (steps) =>
      steps
        .map((st) => st.die)
        .sort()
        .join();
    for (const path of matchingPaths(paths, mandatory)) {
      const equivalent = path.steps.slice(0, draft.length);
      if (
        starts(equivalent) &&
        dice(equivalent) === dice(draft) &&
        boardKey(equivalent.reduce((s, st) => applyStep(s, st), state)) ===
          current
      ) {
        normalized = equivalent;
        break;
      }
      const candidate = path.steps.slice(0, length),
        actual = counts(candidate);
      if (
        candidate.length !== length ||
        actual.size !== required.size ||
        [...required].some(([k, n]) => actual.get(k) !== n)
      )
        continue;
      const remaining = new Set(
        matchingPaths(paths, candidate).map((p) => boardKey(p.state)),
      );
      if (
        remaining.size === outcomes.size &&
        [...outcomes].every((k) => remaining.has(k))
      ) {
        normalized = candidate;
        break;
      }
    }
  }
  // Noncanonical legacy paths that cannot safely be reordered must never have
  // a chosen move locked just because it occupies the first array slot.
  let minDraft = 0;
  if (!normalized.length) minDraft = mandatory.length;
  else
    while (
      minDraft < mandatory.length &&
      same(mandatory[minDraft], normalized[minDraft])
    )
      minDraft++;
  const plan =
    normalized.length >= minDraft && !advance
      ? { steps: [], complete: false, minDraft }
      : { ...forcedContinuation(state, normalized, paths), minDraft };
  return normalized === draft ? plan : { ...plan, replacement: normalized };
}

function append(table, action, actor, automatic = false) {
  table.state = transition(table.state, action, actor);
  table.events.push({
    actor,
    action: clone(action),
    ...(automatic ? { automatic: true } : {}),
  });
}
export function settleForced(table) {
  const forced = forcedTurn(table.state);
  if (forced)
    append(
      table,
      { type: "move", steps: forced.steps },
      table.state.turn,
      true,
    );
  return table;
}
// Only previously committed, subsequently undone rolls may be in this queue.
// No future dice or RNG seed is generated, stored, or sent to the opponent.
export function tableDice(table, actor, randomDice) {
  const known = table.replayDice?.[0];
  if (known && known.actor !== actor)
    throw new Error("Saved dice belong to the other player.");
  return known ? [...known.dice] : randomDice();
}
export function playAction(
  source,
  action,
  actor = decisionPlayer(source.state),
) {
  const table = clone(source);
  if (action.type === "roll" && table.replayDice?.length) {
    const known = table.replayDice.shift();
    if (
      known.actor !== actor ||
      JSON.stringify(known.dice) !== JSON.stringify(action.dice)
    )
      throw new Error("A takeback must reuse the committed dice.");
  }
  if (action.type === "next") table.replayDice = [];
  append(
    table,
    action,
    actor,
    action.type === "move" && !!forcedTurn(source.state),
  );
  table.undoReply = null;
  return settleForced(table);
}
export function takebackTarget(table, actor = null) {
  if (!table?.started || !["roll", "move", "over"].includes(table.state.phase))
    return null;
  let cached = undoCache.get(table.events);
  if (!cached || cached.length !== table.events.length) {
    cached = { length: table.events.length, targets: new Map() };
    undoCache.set(table.events, cached);
  }
  if (cached.targets.has(actor)) return cached.targets.get(actor);
  let target = null,
    states;
  for (let i = table.events.length - 1; i >= 0; i--) {
    const event = table.events[i];
    if (!["roll", "move"].includes(event.action.type)) break;
    if (event.action.type !== "move") continue;
    // Do not trust an imported/missing automatic marker to authorize a rewind.
    states ||= replay(table.initial, table.events);
    if (event.automatic || forcedTurn(states[i])) break;
    if (actor === null || event.actor === actor) {
      target = i;
      break;
    }
  }
  cached.targets.set(actor, target);
  return target;
}
export function undoTurn(source, target, by, acceptedBy = null) {
  if (!Number.isInteger(target) || takebackTarget(source, by) !== target)
    throw new Error(
      "That turn cannot be undone. Forced turns and cube/game boundaries cannot be crossed.",
    );
  const table = clone(source),
    removed = table.events.slice(target),
    restored = replay(table.initial, table.events.slice(0, target)).at(-1);
  table.undoLog ||= [];
  table.undoLog.push({
    by,
    acceptedBy,
    initial: clone(restored),
    events: removed,
  });
  table.replayDice = [
    ...removed
      .filter((e) => e.action.type === "roll")
      .map((e) => ({ actor: e.actor, dice: [...e.action.dice] })),
    ...(table.replayDice || []),
  ];
  table.events = table.events.slice(0, target);
  table.state = restored;
  table.undoRequest = null;
  return table;
}
export function validateTakebacks(table, verify = false) {
  if (
    table.replayDice !== undefined &&
    (!Array.isArray(table.replayDice) ||
      table.replayDice.length > 10000 ||
      table.replayDice.some(
        (e) =>
          ![0, 1].includes(e.actor) ||
          !Array.isArray(e.dice) ||
          e.dice.length !== 2 ||
          e.dice.some((d) => !Number.isInteger(d) || d < 1 || d > 6),
      ))
  )
    throw new Error("Invalid saved takeback dice.");
  if (table.undoLog !== undefined) {
    if (!Array.isArray(table.undoLog) || table.undoLog.length > 1000)
      throw new Error("Invalid takeback history.");
    for (const entry of table.undoLog) {
      if (
        ![0, 1].includes(entry.by) ||
        ![null, 0, 1].includes(entry.acceptedBy) ||
        !Array.isArray(entry.events) ||
        entry.events.length > 10000
      )
        throw new Error("Invalid takeback record.");
      if (verify) replay(entry.initial, entry.events);
    }
  }
}
