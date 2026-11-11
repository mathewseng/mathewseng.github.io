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

// Auto roll is worth offering only when a roll could leave nothing to decide:
// a made point blocks an entry (a lone opposing checker can be hit), and some
// roll of two different dice has a single legal play, with both dice forced
// or unplayable. One blocked point with one checker on the bar does not count:
// the checker enters and the other die is still a free choice.
const forcedRolls = new Map();
export function canAutoRollFromBar(state, player = state?.turn) {
  if (!state?.bar[player]) return false;
  const start = player === 0 ? 18 : 0, opponent = player === 0 ? -1 : 1;
  if (!state.points.slice(start, start + 6).some(count => count * opponent >= 2)) return false;
  const off = state.off || [0, 0];
  const key = `${player}:${state.points}:${state.bar}:${off}`;
  if (!forcedRolls.has(key)) {
    let forced = false;
    for (let a = 1; a <= 6 && !forced; a++) for (let b = a + 1; b <= 6 && !forced; b++)
      forced = legalTurns({...state, off, turn:player, phase:'move', dice:[b, a]}).length <= 1;
    forcedRolls.set(key, forced);
    if (forcedRolls.size > 256) forcedRolls.delete(forcedRolls.keys().next().value);
  }
  return forcedRolls.get(key);
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
    return this.validSession(record, model, current) && canAutoRollFromBar(current, record.player);
  }
  sync(model, current = model?.state, choice = false) {
    if (!this.validSession(this.skip, model, current) || choice) this.skip = null;
    if (!this.valid(this.active, model, current)) this.active = null;
    if (!this.valid(this.gesture, model, current)) this.gesture = null;
    for (const record of [this.active,this.gesture,this.skip].filter(Boolean)) {
      // Partial entries keep the intent. canAutoRollFromBar stops it when the
      // final checker enters (including an unconfirmed draft).
      record.sequence = current.sequence;
    }
    return this.active;
  }
  noteRoll(model, {x = 0, y = 0, at = performance.now()} = {}) {
    const s = model?.state;
    this.gesture = s?.phase === 'roll' && canAutoRollFromBar(s) ? {
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
