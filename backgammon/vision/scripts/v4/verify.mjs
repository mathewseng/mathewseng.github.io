/** Verify the full game timeline, source provenance and every scored action. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { artifactDir, solverUrl } from '../project_paths.mjs';
import { rowsFrom } from '../v2/solve_games.mjs';

const { fromXGID } = await import(solverUrl('backgammon/core/xgid.mjs'));
const { boardKey, legalTurns } = await import(solverUrl('backgammon/core/rules.mjs'));
const dir = path.join(artifactDir, 'v4');
const base = path.join(artifactDir, 'v2');
const summary = [];
const read = (dir, name) => JSON.parse(fs.readFileSync(path.join(dir, name)));
for (const game of [1, 2, 3, 4, 5]) {
  const prefix = 'game-' + String(game).padStart(2, '0');
  const data = read(dir, prefix + '-game.json');
  const source = read(base, 'game-' + game + '-analysis.json');
  const rows = rowsFrom(path.join(dir, prefix + '-state.jsonl.gz'));
  assert.equal(rows.length, source.frames);
  assert.equal(data.frames, rows.length);

  let lossIndex = 0;
  let totalLegal = 0;
  const loss = { white: { loss: 0, count: 0 }, dark: { loss: 0, count: 0 } };
  const counts = { checkerBoard: 0, role: 0, currentRoll: 0, completeRoll: 0,
    cube: 0, missingRollRead: 0, anchoredRollRead: 0, carriedCheckerFrames: 0 };
  for (const part of source.segments) {
    const raw = rowsFrom(path.join(base, 'state', part.source.replace(/\.mp4$/, '.jsonl.gz')));
    for (let i = part.firstFrame; i < part.lastExclusive; i++) {
      const frame = part.firstGameFrame + i - part.firstFrame;
      const row = rows[frame];
      assert.equal(row.frame, frame);
      assert.equal(row.clip, part.clip);
      assert.equal(row.sourceFrame, i);
      assert.equal(row.sourcePts, raw[i].pts);
      assert.deepEqual(row.sourceTimeBase, raw[i].timeBase);
      const turn = row.turn === null ? null : data.turns[row.turn - 1];
      if (turn) {
        assert(turn.start <= frame && frame <= turn.end);
        if (!raw[i].state?.currentRoll && ['move', 'played'].includes(row.phase)) {
          counts.missingRollRead++;
          if (row.roll?.status === 'current' && row.roll.player === turn.player) counts.anchoredRollRead++;
        }
      }
      const decision = data.decisions[row.decision];
      if (decision && row.decision !== 'cube') {
        assert(turn);
        assert.equal(row.player, decision.player);
        assert.equal(row.roll.player, decision.player);
        assert.equal(row.roll.status, 'current');
        assert.deepEqual(row.roll.dice, decision.dice);
      }
      if (row.roll?.status === 'current') {
        assert(turn);
        assert.equal(row.roll.player, turn.player);
        assert.deepEqual(row.roll.dice, turn.dice);
        counts.currentRoll++;
        if (row.roll.dice?.every((d) => Number.isInteger(d) && d >= 1 && d <= 6)) counts.completeRoll++;
      }
      if (row.cube?.offered) {
        assert.equal(row.cube.offered, row.cube.stake * 2);
        assert.equal(row.phase, 'cube-response');
      }
      if (row.position !== null) {
        const board = data.positions[row.position];
        assert(board);
        for (const player of [0, 1]) {
          assert.equal(board.bar[player] + board.borneOff[player] +
            board.points.reduce((sum, point) => sum + point[player], 0), 15);
        }
        counts.checkerBoard++;
        counts.carriedCheckerFrames += Number(!raw[i].state?.position);
      }
      while (lossIndex < data.losses.length && data.losses[lossIndex].frame <= frame) {
        const event = data.losses[lossIndex++];
        loss[event.player].loss += event.loss;
        loss[event.player].count++;
      }
      assert.deepEqual(row.loss, loss);
      counts.role += Number(row.player !== null);
      counts.cube += Number(row.cube !== null);
    }
  }
  assert.equal(counts.anchoredRollRead, counts.missingRollRead);
  for (const [key, decision] of Object.entries(data.decisions)) {
    if (key === 'cube') continue;
    const state = fromXGID(decision.xgid);
    const legal = legalTurns(state);
    assert.equal(state.turn, decision.player === 'white' ? 0 : 1);
    assert.deepEqual(legal.map((r) => r.key).sort(), decision.actions.map((r) => r.key).sort());
    assert(decision.actions.slice(0, 4).every((r) => Number.isFinite(r.equity4)));
    const best = decision.actions.find((r) => r.isBest);
    assert.equal(best.equity4, Math.max(...decision.actions.map((r) => r.equity4 ?? -Infinity)));
    if (decision.played) assert(decision.actions.some((r) => r.isPlayed && Number.isFinite(r.equity4)));
    const turn = data.turns[Number(key) - 1];
    if (turn.before) {
      const beforeKey = boardKey({
        points: turn.before.points.map(([a, b]) => a - b),
        bar: turn.before.bar, off: turn.before.borneOff,
      });
      assert.equal(beforeKey, boardKey(state));
    }
    totalLegal += legal.length;
  }
  if (game === 1) {
    // The first visible white roll stays stable across drift in both die readings.
    for (const row of rows.slice(0, 465)) {
      assert.equal(row.roll.player, 'white');
      assert.deepEqual(row.roll.dice, [4, 5]);
    }
  }
  if (game === 4) {
    const row = rows[12341];
    assert.equal(row.roll.player, 'dark');
    assert.deepEqual(row.roll.dice, [4, 4]);
    assert.match(row.roll.evidence, /reviewed/);
  }
  if (game === 5) {
    for (const row of rows.slice(18628, 19983)) {
      assert.equal(row.phase, 'cube-response');
      assert.equal(row.player, 'dark');
      assert.equal(row.cube.stake, 2);
      assert.equal(row.cube.offered, 4);
      assert.equal(row.roll, null);
    }
  }
  const result = { game, frames: rows.length, turnEpisodes: data.turns.length,
    decisions: Object.keys(data.decisions).length, legalActions: totalLegal, graded: loss, ...counts };
  summary.push(result);
  console.log(JSON.stringify(result));
}
fs.writeFileSync(path.join(dir, 'state-validation.json'), JSON.stringify(summary, null, 2) + '\n');
