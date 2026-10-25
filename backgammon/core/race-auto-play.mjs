// SPDX-License-Identifier: GPL-3.0-or-later
import { decisionPlayer, positionKey, transition } from './rules.mjs';
import { cubeChoices } from '../engine/cube-grade.mjs';

export const RACE_CUBE_MARGIN = 0.05;

// The player is bearing off, and the opposing checkers have passed: no hit or
// re-entry can occur. The opponent need not have reached its home board yet.
export function bearingOffRace(state, player = state?.turn) {
  if (!state || ![0,1].includes(player) || !['roll','move','double'].includes(state.phase) || state.bar.some(Boolean)) return false;
  const white = state.points.flatMap((n,i) => n > 0 ? [i] : []);
  const black = state.points.flatMap((n,i) => n < 0 ? [i] : []);
  return !!white.length && !!black.length && white.at(-1) < black[0] &&
    (player === 0 ? white.at(-1) < 6 : black[0] >= 18);
}

// A heuristic, not proof of the game result. Only completed, deterministic,
// context-matched cubeful analysis may choose a clear cube action for the user.
export function clearRaceCubeAction(state, result) {
  if (!bearingOffRace(state, decisionPlayer(state)) ||
      !['roll','double'].includes(state.phase) || result?.status !== 'complete' ||
      result.type !== 'cube' || result.available !== true ||
      result.positionKey !== positionKey(state) || result.perspective !== state.turn ||
      result.units !== (state.matchLength ? 'normalized-match-equity' : 'current-cube-points') ||
      result.settings?.cubeful !== true || !Number.isInteger(result.settings.plies) ||
      result.settings.plies < 3 || result.settings.noise !== 0) return null;
  try {
    const choices = cubeChoices(state,result);
    if (choices.length < 2 || choices[0].equity - choices[1].equity <= RACE_CUBE_MARGIN + 1e-12) return null;
    const type = choices[0].action;
    if (!['roll','double','take','pass','beaver','raccoon'].includes(type)) return null;
    transition(state, type === 'roll' ? {type,dice:[1,2]} : {type}, decisionPlayer(state));
    return {type};
  } catch { return null; }
}

// Explicit, session-only intent, scoped to one player/game. Never persists an
// automatic action through reload, takeback, changed controls or a new game.
export class RaceAutoPlay {
  active = null;
  gesture = null;
  reset() { this.active = this.gesture = null; }
  valid(record, model, current = model?.state) {
    return !!record && !!model?.started && record.id === model.id &&
      record.game === current.gameNumber && current.sequence >= record.sequence &&
      !model.reviewingTurn && !model.undoRequest && bearingOffRace(current,record.player);
  }
  sync(model, current = model?.state, choice = false) {
    if (choice || !this.valid(this.active,model,current)) this.active = null;
    if (!this.valid(this.gesture,model,current)) this.gesture = null;
    for (const record of [this.active,this.gesture].filter(Boolean)) record.sequence = current.sequence;
    return this.active;
  }
  noteRoll(model, {x=0,y=0,at=performance.now()} = {}) {
    const s = model?.state;
    this.gesture = s?.phase === 'roll' && bearingOffRace(s) ? {
      id:model.id,game:s.gameNumber,sequence:s.sequence,player:s.turn,x,y,at,
    } : null;
  }
  repeat(model, {x=0,y=0,at=performance.now()} = {}) {
    const g = this.gesture;
    if (!this.valid(g,model) || at < g.at || at-g.at > 450 || Math.hypot(x-g.x,y-g.y) > 44) return false;
    this.active = {...g}; this.gesture = null;
    return true;
  }
}
