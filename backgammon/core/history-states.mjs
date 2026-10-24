// SPDX-License-Identifier: GPL-3.0-or-later
import { assertState, clone, transition } from "./rules.mjs";

// Display/review callers share immutable, validated states. Public replay()
// remains an independent validator and returns editable copies for imports.
// Match updates clone events and grades arrive in place, so reference identity
// cannot identify a prefix. Compare actual actions, including actor and dice.
const histories = new Map();
export function clearHistoryStates() { histories.clear(); }
function immutable(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) immutable(child);
    Object.freeze(value);
  }
  return value;
}
export function historyStates(model) {
  if (!Array.isArray(model.events) || model.events.length > 10000)
    throw new Error("Match history is too large.");
  const key = JSON.stringify([model.id ?? null, model.initial]);
  let cached = histories.get(key);
  if (!cached) {
    cached = { keys: [], states: [immutable(assertState(clone(model.initial)))] };
  }
  histories.delete(key);
  histories.set(key, cached);
  while (histories.size > 4) histories.delete(histories.keys().next().value);
  const keys = model.events.map(e => JSON.stringify({ actor: e.actor, action: e.action }));
  let shared = 0;
  while (shared < keys.length && keys[shared] === cached.keys[shared]) shared++;
  if (shared !== cached.keys.length || shared !== keys.length) {
    cached.keys.length = shared;
    cached.states = cached.states.slice(0, shared + 1);
    for (let i = shared; i < keys.length; i++) {
      const event = model.events[i];
      const state = immutable(transition(cached.states[i], event.action, event.actor));
      cached.states.push(state);
      cached.keys.push(keys[i]);
    }
  }
  // Never expose the mutable cache array: another call may change branches.
  return Object.freeze(cached.states.slice());
}
