const fs = require("fs");
const path = require("path");

const Core = require("../../fantasyland-core.js");
const args = parseArgs(process.argv.slice(2));
const target = Number(args.samples || 10000);
const inputDirectory = path.resolve(args.input || path.join(__dirname, "../precomputed-parts"));
const outputPath = path.resolve(args.output || path.join(__dirname, "../precomputed.js"));
const scenarios = [0, 1, 2].flatMap((jokers) => [14, 15, 16, 17].map((cards) => ({ cards, jokers })));
const results = {};
const missing = [];

if (!Number.isSafeInteger(target) || target < 10000) fail("The production baseline requires at least 10,000 samples per configuration.");

Core.VARIANT_ORDER.forEach((variant) => {
  results[variant] = {};
  scenarios.forEach(({ cards, jokers }) => {
    const filePath = path.join(inputDirectory, `${variant}-${cards}-${jokers}.json`);
    try {
      const part = JSON.parse(fs.readFileSync(filePath, "utf8"));
      const solverId = variant === "high" ? "trainer-exact-high-20260902a" : "bounded-search-20260901e";
      if (part.solver !== solverId || part.variant !== variant || part.cards !== cards || part.jokers !== jokers || Number(part.result?.samples) < target || Number(part.result?.totals?.samples) !== Number(part.result?.samples)) throw new Error("incomplete");
      if (variant === "high" && Number(part.result.totals.qualifyCount) !== Number(part.result.samples)) throw new Error("High Fantasyland contains a false foul");
      results[variant][`${cards}-${jokers}`] = part.result;
    } catch (error) {
      missing.push(`${variant} ${cards}C/${jokers}J`);
    }
  });
});

if (missing.length) fail(`Incomplete precomputed rows (${missing.length}/84):\n${missing.join("\n")}`);

const dataset = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  samplesPerConfig: target,
  solver: "trainer-exact-high-20260902a+bounded-variants-20260901e",
  results,
};
fs.writeFileSync(outputPath, `window.OFCFantasylandPrecomputed = Object.freeze(${JSON.stringify(dataset)});\n`);
console.log(`Wrote ${outputPath} with ${target.toLocaleString()} samples across all 84 configurations.`);

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 2) parsed[values[index].replace(/^--/, "")] = values[index + 1];
  return parsed;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
