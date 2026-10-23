// SPDX-License-Identifier: GPL-3.0-or-later
// Session-only intent: never consumes dice, chooses an entry, or survives reload.
export class BarAutoRoll {
  active = null;
  gesture = null;
  reset() { this.active = null; this.gesture = null; }
  valid(record, model, current = model?.state) {
    return record && model?.started && record.id === model.id &&
      record.game === current.gameNumber && current.phase !== 'over' &&
      !model.reviewingTurn && !model.undoRequest &&
      current.sequence >= record.sequence && current.bar[record.player] >= record.bar;
  }
  sync(model, current = model?.state) {
    if (!this.valid(this.active, model, current)) this.active = null;
    if (!this.valid(this.gesture, model, current)) this.gesture = null;
    for (const record of [this.active,this.gesture].filter(Boolean)) {
      // Another checker may be hit while waiting. Stop on the next entry,
      // even when the remaining bar count equals the original count.
      record.bar = current.bar[record.player];
      record.sequence = current.sequence;
    }
    return this.active;
  }
  noteRoll(model, {x = 0, y = 0, at = performance.now()} = {}) {
    const s = model?.state;
    this.gesture = s?.phase === 'roll' && s.bar[s.turn] > 0 ? {
      id:model.id, game:s.gameNumber, sequence:s.sequence, player:s.turn,
      bar:s.bar[s.turn], x, y, at,
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
