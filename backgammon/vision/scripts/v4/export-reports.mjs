/** Compare the reconstructed timeline with observations and flag spots for review. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { artifactDir, replayDir } from "../project_paths.mjs";
import { rowsFrom, stateFor } from "../v2/solve_games.mjs";
import { observedBoard } from "./bearoff-board.mjs";
import { boardKey, legalTurns } from "../../../core/rules.mjs";

const read = file => JSON.parse(fs.readFileSync(file));
const rawDir = path.join(artifactDir, "v2");
const referenceDir = process.env.OFFICE3_REPORT_REFERENCE ?? path.join(artifactDir, "v10");
const output = process.argv[2];
if (!output) throw new Error("Supply the Backgammon Vision directory.");
const reportDir = path.join(output, "reports");
fs.mkdirSync(reportDir, { recursive: true });
const validationPath = path.join(artifactDir, "calibration", "validation.json");
const validation = fs.existsSync(validationPath) ? read(validationPath) : null;
const spotPath = path.join(artifactDir, "calibration", "spot-validation.json");
const modelSpots = fs.existsSync(spotPath) ? read(spotPath) : [];

const issueNames = {
  "repeated-player": "Consecutive rolls assigned to the same player",
  "no-pickup": "Dice pickup not confirmed",
  "unknown-face": "Unresolved dice face",
  "no-position": "Starting checker position unavailable",
  "unconfirmed-play": "Played checker move not confirmed",
  "illegal-play": "Confirmed result is illegal for the displayed roll",
  "dice-disagreement": "Settled dice evidence disagreed with the earlier replay",
  "overlapping-rolls": "Roll intervals overlap",
  "unindexed-pair": "Stationary dice outside a reconstructed roll",
};
const reviewed = {
  3: [{ frame: 27100, text: "Black’s 4–3 remains on the table through occlusions. A sixth checker on White’s first point was detected twice. White has two checkers off." },
      { frame: 31300, text: "Earlier clear frames establish Black’s checker on point 7. White’s 6–1 bears off two checkers, taking White from three off to five off." }],
  4: [{ frame: 2450, text: "Black’s visible roll is 6–4. The earlier replay showed 3–1 and attributed a checker error. The corrected replay removes that charge because the completed move remains unverified." }],
};

function modelChecks(game) {
  if (!validation) return null;
  return Object.fromEntries(Object.entries(validation).map(([kind, result]) => {
    const held = result.tests.filter(test => test.game === game);
    const errors = field => held.filter(test => test[field] !== test.expected).length;
    return [kind, {
      reviewed: result.reviewed,
      training: result.training,
      unreadable: result.unreadable,
      heldOut: result.heldOut,
      baselineCorrect: result.baselineCorrect,
      candidateCorrect: result.candidateCorrect,
      gameHeldOut: held.length,
      gameBaselineErrors: errors("baseline"),
      gameCandidateErrors: errors("candidate"),
    }];
  }));
}

function unindexedPairs(raw, data) {
  const pairs = [];
  const terminal = data.ending?.frame ?? data.result?.frame ?? raw.length;
  const first = data.rolls[0]?.start;
  if (first === undefined) return pairs;
  let index = 0, candidate;
  const close = (a, b) => Math.hypot(a.center[0] - b.center[0], a.center[1] - b.center[1]) <= 13;
  for (let frame = first; frame < terminal; frame++) {
    while (data.rolls[index]?.end <= frame) index++;
    const previous = data.rolls[index - 1], next = data.rolls[index];
    const offer = data.cubeOffer;
    const withinRoll = next?.start <= frame || (previous && frame - previous.end < 10) ||
      (next && next.start - frame < 10);
    const withinOffer = offer && frame >= offer.start && frame < (offer.responseFrame ?? terminal);
    if (withinRoll || withinOffer) {
      candidate = null;
      continue;
    }
    const dice = raw[frame]?.dice?.filter(die => die.value && die.locationScore >= .25 && die.score >= .75) ?? [];
    if (dice.length !== 2) continue;
    dice.sort((a, b) => a.center[0] - b.center[0]);
    if (candidate && frame - candidate.last <= 9 &&
        dice.every((die, i) => die.value === candidate.dice[i].value && close(die, candidate.dice[i]))) {
      candidate.last = frame;
      candidate.votes++;
    } else candidate = { frame, last: frame, dice, votes: 1, window: index };
    if (candidate.votes === 8) {
      const prior = pairs.at(-1);
      if (prior?.window === index && frame - prior.last <= 55 &&
          dice.every((die, i) => die.value === prior.dice[i].value && close(die, prior.dice[i]))) {
        prior.last = frame;
        pairs[pairs.length - 1] = candidate = { ...candidate, frame: prior.frame, votes: prior.votes + candidate.votes };
      } else pairs.push(candidate);
    }
  }
  return pairs;
}

function repeatedPlayer(roll, next, sources) {
  return next?.player === roll.player && !sources.some(source => source.discontinuity &&
    source.firstGameFrame > roll.start && source.firstGameFrame <= next.start);
}

function referenceFor(prefix, sources) {
  const file = path.join(referenceDir, prefix + "-game.json");
  if (!fs.existsSync(file)) return null;
  const { presentation, decisions } = read(file);
  const rolls = presentation.rolls;
  return {
    completeRolls: rolls.filter(roll => roll.dice.every(Number.isInteger)).length,
    missingFaces: rolls.flatMap(roll => roll.dice).filter(face => face === null).length,
    repeatedPlayers: rolls.filter((roll, i) => repeatedPlayer(roll, rolls[i + 1], sources)).length,
    gradedPlays: Object.values(decisions).filter(decision => decision.player && decision.countedInGameLoss).length,
  };
}

function report(number) {
  const prefix = `game-0${number}`;
  const data = read(path.join(output, "state", prefix + ".json"));
  const replay = read(path.join(replayDir, prefix + "-game.json"));
  const recording = read(path.join(rawDir, `game-${number}-analysis.json`));
  const raw = recording.segments.flatMap(segment =>
    rowsFrom(path.join(rawDir, "state", segment.source.replace(/\.mp4$/, ".jsonl.gz")))
      .slice(segment.firstFrame, segment.lastExclusive).map(row => row.state));
  assert.equal(raw.length, data.frames);
  const counts = { frames: raw.length, boardObserved: 0, boardReconciled: 0,
    coverFrames: 0, rollFrames: 0, diceRead: [0, 0, 0], diceConflictFrames: 0,
    rolls: data.rolls.length, completeRolls: 0, missingFaces: 0, bothFacesMissing: 0,
    availableDecisions: 0, fans: 0, gradedPlays: 0, legalPlays: 0, observedPickups: 0,
    sourceCuts: data.sources.filter(source => source.discontinuity).length };
  for (const reading of raw) {
    if (reading?.handRegions?.length) counts.coverFrames++;
    if (reading?.position) counts.boardObserved++;
    else if (observedBoard(reading)) counts.boardReconciled++;
  }
  const issues = [];
  const add = (kind, roll, frame = roll.start, detail = "") =>
    issues.push({ kind, frame, player: roll.player, detail });
  for (const [index, roll] of data.rolls.entries()) {
    const next = data.rolls[index + 1];
    const dice = roll.dice.filter(Number.isInteger);
    const missing = 2 - dice.length;
    const confirmed = roll.before && roll.after && data.decisions[roll.decision]?.played;
    counts.missingFaces += missing;
    if (!missing) counts.completeRolls++;
    else {
      if (missing === 2) counts.bothFacesMissing++;
      add("unknown-face", roll, roll.start, missing === 2 ? "Both faces are unknown." : "One face is unknown.");
    }
    if (roll.decision) counts.availableDecisions++;
    if (roll.fan) counts.fans++;
    if (!roll.before) add("no-position", roll);
    if (roll.decision && !confirmed) add("unconfirmed-play", roll);
    if (confirmed) {
      const snapshot = board => ({ ...board, points: board.points.map(value => [Math.max(value, 0), Math.max(-value, 0)]) });
      const player = Number(roll.player === "dark");
      const from = stateFor(snapshot(roll.before), player, dice);
      const final = stateFor(snapshot(roll.after), player, dice);
      const legal = legalTurns(from).some(turn => boardKey(turn.state) === boardKey(final));
      counts.gradedPlays++;
      if (legal) counts.legalPlays++;
      else add("illegal-play", roll, roll.resultFrame ?? roll.start);
    }
    if (roll.pickup !== null) counts.observedPickups++;
    else if (next && !data.sources.some(source => source.discontinuity &&
      source.firstGameFrame >= roll.end && source.firstGameFrame <= next.start)) {
      add("no-pickup", roll, roll.end - 1);
    }
    if (next?.start < roll.end) add("overlapping-rolls", next);
    if (repeatedPlayer(roll, next, data.sources)) add("repeated-player", next);
    for (let f = roll.start; f < roll.end; f++) {
      const detected = raw[f]?.dice?.filter(die => die.value && die.locationScore >= .25) ?? [];
      counts.rollFrames++;
      counts.diceRead[Math.min(2, detected.length)]++;
      if (!missing && detected.length === 2 &&
          detected.map(die => die.value).sort().join() !== [...dice].sort().join()) {
        counts.diceConflictFrames++;
      }
    }
  }
  for (const entry of replay.contextRecovery ?? []) {
    if (entry.kind !== "settled-dice") continue;
    const roll = data.rolls.find(item => item.start === entry.frame);
    if (roll) add("dice-disagreement", roll, entry.frame,
      `Earlier replay ${entry.before?.map(face => face ?? "?").join("–") ?? "unknown"}. Current replay ${roll.dice.join("–")}.`);
  }
  for (const entry of unindexedPairs(raw, data)) {
    add("unindexed-pair", { player: null }, entry.frame,
      `The detector read ${entry.dice.map(die => die.value).sort((a, b) => b - a).join("–")} at fixed locations in ${entry.votes} frames. Check the roll and pickup in the footage.`);
  }
  assert.equal(counts.diceRead.reduce((a, b) => a + b, 0), counts.rollFrames);
  assert(counts.completeRolls <= counts.rolls && counts.legalPlays <= counts.gradedPlays);
  assert(issues.every(issue => issue.frame >= 0 && issue.frame < data.frames));
  issues.sort((a, b) => a.frame - b.frame);
  const footageReview = [...(reviewed[number] ?? []), ...(replay.contextRecovery ?? [])
    .filter(entry => entry.text).map(({ frame, text }) => ({ frame, text }))].sort((a, b) => a.frame - b.frame);
  const report = { game: number, fps: data.fps, counts, issues, issueNames, reviewed: footageReview,
    confirmedPriorMisreads: number === 4 ? 1 : 0, modelChecks: modelChecks(number),
    reference: referenceFor(prefix, data.sources), modelSpots: modelSpots.filter(spot => spot.game === number) };
  fs.writeFileSync(path.join(reportDir, prefix + ".json"), JSON.stringify(report) + "\n");
  console.log(prefix, counts, Object.fromEntries(Object.keys(issueNames).map(kind =>
    [kind, issues.filter(issue => issue.kind === kind).length])));
}

for (let number = 1; number <= 5; number++) report(number);
