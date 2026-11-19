/** Compare automatic reconstructions against the same reviewed replay. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const [referenceDir, currentDir, candidateDir, output] = process.argv.slice(2);
assert(referenceDir && currentDir && candidateDir && output,
  'Supply the reviewed replay, both plan directories, and the output JSON path.');

const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const board = position => position ? JSON.stringify([position.points, position.bar, position.borneOff]) : null;
const faces = (values = []) => (values ?? []).filter(Number.isInteger).sort((a, b) => b - a);
const sameFaces = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);

function align(reference, plan) {
  // Match in temporal order. A split detection can match its source roll
  // only once. Dice values and roller identity are excluded from alignment.
  const choices = Array.from({ length: reference.length + 1 }, () =>
    Array.from({ length: plan.length + 1 }, () => ({ score: 0, pairs: [] })));
  for (const [i, expected] of reference.entries()) {
    for (const [j, estimated] of plan.entries()) {
      const startDiff = Math.abs(expected.start - estimated.start);
      const overlap = Math.min(expected.end, estimated.end + 1) - Math.max(expected.start, estimated.start);
      const span = Math.max(expected.end, estimated.end + 1) - Math.min(expected.start, estimated.start);
      const prior = choices[i][j];
      const bestSkip = choices[i][j + 1].score >= choices[i + 1][j].score ?
        choices[i][j + 1] : choices[i + 1][j];
      const score = startDiff <= 24 || overlap >= 12 ?
        prior.score + 1 + Math.max(0, overlap) / span + 1 / (startDiff + 1) : 0;
      choices[i + 1][j + 1] = score > bestSkip.score ?
        { score, pairs: [...prior.pairs, [i, j]] } : bestSkip;
    }
  }
  return choices.at(-1).at(-1).pairs;
}

function compare(game, plan) {
  const reference = game.presentation.rolls;
  const matched = align(reference, plan);
  const byReference = new Map(matched);
  const used = new Set(byReference.values());
  const counts = {
    reference: reference.length, automatic: plan.length, matched: matched.length,
    correctDice: 0, unknownDice: 0, wrongDice: 0, actorMismatches: 0, correctBefore: 0, correctAfter: 0,
  };
  const rolls = reference.map((roll, index) => {
    const automatic = plan[byReference.get(index)];
    const turn = game.turns[(roll.decision ?? roll.sourceTurns[0]) - 1];
    const expected = faces(roll.dice);
    const claimed = faces(automatic?.dice);
    let agreement = 'unmatched';
    if (automatic) {
      if (automatic.player !== roll.player) counts.actorMismatches++;
      if (turn.before && board(automatic.before) === board(turn.before)) counts.correctBefore++;
      if (turn.after && board(automatic.after) === board(turn.after)) counts.correctAfter++;
      if (expected.length === 2) {
        agreement = sameFaces(claimed, expected) ? 'correct' :
          claimed.length === 2 || claimed.some(face => !expected.includes(face)) ? 'wrong' : 'unknown';
        counts[agreement + 'Dice']++;
      } else agreement = 'reference-incomplete';
    }
    return { frame: roll.start, player: roll.player, expected, claimed, agreement,
      automaticFrame: automatic?.start ?? null, automaticPlayer: automatic?.player ?? null,
      ...(automatic?.footprint ? { footprint: { ...automatic.footprint, reviewedPickup: roll.pickup ?? null,
        resultFrame: automatic.resultFrame } } : {}),
      ...(automatic?.evidence === 'continuous-dice-poses' || automatic?.evidence === 'continuous-dice-poses-and-legal-result' ? {
        poseContinuity: { lastSeen: automatic.poseLastSeen ?? automatic.end, resultFrame: automatic.resultFrame,
          repositionedAt: automatic.relocatedAt ?? null, reviewedPickup: roll.pickup ?? null },
      } : {}) };
  });
  const unmatched = plan.filter((_, index) => !used.has(index))
    .map(({ start, end, player, dice }) => ({ start, end, player, dice }));
  return { counts, rolls, unmatched };
}

const games = Array.from({ length: 5 }, (_, index) => {
  const number = index + 1;
  const prefix = 'game-0' + number;
  const game = read(path.join(referenceDir, prefix + '-game.json'));
  const current = compare(game, read(path.join(currentDir, prefix + '-plan.json')));
  const candidate = compare(game, read(path.join(candidateDir, prefix + '-plan.json')));
  console.log(JSON.stringify({ game: number, current: current.counts, candidate: candidate.counts }));
  return { game: number, current, candidate };
});
fs.writeFileSync(output, JSON.stringify(games) + '\n');
