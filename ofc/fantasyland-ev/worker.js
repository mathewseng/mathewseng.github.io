"use strict";

importScripts("../fantasyland-core.js?v=20260902b", "../fantasyland-trainer/app.js?v=20260902b");

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
    addSample(aggregate, solveSample(ids, task.variant));
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
  return { samples: 0, immediateSum: 0, immediateSquared: 0, strategySum: 0, repeatCount: 0, repeatPointSum: 0, qualifyCount: 0, distribution: [0, 0, 0, 0, 0] };
}

function solveSample(ids, variant) {
  if (variant === "high") {
    const solved = TrainerCore.solveHand(ids);
    if (!solved.best) throw new Error("High Fantasyland must always have a legal board.");
    return solved;
  }
  const splitVariant = variant === "badugijack" || variant === "doubleblackjack";
  const searchBounds = splitVariant
    ? { maskLimit: 40, beamLimit: 24 }
    : { maskLimit: 140, beamLimit: 72 };
  const analysisOptions = { allowUnsupportedCardCount: true };
  let solved = Core.solveHand(ids, { variant, mode: "fast", ...searchBounds, ...analysisOptions });
  if (solved.best || !Core.hasQualifyingMiddle(ids, variant, analysisOptions)) return solved;

  return splitVariant
    ? Core.solveHand(ids, { variant, mode: "fast", maskLimit: 80, beamLimit: 48, ...analysisOptions })
    : ids.length === 14
      ? Core.solveHand(ids, { variant, mode: "exact", ...analysisOptions })
      : Core.solveHand(ids, { variant, mode: "fast", maskLimit: 320, beamLimit: 180, ...analysisOptions });
}

function addSample(aggregate, solved) {
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
  }
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
