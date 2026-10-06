// SPDX-License-Identifier: GPL-3.0-or-later
// Local player control is presentation/session context, never part of game rules.
import {
  clone,
  STANDARD_RULES,
  decisionPlayer,
  playerName,
  positionKey,
} from "./rules.mjs";

export function defaultPlayRules(matchLength) {
  return {
    ...STANDARD_RULES,
    jacoby: matchLength === 0,
    automaticDoubles: matchLength === 0 ? 1 : 0,
  };
}
export function localConfig(value = {}) {
  return {
    ...clone(value),
    mode: value.mode === "local" ? "local" : "computer",
    humanSide: value.humanSide === 1 ? 1 : 0,
    strength: ["quick", "standard", "deep"].includes(value.strength)
      ? value.strength
      : "quick",
    name: typeof value.name === "string" ? value.name.slice(0, 24) : "You",
    opponent:
      typeof value.opponent === "string"
        ? value.opponent.slice(0, 24)
        : "Friend",
  };
}
export function humanControls(config, state) {
  return (
    state.phase === "opening" ||
    config.mode === "local" ||
    decisionPlayer(state) === (config.humanSide === 1 ? 1 : 0)
  );
}
export function controlNames(config, humanNames = ["Ivory", "Teal"]) {
  return config.mode === "local"
    ? [...humanNames]
    : [0, 1].map((p) =>
        p === config.humanSide ? config.name || "You" : "GNUbg",
      );
}
export function changeControl(game, humanSide) {
  const next = clone(game);
  next.humanNames ||= next.names.map((name, p) =>
    name === "GNUbg" ? playerName(p) : name,
  );
  next.config = localConfig({
    ...game.config,
    mode: humanSide === null ? "local" : "computer",
    humanSide: humanSide ?? game.config.humanSide,
  });
  next.names = controlNames(next.config, next.humanNames);
  return next;
}
export function studyGame(state, context, id) {
  const config = localConfig(context?.game?.config || { mode: "local" });
  // Rule and score context comes from the edited position, player assignments
  // from the originating local table. Online seats are never transferred.
  config.matchLength = state.matchLength;
  config.rules = clone(state.rules);
  const humanNames = context?.game?.humanNames ||
    context?.game?.names?.map((name, p) =>
      name === "GNUbg" ? playerName(p) : name,
    ) || ["Ivory", "Teal"];
  return {
    id,
    initial: clone(state),
    state: clone(state),
    events: [],
    started: true,
    config,
    humanNames,
    names: controlNames(config, humanNames),
  };
}
export function matchesPlayContext(context, gameId, state) {
  return (
    !!gameId &&
    context?.game?.id === gameId &&
    context.game.config?.mode !== "online" &&
    context.positionKey === positionKey(state)
  );
}

// Checkers are indistinguishable. Reuse a moved checker when a later step
// continues from its landing point, matching the board's top-checker playback.
export function lastMove(game) {
  if (!game || !["roll", "double", "resign"].includes(game.state.phase))
    return null;
  for (const event of [...game.events].reverse()) {
    if (["opening", "roll", "next"].includes(event.action.type)) break;
    if (event.action.type !== "move") continue;
    if (event.actor === game.state.turn || !event.action.steps.length)
      return null;
    const counts = new Map();
    for (const step of event.action.steps) {
      if (counts.get(step.from))
        counts.set(step.from, counts.get(step.from) - 1);
      counts.set(step.to, (counts.get(step.to) || 0) + 1);
    }
    return {
      player: event.actor,
      steps: clone(event.action.steps),
      points: Object.fromEntries([...counts].filter(([, n]) => n > 0)),
    };
  }
  return null;
}
