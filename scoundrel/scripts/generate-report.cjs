// Only public observations cross the native boundary. Checkpoint every finished
// game, and publish a contiguous cohort without dropping unfavorable outcomes.
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const E = require("../engine.js"), Native = require("./native-solver.cjs"), H = require("../reports/history-codec.js");
const D = require("./study-data.cjs");
const argument = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=") ?? fallback;
const count = Number(process.argv[2] || 1000), iterations = Number(argument("iterations", 4096));
const workers = Number(argument("workers", Math.min(8, os.availableParallelism())));
const output = path.resolve(argument("output", path.join(__dirname, "../reports/outcomes.json")));
const checkpoint = path.resolve(argument("checkpoint", path.join(os.tmpdir(), `scoundrel-hidden-${Native.revision.slice(0, 16)}-${iterations}.jsonl`)));
const progressFile = path.resolve(argument("progress", checkpoint + ".progress.json"));
const deadlineText = argument("deadline", ""), deadline = deadlineText ? Date.parse(deadlineText) : Infinity;
const seedPrefix = argument("seed-prefix", "scoundrel-study-v1-"), rows = new Map(), pool = [];
let stopping = false, started = Date.now(), resumed = 0, wins = 0, sum = 0;
if (!Number.isInteger(count) || count < 1 || count > 1000000 || !Number.isInteger(workers) || workers < 1 || workers > 64 || !Number.isInteger(iterations) || iterations < 16 || Number.isNaN(deadline)) throw Error("Invalid study settings");
fs.mkdirSync(path.dirname(checkpoint), { recursive: true });
if (fs.existsSync(checkpoint)) {
  const content = fs.readFileSync(checkpoint, "utf8"), complete = content.lastIndexOf("\n") + 1;
  // A killed process can leave one incomplete final record; previous records are durable.
  if (complete !== content.length) fs.truncateSync(checkpoint, complete);
  for (const text of content.slice(0, complete).split("\n").filter(Boolean)) {
    const row = JSON.parse(text);
    if (row.revision !== Native.revision || row.iterations !== iterations || row.seed !== D.seedFor(seedPrefix, row.index)) throw Error("Incompatible study checkpoint");
    if (rows.has(row.index)) throw Error("Duplicate checkpoint index");
    if (row.index < count) { D.verify(row, seedPrefix); row.line = Array.isArray(row.line) ? H.encode(row.line) : row.line; rows.set(row.index, row); }
  }
}
resumed = rows.size; for (const row of rows.values()) { wins += +row.survived; sum += row.score; }
function progress(status, extra = {}) {
  const elapsed = (Date.now() - started) / 1000, rate = (rows.size - resumed) / Math.max(1, elapsed);
  D.atomicJSON(progressFile, { status, pid: process.pid, startedAt: new Date(started).toISOString(), updatedAt: new Date().toISOString(), requestedDeals: count, completedDeals: rows.size, resumedDeals: resumed, iterations, workers, revision: Native.revision, mean: rows.size ? sum / rows.size : null, wins, elapsedSeconds: elapsed, gamesPerSecond: rate, projectedFinish: rate ? new Date(Date.now() + (count - rows.size) / rate * 1000).toISOString() : null, deadline: deadlineText || null, checkpoint, output, ...extra });
}
process.on("SIGTERM", () => { stopping = true; progress("finishing-active-games"); });
process.on("SIGINT", () => { stopping = true; progress("finishing-active-games"); });
async function main() {
  const binary = Native.compile();
  const queue = Array.from({ length: count }, (_, i) => i).filter(i => !rows.has(i)); let next = 0;
  progress("running");
  console.log(`${queue.length} hidden-deck games remaining; ${iterations} simulations per decision; checkpoint ${checkpoint}`);
  const timer = setInterval(() => progress(stopping ? "finishing-active-games" : "running"), 30000);
  try {
    await Promise.all(Array.from({ length: Math.min(workers, queue.length) }, async () => {
      const solver = Native.createSolver(binary); pool.push(solver);
      try {
        while (next < queue.length && !stopping && Date.now() < deadline) {
          const index = queue[next++], seed = D.seedFor(seedPrefix, index), line = [];
          let state = E.createGame({ seed }), searches = 0, elapsedMs = 0, heuristicSkips = 0;
          while (E.actions(state).length) {
            let action;
            if (state.phase === "ready") action = { type: "descend" };
            else {
              const result = await solver.analyze(E.observe(state), { iterations });
              action = result.action; searches++; elapsedMs += result.elapsed; heuristicSkips += result.heuristicSkips;
            }
            line.push(action); state = E.transition(state, action);
          }
          const row = { keepSlots: true, index, seed, score: E.score(state), survived: state.phase === "won", verified: true, searches, elapsedMs, heuristicSkips, line: H.encode(line), revision: Native.revision, iterations };
          D.verify(row, seedPrefix); rows.set(index, row); wins += +row.survived; sum += row.score;
          fs.appendFileSync(checkpoint, JSON.stringify(row) + "\n");
          if (rows.size % 100 === 0 || rows.size === count || count <= 10) {
            progress("running");console.log(`${rows.size}/${count} games; ${wins} survived; ${((Date.now() - started) / 1000).toFixed(1)}s elapsed`);
          }
        }
      } finally { solver.close(); }
    }));
    progress("verifying");
    const data = D.publish({ rows: rows.values(), output, seedPrefix, requestedDeals: count,
      policy: { keepSlots: [...rows.values()].every(row => row.keepSlots === true), name: "Hidden-deck Monte Carlo tree search", exact: false, revision: Native.revision, iterations, treeDepth: 9, minimumRootSamples: 48, knownEndgameCards: 8 },
      startedAt: new Date(started).toISOString(), deadline: deadlineText || undefined });
    progress("complete", { publishedDeals: data.completedDeals, deadlineReached: data.completedDeals < count });
    console.log(`Published ${data.completedDeals} replay-verified hidden-deck policy outcomes to ${output}`);
  } finally { clearInterval(timer); }
}
main().catch(error => { console.error(error); pool.forEach(s => s.abort()); progress("failed", { error: error.message }); process.exitCode = 1; });
