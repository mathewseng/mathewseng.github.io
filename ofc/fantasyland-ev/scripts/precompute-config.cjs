const fs = require("fs");
const path = require("path");

const Core = require("../../fantasyland-core.js");
const TrainerCore = require("../../fantasyland-trainer/app.js");
const args = parseArgs(process.argv.slice(2));
const variant = Core.normalizeVariant(args.variant);
const solverId = solverIdForVariant(variant);
const cards = Number(args.cards);
const jokers = Number(args.jokers);
const target = Number(args.samples || 10000);
const outputDirectory = path.resolve(args.output || path.join(__dirname, "../precomputed-parts"));
const sampleStart = args.start === undefined ? 0 : Number(args.start);
const sampleEnd = args.end === undefined ? target : Number(args.end);

if (!Core.VARIANT_ORDER.includes(variant)) fail(`Unknown variant: ${args.variant || ""}`);
if (![14, 15, 16, 17].includes(cards)) fail("--cards must be 14, 15, 16, or 17");
if (![0, 1, 2].includes(jokers)) fail("--jokers must be 0, 1, or 2");
if (!Number.isSafeInteger(target) || target < 1) fail("--samples must be a positive whole number");
if (!Number.isSafeInteger(sampleStart) || !Number.isSafeInteger(sampleEnd) || sampleStart < 0 || sampleEnd > target || sampleStart >= sampleEnd) {
  fail("--start and --end must define a non-empty range within --samples");
}

fs.mkdirSync(outputDirectory, { recursive: true });
const ranged = sampleStart !== 0 || sampleEnd !== target;
const shardDirectory = path.join(outputDirectory, "shards");
if (ranged) fs.mkdirSync(shardDirectory, { recursive: true });
const outputPath = ranged
  ? path.join(shardDirectory, `${variant}-${cards}-${jokers}-${sampleStart}-${sampleEnd}.json`)
  : path.join(outputDirectory, `${variant}-${cards}-${jokers}.json`);
const rangeSamples = sampleEnd - sampleStart;
const checkpointSamples = ranged ? 25 : 100;
const aggregate = loadAggregate(outputPath);
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
  addSample(aggregate, solveSample(ids, variant));
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
  const payload = {
    schemaVersion: 1,
    solver: solverId,
    generatedAt: new Date().toISOString(),
    variant,
    cards,
    jokers,
    sampleStart,
    sampleEnd,
    result: finalizeAggregate(aggregate),
  };
  const temporaryPath = `${outputPath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(payload)}\n`);
  fs.renameSync(temporaryPath, outputPath);
  lastSaved = aggregate.samples;
}

function loadAggregate(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const totals = parsed?.result?.totals;
    const parsedStart = Number.isSafeInteger(parsed?.sampleStart) ? parsed.sampleStart : 0;
    const parsedEnd = Number.isSafeInteger(parsed?.sampleEnd) ? parsed.sampleEnd : target;
    const intervalMatches = ranged
      ? parsedStart === sampleStart && parsedEnd === sampleEnd
      : parsedStart === 0 && finite(totals?.samples) <= target;
    if (parsed?.solver !== solverId || parsed?.variant !== variant || parsed?.cards !== cards || parsed?.jokers !== jokers || !intervalMatches || !totals) {
      return createAggregate();
    }
    return {
      samples: finite(totals.samples),
      immediateSum: finite(totals.immediateSum),
      immediateSquared: finite(totals.immediateSquared),
      strategySum: finite(totals.strategySum),
      repeatCount: finite(totals.repeatCount),
      repeatPointSum: finite(totals.repeatPointSum),
      qualifyCount: finite(totals.qualifyCount),
      distribution: Array.from({ length: 5 }, (_, index) => finite(totals.distribution?.[index])),
    };
  } catch (error) {
    return createAggregate();
  }
}

function solveSample(ids, selectedVariant) {
  const solved = TrainerCore.solveVariantHand(ids, selectedVariant, { allowUnsupportedCardCount: true });
  if (selectedVariant === "high" && !solved.best) throw new Error("High Fantasyland must always have a legal board.");
  return solved;
}

function solverIdForVariant(selectedVariant) {
  return selectedVariant === "high" ? "trainer-exact-high-20260902a" : "trainer-matched-variants-20260902c";
}

function createAggregate() {
  return { samples: 0, immediateSum: 0, immediateSquared: 0, strategySum: 0, repeatCount: 0, repeatPointSum: 0, qualifyCount: 0, distribution: [0, 0, 0, 0, 0] };
}

function addSample(targetAggregate, solved) {
  const immediate = solved.bestRoyalty ? finite(solved.bestRoyalty.points) : 0;
  const strategy = solved.best ? finite(solved.best.points) : 0;
  targetAggregate.samples += 1;
  targetAggregate.immediateSum += immediate;
  targetAggregate.immediateSquared += immediate * immediate;
  targetAggregate.strategySum += strategy;
  targetAggregate.distribution[royaltyBandIndex(immediate)] += 1;
  if (solved.best) targetAggregate.qualifyCount += 1;
  if (solved.bestRepeat) {
    targetAggregate.repeatCount += 1;
    targetAggregate.repeatPointSum += finite(solved.bestRepeat.points);
  }
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
    totals: { ...value, distribution: value.distribution.slice() },
  };
}

function royaltyBandIndex(points) {
  if (points <= 0) return 0;
  if (points <= 5) return 1;
  if (points <= 10) return 2;
  if (points <= 20) return 3;
  return 4;
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
  console.error("Usage: node precompute-config.cjs --variant high --cards 14 --jokers 0 --samples 10000 [--start N --end N] [--output PATH]");
  process.exit(1);
}
