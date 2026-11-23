#!/usr/bin/env bun
/**
 * Apply source-reviewed rolls (reviewed-rolls.json) to analysed games and
 * re-score only those checker decisions (opening book, else four ply).
 * usage: bun patch_rolls.mjs <analysis-dir> <reviewed-rolls.json>
 */
import fs from 'node:fs';
import path from 'node:path';
import { initialState, legalTurns } from '../../../core/rules.mjs';
import { createScorer, RULES } from './scoring.mjs';

const [dir, file] = process.argv.slice(2);
const reviews = JSON.parse(fs.readFileSync(file, 'utf8'));
const scorer = await createScorer();
for (const g of [...new Set(reviews.map(r => r.game))]) {
  const p = path.join(dir, `game-${String(g).padStart(2, '0')}.json`);
  const A = JSON.parse(fs.readFileSync(p, 'utf8'));
  for (const r of reviews.filter(x => x.game === g)) {
    const t = A.turns.find(x => x.resultFrame === r.resultFrame && x.player === r.player);
    if (!t) { console.log('not found', r); continue; }
    const key = `${Math.max(...r.roll)}-${Math.min(...r.roll)}`;
    if (!t.rollCandidates.includes(key)) { console.log('roll not legal for observed move', r); continue; }
    t.roll = [Math.max(...r.roll), Math.min(...r.roll)]; t.rollSource = 'reviewed'; t.rollNote = r.note;
    // the decoder kept the matching plays; recover the steps from the candidate set when present
    const st = initialState({ points: t.before.points, bar: t.before.bar, off: t.before.off, turn: t.player === 'white' ? 0 : 1,
      dice: t.roll, phase: 'move', matchLength: 0, cube: { ...t.cube }, rules: RULES });
    const play = legalTurns(st).find(x => x.state.points.join(',') === t.after.points.join(','));
    t.steps = play.steps;
    t.analysis = await scorer.checker(st, t.steps);
    console.log(`game ${g}: ${t.player} ${key} played ${t.analysis.played.notation} loss ${t.analysis.evLoss.toFixed(3)}`);
  }
  fs.writeFileSync(p, JSON.stringify(A, null, 1));
}
