/** Check the public frame index and Library archive against the scored replay. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseBackup } from '../../../core/storage.mjs';
import { decisionHistory } from '../../../core/decision-history.mjs';
import { fromXGID } from '../../../core/xgid.mjs';
import { replayDir } from '../project_paths.mjs';
import { rowsFrom } from '../v2/solve_games.mjs';
import { cubeContext } from './cube-context.mjs';

const read = (dir, name) => JSON.parse(fs.readFileSync(path.join(dir, name)));
const root = process.argv[2];
if (!root) throw new Error('Supply the Backgammon Vision directory.');
const summary = [];
for (const number of [1, 2, 3, 4, 5]) {
  const game = `game-0${number}`;
  const replay = read(replayDir, game + '-game.json');
  const rows = rowsFrom(path.join(replayDir, game + '-state.jsonl.gz'));
  const data = read(path.join(root, 'state'), game + '.json');
  const history = parseBackup(fs.readFileSync(path.join(root, 'history', game + '.json'), 'utf8'));
  assert.equal(data.frames, rows.length);
  assert.equal(data.changes[0].frame, 0);
  assert(data.changes.every((change, idx) => idx === 0 || change.frame > data.changes[idx - 1].frame));
  let changeIndex = 0, rollIndex = 0;
  for (const row of rows) {
    const frame = row.frame;
    while (data.changes[changeIndex + 1]?.frame <= frame) changeIndex++;
    while (data.rolls[rollIndex]?.end <= frame) rollIndex++;
    const state = data.changes[changeIndex];
    assert.deepEqual(state.loss, [row.loss.white.loss, row.loss.dark.loss]);
    assert.equal(state.roll, data.rolls[rollIndex]?.start <= frame ? rollIndex : null);
    if (state.roll !== null) {
      assert.equal(state.phase, 'checker-turn');
      assert.equal(state.player, data.rolls[state.roll].player);
    } else assert.notEqual(state.phase, 'checker-turn');
    if (state.position !== null) {
      const expected = replay.positions[row.position];
      assert.deepEqual(data.positions[state.position].points, expected.points.map(([white, dark]) => white - dark));
      assert.deepEqual(state.movingPoints, row.displayPoints ?? null);
      const xgid = expected.equities?.inputXgid;
      if (xgid) {
        const evaluated = fromXGID(xgid);
        const cube = cubeContext(replay, row);
        assert.equal(evaluated.rules.cube, Boolean(cube));
        if (cube) assert.deepEqual(evaluated.cube, cube);
      }
    } else if (state.phase === 'game-closed') {
      assert.equal(state.cube, null);
      assert.equal(state.player, null);
    }
  }
  for (const [id, decision] of Object.entries(replay.decisions)) {
    if (id === 'cube') continue;
    const context = cubeContext(replay, rows[replay.turns[id - 1].start]);
    const evaluated = fromXGID(decision.xgid);
    assert.equal(evaluated.rules.cube, Boolean(context));
    if (context) assert.deepEqual(evaluated.cube, context);
    assert.equal(data.decisions[id].moves.length, Math.min(5, decision.actions.length));
  }
  const native = history.items.filter(item => item.kind === 'match').flatMap(decisionHistory);
  const sum = [0, 0];
  for (const turn of native) {
    if (turn.feedback) sum[turn.player] += turn.feedback.loss;
  }
  assert.deepEqual(history.replay.losses, data.changes.at(-1).loss);
  for (const [player, loss] of sum.entries()) {
    assert(Math.abs(loss - history.replay.losses[player]) < 1e-8, `${game} Library EV loss differs`);
  }
  assert.equal(history.replay.timeline.filter(entry => entry.kind === 'checker' || entry.player).length, data.rolls.length);
  if (number === 2) {
    assert.equal(history.items.length, 1);
    assert.equal(history.items[0].initial.phase, 'opening');
    assert.equal(history.items[0].events.at(-1).action.type, 'pass');
    assert.equal(history.items[0].status, 'game-complete');
    assert.equal(history.replay.timeline.filter(entry => entry.kind === 'gap').length, 0);
  }
  summary.push({ game: number, frames: data.frames, turns: data.rolls.length, recovered: replay.recoveredTurns.length,
    verified: native.filter(turn => turn.action.type === 'move').length });
}
console.log(JSON.stringify(summary, null, 2));
