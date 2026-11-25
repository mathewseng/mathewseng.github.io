#!/usr/bin/env bun
/**
 * Replace decoded turns with turns rebuilt by eye, and carry the change through the rest of the game.
 *
 * For a fixed turn the file gives the roll and the move in the player's own numbering ("8/4 8/6",
 * "6/off(2)", "bar/20"); it must be a legal play of that roll from the (new) position before it. Every
 * later turn keeps its own player's checkers as decoded (its after-position on that side) and takes the
 * other side from the new position; its move is re-found among the legal plays of its roll (it must
 * still be legal) and its roll candidates are recomputed. Every turn from the first fix on is re-scored
 * (pre-roll cube or position, checker play), as analyze.mjs scores it. Cube actions are kept.
 * {"dance": true, "candidates": [...]} is a turn that could not enter (every candidate must block); {"irregular": true}
 * is a change the players made that no roll plays (the tool checks that; the dice's roll is kept, the move is shown
 * as irregular play and not scored); {"drop": true} removes a turn the decode invented.
 *
 * usage: bun rechain_turns.mjs <analysis-dir> <fixes.json>
 *   [{"game": 2, "resultFrame": 46953, "player": "dark", "roll": [4, 2], "move": "8/4 8/6",
 *     "newResultFrame": 46945, "rollFrame": 46810, "pickupFrame": 46940, "source": "reviewed", "note": "..."}]
 *   resultFrame (and player) name the decoded turn; newResultFrame, rollFrame and pickupFrame retime it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { initialState, legalTurns, canDouble } from '../../../core/rules.mjs';
import { createScorer, RULES, PRESET } from './scoring.mjs';

const [dir, file] = process.argv.slice(2);
const fixes = JSON.parse(fs.readFileSync(file, 'utf8'));
const scorer = await createScorer(), evaluator = scorer.evaluator;
const SIDE = { white: 0, dark: 1 };
const key = r => `${Math.max(...r)}-${Math.min(...r)}`;
const clone = p => ({ points: [...p.points], bar: [...p.bar], off: [...p.off] });
const same = (a, b) => a.points.join(',') === b.points.join(',') && a.bar.join(',') === b.bar.join(',') && a.off.join(',') === b.off.join(',');
const state = (pos, s, dice, cube, phase = 'move') => initialState({ points: pos.points, bar: pos.bar, off: pos.off, turn: s, ...(dice ? { dice } : {}), phase, matchLength: 0, cube: { ...cube }, rules: RULES });

/** Apply a move written in the player's own numbering (24..1, bar, off) to a position, without checking legality. */
function applyNotation(pos, s, move) {
  const p = clone(pos), sign = s === 0 ? 1 : -1;
  const idx = n => (s === 0 ? n - 1 : 24 - n);  // own point n -> board index
  for (const part of move.trim().split(/\s+/)) {
    const m = part.replace(/\*/g, '').match(/^(bar|\d+)((?:\/(?:\d+|off))+)(?:\((\d+)\))?$/);
    if (!m) throw new Error(`cannot read move part ${part}`);
    const hops = [m[1], ...m[2].split('/').slice(1)], times = Number(m[3] ?? 1);
    for (let k = 0; k < times; k++) {
      const from = hops[0], to = hops.at(-1);
      if (from === 'bar') p.bar[s]--; else p.points[idx(Number(from))] -= sign;
      if (to === 'off') p.off[s]++; else p.points[idx(Number(to))] += sign;
    }
  }
  return p;
}

/** The mover's side of `after` on the other side's checkers of `before`. */
function moverSide(before, after, s) {
  const p = clone(before), sign = s === 0 ? 1 : -1;
  for (let i = 0; i < 24; i++) {
    if (p.points[i] * sign > 0) p.points[i] = 0;
    if (after.points[i] * sign > 0) { if (p.points[i] !== 0) throw new Error(`point ${i + 1} held by both sides`); p.points[i] = after.points[i]; }
  }
  p.bar[s] = after.bar[s]; p.off[s] = after.off[s];
  return p;
}

function fits(before, after, s, cube) {
  const out = [];
  for (let a = 1; a <= 6; a++) for (let b = a; b <= 6; b++) {
    const play = legalTurns(state(before, s, [b, a], cube)).find(x => same({ points: x.state.points, bar: x.state.bar, off: x.state.off }, after));
    if (play) out.push({ key: `${b}-${a}`, play });
  }
  return out;
}

for (const g of [...new Set(fixes.map(f => f.game))]) {
  const p = path.join(dir, `game-${String(g).padStart(2, '0')}.json`);
  const A = JSON.parse(fs.readFileSync(p, 'utf8'));
  const mine = fixes.filter(f => f.game === g);
  const at = mine.map(f => {
    const i = A.turns.findIndex(t => t.resultFrame === f.resultFrame && t.player === f.player && !t.cubeOnly);
    if (i < 0) throw new Error(`game ${g}: no ${f.player} turn at ${f.resultFrame}`);
    return [i, f];
  });
  const byTurn = new Map(at);
  const first = Math.min(...at.map(([i]) => i));
  let pos = clone(A.turns[first].before);
  const dropped = [];
  for (let i = first; i < A.turns.length; i++) {
    const t = A.turns[i];
    if (t.cubeOnly) continue;
    const s = SIDE[t.player], fix = byTurn.get(i), cube = t.cube ?? { value: 1, owner: null };
    const oldAfter = t.after;
    t.before = clone(pos);
    if (fix?.drop) { dropped.push(i); console.log(`game ${g} turn ${i + 1} ${t.player} dropped`); continue; }
    if (fix?.irregular) {
      // irregular play: the board changed in a way no roll plays; the dice's roll is kept, the move is not scored
      const target = applyNotation(pos, s, fix.move), cands = fits(pos, target, s, cube);
      if (cands.length) throw new Error(`game ${g} turn ${i + 1}: ${fix.move} is legal for ${cands.map(c => c.key).join(' ')}`);
      Object.assign(t, { after: target, roll: [Math.max(...fix.roll), Math.min(...fix.roll)], rollCandidates: [], rollSource: fix.source ?? 'reviewed',
        rollNote: fix.note, irregular: { played: fix.move, note: fix.note }, dance: false, inferred: null });
      delete t.rollMargin; delete t.steps; delete t.analysis;
      if (fix.newResultFrame) t.resultFrame = fix.newResultFrame;
      if (fix.rollFrame) t.rollFrame = fix.rollFrame;
      if (fix.pickupFrame) t.pickupFrame = fix.pickupFrame;
    } else if (fix?.dance) {
      // a dance: no roll may enter; the candidates are the blocking rolls (narrowed to fix.candidates, e.g. those with the face seen)
      const blocking = [];
      for (let a = 1; a <= 6; a++) for (let b = a; b <= 6; b++) if (!legalTurns(state(pos, s, [b, a], cube)).some(x => x.steps.length)) blocking.push(`${b}-${a}`);
      const cands = fix.candidates ?? blocking, bad = cands.filter(k => !blocking.includes(k));
      if (bad.length || !cands.includes(key(fix.roll))) throw new Error(`game ${g} turn ${i + 1}: ${bad.join(' ') || key(fix.roll)} can enter (blocking: ${blocking.join(' ')})`);
      Object.assign(t, { after: clone(pos), roll: [Math.max(...fix.roll), Math.min(...fix.roll)], rollCandidates: cands,
        rollSource: cands.length === 1 ? 'dice' : (fix.source ?? 'ambiguous'), rollNote: fix.note, dance: true, inferred: null });
      delete t.rollMargin; delete t.steps; delete t.analysis;
      if (fix.newResultFrame) t.resultFrame = fix.newResultFrame;
      if (fix.rollFrame) t.rollFrame = fix.rollFrame;
      if (fix.pickupFrame) t.pickupFrame = fix.pickupFrame;
    } else if (fix) {
      const target = applyNotation(pos, s, fix.move);
      const cands = fits(pos, target, s, cube), f = cands.find(c => c.key === key(fix.roll));
      if (!f) throw new Error(`game ${g} turn ${i + 1}: ${key(fix.roll)} ${fix.move} is not legal here (fits: ${cands.map(c => c.key).join(' ') || 'none'})`);
      Object.assign(t, { after: target, roll: [Math.max(...fix.roll), Math.min(...fix.roll)], rollCandidates: cands.map(c => c.key),
        rollSource: cands.length === 1 ? 'move' : (fix.source ?? 'reviewed'), rollNote: fix.note, steps: f.play.steps, dance: false, inferred: null });
      delete t.rollMargin;
      if (fix.newResultFrame) t.resultFrame = fix.newResultFrame;
      if (fix.rollFrame) t.rollFrame = fix.rollFrame;
      if (fix.pickupFrame) t.pickupFrame = fix.pickupFrame;
    } else {
      // replay the decoded steps on the new position (a hit sends the other side's checker to the bar);
      // without steps, keep the mover's side as decoded
      const sk = st => st.map(x => `${x.from}>${x.to}`).join(',');
      const replay = t.roll && t.steps?.length && legalTurns(state(pos, s, t.roll, cube)).find(x => sk(x.steps) === sk(t.steps));
      t.after = replay ? { points: [...replay.state.points], bar: [...replay.state.bar], off: [...replay.state.off] } : t.dance ? clone(pos) : moverSide(pos, oldAfter, s);
      if (t.roll) {
        const cands = fits(t.before, t.after, s, cube), f = cands.find(c => c.key === key(t.roll));
        if (!f && !t.dance) throw new Error(`game ${g} turn ${i + 1}: the decoded ${key(t.roll)} no longer plays the move`);
        t.rollCandidates = cands.map(c => c.key);
        if (f && !t.dance) t.steps = f.play.steps;
      }
    }
    // re-score as analyze.mjs does
    const pre = state(t.before, s, undefined, cube, 'roll');
    const c = evaluator.analyze(pre, PRESET, 'cube');
    if (canDouble(pre)) { t.cubeDecision = { options: c.decisionOptions, best: c.action, equity: c.equity, outcomes: c.outcomes, probabilities: c.probabilities }; delete t.position; }
    else { t.position = { equity: c.equity, probabilities: c.probabilities }; delete t.cubeDecision; }
    if (t.cubeAction) {  // the opponent's answer to an offer made before this roll
      const offered = initialState({ points: t.before.points, bar: t.before.bar, off: t.before.off, turn: s, phase: 'double', matchLength: 0,
        cube: { ...cube }, pending: { type: 'double', by: s }, rules: RULES });
      const r = evaluator.analyze(offered, PRESET, 'cube');
      t.cubeAction.responses = r.decisionOptions; t.cubeAction.bestResponse = r.action;
    }
    if (t.roll && !t.dance && t.steps) t.analysis = await scorer.checker(state(t.before, s, t.roll, cube), t.steps);
    if (fix || i === first) console.log(`game ${g} turn ${i + 1} ${t.player} ${t.roll ? key(t.roll) : '-'} ${t.analysis?.played?.notation ?? ''} loss ${t.analysis?.evLoss?.toFixed(3) ?? '-'}${fix ? ' (fixed)' : ''}`);
    pos = clone(t.after);
  }
  for (const i of dropped.reverse()) A.turns.splice(i, 1);
  fs.writeFileSync(p, JSON.stringify(A, null, 1));
  console.log(`game ${g}: ${at.length} turns fixed, turns ${first + 1}-${A.turns.length} re-chained and re-scored`);
}
