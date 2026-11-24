// SPDX-License-Identifier: GPL-3.0-or-later
import { blockedBarRoll, canDouble, legalTurns } from './rules.mjs';

// Roll after an opponent's failed entry, or when every entry is blocked.
// Keep every legal cube choice and pending response manual.
export function canAutoRollAfterBarPass(state, lastEvent = null) {
  if (!state || state.phase !== 'roll' || state.pending || canDouble(state) || blockedBarRoll(state)) return false;
  const opponent = 1-state.turn;
  const missedEntry = state.bar[opponent] > 0 && lastEvent?.actor === opponent &&
    lastEvent.action?.type === 'move' && lastEvent.action.steps?.length === 0;
  return missedEntry || blockedBarRoll({...state, turn:opponent});
}

// Share of the 36 rolls that would leave the player nothing to decide: a
// single legal play, or none. The board advertises double tap/click to auto
// roll at 25% or more; the gesture itself always works on a roll.
export const AUTO_ROLL_HINT_CHANCE = 0.25;
const forcedRolls = new Map();
export function forcedRollChance(state, player = state?.turn) {
  if (!state?.points || player == null) return 0;
  const off = state.off || [0, 0];
  const key = `${player}:${state.points}:${state.bar}:${off}`;
  if (!forcedRolls.has(key)) {
    let forced = 0;
    for (let a = 1; a <= 6; a++) for (let b = a; b <= 6; b++)
      if (legalTurns({...state, off, turn:player, phase:'move', dice:[b, a]}).length <= 1) forced += a === b ? 1 : 2;
    forcedRolls.set(key, forced / 36);
    if (forcedRolls.size > 256) forcedRolls.delete(forcedRolls.keys().next().value);
  }
  return forcedRolls.get(key);
}
export function canAutoRollFromBar(state, player = state?.turn) {
  return state?.phase === 'roll' && forcedRollChance(state, player) >= AUTO_ROLL_HINT_CHANCE;
}

// Session-only intent: never consumes dice, chooses an entry, or survives reload.
export class BarAutoRoll {
  active = null;
  gesture = null;
  skip = null;
  get skipping() { return !!this.skip; }
  get waitingForRepeat() { return this.gesture?.action === 'skip'; }
  reset() { this.active = null; this.gesture = null; this.skip = null; }
  validSession(record, model, current = model?.state) {
    return record && model?.started && record.id === model.id &&
      record.game === current.gameNumber && current.phase !== 'over' &&
      !model.reviewingTurn && !model.undoRequest && current.sequence >= record.sequence;
  }
  valid(record, model, current = model?.state) {
    return this.validSession(record, model, current);
  }
  // `choice`: the player now has something to decide. `checkerChoice`: that
  // decision is a checker move. Auto roll keeps going through entry choices
  // while a checker is still on the bar, and otherwise ends at the first roll
  // that leaves a checker choice.
  sync(model, current = model?.state, choice = false, checkerChoice = false) {
    if (!this.validSession(this.skip, model, current) || choice) this.skip = null;
    if (!this.valid(this.active, model, current) ||
        (checkerChoice && current.turn === this.active.player && !current.bar?.[this.active.player])) this.active = null;
    if (!this.valid(this.gesture, model, current)) this.gesture = null;
    for (const record of [this.active,this.gesture,this.skip].filter(Boolean)) {
      // Partial entries keep the intent; a checker choice off the bar
      // (including an unconfirmed draft) stops it.
      record.sequence = current.sequence;
    }
    return this.active;
  }
  noteRoll(model, {x = 0, y = 0, at = performance.now()} = {}) {
    const s = model?.state;
    this.gesture = s?.phase === 'roll' ? {
      id:model.id, game:s.gameNumber, sequence:s.sequence, player:s.turn,
      x, y, at,
    } : null;
  }
  noteSkip(model, {x = 0, y = 0, at = performance.now()} = {}) {
    this.sync(model);
    this.gesture = this.active ? {...this.active, action:'skip', x, y, at} : null;
    return this.gesture;
  }
  repeat(model, {x = 0, y = 0, at = performance.now()} = {}) {
    const g = this.gesture;
    if (!this.valid(g, model) || at < g.at || at - g.at > 450 ||
        Math.hypot(x-g.x,y-g.y) > 44) return false;
    if (g.action === 'skip') this.skip = {...g};
    else this.active = {...g};
    this.gesture = null;
    return true;
  }
  canRoll(model) {
    const a = this.sync(model), s = model?.state;
    return !!a && !this.waitingForRepeat && s.turn === a.player && s.phase === 'roll';
  }
}
