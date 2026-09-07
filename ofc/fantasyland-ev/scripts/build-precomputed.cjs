const fs = require("fs");
const path = require("path");

const Core = require("../../fantasyland-core.js");
const args = parseArgs(process.argv.slice(2));
const target = Number(args.samples || 10000);
const inputDirectory = path.resolve(args.input || path.join(__dirname, "../precomputed-parts"));
const jacksPlusInputDirectory = path.resolve(args["jacks-plus-input"] || path.join(inputDirectory, "jacks-plus"));
const outputPath = path.resolve(args.output || path.join(__dirname, "../precomputed.js"));
const scenarios = [0, 1, 2].flatMap((jokers) => [14, 15, 16, 17].map((cards) => ({ cards, jokers })));
const results = {};
const topRepeatJacksPlusResults = {};
const missing = [];
const JACKS_PLUS_VARIANTS = ["low", "badeucey", "cribbage"];
const DATASET_SOLVER_ID = "trainer-exactdist-20260907b+trainer-exact-jjjplus-20260907b";

if (!Number.isSafeInteger(target) || target < 10000) fail("The production baseline requires at least 10,000 samples per configuration.");

Core.ACTIVE_VARIANT_ORDER.forEach((variant) => {
  results[variant] = {};
  scenarios.forEach(({ cards, jokers }) => {
    const filePath = path.join(inputDirectory, `${variant}-${cards}-${jokers}.json`);
    try {
      const part = JSON.parse(fs.readFileSync(filePath, "utf8"));
      const solverId = solverIdForVariant(variant);
      if (part.solver !== solverId || (part.topRepeatMinRank ?? null) !== null || part.variant !== variant || part.cards !== cards || part.jokers !== jokers || Number(part.result?.samples) < target || Number(part.result?.totals?.samples) !== Number(part.result?.samples)) throw new Error("incomplete");
      if (variant === "high" && Number(part.result.totals.qualifyCount) !== Number(part.result.samples)) throw new Error("High Fantasyland contains a false foul");
      if (!hasCompleteRepeatDetails(part.result.totals, variant)) throw new Error("incomplete repeat-source detail data");
      results[variant][`${cards}-${jokers}`] = part.result;
    } catch (error) {
      missing.push(`${variant} ${cards}C/${jokers}J`);
    }
  });
});

JACKS_PLUS_VARIANTS.forEach((variant) => {
  topRepeatJacksPlusResults[variant] = {};
  scenarios.forEach(({ cards, jokers }) => {
    const filePath = path.join(jacksPlusInputDirectory, `${variant}-${cards}-${jokers}.json`);
    try {
      const part = JSON.parse(fs.readFileSync(filePath, "utf8"));
      const solverId = solverIdForVariant(variant, 11);
      if (
        part.solver !== solverId
        || part.variant !== variant
        || part.cards !== cards
        || part.jokers !== jokers
        || part.topRepeatMinRank !== 11
        || Number(part.result?.samples) < target
        || Number(part.result?.totals?.samples) !== Number(part.result?.samples)
      ) throw new Error("incomplete");
      const result = withExactDistribution(part.result, results[variant][`${cards}-${jokers}`]);
      if (!hasCompleteRepeatDetails(result.totals, variant, 11)) throw new Error("incomplete repeat-source detail data");
      topRepeatJacksPlusResults[variant][`${cards}-${jokers}`] = result;
    } catch (error) {
      missing.push(`${variant} JJJ+ ${cards}C/${jokers}J`);
    }
  });
});

applyRecursiveEv(results, Core.ACTIVE_VARIANT_ORDER);
applyRecursiveEv(topRepeatJacksPlusResults, JACKS_PLUS_VARIANTS);

if (missing.length) fail(`Incomplete precomputed rows (${missing.length}/${(Core.ACTIVE_VARIANT_ORDER.length + JACKS_PLUS_VARIANTS.length) * scenarios.length}):\n${missing.join("\n")}`);

const dataset = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  samplesPerConfig: target,
  solver: DATASET_SOLVER_ID,
  results,
  topRepeatJacksPlusResults,
};
fs.writeFileSync(outputPath, `window.OFCFantasylandPrecomputed = Object.freeze(${JSON.stringify(dataset)});\n`);
console.log(`Wrote ${outputPath} with ${target.toLocaleString()} samples across ${(Core.ACTIVE_VARIANT_ORDER.length + JACKS_PLUS_VARIANTS.length) * scenarios.length} result configurations.`);

function solverIdForVariant(variant, minimumTopRank = null) {
  if (minimumTopRank !== null) {
    return variant === "cribbage"
      ? "trainer-exact-cribbage-jjjplus-exactdist-20260907b"
      : `trainer-exact-${variant}-jjjplus-exactdist-20260907b`;
  }
  if (variant === "high") return "trainer-exact-high-exactdist-20260907a";
  if (variant === "low") return "trainer-exact-low-exactdist-20260907b";
  if (variant === "badeucey") return "trainer-exact-badeucey-exactdist-20260907b";
  if (variant === "bdp") return "trainer-exact-bdp-wheel-exactdist-20260907b";
  if (variant === "cribbage") return "trainer-exact-cribbage-exactdist-20260907b";
  return "trainer-matched-variants-20260902c";
}

function withExactDistribution(result, baseResult) {
  if (!baseResult?.totals || baseResult.totals.distribution?.length !== 128) throw new Error("missing exact base distribution");
  const repeatDetails = {
    ...result.repeatDetails,
    topBdpWheel: Number(result.repeatDetails?.topBdpWheel) || 0,
  };
  const totals = {
    ...result.totals,
    distribution: baseResult.totals.distribution.slice(),
    repeatDetails: {
      ...result.totals.repeatDetails,
      topBdpWheel: Number(result.totals.repeatDetails?.topBdpWheel) || 0,
    },
  };
  return {
    ...result,
    distribution: baseResult.distribution.slice(),
    repeatDetails,
    totals,
  };
}

function repeatSourceTotal(totals) {
  return Array.from({ length: 7 }, (_, index) => Number(totals?.repeatSources?.[index + 1]) || 0).reduce((sum, count) => sum + count, 0);
}

function applyRecursiveEv(store, variants) {
  variants.forEach((variant) => {
    [14, 15, 16, 17].forEach((cards) => {
      const exact = [0, 1, 2].map((jokers) => store[variant]?.[`${cards}-${jokers}`]);
      if (exact.some((result) => !result)) return;
      const weights = [0, 1, 2].map((jokers) => jokerProbability(cards, jokers, 2));
      const futureStrategy = exact.reduce((sum, result, jokers) => sum + Number(result.strategy) * weights[jokers], 0);
      const futureRepeat = exact.reduce((sum, result, jokers) => sum + Number(result.recursiveRepeatRate) * weights[jokers], 0);
      const continuation = futureStrategy / Math.max(Number.EPSILON, 1 - futureRepeat);
      exact.forEach((result, jokers) => {
        result.recursive = jokers === 0
          ? Number(result.strategy) / Math.max(Number.EPSILON, 1 - Number(result.recursiveRepeatRate))
          : Number(result.strategy) + Number(result.recursiveRepeatRate) * continuation;
      });
    });
  });
}

function jokerProbability(cards, jokers, deckJokers) {
  return (choose(deckJokers, jokers) * choose(52, cards - jokers)) / choose(52 + deckJokers, cards);
}

function choose(n, k) {
  if (k < 0 || k > n) return 0;
  const size = Math.min(k, n - k);
  let value = 1;
  for (let index = 1; index <= size; index += 1) value = (value * (n - size + index)) / index;
  return value;
}

function hasCompleteRepeatDetails(totals, variant, minimumTopRank = null) {
  const details = totals?.repeatDetails;
  if (
    repeatSourceTotal(totals) !== Number(totals?.repeatCount)
    || !Array.isArray(details?.topTripsByRank)
    || details.topTripsByRank.length < 15
    || !Number.isFinite(Number(details?.topBdpWheel))
    || !Array.isArray(details?.bottomQuadsByRank)
    || details.bottomQuadsByRank.length < 15
    || !Array.isArray(details?.bottomStraightFlushByRank)
    || details.bottomStraightFlushByRank.length < 15
    || !Array.isArray(details?.cribbageMiddleByScore)
    || details.cribbageMiddleByScore.length < 30
  ) return false;
  const topExpected = [1, 3, 5, 7].reduce((sum, mask) => sum + (Number(totals.repeatSources[mask]) || 0), 0);
  const bottomExpected = [4, 5, 6, 7].reduce((sum, mask) => sum + (Number(totals.repeatSources[mask]) || 0), 0);
  const topTotal = details.topTripsByRank.reduce((sum, count) => sum + (Number(count) || 0), 0)
    + (Number(details.topBdpWheel) || 0);
  const rankedStraightFlushTotal = details.bottomStraightFlushByRank.reduce((sum, count) => sum + (Number(count) || 0), 0);
  const straightFlushTotal = (Number(details.bottomStraightFlush) || 0) + (Number(details.bottomRoyalFlush) || 0);
  const bottomTotal = details.bottomQuadsByRank.reduce((sum, count) => sum + (Number(count) || 0), 0)
    + rankedStraightFlushTotal;
  const cribbageTotal = details.cribbageMiddleByScore.reduce((sum, count) => sum + (Number(count) || 0), 0);
  const middleExpected = variant === "cribbage" ? Number(totals.qualifyCount) : 0;
  const belowMinimumTopTrips = minimumTopRank === null
    ? 0
    : details.topTripsByRank.slice(0, minimumTopRank).reduce((sum, count) => sum + (Number(count) || 0), 0);
  const exactDistribution = Array.isArray(totals.distribution)
    && totals.distribution.length >= 100
    && totals.distribution.reduce((sum, count) => sum + (Number(count) || 0), 0) === Number(totals.samples);
  return topTotal === topExpected
    && bottomTotal === bottomExpected
    && rankedStraightFlushTotal === straightFlushTotal
    && cribbageTotal === middleExpected
    && belowMinimumTopTrips === 0
    && exactDistribution;
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
