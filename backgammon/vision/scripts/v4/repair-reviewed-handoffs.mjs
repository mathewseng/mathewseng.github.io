/** Repair roll boundaries found by reviewing the unindexed-dice report. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { artifactDir, replayDir } from '../project_paths.mjs';
import { rowsFrom, stateFor } from '../v2/solve_games.mjs';
import { observedBoard } from './bearoff-board.mjs';
import { boardKey, legalTurns, notation } from '../../../core/rules.mjs';
import { toXGID } from '../../../core/xgid.mjs';
import { applyAccounting, writeReplay } from './accounting.mjs';

const source = process.argv[2];
if (!source) throw new Error('Supply the reviewed Office-3 replay directory.');
const base = path.join(artifactDir, 'v2');
const read = (folder, file) => JSON.parse(fs.readFileSync(path.join(folder, file)));
const key = position => position && boardKey({
  points: position.points.map(([white, dark]) => white - dark), bar: position.bar, off: position.borneOff,
});

function bindRoll(row, turn, id, decision = null) {
  assert(row.phase !== 'game-closed' && !row.cube?.offered);
  row.roll = { id, player: turn.player, dice: turn.dice, status: 'current', evidence: turn.evidence };
  row.player = turn.player;
  row.turn = id;
  row.phase = 'move';
  row.decision = decision;
  delete row.displayPoints;
}

function gameThree(game, rows) {
  const rolls = game.presentation.rolls;
  const index = rolls.findIndex(roll => roll.start === 27082);
  const black = rolls[index], next = rolls[index + 1];
  const pickup = 30300;
  const start = 30325;
  const end = 30406;
  assert.equal(black.end, 29077);
  assert.equal(black.pickup, null);
  assert.deepEqual(black.dice, [4, 3]);
  assert.equal(next.start, 30421);
  assert(end < next.start);
  const turn = game.turns[black.decision - 1];
  turn.end = pickup - 1;
  turn.pickupFrame = pickup;
  const decision = game.decisions[black.decision];
  decision.endFrame = turn.end;
  decision.endSeconds = turn.end / 25;
  for (const row of rows.slice(black.end, pickup)) {
    assert(!row.turn && !row.decision);
    bindRoll(row, turn, black.decision, black.decision);
  }
  black.end = black.pickup = pickup;
  const cube = game.presentation.cubeRolls.find(entry => entry.frame === black.start);
  if (cube) cube.end = black.end;

  const id = game.turns.length + 1;
  const white = { start, end: end - 1, pickupFrame: end, player: 'white', dice: [null, 2],
    before: null, after: null, resultFrame: null, steps: null, evidence: 'reviewed-roll-with-unreadable-face' };
  game.turns.push(white);
  rolls.splice(index + 1, 0, { start, end, pickup: end, player: white.player, dice: [2, null],
    evidence: white.evidence, decision: null, sourceTurns: [id] });
  for (const row of rows.slice(start, end)) {
    assert(!row.turn && !row.decision);
    bindRoll(row, white, id);
  }
  game.contextRecovery.push({
    kind: 'reviewed-pickup', frame: 29288, end: pickup,
    text: 'Black’s 4–3 remains on the table during the pause and clears at 20:12. White rolls immediately afterward. One White die is readable as 2.',
  });
}

function gameFive(game, rows, raw) {
  const rolls = game.presentation.rolls;
  const index = rolls.findIndex(roll => roll.start === 12525);
  const roll = rolls[index], next = rolls[index + 1];
  const start = 12367, result = 12826;
  assert.deepEqual(roll.dice, [4, 1]);
  assert(rolls[index - 1].pickup <= start && roll.end <= result && result < next.start);
  const before = observedBoard(raw[start]), after = observedBoard(raw[result]);
  assert(before && after && before.bar[0] === 1 && after.bar[0] === 0);
  assert(raw.slice(start, start + 10).every(reading => key(observedBoard(reading)) === key(before)));
  assert.equal(key(after), key(game.turns[(next.decision ?? next.sourceTurns[0]) - 1].before));
  assert(raw.slice(result, next.start + 16).filter(reading => key(observedBoard(reading)) === key(after)).length >= 12);
  const id = roll.decision;
  assert(!game.decisions[id].countedInGameLoss);
  const turn = game.turns[id - 1];
  const input = stateFor(before, 0, [1, 4]);
  const actions = legalTurns(input);
  const played = actions.find(action => action.key === key(after));
  assert(played);
  const evidence = 'reviewed-early-roll-and-legal-result';
  Object.assign(turn, {
    start, end: Math.max(result, roll.end - 1), pickupFrame: roll.pickup, evidence,
    before, after, resultFrame: result, steps: played.steps,
  });
  const beforeId = Math.max(...Object.keys(game.positions).map(Number)) + 1;
  game.positions[beforeId] = { ...before, onRoll: 'white', observedFrame: start, source: evidence, equities: null };
  game.positions[beforeId + 1] = { ...after, onRoll: 'dark', observedFrame: result, source: evidence, equities: null };
  for (const row of rows.slice(start, result + 1)) {
    assert(!row.decision || row.decision === id);
    bindRoll(row, turn, id, id);
    row.position = row.frame === result ? beforeId + 1 : beforeId;
    if (row.frame === result) row.phase = 'played';
  }
  Object.assign(roll, { start, evidence });
  game.decisions[id] = {
    player: 'white', dice: turn.dice, evidence, xgid: toXGID(input),
    startFrame: start, endFrame: turn.end,
    startSeconds: start / 25, endSeconds: turn.end / 25, observedResultFrame: result,
    legalCandidates: actions.length,
    actions: actions.map(action => ({
      key: action.key, notation: notation(action.steps, 0), steps: action.steps,
      xgid: toXGID({ ...action.state, phase: 'roll', dice: [] }, { engine: true }),
      isPlayed: action.key === played.key,
    })),
  };
  const cube = game.presentation.cubeRolls.find(entry => entry.frame === 12525);
  assert(!cube, 'The reviewed spot must not reuse the cube choice of a different position.');
  game.contextRecovery.push({
    kind: 'reviewed-early-roll', frame: start, end: roll.end,
    text: 'White’s 4–1 lands here. The earlier replay started the roll after the checker entered. The pre-roll board and the following board establish bar/21 8/7.',
  });
}

fs.mkdirSync(replayDir, { recursive: true });
for (const number of [1, 2, 3, 4, 5]) {
  const prefix = `game-0${number}`;
  const game = read(source, prefix + '-game.json');
  const rows = rowsFrom(path.join(source, prefix + '-state.jsonl.gz'));
  if (number === 3) gameThree(game, rows);
  if (number === 5) {
    const recording = read(base, 'game-5-analysis.json');
    const raw = recording.segments.flatMap(segment =>
      rowsFrom(path.join(base, 'state', segment.source.replace(/\.mp4$/, '.jsonl.gz')))
        .slice(segment.firstFrame, segment.lastExclusive).map(row => row.state));
    gameFive(game, rows, raw);
  }
  applyAccounting(game, rows);
  writeReplay(prefix, game, rows);
}
