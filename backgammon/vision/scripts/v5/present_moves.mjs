#!/usr/bin/env bun
/**
 * Rewrite the move text of analyses scored before scoring.mjs wrote moves as the app
 * does (presentMove: one journey per checker, hits marked). Adds each candidate's
 * steps, recovered from the opening-book result or the legal turns, without re-scoring.
 *
 * usage: bun present_moves.mjs <analysis-dir>...
 */
import fs from 'node:fs';
import path from 'node:path';
import { initialState, legalTurns, notation } from '../../../core/rules.mjs';
import { presentMove } from '../../../core/move-presentation.mjs';
import { RULES } from './scoring.mjs';

const SIDE = { white: 0, dark: 1 };
for (const dir of process.argv.slice(2)) {
  for (const name of fs.readdirSync(dir).filter(n => /^game-\d+\.json$/.test(n)).sort()) {
    const file = path.join(dir, name), A = JSON.parse(fs.readFileSync(file, 'utf8'));
    let changed = 0;
    for (const t of A.turns) {
      const a = t.analysis;
      if (!a || !t.steps || !t.roll) continue;
      const st = initialState({ points: t.before.points, bar: t.before.bar, off: t.before.off, turn: SIDE[t.player], dice: t.roll,
        phase: 'move', matchLength: 0, cube: { ...t.cube }, rules: RULES });
      let known;
      const stepsFor = text => {
        known ??= new Map([...legalTurns(st), ...(a.result?.candidates ?? [])].map(x => [notation(x.steps, st.turn), x.steps]));
        return known.get(text);
      };
      for (const c of a.candidates) {
        const steps = c.steps ?? stepsFor(c.notation);
        if (!steps) throw new Error(`${file}: no steps for candidate ${c.notation}`);
        const text = presentMove(st, steps).notation;
        if (text !== c.notation || !c.steps) changed++;
        c.steps = steps; c.notation = text;
      }
      if (a.played) {
        const text = presentMove(st, t.steps).notation;
        if (text !== a.played.notation) changed++;
        a.played.steps = t.steps; a.played.notation = text;
      }
    }
    fs.writeFileSync(file, JSON.stringify(A, null, 1));
    console.log(`${file}: ${changed} moves rewritten`);
  }
}
