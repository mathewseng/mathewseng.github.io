/** Apply source-reviewed throws, handoffs and stationary-dice continuity. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { artifactDir, replayDir } from '../project_paths.mjs';
import { rowsFrom, stateFor } from '../v2/solve_games.mjs';
import { boardKey, initialState, legalPaths, legalTurns, notation } from '../../../core/rules.mjs';
import { toXGID } from '../../../core/xgid.mjs';
import { trackCheckerCounts } from './checker-counts.mjs';
import { observedBoard } from './bearoff-board.mjs';
import { chooseLegalDice } from './legal-face-evidence.mjs';
import { applyAccounting, writeReplay } from './accounting.mjs';
import { rollCubePositions, scoreRollCubes } from './cube-rolls.mjs';

const source = process.argv[2];
if (!source) throw new Error('Supply the scored input replay directory.');
const notesFile = process.argv[3] ?? new URL('./reviewed-turn-order.json', import.meta.url);
const notes = JSON.parse(fs.readFileSync(notesFile));
const faceEvidence = process.argv[4] ? JSON.parse(fs.readFileSync(process.argv[4])) : {};
const footprintTimings = process.argv[5] ? JSON.parse(fs.readFileSync(process.argv[5])) : [];
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

function legalAnalysis(before, after, player, evidence, stationary) {
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
  if (confirmed.length > 1) {
    const best = chooseLegalDice(confirmed.map(entry => entry.state.dice), stationary);
    const match = confirmed.find(entry => best === entry.state.dice);
    return match ? { ...match, faceEvidence: true } : { ambiguous: true };
  }
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

function retire(rows, game, ids, invalidated = []) {
  const removed = new Set(ids);
  for (const id of ids) {
    assert(!game.decisions[id]?.countedInGameLoss || invalidated.includes(id),
      `Cannot discard scored decision ${id} without reviewing its starting position.`);
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

function joined(game, rows, selection, note, offset, end, invalidated) {
  const keep = selection.find(roll => roll.start === frames(note.keep));
  assert(keep);
  const tail = selection.at(-1);
  const id = idOf(keep);
  const turn = game.turns[id - 1];
  const choice = game.decisions[id];
  const before = reviewedBoard(rows, note.beforeBoard, offset - 50, offset);
  const after = reviewedBoard(rows, note.afterBoard, offset, end + 8);
  if (before) assert.equal(keyOf(turn.before), keyOf(before.position));
  if (after) assert.equal(keyOf(turn.after), keyOf(after.position));
  const retired = selection.flatMap(roll => roll.sourceTurns).filter(other => other !== id);
  const display = rows.slice(offset, end).map(row => row.turn === id ? row.displayPoints : null);
  retire(rows, game, retired, invalidated);
  const pickup = note.pickup != null || tail.pickup === end ? end : null;
  const roll = { ...keep, start: offset, end, pickup,
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

function reviewedBoard(rows, witness, lower, upper) {
  if (!witness) return null;
  const frame = frames(witness.seconds);
  assert(frame >= lower && frame <= upper, `Board witness outside the reviewed turn at ${witness.seconds}.`);
  assert.equal(rows[frame].clip, witness.clip);
  assert.equal(rows[frame].sourceFrame, witness.sourceFrame);
  const points = Array.from({ length: 24 }, (_, index) => witness.points[index + 1] ?? 0);
  const { bar, off } = witness;
  initialState({ points, bar, off });
  return { frame, position: {
    points: points.map(value => [Math.max(value, 0), Math.max(-value, 0)]), bar, borneOff: off,
  } };
}

function retime(game, rows, roll, note, prior, start, end) {
  const id = idOf(roll);
  const turn = game.turns[id - 1];
  const decision = game.decisions[id];
  const witness = reviewedBoard(rows, note.afterBoard, start, turn.resultFrame);
  if (witness) {
    const settled = rows[turn.resultFrame];
    assert(decision?.countedInGameLoss && settled.turn === id);
    assert.equal(keyOf(witness.position), keyOf(turn.after));
    assert.equal(keyOf(game.positions[settled.position]), keyOf(turn.after));
    for (const row of rows.slice(witness.frame, turn.resultFrame)) {
      assert.equal(row.turn, id);
      row.phase = 'played';
      row.position = settled.position;
      delete row.displayPoints;
    }
    turn.resultFrame = decision.observedResultFrame = witness.frame;
  }
  if (start < roll.start) {
    const position = rows[start].position;
    assert.equal(keyOf(game.positions[position]), keyOf(turn.before));
    for (const row of rows.slice(start, roll.start)) {
      const priorResult = row.phase === 'played' && prior?.sourceTurns.includes(row.turn) &&
        Number.isInteger(prior.pickup) && prior.pickup <= start;
      assert(!row.turn || row.turn === id || priorResult, `Earlier dice overlap another turn at frame ${row.frame}.`);
      bind(row, roll, id, turn);
      row.position = position;
    }
    turn.start = Math.min(start, turn.start);
    if (decision) {
      decision.startFrame = turn.start;
      decision.startSeconds = turn.start / 25;
    }
  }
  turn.pickupFrame = end;
  return { ...roll, start, end, pickup: end };
}

function observed(game, rows, boards, note, prior, start, end, afterLimit, nextPosition) {
  const player = Number(note.player === 'dark');
  const initial = reviewedBoard(rows, note.beforeBoard, prior ? prior.end - 25 : 0, start + 6)
    ?? snapshot(boards, start - 26, start + 7);
  const following = reviewedBoard(rows, note.afterBoard, start, afterLimit)
    ?? snapshot(boards, end - 9, Math.min(afterLimit + 1, end + 24));
  const before = initial?.position ?? null;
  const after = following?.position ?? null;
  const pass = note.fan && before?.bar[player] > 0 && keyOf(before) === keyOf(after);
  const stationary = note.settledFaces && faceEvidence[game.game]?.[start];
  if (stationary) {
    const [first, stop] = note.settledFaces.frames;
    assert(note.beforeBoard && note.afterBoard, `Settled dice need both board witnesses at ${start / 25}.`);
    assert(first >= start && stop <= end && stationary.frames.every(frame => frame >= first && frame < stop),
      `Settled dice evidence outside its roll at ${start / 25}.`);
  }
  const analysis = legalAnalysis(before, before && after && (pass || keyOf(before) !== keyOf(after)) ? after : null,
    player, note.dice, stationary);
  const recorded = note.playedPath && analysis?.played && legalPaths(analysis.state).find(path =>
    boardKey(path.state) === analysis.played.key && notation(path.steps, player) === note.playedPath);
  if (note.playedPath) assert(recorded, `Reviewed checker steps do not reach the verified result at ${start / 25}.`);
  const played = recorded ? { ...analysis.played, steps: recorded.steps } : analysis?.played;
  const canScore = Boolean(analysis?.state);
  const sourceMismatch = Boolean(note.afterBoard && note.dice.some(Number.isInteger) && before && after &&
    keyOf(before) !== keyOf(after) && !played && !analysis?.ambiguous);
  const verifiedResult = Boolean(played || (analysis?.ambiguous && note.afterBoard) ||
    (sourceMismatch && note.resultAtWitness));
  if (note.resultAtWitness) assert(verifiedResult && note.afterBoard, `Unverified checker result at ${start / 25}.`);
  const finish = verifiedResult ? (note.resultAtWitness ? following.frame : Math.min(afterLimit, Math.max(following.frame, end))) : null;
  const dice = canScore ? [...analysis.state.dice] : [...note.dice].reverse();
  const evidence = analysis?.faceEvidence ? 'settled-dice-and-legal-result' :
    played ? 'reviewed-roll-and-legal-result' :
    verifiedResult ? 'reviewed-roll-with-confirmed-board' : 'reviewed-physical-roll';
  const id = game.turns.length + 1;
  const turn = {
    start, end: Math.max(end - 1, finish ?? 0), pickupFrame: note.pickupFrame, player: note.player, dice,
    before, after: verifiedResult ? after : null, resultFrame: finish, steps: played?.steps ?? null, evidence,
  };
  game.turns.push(turn);
  const roll = { start, end, pickup: note.pickupFrame, player: note.player, dice: [...dice].reverse(),
    decision: canScore ? id : null, sourceTurns: [id], evidence, ...(note.fan ? { fan: true } : {}),
    ...(sourceMismatch ? { sourceMismatch: true } : {}) };
  if (canScore) {
    const { state, actions } = analysis;
    game.decisions[id] = {
      player: note.player, dice, evidence, xgid: toXGID(state), startFrame: start, endFrame: turn.end,
      startSeconds: start / 25, endSeconds: turn.end / 25, observedResultFrame: finish, legalCandidates: actions.length,
      actions: actions.map(action => {
        const isPlayed = action.key === played?.key;
        const steps = isPlayed ? played.steps : action.steps;
        return { key: action.key, notation: notation(steps, player), steps, isPlayed,
          xgid: toXGID({ ...action.state, phase: 'roll', dice: [] }, { engine: true }) };
      }),
    };
  }
  const oldBoard = nextPosition;
  if (before) game.positions[nextPosition++] = { ...before, onRoll: note.player, observedFrame: initial.frame, source: evidence, equities: null };
  const newBoard = nextPosition;
  if (verifiedResult) game.positions[nextPosition++] = { ...after, onRoll: note.player === 'dark' ? 'white' : 'dark',
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
  if (verifiedResult && note.afterBoard) {
    for (const row of rows.slice(finish + 1, afterLimit + 1)) {
      if (row.phase === 'game-closed' || row.cube?.offered ||
          game.positions[row.position]?.observedFrame > following.frame) break;
      row.position = newBoard;
    }
  }
  if (played) trackCheckerCounts(rows, boards, roll, analysis.state, id, recorded ? [recorded] : undefined);
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
  for (const reviewed of notes[game.game]) {
    const starts = reviewed.starts?.map(frames) ?? [];
    const timing = reviewed.useFootprintTiming && footprintTimings.find(entry =>
      entry.game === game.game && entry.previousStart === starts[0] && Number.isInteger(entry.clear));
    if (reviewed.useFootprintTiming) {
      assert(Number.isInteger(timing?.start) && Number.isInteger(timing?.clear) && timing.start < timing.clear,
        `No verified dice timing for game ${game.game} at ${reviewed.starts[0]}.`);
    }
    const note = timing ? { ...reviewed, start: (reviewed.keepStart ? starts[0] : timing.start) / 25,
      pickup: timing.clear / 25 } : reviewed;
    const index = starts.length ? rolls.findIndex(roll => roll.start === starts[0]) :
      rolls.findIndex(roll => roll.start > frames(note.start));
    assert(index >= 0, JSON.stringify(note));
    const selection = rolls.slice(index, index + starts.length);
    assert.deepEqual(selection.map(roll => roll.start), starts);
    if (note.kind === 'confirmed-consecutive') {
      const [previous, next] = selection;
      assert(selection.length === 2 && previous.player === next.player && previous.pickup !== null);
      changes.push({ kind: note.kind, previousFrame: previous.start, frame: next.start, text: note.text });
      continue;
    }
    const end = note.pickup != null ? frames(note.pickup) : note.end != null ? frames(note.end) : selection.at(-1).end;
    const start = note.start != null ? frames(note.start) : selection[0].start;
    const next = rolls[index + selection.length];
    assert(start < end && end <= (next?.start ?? rows.length));
    assert(!boundaries.some(frame => frame > start && frame < end), JSON.stringify(note));
    const invalidated = (note.invalidatedStartingPositions ?? []).map(timestamp => {
      const decision = selection.find(roll => roll.start === frames(timestamp))?.decision;
      assert(game.decisions[decision]?.countedInGameLoss, `No scored decision at ${timestamp} to invalidate.`);
      return decision;
    });
    const prior = rolls[index - 1];
    if (note.previousPickup != null) {
      assert(prior?.end > start && frames(note.previousPickup) <= start);
      prior.end = prior.pickup = frames(note.previousPickup);
      assert(prior.start < prior.end);
      game.turns[idOf(prior) - 1].pickupFrame = prior.pickup;
    }
    assert(!prior || prior.end <= start);
    if (note.kind === 'retime') {
      assert(timing && selection.length === 1 && (note.keepStart === true || start < selection[0].start));
      rolls[index] = retime(game, rows, selection[0], note, prior, start, end);
    } else if (note.kind === 'join') {
      const first = joined(game, rows, selection, note, start, end, invalidated);
      rolls.splice(index, selection.length, first);
    } else {
      const pickupFrame = note.pickup != null ? end : (selection.at(-1)?.pickup === end ? end : null);
      retire(rows, game, selection.flatMap(roll => roll.sourceTurns), invalidated);
      const replacement = observed(game, rows, boards, { ...note, pickupFrame }, prior, start, end,
        (next?.start ?? rows.length) - 1, nextPosition);
      nextPosition = replacement.nextPosition;
      rolls.splice(index, selection.length, replacement.roll);
    }
    const result = rolls[index];
    if (note.supersedesReview) {
      const earlier = changes.findLast(entry => entry.kind === 'reviewed-turn-order' &&
        entry.frame === starts[0] && !entry.superseded);
      assert(earlier, `Missing review to supersede at frame ${starts[0]}.`);
      earlier.superseded = true;
    }
    changes.push({ kind: 'reviewed-turn-order', frame: result.start, end: result.end, text: note.text,
      ...(note.confirmedDetectorMisread ? { confirmedDetectorMisread: true } : {}),
      ...(note.resultAtWitness ? {
        boardWitnesses: [note.beforeBoard, note.afterBoard].filter(Boolean)
          .map(({ seconds, clip, sourceFrame }) => ({ frame: frames(seconds), clip, sourceFrame })),
      } : {}),
      ...(timing ? { previousFrame: starts[0], clear: timing.clear } : {}),
      ...(result.evidence === 'settled-dice-and-legal-result' ?
        { diceFrames: faceEvidence[game.game][result.start].frames } : {}) });
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
