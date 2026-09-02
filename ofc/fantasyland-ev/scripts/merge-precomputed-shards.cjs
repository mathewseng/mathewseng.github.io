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

if (!Number.isSafeInteger(target) || target < 1) fail("--samples must be a positive whole number");
if (selectedVariants.some((variant) => !Core.VARIANT_ORDER.includes(variant))) fail(`Unknown variant: ${args.variant}`);
if (selectedCards !== null && ![14, 15, 16, 17].includes(selectedCards)) fail("--cards must be 14, 15, 16, or 17");
if (selectedJokers !== null && ![0, 1, 2].includes(selectedJokers)) fail("--jokers must be 0, 1, or 2");

let merged = 0;
selectedVariants.forEach((variant) => scenarios
  .filter(({ cards, jokers }) => (selectedCards === null || cards === selectedCards) && (selectedJokers === null || jokers === selectedJokers))
  .forEach(({ cards, jokers }) => {
  const solverId = solverIdForVariant(variant);
  const outputPath = path.join(inputDirectory, `${variant}-${cards}-${jokers}.json`);
  const prefix = fs.existsSync(outputPath) ? readPart(outputPath, solverId) : emptyPart(variant, cards, jokers);
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
    const part = readPart(source, solverId);
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

function readPart(filePath, solverId) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!parsed?.result?.totals) fail(`Missing raw totals: ${filePath}`);
    if (parsed.solver !== solverId) fail(`Wrong solver data in ${filePath}: ${parsed.solver || "unknown"}`);
    return parsed;
  } catch (error) {
    fail(`Could not read ${filePath}: ${error.message}`);
  }
}

function createAggregate() {
  return { samples: 0, immediateSum: 0, immediateSquared: 0, strategySum: 0, repeatCount: 0, repeatPointSum: 0, qualifyCount: 0, distribution: [0, 0, 0, 0, 0] };
}

function addTotals(targetAggregate, totals) {
  targetAggregate.samples += finite(totals.samples);
  targetAggregate.immediateSum += finite(totals.immediateSum);
  targetAggregate.immediateSquared += finite(totals.immediateSquared);
  targetAggregate.strategySum += finite(totals.strategySum);
  targetAggregate.repeatCount += finite(totals.repeatCount);
  targetAggregate.repeatPointSum += finite(totals.repeatPointSum);
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
    totals: { ...value, distribution: value.distribution.slice() },
  };
}

function finite(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function solverIdForVariant(variant) {
  return variant === "high" ? "trainer-exact-high-20260902a" : "trainer-matched-variants-20260902c";
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
