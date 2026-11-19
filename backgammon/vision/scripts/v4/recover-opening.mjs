/** Apply the reviewed opening-toss and single physical roll in the Game 3 source. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { artifactDir, replayDir, solverUrl } from '../project_paths.mjs';
import { rowsFrom } from '../v2/solve_games.mjs';
import { writeReplay } from './accounting.mjs';

const { boardKey, initialState, legalTurns, notation } = await import(solverUrl('backgammon/core/rules.mjs'));
const { toXGID } = await import(solverUrl('backgammon/core/xgid.mjs'));
const rawDir = path.join(artifactDir, 'v2');
const source = path.resolve(process.argv[2] ?? replayDir);
const game = JSON.parse(fs.readFileSync(path.join(source, 'game-03-game.json')));
const rows = rowsFrom(path.join(source, 'game-03-state.jsonl.gz'));
const recording = JSON.parse(fs.readFileSync(path.join(rawDir, 'game-3-analysis.json')));
assert.equal(recording.segments[0].source, 'office-3-wide_20261117-190528.mp4');
assert.equal(recording.segments[0].firstFrame, 1150);
const raw = recording.segments.slice(0, 2).flatMap(part => rowsFrom(path.join(rawDir, 'state',
  part.source.replace(/\.mp4$/, '.jsonl.gz'))).slice(part.firstFrame, part.lastExclusive).map(row => row.state));
const key = position => position && boardKey({
  points: position.points.map(([white, dark]) => white - dark), bar: position.bar, off: position.borneOff,
});
const board = state => ({
  points: state.points.map(value => [Math.max(value, 0), Math.max(-value, 0)]), bar: state.bar, borneOff: state.off,
});

const [firstBlack, continuation, ...later] = game.presentation.rolls;
assert.deepEqual(firstBlack.sourceTurns, [1]);
assert.deepEqual(continuation.sourceTurns, [2, 3]);
const beforeBlack = game.turns[0].before;
const blank = initialState({ matchLength: 0, rules: { cube: true, jacoby: false, immediateRedoubles: 0 } });
assert(raw.slice(0, 85).filter(frame => key(frame?.position) === boardKey(blank)).length > 10);
assert(raw.slice(175, 188).filter(frame => key(frame?.position) === key(beforeBlack)).length >= 5);
const openings = [];
for (let low = 1; low < 6; low++) {
  for (let high = low + 1; high <= 6; high++) {
    const state = { ...blank, phase: 'move', dice: [low, high], turn: 0 };
    if (legalTurns(state).some(action => action.key === key(beforeBlack))) openings.push(state);
  }
}
assert.equal(openings.length, 1, 'The later board must determine the opening roll uniquely');
const [opening] = openings;

function grade(id, start, end, result, player, state, after, evidence) {
  const actions = legalTurns(state).map(action => ({
    key: action.key, notation: notation(action.steps, state.turn), steps: action.steps,
    xgid: toXGID({ ...action.state, phase: 'roll', dice: [] }, { engine: true }),
    isPlayed: action.key === key(after),
  }));
  const played = actions.find(action => action.isPlayed);
  assert(played);
  const turn = {
    player, start, end, resultFrame: result, dice: state.dice, before: board(state), after,
    evidence, steps: played.steps, pickupFrame: null,
  };
  game.turns[id - 1] = turn;
  game.decisions[id] = { player, dice: state.dice, evidence, xgid: toXGID(state), actions,
    startFrame: start, endFrame: end, observedResultFrame: result, startSeconds: start / 25,
    endSeconds: end / 25, legalCandidates: actions.length };
  return turn;
}

// Both opening dice settle at frame 86. Neither is still on the board at 162.
const openingId = game.turns.length + 1;
const o = grade(openingId, 86, 175, 175, 'white', opening, beforeBlack, 'opening-roll-inferred-from-later-board');
o.pickupFrame = 162;

const originalBlack = { ...blank, points: beforeBlack.points.map(([white, dark]) => white - dark),
  bar: beforeBlack.bar, off: beforeBlack.borneOff, phase: 'move', turn: 1, dice: [3, 4] };
const afterBlack = raw[1017]?.position;
assert(raw.slice(1017, 1030).filter(frame => key(frame?.position) === key(afterBlack)).length >= 5);
const b = grade(1, firstBlack.start, 1017, 1017, 'dark', originalBlack, afterBlack, 'one-physical-roll-with-frozen-origin');
b.pickupFrame = continuation.pickup;

game.presentation.rolls = [
  { start: o.start, end: 162, pickup: 162, player: o.player, decision: openingId,
    dice: [...o.dice].reverse(), evidence: o.evidence, sourceTurns: [openingId] },
  { ...firstBlack, end: continuation.end, pickup: continuation.pickup,
    evidence: b.evidence, sourceTurns: [...firstBlack.sourceTurns, ...continuation.sourceTurns] },
  ...later,
];
// The split episode's second cube decision was scored from a board mid-move.
game.presentation.cubeRolls = game.presentation.cubeRolls.filter(decision => decision.frame !== continuation.start).map(decision =>
  decision.frame === firstBlack.start ? { ...decision, end: continuation.end } : decision);
for (const row of rows) {
  if (o.start <= row.frame && row.frame < 162) {
    row.turn = row.decision = openingId;
    row.player = o.player;
    row.phase = 'move';
    row.roll = { id: openingId, player: o.player, dice: o.dice, status: 'current', evidence: o.evidence };
  }
  if ([1, 2, 3].includes(row.turn) && row.frame <= b.end && ['move', 'played'].includes(row.phase)) {
    row.turn = row.decision = 1;
    row.player = b.player;
    row.phase = row.frame >= b.resultFrame ? 'played' : 'move';
    row.roll = { id: 1, player: b.player, dice: b.dice, status: 'current', evidence: b.evidence };
  }
}
// Keep the old detector records available as audit evidence. Only the
// immutable first board and the legal final board receive a replay grade.
fs.mkdirSync(replayDir, { recursive: true });
writeReplay('game-03', game, rows);
console.log('Game 3', o.dice, o.steps, b.dice, b.steps);
