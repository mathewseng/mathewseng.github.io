const { spawn } = require("child_process");
const path = require("path");

const args = parseArgs(process.argv.slice(2));
const variant = String(args.variant || "").toLowerCase();
const samples = Number(args.samples || 10000);
const workers = Number(args.workers || 8);
const shards = Number(args.shards || workers);
const output = path.resolve(args.output || path.join(__dirname, "../precomputed-parts"));
const scenarios = [0, 1, 2].flatMap((jokers) => [14, 15, 16, 17].map((cards) => ({ cards, jokers })));
const precomputeScript = path.join(__dirname, "precompute-config.cjs");
const mergeScript = path.join(__dirname, "merge-precomputed-shards.cjs");
const children = new Set();

if (!variant) fail("--variant is required");
if (!Number.isSafeInteger(samples) || samples < 1) fail("--samples must be a positive whole number");
if (!Number.isSafeInteger(workers) || workers < 1) fail("--workers must be a positive whole number");
if (!Number.isSafeInteger(shards) || shards < 1 || shards > samples) fail("--shards must be between 1 and the sample count");

const tasks = [];
scenarios.forEach(({ cards, jokers }) => {
  for (let shard = 0; shard < shards; shard += 1) {
    const start = Math.floor((samples * shard) / shards);
    const end = Math.floor((samples * (shard + 1)) / shards);
    tasks.push({ cards, jokers, start, end });
  }
});
tasks.sort((left, right) =>
  right.jokers - left.jokers ||
  right.cards - left.cards ||
  left.start - right.start
);

let cursor = 0;
let completed = 0;
let failed = false;
const started = Date.now();

const statusTimer = setInterval(() => {
  const elapsedMinutes = ((Date.now() - started) / 60000).toFixed(1);
  console.log("Progress: " + completed + "/" + tasks.length + " shards in " + elapsedMinutes + "m");
}, 30000);

process.on("SIGINT", () => {
  failed = true;
  clearInterval(statusTimer);
  children.forEach((child) => child.kill("SIGINT"));
  process.exitCode = 130;
});

for (let index = 0; index < Math.min(workers, tasks.length); index += 1) launchNext();

function launchNext() {
  if (failed) return;
  if (cursor >= tasks.length) {
    if (children.size === 0) finish();
    return;
  }

  const task = tasks[cursor];
  cursor += 1;
  const child = spawn(process.execPath, [
    precomputeScript,
    "--variant", variant,
    "--cards", String(task.cards),
    "--jokers", String(task.jokers),
    "--samples", String(samples),
    "--start", String(task.start),
    "--end", String(task.end),
    "--output", output,
  ], { stdio: ["ignore", "ignore", "pipe"] });
  let errorOutput = "";
  child.stderr.on("data", (chunk) => {
    errorOutput = (errorOutput + chunk.toString()).slice(-4000);
  });
  children.add(child);
  child.on("close", (code) => {
    children.delete(child);
    if (code !== 0) {
      failed = true;
      clearInterval(statusTimer);
      children.forEach((running) => running.kill("SIGINT"));
      console.error("Shard failed: " + JSON.stringify(task));
      if (errorOutput) console.error(errorOutput);
      process.exitCode = code || 1;
      return;
    }
    completed += 1;
    console.log("Complete: " + variant + " " + task.cards + "C/" + task.jokers + "J [" + task.start + "," + task.end + ")");
    launchNext();
  });
}

function finish() {
  clearInterval(statusTimer);
  const merge = spawn(process.execPath, [
    mergeScript,
    "--variant", variant,
    "--samples", String(samples),
    "--input", output,
  ], { stdio: "inherit" });
  merge.on("close", (code) => {
    process.exitCode = code || 0;
  });
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
