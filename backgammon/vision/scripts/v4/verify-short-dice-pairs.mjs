/** Replay short dice location candidates and check the source-reviewed controls. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { artifactDir, replayDir } from '../project_paths.mjs';
import { rowsFrom } from '../v2/solve_games.mjs';
import { refineIncompletePair, shortDicePairs } from './short-dice-pairs.mjs';

const [stateDir, observationsDir, output] = process.argv.slice(2);
assert(stateDir && observationsDir && output, 'Supply the locator state, observation and output paths.');
const read = file => JSON.parse(fs.readFileSync(file));
const controls = read(new URL('./reviewed-brief-pairs.json', import.meta.url));
const close = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= 13;
const games = [];

for (let game = 1; game <= 5; game++) {
  const recording = read(path.join(artifactDir, 'v2', `game-${game}-analysis.json`));
  const name = `game-0${game}`;
  const reference = read(path.join(replayDir, name + '-game.json'));
  const observations = read(path.join(observationsDir, name + '-observations.json'));
  const states = recording.segments.flatMap(segment => rowsFrom(path.join(stateDir, segment.source.replace(/\.mp4$/, '.jsonl.gz')))
    .slice(segment.firstFrame, segment.lastExclusive).map(entry => entry.state));
  assert.equal(states.length, reference.frames);
  const pairs = shortDicePairs(states, observations.breaks);
  const terminal = reference.ending?.frame ?? reference.frames;

  const reviewed = controls.filter(control => control.game === game).map(control => {
    const pair = pairs.find(pair => pair.start <= control.frame && pair.end >= control.frame &&
      control.centers.every(center => pair.centers.some(observed => close(center, observed))));
    assert(pair, `Missing the two source-reviewed locations at game ${game} frame ${control.frame}.`);
    const previous = observations.pairs.find(observation => observation.start <= control.frame &&
      observation.end >= control.frame && observation.player === pair.player &&
      observation.centers.some(center => pair.centers.some(earlier => close(center, earlier))));
    const corrected = previous && refineIncompletePair(previous, pairs);
    const changed = Boolean(corrected?.shortPairEvidence);
    if (control.replacesChecker) assert(changed, `A checker still occupied one die location at frame ${control.frame}.`);
    return { ...control, jointlyObserved: pair.jointlyObserved, priorPair: previous?.centers ?? null, correctedPair: changed };
  });
  const overlap = pair => reference.presentation.rolls.some(roll => roll.player === pair.player && roll.start < pair.end &&
    roll.end > pair.start);
  const inGame = pairs.filter(pair => pair.start < terminal);
  const after = pairs.filter(pair => pair.start >= terminal);
  const aligned = inGame.filter(overlap).length;
  games.push({ game, reviewed, total: pairs.length, aligned, afterGame: after.map(({ start, end }) => ({ start, end })),
    unaligned: inGame.filter(pair => !overlap(pair)).map(({ start, end, centers }) => ({ start, end, centers })) });
  console.log(game, `${aligned}/${inGame.length} overlap scored-game rolls, ${after.length} after play ended, ${reviewed.length} reviewed pairs`);
}
fs.writeFileSync(output, JSON.stringify(games) + '\n');
