/** Compare pooled dice predictions with and without known legal board endpoints. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { boardKey, legalTurns } from '../../../core/rules.mjs';
import { stateFor } from '../v2/solve_games.mjs';
import { chooseLegalDice } from './legal-face-evidence.mjs';

const [reference, input, output] = process.argv.slice(2);
if (!output) throw new Error('Supply the reference replay, sampled evidence and benchmark output.');
const read = filename => JSON.parse(fs.readFileSync(filename));
const controls = read(new URL('./settled-face-controls.json', import.meta.url));
const odds = read(input);
const faces = [1, 2, 3, 4, 5, 6];
const choices = faces.flatMap(high => faces.slice(0, high).map(low => [high, low]));
const pairKey = dice => dice?.join(',');
const tests = [];
for (const [game, cases] of Object.entries(controls)) {
  const replay = read(path.join(reference, `game-0${game}-game.json`));
  for (const { starts: [seconds], expected } of cases) {
    const frame = Math.round(seconds * 25);
    const roll = replay.presentation.rolls.find(entry => entry.start === frame);
    const { before, after } = replay.turns[roll.decision - 1];
    const player = Number(roll.player === 'dark');
    assert.deepEqual(roll.dice, expected);
    const final = boardKey(stateFor(after, player, expected));
    const admissible = choices.filter(dice => legalTurns(stateFor(before, player, dice))
      .some(turn => turn.key === final));
    assert(admissible.length > 1 && admissible.some(dice => pairKey(dice) === pairKey(expected)));
    const observed = odds[game][frame];
    const baseline = observed.odds.map(row => faces.reduce((best, face) => row[face] > row[best] ? face : best))
      .sort((a, b) => b - a);
    const verdict = chooseLegalDice(admissible, observed);
    assert.equal(chooseLegalDice(admissible, { ...observed, frames: observed.frames.slice(0, 3) }), null);
    tests.push({ game: Number(game), frame, expected, baseline, verdict, frames: observed.frames.length });
  }
}
const matches = (a, b) => pairKey(a) === pairKey(b);
const summary = {
  controls: tests.length,
  baselineCorrect: tests.filter(test => matches(test.baseline, test.expected)).length,
  correct: tests.filter(test => matches(test.verdict, test.expected)).length,
  wrong: tests.filter(test => test.verdict && !matches(test.verdict, test.expected)).length,
  abstained: tests.filter(test => !test.verdict).length,
};
assert(summary.correct >= 3 && summary.wrong === 0 && summary.abstained > 0);
fs.writeFileSync(output, JSON.stringify({ summary, tests }, null, 2) + '\n');
console.log(summary);
