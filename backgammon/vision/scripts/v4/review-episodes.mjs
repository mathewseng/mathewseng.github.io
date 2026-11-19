/** Reapply frame-reviewed episode boundaries, checking them against neighboring game state. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { replayDir } from '../project_paths.mjs';
import { rowsFrom, stateFor } from '../v2/solve_games.mjs';
import { boardKey, legalTurns } from '../../../core/rules.mjs';
import { applyAccounting, writeReplay } from './accounting.mjs';

const source = process.argv[2];
if (!source) throw new Error('Supply the scored source replay directory.');
const corrections = JSON.parse(fs.readFileSync(new URL('./reviewed_episodes.json', import.meta.url)));
fs.mkdirSync(replayDir, { recursive: true });
const sides = ['white', 'dark'];
const board = record => record && boardKey({
  points: record.points.map(([white, dark]) => white - dark), bar: record.bar, off: record.borneOff,
});

function recoverEpisodes(game, rows) {
  const rolls = game.presentation.rolls;
  const changes = game.contextRecovery ??= [];
  for (const note of corrections[game.game] ?? []) {
    if (note.kind === 'join') {
      const index = rolls.findIndex(roll => roll.start === note.start);
      const first = rolls[index], continuation = rolls[index + 1];
      assert.equal(continuation?.start, note.continuation);
      assert(first.player === continuation.player && first.pickup === null);
      assert(!continuation.decision && continuation.sourceTurns.every(id => !game.decisions[id]?.countedInGameLoss));
      rolls.splice(index + 1, 1);
      first.end = continuation.end;
      const cube = game.presentation.cubeRolls.find(entry => entry.frame === first.start);
      if (cube) cube.end = first.end;
      first.pickup = continuation.pickup;
      first.sourceTurns = [...first.sourceTurns, ...continuation.sourceTurns];
      changes.push({ kind: 'reviewed-continuous-roll', frame: first.start, end: first.end, text: note.text });
      continue;
    }

    const index = rolls.findIndex(roll => roll.start === note.next);
    const prior = rolls[index - 1], next = rolls[index];
    assert(prior && next && prior.player === next.player && prior.player !== note.player);
    assert(prior.end <= note.start && note.start < note.end && note.end <= next.start);
    const startPosition = game.positions[rows[note.start].position];
    const nextPosition = game.turns[(next.decision ?? next.sourceTurns[0]) - 1].before;
    const sameBoard = board(startPosition) && board(startPosition) === board(nextPosition);
    assert(sameBoard, 'A reviewed fan must preserve the board at the next roll.');
    const side = sides.indexOf(note.player);
    const closed = value => startPosition.points[side === 1 ? value - 1 : 24 - value][1 - side] >= 2;
    assert(startPosition.bar[side] > 0 && note.dice.filter(Boolean).every(closed));
    const dice = [...note.dice].reverse();
    const verified = dice.every(Boolean) &&
      legalTurns(stateFor(startPosition, side, dice)).every(turn => !turn.steps.length);
    const before = { points: startPosition.points, bar: startPosition.bar, borneOff: startPosition.borneOff };
    const id = game.turns.length + 1;
    const evidence = verified ? 'reviewed-blocked-entry' : 'reviewed-roll-with-unreadable-face';
    game.turns.push({
      start: note.start, end: note.end - 1, pickupFrame: note.end, before,
      after: verified ? before : null, resultFrame: verified ? note.end : null,
      player: note.player, dice, evidence, steps: verified ? [] : null,
    });
    rolls.splice(index, 0, { start: note.start, end: note.end, pickup: note.end, player: note.player,
      dice: note.dice, evidence, decision: null, sourceTurns: [id], fan: true });
    for (const row of rows.slice(note.start, note.end)) {
      assert(!row.decision && row.turn === null);
      row.turn = id;
      row.roll = { id, player: note.player, dice, status: 'current', evidence };
      row.phase = 'move';
      row.player = note.player;
    }
    changes.push({ kind: 'reviewed-fan', frame: note.start, end: note.end, text: note.text });
  }
}

for (const number of [1, 2, 3, 4, 5]) {
  const prefix = `game-0${number}`;
  const game = JSON.parse(fs.readFileSync(path.join(source, prefix + '-game.json')));
  const rows = rowsFrom(path.join(source, prefix + '-state.jsonl.gz'));
  recoverEpisodes(game, rows);
  applyAccounting(game, rows);
  writeReplay(prefix, game, rows);
  console.log(prefix, game.presentation.rolls.length, 'rolls');
}
