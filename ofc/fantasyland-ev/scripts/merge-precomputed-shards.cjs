const fs = require("fs");
const path = require("path");

const Core = require("../../fantasyland-core.js");
const args = parseArgs(process.argv.slice(2));
const target = Number(args.samples || 10000);
const inputDirectory = path.resolve(args.input || path.join(__dirname, "../precomputed-parts"));
const shardDirectory = path.join(inputDirectory, "shards");
const scenarios = [0, 1, 2].flatMap((jokers) => [14, 15, 16, 17].map((cards) => ({ cards, jokers })));
const selectedVariants = args.variant ? [String(args.variant).toLowerCase()] : Core.ACTIVE_VARIANT_ORDER;
const selectedCards = args.cards === undefined ? null : Number(args.cards);
const selectedJokers = args.jokers === undefined ? null : Number(args.jokers);
const topRepeatMinRank = args["top-repeat-min-rank"] === undefined ? null : Number(args["top-repeat-min-rank"]);

if (!Number.isSafeInteger(target) || target < 1) fail("--samples must be a positive whole number");
if (selectedVariants.some((variant) => !Core.VARIANT_ORDER.includes(variant))) fail(`Unknown variant: ${args.variant}`);
if (selectedCards !== null && ![14, 15, 16, 17].includes(selectedCards)) fail("--cards must be 14, 15, 16, or 17");
if (selectedJokers !== null && ![0, 1, 2].includes(selectedJokers)) fail("--jokers must be 0, 1, or 2");
if (topRepeatMinRank !== null && (!Number.isSafeInteger(topRepeatMinRank) || topRepeatMinRank < 2 || topRepeatMinRank > 14)) {
  fail("--top-repeat-min-rank must be a rank from 2 through 14");
}

let merged = 0;
selectedVariants.forEach((variant) => scenarios
  .filter(({ cards, jokers }) => (selectedCards === null || cards === selectedCards) && (selectedJokers === null || jokers === selectedJokers))
  .forEach(({ cards, jokers }) => {
  const solverId = solverIdForVariant(variant, topRepeatMinRank);
  const outputPath = path.join(inputDirectory, `${variant}-${cards}-${jokers}.json`);
  const prefix = fs.existsSync(outputPath) ? readPart(outputPath, solverId, true) || emptyPart(variant, cards, jokers) : emptyPart(variant, cards, jokers);
  if (prefix.result.totals.samples === target) {
    if (variant === "high" && prefix.result.totals.qualifyCount !== target) fail(`High Fantasyland false foul in ${cards}C/${jokers}J`);
    return;
  }

  const intervals = [{
    start: 0,
    end: prefix.result.totals.samples,
    totals: prefix.result.totals,
    source: outputPath,
  }];
  const prefixName = `${variant}-${cards}-${jokers}-`;
  const shardNames = fs.existsSync(shardDirectory)
    ? fs.readdirSync(shardDirectory).filter((name) => name.startsWith(prefixName) && name.endsWith(".json"))
    : [];

  shardNames.forEach((name) => {
    const source = path.join(shardDirectory, name);
    const part = readPart(source, solverId, true);
    if (!part) return;
    if (part.variant !== variant || part.cards !== cards || part.jokers !== jokers) fail(`Mismatched shard metadata: ${source}`);
    const start = Number(part.sampleStart);
    const end = Number(part.sampleEnd);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end <= start || part.result.totals.samples !== end - start) {
      fail(`Invalid shard interval: ${source}`);
    }
    intervals.push({ start, end, totals: part.result.totals, source });
  });

  intervals.sort((left, right) => left.start - right.start || left.end - right.end);
  let cursor = 0;
  const aggregate = createAggregate();
  intervals.forEach((interval) => {
    if (interval.start !== cursor) fail(`Gap or overlap for ${variant} ${cards}C/${jokers}J at sample ${cursor}: ${interval.source}`);
    addTotals(aggregate, interval.totals);
    cursor = interval.end;
  });
  if (cursor !== target || aggregate.samples !== target) fail(`Incomplete shards for ${variant} ${cards}C/${jokers}J: ${cursor}/${target}`);
  if (variant === "high" && aggregate.qualifyCount !== target) fail(`High Fantasyland false foul in ${cards}C/${jokers}J`);

  const payload = {
    schemaVersion: 1,
    solver: solverId,
    generatedAt: new Date().toISOString(),
    variant,
    topRepeatMinRank,
    cards,
    jokers,
    sampleStart: 0,
    sampleEnd: target,
    result: finalizeAggregate(aggregate),
  };
  const temporaryPath = `${outputPath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(payload)}\n`);
  fs.renameSync(temporaryPath, outputPath);
  merged += 1;
}));

console.log(`Merged ${merged} configuration${merged === 1 ? "" : "s"} to ${target.toLocaleString()} samples.`);

function emptyPart(variant, cards, jokers) {
  return {
    variant,
    cards,
    jokers,
    result: { totals: createAggregate() },
  };
}

function readPart(filePath, solverId, ignoreWrongSolver = false) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!parsed?.result?.totals) fail(`Missing raw totals: ${filePath}`);
    if (parsed.solver !== solverId || (parsed.topRepeatMinRank ?? null) !== topRepeatMinRank) {
      if (ignoreWrongSolver) return null;
      fail(`Wrong solver or repeat policy in ${filePath}: ${parsed.solver || "unknown"}`);
    }
    return parsed;
  } catch (error) {
    fail(`Could not read ${filePath}: ${error.message}`);
  }
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

function addTotals(targetAggregate, totals) {
  targetAggregate.samples += finite(totals.samples);
  targetAggregate.immediateSum += finite(totals.immediateSum);
  targetAggregate.immediateSquared += finite(totals.immediateSquared);
  targetAggregate.strategySum += finite(totals.strategySum);
  targetAggregate.repeatCount += finite(totals.repeatCount);
  targetAggregate.repeatPointSum += finite(totals.repeatPointSum);
  for (let index = 0; index < 8; index += 1) targetAggregate.repeatSources[index] += finite(totals.repeatSources?.[index]);
  addRepeatDetails(targetAggregate.repeatDetails, totals.repeatDetails);
  targetAggregate.qualifyCount += finite(totals.qualifyCount);
  for (let index = 0; index < 5; index += 1) targetAggregate.distribution[index] += finite(totals.distribution?.[index]);
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

function solverIdForVariant(variant, minimumTopRank = null) {
  if (minimumTopRank !== null) return `trainer-matched-${variant}-jjjplus-20260903a`;
  if (variant === "high") return "trainer-exact-high-20260903b";
  if (variant === "low") return "trainer-matched-low-20260903a";
  if (variant === "badeucey") return "trainer-matched-badeucey-20260903a";
  if (variant === "bdp") return "trainer-matched-bdp-20260903a";
  if (variant === "cribbage") return "trainer-matched-cribbage-20260903c";
  return "trainer-matched-variants-20260902c";
}

function createRepeatDetails() {
  return {
    topTripsByRank: Array(15).fill(0),
    bottomQuadsByRank: Array(15).fill(0),
    bottomStraightFlush: 0,
    bottomRoyalFlush: 0,
    cribbageMiddleByScore: Array(30).fill(0),
  };
}

function copyRepeatDetails(value) {
  return {
    topTripsByRank: Array.from({ length: 15 }, (_, index) => finite(value?.topTripsByRank?.[index])),
    bottomQuadsByRank: Array.from({ length: 15 }, (_, index) => finite(value?.bottomQuadsByRank?.[index])),
    bottomStraightFlush: finite(value?.bottomStraightFlush),
    bottomRoyalFlush: finite(value?.bottomRoyalFlush),
    cribbageMiddleByScore: Array.from({ length: 30 }, (_, index) => finite(value?.cribbageMiddleByScore?.[index])),
  };
}

function addRepeatDetails(target, value) {
  const incoming = copyRepeatDetails(value);
  for (let index = 0; index < 15; index += 1) {
    target.topTripsByRank[index] += incoming.topTripsByRank[index];
    target.bottomQuadsByRank[index] += incoming.bottomQuadsByRank[index];
  }
  target.bottomStraightFlush += incoming.bottomStraightFlush;
  target.bottomRoyalFlush += incoming.bottomRoyalFlush;
  for (let index = 0; index < 30; index += 1) target.cribbageMiddleByScore[index] += incoming.cribbageMiddleByScore[index];
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 2) parsed[values[index].replace(/^--/, "")] = values[index + 1];
  return parsed;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
