/** Apply source-reviewed throws, handoffs and stationary-dice continuity. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { artifactDir, replayDir } from '../project_paths.mjs';
import { rowsFrom, stateFor } from '../v2/solve_games.mjs';
import { boardKey, legalTurns, notation } from '../../../core/rules.mjs';
import { toXGID } from '../../../core/xgid.mjs';
import { observedBoard } from './bearoff-board.mjs';
import { applyAccounting, writeReplay } from './accounting.mjs';
import { rollCubePositions, scoreRollCubes } from './cube-rolls.mjs';

const source = process.argv[2];
if (!source) throw new Error('Supply the scored input replay directory.');
const notes = JSON.parse(fs.readFileSync(new URL('./reviewed-turn-order.json', import.meta.url)));
const read = (dir, name) => JSON.parse(fs.readFileSync(path.join(dir, name)));
const frames = seconds => Math.round(seconds * 25);
const idOf = roll => roll.decision ?? roll.sourceTurns[0];
const keyOf = pos => pos && boardKey({
  points: pos.points.map(([white, dark]) => white - dark), bar: pos.bar, off: pos.borneOff,
});
const playable = dice => dice.every(Number.isInteger);
const combinations = Array.from({ length: 6 }, (_, low) =>
  Array.from({ length: 6 - low }, (_, high) => [low + 1, low + high + 1])).flat();

function snapshot(boards, start, stop) {
  const byKey = new Map();
  for (let frame = Math.max(0, start); frame < stop; frame++) {
    const position = boards[frame];
    if (!position) continue;
    const key = keyOf(position);
    const hits = byKey.get(key) ?? [];
    hits.push(frame);
    byKey.set(key, hits);
  }
  const ranked = [...byKey.values()].sort((a, b) => b.length - a.length);
  const [main, alternative] = ranked;
  if (!main || main.length < 6 || (alternative && main.length < 2 * alternative.length)) return null;
  return { frame: main[0], position: boards[main[0]] };
}

function legalAnalysis(before, after, player, evidence) {
  if (!before) return null;
  const physical = [...evidence].reverse();
  const known = evidence.filter(Number.isInteger);
  const choices = playable(physical) ? [physical] : combinations.filter(roll =>
    known.every((value, index) => roll.filter(face => face === value).length >= known.slice(0, index+1).filter(face => face === value).length));
  const checked = choices.map(dice => {
    const state = stateFor(before, player, dice);
    const actions = legalTurns(state);
    return { state, actions, played: after && actions.find(action => action.key === keyOf(after)) };
  });
  const confirmed = checked.filter(entry => entry.played);
  if (confirmed.length === 1) return confirmed[0];
  if (playable(physical)) return { ...checked[0], played: null };
  return null;
}

function bind(row, roll, id, turn) {
  assert(row.phase !== 'game-closed' && !row.cube?.offered);
  row.player = roll.player;
  row.turn = id;
  row.decision = roll.decision;
  row.roll = { id, player: roll.player, status: 'current', dice: turn.dice, evidence: turn.evidence };
  row.phase = turn.resultFrame !== null && row.frame >= turn.resultFrame ? 'played' : 'move';
  delete row.displayPoints;
}

function retire(rows, game, ids) {
  const removed = new Set(ids);
  for (const id of ids) {
    assert(!game.decisions[id]?.countedInGameLoss, `Cannot discard scored decision ${id}.`);
    delete game.decisions[id];
  }
  for (const row of rows) {
    if (!removed.has(row.turn) && !removed.has(row.roll?.id)) continue;
    row.roll = null;
    if (row.phase === 'game-closed' || row.cube?.offered) continue;
    row.turn = row.player = row.decision = null;
    row.phase = 'between-rolls';
    delete row.displayPoints;
  }
}

function joined(game, rows, selection, note) {
  const keep = selection.find(roll => roll.start === frames(note.keep));
  assert(keep);
  const offset = selection[0].start;
  const tail = selection.at(-1);
  const id = idOf(keep);
  const turn = game.turns[id - 1];
  const choice = game.decisions[id];
  const end = note.end ? frames(note.end) : tail.end;
  const retired = selection.flatMap(roll => roll.sourceTurns).filter(other => other !== id);
  const display = rows.slice(offset, end).map(row => row.turn === id ? row.displayPoints : null);
  retire(rows, game, retired);
  const roll = { ...keep, start: offset, end, pickup: tail.pickup,
    sourceTurns: [id, ...retired], evidence: 'reviewed-stationary-roll' };
  turn.start = Math.min(offset, turn.start);
  turn.end = Math.max(end - 1, turn.end);
  turn.pickupFrame = roll.pickup;
  if (choice) {
    choice.startFrame = turn.start;
    choice.startSeconds = turn.start / 25;
    choice.endFrame = turn.end;
    choice.endSeconds = turn.end / 25;
  }
  for (const row of rows.slice(offset, end)) {
    bind(row, roll, id, turn);
    const counts = display[row.frame - offset];
    if (counts) row.displayPoints = counts;
  }
  return roll;
}

function observed(game, rows, boards, note, prior, start, end, afterLimit, nextPosition) {
  const player = Number(note.player === 'dark');
  const initial = snapshot(boards, start - 26, start + 7);
  const following = snapshot(boards, end - 9, Math.min(afterLimit + 1, end + 24));
  const before = initial?.position ?? null;
  const after = following?.position ?? null;
  const pass = note.fan && before?.bar[player] > 0 && keyOf(before) === keyOf(after);
  const analysis = legalAnalysis(before, before && after && (pass || keyOf(before) !== keyOf(after)) ? after : null,
    player, note.dice);
  const played = analysis?.played;
  const finish = played ? Math.min(afterLimit, Math.max(following.frame, end)) : null;
  const dice = analysis ? [...analysis.state.dice] : [...note.dice].reverse();
  const evidence = played ? 'reviewed-roll-and-legal-result' : 'reviewed-physical-roll';
  const id = game.turns.length + 1;
  const turn = {
    start, end: Math.max(end - 1, finish ?? 0), pickupFrame: note.pickupFrame, player: note.player, dice,
    before, after: played ? after : null, resultFrame: finish, steps: played?.steps ?? null, evidence,
  };
  game.turns.push(turn);
  const roll = { start, end, pickup: note.pickupFrame, player: note.player, dice: [...dice].reverse(),
    decision: analysis ? id : null, sourceTurns: [id], evidence, ...(note.fan ? { fan: true } : {}) };
  if (analysis) {
    const { state, actions } = analysis;
    game.decisions[id] = {
      player: note.player, dice, evidence, xgid: toXGID(state), startFrame: start, endFrame: turn.end,
      startSeconds: start / 25, endSeconds: turn.end / 25, observedResultFrame: finish, legalCandidates: actions.length,
      actions: actions.map(action => ({ key: action.key, notation: notation(action.steps, player), steps: action.steps,
        xgid: toXGID({ ...action.state, phase: 'roll', dice: [] }, { engine: true }), isPlayed: action.key === played?.key })),
    };
  }
  const oldBoard = nextPosition;
  if (before) game.positions[nextPosition++] = { ...before, onRoll: note.player, observedFrame: initial.frame, source: evidence, equities: null };
  const newBoard = nextPosition;
  if (played) game.positions[nextPosition++] = { ...after, onRoll: note.player === 'dark' ? 'white' : 'dark',
    observedFrame: following.frame, source: evidence, equities: null };
  for (const row of rows.slice(start, Math.max(end, (finish ?? -1) + 1))) {
    const existing = game.decisions[row.decision];
    const lateWitness = prior && prior.player !== roll.player && prior.sourceTurns.includes(row.decision) &&
      Number.isInteger(prior.pickup) && prior.pickup <= start && existing?.observedResultFrame <= start + 12;
    assert(!existing?.countedInGameLoss || existing.observedResultFrame < start || lateWitness,
      `Overlap with a pending scored move at ${row.frame}.`);
    bind(row, roll, id, turn);
    if (before) row.position = finish !== null && row.frame >= finish ? newBoard : oldBoard;
  }
  return { roll, nextPosition };
}

async function recover(game, rows, recording) {
  const changes = game.contextRecovery ??= [];
  const rolls = game.presentation.rolls;
  const rawDir = path.join(artifactDir, 'v2', 'state');
  const boards = recording.segments.flatMap(segment => rowsFrom(path.join(rawDir, segment.source.replace(/\.mp4$/, '.jsonl.gz')))
    .slice(segment.firstFrame, segment.lastExclusive).map(({ state }) => observedBoard(state)));
  const breaks = recording.segments.filter(segment => segment.discontinuity).map(segment => segment.firstGameFrame);
  const offer = game.decisions.cube;
  const boundaries = [...breaks, ...(offer ? [offer.startFrame, offer.endFrame] : []), game.ending?.frame ?? rows.length];
  let nextPosition = Math.max(...Object.keys(game.positions).map(Number)) + 1;
  for (const note of notes[game.game]) {
    const starts = note.starts?.map(frames) ?? [];
    const index = starts.length ? rolls.findIndex(roll => roll.start === starts[0]) :
      rolls.findIndex(roll => roll.start > frames(note.start));
    assert(index >= 0, JSON.stringify(note));
    const selection = rolls.slice(index, index + starts.length);
    assert.deepEqual(selection.map(roll => roll.start), starts);
    const end = note.pickup ? frames(note.pickup) : note.end ? frames(note.end) : selection.at(-1).end;
    const start = note.start ? frames(note.start) : selection[0].start;
    const next = rolls[index + selection.length];
    assert(start < end && end <= (next?.start ?? rows.length));
    assert(!boundaries.some(frame => frame > start && frame < end), JSON.stringify(note));
    if (note.kind === 'join') {
      const first = joined(game, rows, selection, note);
      rolls.splice(index, selection.length, first);
    } else {
      const prior = rolls[index - 1];
      const pickupFrame = note.pickup ? end : selection.at(-1).pickup;
      if (note.previousPickup) {
        assert(prior?.end > start && frames(note.previousPickup) <= start);
        prior.end = prior.pickup = frames(note.previousPickup);
        assert(prior.start < prior.end);
      }
      assert(!prior || prior.end <= start);
      retire(rows, game, selection.flatMap(roll => roll.sourceTurns));
      const replacement = observed(game, rows, boards, { ...note, pickupFrame }, prior, start, end,
        (next?.start ?? rows.length) - 1, nextPosition);
      nextPosition = replacement.nextPosition;
      rolls.splice(index, selection.length, replacement.roll);
    }
    const result = rolls[index];
    changes.push({ kind: 'reviewed-turn-order', frame: result.start, end: result.end, text: note.text });
    console.log(game.game, start / 25, note.kind, result.player, result.dice, 'before/after',
      game.turns[idOf(result)-1].before?.bar, game.turns[idOf(result)-1].after?.bar);
  }
  const known = new Map(game.presentation.cubeRolls.map(item => [item.xgid, item]));
  const choices = rollCubePositions(game, rows, rolls, breaks);
  for (const choice of await scoreRollCubes(choices.filter(item => !known.has(item.xgid)))) known.set(choice.xgid, choice);
  game.presentation.cubeRolls = choices.map(choice => {
    const { options, outcomeProbabilities, evLoss } = known.get(choice.xgid);
    return { ...choice, options, outcomeProbabilities, evLoss };
  });
}

fs.mkdirSync(replayDir, { recursive: true });
for (const number of [1, 2, 3, 4, 5]) {
  const prefix = `game-0${number}`;
  const game = read(source, prefix + '-game.json');
  const rows = rowsFrom(path.join(source, prefix + '-state.jsonl.gz'));
  if (notes[number]) await recover(game, rows, read(path.join(artifactDir, 'v2'), `game-${number}-analysis.json`));
  applyAccounting(game, rows);
  writeReplay(prefix, game, rows);
}
