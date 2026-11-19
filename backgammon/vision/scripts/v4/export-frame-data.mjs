/** Publish the reconstructed state at any replay frame, with explicit source and uncertainty. */
import fs from 'node:fs';
import path from 'node:path';
import { artifactDir, replayDir } from '../project_paths.mjs';
import { rowsFrom } from '../v2/solve_games.mjs';
import { cubeContext } from './cube-context.mjs';

const FPS = 25;

function frameData(game, rows, recording) {
  const rolls = game.presentation.rolls;
  const offer = game.decisions.cube;
  let rollIndex = 0, previous;
  const changes = [];
  for (const row of rows) {
    while (rollIndex < rolls.length && row.frame >= rolls[rollIndex].end) rollIndex++;
    const closed = row.phase === 'game-closed';
    const onBoard = !closed && rolls[rollIndex]?.start <= row.frame;
    const prior = rolls[rollIndex - 1];
    const result = prior?.pickup != null && game.turns[(prior.decision ?? prior.sourceTurns[0]) - 1]?.resultFrame;
    const pending = !closed && !onBoard && Number.isInteger(result) && result - prior.pickup >= 2 * FPS && row.frame < result;
    const owned = cubeContext(game, row);
    const cube = closed ? null : {
      value: owned?.value ?? row.cube?.stake ?? null,
      owner: owned ? (owned.owner === null ? 'centered' : ['white', 'dark'][owned.owner]) : 'unknown',
      offered: row.cube?.offered ?? null,
    };
    if (cube && cube.offered && offer && row.frame >= offer.startFrame) {
      cube.offerer = offer.offerer;
    }
    const phase = closed ? 'game-closed' : cube?.offered ? 'cube-response' : onBoard ? 'checker-turn' :
      pending ? 'checker-result-pending' :
      row.frame < rolls[0]?.start && game.game > 1 ? 'opening' :
      row.phase === 'pre-roll' ? 'pre-roll' : 'between-rolls';
    const state = {
      phase,
      position: closed ? null : row.position,
      movingPoints: closed ? null : row.displayPoints ?? null,
      roll: onBoard ? rollIndex : null,
      player: closed ? null : cube?.offered ? (offer?.offerer === 'white' ? 'dark' : 'white') :
        onBoard ? rolls[rollIndex].player : pending ? prior.player : row.phase === 'pre-roll' ? row.player : null,
      cube,
      loss: [row.loss.white.loss, row.loss.dark.loss],
      checkerLoss: [row.loss.white.checkerLoss, row.loss.dark.checkerLoss],
      cubeLoss: [row.loss.white.cubeLoss, row.loss.dark.cubeLoss],
    };
    const key = JSON.stringify(state);
    if (key !== previous) changes.push({ frame: row.frame, ...state });
    previous = key;
  }
  const positions = Object.fromEntries([...new Set(changes.map(change => change.position))]
    .filter(id => id !== null).map(id => {
      const position = game.positions[id];
      return [id, {
        points: position.points.map(([white, dark]) => white - dark),
        bar: position.bar, borneOff: position.borneOff,
        onRoll: position.onRoll, source: position.source, equities: position.equities,
      }];
    }));
  const decisions = Object.fromEntries(Object.entries(game.decisions).filter(([id]) => id !== 'cube')
    .map(([id, decision]) => [id, {
      player: decision.player,
      xgid: decision.xgid,
      played: decision.countedInGameLoss ? decision.played : null,
      evLoss: decision.countedInGameLoss ? decision.evLoss : null,
      moves: decision.actions.slice(0, 5).map(({ notation, steps, equity4, outcomeProbabilities4 }) =>
        ({ notation, steps, equity: equity4, probabilities: outcomeProbabilities4 })),
    }]));
  const snapshot = position => position ? {
    points: position.points.map(([white, dark]) => white - dark), bar: position.bar, borneOff: position.borneOff,
  } : null;
  const rollSnapshots = rolls.map(roll => {
    const turn = game.turns[(roll.decision ?? roll.sourceTurns[0]) - 1];
    return { ...roll, before: snapshot(turn.before), after: snapshot(turn.after), resultFrame: turn.resultFrame ?? null };
  });
  return {
    format: 'office-3-replay-frames', version: 1, game: game.game, fps: FPS, frames: rows.length,
    result: game.result ?? null, ending: game.ending ?? null,
    players: ['white', 'dark'], changes, positions, rolls: rollSnapshots, decisions,
    cubeRolls: game.presentation.cubeRolls,
    cubeOffer: offer ? {
      start: offer.startFrame, responseFrame: offer.reply ? offer.endFrame : null, player: offer.offerer,
      offered: offer.offeredFace, reply: offer.reply ?? null, replyInferred: Boolean(offer.replyInferred), options: offer.options,
    } : null,
    sources: recording.segments.map(({ clip, firstGameFrame, firstFrame, lastExclusive, discontinuity }) =>
      ({ clip, firstGameFrame, firstFrame, lastExclusive, discontinuity })),
  };
}

const output = process.argv[2];
if (!output) throw new Error('Supply the published frame-data directory.');
fs.mkdirSync(output, { recursive: true });
for (const n of [1, 2, 3, 4, 5]) {
  const prefix = `game-0${n}`;
  const game = JSON.parse(fs.readFileSync(path.join(replayDir, prefix + '-game.json')));
  const rows = rowsFrom(path.join(replayDir, prefix + '-state.jsonl.gz'));
  const recording = JSON.parse(fs.readFileSync(path.join(artifactDir, 'v2', `game-${n}-analysis.json`)));
  const data = frameData(game, rows, recording);
  fs.writeFileSync(path.join(output, `${prefix}.json`), JSON.stringify(data) + '\n');
  console.log(prefix, data.frames, 'frames in', data.changes.length, 'state intervals');
}
