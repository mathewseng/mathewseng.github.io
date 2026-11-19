/** Evaluate each available cube decision before the player rolls. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainThread, parentPort, Worker } from 'node:worker_threads';
import { artifactDir, replayDir, solverUrl } from '../project_paths.mjs';
import { exclusive, loadEvaluator, rowsFrom } from '../v2/solve_games.mjs';
import { applyAccounting, writeReplay } from './accounting.mjs';
import { cubeContext } from './cube-context.mjs';

const { boardKey, canDouble, initialState } = await import(solverUrl('backgammon/core/rules.mjs'));
const { fromXGID, toXGID } = await import(solverUrl('backgammon/core/xgid.mjs'));
const opening = boardKey(initialState());

export function rollCubePositions(game, rows, rolls, breaks) {
  const offer = game.decisions.cube;
  return rolls.flatMap((roll, index) => {
    const prior = rolls[index - 1];
    const turn = game.turns[(roll.decision ?? roll.sourceTurns[0]) - 1];
    const cube = cubeContext(game, rows[roll.start]);
    if (!cube || !turn.before || !roll.start) return [];
    const { points, bar, borneOff } = turn.before;
    const state = initialState({
      points: points.map(([white, dark]) => white - dark), bar, off: borneOff, matchLength: 0,
      phase: 'roll', turn: Number(roll.player === 'dark'), cube,
      rules: { cube: true, jacoby: false, immediateRedoubles: 0 },
    });
    if (!canDouble(state) || (!index && game.game > 1 && boardKey(state) === opening)) return [];
    // We can only place a cue before the roll when the previous pickup and
    // the handoff to the new player were both established.
    const previous = prior && game.turns[(prior.decision ?? prior.sourceTurns.at(-1)) - 1];
    const handoff = Math.max(prior?.pickup ?? 0, previous?.resultFrame ?? 0);
    const afterPickup = prior?.pickup != null && prior.player !== roll.player &&
      previous?.after && JSON.stringify(previous.after) === JSON.stringify(turn.before) &&
      !breaks.some(frame => frame > prior.pickup && frame <= roll.start) &&
      !(offer && offer.startFrame < roll.start && offer.endFrame >= prior.pickup);
    return [{
      start: afterPickup ? Math.min(handoff, roll.start) : roll.start,
      frame: roll.start, end: Math.min(rows.length, Math.max(roll.end, roll.start + 50)),
      player: roll.player, preOfferStake: cube.value, xgid: toXGID(state),
    }];
  });
}

async function evaluateJobs(entries) {
  const unique = [...new Set(entries.map(entry => entry.xgid))];
  if (!unique.length) return new Map();
  let cursor = 0;
  const results = new Map();
  const pool = Array.from({ length: Math.min(unique.length, 7) }, () => new Worker(new URL(import.meta.url)));
  try {
    await Promise.all(pool.map(worker => new Promise((resolve, reject) => {
      worker.on('error', reject);
      worker.on('exit', code => { if (code) reject(new Error(`Cube worker exited with ${code}`)); });
      worker.on('message', message => {
        if (message?.error) return reject(new Error(message.error));
        if (message) {
          results.set(message.xgid, message.value);
          if (results.size % 10 === 0) console.log('Scored', results.size, '/', unique.length, 'cube positions');
        }
        if (cursor < unique.length) worker.postMessage(unique[cursor++]);
        else resolve();
      });
    })));
  } finally {
    await Promise.all(pool.map(worker => worker.terminate()));
  }
  return results;
}

export async function scoreRollCubes(positions) {
  const results = await evaluateJobs(positions);
  return positions.map(position => ({ ...position, ...results.get(position.xgid) }));
}

if (!isMainThread) {
  const evaluator = await loadEvaluator();
  parentPort.on('message', xgid => {
    try {
      const result = evaluator.analyze(fromXGID(xgid), 'research', 'cube');
      const [noDouble, take, pass] = result.outcomes;
      parentPort.postMessage({ xgid, value: {
        options: { noDouble, take, pass }, outcomeProbabilities: exclusive(result.probabilities),
        evLoss: Math.max(0, Math.min(take, pass) - noDouble),
      } });
    } catch (error) {
      parentPort.postMessage({ error: xgid + ': ' + error.message });
    }
  });
  parentPort.postMessage(null);
} else if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '')) {
  const source = path.resolve(process.argv[2] ?? replayDir);
  fs.mkdirSync(replayDir, { recursive: true });
  const games = [1, 2, 3, 4, 5].map(number => {
    const prefix = `game-0${number}`;
    const game = JSON.parse(fs.readFileSync(path.join(source, prefix + '-game.json')));
    const rows = rowsFrom(path.join(source, prefix + '-state.jsonl.gz'));
    const recording = JSON.parse(fs.readFileSync(path.join(artifactDir, 'v2', `game-${number}-analysis.json`)));
    const breaks = recording.segments.filter(part => part.discontinuity).map(part => part.firstGameFrame);
    const positions = rollCubePositions(game, rows, game.presentation.rolls, breaks);
    return { prefix, game, rows, positions };
  });
  const scored = await evaluateJobs(games.flatMap(game => game.positions));
  for (const { prefix, game, rows, positions } of games) {
    delete game.presentation.waits;
    game.presentation.cubeRolls = positions.map(position => ({ ...position, ...scored.get(position.xgid) }));
    applyAccounting(game, rows);
    writeReplay(prefix, game, rows);
    console.log(prefix, positions.length, 'no-double decisions');
  }
}
