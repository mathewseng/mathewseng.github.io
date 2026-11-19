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
    if (state.phase === 'checker-result-pending') {
      const prior = data.rolls[rollIndex - 1];
      assert(prior.pickup <= frame && frame < prior.resultFrame);
      assert.equal(state.player, prior.player);
      assert.equal(state.pendingDecision ?? null, prior.decision);
      assert(!state.cube?.offered);
    } else assert.equal(state.pendingDecision, undefined);
    if (state.position !== null) {
      const expected = replay.positions[row.position];
      assert.deepEqual(data.positions[state.position].points, expected.points.map(([white, dark]) => white - dark));
      assert.deepEqual(state.movingPoints, row.displayPoints ?? null);
      if (state.movingBoard) {
        const { points, bar, borneOff } = state.movingBoard;
        assert.deepEqual(points, state.movingPoints);
        for (const side of [0, 1]) {
          const onPoints = points.reduce((total, count) => total + Math.max(0, side ? -count : count), 0);
          assert.equal(onPoints + bar[side] + borneOff[side], 15);
        }
      }
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
  if (data.changes.some(change => change.movingBoard)) {
    const motionControls = {
      1: [[5270, 22, -2], [7679, 17, -3]],
      4: [[21355, 20, 1], [24918, 6, 1]],
      5: [[10686, 11, 1], [17600, 19, -5]],
    };
    const compared = fs.existsSync(path.join(replayDir, 'checker-motion-validation.json'));
    for (const [frame, point, expected] of compared ? motionControls[number] ?? [] : []) {
      const state = data.changes.findLast(change => change.frame <= frame);
      const roll = data.rolls[state.roll];
      const first = data.changes.findLast(change => change.frame <= roll.start);
      assert.equal(state.movingBoard?.points[point - 1], expected, `Game ${number} at frame ${frame}`);
      assert.equal(state.roll, first.roll);
      assert.deepEqual(fromXGID(data.decisions[roll.decision].xgid).points, roll.before.points);
      assert.deepEqual(state.checkerLoss, first.checkerLoss);
    }
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
      const dice = successor.evidence === 'settled-dice-and-legal-result' ? [6, 2] : [2, null];
      assert.deepEqual([successor.start, successor.player, successor.dice], [30325, 'white', dice]);
    }
    const white = data.rolls.find(roll => roll.start <= 31300 && roll.end > 31300);
    assert.equal(white.before.points[6], -1);
    assert.deepEqual(white.after.borneOff, [5, 0]);
  }
  if (reviewedEpisodes && number === 4) {
    const corrected = data.rolls.find(roll => roll.start <= 2450 && roll.end > 2450);
    assert.deepEqual(corrected.dice, [6, 4]);
    const witnessedPlay = replay.contextRecovery.some(entry => entry.frame === corrected.start && entry.boardWitnesses?.length === 2);
    assert.equal(data.decisions[corrected.decision].evLoss, witnessedPlay ? 0 : null);
    const fans = data.rolls.filter(roll => roll.fan && [24995, 25192].includes(roll.start));
    const witnessed = replay.contextRecovery.find(entry => entry.frame === 25192 &&
      entry.text.includes('retain their checker counts'));
    assert.deepEqual(fans.map(roll => [roll.player, roll.dice]),
      [['dark', [4, 1]], ['dark', witnessed ? [3, 2] : [2, null]]]);
    assert(fans.every(roll => roll.before.bar[1] === 2));
    assert.equal(fans[0].decision, null);
    assert.deepEqual(fans[0].before, fans[0].after);
    if (witnessed) {
      assert.deepEqual(fans[1].before, fans[1].after);
      assert.equal(data.decisions[fans[1].decision].evLoss, 0);
    }
  }
  if (replay.contextRecovery?.some(entry => entry.kind === 'reviewed-turn-order')) {
    const verdict = (start, player, dice) => {
      const roll = data.rolls.find(entry => entry.start === Math.round(start * 25));
      assert.deepEqual([roll.player, roll.dice], [player, dice]);
      return roll;
    };
    if (number === 1) {
      const recovered = data.rolls.some(roll => roll.start === 4618);
      assert.equal(verdict(recovered ? 184.72 : 184.36, 'dark', recovered ? [5, 3] : [4, 3]).pickup,
        Math.round(239.96 * 25));
      assert(verdict(437.56, 'white', [null, null]).fan);
      assert(verdict(488.84, 'dark', [2, 1]).fan);
      if (replay.contextRecovery.some(entry => entry.confirmedDetectorMisread)) {
        const confirmed = verdict(397.16, 'dark', [6, 5]);
        assert.equal(data.decisions[confirmed.decision].played.notation, '6/1 9/3');
      }
    }
    if (number === 3) {
      const confirmedPickup = replay.contextRecovery.find(entry => entry.frame === 23528 && entry.clear === 23913);
      const retimed = replay.contextRecovery.find(entry => entry.previousFrame === 23528 && entry.frame === 23377);
      assert.equal(verdict(retimed ? 935.08 : 941.12, 'dark', [4, 3]).end,
        retimed || confirmedPickup ? 23913 : 23853);
      assert(!data.rolls.some(roll => roll.start === Math.round(951.24 * 25)));
      const white = verdict(930.32, 'white', [6, 2]);
      if (retimed) {
        assert.equal(data.decisions[white.decision].played.notation, '7/5 7/1');
        assert.deepEqual(white.after, data.rolls.find(roll => roll.start === retimed.frame).before);
      }
    }
    if (number === 4) {
      verdict(531.76, 'dark', [6, 1]);
      const witnessed = replay.contextRecovery.some(entry => entry.frame === 26533 && entry.boardWitnesses?.length === 2);
      verdict(1061.32, 'dark', witnessed ? [4, 2] : [6, 2]);
      const continuous = replay.contextRecovery.find(entry => entry.kind === 'confirmed-consecutive');
      if (continuous) {
        const roll = verdict(1086.48, 'dark', [3, 2]);
        const colorVerified = replay.contextRecovery.some(entry => entry.frame === roll.start && entry.clear === 32242);
        assert.equal(roll.pickup, colorVerified ? 32242 : 32249);
        assert.equal(data.decisions[roll.decision].played.notation, '13/11 11/8');
        assert.equal(data.decisions[roll.decision].evLoss, 0);
        for (const other of [1162.8, 1212.56, 1227.88, 1284.24]) {
          assert(!data.rolls.some(roll => roll.start === Math.round(other * 25)));
        }
        assert.equal(continuous.frame, Math.round(995.36 * 25));
      } else verdict(1162.8, 'dark', [3, 2]);
      const fans = [verdict(823.32, 'dark', [6, 2]), verdict(895.16, 'dark', [6, 2])];
      assert(fans.every(roll => roll.fan && JSON.stringify(roll.before) === JSON.stringify(roll.after)));
    }
  }
  if (number === 3 && replay.contextRecovery.some(entry => entry.frame === 22851 && entry.confirmedDetectorMisread)) {
    const pooled = replay.contextRecovery.find(entry => entry.frame === 11776 && entry.diceFrames?.length);
    const latePooled = replay.contextRecovery.find(entry => entry.frame === 30325 && entry.diceFrames?.length);
    for (const [time, dice] of [[471.04, pooled ? [6, 2] : [2, null]], [914.04, [5, 5]], [981.44, [5, 5]],
      [1213, latePooled ? [6, 2] : [2, null]]]) {
      const roll = data.rolls.find(item => item.start === Math.round(time * 25));
      assert.deepEqual(roll.dice, dice);
      assert(roll.after && Number.isInteger(roll.resultFrame));
      if (dice.includes(null)) {
        assert.equal(roll.decision, null);
        const entry = history.replay.timeline.find(item => item.frame === roll.resultFrame && item.kind === 'board-result');
        assert(entry);
        const saved = history.items.find(item => item.id === entry.item).state;
        assert.deepEqual(saved.points, roll.after.points);
        assert.deepEqual(saved.off, roll.after.borneOff);
      } else assert(data.decisions[roll.decision].played);
      if (time === 471.04 && pooled) {
        assert.equal(roll.evidence, 'settled-dice-and-legal-result');
        assert.deepEqual(roll.before.bar, [1, 0]);
        assert.deepEqual(roll.after.bar, [0, 0]);
        assert(pooled.diceFrames.length >= 4 && pooled.diceFrames.every(frame => frame >= roll.start && frame < roll.end));
      }
    }
    const handoff = data.rolls.find(item => item.start === 30421 || item.start === 30428);
    if (handoff.start === 30428) {
      assert.deepEqual([handoff.dice, handoff.pickup], [[5, 3], 30795]);
      const corrected = replay.contextRecovery.some(entry => entry.frame === handoff.start &&
        entry.boardWitnesses?.[1]?.frame === 30810);
      if (corrected) {
        assert(!handoff.sourceMismatch);
        assert.equal(data.decisions[handoff.decision].played.notation, '21/18 14/9');
      } else {
        assert.equal(handoff.sourceMismatch, true);
        assert.equal(data.decisions[handoff.decision].played, null);
        assert.equal(data.decisions[handoff.decision].evLoss, null);
        assert(handoff.after && Number.isInteger(handoff.resultFrame));
        const closed = history.replay.timeline.find(item => item.frame === handoff.resultFrame && item.kind === 'board-result');
        assert(closed);
      }
    } else if (handoff.evidence === 'reviewed-physical-roll') {
      const previous = data.rolls.find(item => item.start === 30325);
      assert.deepEqual(handoff.before, previous.after);
      assert.deepEqual(handoff.dice, [4, 3]);
      assert.equal(data.decisions[handoff.decision].played, null);
      assert.equal(handoff.sourceMismatch, true);
    }
  }
  if (number === 1 && replay.contextRecovery.some(entry => entry.frame === 3684 && entry.kind === 'reviewed-turn-order')) {
    const bearoff = replay.contextRecovery.some(entry => entry.frame === 11166 && entry.text.includes('bears one off'));
    const laterHandoff = replay.contextRecovery.some(entry => entry.frame === 12221 && entry.text.includes('unchanged board'));
    for (const [time, player, dice, hasPlayed] of [[147.36, 'white', [6, 1], true], [413.88, 'dark', [5, 1], true],
      [422.6, 'dark', [3, 1], true], [446.64, 'dark', [3, 1], bearoff], [571.48, 'dark', [4, 3], laterHandoff]]) {
      const roll = data.rolls.find(item => item.start === Math.round(time * 25));
      assert.deepEqual([roll.player, roll.dice], [player, dice]);
      assert.equal(Boolean(data.decisions[roll.decision]?.played), hasPlayed);
    }
    if (bearoff) {
      const roll = data.rolls.find(item => item.start === 11166);
      assert.deepEqual(roll.before.borneOff, [0, 3]);
      assert.deepEqual(roll.after.borneOff, [0, 4]);
      assert.deepEqual(roll.after.bar, [1, 0]);
      const fan = data.rolls.find(item => item.start === 11330);
      if (fan.evidence === 'reviewed-roll-with-confirmed-board') {
        assert(fan.fan);
        assert.deepEqual(fan.dice, [5, null]);
        assert.deepEqual(fan.before, roll.after);
        assert.deepEqual(fan.after, roll.after);
        const following = data.rolls.find(item => item.start === 11388);
        assert.deepEqual(following.before, fan.after);
      }
    }
    if (laterHandoff) {
      const conflict = data.rolls.find(item => item.start === 13165);
      assert.deepEqual(conflict.after, data.rolls.find(item => item.start === 14287).before);
      const corrected = replay.contextRecovery.some(entry => entry.frame === conflict.start && entry.superseded);
      if (corrected) {
        assert.deepEqual(conflict.dice, [6, 3]);
        assert.deepEqual([conflict.before.points[1], conflict.after.points[1]], [2, 4]);
        assert.deepEqual([conflict.before.points[4], conflict.after.points[4]], [3, 2]);
        assert(data.decisions[conflict.decision].played);
        assert.equal(data.ending.frame, 14739);
        assert.deepEqual(data.rolls.at(-1).after.borneOff, [2, 11]);
      } else {
        assert.deepEqual([conflict.dice, conflict.decision, conflict.sourceMismatch], [[6, null], null, true]);
        const gap = history.replay.timeline.find(item => item.frame === conflict.start && item.kind === 'gap');
        const result = history.replay.timeline.find(item => item.frame === conflict.resultFrame && item.kind === 'board-result');
        assert.equal(gap?.label, 'Dice and checker result disagree');
        const saved = history.items.find(item => item.id === result?.item)?.state;
        assert.deepEqual(saved?.points, conflict.after.points);
      }
    }
  }
  if (number === 3 && replay.contextRecovery.some(entry => entry.previousFrame === 1858 && entry.clear === 2234)) {
    const roll = data.rolls.find(item => item.start === 1073);
    assert(!data.rolls.some(item => item.start === 1858));
    assert.deepEqual([roll.pickup, roll.player, roll.dice], [2234, 'white', [4, 3]]);
    assert.deepEqual(roll.before.bar, [0, 0]);
    assert.deepEqual(roll.after.bar, [0, 2]);
    assert.equal(data.decisions[roll.decision].played.notation, '8/5 5/1');
    assert(data.decisions[roll.decision].evLoss > 0);
  }
  if (number === 3 && replay.contextRecovery.some(entry => entry.previousFrame === 2632 && entry.clear === 3302)) {
    const first = data.rolls.find(item => item.start === 2385);
    const dark = data.rolls.find(item => item.start === 3337);
    const last = data.rolls.find(item => item.start === 3882);
    assert.deepEqual([first.dice, first.pickup], [[6, 5], 3302]);
    assert.equal(data.decisions[first.decision].played.notation, '6/1 24/18');
    assert.deepEqual(first.after, dark.before);
    const corrected = replay.contextRecovery.some(entry => entry.frame === 3337 && entry.text.includes('from fixed point 12'));
    assert.deepEqual([dark.dice, dark.pickup], [corrected ? [5, 2] : [4, 2], 3833]);
    if (corrected) {
      assert.equal(data.decisions[dark.decision].played.notation, 'bar/23 13/8');
      assert(Math.abs(data.decisions[dark.decision].evLoss - 0.04777109) < 0.000001);
      assert.deepEqual(dark.after, last.before);
    } else {
      assert.equal(dark.sourceMismatch, true);
      assert.equal(data.decisions[dark.decision].evLoss, null);
    }
    assert.deepEqual([last.dice, last.pickup, last.resultFrame], [[2, 1], 4028, 4093]);
    assert.equal(data.decisions[last.decision].played.notation, '18/16 16/15');
    const afterPickup = data.changes.findLast(change => change.frame <= 4030);
    assert.equal(afterPickup.roll, null);
    assert.deepEqual(last.after.bar, [0, 1]);
  }
  if (number === 4 && replay.contextRecovery.some(entry => entry.frame === 12565 && entry.boardWitnesses?.length === 2)) {
    const frames = [12259, 12565, 12830, 13142];
    const turns = frames.map(frame => data.rolls.find(roll => roll.start === frame));
    assert.deepEqual(turns.map(roll => [roll.player, roll.dice]),
      [['dark', [5, 4]], ['white', [6, 2]], ['dark', [5, 5]], ['white', [6, 4]]]);
    assert.deepEqual(turns.slice(0, 3).map(roll => roll.pickup), [12529, 12795, 13055]);
    for (let i = 0; i < 3; i++) {
      assert.deepEqual(turns[i].after, turns[i + 1].before);
      assert(data.decisions[turns[i].decision].played);
      assert(turns[i].end <= turns[i + 1].start);
    }
    assert.equal(data.decisions[turns[1].decision].played.notation, '8/6 13/7');
    assert.equal(data.decisions[turns[2].decision].played.notation, '8/3 8/3 7/2 7/2');
  }
  if (number === 3 && replay.contextRecovery.some(entry => entry.frame === 7168 && entry.previousFrame === 7519)) {
    const roll = data.rolls.find(item => item.start === 7168);
    assert.deepEqual([roll.player, roll.dice, roll.pickup], ['dark', [5, 3], 7649]);
    assert(!data.rolls.some(item => item.start > 7168 && item.start < 7649));
    assert(data.decisions[roll.decision].played);
    const disagreement = data.rolls.find(item => item.start === 27082);
    assert.equal(disagreement.sourceMismatch, true);
    assert.deepEqual(disagreement.dice, [4, 3]);
    assert.equal(disagreement.resultFrame, 30322);
    assert.equal(data.decisions[disagreement.decision].evLoss, null);
  }
  if (number === 3 && replay.contextRecovery.some(entry => entry.frame === 6400 && entry.confirmedDetectorMisread)) {
    const white = data.rolls.find(roll => roll.start === 6400);
    const black = data.rolls.find(roll => roll.start === 7168);
    assert.deepEqual([white.player, white.dice, white.pickup, white.resultFrame], ['white', [3, 2], 7129, 7060]);
    assert.deepEqual(white.after, black.before);
    assert.equal(data.decisions[white.decision].played.notation, '24/22 10/7');
  }
  if (number === 4 && replay.contextRecovery.some(entry => entry.frame === 25487)) {
    const [fan, bearOff, entry] = [25487, 25534, 25649].map(frame => data.rolls.find(roll => roll.start === frame));
    assert.deepEqual([fan.player, fan.dice, fan.pickup], ['dark', [5, 5], bearOff.start]);
    assert(fan.fan);
    assert.deepEqual(fan.before, fan.after);
    assert.deepEqual([bearOff.player, bearOff.dice, bearOff.pickup], ['white', [5, 2], 25611]);
    assert.deepEqual(fan.after, bearOff.before);
    assert.deepEqual(bearOff.after, entry.before);
    assert.deepEqual(bearOff.after.borneOff, [5, 0]);
    assert.equal(data.decisions[bearOff.decision].played.notation, '5/off 5/3');
    const reset = data.rolls.at(-1);
    assert.deepEqual(reset.dice, [6, 3]);
    assert.equal(reset.after, null);
  }
  const sourceComparisons = {
    1: [[6855, [6, 5]], [11388, [5, 1]]],
    3: [[16005, [4, 2]], [16888, [1, 1]], [22391, [2, 2]]],
    4: [[2285, [6, 4]], [13294, [6, 1]], [25649, [6, 5]], [26533, [4, 2]]],
    5: [[12180, [3, 1]], [12848, [5, 3]]],
  };
  for (const [start, dice] of sourceComparisons[number] ?? []) {
    const note = replay.contextRecovery.findLast(entry => entry.frame === start && !entry.superseded &&
      entry.boardWitnesses?.length === 2);
    if (!note) continue;
    const index = data.rolls.findIndex(item => item.start === start);
    const roll = data.rolls[index];
    assert.deepEqual([roll.player, roll.dice], ['dark', dice]);
    assert(data.decisions[roll.decision].played);
    assert.equal(roll.resultFrame, note.boardWitnesses[1].frame);
    assert.deepEqual(roll.after, data.rolls[index + 1].before);
  }
  if (number === 4 && replay.contextRecovery.some(entry => entry.frame === 19541 && entry.confirmedDetectorMisread)) {
    const fan = data.rolls.find(roll => roll.start === 19541);
    assert.deepEqual([fan.player, fan.dice, fan.pickup], ['dark', [5, 3], 19579]);
    assert(fan.fan);
    assert.deepEqual(fan.after, fan.before);
    assert.equal(data.decisions[fan.decision].evLoss, 0);
  }
  if (number === 4 && replay.contextRecovery.some(entry => entry.frame === 21938 && entry.confirmedDetectorMisread)) {
    const index = data.rolls.findIndex(roll => roll.start === 21938);
    const fan = data.rolls[index];
    assert.deepEqual([fan.player, fan.dice, fan.pickup], ['dark', [5, 5], 21979]);
    assert(fan.fan);
    assert.deepEqual(fan.before, fan.after);
    assert.deepEqual(fan.after, data.rolls[index + 1].before);
    assert.equal(data.decisions[fan.decision].evLoss, 0);
  }
  const checkedHandoff = number === 3 ? [30428, 30810, [5, 3], '21/18 14/9'] :
    number === 4 ? [6489, 7768, [5, 5], '15/10 15/10 13/8 8/3'] : null;
  if (checkedHandoff) {
    const [start, result, dice, played] = checkedHandoff;
    const note = replay.contextRecovery.find(entry => entry.frame === start && !entry.superseded &&
      entry.boardWitnesses?.[1]?.frame === result);
    if (note) {
      const index = data.rolls.findIndex(roll => roll.start === start);
      const roll = data.rolls[index];
      assert.equal(roll.resultFrame, result);
      assert.deepEqual(roll.dice, dice);
      assert.deepEqual(roll.after, data.rolls[index + 1].before);
      assert.equal(data.decisions[roll.decision].played.notation, played);
    }
  }
  if (number === 3 && replay.contextRecovery.some(entry => entry.frame === 30325 && entry.diceFrames?.length)) {
    const pending = data.changes.findLast(change => change.frame <= 4030);
    assert.deepEqual([pending.phase, pending.player, pending.roll], ['checker-result-pending', 'white', null]);
    const first = data.rolls.find(roll => roll.start === 208);
    const at = frame => data.changes.findLast(change => change.frame <= frame);
    assert.equal(at(625).roll, data.rolls.indexOf(first));
    assert.equal(at(first.pickup - 1).phase, 'checker-turn');
    const afterPickup = at(first.pickup);
    assert.deepEqual([afterPickup.phase, afterPickup.player, afterPickup.roll, afterPickup.pendingDecision],
      ['checker-result-pending', 'dark', null, first.decision]);
    assert.equal(data.decisions[first.decision].played.notation, '13/10 24/20');
    assert.equal(at(first.resultFrame).pendingDecision, undefined);
    assert(at(first.resultFrame).checkerLoss[1] > afterPickup.checkerLoss[1]);
    assert.equal(data.cubeRolls.find(item => item.frame === 4122).start, 4093);
    for (const [start, resultFrame, dice, off] of [[31514, 31601, [3, null], 7], [31838, 31992, [1, null], 9]]) {
      const roll = data.rolls.find(item => item.start === start);
      assert.deepEqual(roll.dice, dice);
      assert.equal(roll.resultFrame, resultFrame);
      assert.equal(roll.decision, null);
      assert.deepEqual(roll.after.borneOff, [off, 0]);
      assert(history.replay.timeline.some(item => item.kind === 'board-result' && item.frame === resultFrame));
    }
    const last = data.rolls.at(-1);
    assert.equal(last.end, data.ending.frame);
    assert(last.resultFrame + 50 < last.end);
  }
  if (number === 4 && replay.contextRecovery.some(entry => entry.frame === 1283 && entry.confirmedDetectorMisread)) {
    const roll = data.rolls.find(item => item.start === 8436);
    assert.deepEqual(roll.dice, [6, 4]);
    assert.equal(roll.pickup, 8728);
    assert(data.decisions[roll.decision].played);
    assert(replay.contextRecovery.some(item => item.kind === 'confirmed-consecutive' &&
      item.previousFrame === 22435 && item.frame === 24716));
    if (replay.contextRecovery.some(item => item.frame === 15990 && item.text.includes('Both entry points'))) {
      for (const [frame, dice, bar] of [[15990, [6, 3], [0, 1]], [20133, [3, 2], [1, 0]]]) {
        const fan = data.rolls.find(item => item.start === frame);
        assert.deepEqual(fan.dice, dice);
        assert(fan.fan && data.decisions[fan.decision].played);
        assert.deepEqual(fan.before.bar, bar);
        assert.deepEqual(fan.before, fan.after);
      }
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
    const opening = data.rolls.find(roll => roll.start === 488 && roll.evidence === 'reviewed-roll-and-legal-result');
    if (opening) {
      assert.deepEqual(opening.dice, [6, 5]);
      assert.equal(opening.before.points[12], 5);
      assert.equal(opening.after.points[12], 6);
      assert.equal(history.items[0].initial.phase, 'opening');
      for (const [start, dice] of [[301.56, [6, 6]], [471.12, [5, 4]], [672.88, [5, 1]]]) {
        const roll = data.rolls.find(roll => roll.start === Math.round(start * 25));
        assert.deepEqual(roll.dice, dice);
        assert(data.decisions[roll.decision].played, 'Recovered play must have a graded legal result');
      }
    }
    if (replay.contextRecovery.some(entry => entry.frame === 636 && entry.kind === 'reviewed-turn-order')) {
      const roll = data.rolls.find(item => item.start === 636);
      assert.deepEqual([roll.pickup, roll.player, roll.dice], [3213, 'dark', [6, 4]]);
      assert.equal(data.decisions[roll.decision].played.notation, '24/20 20/14');
      assert(data.decisions[roll.decision].evLoss > 0);
      assert(!data.rolls.some(item => item.start >= 3213 && item.start < 7539));
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
