// SPDX-License-Identifier: GPL-3.0-or-later
import { blockedBarRoll, canDouble, positionKey } from './rules.mjs';
import { cubeChoices } from '../engine/cube-grade.mjs';

export const CLOSED_OUT_MARGIN = 0.25;

// Only a completed, cubeful, score/rule/owner-matched search can authorize
// declining a legal cube. A shallow reading, failure or stale cache cannot.
export function closedOutCubeMargin(state, result) {
  if (!blockedBarRoll(state) || !canDouble(state) ||
      result?.status !== 'complete' || result.type !== 'cube' || result.available !== true ||
      result.positionKey !== positionKey(state) || result.perspective !== state.turn ||
      result.units !== (state.matchLength ? 'normalized-match-equity' : 'current-cube-points') ||
      result.settings?.cubeful !== true || !Number.isInteger(result.settings.plies) ||
      result.settings.plies < 2 || result.settings.noise !== 0) return null;
  try {
    // Includes the engine's actual beaver/raccoon response tree when enabled.
    const choices = cubeChoices(state, result);
    const no = choices.find(c => c.action === 'roll')?.equity;
    const double = choices.find(c => c.action === 'double')?.equity;
    return Number.isFinite(no) && Number.isFinite(double) ? no - double : null;
  } catch { return null; }
}
export function canAutoPassClosedOut(state, result = null) {
  if (!blockedBarRoll(state)) return false;
  if (!canDouble(state)) return true;
  const margin = closedOutCubeMargin(state, result);
  return margin !== null && margin >= CLOSED_OUT_MARGIN;
}

// A device preference chooses whether to use the legal/EV shortcut. Keep the
// proof above independent so recorded actions and network validation can reuse it.
export function shouldAutoPassClosedOut(state, mode = 'off', result = null) {
  if (mode === 'forced') return blockedBarRoll(state) && !canDouble(state);
  return mode === 'bad-double' && canAutoPassClosedOut(state, result);
}
