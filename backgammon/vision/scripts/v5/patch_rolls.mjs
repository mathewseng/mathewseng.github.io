#!/usr/bin/env bun
/**
 * Apply source-reviewed rolls (reviewed-rolls.json) to analysed games and
 * re-score only those checker decisions at four ply.
 * usage: bun patch_rolls.mjs <analysis-dir> <reviewed-rolls.json>
 */
import fs from 'node:fs';
import path from 'node:path';
import { initialState } from '../../../core/rules.mjs';
import { loadEvaluator } from './engine.mjs';

const [dir, file] = process.argv.slice(2);
const reviews = JSON.parse(fs.readFileSync(file, 'utf8'));
const RULES = { cube: true, jacoby: false, immediateRedoubles: 1 };
const ev = await loadEvaluator();
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
    const { legalTurns } = await import('../../../core/rules.mjs');
    const play = legalTurns(st).find(x => x.state.points.join(',') === t.after.points.join(','));
    t.steps = play.steps;
    const a = ev.analyze(st, 'research', 'checker', t.steps);
    const rank = a.candidates.findIndex(c => c.key === a.actual?.key);
    t.analysis = { candidates: a.candidates.slice(0, 5).map(c => ({ notation: c.notation, equity: c.equity, probabilities: c.probabilities })),
      played: { notation: a.actual.notation, equity: a.actual.equity, probabilities: a.actual.probabilities, rank: rank + 1 }, evLoss: a.error, legalMoves: a.candidates.length };
    console.log(`game ${g}: ${t.player} ${key} played ${a.actual.notation} loss ${a.error.toFixed(3)}`);
  }
  fs.writeFileSync(p, JSON.stringify(A, null, 1));
}
