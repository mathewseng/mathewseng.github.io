/** Check the public frame index and Library archive against the scored replay. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseBackup } from '../../../core/storage.mjs';
import { decisionHistory } from '../../../core/decision-history.mjs';
import { decisionFeedback } from '../../../core/decision-feedback.mjs';
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
  assert.deepEqual(data.ending, replay.ending ?? null);
  assert.equal(data.changes[0].frame, 0);
  assert(data.changes.every((change, idx) => idx === 0 || change.frame > data.changes[idx - 1].frame));
  let changeIndex = 0, rollIndex = 0;
  for (const row of rows) {
    const frame = row.frame;
    while (data.changes[changeIndex + 1]?.frame <= frame) changeIndex++;
    while (data.rolls[rollIndex]?.end <= frame) rollIndex++;
    const state = data.changes[changeIndex];
    assert.deepEqual(state.loss, [row.loss.white.loss, row.loss.dark.loss]);
    assert.deepEqual(state.checkerLoss, [row.loss.white.checkerLoss, row.loss.dark.checkerLoss]);
    assert.deepEqual(state.cubeLoss, [row.loss.white.cubeLoss, row.loss.dark.cubeLoss]);
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
  for (const entry of history.replay.timeline.filter(entry => entry.kind === 'cube-review')) {
    const item = history.items.find(item => item.id === entry.item);
    sum[item.state.turn] += decisionFeedback(item.analysis, item.state).loss;
  }
  assert.deepEqual(history.replay.losses, data.changes.at(-1).loss);
  assert.equal(history.replay.timeline.filter(entry => entry.kind === 'cube-review' ||
    (entry.kind === 'cube' && history.items.find(item => item.id === entry.item)?.events[entry.event]?.action.type === 'roll')
  ).length, data.cubeRolls.length);
  for (const roll of data.rolls) {
    for (const board of [roll.before, roll.after].filter(Boolean)) {
      assert.equal(board.points.length, 24);
      for (let player = 0; player < 2; player++) {
        const pointTotal = board.points.reduce((sum, point) => sum + Math.max(0, player ? -point : point), 0);
        assert.equal(pointTotal + board.bar[player] + board.borneOff[player], 15);
      }
    }
    if (roll.decision && roll.before) assert.deepEqual(fromXGID(data.decisions[roll.decision].xgid).points, roll.before.points);
  }
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
  const reviewedEpisodes = replay.contextRecovery?.some(entry => entry.kind.startsWith('reviewed-'));
  if (reviewedEpisodes && number === 3) {
    const continuous = data.rolls.find(roll => roll.start === 16888);
    assert.deepEqual(continuous.dice, [1, 1]);
    assert.equal(continuous.end, 17258);
    assert(!data.rolls.some(roll => roll.start === 17001));
    const bearoff = data.rolls.find(roll => roll.start <= 27100 && roll.end > 27100);
    assert.deepEqual(bearoff.dice, [4, 3]);
    assert.deepEqual(bearoff.before.borneOff, [2, 0]);
    assert(bearoff.decision && data.decisions[bearoff.decision].moves.length > 0);
    if (replay.contextRecovery.some(entry => entry.kind === 'reviewed-pickup')) {
      assert.equal(bearoff.end, 30300);
      assert.equal(bearoff.pickup, 30300);
      const successor = data.rolls[data.rolls.indexOf(bearoff) + 1];
      assert.deepEqual([successor.start, successor.player, successor.dice], [30325, 'white', [2, null]]);
    }
    const white = data.rolls.find(roll => roll.start <= 31300 && roll.end > 31300);
    assert.equal(white.before.points[6], -1);
    assert.deepEqual(white.after.borneOff, [5, 0]);
  }
  if (reviewedEpisodes && number === 4) {
    const corrected = data.rolls.find(roll => roll.start <= 2450 && roll.end > 2450);
    assert.deepEqual(corrected.dice, [6, 4]);
    assert.equal(data.decisions[corrected.decision].evLoss, null);
    const fans = data.rolls.filter(roll => roll.fan && [24995, 25192].includes(roll.start));
    assert.deepEqual(fans.map(roll => [roll.player, roll.dice]), [['dark', [4, 1]], ['dark', [2, null]]]);
    assert(fans.every(roll => roll.before.bar[1] === 2 && roll.decision === null));
    assert.deepEqual(fans[0].before, fans[0].after);
  }
  if (replay.contextRecovery?.some(entry => entry.kind === 'reviewed-turn-order')) {
    const verdict = (start, player, dice) => {
      const roll = data.rolls.find(entry => entry.start === Math.round(start * 25));
      assert.deepEqual([roll.player, roll.dice], [player, dice]);
      return roll;
    };
    if (number === 1) {
      assert.equal(verdict(184.36, 'dark', [4, 3]).pickup, Math.round(239.96 * 25));
      assert(verdict(437.56, 'white', [null, null]).fan);
      assert(verdict(488.84, 'dark', [2, 1]).fan);
    }
    if (number === 3) {
      assert.equal(verdict(941.12, 'dark', [4, 3]).end, Math.round(954.12 * 25));
      assert(!data.rolls.some(roll => roll.start === Math.round(951.24 * 25)));
      verdict(930.32, 'white', [6, 2]);
    }
    if (number === 4) {
      verdict(531.76, 'dark', [6, 1]);
      verdict(1061.32, 'dark', [6, 2]);
      verdict(1162.8, 'dark', [3, 2]);
      const fans = [verdict(823.32, 'dark', [6, 2]), verdict(895.16, 'dark', [6, 2])];
      assert(fans.every(roll => roll.fan && JSON.stringify(roll.before) === JSON.stringify(roll.after)));
    }
  }
  if (number === 5) {
    assert.equal(data.cubeOffer.replyInferred, true);
    if (replay.contextRecovery?.some(entry => entry.kind === 'reviewed-early-roll')) {
      const entered = data.rolls.find(roll => roll.start === 12367);
      assert.deepEqual(entered.dice, [4, 1]);
      assert.deepEqual(entered.before.bar, [1, 0]);
      assert.deepEqual(entered.after.bar, [0, 0]);
      assert.equal(data.decisions[entered.decision].played.notation, 'bar/21 8/7');
      assert.equal(entered.resultFrame, 12826);
    }
    const pass = history.replay.timeline.find(entry => entry.frame === data.ending.frame && entry.kind === 'cube');
    assert.equal(pass.note, 'Pass inferred from pack-up');
    const segment = history.items.find(item => item.id === pass.item);
    assert.equal(segment.events.at(-1).action.type, 'pass');
    assert.equal(segment.status, 'game-complete');
  }
  summary.push({ game: number, frames: data.frames, turns: data.rolls.length, recovered: replay.recoveredTurns.length,
    verified: native.filter(turn => turn.action.type === 'move').length });
}
console.log(JSON.stringify(summary, null, 2));
