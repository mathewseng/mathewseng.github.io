// SPDX-License-Identifier: GPL-3.0-or-later
import { clone, replay, transition, decisionPlayer } from "./rules.mjs";
// Event identity ignores evaluation metadata but includes dice and exact paths.
const stable = (value) =>
  value && typeof value === "object"
    ? Array.isArray(value)
      ? value.map(stable)
      : Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((k) => [k, stable(value[k])]),
        )
    : value;
export const historyStateKey = (state) => JSON.stringify(stable(state));
export const historyEventKey = (event) =>
  JSON.stringify([event.actor, stable(event.action)]);

// A trie preserves separate lines even when they later reach identical boards.
// Old saves had only a branch's initial state and suffix. Attach those only
// when their exact full context has one known origin; never invent ancestry.
export function historyTree(model) {
  const nodes = [],
    roots = [],
    byState = new Map();
  function add(parent, state, event = null) {
    if (nodes.length >= 50000)
      throw new Error(
        "This history is too large to display at once. Export a backup to keep all lines.",
      );
    const n = {
      id: nodes.length,
      parent: parent?.id ?? null,
      children: [],
      state,
      event,
      active: false,
      current: false,
      detached: parent?.detached || false,
      depth: parent ? parent.depth + 1 : 0,
    };
    nodes.push(n);
    if (parent) parent.children.push(n.id);
    else roots.push(n.id);
    const key = historyStateKey(state);
    if (!byState.has(key)) byState.set(key, []);
    byState.get(key).push(n.id);
    return n;
  }
  const root = add(null, replay(model.initial, [])[0]);
  function line(start, events, active = false) {
    if (!Array.isArray(events) || events.length > 10000)
      throw new Error("Invalid history line.");
    let node = start;
    if (active) node.active = true;
    for (const event of events) {
      const key = historyEventKey(event);
      let child = node.children
        .map((id) => nodes[id])
        .find((n) => historyEventKey(n.event) === key);
      if (!child)
        child = add(
          node,
          transition(node.state, event.action, event.actor),
          clone(event),
        );
      else if (!child.event.evaluation && event.evaluation)
        child.event.evaluation = clone(event.evaluation);
      node = child;
      if (active) node.active = true;
    }
    return node;
  }
  const current = line(root, model.events, true);
  current.current = true;
  if (
    model.undoLog &&
    (!Array.isArray(model.undoLog) || model.undoLog.length > 1000)
  )
    throw new Error("Invalid history branches.");
  let pending = [];
  for (const entry of model.undoLog || []) {
    if (entry.prefix === undefined) {
      pending.push(entry);
      continue;
    }
    const origin = line(root, entry.prefix);
    if (historyStateKey(origin.state) !== historyStateKey(entry.initial))
      throw new Error("History branch does not match its original position.");
    line(origin, entry.events);
  }
  for (;;) {
    const rest = [];
    for (const entry of pending) {
      const origins = byState.get(historyStateKey(entry.initial)) || [];
      if (origins.length === 1) line(nodes[origins[0]], entry.events);
      else rest.push(entry);
    }
    if (rest.length === pending.length) {
      pending = rest;
      break;
    }
    pending = rest;
  }
  for (const entry of pending) {
    const detached = add(null, replay(entry.initial, [])[0]);
    detached.detached = true;
    line(detached, entry.events);
  }
  return { nodes, roots, current: current.id };
}
export function historyPath(tree, id) {
  const events = [];
  let node = tree.nodes[id];
  if (!node || node.detached)
    throw new Error(
      "This older line has no verified origin; it can be previewed but not restored.",
    );
  while (node.parent !== null) {
    events.push(clone(node.event));
    node = tree.nodes[node.parent];
  }
  return events.reverse();
}
export function returnToHistory(source, path) {
  if (!source?.started || source.config?.mode === "online")
    throw new Error("History navigation is available only in local play.");
  if (!Array.isArray(path) || path.length > 10000)
    throw new Error("Invalid history path.");
  const tree = historyTree(source);
  let node = tree.nodes[tree.roots[0]];
  for (const event of path) {
    const key = historyEventKey(event);
    node = node.children
      .map((id) => tree.nodes[id])
      .find((n) => historyEventKey(n.event) === key);
    if (!node) throw new Error("This position is not in this game's history.");
  }
  if (node.current) return clone(source);
  const table = clone(source);
  table.undoLog ||= [];
  table.undoLog.push({
    by: decisionPlayer(source.state),
    acceptedBy: null,
    initial: clone(source.initial),
    prefix: [],
    events: clone(source.events),
    reason: "history-return",
  });
  // Take the validated stored events, including their original evaluations.
  table.events = historyPath(tree, node.id);
  table.state = clone(node.state);
  table.replayDice = [];
  table.undoRequest = null;
  table.undoReply = null;
  return table;
}
