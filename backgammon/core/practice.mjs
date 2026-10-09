// SPDX-License-Identifier: GPL-3.0-or-later
// Explicit local practice edits. Ordinary takebacks keep their committed dice.
import {
  clone,
  replay,
  transition,
  positionKey,
  decisionPlayer,
} from "./rules.mjs";
import { settleForced } from "./table.mjs";
const historyCache = new WeakMap();
export function practiceTarget(table, player) {
  if (
    !table?.started ||
    table.config?.mode === "online" ||
    ![0, 1].includes(player)
  )
    return null;
  let cached = historyCache.get(table);
  if (
    !cached ||
    cached.events !== table.events ||
    cached.length !== table.events.length ||
    cached.state !== table.state
  ) {
    cached = {
      events: table.events,
      length: table.events.length,
      state: table.state,
      states: replay(table.initial, table.events),
    };
    historyCache.set(table, cached);
  }
  const states = cached.states;
  for (let index = states.length - 1; index >= 0; index--) {
    const state = states[index];
    if (state.gameNumber !== table.state.gameNumber) break;
    if (state.turn === player && state.phase === "move")
      return { index, state };
  }
  return null;
}
export function replacePracticeRoll(source, player, dice) {
  const target = practiceTarget(source, player);
  if (!target)
    throw new Error("That side has no roll to replace in this game yet.");
  // Validate before changing any history, including the opening player's roll.
  const state = transition(
    target.state,
    { type: "practice-roll", dice },
    player,
  );
  const table = clone(source),
    removed = table.events.slice(target.index);
  table.undoLog ||= [];
  table.undoLog.push({
    by: player,
    acceptedBy: null,
    initial: clone(target.state),
    prefix: clone(table.events.slice(0, target.index)),
    events: removed,
    reason: "practice-roll",
    originalDice: clone(target.state.dice),
  });
  table.events = table.events.slice(0, target.index);
  table.events.push({
    actor: player,
    action: { type: "practice-roll", dice: [...dice] },
  });
  table.state = state;
  table.replayDice = [];
  table.undoRequest = null;
  table.undoReply = null;
  return settleForced(table);
}

// Explicit local history navigation. Preserve the abandoned line for backups,
// while restoring the original decision context, including committed dice.
export function returnToDecision(source, index, expected) {
  if (!source?.started || source.config?.mode === "online")
    throw new Error("History navigation is available only in local play.");
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= source.events.length
  )
    throw new Error("Invalid history position.");
  const state = replay(source.initial, source.events.slice(0, index)).at(
    -1,
  );
  if (positionKey(state) !== positionKey(expected))
    throw new Error("This review belongs to a different position.");
  const table = clone(source);
  table.undoLog ||= [];
  table.undoLog.push({
    by: decisionPlayer(state),
    acceptedBy: null,
    initial: clone(state),
    prefix: clone(table.events.slice(0, index)),
    events: table.events.slice(index),
    reason: "history-return",
  });
  table.events = table.events.slice(0, index);
  table.state = state;
  table.replayDice = [];
  table.undoRequest = null;
  table.undoReply = null;
  return table;
}
