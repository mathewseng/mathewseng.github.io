/** Publish the reconstructed state at any replay frame, with explicit source and uncertainty. */
import fs from 'node:fs';
import path from 'node:path';
import { artifactDir, replayDir } from '../project_paths.mjs';
import { rowsFrom, stateFor } from '../v2/solve_games.mjs';
import { boardKey, notation, pipCount } from '../../../core/rules.mjs';
import { cubeContext } from './cube-context.mjs';
import { checkerStages } from './checker-counts.mjs';
import { presentationActions } from './presentation-actions.mjs';

const FPS = 25;
const snapshot = position => position ? {
  points: position.points.map(([white, dark]) => white - dark), bar: position.bar, borneOff: position.borneOff,
} : null;

function observedMoves(routes, prior) {
  const follows = prior.length ? routes.filter(route =>
    prior.every((move, i) => route.moves[i] === move)) : [];
  const choices = follows.length ? follows : routes;
  const signature = route => [...route.moves].sort().join(' ');
  const first = choices[0].moves;
  if (choices.every(route => signature(route) === signature(choices[0]))) return first;
  const shared = first.findIndex((move, index) => choices.some(route => route.moves[index] !== move));
  return shared < 0 ? first : first.slice(0, shared);
}

function frameData(game, rows, recording) {
  const rolls = game.presentation.rolls;
  const offer = game.decisions.cube;
  const movingBoards = new Map();
  const progressByDecision = new Map();
  for (const roll of rolls) {
    if (!roll.decision) continue;
    const turn = game.turns[roll.decision - 1];
    if (!turn.before || !turn.dice.every(Number.isInteger)) continue;
    const input = stateFor(turn.before, Number(roll.player === 'dark'), turn.dice);
    const visible = new Map();
    const routes = new Map();
    const remember = (key, state, steps) => {
      if (!routes.has(key)) routes.set(key, new Map());
      const moves = steps.map(step => notation([step], input.turn));
      const result = boardKey(state);
      routes.get(key).set(moves.join(' '), { moves, result });
    };
    const stages = checkerStages(input, undefined, undefined, remember);
    if (turn.adjustment) {
      for (const [key, stage] of checkerStages(input, undefined, turn.adjustment, remember)) stages.set(key, stage);
    }
    for (const stage of stages.values()) {
      const points = stage.points.join(',');
      // Omit the inventory if the point counts alone admit several versions.
      visible.set(points, visible.has(points) ? null : stage);
    }
    movingBoards.set(roll.decision, visible);
    progressByDecision.set(roll.decision, { routes,
      candidates: new Map(game.decisions[roll.decision].actions.map(action => [action.key, action])) });
  }
  const settled = new Map(Object.entries(game.positions).map(([id, position]) => [id, snapshot(position)]));
  let rollIndex = 0, previous, progressKey, trackedDecision, progress = null;
  const changes = [];
  for (const row of rows) {
    while (rollIndex < rolls.length && row.frame >= rolls[rollIndex].end) rollIndex++;
    const closed = row.phase === 'game-closed';
    const onBoard = !closed && rolls[rollIndex]?.start <= row.frame;
    const prior = rolls[rollIndex - 1];
    const result = prior?.pickup != null && game.turns[(prior.decision ?? prior.sourceTurns[0]) - 1]?.resultFrame;
    const owned = cubeContext(game, row);
    const cube = closed ? null : {
      value: owned?.value ?? row.cube?.stake ?? null,
      owner: owned ? (owned.owner === null ? 'centered' : ['white', 'dark'][owned.owner]) : 'unknown',
      offered: row.cube?.offered ?? null,
    };
    if (cube && cube.offered && offer && row.frame >= offer.startFrame) {
      cube.offerer = offer.offerer;
    }
    const pending = !closed && !onBoard && !cube?.offered && Number.isInteger(result) && row.frame < result;
    const movingDecision = (onBoard ? rolls[rollIndex].decision : pending ? prior.decision : null) ?? row.turn;
    const phase = closed ? 'game-closed' : cube?.offered ? 'cube-response' : onBoard ? 'checker-turn' :
      pending ? 'checker-result-pending' :
      row.frame < rolls[0]?.start && game.game > 1 ? 'opening' :
      row.phase === 'pre-roll' ? 'pre-roll' : 'between-rolls';
    const movingBoard = !closed && row.displayPoints
      ? movingBoards.get(movingDecision)?.get(row.displayPoints.join(',')) ?? null : null;
    const visible = movingBoard ?? (!closed && row.position != null ? settled.get(String(row.position)) : null);
    const currentDecision = onBoard ? rolls[rollIndex].decision : null;
    const keyForProgress = currentDecision && movingBoard
      ? boardKey({ ...movingBoard, off: movingBoard.borneOff }) : null;
    if (currentDecision !== trackedDecision || keyForProgress !== progressKey) {
      const details = progressByDecision.get(currentDecision);
      const possibilities = [...(details?.routes.get(keyForProgress)?.values() ?? [])];
      const prior = currentDecision === trackedDecision ? progress?.moves ?? [] : [];
      const moves = possibilities.length ? observedMoves(possibilities, prior) : [];
      const candidate = details?.candidates.get(possibilities[0]?.result);
      const complete = candidate && possibilities.every(route => route.result === candidate.key);
      progress = moves.length || (complete && possibilities[0].moves.length) ? {
        moves, ...(complete ? { candidate: candidate.key } : {}),
      } : null;
      progressKey = keyForProgress;
      trackedDecision = currentDecision;
    }
    const state = {
      phase,
      position: closed ? null : row.position,
      movingPoints: closed ? null : row.displayPoints ?? null,
      movingBoard,
      pipCounts: visible ? [pipCount(visible, 0), pipCount(visible, 1)] : null,
      moveProgress: progress,
      roll: onBoard ? rollIndex : null,
      ...(pending && prior.decision ? { pendingDecision: prior.decision } : {}),
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
  const rollSnapshots = rolls.map(roll => {
    const turn = game.turns[(roll.decision ?? roll.sourceTurns[0]) - 1];
    const adjustment = turn.adjustment;
    return { ...roll, before: snapshot(turn.before), after: snapshot(turn.after), resultFrame: turn.resultFrame ?? null,
      ...(adjustment ? { adjustment: { ...adjustment, position: snapshot(adjustment.position) } } : {}) };
  });
  return {
    format: 'office-3-replay-frames', version: 1, game: game.game, fps: FPS, frames: rows.length,
    result: game.result ?? null, ending: game.ending ?? null,
    ...(game.postGamePlay ? { postGamePlay: game.postGamePlay } : {}),
    players: ['white', 'dark'], changes, positions, rolls: rollSnapshots, decisions,
    cubeRolls: game.presentation.cubeRolls, actions: presentationActions(game),
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
const overlayOnly = output === '--overlay-state';
const games = overlayOnly ? [Number(process.argv[3])] : [1, 2, 3, 4, 5];
if (games.some(game => !Number.isInteger(game) || game < 1 || game > 5)) {
  throw new Error('Supply a game number from 1 to 5.');
}
if (!overlayOnly) fs.mkdirSync(output, { recursive: true });
for (const n of games) {
  const prefix = `game-0${n}`;
  const game = JSON.parse(fs.readFileSync(path.join(replayDir, prefix + '-game.json')));
  const rows = rowsFrom(path.join(replayDir, prefix + '-state.jsonl.gz'));
  const recording = JSON.parse(fs.readFileSync(path.join(artifactDir, 'v2', `game-${n}-analysis.json`)));
  const data = frameData(game, rows, recording);
  if (overlayOnly) {
    let last;
    const changes = data.changes.flatMap(({ frame, pipCounts, moveProgress }) => {
      const key = JSON.stringify([pipCounts, moveProgress]);
      if (key === last) return [];
      last = key;
      return [[frame, pipCounts, moveProgress]];
    });
    console.log(JSON.stringify({ changes, actions: data.actions }));
    continue;
  }
  fs.writeFileSync(path.join(output, `${prefix}.json`), JSON.stringify(data) + '\n');
  console.log(prefix, data.frames, 'frames in', data.changes.length, 'state intervals');
}
