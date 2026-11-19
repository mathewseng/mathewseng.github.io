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
const referenceDir = process.env.OFFICE3_REPORT_REFERENCE ?? path.join(artifactDir, "v22");
const output = process.argv[2];
if (!output) throw new Error("Supply the Backgammon Vision directory.");
const reportDir = path.join(output, "reports");
fs.mkdirSync(reportDir, { recursive: true });
const validationPath = path.join(artifactDir, "calibration", "validation.json");
const validation = fs.existsSync(validationPath) ? read(validationPath) : null;
const spotPath = path.join(artifactDir, "calibration", "spot-validation.json");
const modelSpots = fs.existsSync(spotPath) ? read(spotPath) : [];
const bodyReportPath = path.join(artifactDir, "calibration", "dice-body-validation.json");
const bodyValidation = fs.existsSync(bodyReportPath) ? read(bodyReportPath) : null;
const trackReportPath = path.join(artifactDir, "calibration", "dice-track-validation.json");
const trackValidation = fs.existsSync(trackReportPath) ? read(trackReportPath) : null;
const faceReportPath = path.join(replayDir, "settled-face-validation.json");
const faceValidation = fs.existsSync(faceReportPath) ? read(faceReportPath) : null;
const boardTrialPath = path.join(replayDir, "board-witness-training", "validation.json");
const boardTrial = fs.existsSync(boardTrialPath) ? read(boardTrialPath) : null;
const diceTrialPath = path.join(replayDir, "dice-witness-training", "dice-track-validation.json");
const diceTrial = fs.existsSync(diceTrialPath) ? read(diceTrialPath) : null;
const blendReportPath = path.join(replayDir, "dice-blend-validation.json");
const blendValidation = fs.existsSync(blendReportPath) ? read(blendReportPath) : null;
const followupReportPath = path.join(replayDir, "dice-blend-followup.json");
const followupValidation = fs.existsSync(followupReportPath) ? read(followupReportPath) : null;
const checkerContinuityPath = path.join(replayDir, "board-continuity-training", "validation.json");
const checkerContinuity = fs.existsSync(checkerContinuityPath) ? read(checkerContinuityPath) : null;
const diceContinuityPath = path.join(replayDir, "dice-continuity-training", "dice-track-validation.json");
const diceContinuity = fs.existsSync(diceContinuityPath) ? read(diceContinuityPath) : null;
const footprintReportPath = path.join(replayDir, "dice-footprint-validation.json");
const footprintValidation = fs.existsSync(footprintReportPath) ? read(footprintReportPath) : [];

const issueNames = {
  "repeated-player": "Consecutive rolls assigned to the same player",
  "no-pickup": "Dice pickup not confirmed",
  "unknown-face": "Unresolved dice face",
  "no-position": "Starting checker position unavailable",
  "unconfirmed-play": "Played checker move not confirmed",
  "illegal-play": "Confirmed result is illegal for the displayed roll",
  "observed-move-mismatch": "Observed checker arrangement conflicts with the roll",
  "dice-disagreement": "Settled dice evidence disagreed with the earlier replay",
  "overlapping-rolls": "Roll intervals overlap",
  "unindexed-pair": "Stationary dice outside a reconstructed roll",
};
const reviewed = {
  3: [{ frame: 27100, text: "Black’s 4–3 remains on the table through occlusions. A sixth checker on White’s first point was detected twice. White has two checkers off." },
      { frame: 31300, text: "Earlier clear frames establish Black’s checker on point 7. White’s 6–1 bears off two checkers, taking White from three off to five off." }],
  4: [{ frame: 2450, text: "Black’s visible roll is 6–4. The earlier replay showed 3–1 and attributed a checker error. The corrected replay removes that charge because the completed move remains unverified." }],
  5: [{ frame: 4850, text: "White moves checkers back and forth during the pause after Black’s pickup. The footage shows no settled dice during these demonstration moves. The next verified roll is White’s 6–6 at 5:01." }],
};

function diceBodyEvidence(prefix, rolls) {
  if (!bodyValidation) return null;
  const filename = prefix + "-observations.json";
  const baselinePath = path.join(artifactDir, "calibration", "observations-baseline", filename);
  const trainedPath = path.join(artifactDir, "calibration", "observations-body", filename);
  if (!fs.existsSync(baselinePath) || !fs.existsSync(trainedPath)) return null;
  const { pairs: baseline } = read(baselinePath);
  const { pairs: trained } = read(trainedPath);
  assert.equal(trained.length, baseline.length);
  const changed = trained.flatMap((pair, index) => {
    assert.deepEqual(pair.tracks, baseline[index].tracks);
    if (pair.player === baseline[index].player) return [];
    const mid = Math.floor((pair.start + pair.end) / 2);
    const confirmed = rolls.some(roll => roll.start <= mid && mid < roll.end && roll.player === pair.player &&
      ['reviewed-physical-roll', 'reviewed-roll-and-legal-result'].includes(roll.evidence));
    return [{ frame: pair.start, player: pair.player, confirmed }];
  });
  const { reviewed, heldOut, baselineCorrect, candidateCorrect } = bodyValidation;
  return { reviewed, heldOut, baselineCorrect, candidateCorrect, pairs: trained.length,
    corroboratedPairs: trained.filter(pair => pair.actorEvidence === "dice-body-agreement").length, changed };
}

function diceTrackEvidence(game) {
  if (!trackValidation) return null;
  const { trainingTracks, trainingFrames, summary, tests } = trackValidation;
  return { trainingTracks, trainingFrames, summary, reviewedFaces: tests.spot.filter(item => item.game === game) };
}

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

function missingPickup(roll, next, sources) {
  return roll.pickup === null && next && !sources.some(source => source.discontinuity &&
    source.firstGameFrame >= roll.end && source.firstGameFrame <= next.start);
}

function reviewedTransitions(replay) {
  return new Set((replay.contextRecovery ?? []).filter(item => item.kind === "confirmed-consecutive")
    .map(item => `${item.previousFrame}:${item.frame}`));
}

function transitionKey(roll, next) {
  return `${roll.start}:${next.start}`;
}

function referenceFor(prefix, sources) {
  const file = path.join(referenceDir, prefix + "-game.json");
  if (!fs.existsSync(file)) return null;
  const replay = read(file);
  const { presentation, decisions } = replay;
  const reviewed = reviewedTransitions(replay);
  const rolls = presentation.rolls;
  return {
    completeRolls: rolls.filter(roll => roll.dice.every(Number.isInteger)).length,
    missingFaces: rolls.flatMap(roll => roll.dice).filter(face => face === null).length,
    repeatedPlayers: rolls.filter((roll, i) => repeatedPlayer(roll, rolls[i + 1], sources) &&
      !reviewed.has(transitionKey(roll, rolls[i + 1]))).length,
    missingPickups: rolls.filter((roll, i) => missingPickup(roll, rolls[i + 1], sources)).length,
    gradedPlays: Object.values(decisions).filter(decision => decision.player && decision.countedInGameLoss).length,
  };
}

function report(number) {
  const prefix = `game-0${number}`;
  const data = read(path.join(output, "state", prefix + ".json"));
  const replay = read(path.join(replayDir, prefix + "-game.json"));
  const confirmedTransitions = reviewedTransitions(replay);
  const recording = read(path.join(rawDir, `game-${number}-analysis.json`));
  const raw = recording.segments.flatMap(segment =>
    rowsFrom(path.join(rawDir, "state", segment.source.replace(/\.mp4$/, ".jsonl.gz")))
      .slice(segment.firstFrame, segment.lastExclusive).map(row => row.state));
  assert.equal(raw.length, data.frames);
  const counts = { frames: raw.length, boardObserved: 0, boardReconciled: 0, reconstructedBoardFrames: 0, equityFrames: 0,
    coverFrames: 0, rollFrames: 0, diceRead: [0, 0, 0], diceConflictFrames: 0,
    rolls: data.rolls.length, completeRolls: 0, missingFaces: 0, bothFacesMissing: 0,
    availableDecisions: 0, confirmedBoardsWithMissingDice: 0, fans: 0, gradedPlays: 0, legalPlays: 0, observedPickups: 0,
    confirmedConsecutive: 0, reviewedDetectorMisreads: (replay.contextRecovery ?? [])
      .filter(entry => entry.confirmedDetectorMisread).length,
    sourceCuts: data.sources.filter(source => source.discontinuity).length };
  for (const reading of raw) {
    if (reading?.handRegions?.length) counts.coverFrames++;
    if (reading?.position) counts.boardObserved++;
    else if (observedBoard(reading)) counts.boardReconciled++;
  }
  for (const [index, state] of data.changes.entries()) {
    const board = data.positions[state.position];
    if (!board) continue;
    const frames = (data.changes[index + 1]?.frame ?? data.frames) - state.frame;
    counts.reconstructedBoardFrames += frames;
    if (board.equities) counts.equityFrames += frames;
  }
  const issues = [];
  const unresolvedFaces = { fans: 0, confirmedResults: 0, unconfirmedResults: 0 };
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
      const reason = roll.before && roll.after ? (roll.fan ? "fans" : "confirmedResults") : "unconfirmedResults";
      unresolvedFaces[reason] += missing;
      const detail = {
        fans: "The camera confirms no checker entered.",
        confirmedResults: "The camera confirms the checker result.",
        unconfirmedResults: "The checker result is unconfirmed.",
      };
      add("unknown-face", roll, roll.start,
        `${missing === 2 ? "Both faces are unknown." : "One face is unknown."} ${detail[reason]}`);
    }
    if (roll.decision) counts.availableDecisions++;
    if (missing && roll.evidence === "reviewed-roll-with-confirmed-board") counts.confirmedBoardsWithMissingDice++;
    if (roll.fan) counts.fans++;
    if (!roll.before) add("no-position", roll);
    if (roll.sourceMismatch) add("observed-move-mismatch", roll, roll.end - 1,
      "The reviewed checker arrangement at pickup falls outside the legal results for the frozen starting board and dice.");
    else if (roll.decision && !confirmed) add("unconfirmed-play", roll);
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
    else if (missingPickup(roll, next, data.sources)) {
      add("no-pickup", roll, roll.end - 1);
    }
    if (next?.start < roll.end) add("overlapping-rolls", next);
    if (repeatedPlayer(roll, next, data.sources)) {
      if (confirmedTransitions.has(transitionKey(roll, next))) counts.confirmedConsecutive++;
      else add("repeated-player", next);
    }
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
  assert.equal(Object.values(unresolvedFaces).reduce((a, b) => a + b, 0), counts.missingFaces);
  assert(counts.completeRolls <= counts.rolls && counts.legalPlays <= counts.gradedPlays);
  assert(issues.every(issue => issue.frame >= 0 && issue.frame < data.frames));
  issues.sort((a, b) => a.frame - b.frame);
  const footageReview = [...(reviewed[number] ?? []), ...(replay.contextRecovery ?? [])
    .filter(entry => entry.text && !entry.superseded).map(({ frame, text }) => ({ frame, text }))].sort((a, b) => a.frame - b.frame);
  const faceResolutions = (replay.contextRecovery ?? []).filter(entry => entry.diceFrames?.length)
    .map(({ frame, diceFrames }) => ({ frame, frames: diceFrames.length }));
  const shiftedRolls = (replay.contextRecovery ?? []).filter(entry => entry.kind === "reviewed-turn-order" &&
    Number.isInteger(entry.previousFrame) && Number.isInteger(entry.clear));
  const report = { game: number, fps: data.fps, counts, unresolvedFaces, issues, issueNames, reviewed: footageReview,
    confirmedPriorMisreads: number === 4 ? 1 + Number(replay.contextRecovery?.some(entry =>
      entry.kind === "reviewed-turn-order" && entry.frame === 13294)) : 0, modelChecks: modelChecks(number),
    reference: referenceFor(prefix, data.sources), diceBody: diceBodyEvidence(prefix, data.rolls),
    diceTracks: diceTrackEvidence(number), modelSpots: modelSpots.filter(spot => spot.game === number),
    settledFaces: faceValidation && {
      ...faceValidation.summary, tests: faceValidation.tests.filter(test => test.game === number), resolutions: faceResolutions,
    }, witnessTrials: {
      checkers: boardTrial && { training: boardTrial.extraLabels.train, results: boardTrial.witnessSummary },
      dice: diceTrial && { extraTracks: diceTrial.extraTrainingTracks, frames: diceTrial.trainingFrames, results: diceTrial.summary },
      blend: blendValidation && { faces: blendValidation.faces, clips: blendValidation.clips, metrics: blendValidation.metrics,
        tests: blendValidation.tests.filter(item => item.game === number) },
      followup: followupValidation && { faces: followupValidation.faces, clips: followupValidation.clips,
        metrics: followupValidation.metrics, tests: followupValidation.tests.filter(item => item.game === number) },
      checkerContinuity: checkerContinuity && { crops: checkerContinuity.extraLabels.train,
        results: checkerContinuity.witnessSummary },
      diceContinuity: diceContinuity && { tracks: diceContinuity.trainingTracks, frames: diceContinuity.trainingFrames,
        results: diceContinuity.summary },
    },
    footprintTiming: { controls: footprintValidation.filter(item => item.clear !== null).length, shiftedRolls,
      testedWindows: footprintValidation.filter(item => item.game === number) },
  };
  fs.writeFileSync(path.join(reportDir, prefix + ".json"), JSON.stringify(report) + "\n");
  console.log(prefix, counts, Object.fromEntries(Object.keys(issueNames).map(kind =>
    [kind, issues.filter(issue => issue.kind === kind).length])));
}

for (let number = 1; number <= 5; number++) report(number);
