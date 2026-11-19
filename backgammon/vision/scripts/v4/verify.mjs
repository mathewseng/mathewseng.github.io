/** Verify the full game timeline, source provenance and every scored action. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { artifactDir, replayDir, solverUrl } from '../project_paths.mjs';
import { rowsFrom } from '../v2/solve_games.mjs';

const { fromXGID } = await import(solverUrl('backgammon/core/xgid.mjs'));
const { applyStep, boardKey, initialState, legalPaths, legalTurns } = await import(solverUrl('backgammon/core/rules.mjs'));
const dir = replayDir;
const base = path.join(artifactDir, 'v2');
const summary = [];
const read = (dir, name) => JSON.parse(fs.readFileSync(path.join(dir, name)));
const reviewedEndings = JSON.parse(fs.readFileSync(new URL('./reviewed_endings.json', import.meta.url)));
for (const game of [1, 2, 3, 4, 5]) {
  const prefix = 'game-' + String(game).padStart(2, '0');
  const data = read(dir, prefix + '-game.json');
  const source = read(base, 'game-' + game + '-analysis.json');
  const rows = rowsFrom(path.join(dir, prefix + '-state.jsonl.gz'));
  assert.equal(rows.length, source.frames);
  assert.equal(data.frames, rows.length);
  assert.equal(data.scoringDepth, 4);
  if (data.postGamePlay) {
    const { frame, clip, sourceFrame } = data.postGamePlay;
    assert(frame > data.ending.frame && rows[frame].clip === clip && rows[frame].sourceFrame === sourceFrame);
    assert(data.losses.every(action => action.frame < frame));
    assert(rows.slice(frame).every(row => row.phase === 'game-closed' && row.roll === null));
  }
  const countPaths = new Map();
  for (const [id, turn] of data.turns.entries()) {
    const decision = data.decisions[id + 1];
    if (!decision || !turn.before) continue;
    const state = fromXGID(decision.xgid);
    const slots = new Set([state.points.join(',')]);
    for (const { steps } of legalPaths(state)) {
      let position = state;
      for (const step of steps) {
        position = applyStep(position, step, state.turn);
        slots.add(position.points.join(','));
      }
    }
    countPaths.set(id + 1, slots);
  }

  const recovered = (data.recoveredTurns ?? []).map(({ id, before, after, next, dice }) => {
    const turn = data.turns[id - 1];
    const decision = data.decisions[id];
    assert(decision?.countedInGameLoss, 'Recovered moves must be legal and graded');
    assert.equal(decision.evidence, 'legal-turn-confirmed-by-following-board');
    assert.equal(turn.resultFrame, after);
    assert.deepEqual([...decision.dice].sort((a, b) => b - a), dice);
    assert(before < after && after < next);
    return { frame: after, target: JSON.stringify(turn.after), matches: 0 };
  });
  const opening = boardKey(initialState());
  let postOfferRolls = 0;
  let resetFrames = 0;
  const countReset = (detected) => {
    if (detected?.currentRoll) postOfferRolls++;
    const board = detected?.position;
    if (board && boardKey({
      points: board.points.map(([white, black]) => white - black), bar: board.bar, off: board.borneOff,
    }) === opening) resetFrames++;
  };
  let lossIndex = 0;
  let totalLegal = 0;
  const empty = () => ({ loss: 0, count: 0, checkerLoss: 0, cubeLoss: 0 });
  const loss = { white: empty(), dark: empty() };
  const counts = { checkerBoard: 0, role: 0, currentRoll: 0, completeRoll: 0,
    cube: 0, missingRollRead: 0, anchoredRollRead: 0, carriedCheckerFrames: 0, liveCountFrames: 0, tallStackFrames: 0,
    toRollFrames: 0, cubeOfferFrames: 0 };
  for (const part of source.segments) {
    const raw = rowsFrom(path.join(base, 'state', part.source.replace(/\.mp4$/, '.jsonl.gz')));
    for (let i = part.firstFrame; i < part.lastExclusive; i++) {
      const frame = part.firstGameFrame + i - part.firstFrame;
      const row = rows[frame];
      for (const entry of recovered) {
        if (entry.frame <= frame && frame <= entry.frame + 12 &&
            JSON.stringify(raw[i].state?.position) === entry.target) entry.matches++;
      }
      if (game === 2 && frame >= data.decisions.cube.startFrame) countReset(raw[i].state);
      if (game === 5 && frame >= data.decisions.cube.startFrame && frame < data.ending.frame) {
        assert(!raw[i].state?.currentRoll, 'No dice rolled between the offer and pack-up');
      }
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
      if (row.phase === 'pre-roll') {
        const previous = data.turns[row.roll.id - 1];
        assert.notEqual(previous.player, row.player);
        assert(Number.isInteger(previous.pickupFrame) && previous.pickupFrame <= frame);
        counts.toRollFrames++;
      }
      if (row.displayPoints) {
        assert.equal(row.displayPoints.length, 24);
        assert(countPaths.get(row.turn)?.has(row.displayPoints.join(',')));
        counts.liveCountFrames++;
        if (row.displayPoints.some((n) => Math.abs(n) > 5)) counts.tallStackFrames++;
      }
      if (row.cube?.offered) {
        counts.cubeOfferFrames++;
        assert.equal(row.cube.offered, row.cube.stake * 2);
        assert.equal(row.phase, 'cube-response');
      }
      if (row.position !== null) {
        const board = data.positions[row.position];
        assert(board);
        if (board.onRoll && row.phase !== 'game-closed') {
          assert.equal(board.equities?.turn, board.onRoll, `Missing position equity in game ${game} at frame ${frame}.`);
        }
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
        loss[event.player][event.kind === 'checker' ? 'checkerLoss' : 'cubeLoss'] += event.loss;
      }
      assert.deepEqual(row.loss, loss);
      counts.role += Number(row.player !== null);
      counts.cube += Number(row.cube !== null);
    }
    // The last raw clip straddles the edit into Game 3. Confirm the opening
    // arrangement with the adjacent frames from that same camera clip.
    if (game === 2 && part === source.segments.at(-1)) {
      for (let i = part.lastExclusive; resetFrames < 5 && i < raw.length; i++) countReset(raw[i].state);
    }
  }
  assert(recovered.every(({ matches }) => matches >= 5), 'Recovered boards need repeated source-frame support');
  assert.equal(counts.anchoredRollRead, counts.missingRollRead);
  for (const [key, decision] of Object.entries(data.decisions)) {
    if (key === 'cube') continue;
    const state = fromXGID(decision.xgid);
    const legal = legalTurns(state);
    assert.equal(state.turn, decision.player === 'white' ? 0 : 1);
    assert.deepEqual(legal.map((r) => r.key).sort(), decision.actions.map((r) => r.key).sort());
    assert.equal(decision.preset.allActions, 4);
    assert(decision.actions.every((r, i) =>
      Number.isFinite(r.equity4) && (i === 0 || r.equity4 <= decision.actions[i - 1].equity4)));
    assert(decision.actions.every((r) => r.equity3 === undefined));
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
  assert(Object.values(data.positions).every((p) => !p.equities || p.equities.plies === 4));
  assert(counts.cubeOfferFrames > 0);
  if (data.ending) {
    const stop = data.ending.frame;
    assert(rows[stop - 1].phase !== 'game-closed');
    assert(rows.slice(stop).every(row => row.phase === 'game-closed' &&
      [row.position, row.player, row.roll, row.decision, row.turn].every(value => value === null)));
    if (reviewedEndings[game]) {
      const { frame, clip, sourceFrame, kind } = reviewedEndings[game];
      assert.deepEqual(data.ending, { frame, kind });
      assert.equal(rows[frame].clip, clip);
      assert.equal(rows[frame].sourceFrame, sourceFrame);
      assert(data.presentation.rolls.every(roll => roll.end <= frame));
      assert(data.presentation.cubeRolls.every(roll => roll.end <= frame));
      if (kind === 'board-reset') assert.equal(data.result, undefined);
    }
  }
  if (game === 1) {
    // The first visible white roll stays stable across drift in both die readings.
    for (const row of rows.slice(0, 465)) {
      assert.equal(row.roll.player, 'white');
      assert.deepEqual(row.roll.dice, [4, 5]);
    }
  }
  if (game === 2) {
    const move = data.losses.find(event => event.decision === 7);
    assert.equal(move.frame, 2315);
    assert.equal(move.player, 'dark');
    assert.equal(move.loss.toFixed(3), '0.005');
    assert.equal(data.losses.filter(event => event.decision === 7).length, 1);
    assert(Math.abs(rows[2315].loss.dark.loss - rows[2314].loss.dark.loss - move.loss) < 1e-12);
    assert.equal(rows[2425].loss.dark.checkerLoss, rows[2315].loss.dark.checkerLoss);
    assert(rows.slice(2315, 2365).every(row => row.playedDecision === 7));
    assert.notEqual(rows[2365].playedDecision, 7);
    assert.deepEqual(data.result, { frame: 6576, winner: 'white', reason: 'pass', points: 1 });
    assert.equal(rows[6575].phase, 'cube-response');
    assert.equal(postOfferRolls, 0);
    assert(resetFrames >= 5, 'Reset confirmed by multiple opening-board frames');
    assert.equal(data.decisions.cube.reply, 'pass');
    assert(rows.slice(6576).every(row => row.phase === 'game-closed' && row.roll === null &&
      row.turn === null && row.decision === null && row.result.reason === 'pass'));
  }
  if (game === 1 || game === 3) {
    const frame = game === 1 ? 8206 : 14239;
    const face = game === 1 ? 3 : 2;
    assert.deepEqual(rows[frame].roll.dice, [face, face]);
  }
  if (game === 4) {
    const row = rows[12341];
    assert.equal(row.roll.player, 'dark');
    const regraded = data.contextRecovery?.some(entry => entry.frame === 12259 && entry.boardWitnesses?.length === 2);
    assert.deepEqual(row.roll.dice, regraded ? [4, 5] : [4, 4]);
    assert.match(row.roll.evidence, /reviewed/);
  }
  if (game === 5) {
    assert.deepEqual(data.result, { frame: 19425, winner: 'white', reason: 'pass', points: 2, inferred: true });
    for (const row of rows.slice(18628, data.result.frame)) {
      assert.equal(row.phase, 'cube-response');
      assert.equal(row.player, 'dark');
      assert.equal(row.cube.stake, 2);
      assert.equal(row.cube.offered, 4);
      assert.equal(row.roll, null);
    }
    const pass = data.losses.filter(event => event.action === 'pass');
    assert.equal(pass.length, 1);
    assert.equal(pass[0].frame, data.result.frame);
    assert.equal(pass[0].player, 'dark');
    assert.equal(pass[0].loss.toFixed(3), '0.361');
  }
  const result = { game, frames: rows.length, turnEpisodes: data.turns.length,
    decisions: Object.keys(data.decisions).length, legalActions: totalLegal, graded: loss, ...counts };
  summary.push(result);
  console.log(JSON.stringify(result));
}
fs.writeFileSync(path.join(dir, 'state-validation.json'), JSON.stringify(summary, null, 2) + '\n');
