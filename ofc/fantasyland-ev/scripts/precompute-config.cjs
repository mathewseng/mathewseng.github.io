const fs = require("fs");
const path = require("path");

const Core = require("../../fantasyland-core.js");
const TrainerCore = require("../../fantasyland-trainer/app.js");
const ROYALTY_DISTRIBUTION_SIZE = 128;
const args = parseArgs(process.argv.slice(2));
const variant = Core.normalizeVariant(args.variant);
const topRepeatMinRank = args["top-repeat-min-rank"] === undefined ? null : Number(args["top-repeat-min-rank"]);
const pairedTopRepeatMinRank = args["paired-top-repeat-min-rank"] === undefined ? null : Number(args["paired-top-repeat-min-rank"]);
const solverId = solverIdForVariant(variant, topRepeatMinRank);
const pairedSolverId = pairedTopRepeatMinRank === null ? null : solverIdForVariant(variant, pairedTopRepeatMinRank);
const cards = Number(args.cards);
const jokers = Number(args.jokers);
const target = Number(args.samples || 10000);
const outputDirectory = path.resolve(args.output || path.join(__dirname, "../precomputed-parts"));
const pairedOutputDirectory = args["paired-output"] ? path.resolve(args["paired-output"]) : null;
const sampleStart = args.start === undefined ? 0 : Number(args.start);
const sampleEnd = args.end === undefined ? target : Number(args.end);

if (!Core.VARIANT_ORDER.includes(variant)) fail(`Unknown variant: ${args.variant || ""}`);
if (![14, 15, 16, 17].includes(cards)) fail("--cards must be 14, 15, 16, or 17");
if (![0, 1, 2].includes(jokers)) fail("--jokers must be 0, 1, or 2");
if (topRepeatMinRank !== null && (!Number.isSafeInteger(topRepeatMinRank) || topRepeatMinRank < 2 || topRepeatMinRank > 14)) {
  fail("--top-repeat-min-rank must be a rank from 2 through 14");
}
if (pairedTopRepeatMinRank !== null && (!Number.isSafeInteger(pairedTopRepeatMinRank) || pairedTopRepeatMinRank < 2 || pairedTopRepeatMinRank > 14)) {
  fail("--paired-top-repeat-min-rank must be a rank from 2 through 14");
}
if (Boolean(pairedOutputDirectory) !== (pairedTopRepeatMinRank !== null)) fail("--paired-output and --paired-top-repeat-min-rank must be used together");
if (pairedOutputDirectory && topRepeatMinRank !== null) fail("A paired run must use the default repeat rule as its primary result");
if (!Number.isSafeInteger(target) || target < 1) fail("--samples must be a positive whole number");
if (!Number.isSafeInteger(sampleStart) || !Number.isSafeInteger(sampleEnd) || sampleStart < 0 || sampleEnd > target || sampleStart >= sampleEnd) {
  fail("--start and --end must define a non-empty range within --samples");
}

const ranged = sampleStart !== 0 || sampleEnd !== target;
const outputPath = resultPath(outputDirectory);
const pairedOutputPath = pairedOutputDirectory ? resultPath(pairedOutputDirectory) : null;
const rangeSamples = sampleEnd - sampleStart;
const checkpointSamples = ranged ? 25 : 100;
let aggregate = loadAggregate(outputPath, solverId, topRepeatMinRank);
let pairedAggregate = pairedOutputPath ? loadAggregate(pairedOutputPath, pairedSolverId, pairedTopRepeatMinRank) : null;
if (pairedAggregate && aggregate.samples !== pairedAggregate.samples) {
  aggregate = createAggregate();
  pairedAggregate = createAggregate();
}
let lastSaved = aggregate.samples;
let lastReported = Date.now();

process.on("SIGINT", () => {
  savePart();
  process.exit(130);
});

for (let offset = aggregate.samples; offset < rangeSamples; offset += 1) {
  const sample = sampleStart + offset;
  const seedText = `EV-PRECOMPUTED-v1-${variant}-${cards}C-${jokers}J-${sample}`;
  const ids = Core.dealSeeded(cards, jokers, Core.hashSeed(seedText).toString(16));
  const solved = solveSample(ids, variant, topRepeatMinRank);
  addSample(aggregate, solved, variant);
  if (pairedAggregate) addSample(pairedAggregate, pairedSolution(ids, variant, solved, pairedTopRepeatMinRank), variant);
  if (aggregate.samples - lastSaved >= checkpointSamples) savePart();
  if (Date.now() - lastReported >= 30000) {
    const percent = ((aggregate.samples / rangeSamples) * 100).toFixed(2);
    const rangeLabel = ranged ? ` [${sampleStart},${sampleEnd})` : "";
    console.log(`${variant} ${cards}C/${jokers}J${rangeLabel}: ${aggregate.samples.toLocaleString()}/${rangeSamples.toLocaleString()} (${percent}%)`);
    lastReported = Date.now();
  }
}

savePart();
console.log(`Complete: ${outputPath} (${aggregate.samples.toLocaleString()} samples)`);

function savePart() {
  writePart(outputPath, aggregate, solverId, topRepeatMinRank);
  if (pairedAggregate) writePart(pairedOutputPath, pairedAggregate, pairedSolverId, pairedTopRepeatMinRank);
  lastSaved = aggregate.samples;
}

function writePart(filePath, value, partSolverId, minimumTopRank) {
  const payload = {
    schemaVersion: 1,
    solver: partSolverId,
    generatedAt: new Date().toISOString(),
    variant,
    topRepeatMinRank: minimumTopRank,
    cards,
    jokers,
    sampleStart,
    sampleEnd,
    result: finalizeAggregate(value),
  };
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(payload)}\n`);
  fs.renameSync(temporaryPath, filePath);
}

function resultPath(directory) {
  fs.mkdirSync(directory, { recursive: true });
  const shardDirectory = path.join(directory, "shards");
  if (ranged) fs.mkdirSync(shardDirectory, { recursive: true });
  return ranged
    ? path.join(shardDirectory, `${variant}-${cards}-${jokers}-${sampleStart}-${sampleEnd}.json`)
    : path.join(directory, `${variant}-${cards}-${jokers}.json`);
}

function loadAggregate(filePath, expectedSolverId, expectedTopRepeatMinRank) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const totals = parsed?.result?.totals;
    const parsedStart = Number.isSafeInteger(parsed?.sampleStart) ? parsed.sampleStart : 0;
    const parsedEnd = Number.isSafeInteger(parsed?.sampleEnd) ? parsed.sampleEnd : target;
    const intervalMatches = ranged
      ? parsedStart === sampleStart && parsedEnd === sampleEnd
      : parsedStart === 0 && finite(totals?.samples) <= target;
    if (
      parsed?.solver !== expectedSolverId
      || parsed?.variant !== variant
      || parsed?.cards !== cards
      || parsed?.jokers !== jokers
      || (parsed?.topRepeatMinRank ?? null) !== expectedTopRepeatMinRank
      || !intervalMatches
      || !totals
    ) {
      return createAggregate();
    }
    return {
      samples: finite(totals.samples),
      immediateSum: finite(totals.immediateSum),
      immediateSquared: finite(totals.immediateSquared),
      strategySum: finite(totals.strategySum),
      repeatCount: finite(totals.repeatCount),
      repeatPointSum: finite(totals.repeatPointSum),
      repeatSources: Array.from({ length: 8 }, (_, index) => finite(totals.repeatSources?.[index])),
      repeatDetails: copyRepeatDetails(totals.repeatDetails),
      qualifyCount: finite(totals.qualifyCount),
      distribution: Array.from({ length: ROYALTY_DISTRIBUTION_SIZE }, (_, index) => finite(totals.distribution?.[index])),
    };
  } catch (error) {
    return createAggregate();
  }
}

function solveSample(ids, selectedVariant, minimumTopRank = null) {
  const solved = TrainerCore.solveVariantHand(ids, selectedVariant, {
    allowUnsupportedCardCount: true,
    ...(minimumTopRank === null ? {} : { topRepeatMinRank: minimumTopRank }),
  });
  if (selectedVariant === "high" && !solved.best) throw new Error("High Fantasyland must always have a legal board.");
  return solved;
}

function pairedSolution(ids, selectedVariant, solved, minimumTopRank) {
  if (!solved.bestRepeat) return { ...solved, best: solved.bestRoyalty, bestRepeat: null };
  const repeatMask = Core.repeatMaskFromEvaluations(
    solved.bestRepeat.top?.eval,
    solved.bestRepeat.middle?.eval,
    solved.bestRepeat.bottom?.eval,
    { topRepeatMinRank: minimumTopRank }
  );
  if (!repeatMask) return solveSample(ids, selectedVariant, minimumTopRank);
  const bestRepeat = { ...solved.bestRepeat, repeat: true, repeatMask };
  return { ...solved, best: bestRepeat, bestRepeat };
}

function solverIdForVariant(selectedVariant, minimumTopRank = null) {
  if (minimumTopRank !== null) {
    return selectedVariant === "cribbage"
      ? "trainer-exact-cribbage-jjjplus-exactdist-20260907b"
      : `trainer-exact-${selectedVariant}-jjjplus-exactdist-20260907b`;
  }
  if (selectedVariant === "high") return "trainer-exact-high-exactdist-20260907a";
  if (selectedVariant === "low") return "trainer-exact-low-exactdist-20260907b";
  if (selectedVariant === "badeucey") return "trainer-exact-badeucey-exactdist-20260907b";
  if (selectedVariant === "bdp") return "trainer-exact-bdp-wheel-exactdist-20260907b";
  if (selectedVariant === "cribbage") return "trainer-exact-cribbage-exactdist-20260907b";
  return "trainer-matched-variants-20260902c";
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
    distribution: Array(ROYALTY_DISTRIBUTION_SIZE).fill(0),
  };
}

function addSample(targetAggregate, solved, selectedVariant) {
  const immediate = solved.bestRoyalty ? finite(solved.bestRoyalty.points) : 0;
  const strategy = solved.best ? finite(solved.best.points) : 0;
  targetAggregate.samples += 1;
  targetAggregate.immediateSum += immediate;
  targetAggregate.immediateSquared += immediate * immediate;
  targetAggregate.strategySum += strategy;
  targetAggregate.distribution[Math.max(0, Math.min(ROYALTY_DISTRIBUTION_SIZE - 1, Math.trunc(immediate)))] += 1;
  if (solved.best) targetAggregate.qualifyCount += 1;
  if (solved.bestRepeat) {
    targetAggregate.repeatCount += 1;
    targetAggregate.repeatPointSum += finite(solved.bestRepeat.points);
    const repeatMask = Math.trunc(finite(solved.bestRepeat.repeatMask));
    if (repeatMask < 1 || repeatMask > 7) throw new Error("Repeat solution is missing its row-source mask.");
    targetAggregate.repeatSources[repeatMask] += 1;
    const repeatDetail = TrainerCore.repeatDetailForSolution(solved.bestRepeat);
    if (repeatDetail.topBdpWheel) targetAggregate.repeatDetails.topBdpWheel += 1;
    if (repeatDetail.topTripsRank >= 2 && repeatDetail.topTripsRank <= 14) {
      targetAggregate.repeatDetails.topTripsByRank[repeatDetail.topTripsRank] += 1;
    }
    if (repeatDetail.bottomKind === "quads" && repeatDetail.bottomQuadsRank >= 2 && repeatDetail.bottomQuadsRank <= 14) {
      targetAggregate.repeatDetails.bottomQuadsByRank[repeatDetail.bottomQuadsRank] += 1;
    } else if (repeatDetail.bottomKind === "straight-flush" || repeatDetail.bottomKind === "royal-flush") {
      if (repeatDetail.bottomKind === "royal-flush") targetAggregate.repeatDetails.bottomRoyalFlush += 1;
      else targetAggregate.repeatDetails.bottomStraightFlush += 1;
      if (repeatDetail.bottomStraightFlushRank >= 5 && repeatDetail.bottomStraightFlushRank <= 14) {
        targetAggregate.repeatDetails.bottomStraightFlushByRank[repeatDetail.bottomStraightFlushRank] += 1;
      }
    }
  }
  if (selectedVariant === "cribbage" && solved.best) {
    const score = TrainerCore.repeatDetailForSolution(solved.best).middleCribbagePoints;
    if (!Number.isInteger(score) || score < 0 || score >= targetAggregate.repeatDetails.cribbageMiddleByScore.length) {
      throw new Error(`Unexpected Cribbage middle score: ${score}`);
    }
    targetAggregate.repeatDetails.cribbageMiddleByScore[score] += 1;
  }
}

function createRepeatDetails() {
  return {
    topTripsByRank: Array(15).fill(0),
    topBdpWheel: 0,
    bottomQuadsByRank: Array(15).fill(0),
    bottomStraightFlushByRank: Array(15).fill(0),
    bottomStraightFlush: 0,
    bottomRoyalFlush: 0,
    cribbageMiddleByScore: Array(30).fill(0),
  };
}

function copyRepeatDetails(value) {
  return {
    topTripsByRank: Array.from({ length: 15 }, (_, index) => finite(value?.topTripsByRank?.[index])),
    topBdpWheel: finite(value?.topBdpWheel),
    bottomQuadsByRank: Array.from({ length: 15 }, (_, index) => finite(value?.bottomQuadsByRank?.[index])),
    bottomStraightFlushByRank: Array.from({ length: 15 }, (_, index) => finite(value?.bottomStraightFlushByRank?.[index])),
    bottomStraightFlush: finite(value?.bottomStraightFlush),
    bottomRoyalFlush: finite(value?.bottomRoyalFlush),
    cribbageMiddleByScore: Array.from({ length: 30 }, (_, index) => finite(value?.cribbageMiddleByScore?.[index])),
  };
}

function finalizeAggregate(value) {
  const n = value.samples;
  const immediate = value.immediateSum / n;
  const strategy = value.strategySum / n;
  const repeatRate = value.repeatCount / n;
  const recursiveRepeatRate = (value.repeatCount + 0.5) / (n + 1);
  const variance = Math.max(0, value.immediateSquared / n - immediate * immediate);
  return {
    samples: n,
    immediate,
    strategy,
    repeatRate,
    recursiveRepeatRate,
    repeatLine: value.repeatCount ? value.repeatPointSum / value.repeatCount : null,
    recursive: strategy / (1 - recursiveRepeatRate),
    qualifyRate: value.qualifyCount / n,
    foulRate: 1 - value.qualifyCount / n,
    standardError: Math.sqrt(variance / n),
    distribution: value.distribution.map((count) => count / n),
    repeatSources: value.repeatSources.map((count) => count / n),
    repeatDetails: copyRepeatDetails(value.repeatDetails),
    totals: { ...value, distribution: value.distribution.slice(), repeatDetails: copyRepeatDetails(value.repeatDetails) },
  };
}

function finite(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 2) parsed[values[index].replace(/^--/, "")] = values[index + 1];
  return parsed;
}

function fail(message) {
  console.error(message);
  console.error("Usage: node precompute-config.cjs --variant high --cards 14 --jokers 0 --samples 10000 [--start N --end N] [--output PATH] [--top-repeat-min-rank 11] [--paired-output PATH --paired-top-repeat-min-rank 11]");
  process.exit(1);
}
