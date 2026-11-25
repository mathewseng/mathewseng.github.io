#!/usr/bin/env bun
/**
 * Join turns that the decode split in two: one roll played in two stages, with an opponent's turn
 * inferred between them that never happened (the roller's dice lie unmoved throughout and the
 * opponent's dice never appear). The first turn takes the last turn's result, the roll that plays
 * the whole change (checked: it must be the only roll, or the reviewed one among several) and is
 * re-scored; the turns after it in the group are dropped.
 *
 * usage: bun merge_turns.mjs <analysis-dir> <merged-turns.json>
 *   [{"game": 1, "firstFrame": 6351, "lastFrame": 6401, "player": "dark", "roll": [5, 4], "note": "..."}]
 *   firstFrame and lastFrame are the resultFrames of the first and last turn of the group.
 */
import fs from 'node:fs';
import path from 'node:path';
import { initialState, legalTurns } from '../../../core/rules.mjs';
import { createScorer, RULES } from './scoring.mjs';

const [dir, file] = process.argv.slice(2);
const merges = JSON.parse(fs.readFileSync(file, 'utf8'));
const scorer = await createScorer();
const same = (a, b) => a.points.join(',') === b.points.join(',') && a.bar.join(',') === b.bar.join(',') && a.off.join(',') === b.off.join(',');
for (const m of merges) {
  const p = path.join(dir, `game-${String(m.game).padStart(2, '0')}.json`);
  const A = JSON.parse(fs.readFileSync(p, 'utf8'));
  const i = A.turns.findIndex(t => t.resultFrame === m.firstFrame && t.player === m.player);
  const j = A.turns.findIndex((t, k) => k > i && t.resultFrame === m.lastFrame && t.player === m.player);
  if (i < 0 || j < 0) { console.log('already merged or not found', m); continue; }
  const first = A.turns[i], last = A.turns[j], side = m.player === 'white' ? 0 : 1;
  const fits = [];
  for (let a = 1; a <= 6; a++) for (let b = a; b <= 6; b++) {
    const st = initialState({ points: first.before.points, bar: first.before.bar, off: first.before.off, turn: side, dice: [b, a], phase: 'move', matchLength: 0, cube: { ...first.cube }, rules: RULES });
    const play = legalTurns(st).find(x => same({ points: x.state.points, bar: x.state.bar, off: x.state.off }, last.after));
    if (play) fits.push({ key: `${b}-${a}`, st, play });
  }
  const key = `${Math.max(...m.roll)}-${Math.min(...m.roll)}`, fit = fits.find(f => f.key === key);
  if (!fit) { console.log('the roll does not play the joined change', m, fits.map(f => f.key)); process.exit(1); }
  Object.assign(first, {
    resultFrame: last.resultFrame, after: last.after, pickupFrame: last.pickupFrame ?? first.pickupFrame,
    rollCandidates: fits.map(f => f.key), roll: [Math.max(...m.roll), Math.min(...m.roll)],
    rollSource: fits.length === 1 ? 'move' : 'reviewed', rollNote: m.note, steps: fit.play.steps, joined: A.turns.slice(i + 1, j + 1).length,
  });
  delete first.rollMargin;
  first.analysis = await scorer.checker(fit.st, fit.play.steps);
  A.turns.splice(i + 1, j - i);
  fs.writeFileSync(p, JSON.stringify(A, null, 1));
  console.log(`game ${m.game}: ${m.player} ${key} played ${first.analysis.played.notation} loss ${first.analysis.evLoss.toFixed(3)} (${j - i} turns joined)`);
}
