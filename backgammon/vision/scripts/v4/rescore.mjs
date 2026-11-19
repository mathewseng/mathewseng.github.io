/** Run unrestricted four-ply evaluation on an already reconstructed session. */
import fs from 'node:fs';
import path from 'node:path';
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { applyAccounting, writeReplay } from './accounting.mjs';
import { cubeContext } from './cube-context.mjs';
import { replayDir, solverUrl } from '../project_paths.mjs';
import { exclusive, loadEvaluator, rowsFrom, stateFor } from '../v2/solve_games.mjs';

const PLIES = 4;

if (isMainThread) await main();
else {
  const evaluator = await loadEvaluator();
  parentPort.on('message', ({ id, input, result }) => {
    try {
      const score = result
        ? evaluator.fullScore(input, result, PLIES)
        : evaluator.positionValue(input, PLIES);
      parentPort.postMessage({ id, equity: score.equity, chances: exclusive(score.probabilities) });
    } catch (error) {
      parentPort.postMessage({ id, error: error.message });
    }
  });
  parentPort.postMessage(null);
}

async function main() {
  const { fromXGID, toXGID } = await import(solverUrl('backgammon/core/xgid.mjs'));
  const args = process.argv.slice(2);
  const workers = Number(process.env.OFFICE3_SCORE_WORKERS || 8);
  if (!Number.isInteger(workers) || workers < 1) throw new Error('Invalid worker count');
  const numbers = args.length ? args.map(Number) : [1, 2, 3, 4, 5];
  if (numbers.some((n) => !Number.isInteger(n) || n < 1 || n > 5)) throw new Error('Use game numbers 1–5');
  const sourceDir = process.env.OFFICE3_SCORE_SOURCE ?? path.join(replayDir, 'context');
  fs.mkdirSync(replayDir, { recursive: true });

  const cached = new Map();
  const withCube = (position, cube) => ({
    ...position,
    cube: cube ?? { value: 1, owner: null },
    rules: { ...position.rules, cube: Boolean(cube) },
  });
  const inputFor = (pos, turn, cube) => toXGID(withCube({
    ...stateFor(pos, turn, [1, 2]), phase: 'roll', dice: [],
  }, cube), { engine: true });
  const cacheScores = (game, rows) => {
    if (game.scoringDepth !== PLIES) return;
    for (const [id, decision] of Object.entries(game.decisions)) {
      if (id === 'cube') continue;
      for (const action of decision.actions) {
        if (!Number.isFinite(action.equity4) || !action.outcomeProbabilities4) continue;
        cached.set(decision.xgid + '|' + action.xgid, {
          equity: action.equity4, chances: action.outcomeProbabilities4,
        });
      }
    }
    const visited = new Set();
    for (const row of rows) {
      if (visited.has(row.position)) continue;
      visited.add(row.position);
      const pos = game.positions[row.position];
      if (pos?.equities?.plies !== PLIES || !pos.onRoll) continue;
      const turn = Number(pos.onRoll === 'dark');
      const { equity, chances: win } = pos.equities.players[turn];
      const { chances: lose } = pos.equities.players[1 - turn];
      const previousCube = row.cube?.stake === 1 && row.cube.side === 'centered' ? { value: 1, owner: null } : null;
      cached.set(pos.equities.inputXgid ?? inputFor(pos, turn, previousCube), { equity, chances: {
        winSingle: win[0], winGammon: win[1], winBackgammon: win[2],
        loseSingle: lose[0], loseGammon: lose[1], loseBackgammon: lose[2],
      } });
    }
  };
  const jobs = new Map();
  const enqueue = (input, result) => {
    const id = result ? input + '|' + result : input;
    if (!cached.has(id) && !jobs.has(id)) jobs.set(id, { id, input, result });
    return id;
  };
  const games = [];
  for (const number of numbers) {
    const prefix = 'game-' + String(number).padStart(2, '0');
    const game = JSON.parse(fs.readFileSync(path.join(sourceDir, prefix + '-game.json')));
    const rows = rowsFrom(path.join(sourceDir, prefix + '-state.jsonl.gz'));
    const positionJobs = new Map();
    const cachedGame = path.join(replayDir, prefix + '-game.json');
    cacheScores(game, rows);
    if (replayDir !== sourceDir && fs.existsSync(cachedGame)) {
      cacheScores(JSON.parse(fs.readFileSync(cachedGame)), rowsFrom(path.join(replayDir, prefix + '-state.jsonl.gz')));
    }
    const timeline = new Map();
    const byCube = new Map();
    let nextPosition = Math.max(0, ...Object.keys(game.positions).map(Number)) + 1;
    for (const row of rows) {
      if (row.position === null) continue;
      const cube = cubeContext(game, row);
      const key = row.position + '|' + cube?.value + '|' + cube?.owner;
      if (!byCube.has(key)) {
        let id = row.position;
        if (timeline.has(id)) {
          id = nextPosition++;
          game.positions[id] = { ...game.positions[row.position] };
        }
        byCube.set(key, id);
        timeline.set(id, row);
      }
      row.position = byCube.get(key);
    }
    for (const [id, pos] of Object.entries(game.positions)) {
      if (!pos.onRoll) continue;
      const row = timeline.get(Number(id));
      if (!row || row.phase === 'game-closed') continue;
      const turn = Number(pos.onRoll === 'dark');
      const inputXgid = inputFor(pos, turn, cubeContext(game, row));
      positionJobs.set(id, { turn, inputXgid, job: enqueue(inputXgid) });
    }
    const actionJobs = new Map();
    for (const [id, decision] of Object.entries(game.decisions)) {
      if (id === 'cube') continue;
      const turn = game.turns[Number(id) - 1];
      const cube = cubeContext(game, rows[turn.start]);
      decision.xgid = toXGID(withCube(fromXGID(decision.xgid), cube));
      decision.cube = cube;
      decision.context = cube ? (cube.owner === null ? 'money-cube-centered-at-one' : 'money-cube-owned') :
        'cubeless-ownership-or-stake-unresolved';
      decision.equityUnits = cube ? 'normalized cube equity' : 'cubeless equity';
      for (const action of decision.actions) {
        action.xgid = toXGID(withCube(fromXGID(action.xgid), cube), { engine: true });
        actionJobs.set(action, enqueue(decision.xgid, action.xgid));
      }
    }
    games.push({ prefix, game, rows, actionJobs, positionJobs });
  }

  const pending = [...jobs.values()].filter(({ id }) => !cached.has(id));
  const results = new Map([...cached, ...await runJobs(pending, workers)]);
  for (const { prefix, game, rows, actionJobs, positionJobs } of games) {
    for (const [action, job] of actionJobs) {
      const score = results.get(job);
      action.equity4 = score.equity;
      action.outcomeProbabilities4 = score.chances;
    }
    for (const [id, decision] of Object.entries(game.decisions)) {
      if (id === 'cube') continue;
      decision.actions.sort((a, b) => b.equity4 - a.equity4);
      for (const [rank, action] of decision.actions.entries()) {
        action.isBest = rank === 0;
        delete action.equity3;
        delete action.outcomeProbabilities3;
      }
      const best = decision.actions[0];
      const played = decision.actions.find(({ isPlayed }) => isPlayed);
      decision.preset = { allActions: PLIES };
      decision.best = summary(best);
      decision.played = played ? summary(played) : null;
      decision.evLoss = played ? Math.max(0, best.equity4 - played.equity4) : null;
    }
    for (const [id, { turn, inputXgid, job }] of positionJobs) {
      const { equity, chances: p } = results.get(job);
      const players = [
        { equity, chances: [p.winSingle, p.winGammon, p.winBackgammon] },
        { equity: -equity, chances: [p.loseSingle, p.loseGammon, p.loseBackgammon] },
      ];
      if (turn === 1) players.reverse();
      game.positions[id].equities = { turn: game.positions[id].onRoll, plies: PLIES, inputXgid, players };
    }

    game.scoringDepth = PLIES;
    applyAccounting(game, rows);
    writeReplay(prefix, game, rows);
    console.log(prefix, 'scored at four ply', { actionScores: actionJobs.size, positions: positionJobs.size });
  }
}

function summary(action) {
  return {
    notation: action.notation, steps: action.steps, equity: action.equity4,
    outcomeProbabilities: action.outcomeProbabilities4,
  };
}

async function runJobs(jobs, maxWorkers) {
  const results = new Map();
  let cursor = 0;
  const pool = Array.from({ length: Math.min(maxWorkers, jobs.length) },
    () => new Worker(new URL(import.meta.url)));
  console.log('Evaluating', jobs.length, 'unique positions or results with', pool.length, 'workers');
  try {
    await Promise.all(pool.map((worker) => new Promise((resolve, reject) => {
      worker.on('error', reject);
      worker.on('exit', (code) => {
        if (code !== 0) reject(new Error('GNUbg worker exited with ' + code));
      });
      worker.on('message', (message) => {
        if (message?.error) {
          reject(new Error(message.id + ': ' + message.error));
          return;
        }
        if (message) {
          results.set(message.id, message);
          if (results.size % 100 === 0) console.log('Scored', results.size, '/', jobs.length);
        }
        if (cursor === jobs.length) resolve();
        else worker.postMessage(jobs[cursor++]);
      });
    })));
  } finally {
    await Promise.all(pool.map((worker) => worker.terminate()));
  }
  return results;
}
