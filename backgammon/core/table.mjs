// SPDX-License-Identifier: GPL-3.0-or-later
// Table policy, separate from the rules used by editors and training exercises.
import { historyStateKey } from "./history-tree.mjs";
import { historyStates } from "./history-states.mjs";
import { certainBearoff } from "./certain-bearoff.mjs";
import { acceptedAttempt, beginDecisionAttempt } from "./decision-attempt.mjs";
import { canAutoPassClosedOut } from './closed-out.mjs';
import {
  clone,
  cloneRecord,
  transition,
  legalTurns,
  replay,
  decisionPlayer,
  legalPaths,
  matchingPaths,
  boardKey,
  applyStep,
  stepsForDie,
  blockedBarRoll,
  canDouble,
} from "./rules.mjs";
export { blockedBarRoll } from './rules.mjs';

const forcedCache = new WeakMap(),
  undoCache = new WeakMap();
// Play state objects are immutable. Equivalent legal paths count as one choice.
// Two different outcomes that use every die prove a turn is not forced. Stop
// there instead of generating hundreds of interchangeable double sequences.
// A bounded probe only proves choices; inconclusive/partial turns still use
// exhaustive rules, including mandatory dice and early winning bearoffs.
function provesChoice(state) {
  const dice = state.dice[0] === state.dice[1] ? Array(4).fill(state.dice[0]) : state.dice;
  let first = null, budget = 64;
  function walk(board, remaining) {
    if (--budget < 0) return false;
    if (!remaining.length) {
      const key = boardKey(board);
      if (first !== null && key !== first) return true;
      first = key;
      return false;
    }
    for (const die of new Set(remaining)) {
      const rest = [...remaining];
      rest.splice(rest.indexOf(die), 1);
      for (const step of stepsForDie(board, die)) {
        if (budget < 0) return false;
        if (walk(applyStep(board, step), rest)) return true;
      }
    }
    return false;
  }
  return walk(state, dice);
}
export function forcedTurn(state) {
  if (state.phase !== "move") return null;
  if (!forcedCache.has(state)) {
    if (provesChoice(state)) {
      forcedCache.set(state, null);
      return null;
    }
    const turns = legalTurns(state);
    forcedCache.set(state, turns.length === 1 ? turns[0] : null);
  }
  return forcedCache.get(state);
}

// Follow forced steps without choosing between genuinely different outcomes.
// This detects compulsory continuations; draftAutomation limits execution to
// the initial roll. Dice-order equivalents count as the same final outcome.
export function forcedContinuation(
  state,
  draft = [],
  paths = legalPaths(state),
) {
  let prefix = [...draft];
  const keys = new Map(paths.map(path => [path, boardKey(path.state)]));
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
    const outcomes = new Set(matches.map(path => keys.get(path)));
    if (outcomes.size === 1)
      return {
        steps: matches[0].steps.slice(draft.length),
        complete: true,
      };
    // Group once by the next step. Re-filtering the full path list and
    // serializing every final board for each candidate stalls double rolls.
    const choices = new Map();
    for (const path of matches) {
      const step = path.steps[prefix.length];
      const key = `${step.from}/${step.to}/${step.die}`;
      if (!choices.has(key)) choices.set(key, {step, outcomes:new Set()});
      choices.get(key).outcomes.add(keys.get(path));
    }
    // Only a step preserving EVERY distinct final board can auto-play.
    const next = [...choices.values()].find(choice => choice.outcomes.size === outcomes.size)?.step;
    if (!next) return { steps: prefix.slice(draft.length), complete: false };
    prefix.push(next);
  }
}

// Preview automation never authorizes a commit. Only forcedTurn() can advance
// without Confirm. Only the globally mandatory initial prefix is automatic;
// a player's choice must never trigger an automatic remaining die. Reviewing
// a fully forced roll can restore its initial steps without committing it.
export function draftAutomation(state, draft, paths, restoreForcedRoll = false) {
  const initial = forcedContinuation(state, [], paths);
  const mandatory = initial.complete ? [] : initial.steps;
  const same = (a, b) =>
    a && b && a.from === b.from && a.to === b.to && a.die === b.die;
  const starts = (steps) => mandatory.every((s, i) => same(s, steps[i]));
  let normalized = draft;
  if (draft.length && mandatory.length && !starts(draft)) {
    // Recover the ordering of older drafts without moving another checker.
    // A missing compulsory die stays manual once any choice has been made.
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
    normalized.length >= minDraft && !(restoreForcedRoll && !normalized.length)
      ? { steps: [], complete: false, minDraft }
      : { ...forcedContinuation(state, normalized, paths), minDraft };
  return normalized === draft ? plan : { ...plan, replacement: normalized };
}

function append(table, action, actor, automatic = false) {
  const next = transition(table.state, action, actor);
  const initialDecision = ["move", "roll", "skip-roll", "double", "take", "pass", "beaver", "raccoon"].includes(action.type) &&
    !(action.type === 'skip-roll' && automatic)
    ? acceptedAttempt(table, action) : null;
  table.state = next;
  delete table.initialDecision;
  table.events.push({
    actor,
    action: clone(action),
    ...(initialDecision ? { initialDecision } : {}),
    ...(automatic ? { automatic: true } : {}),
  });
}
export function settleForced(table) {
  if (table.reviewingTurn) return table;
  // Let the table show the actual roll before awarding a sealed race. Don't
  // invent/animate checker steps merely because the only turn is forced.
  if (table.state.phase === "move" && certainBearoff(table.state)) return table;
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
  { autoPass = false, cubeEvaluation = null } = {},
) {
  if (autoPass && (action.type !== 'skip-roll' || !canAutoPassClosedOut(source.state, cubeEvaluation)))
    throw new Error('This cube decision cannot be skipped automatically.');
  const table = cloneRecord(source);
  delete table.reviewingTurn;
  if (action.type === "roll" && table.replayDice?.length) {
    const known = table.replayDice.shift();
    if (
      known.actor !== actor ||
      JSON.stringify(known.dice) !== JSON.stringify(action.dice)
    )
      throw new Error("A takeback must reuse the committed dice.");
  }
  if (action.type === "next") table.replayDice = [];
  // Older takeback queues may contain a previously revealed closed-out roll.
  // Retire that entry without drawing dice; the opponent keeps their own roll.
  if (action.type === 'skip-roll' && table.replayDice?.[0]?.actor === actor)
    table.replayDice.shift();
  append(
    table,
    action,
    actor,
    action.type === "finish-race" || (action.type === "move" && !!forcedTurn(source.state)) ||
      (action.type === 'skip-roll' && (autoPass || !canDouble(source.state))) ||
      // Preserve the interpretation of legacy saved roll/pass pairs.
      (action.type === "roll" && blockedBarRoll(source.state)),
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
    if (event.action.type === "finish-race" && table.state.phase === "over") {
      target ??= i;
      continue;
    }
    if (!["roll", "move"].includes(event.action.type)) break;
    if (event.action.type !== "move") continue;
    // Do not trust an imported/missing automatic marker to authorize a rewind.
    states ||= historyStates(table);
    if (table.state.phase !== "over" && (event.automatic || forcedTurn(states[i]))) break;
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
      "That turn cannot be undone. During play, forced turns and cube/game boundaries cannot be crossed.",
    );
  const table = clone(source),
    removed = table.events.slice(target),
    restored = replay(table.initial, table.events.slice(0, target)).at(-1);
  table.undoLog ||= [];
  table.undoLog.push({
    by,
    acceptedBy,
    initial: clone(restored),
    prefix: clone(table.events.slice(0, target)),
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
  delete table.initialDecision;
  if (removed[0]?.initialDecision) {
    const first = removed[0].initialDecision;
    Object.assign(beginDecisionAttempt(table, first.action), clone(first));
  }
  if (source.state.phase === 'over') table.reviewingTurn = true;
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
      if (entry.prefix !== undefined && (!Array.isArray(entry.prefix) || entry.prefix.length > 10000))
        throw new Error("Invalid history branch prefix.");
      if (verify) {
        replay(entry.initial, entry.events);
        if (entry.prefix !== undefined) {
          const before = replay(table.initial, entry.prefix).at(-1);
          if (historyStateKey(before) !== historyStateKey(entry.initial))
            throw new Error("History branch does not match its original position.");
        }
      }
    }
  }
}
