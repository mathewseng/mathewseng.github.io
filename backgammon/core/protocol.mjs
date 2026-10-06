// SPDX-License-Identifier: GPL-3.0-or-later
import { initialState, clone, assertState, replay } from "./rules.mjs";
import { defaultPlayRules } from "./play-session.mjs";
import {
  playAction,
  settleForced,
  tableDice,
  takebackTarget,
  undoTurn,
  validateTakebacks,
} from "./table.mjs";
export function checkpoint(s) {
  return { revision: s.revision, hash: s.hash };
}
function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++)
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16);
}
export function session(players, options = {}, id = "local") {
  const defaults = defaultPlayRules(options.matchLength ?? 5);
  if (options.rules?.cube === false)
    Object.assign(defaults, { jacoby: false, automaticDoubles: 0 });
  const initial = initialState({
    ...options,
    rules: { ...defaults, ...options.rules },
  });
  return {
    version: 1,
    id,
    epoch: 0,
    revision: 0,
    hash: hash(JSON.stringify(initial)),
    players: players.map((p) => ({
      id: String(p.id).slice(0, 100),
      name: String(p.name).slice(0, 24),
    })),
    started: false,
    initial,
    state: initial,
    events: [],
    seen: [],
    recovery: null,
    rematch: [],
  };
}
export function validateSession(s) {
  if (
    !s ||
    s.version !== 1 ||
    typeof s.id !== "string" ||
    s.id.length > 100 ||
    !Number.isInteger(s.epoch) ||
    !Number.isInteger(s.revision) ||
    !Array.isArray(s.players) ||
    s.players.length > 2 ||
    s.players.some(
      (p) =>
        typeof p.id !== "string" ||
        p.id.length > 100 ||
        typeof p.name !== "string" ||
        p.name.length > 24,
    ) ||
    !Array.isArray(s.events) ||
    s.events.length > 10000 ||
    !Array.isArray(s.seen) ||
    s.seen.length > 128 ||
    typeof s.hash !== "string"
  )
    throw new Error("Invalid room snapshot.");
  if (
    new Set(s.players.map((p) => p.id)).size !== s.players.length ||
    s.epoch < 0 ||
    s.revision < 0 ||
    (s.started && s.players.length !== 2)
  )
    throw new Error("Invalid seats or recovery metadata.");
  assertState(s.state);
  validateTakebacks(s);
  if (
    s.undoRequest &&
    (!s.started ||
      ![0, 1].includes(s.undoRequest.by) ||
      typeof s.undoRequest.id !== "string" ||
      s.undoRequest.id.length > 100 ||
      !Number.isInteger(s.undoRequest.target) ||
      s.events[s.undoRequest.target]?.action.type !== "move")
  )
    throw new Error("Invalid undo request.");
  if (JSON.stringify(s).length > 3 * 1024 * 1024)
    throw new Error("Room snapshot is too large.");
  return s;
}
export function envelope(s, id, action, actionId) {
  return {
    version: 1,
    sessionId: s.id,
    epoch: s.epoch,
    revision: s.revision,
    actionId,
    action,
  };
}
export function accept(
  source,
  clientId,
  command,
  {
    hostId,
    connected = [],
    dice = () => {
      throw new Error("Host dice source required.");
    },
    newId = () => source.id + "-next",
  } = {},
) {
  validateSession(source);
  let s = clone(source);
  const seat = s.players.findIndex((p) => p.id === clientId);
  if (seat < 0) throw new Error("You do not own a seat in this match.");
  if (
    !command ||
    command.version !== 1 ||
    typeof command.actionId !== "string" ||
    command.actionId.length > 100 ||
    !command.action ||
    JSON.stringify(command).length > 3000
  )
    throw new Error("Invalid command.");
  if (s.seen.includes(command.actionId)) return s;
  if (
    command.sessionId !== s.id ||
    command.epoch !== s.epoch ||
    command.revision !== s.revision
  )
    throw new Error(
      "The table changed. Your action was not applied; use the current position.",
    );
  const action = clone(command.action);
  if (action.type === "recover") {
    if (!s.recovery) throw new Error("No recovery is pending.");
    if (
      action.checkpoint?.hash !== s.recovery.hash ||
      action.checkpoint?.revision !== s.recovery.revision
    )
      throw new Error(
        "Recovery snapshots disagree. Match remains paused; export the history before starting another room.",
      );
    if (!s.recovery.confirmed.includes(clientId))
      s.recovery.confirmed.push(clientId);
    if (s.players.every((p) => s.recovery.confirmed.includes(p.id)))
      s.recovery = null;
  } else {
    if (s.recovery)
      throw new Error("Match paused until both players confirm recovery.");
    if (
      s.players.length !== 2 ||
      s.players.some((p) => !connected.includes(p.id))
    )
      throw new Error("Waiting for both original players to connect.");
    if (s.undoRequest) {
      const request = s.undoRequest;
      if (action.requestId !== request.id)
        throw new Error("Waiting for the opponent's undo decision.");
      if (action.type === "undo-cancel" && seat === request.by)
        s.undoRequest = null;
      else if (
        ["undo-accept", "undo-decline"].includes(action.type) &&
        seat !== request.by
      ) {
        if (action.type === "undo-accept")
          s = undoTurn(s, request.target, request.by, seat);
        else s.undoRequest = null;
        s.undoReply = {
          id: request.id,
          by: request.by,
          accepted: action.type === "undo-accept",
          target: request.target,
          eventCount: s.events.length,
        };
      } else
        throw new Error(
          "Only the opponent can accept or decline this undo.",
        );
    } else if (action.type === "undo-request") {
      const target = takebackTarget(s, seat);
      if (
        target === null ||
        (s.undoReply?.accepted === false &&
          s.undoReply.by === seat &&
          s.undoReply.target === target &&
          s.undoReply.eventCount === s.events.length)
      )
        throw new Error("There is no turn available to request again.");
      s.undoRequest = { by: seat, target, id: command.actionId };
    } else if (action.type === "auto") {
      if (clientId !== hostId || !s.started)
        throw new Error("Only the host can advance a forced turn.");
      const before = s.events.length;
      settleForced(s);
      if (s.events.length === before)
        throw new Error("This turn has a choice.");
    } else if (action.type === "start") {
      if (s.started || clientId !== hostId)
        throw new Error("Only the host can start this waiting room.");
      s.started = true;
    } else if (action.type === "rematch") {
      if (s.state.phase !== "over" || !s.state.result?.matchOver)
        throw new Error("Finish this match first.");
      if (!s.rematch.includes(clientId)) s.rematch.push(clientId);
      if (s.rematch.length === 2) {
        const next = session(
          s.players,
          { matchLength: s.state.matchLength, rules: clone(s.state.rules) },
          newId(),
        );
        next.started = true;
        return next;
      }
    } else {
      if (!s.started) throw new Error("The room has not started.");
      if (["opening", "roll"].includes(action.type)) {
        if (action.dice) throw new Error("Only the host supplies dice.");
        action.dice =
          action.type === "roll" ? tableDice(s, seat, dice) : dice();
      }
      s = playAction(s, action, seat);
    }
  }
  if (s.started && !s.recovery && !s.undoRequest) settleForced(s);
  s.revision++;
  s.seen.push(command.actionId);
  s.seen = s.seen.slice(-128);
  s.hash = hash(s.hash + JSON.stringify(action) + s.revision);
  return validateSession(s);
}
export function recover(source, hostId) {
  validateSession(source);
  const s = clone(source);
  s.recovery = { ...checkpoint(s), confirmed: [hostId] };
  s.epoch++;
  s.revision++;
  return s;
}
export function verifyHistory(s) {
  validateTakebacks(s, true);
  const final = replay(s.initial, s.events).at(-1);
  if (JSON.stringify(final) !== JSON.stringify(s.state))
    throw new Error("Match history does not reproduce its snapshot.");
  return true;
}
