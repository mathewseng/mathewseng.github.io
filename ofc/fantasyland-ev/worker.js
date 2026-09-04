"use strict";

importScripts("../fantasyland-core.js?v=20260904a", "../fantasyland-trainer/app.js?v=20260904a");

const Core = self.OFCFantasylandCore;
const TrainerCore = self.OFCSolverCore;
let activeTask = null;

self.onmessage = (event) => {
  const message = event.data || {};
  if (message.type === "cancel") {
    activeTask = null;
    return;
  }
  if (message.type !== "run" || !Core) return;
  activeTask = {
    taskId: message.taskId,
    variant: message.variant,
    scenario: message.scenario,
    samples: message.samples,
    runSeed: message.runSeed,
    chunkSize: message.chunkSize,
    topRepeatMinRank: message.topRepeatMinRank === null || message.topRepeatMinRank === undefined
      ? null
      : Number(message.topRepeatMinRank),
    index: 0,
  };
  setTimeout(processChunk, 0);
};

function processChunk() {
  const task = activeTask;
  if (!task) return;
  const count = Math.min(task.chunkSize, task.samples - task.index);
  const aggregate = createAggregate();
  const started = performance.now();

  for (let offset = 0; offset < count; offset += 1) {
    const sample = task.index + offset;
    const seedText = `EV-${task.runSeed}-${task.variant}-${task.scenario.cards}C-${task.scenario.jokers}J-${sample}`;
    const ids = Core.dealSeeded(task.scenario.cards, task.scenario.jokers, Core.hashSeed(seedText).toString(16));
    addSample(aggregate, solveSample(ids, task.variant, task.topRepeatMinRank), task.variant);
  }

  task.index += count;
  self.postMessage({
    type: "progress",
    taskId: task.taskId,
    scenario: task.scenario,
    aggregate,
    processed: task.index,
    elapsedMs: performance.now() - started,
  });

  if (task.index >= task.samples) {
    self.postMessage({ type: "complete", taskId: task.taskId, scenario: task.scenario });
    activeTask = null;
    return;
  }
  setTimeout(processChunk, 0);
}

function createAggregate() {
  return {
    samples: 0,
    immediateSum: 0,
    immediateSquared: 0,
    strategySum: 0,
    repeatCount: 0,
    repeatPointSum: 0,
    repeatSources: Array(8).fill(0),
    repeatDetails: createRepeatDetails(),
    qualifyCount: 0,
    distribution: [0, 0, 0, 0, 0],
  };
}

function solveSample(ids, variant, topRepeatMinRank = null) {
  const solved = TrainerCore.solveVariantHand(ids, variant, {
    allowUnsupportedCardCount: true,
    ...(topRepeatMinRank === null ? {} : { topRepeatMinRank }),
  });
  if (variant === "high" && !solved.best) throw new Error("High Fantasyland must always have a legal board.");
  return solved;
}

function addSample(aggregate, solved, variant) {
  const immediate = solved.bestRoyalty ? finiteNumber(solved.bestRoyalty.points) : 0;
  const strategy = solved.best ? finiteNumber(solved.best.points) : 0;
  aggregate.samples += 1;
  aggregate.immediateSum += immediate;
  aggregate.immediateSquared += immediate * immediate;
  aggregate.strategySum += strategy;
  aggregate.distribution[royaltyBandIndex(immediate)] += 1;
  if (solved.best) aggregate.qualifyCount += 1;
  if (solved.bestRepeat) {
    aggregate.repeatCount += 1;
    aggregate.repeatPointSum += finiteNumber(solved.bestRepeat.points);
    const repeatMask = Math.trunc(finiteNumber(solved.bestRepeat.repeatMask));
    if (repeatMask >= 1 && repeatMask <= 7) aggregate.repeatSources[repeatMask] += 1;
    const repeatDetail = TrainerCore.repeatDetailForSolution(solved.bestRepeat);
    if (repeatDetail.topTripsRank >= 2 && repeatDetail.topTripsRank <= 14) {
      aggregate.repeatDetails.topTripsByRank[repeatDetail.topTripsRank] += 1;
    }
    if (repeatDetail.bottomKind === "quads" && repeatDetail.bottomQuadsRank >= 2 && repeatDetail.bottomQuadsRank <= 14) {
      aggregate.repeatDetails.bottomQuadsByRank[repeatDetail.bottomQuadsRank] += 1;
    } else if (repeatDetail.bottomKind === "straight-flush" || repeatDetail.bottomKind === "royal-flush") {
      if (repeatDetail.bottomKind === "royal-flush") aggregate.repeatDetails.bottomRoyalFlush += 1;
      else aggregate.repeatDetails.bottomStraightFlush += 1;
      if (repeatDetail.bottomStraightFlushRank >= 5 && repeatDetail.bottomStraightFlushRank <= 14) {
        aggregate.repeatDetails.bottomStraightFlushByRank[repeatDetail.bottomStraightFlushRank] += 1;
      }
    }
  }
  if (variant === "cribbage" && solved.best) {
    const score = TrainerCore.repeatDetailForSolution(solved.best).middleCribbagePoints;
    if (!Number.isInteger(score) || score < 0 || score >= aggregate.repeatDetails.cribbageMiddleByScore.length) {
      throw new Error(`Unexpected Cribbage middle score: ${score}`);
    }
    aggregate.repeatDetails.cribbageMiddleByScore[score] += 1;
  }
}

function createRepeatDetails() {
  return {
    topTripsByRank: Array(15).fill(0),
    bottomQuadsByRank: Array(15).fill(0),
    bottomStraightFlushByRank: Array(15).fill(0),
    bottomStraightFlush: 0,
    bottomRoyalFlush: 0,
    cribbageMiddleByScore: Array(30).fill(0),
  };
}

function royaltyBandIndex(points) {
  if (points <= 0) return 0;
  if (points <= 5) return 1;
  if (points <= 10) return 2;
  if (points <= 20) return 3;
  return 4;
}

function finiteNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}
