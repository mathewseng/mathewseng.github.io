const number = new Intl.NumberFormat();
const percent = new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 1 });
const checkerCount = label => label === 0 ? "empty" : label > 10 ? `${label - 10} Black` : `${label} White`;

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function timecode(frame, fps) {
  const seconds = Math.floor(frame / fps);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function renderReport(report, seek) {
  const { counts, issues, reviewed, issueNames } = report;
  const fragment = document.createDocumentFragment();
  const summary = element("dl", null, "vision-report-score");
  const metrics = [
    ["Rolls with both faces", `${counts.completeRolls} / ${counts.rolls}`],
    ["Unknown dice faces", number.format(counts.missingFaces)],
    ["Graded plays legal for roll", `${counts.legalPlays} / ${counts.gradedPlays}`],
    ["Confirmed dice misreads", number.format(report.confirmedPriorMisreads + (counts.reviewedDetectorMisreads ?? 0))],
  ];
  for (const [label, value] of metrics) {
    const stat = element("div");
    stat.append(element("dt", label), element("dd", value));
    summary.append(stat);
  }
  fragment.append(summary);
  if (report.reference) {
    const previous = report.reference;
    const repeated = issues.filter(issue => issue.kind === "repeated-player").length;
    const comparisons = [
      `Complete rolls ${previous.completeRolls} → ${counts.completeRolls}`,
      `Unknown faces ${previous.missingFaces} → ${counts.missingFaces}`,
      `Graded plays ${previous.gradedPlays} → ${counts.gradedPlays}`,
      `Unresolved turn-order flags ${previous.repeatedPlayers} → ${repeated}`,
    ];
    if (Number.isInteger(previous.missingPickups)) {
      const pickups = issues.filter(issue => issue.kind === "no-pickup").length;
      comparisons.push(`Unconfirmed pickups ${previous.missingPickups} → ${pickups}`);
    }
    fragment.append(element("p", ["Since the earlier replay", ...comparisons].join(" · "),
      "muted small vision-report-comparison"));
  }
  if (counts.missingFaces && report.unresolvedFaces) {
    const { fans, confirmedResults, unconfirmedResults } = report.unresolvedFaces;
    fragment.append(element("p",
      `Unknown faces · ${fans} on confirmed fans · ${confirmedResults} with verified checker results · ${unconfirmedResults} with unconfirmed results`,
      "muted small"));
  }
  const automatic = report.automaticBoundary ?? report.stationaryFaces;
  if (automatic) fragment.append(automaticReconstruction(automatic, report.stationaryFaces?.recoveries ?? []));

  const coverage = element("section", null, "vision-report-coverage");
  coverage.append(element("h3", "Detector coverage"));
  const chart = element("dl", null, "vision-report-bars");
  for (const [label, value, total] of [
    ["Both dice read", counts.diceRead[2], counts.rollFrames],
    ["One die read", counts.diceRead[1], counts.rollFrames],
    ["Neither die read", counts.diceRead[0], counts.rollFrames],
    ["Complete checker inventory", counts.boardObserved + counts.boardReconciled, counts.frames],
  ]) {
    const row = element("div");
    const meter = element("meter");
    meter.max = total || 1;
    meter.value = value;
    meter.setAttribute("aria-label", label);
    const bar = element("dd");
    bar.append(meter, element("span", total ? percent.format(value / total) : "—"));
    row.append(element("dt", label), bar);
    chart.append(row);
  }
  const conflictLabel = counts.diceConflictFrames === 1 ? "frame" : "frames";
  coverage.append(chart, element("p",
    `Dice coverage uses ${number.format(counts.rollFrames)} frames during reconstructed rolls. Checker coverage uses all ${number.format(counts.frames)} frames, including ${number.format(counts.boardReconciled)} recovered from tray and stack evidence. The detector’s pair disagreed with the replay in ${number.format(counts.diceConflictFrames)} ${conflictLabel}.`,
    "muted small"));
  if (counts.reconstructedBoardFrames) {
    coverage.append(element("p", `Equity was evaluated for the reconstructed board in ${number.format(counts.equityFrames)} of ${number.format(counts.reconstructedBoardFrames)} frames with a board.`, "muted small"));
  }
  if (report.checkerMotion?.compared) {
    const { compared, previousMatches, updatedMatches } = report.checkerMotion;
    coverage.append(element("p",
      `During graded plays, the checker counts matched complete camera readings on ${number.format(updatedMatches)} of ${number.format(compared)} comparable frames. The earlier tracker matched ${number.format(previousMatches)}. The starting boards and play grades remain fixed during these movements.`,
      "muted small"));
  }
  fragment.append(coverage);

  const motion = report.checkerMotion;
  if (motion?.tallStackFrames || motion?.earlierResults?.length || motion?.carriedResults?.length ||
      (report.tallStacks && motion?.improved)) {
    const section = element("section", null, "vision-report-model");
    section.append(element("h3", "Checker stacks and move timing"));
    if (motion.tallStackFrames) section.append(element("p",
      `The supplemental reader extended visible stacks to six or more checkers on ${number.format(motion.tallStackFrames)} frames in this game.`,
      "muted small"));
    if (report.tallStacks) {
      const { current, updated, witnesses } = report.tallStacks;
      if (witnesses?.length) {
        const matched = key => witnesses.filter(witness => witness[key] === witness.count).length;
        section.append(element("p",
          `On ${number.format(witnesses.length)} source frames selected to check the stack, the updated reader matched ${matched("updated")}. The earlier reader matched ${matched("current")}.`,
          "muted small"));
      }
      section.append(element("p",
        `On the same reviewed turns, automatic reconstruction matched ${updated.correctBefore} starting boards, ${updated.correctAfter} ending boards, and ${updated.correctDice} dice pairs. The earlier pipeline matched ${current.correctBefore}, ${current.correctAfter}, and ${current.correctDice}, respectively.`,
        "muted small"));
    }
    const timing = [
      ...(motion.earlierResults ?? []).map(item => ({ ...item, title: "Earlier checker result",
        detail: `Repeated complete boards confirmed this move ${((item.previous - item.frame) / report.fps).toFixed(2)} seconds earlier. The played move and its equity loss stay the same.` })),
      ...(motion.carriedResults ?? []).map(item => ({ ...item, title: "Checker counts carried into the next turn",
        detail: `The verified ending board replaced stale counts on ${number.format(item.frames)} intervening frames.` })),
    ].sort((a, b) => a.frame - b.frame);
    if (timing.length) section.append(reviewList(timing, item => item.title));
    fragment.append(section);
  }

  if (report.stationaryCheckers) {
    const { counts: recovered, model, witness, visible, previous, candidate } = report.stationaryCheckers;
    const section = element("section", null, "vision-report-model");
    section.append(element("h3", "Stationary checker recovery"),
      element("p", `The camera pass restored ${number.format(recovered.recovered)} checker detections on ${number.format(recovered.frames)} frames. It uses nearby frames on both sides of a dropout and checks the object in the current image.`, "muted small"),
      element("p", `The checker crop model matched ${model.correct} of ${model.held} labeled crops from ${model.heldClips} source clips held out of its training. In this game, ${recovered.after} of ${recovered.controls} reviewed locations matched after recovery, up from ${recovered.before}.`, "muted small"));
    if (candidate.correctBefore > previous.correctBefore || candidate.correctAfter > previous.correctAfter) {
      section.append(element("p", `Automatic reconstruction matched ${candidate.correctBefore} starting boards and ${candidate.correctAfter} ending boards, up from ${previous.correctBefore} and ${previous.correctAfter}.`, "muted small"));
    }
    const entries = [
      ...(witness ? [{ frame: witness.frame,
        title: `${witness.color === "white" ? "White" : "Black"} checker recovered on point ${witness.point}`,
        detail: "Vision marks the recovered camera detection with a dotted circle." }] : []),
      ...visible.map(item => ({ frame: item.frame, title: `Checker display moves from point ${item.from} to point ${item.to}`,
        detail: "The board tracks this placement while the move analysis keeps the original starting position." })),
    ].sort((a, b) => a.frame - b.frame);
    if (entries.length) section.append(reviewList(entries, item => item.title));
    fragment.append(section);
  }

  if (report.locatorValidation) {
    const { reviewedTrainingCrops, tests } = report.locatorValidation;
    const { current, trial } = tests.newCamera;
    const section = element("section", null, "vision-report-model");
    section.append(element("h3", "Die location benchmark"),
      element("p", `The trial trained on ${reviewedTrainingCrops} reviewed die and empty-board crops. On two held-out clips, it found ${trial.located} of ${trial.visible} visible dice, compared with ${current.located} for the current locator. Both returned zero false leads on ${trial.empty} empty crops. On the older holdout, false leads were ${tests.priorLabels.current.falseLeads} for the current locator and ${tests.priorLabels.trial.falseLeads} for the trial.`, "muted small"));
    const summarize = ({ current, candidate }) =>
      `${current.counts.matched} to ${candidate.counts.matched} matched turns and ${current.counts.correctDice} to ${candidate.counts.correctDice} correct pairs`;
    if (report.presenceTrial) {
      section.append(element("p", `Keeping die locations through uncertain face reads changed the automatic replay from ${summarize(report.presenceTrial)} in this game.`, "muted small"));
    }
    if (report.locatorTurnTrial) {
      section.append(element("p", `Using the new locator with the same tracking changed the automatic replay from ${summarize(report.locatorTurnTrial)}.`, "muted small"));
    }
    if (report.actorTrial) {
      const { current, candidate } = report.actorTrial;
      section.append(element("p", `Requiring both die colors to agree before using color for the roller changed wrong-player assignments from ${current.counts.actorMismatches} to ${candidate.counts.actorMismatches}.`, "muted small"));
    }
    fragment.append(section);
  }

  if (report.poseTrial) {
    const { current, candidate } = report.poseTrial;
    const section = element("section", null, "vision-report-model");
    section.append(element("h3", "Dice continuity trial"), element("p",
      `Tracking the same dice through hand occlusions or repositioning changed correct pairs from ${current.counts.correctDice} to ${candidate.counts.correctDice}, extra proposals from ${current.unmatched.length} to ${candidate.unmatched.length}, and matching starting boards from ${current.counts.correctBefore} to ${candidate.counts.correctBefore}.`,
      "muted small"));
    const episodes = candidate.rolls.filter(roll => roll.poseContinuity).map(roll => {
      const { lastSeen, resultFrame, repositionedAt, reviewedPickup } = roll.poseContinuity;
      const time = frame => timecode(frame, report.fps);
      const faces = roll.claimed.join("–");
      const evidence = resultFrame == null ? `Held ${faces} from repeated dice reads. Trial checker result unconfirmed.` :
        `Recovered ${faces} from the complete legal checker result.`;
      const moved = repositionedAt == null ? "" : ` One die moved at ${time(repositionedAt)}.`;
      const pickup = reviewedPickup == null ? "" : ` Reviewed pickup at ${time(reviewedPickup)}.`;
      return { frame: roll.frame, title: `Dice tracked from ${time(roll.automaticFrame)} through ${time(lastSeen)}`,
        detail: evidence + moved + pickup };
    });
    if (episodes.length) section.append(reviewList(episodes, entry => entry.title));
    fragment.append(section);
  }

  const stationary = report.stationaryTrial;
  const stationaryRolls = stationary?.candidate.rolls.filter(roll => roll.footprint) ?? [];
  if (stationaryRolls.length) {
    const { current, candidate } = stationary;
    const section = element("section", null, "vision-report-model");
    const pairs = current.counts.correctDice === candidate.counts.correctDice
      ? `${candidate.counts.correctDice} correct dice pairs in both runs`
      : `${current.counts.correctDice} to ${candidate.counts.correctDice} correct dice pairs`;
    section.append(element("h3", "Stationary dice through occlusion"), element("p",
      `Extra roll proposals ${current.unmatched.length} → ${candidate.unmatched.length} · ${pairs}`, "muted small"));
    const precise = frame => `${timecode(frame, report.fps)}.${String(Math.round((frame % report.fps) * 100 / report.fps)).padStart(2, "0")}`;
    const entries = stationaryRolls.flatMap(({ frame, player, claimed, footprint }) => {
      const start = {
        frame, title: `${player === "white" ? "White" : "Black"} ${claimed.join("–")}`,
        detail: `Both dice matched their original appearance in ${number.format(footprint.together)} sampled frames. Empty felt is visible at both locations at ${precise(footprint.clear)}. The same roll explains the completed checker move.`,
      };
      const pickup = footprint.reviewedPickup;
      const result = footprint.reviewedResult;
      if (!Number.isInteger(pickup) || !Number.isInteger(result) || result <= pickup) return [start];
      return [start, { frame: pickup, title: "Dice pickup and checker result",
        detail: `The replay clears the dice at ${precise(pickup)} and keeps the checker analysis visible until the result is confirmed at ${precise(result)}.` }];
    });
    section.append(reviewList(entries, entry => entry.title));
    fragment.append(section);
  }

  if (report.briefDice) {
    const { total, aligned, afterGame, reviewed, faces } = report.briefDice;
    const section = element("section", null, "vision-report-model");
    section.append(element("h3", "Brief dice appearances"));
    const inGame = total - afterGame.length;
    if (inGame) section.append(element("p", `${aligned} of ${inGame} pairs found by the short-roll detector overlapped an indexed roll by the same player. This compares locations and timing. Face accuracy is checked separately.`, "muted small"));
    if (afterGame.length) section.append(element("p", `The detector found ${afterGame.length} pairs after the scored game ended. These throws are excluded from game totals.`, "muted small"));
    if (faces?.tests.length) {
      const correct = key => faces.tests.filter(face => face[key] === face.expected).length;
      section.append(element("p", `The trial reader trained on ${faces.trainingFrames} source frames from ${faces.trainingTracks} tracks. On ${faces.tests.length} newly reviewed faces in this game, the current reader matched ${correct("baselineTrack")} and the trial matched ${correct("candidateTrack")}.`, "muted small"));
    }
    const entries = [
      ...reviewed.map(({ frame, text, jointlyObserved, correctedPair }) => ({ frame, detail: text,
        title: correctedPair ? `Both dice located · ${jointlyObserved} frames` : `Paired positions · ${jointlyObserved} frames` })),
      ...afterGame.map(({ start }) => ({ frame: start, title: "Post-game dice" })),
      ...(faces?.tests ?? []).filter(face => face.baselineTrack !== face.expected || face.candidateTrack !== face.expected)
        .map(face => ({ frame: face.frame, title: `Reviewed face · ${face.expected}`,
          detail: `Current reader saw ${face.baselineTrack ?? "?"}. Trial saw ${face.candidateTrack ?? "?"}.` })),
    ].sort((a, b) => a.frame - b.frame);
    if (entries.length) section.append(reviewList(entries, entry => entry.title));
    fragment.append(section);
  }

  if (report.automaticTrial && !automatic) {
    const { current, candidate } = report.automaticTrial;
    const section = element("section", null, "vision-report-model");
    section.append(element("h3", "Automatic replay trial"), element("p",
      "Both readers processed the full recording. Their automatic game states are compared with the reviewed replay. Dice counts use matched rolls whose faces are both known in the reviewed footage.",
      "muted small"));
    const table = element("table", null, "vision-history-totals");
    const head = table.createTHead().insertRow();
    for (const label of ["Check", "Current", "Trial"]) {
      const cell = element("th", label);
      cell.scope = "col";
      head.append(cell);
    }
    const body = table.createTBody();
    for (const [label, value] of [
      ["Reviewed rolls matched", entry => `${entry.counts.matched}/${entry.counts.reference}`],
      ["Additional roll proposals", entry => entry.unmatched.length],
      ["Correct dice pairs", entry => entry.counts.correctDice],
      ["Wrong dice pairs", entry => entry.counts.wrongDice],
      ["Pairs with unread faces", entry => entry.counts.unknownDice],
      ["Wrong player", entry => entry.counts.actorMismatches],
      ["Starting boards matched", entry => entry.counts.correctBefore],
      ["Ending boards matched", entry => entry.counts.correctAfter],
    ]) {
      const row = body.insertRow();
      const name = element("th", label);
      name.scope = "row";
      row.append(name, element("td", String(value(current))), element("td", String(value(candidate))));
    }
    section.append(table);
    fragment.append(section);
  }

  if (report.modelChecks) {
    const section = element("section", null, "vision-report-model");
    section.append(element("h3", "Manual model benchmark"), element("p",
      "Each sample is one visible die face or checker point. Test clips were held out of fine-tuning. The replay uses the existing readers with temporal reconstruction.",
      "muted small"));
    const table = element("table", null, "vision-history-totals");
    const head = table.createTHead().insertRow();
    for (const label of ["Reader", "Current", "Fine-tuned", "Game test errors"]) {
      const cell = element("th", label);
      cell.scope = "col";
      head.append(cell);
    }
    const body = table.createTBody();
    for (const [kind, check] of Object.entries(report.modelChecks)) {
      const row = body.insertRow();
      const label = element("th", kind === "dice" ? "Dice faces" : "Checker points");
      label.scope = "row";
      row.append(label, element("td", `${check.baselineCorrect}/${check.heldOut}`),
        element("td", `${check.candidateCorrect}/${check.heldOut}`),
        element("td", check.gameHeldOut ? `${check.gameBaselineErrors} → ${check.gameCandidateErrors} / ${check.gameHeldOut}` : "No test samples"));
    }
    section.append(table);
    const checks = Object.values(report.modelChecks);
    const reviewed = checks.reduce((sum, check) => sum + check.reviewed, 0);
    const unreadable = checks.reduce((sum, check) => sum + check.unreadable, 0);
    section.append(element("p", `${reviewed} dice and checker samples reviewed across the session. ${unreadable} ambiguous samples were excluded from training and scoring.`, "muted small"));
    const diceBody = report.diceBody;
    if (diceBody) {
      const { baselineCorrect, candidateCorrect, heldOut, pairs, corroboratedPairs, changed } = diceBody;
      const agreement = changed.length
        ? ` The color model changed ${changed.length} actor candidates, and ${changed.filter(pair => pair.confirmed).length} agree with the reviewed replay.`
        : "";
      section.append(element("p",
        `Die body color matched ${candidateCorrect}/${heldOut} held-out crops. The brightness heuristic matched ${baselineCorrect}/${heldOut}. Both dice supported the same color in ${corroboratedPairs}/${pairs} tracked pairs.${agreement}`,
        "muted small"));
    }
    if (report.diceTracks) {
      const { trainingTracks, trainingFrames, summary, reviewedFaces } = report.diceTracks;
      section.append(element("p",
        `A second run used ${trainingFrames} frames from ${trainingTracks} labeled dice tracks. The fine-tuned reader matched ${summary.test.candidateTrack}/${summary.test.tracks} held-out tracks. The current reader matched ${summary.test.baselineTrack}. Across separately reviewed game rolls, pooling nearby frames improved the current reader from ${summary.spot.baselineFrame}/${summary.spot.tracks} to ${summary.spot.baselineTrack}/${summary.spot.tracks}. The fine-tuned reader matched ${summary.spot.candidateTrack}/${summary.spot.tracks} on those rolls.`,
        "muted small"));
      if (reviewedFaces.length) {
        const misses = reviewedFaces.filter(face => face.baselineTrack !== face.expected).length;
        section.append(element("p",
          `This game contributed ${reviewedFaces.length} faces to the separately reviewed rolls. The current reader still misread ${misses} after pooling frames.`,
          "muted small"));
      }
    }
    for (const spot of report.modelSpots ?? []) {
      const row = element("div", null, "vision-report-spot");
      const target = spot.expected.slice().sort((a, b) => b - a).join("–");
      const describe = result => `${result.correct}/${spot.frames * 2} faces matched, ${result.misread} misread, ${result.unread} unread`;
      row.append(timestamp(spot.firstFrame), element("p", `Reviewed ${target} roll · Current reader ${describe(spot.current)}. Fine-tuned reader ${describe(spot.candidate)}.`, "muted small"));
      section.append(row);
    }
    if (report.witnessTrials?.checkers) {
      const { training, results } = report.witnessTrials.checkers;
      const { original, "verified-board": verified } = results;
      section.append(element("p", `The checker trial added ${training} crops from manually verified boards. On newly held-out clips, the current reader matched ${verified.baseline}/${verified.count} point counts and the candidate matched ${verified.candidate}/${verified.count}. On the original test crops, they matched ${original.baseline}/${original.count} and ${original.candidate}/${original.count}.`, "muted small"));
    }
    if (report.witnessTrials?.dice) {
      const { extraTracks, frames, results } = report.witnessTrials.dice;
      const { test, spot, spotExtra } = results;
      section.append(element("p", `The dice trial added ${extraTracks} hand-labeled tracks and trained on ${frames} frames. It matched ${test.candidateTrack}/${test.tracks} general test tracks, up from ${test.baselineTrack}/${test.tracks}. On the separately reviewed roll faces it matched ${spot.candidateTrack}/${spot.tracks}, compared with ${spot.baselineTrack}/${spot.tracks} for the current reader. Both readers matched ${spotExtra.baselineTrack}/${spotExtra.tracks} on the new reviewed faces.`, "muted small"));
    }
    if (report.witnessTrials?.blend) {
      const { faces, clips, metrics } = report.witnessTrials.blend;
      section.append(element("p", `A new check used ${faces} clearly visible, hand-labeled faces from ${clips} separate clips. The current reader matched ${metrics.baseline}/${faces}, the fine-tuned reader matched ${metrics.candidate}/${faces}, and an equal blend matched ${metrics.blend}/${faces}.`, "muted small"));
    }
    if (report.witnessTrials?.followup) {
      const { faces, clips, metrics } = report.witnessTrials.followup;
      section.append(element("p", `A follow-up used ${faces} hand-labeled faces from ${clips} additional clips, including blurred dice and faces the detector missed. The current reader matched ${metrics.baseline}/${faces}, the fine-tuned reader matched ${metrics.candidate}/${faces}, and the equal blend matched ${metrics.blend}/${faces}.`, "muted small"));
    }
    if (report.witnessTrials?.checkerContinuity) {
      const { crops, results } = report.witnessTrials.checkerContinuity;
      const held = results["verified-board"];
      section.append(element("p", `An earlier checker trial used ${crops} crops from reviewed boards. The current reader matched ${held.baseline}/${held.count} point counts from held-out clips, and the trial matched ${held.candidate}/${held.count}.`, "muted small"));
    }
    const coverCheckers = report.witnessTrials?.coverCheckers;
    if (coverCheckers) {
      const { training, heldOut, current, trial, reviewedBoards, errors } = coverCheckers;
      section.append(element("p", `The cover review added ${training} labeled checker crops to training. The current reader matched ${current}/${heldOut} counts and the trial matched ${trial}/${heldOut}. Both matched ${reviewedBoards.baseline}/${reviewedBoards.count} on the held-out board witnesses.`, "muted small"));
      const seekable = errors.filter(error => error.frame !== null).map(error => ({
        frame: error.frame, title: `Point ${error.point} · ${checkerCount(error.expected)}`,
        detail: `Current reader saw ${checkerCount(error.current)}. Trial saw ${checkerCount(error.trial)}.`,
      }));
      if (seekable.length) section.append(reviewList(seekable, entry => entry.title));
    }
    const handoffCheckers = report.witnessTrials?.handoffCheckers;
    if (handoffCheckers) {
      const { addedCrops, heldOut, current, control, trial, errors } = handoffCheckers;
      section.append(element("p", `The pickup review added ${addedCrops} labeled checker crops to training. On the same ${heldOut} held-out crops, the current reader matched ${current}, the control matched ${control}, and the expanded trial matched ${trial}.`, "muted small"));
      const seekable = errors.filter(error => error.frame !== null).map(error => ({
        frame: error.frame, title: `Point ${error.point} · ${checkerCount(error.expected)}`,
        detail: `Current reader saw ${checkerCount(error.current)}. Control saw ${checkerCount(error.control)}. Expanded trial saw ${checkerCount(error.trial)}.`,
      }));
      if (seekable.length) section.append(reviewList(seekable, entry => entry.title));
    }
    if (report.witnessTrials?.diceContinuity) {
      const { frames, tracks, results } = report.witnessTrials.diceContinuity;
      const { test, spot, spotExtra } = results;
      section.append(element("p", `The latest dice trial used ${frames} source frames from ${tracks} tracks. Across the general, original reviewed, and newly reviewed tests, the current reader matched ${test.baselineTrack}/${test.tracks}, ${spot.baselineTrack}/${spot.tracks}, and ${spotExtra.baselineTrack}/${spotExtra.tracks}. The trial matched ${test.candidateTrack}/${test.tracks}, ${spot.candidateTrack}/${spot.tracks}, and ${spotExtra.candidateTrack}/${spotExtra.tracks}.`, "muted small"));
    }
    if (report.witnessTrials?.diceRuntime) {
      const { current, candidate } = report.witnessTrials.diceRuntime.counts;
      const total = Object.values(current).reduce((sum, count) => sum + count, 0);
      section.append(element("p", `With the live detector thresholds, the latest dice trial gave ${candidate.correct} correct and ${candidate.wrong ?? 0} wrong reads across ${total} views of the newly reviewed dice. The current reader gave ${current.correct} correct and ${current.wrong ?? 0} wrong reads. The remaining views were uncertain or missed.`, "muted small"));
    }
    const shortTurnDice = report.witnessTrials?.shortTurnDice ?? [];
    if (shortTurnDice.length) {
      const correct = key => shortTurnDice.filter(face => face[key] === face.expected).length;
      section.append(element("p", `On ${shortTurnDice.length} newly reviewed faces from this game, the pooled current reader matched ${correct("baselineTrack")} and the trial matched ${correct("candidateTrack")}.`, "muted small"));
    }
    const finalBoardDice = report.witnessTrials?.finalBoardDice;
    if (finalBoardDice?.tests.length) {
      const { tests, augmented } = finalBoardDice;
      const correct = (rows, key) => rows.filter(face => face[key] === face.expected).length;
      const extra = augmented ? ` The trial with camera blur and exposure augmentation matched ${correct(augmented.tests, "candidateTrack")}.` : "";
      section.append(element("p", `On ${tests.length} faces from the latest checker-board reviews, the current reader matched ${correct(tests, "baselineTrack")} and the fine-tuned reader matched ${correct(tests, "candidateTrack")}.${extra}`, "muted small"));
    }
    const coveredDice = report.witnessTrials?.coveredDice;
    if (coveredDice?.tests.length) {
      const { tests, trainingFrames, trainingTracks } = coveredDice;
      const correct = key => tests.filter(face => face.expected === face[key]).length;
      section.append(element("p", `The cover and fan review tested ${tests.length} newly labeled faces from this game. The current reader matched ${correct("baselineTrack")} and the reader fine-tuned on ${trainingFrames} frames from ${trainingTracks} tracks matched ${correct("candidateTrack")}.`, "muted small"));
    }
    const occlusionDice = report.witnessTrials?.occlusionDice;
    if (occlusionDice?.tests.length) {
      const { tests, detail, trainingFrames } = occlusionDice;
      const correct = (rows, key) => rows.filter(test => test[key] === test.expected).length;
      section.append(element("p", `Two readers trained on ${trainingFrames} source frames. Across ${tests.length} reviewed faces after an occlusion in this game, the current reader matched ${correct(tests, "baselineTrack")}, the camera-augmented reader matched ${correct(tests, "candidateTrack")}, and the reader trained with increased pip contrast matched ${correct(detail, "candidateTrack")}.`, "muted small"));
      const errors = tests.flatMap(({ frame, expected, baselineTrack, candidateTrack }, i) => {
        const contrast = detail[i]?.candidateTrack ?? "?";
        if ([baselineTrack, candidateTrack, contrast].every(read => read === expected)) return [];
        return [{ frame, title: `Reviewed face · ${expected}`,
          detail: `Current reader saw ${baselineTrack}. Camera-augmented reader saw ${candidateTrack}. Pip contrast reader saw ${contrast}.` }];
      });
      if (errors.length) section.append(reviewList(errors, entry => entry.title));
    }
    fragment.append(section);
  }

  function timestamp(frame) {
    const button = element("button", timecode(frame, report.fps), "vision-download vision-report-time");
    button.type = "button";
    button.setAttribute("aria-label", `Seek to ${button.textContent}`);
    button.addEventListener("click", () => seek(frame / report.fps));
    return button;
  }

  function reviewList(items, describe) {
    const list = element("ol", null, "vision-report-list");
    for (const entry of items) {
      const row = element("li");
      const detail = element("div");
      detail.append(element("strong", describe(entry)));
      if (entry.detail) detail.append(element("p", entry.detail, "muted small"));
      row.append(timestamp(entry.frame), detail);
      list.append(row);
    }
    return list;
  }

  function automaticReconstruction({ current, updated, review, extra, boundary, closingRoll, suppressed, checkerRecoveries }, recoveries) {
    const section = element("section", null, "vision-report-model vision-automatic-report");
    section.append(element("h3", "Automatic reconstruction"), element("p",
      "Both runs use the same footage and are compared with the reviewed replay. Dice accuracy uses rolls with two verified faces.",
      "muted small"));
    const table = element("table", null, "vision-history-totals");
    const headings = table.createTHead().insertRow();
    for (const label of ["Check", "Before", "Updated"]) {
      const heading = element("th", label);
      heading.scope = "col";
      headings.append(heading);
    }
    const body = table.createTBody();
    for (const [label, value] of [
      ["Rolls matched", run => `${run.matched}/${run.reference}`],
      ["Correct dice pairs", run => run.correctDice],
      ["Pairs with unread faces", run => run.unknownDice],
      ["Wrong dice", run => run.wrongDice],
      ["Wrong player", run => run.actorMismatches],
      ["Extra roll proposals", run => run.extraProposals],
      ["Starts within 0.2 s", run => `${run.closeStarts}/${run.matched}`],
      ["Starting boards matched", run => run.correctBefore],
      ["Ending boards matched", run => run.correctAfter],
    ]) {
      const row = body.insertRow();
      const heading = element("th", label);
      heading.scope = "row";
      row.append(heading, element("td", String(value(current))), element("td", String(value(updated))));
    }
    section.append(table);
    const player = side => side === "white" ? "White" : side === "dark" ? "Black" : "Unknown player";
    const dice = faces => faces.length === 2 ? faces.join("–") : faces.length ? `${faces[0]}–?` : "?–?";
    if (boundary) {
      const offset = (boundary.frame - boundary.reviewedFrame) / report.fps;
      const timing = offset === 0 ? "Matches the reviewed end." :
        `${Math.abs(offset).toFixed(2)} s ${offset < 0 ? "before" : "after"} the reviewed end.`;
      const title = boundary.winner ? `${player(boundary.winner)} wins ${boundary.points} ${boundary.points === 1 ? "point" : "points"} after a pass` :
        "The board is reset";
      const evidence = boundary.kind === "pack-up-after-offer"
        ? "Both players’ checkers were cleared while the offered cube was still on the board."
        : boundary.kind === "cube-returned-before-reset"
          ? "The cube returned to center. The board was later reset without another confirmed throw."
          : boundary.setupPoint
            ? `${player(boundary.setupPlayer)} rebuilt the stack on fixed point ${boundary.setupPoint}. Both starting formations appeared later.`
            : "Both starting formations were visible after the bearing-off position.";
      section.append(element("h4", "Game ending evidence"), reviewList([
        ...(closingRoll ? [{ frame: closingRoll.frame, title: `Final throw · ${dice(closingRoll.dice)}`,
          detail: "Both die locations were visible before setup. The automatic reading preserves the supported face." }] : []),
        { frame: boundary.frame, title, detail: `Automatic estimate. ${timing} ${evidence}` },
        ...(offset === 0 ? [] : [{ frame: boundary.reviewedFrame, title: "Reviewed game end" }]),
        { frame: boundary.confirmedFrame, title: boundary.kind === "pack-up-after-offer" ? "Clear view of the packed board" :
          "Starting formation confirmed" },
      ], entry => entry.title));
    }
    if (recoveries.length) {
      section.append(element("h4", "Dice recovered from stationary reads"),
        reviewList(recoveries.map(roll => ({
          frame: roll.frame,
          title: `${player(roll.player)} ${dice(roll.dice)}`,
          detail: `Both faces agree in ${roll.samples} frames from the main reader and ${roll.corroboratingSamples} from the alternate locator. ` +
            (roll.checkerResult === "fan" ? "The verified board blocks both entries from the bar." :
              roll.checkerResult === "move" ? "The legal checker move reached the verified ending board." :
                "The automatic run still lacks a verified checker result."),
        })), entry => entry.title));
    }
    if (checkerRecoveries?.length) {
      section.append(element("h4", "Rolls inferred from checker play"), reviewList(checkerRecoveries.flatMap(roll => [
        { frame: roll.frame, title: `${player(roll.player)} ${dice(roll.dice)}`,
          detail: `Both dice were tracked in ${roll.positions} frames. Only this roll can produce the verified checker move.` },
        { frame: roll.beforeFrame, title: "Starting checker position" },
        { frame: roll.resultFrame, title: "Ending checker position" },
      ]), entry => entry.title));
    }
    if (review.length) {
      const pending = element("details");
      pending.append(element("summary", `Rolls to review (${review.length})`),
        reviewList(review.map(roll => ({
          frame: roll.frame,
          title: `${player(roll.player)} ${dice(roll.dice)}`,
          detail: roll.verdict === "unmatched" ? "Automatic run missed this roll." :
            `Automatic run saw ${player(roll.automaticPlayer)} ${dice(roll.seen)}. ` +
            (roll.automaticPlayer !== roll.player ? "Player mismatch." :
              roll.verdict === "wrong" ? "Dice mismatch." : "At least one face is unread."),
        })), entry => entry.title));
      section.append(pending);
    }
    if (extra.length) {
      const pending = element("details");
      pending.append(element("summary", `Extra roll proposals (${extra.length})`),
        reviewList(extra, roll => `${player(roll.player)} ${dice(roll.dice)}`));
      section.append(pending);
    }
    if (suppressed?.length) {
      const excluded = element("details");
      excluded.append(element("summary", `Excluded roll proposals (${suppressed.length})`),
        reviewList(suppressed.map(roll => ({
          ...roll,
          detail: roll.reason === "post-game" ? "After the inferred game end." : "While the cube was awaiting a response.",
        })), roll => `${player(roll.player)} ${dice(roll.dice)}`));
      section.append(excluded);
    }
    return section;
  }

  if (report.settledFaces) {
    const section = element("section");
    const { baselineCorrect, controls, correct, wrong, abstained, tests, resolutions } = report.settledFaces;
    section.append(element("h3", "Dice and checker movement"), element("p",
      `On ${controls} previously scored rolls with several legal dice pairs, the pooled face reader matched ${baselineCorrect}. With the legal board result and a confidence threshold, the system matched ${correct}, made ${wrong} wrong calls and left ${abstained} unresolved.`,
      "muted small"));
    const pair = dice => dice.join("–");
    const details = [
      ...resolutions.map(item => ({ ...item,
        title: `Roll resolved from ${item.frames} views and the verified checker move` })),
      ...tests.map(test => ({ ...test, title: `Control roll ${pair(test.expected)}`,
        detail: `Face reader ${pair(test.baseline)}. With checker movement, ${test.verdict ? pair(test.verdict) : "unresolved"}.` })),
    ].sort((a, b) => a.frame - b.frame);
    if (details.length) section.append(reviewList(details, entry => entry.title));
    fragment.append(section);
  }

  if (report.nativeDice) {
    const section = element("section");
    const { benchmark, accepted } = report.nativeDice;
    const { trainingTracks, trainingViews, heldTracks, board, native, contrast } = benchmark;
    section.append(element("h3", "Original camera dice review"), element("p",
      `The trial used ${trainingViews} camera views from ${trainingTracks} labeled tracks. On ${heldTracks} held-out labels, the current reader matched ${board}, the original-camera trial matched ${native}, and the contrast trial matched ${contrast}. The current reader remains in use.`, "muted small"));
    if (accepted.length) section.append(reviewList(accepted.map(entry => ({
      ...entry, detail: `The original camera shows both faces in ${entry.witnesses.length} reviewed frames.`,
    })), entry => `Verified roll ${entry.dice.join("–")}`));
    fragment.append(section);
  }

  if (report.pipReader) {
    const { trainingFaces, previous, added, tests } = report.pipReader;
    const section = element("section", null, "vision-report-model vision-pip-reader-report");
    section.append(element("h3", "Dice reader trial"), element("p",
      `The trial added ${trainingFaces} hand-labeled face crops. Calibration used separate clips. The blend averages both readers’ scores.`, "muted small"));
    const rows = [
      ["Earlier controls", previous], ["New difficult reads", added],
    ];
    const table = element("table", null, "vision-history-totals");
    const headings = table.createTHead().insertRow();
    for (const title of ["Dice tracks", "Current", "New", "Blend"]) {
      const heading = element("th", title);
      heading.scope = "col";
      headings.append(heading);
    }
    const body = table.createTBody();
    for (const [label, cohort] of rows) {
      const heading = element("th", label);
      heading.scope = "row";
      body.insertRow().append(heading,
        element("td", `${cohort.correct.baseline}/${cohort.tracks}`),
        element("td", `${cohort.correct.candidate}/${cohort.tracks}`),
        element("td", `${cohort.correct.blend}/${cohort.tracks}`));
    }
    section.append(table);
    if (tests.length) {
      const details = element("details");
      details.append(element("summary", `Reviewed dice tracks (${tests.length})`), reviewList(tests.map(item => ({
        ...item, title: `Die ${item.die + 1} shows ${item.expected}`,
        detail: `Current ${item.baseline || "unread"} · New ${item.candidate || "unread"} · Combined ${item.blend || "unread"}. Reviewed in ${item.views} ${item.views === 1 ? "frame" : "frames"}.`,
      })), item => item.title));
      section.append(details);
    }
    fragment.append(section);
  }

  if (report.forcedPlays?.length) {
    const section = element("section");
    section.append(element("h3", "Forced checker plays"), reviewList(report.forcedPlays.map(play => ({
      ...play, detail: `${play.possibleDice.map(dice => dice.join("–")).join(", ")} each force the same play. EV loss ${play.evLoss.toFixed(3)}.`,
    })), play => play.notation));
    fragment.append(section);
  }

  if (report.partialDice?.length) {
    const section = element("section");
    section.append(element("h3", "Possible dice from checker context"), reviewList(report.partialDice.map(roll => ({
      ...roll, detail: roll.possibleDice.length
        ? roll.possibleDice.map(pair => pair.join("–")).join(", ")
        : "The observed checker counts leave no compatible legal pair.",
    })), roll => roll.dice.map(face => face ?? "?").join("–")));
    fragment.append(section);
  }

  if (reviewed.length) {
    const notes = element("section");
    const notesWithTiming = reviewed.map(entry => {
      if (entry.boardWitnesses?.length !== 2) return entry;
      const [before, after] = entry.boardWitnesses;
      return { ...entry, detail: `Starting board ${timecode(before.frame, report.fps)} · Ending board ${timecode(after.frame, report.fps)}` };
    });
    notes.append(element("h3", "Reviewed footage"), reviewList(notesWithTiming, entry => entry.text));
    fragment.append(notes);
  }

  const flagged = element("section", null, "vision-report-flags");
  flagged.append(element("h3", "Timing and state checks"), element("p",
    `${counts.observedPickups} pickups have evidence. ${counts.availableDecisions} rolls have checker analysis. ${counts.fans} short fans were confirmed by footage review. Source cuts with a recorded gap ${counts.sourceCuts}. Flags identify footage for review. A raw disagreement can come from occlusion or a false detection.`,
    "muted small"));
  if (counts.pendingCheckerHandoffs) {
    flagged.append(element("p", `Checker confirmation followed dice pickup ${number.format(counts.pendingCheckerHandoffs)} times in this game. The replay kept the checker turn visible across ${number.format(counts.pendingCheckerFrames)} frames with the dice off the board.`, "muted small"));
  }
  if (counts.reviewedDetectorMisreads) {
    flagged.append(element("p", `${counts.reviewedDetectorMisreads} additional detector misreads were confirmed from the camera or from the visible checker movement.`, "muted small"));
  }
  if (counts.confirmedBoardsWithMissingDice) {
    const result = counts.confirmedBoardsWithMissingDice === 1 ? "checker result has a verified final board" :
      "checker results have verified final boards";
    flagged.append(element("p",
      `${counts.confirmedBoardsWithMissingDice} ${result} and unresolved dice. Open the verified positions in Game history.`, "muted small"));
  }
  if (counts.confirmedConsecutive) {
    flagged.append(element("p", "The footage confirms successive throws from the same player. See the timestamped review above.", "muted small"));
  }
  if (report.footprintTiming?.shiftedRolls.length) {
    const { controls, shiftedRolls } = report.footprintTiming;
    const timingNotes = shiftedRolls.map(roll => {
      const shift = (roll.previousFrame - roll.frame) / report.fps;
      const title = roll.restored ? "Missing roll restored" : shift === 0 ? "Dice pickup confirmed" :
        `Roll starts ${Math.abs(shift).toFixed(1)} seconds ${shift > 0 ? "earlier" : "later"}`;
      const previous = roll.restored ? `${roll.player === "white" ? "White" : "Black"} rolls ${roll.dice.map(face => face ?? "?").join("–")}. ` :
        `Previous marker ${timecode(roll.previousFrame, report.fps)}. `;
      const repositioned = roll.repositioned ? "One die was repositioned during the roll. " : "";
      return { frame: roll.frame, title, detail:
        `${previous}${repositioned}Both dice locations clear at ${timecode(roll.clear, report.fps)}.` };
    });
    flagged.append(element("p", `Matching both stationary dice and then the empty board agreed with the reviewed timing in ${controls} rolls.`, "muted small"),
      reviewList(timingNotes, entry => entry.title));
  }
  if (issues.length) {
    const picker = element("label", "Filter checks ", "vision-report-filter");
    const filter = element("select");
    filter.append(new Option(`All checks (${issues.length})`, ""));
    for (const [kind, label] of Object.entries(issueNames)) {
      const count = issues.filter(issue => issue.kind === kind).length;
      if (count) filter.append(new Option(`${label} (${count})`, kind));
    }
    const results = element("div");
    function update() {
      results.replaceChildren(reviewList(issues.filter(issue => !filter.value || issue.kind === filter.value),
        issue => issueNames[issue.kind] + (issue.player ? ` · ${issue.player === "white" ? "White" : "Black"}` : "")));
    }
    filter.addEventListener("change", update);
    picker.append(filter);
    flagged.append(picker, results);
    update();
  } else flagged.append(element("p", "No issues were flagged by these checks."));
  fragment.append(flagged);
  return fragment;
}

export function createReports(seek, replayAsset) {
  const tabList = document.querySelector(".vision-detail-tabs");
  const tabs = [...tabList.querySelectorAll("[role=tab]")];
  const content = document.querySelector("#report-content");
  const title = document.querySelector("#report-heading");
  const download = document.querySelector("#download-report");
  let game = "1";
  let controller;

  function load() {
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;
    const url = replayAsset(`reports/game-${game.padStart(2, "0")}.json`);
    title.textContent = `Game ${game} vision report`;
    download.href = url;
    content.setAttribute("aria-busy", "true");
    content.replaceChildren(element("p", "Loading report…", "muted small"));
    fetch(url, { signal }).then(response => {
      if (!response.ok) throw new Error(response.status);
      return response.json();
    }).then(report => {
      if (signal.aborted) return;
      content.replaceChildren(renderReport(report, seek));
      content.setAttribute("aria-busy", "false");
    }).catch(() => {
      if (signal.aborted) return;
      content.replaceChildren(element("p", "The report could not be loaded.", "vision-error"));
      content.setAttribute("aria-busy", "false");
    });
  }

  function activate(selected) {
    for (const tab of tabs) {
      const active = tab === selected;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      document.getElementById(tab.getAttribute("aria-controls")).hidden = !active;
    }
    if (selected.id === "reports-tab") load();
  }

  tabList.hidden = false;
  for (const [index, tab] of tabs.entries()) {
    tab.addEventListener("click", () => activate(tab));
    tab.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const target = tabs[event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : 1 - index];
      activate(target);
      target.focus();
    });
  }
  return { select(number) {
    game = number;
    if (tabs[1].getAttribute("aria-selected") === "true") load();
  } };
}
