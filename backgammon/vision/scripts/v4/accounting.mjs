/** Track confirmed decisions and their cumulative loss on the camera timeline. */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { replayDir, solverUrl } from '../project_paths.mjs';
import { rowsFrom } from '../v2/solve_games.mjs';
import { turnResult } from './checker-adjustment.mjs';
import { bestCubeReply } from './cube-options.mjs';

const { boardKey, commitTurn, legalTurns, winLevel } = await import(solverUrl('backgammon/core/rules.mjs'));
const { fromXGID } = await import(solverUrl('backgammon/core/xgid.mjs'));

const reviewedCubes = JSON.parse(fs.readFileSync(new URL('./reviewed_cube_offers.json', import.meta.url)));
const reviewedEndings = JSON.parse(fs.readFileSync(new URL('./reviewed_endings.json', import.meta.url)));

function inferForcedFinish(game, rows, ending) {
  const finish = ending.forcedFinish;
  if (!finish) return null;
  const roll = game.presentation?.rolls.at(-1);
  const witness = rows[finish.rollFrame];
  if (roll?.start !== finish.rollFrame || roll.end < ending.frame || roll.pickup != null ||
      roll.player !== finish.player || roll.dice.join() !== finish.dice.join() ||
      witness?.clip !== ending.clip || witness.sourceFrame !== finish.sourceFrame) return null;
  const turn = game.turns[roll.decision - 1];
  const decision = game.decisions[roll.decision];
  if (!turn?.before || turn.after || !decision?.xgid) return null;
  const before = fromXGID(decision.xgid);
  if (before.phase !== 'move' || before.turn !== Number(roll.player === 'dark') ||
      before.dice.slice().sort().join() !== finish.dice.slice().sort().join() ||
      before.cube.value !== witness.cube?.stake || before.cube.value !== rows[ending.frame - 1]?.cube?.stake ||
      boardKey(before) !== boardKey({
        points: turn.before.points.map(([white, black]) => white - black),
        bar: turn.before.bar, off: turn.before.borneOff,
      })) return null;
  const results = legalTurns(before);
  if (results.length !== 1 || results[0].state.off[before.turn] !== 15) return null;
  const level = winLevel(results[0].state, before.turn);
  return { frame: ending.frame, winner: roll.player, reason: 'bearoff',
    points: level * before.cube.value, level, inferred: true, rollFrame: roll.start };
}

function applyEnding(game, rows) {
  const cube = game.decisions.cube;
  const review = reviewedCubes[game.game];
  if (review?.response === 'pass' && cube?.startFrame === review.start &&
      cube.endFrame === review.end && cube.offerer === review.offerer &&
      rows[review.start]?.clip === review.clip) cube.reply = review.response;
  const ending = reviewedEndings[game.game];
  const witness = ending && rows[ending.frame];
  const matched = witness && witness.clip === ending.clip && witness.sourceFrame === ending.sourceFrame;
  if (matched && ending.kind === 'pack-up-after-offer' && cube?.startFrame === 18628 &&
      cube.offerer === 'white' && cube.offeredFace === 4 && (!cube.reply || cube.replyInferred)) {
    cube.reply = 'pass';
    cube.replyInferred = true;
    cube.responder = 'dark';
    cube.endFrame = ending.frame;
    cube.endSeconds = ending.frame / 25;
    cube.replyEvLoss = cube.options.pass - bestCubeReply(cube.options)[1];
  }
  const frame = cube?.reply === 'pass' ? cube.endFrame : matched && ending.kind === 'board-reset' ? ending.frame : null;
  if (frame === null) return;
  const result = cube?.reply === 'pass'
    ? { frame, winner: cube.offerer, reason: 'pass', points: cube.preOfferStake,
      ...(cube.replyInferred ? { inferred: true } : {}) }
    : inferForcedFinish(game, rows, ending);
  game.ending = { frame, kind: result?.reason === 'pass' && !cube.replyInferred ? 'cube-pass' : ending.kind };
  if (result) game.result = result;
  else delete game.result;
  const postGame = matched && ending.postGamePlay;
  const playWitness = postGame && rows[postGame.frame];
  if (playWitness && postGame.frame > frame && playWitness.clip === postGame.clip &&
      playWitness.sourceFrame === postGame.sourceFrame) game.postGamePlay = postGame;
  if (game.presentation) {
    game.presentation.rolls = game.presentation.rolls.filter(roll => roll.start < frame).map(roll =>
      roll.end > frame ? { ...roll, end: frame, pickup: null } : roll);
    game.presentation.cubeRolls = game.presentation.cubeRolls.filter(roll => roll.frame < frame).map(roll =>
      roll.end > frame ? { ...roll, end: frame } : roll);
  }
  for (const row of rows.slice(frame)) {
    row.phase = 'game-closed';
    row.player = row.turn = row.roll = row.decision = row.position = row.displayPoints = null;
    row.actorEvidence = game.ending.kind;
    if (result) row.result = result;
    else delete row.result;
    row.cube = null;
  }
}

export function applyAccounting(game, rows) {
  const losses = game.losses.filter(({ kind, action }) => kind === 'cube' && !action);
  applyEnding(game, rows);
  const cube = game.decisions.cube;
  if (cube?.options && ['take', 'pass', 'beaver'].includes(cube.reply) && Number.isFinite(cube.options[cube.reply])) {
    losses.push({
      frame: cube.endFrame, player: cube.responder, kind: 'cube', action: cube.reply,
      loss: cube.options[cube.reply] - bestCubeReply(cube.options)[1],
    });
  }
  for (const decision of game.presentation?.cubeRolls ?? []) {
    losses.push({ frame: decision.frame, player: decision.player, kind: 'cube', action: 'roll', loss: decision.evLoss });
  }
  const seen = new Set();
  for (const [id, decision] of Object.entries(game.decisions)) {
    if (id === 'cube') continue;
    const turn = game.turns[Number(id) - 1];
    decision.countedInGameLoss = false;
    if (!decision.played || !Number.isFinite(decision.evLoss) || !turn?.after ||
        !Number.isInteger(turn.resultFrame) || turn.resultFrame < turn.start ||
        turn.resultFrame > turn.end || turn.resultFrame >= rows.length ||
        (game.ending && turn.resultFrame >= game.ending.frame)) continue;
    const source = fromXGID(decision.xgid);
    const scored = turnResult(turn);
    const after = {
      points: scored.points.map(([white, black]) => white - black),
      bar: scored.bar,
      off: scored.borneOff,
    };
    if (boardKey(commitTurn(source, decision.played.steps)) !== boardKey(after)) continue;
    const key = [turn.resultFrame, decision.player, decision.xgid].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    decision.countedInGameLoss = true;
    losses.push({ frame: turn.resultFrame, player: decision.player, loss: decision.evLoss,
      kind: 'checker', decision: Number(id) });
  }
  game.losses = losses.sort((a, b) => a.frame - b.frame);
  const empty = () => ({ loss: 0, count: 0, checkerLoss: 0, cubeLoss: 0 });
  const cumulative = { white: empty(), dark: empty() };
  let next = 0;
  let held = null;
  for (const row of rows) {
    while (next < losses.length && losses[next].frame <= row.frame) {
      const result = losses[next++];
      cumulative[result.player].loss += result.loss;
      cumulative[result.player].count++;
      cumulative[result.player][result.kind === 'checker' ? 'checkerLoss' : 'cubeLoss'] += result.loss;
      if (result.kind === 'checker') held = result;
    }
    row.loss = { white: { ...cumulative.white }, dark: { ...cumulative.dark } };
    row.playedDecision = held && row.frame < held.frame + 50 ? held.decision : null;
  }
}

export function writeReplay(prefix, game, rows) {
  const files = [
    [prefix + '-game.json', JSON.stringify(game)],
    [prefix + '-state.jsonl.gz', gzipSync(rows.map((row) => JSON.stringify(row)).join('\n') + '\n')],
  ];
  for (const [name, content] of files) {
    const target = path.join(replayDir, name);
    fs.writeFileSync(target + '.part', content);
    fs.renameSync(target + '.part', target);
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const source = path.resolve(process.argv[2] ?? replayDir);
  fs.mkdirSync(replayDir, { recursive: true });
  const numbers = process.argv.slice(3).map(Number);
  for (const number of numbers.length ? numbers : [1, 2, 3, 4, 5]) {
    const prefix = `game-0${number}`;
    const game = JSON.parse(fs.readFileSync(path.join(source, prefix + '-game.json')));
    const rows = rowsFrom(path.join(source, prefix + '-state.jsonl.gz'));
    applyAccounting(game, rows);
    writeReplay(prefix, game, rows);
    console.log(prefix, game.losses.length, 'counted decisions');
  }
}
