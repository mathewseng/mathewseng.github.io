#!/usr/bin/env bun
/**
 * Give each dance (no legal entry) a roll: the rolls that block every entry
 * are the candidates, and the dice reader picks among them when it saw the dice.
 * usage: bun resolve_dances.mjs <analysis-game.json> <dice-evidence.json> <source-game>
 */
import fs from 'node:fs';
import { legalTurns } from '../../../core/rules.mjs';

const [file, evidenceFile, sourceGame] = process.argv.slice(2);
const A = JSON.parse(fs.readFileSync(file, 'utf8'));
const evidence = JSON.parse(fs.readFileSync(evidenceFile, 'utf8'))[Number(sourceGame) - 1];
let n = 0;
for (const [i, t] of A.turns.entries()) {
  if (!t.dance) continue;
  const turn = t.player === 'white' ? 0 : 1;
  const blocked = [];
  for (let a = 1; a <= 6; a++) for (let b = a; b <= 6; b++) {
    const st = { points: t.before.points, bar: t.before.bar, off: t.before.off, turn, dice: [b, a], phase: 'move' };
    if (legalTurns(st).every(x => !x.steps.length)) blocked.push(`${b}-${a}`);
  }
  const ev = evidence?.[i];
  let roll = blocked[0], source = 'ambiguous';
  if (ev?.rollLogProb && blocked.length) {
    roll = [...blocked].sort((x, y) => ev.rollLogProb[y] - ev.rollLogProb[x])[0]; source = 'dice';
  }
  if (blocked.length === 1) source = 'move';
  t.rollCandidates = blocked; t.roll = roll.split('-').map(Number); t.rollSource = source;
  if (ev?.rollFrame && !t.rollFrame) t.rollFrame = ev.rollFrame;
  n++;
  console.log(`turn ${i + 1} ${t.player} dance: ${roll} (${source}; ${blocked.length} blocking rolls)`);
}
fs.writeFileSync(file, JSON.stringify(A, null, 1));
console.log('dances', n);
