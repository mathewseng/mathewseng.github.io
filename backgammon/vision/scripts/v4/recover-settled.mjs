/** Recover a legal checker play when footage confirms both sides of one physical turn. */
import fs from 'node:fs';
import path from 'node:path';
import { artifactDir, replayDir, solverUrl } from '../project_paths.mjs';
import { rowsFrom, stateFor } from '../v2/solve_games.mjs';
import { writeReplay } from './accounting.mjs';

const { boardKey, legalTurns, notation } = await import(solverUrl('backgammon/core/rules.mjs'));
const { toXGID } = await import(solverUrl('backgammon/core/xgid.mjs'));
const read = (dir, name) => JSON.parse(fs.readFileSync(path.join(dir, name)));
const rawDir = path.join(artifactDir, 'v2');
const possibleDice = Array.from({length: 6}, (_, i) =>
  Array.from({length: 6 - i}, (_, j) => [i + 1, i + j + 1])).flat();
const keyOf = board => board && boardKey({
  points: board.points.map(([white, dark]) => white - dark), bar: board.bar, off: board.borneOff,
});

function support(frames, expected, start, end) {
  let window = [];
  for (let frame = Math.max(0, start); frame < Math.min(end, frames.length); frame++) {
    if (frames[frame] !== expected) continue;
    window = window.filter(other => frame - other <= 12);
    window.push(frame);
    if (window.length >= 5) return window[0];
  }
  return null;
}

function uniqueLegalResult(before, player, observed, destination) {
  const faces = observed.filter(Number.isInteger).sort((a, b) => a - b);
  const options = faces.length === 2 ? [faces] : possibleDice.filter(dice => faces.every(die => dice.includes(die)));
  let result;
  for (const dice of options) {
    const start = stateFor(before, player, dice);
    const actions = legalTurns(start);
    const played = actions.find(action => action.key === destination);
    if (!played) continue;
    if (result) return null;
    result = { start, actions, played, dice };
  }
  return result;
}

function recover(game, rows, recording, raw) {
  const recovered = [];
  const rolls = game.presentation.rolls;
  const offer = game.decisions.cube;
  const cuts = recording.segments.filter(part => part.discontinuity).map(part => part.firstGameFrame);
  const sourceTurn = roll => roll.decision ?? roll.sourceTurns.at(-1);
  for (let index = 0; index + 1 < rolls.length; index++) {
    const roll = rolls[index], next = rolls[index + 1];
    const id = sourceTurn(roll);
    const turn = game.turns[id - 1], following = game.turns[sourceTurn(next) - 1];
    if (roll.pickup === null || roll.player === next.player || !turn.before || !following.before || turn.after ||
        roll.sourceTurns.some(number => game.decisions[number]?.countedInGameLoss) ||
        cuts.some(frame => frame > roll.start && frame <= next.start) ||
        (offer && offer.startFrame < next.start && offer.endFrame >= roll.start)) continue;
    const before = keyOf(turn.before), after = keyOf(following.before);
    if (before === after || support(raw, before, roll.start - 80, roll.start + 12) === null) continue;
    // Where the hand hides the result, the first repeated view of the complete
    // board is the defensible timestamp. Never borrow a board from later play.
    const resultFrame = support(raw, after, roll.start + 4, Math.min(next.start, roll.pickup + 60));
    if (resultFrame === null) continue;
    const player = Number(roll.player === 'dark');
    const result = uniqueLegalResult(turn.before, player, roll.dice, after);
    if (!result) continue;
    const evidence = 'legal-turn-confirmed-by-following-board';
    Object.assign(turn, {
      after: following.before, dice: result.dice, steps: result.played.steps, resultFrame, evidence,
      end: Math.max(turn.end, resultFrame),
    });
    Object.assign(roll, { dice: [...result.dice].reverse(), decision: id, evidence });
    const actions = result.actions.map(action => ({
      key: action.key, notation: notation(action.steps, player), steps: action.steps,
      xgid: toXGID({ ...action.state, phase: 'roll', dice: [] }, { engine: true }),
      isPlayed: action.key === after,
    }));
    game.decisions[id] = {
      player: turn.player, dice: result.dice, evidence, xgid: toXGID(result.start), actions,
      startFrame: turn.start, endFrame: turn.end, observedResultFrame: resultFrame,
      startSeconds: turn.start / 25, endSeconds: turn.end / 25, legalCandidates: actions.length,
    };
    for (const row of rows) {
      if (row.roll?.id === id) Object.assign(row.roll, { dice: result.dice, evidence });
      if (row.turn === id && (row.phase === 'move' || row.phase === 'played')) {
        row.decision = id;
        row.phase = row.frame >= resultFrame ? 'played' : 'move';
      }
      if (row.frame < resultFrame || row.frame >= next.start) continue;
      // The last settled frame and the next pre-roll board agree. Reuse that
      // evaluated board entry when it matches the player who now has the roll.
      const position = game.positions[rows[next.start].position];
      if (keyOf(position) === after && position.onRoll === next.player) {
        row.position = rows[next.start].position;
        delete row.displayPoints;
      }
    }
    recovered.push({ id, before: roll.start, after: resultFrame, next: next.start, dice: roll.dice });
  }
  return recovered;
}

const source = path.resolve(process.argv[2] ?? replayDir);
fs.mkdirSync(replayDir, { recursive: true });
for (const number of (process.argv.length > 3 ? process.argv.slice(3).map(Number) : [1, 2, 3, 4, 5])) {
  const prefix = `game-0${number}`;
  const game = read(source, prefix + '-game.json');
  const rows = rowsFrom(path.join(source, prefix + '-state.jsonl.gz'));
  const recording = read(rawDir, `game-${number}-analysis.json`);
  const raw = recording.segments.flatMap(part => rowsFrom(path.join(rawDir, 'state', part.source.replace(/\.mp4$/, '.jsonl.gz')))
    .slice(part.firstFrame, part.lastExclusive).map(row => keyOf(row.state?.position)));
  game.recoveredTurns = recover(game, rows, recording, raw);
  writeReplay(prefix, game, rows);
  console.log(prefix, JSON.stringify(game.recoveredTurns));
}
