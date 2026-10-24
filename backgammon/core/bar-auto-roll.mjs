// SPDX-License-Identifier: GPL-3.0-or-later
import { blockedBarRoll, canDouble } from './rules.mjs';

// Roll after an opponent's failed entry, or when every entry is blocked.
// Keep every legal cube choice and pending response manual.
export function canAutoRollAfterBarPass(state, lastEvent = null) {
  if (!state || state.phase !== 'roll' || state.pending || canDouble(state) || blockedBarRoll(state)) return false;
  const opponent = 1-state.turn;
  const missedEntry = state.bar[opponent] > 0 && lastEvent?.actor === opponent &&
    lastEvent.action?.type === 'move' && lastEvent.action.steps?.length === 0;
  return missedEntry || blockedBarRoll({...state, turn:opponent});
}

// A single opposing checker can be hit, so only made points block entry.
export function canAutoRollFromBar(state, player = state?.turn) {
  if (!state?.bar[player]) return false;
  const start = player === 0 ? 18 : 0, opponent = player === 0 ? -1 : 1;
  return state.points.slice(start, start + 6).some(count => count * opponent >= 2);
}

// Session-only intent: never consumes dice, chooses an entry, or survives reload.
export class BarAutoRoll {
  active = null;
  gesture = null;
  reset() { this.active = null; this.gesture = null; }
  valid(record, model, current = model?.state) {
    return record && model?.started && record.id === model.id &&
      record.game === current.gameNumber && current.phase !== 'over' &&
      !model.reviewingTurn && !model.undoRequest && canAutoRollFromBar(current, record.player) &&
      current.sequence >= record.sequence;
  }
  sync(model, current = model?.state) {
    if (!this.valid(this.active, model, current)) this.active = null;
    if (!this.valid(this.gesture, model, current)) this.gesture = null;
    for (const record of [this.active,this.gesture].filter(Boolean)) {
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
  repeat(model, {x = 0, y = 0, at = performance.now()} = {}) {
    const g = this.gesture;
    if (!this.valid(g, model) || at < g.at || at - g.at > 450 ||
        Math.hypot(x-g.x,y-g.y) > 44) return false;
    this.active = g;
    this.gesture = null;
    return true;
  }
  canRoll(model) {
    const a = this.sync(model), s = model?.state;
    return !!a && s.turn === a.player && s.phase === 'roll';
  }
}
