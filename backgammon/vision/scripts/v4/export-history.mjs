/** Export recoverable camera history as Backgammon Library items and a seekable index. */
import fs from 'node:fs';
import path from 'node:path';
import { blockedBarRoll, boardKey, commitTurn, decisionPlayer, initialState, positionKey, transition } from '../../../core/rules.mjs';
import { fromXGID } from '../../../core/xgid.mjs';
import { parseBackup } from '../../../core/storage.mjs';
import { ENGINE_VERSION } from '../../../engine/metadata.mjs';
import { gradeCube } from '../../../engine/cube-grade.mjs';
import { replayDir } from '../project_paths.mjs';
import { cubeContext } from './cube-context.mjs';
import { exclusive, loadEvaluator, rowsFrom } from '../v2/solve_games.mjs';

const names = ['White', 'Black'];
const recordedAt = Date.UTC(2026, 10, 17);
const player = color => Number(color === 'dark');
const completeDice = dice => dice?.length === 2 && dice.every(value => value >= 1 && value <= 6);
const board = ({ points, bar, borneOff }) => ({
  points: points.map(([white, black]) => white - black), bar, off: borneOff,
});
const rules = { cube: true, jacoby: false, immediateRedoubles: 0 };
const nested = chances => [
  chances.winSingle + chances.winGammon + chances.winBackgammon,
  chances.winGammon + chances.winBackgammon, chances.winBackgammon,
  chances.loseGammon + chances.loseBackgammon, chances.loseBackgammon,
];
const cubeless = ([win, gammon, backgammon, loseGammon, loseBackgammon]) =>
  2 * win - 1 + gammon + backgammon - loseGammon - loseBackgammon;
const base = (source, type, cubeful) => ({
  type, status: 'complete', engine: ENGINE_VERSION, positionKey: positionKey(source),
  settings: { name: 'Research', plies: 4, cubeful }, perspective: source.turn,
  units: 'current-cube-points',
});

function checkerResult(decision, source, steps) {
  if (!decision) return null;
  const convert = action => {
    const probabilities = nested(action.outcomeProbabilities4);
    return {
      steps: action.steps, notation: action.notation, key: action.key,
      equity: action.equity4, probabilities, cubeless: cubeless(probabilities),
    };
  };
  const key = steps ? boardKey(commitTurn(source, steps)) : null;
  const played = decision.actions.find(action => action.key === key);
  return {
    ...base(source, 'checker', decision.equityUnits !== 'cubeless equity'),
    candidates: decision.actions.slice(0, 5).map(convert),
    actual: played ? { ...convert(played), rank: decision.actions.indexOf(played) + 1 } : null,
    evaluatedCount: decision.actions.length,
  };
}

function cubeResult(entry, source, chances) {
  if (!entry.options || !chances) return null;
  const probabilities = nested(chances);
  const { noDouble, take, pass } = entry.options;
  return {
    ...base(source, 'cube', true), probabilities, cubeless: cubeless(probabilities),
    equity: noDouble, outcomes: [noDouble, take, pass],
  };
}

function validMove(source, steps, observed) {
  if (!source || source.phase !== 'move' || !steps || !observed) return false;
  try {
    return boardKey(commitTurn(source, steps)) === boardKey(board(observed));
  } catch {
    return false;
  }
}

function observedPosition(turn, cube, gameNumber) {
  if (!turn.before) return null;
  try {
    return initialState({
      ...board(turn.before), gameNumber, matchLength: 0, turn: player(turn.player),
      cube: cube ?? { value: 1, owner: null }, rules: { ...rules, cube: Boolean(cube) },
      phase: completeDice(turn.dice) ? 'move' : 'roll',
      dice: completeDice(turn.dice) ? turn.dice : [],
    });
  } catch {
    return null;
  }
}

function makeHistory(game, rows, extraCubeChances) {
  const number = game.game;
  const collection = 'Office-3 · Nov 17, 2026';
  const items = [], timeline = [];
  const stateOptions = { gameNumber: number, matchLength: 0, rules };
  const record = (kind, description, notes) => {
    const item = {
      version: 1, kind, id: `office3-20261117-game-${number}-${items.length + 1}`,
      title: `Office-3 Game ${number} · ${description}`, collection, tags: ['office-3', 'video'],
      createdAt: recordedAt, updatedAt: recordedAt, notes,
    };
    items.push(item);
    return item;
  };
  let active = null;
  let line = 0;
  const chapter = source => {
    if (active && positionKey(active.state) === positionKey(source)) return;
    const item = record('match', `Replay segment ${++line}`,
      'Consecutive observed actions from a verified board position in the footage.');
    active = Object.assign(item, {
      initial: source, state: source, events: [], names, gameNumber: number, gameCount: 1,
      status: 'in-progress',
    });
  };
  const action = (step, frame, evaluation) => {
    const event = { action: step, actor: decisionPlayer(active.state), videoFrame: frame,
      ...(evaluation ? { evaluation: { result: evaluation } } : {}) };
    const state = transition(active.state, step, event.actor);
    active.state = state;
    if (state.phase === 'over') active.status = 'game-complete';
    return { item: active.id, event: active.events.push(event) - 1 };
  };
  const noDoubles = new Map((game.presentation?.cubeRolls ?? []).map(entry => [entry.frame, entry]));
  const recordNoDouble = (choice, source, dice, turn, checkpoint) => {
    if (!choice) return null;
    const result = cubeResult(choice, source, choice.outcomeProbabilities);
    const entry = { frame: choice.frame, rollFrame: choice.start, endFrame: choice.end, turn, kind: 'cube' };
    if (completeDice(dice) && !blockedBarRoll(source)) {
      chapter(source);
      timeline.push({ ...entry, checkpoint, ...action({ type: 'roll', dice }, choice.frame, result) });
      return active.state;
    }
    const item = record('position', `Turn ${turn} cube decision`, 'The pre-roll cube decision is scored from the visible board.');
    item.state = source;
    item.analysis = gradeCube(source, result, 'roll');
    timeline.push({ ...entry, kind: 'cube-review', item: item.id,
      label: source.cube.value === 1 ? 'No double' : 'No redouble' });
    return null;
  };
  const cubeEntry = game.decisions.cube;
  const episodes = game.presentation?.rolls.flatMap(roll => {
    const verified = roll.sourceTurns.filter(id => game.decisions[id]?.countedInGameLoss);
    const sources = verified.length ? verified : [roll.decision ?? roll.sourceTurns[0]];
    return sources.map((id, offset) => ({
      frame: offset ? game.turns[id - 1].start : roll.start,
      turn: game.turns[id - 1], id, end: roll.end, dice: roll.dice,
    }));
  }) ?? game.turns.map((turn, index) => ({
    frame: turn.start, turn, id: index + 1, end: turn.end + 1, dice: turn.dice,
  }));
  if (cubeEntry) episodes.push({ frame: cubeEntry.startFrame, offer: cubeEntry });
  const stop = rows.find(row => row.phase === 'game-closed');
  const opening = initialState(stateOptions);
  let observedTurn = 0;
  for (const { frame, turn, id, end, dice: rolledDice, offer } of episodes.sort((a, b) => a.frame - b.frame)) {
    if (stop && frame >= stop.frame) break;
    if (offer) {
      const offerer = player(offer.offerer);
      const source = offer.beforeXgid ? { ...fromXGID(offer.beforeXgid), gameNumber: number } :
        initialState({ ...stateOptions, ...board(offer.position), turn: offerer, phase: 'roll',
          cube: { value: 1, owner: null } });
      chapter(source);
      const chances = offer.outcomeProbabilities ?? extraCubeChances;
      timeline.push({ frame, endFrame: offer.reply ? offer.endFrame : stop?.frame ?? offer.endFrame,
        turn: observedTurn + 1, kind: 'cube',
        ...action({ type: 'double' }, frame, cubeResult(offer, active.state, chances)) });
      if (offer.reply === 'take' || offer.reply === 'pass') {
        timeline.push({ frame: offer.endFrame, endFrame: offer.reply === 'pass' ? rows.length : offer.endFrame + 50,
          turn: observedTurn + 1, kind: 'cube',
          ...(offer.replyInferred ? { note: 'Pass inferred from pack-up' } : {}),
          ...action({ type: offer.reply }, offer.endFrame, cubeResult(offer, active.state, chances)) });
      } else {
        timeline.push({ frame: stop?.frame ?? offer.endFrame, kind: 'gap', label: 'Cube response unconfirmed' });
        active = null;
      }
      continue;
    }

    observedTurn++;
    const decision = game.decisions[id];
    const cube = cubeContext(game, rows[frame]);
    const source = observedPosition(turn, cube, number);
    const steps = decision?.countedInGameLoss ? decision.played.steps : turn.steps;
    const cubeChoice = noDoubles.get(frame);
    const preRoll = source && { ...source, dice: [], phase: 'roll' };
    if (!validMove(source, steps, turn.after)) {
      if (preRoll) recordNoDouble(cubeChoice, preRoll, turn.dice, observedTurn, true);
      const resultVerified = turn.evidence === 'reviewed-roll-with-confirmed-board';
      const entry = { frame, turn: observedTurn, kind: 'gap', player: turn.player, dice: rolledDice,
        label: resultVerified ? 'Dice unresolved' : 'Checker move unconfirmed' };
      if (source) {
        const item = record('position', `Turn ${observedTurn} position`, 'Observed board before an unresolved checker move.');
        item.state = source;
        if (decision) item.analysis = checkerResult(decision, source);
        entry.item = item.id;
      }
      timeline.push(entry);
      if (resultVerified) {
        const nextPlayer = turn.player === 'white' ? 'dark' : 'white';
        const result = record('position', `Turn ${observedTurn} result`, 'Confirmed checker board after a roll with an unresolved face.');
        result.state = observedPosition({ before: turn.after, player: nextPlayer, dice: [] }, cube, number);
        timeline.push({ frame: turn.resultFrame, kind: 'board-result', label: 'Confirmed checker result', item: result.id });
      }
      active = null;
      continue;
    }

    const start = preRoll;
    const openingTurn = rows[0].phase === 'opening' && observedTurn === 1 &&
      boardKey(opening) === boardKey(source) && source.dice[0] !== source.dice[1];
    const needsCheckpoint = !active || positionKey(active.state) !== positionKey(start);
    chapter(openingTurn ? opening : start);
    const { dice } = source;
    const [low, high] = [...dice].sort((a, b) => a - b);
    if (openingTurn) action({ type: 'opening', dice: source.turn ? [low, high] : [high, low] }, frame);
    else if (!recordNoDouble(cubeChoice, start, dice, observedTurn, needsCheckpoint)) action({ type: 'roll', dice }, frame);
    const resultFrame = turn.resultFrame ?? frame;
    timeline.push({
      frame: resultFrame, rollFrame: frame, endFrame: Math.max(end, resultFrame + 50),
      turn: observedTurn, kind: 'checker',
      checkpoint: needsCheckpoint && !openingTurn,
      ...action({ type: 'move', steps }, resultFrame, checkerResult(decision, active.state, steps)),
    });
  }
  if (stop) {
    const result = game.result;
    const outcome = result ? `${names[player(result.winner)]} wins ${result.points} ${result.points === 1 ? 'point' : 'points'}` : null;
    timeline.push({ frame: stop.frame, kind: 'end', label: outcome ??
      (game.ending?.kind === 'board-reset' ? 'Board reset · result unconfirmed' : 'Game ends · result unconfirmed'),
      ...(result?.inferred ? { note: 'Pass inferred from pack-up' } : {}) });
  }
  const lastLoss = rows.at(-1).loss;
  return {
    version: 1, format: 'backgammon-library', progress: [], items,
    replay: { game: number, frameData: Boolean(game.presentation), timeline,
      losses: [lastLoss.white.loss, lastLoss.dark.loss],
      lossBreakdown: [lastLoss.white, lastLoss.dark].map(({ checkerLoss, cubeLoss }) => ({ checkerLoss, cubeLoss })),
    },
  };
}

const output = process.argv[2];
if (!output) throw new Error('Supply the published history directory.');
fs.mkdirSync(output, { recursive: true });
for (const n of [1, 2, 3, 4, 5]) {
  const prefix = `game-0${n}`;
  const game = JSON.parse(fs.readFileSync(path.join(replayDir, prefix + '-game.json')));
  const rows = rowsFrom(path.join(replayDir, prefix + '-state.jsonl.gz'));
  const cube = game.decisions.cube;
  let extra;
  if (cube?.beforeXgid && !cube.outcomeProbabilities) {
    const evaluator = await loadEvaluator();
    const source = fromXGID(cube.beforeXgid);
    extra = exclusive(evaluator.analyze(source, 'research', 'cube').probabilities);
  }
  const history = makeHistory(game, rows, extra);
  const text = JSON.stringify(history) + '\n';
  parseBackup(text);
  fs.writeFileSync(path.join(output, `${prefix}.json`), text);
  console.log(prefix, history.replay.timeline.length, 'history entries,', history.items.length, 'Library items');
}
