/** Track confirmed decisions and their cumulative loss on the camera timeline. */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { replayDir, solverUrl } from '../project_paths.mjs';
import { rowsFrom } from '../v2/solve_games.mjs';

const { boardKey, commitTurn } = await import(solverUrl('backgammon/core/rules.mjs'));
const { fromXGID } = await import(solverUrl('backgammon/core/xgid.mjs'));

const reviewedCubes = JSON.parse(fs.readFileSync(new URL('./reviewed_cube_offers.json', import.meta.url)));

function applyPass(game, rows) {
  const cube = game.decisions.cube;
  const review = reviewedCubes[game.game];
  if (review?.response === 'pass' && cube?.startFrame === review.start &&
      cube.endFrame === review.end && cube.offerer === review.offerer &&
      rows[review.start]?.clip === review.clip) cube.reply = review.response;
  if (cube?.reply !== 'pass') return;
  const frame = cube.endFrame;
  const result = { frame, winner: cube.offerer, reason: 'pass', points: cube.preOfferStake };
  game.result = result;
  for (const row of rows.slice(frame)) {
    row.phase = 'game-closed';
    row.player = cube.responder;
    row.actorEvidence = 'confirmed-cube-pass';
    row.turn = row.roll = row.decision = row.displayPoints = null;
    row.result = result;
    row.cube = { ...row.cube, stake: cube.preOfferStake, offered: null, response: 'pass' };
  }
}

export function applyAccounting(game, rows) {
  const losses = game.losses.filter(({ kind, action }) => kind === 'cube' && !action);
  applyPass(game, rows);
  const cube = game.decisions.cube;
  if (cube?.options && ['take', 'pass'].includes(cube.reply)) {
    const { take, pass } = cube.options;
    losses.push({
      frame: cube.endFrame, player: cube.responder, kind: 'cube', action: cube.reply,
      loss: cube.options[cube.reply] - Math.min(take, pass),
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
        (game.result && turn.resultFrame >= game.result.frame)) continue;
    const source = fromXGID(decision.xgid);
    const after = {
      points: turn.after.points.map(([white, black]) => white - black),
      bar: turn.after.bar,
      off: turn.after.borneOff,
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
