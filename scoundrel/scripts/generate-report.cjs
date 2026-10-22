// Evaluate a non-peeking policy on a fixed cohort. Only observations cross the
// native-solver boundary. Report realized scores, not hindsight optima.
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const E = require("../engine.js"), Native = require("./native-solver.cjs");
const argument = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=") ?? fallback;
const count = Number(process.argv[2] || 1000), iterations = Number(argument("iterations", 2048));
const workers = Number(argument("workers", Math.min(6, os.availableParallelism())));
const output = path.resolve(argument("output", path.join(__dirname, "../reports/outcomes.json")));
const checkpoint = path.resolve(argument("checkpoint", path.join(os.tmpdir(), `scoundrel-hidden-${Native.revision.slice(0, 16)}-${iterations}.jsonl`)));
const seedPrefix = "scoundrel-study-v1-", rows = new Map(), pool = [];
if (!Number.isInteger(count) || count < 1 || !Number.isInteger(workers) || workers < 1 || !Number.isInteger(iterations) || iterations < 16) throw Error("Invalid study settings");
if (count !== 1000 && output === path.resolve(__dirname, "../reports/outcomes.json")) throw Error("The public report requires 1,000 deals. Use --output for smaller development cohorts.");
if (fs.existsSync(checkpoint)) for (const text of fs.readFileSync(checkpoint, "utf8").trim().split("\n").filter(Boolean)) {
  const row = JSON.parse(text);
  if (row.revision !== Native.revision || row.iterations !== iterations) throw Error("Incompatible study checkpoint");
  if (row.index < count) rows.set(row.index, row);
}
function verify(row) {
  if (row.seed !== seedPrefix + String(row.index).padStart(4, "0")) throw Error("Unexpected study seed");
  let s = E.createGame({ seed: row.seed });
  for (const action of row.line) s = E.transition(s, action);
  if (!["won", "lost"].includes(s.phase) || E.score(s) !== row.score) throw Error("Report replay failed");
}
async function main() {
  const binary = Native.compile(), started = Date.now();
  rows.forEach(verify);
  const queue = Array.from({ length: count }, (_, i) => i).filter(i => !rows.has(i)); let next = 0;
  console.log(`${queue.length} hidden-deck games remaining; ${iterations} simulations per decision; checkpoint ${checkpoint}`);
  await Promise.all(Array.from({ length: Math.min(workers, queue.length) }, async () => {
    const solver = Native.createSolver(binary); pool.push(solver);
    try {
      while (next < queue.length) {
        const index = queue[next++], seed = seedPrefix + String(index).padStart(4, "0"), line = [];
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
        const row = { index, seed, score: E.score(state), survived: state.phase === "won", verified: true, searches, elapsedMs, heuristicSkips, line, revision: Native.revision, iterations };
        verify(row); rows.set(index, row); fs.appendFileSync(checkpoint, JSON.stringify(row) + "\n");
        if (rows.size % 25 === 0 || rows.size === count || count <= 10) console.log(`${rows.size}/${count} games; ${[...rows.values()].filter(r => r.survived).length} survived; ${(Date.now() - started) / 1000}s elapsed`);
      }
    } finally { solver.close(); }
  }));
  const sorted = [...rows.values()].sort((a, b) => a.index - b.index); sorted.forEach(verify);
  if (sorted.length !== count) throw Error("Incomplete cohort; report unchanged");
  const data = { version: 3, study: "scoundrel-hidden-deck-v1", generatedAt: new Date().toISOString(), rules: "strict-weapon-chain-bidirectional-avoidance", information: "Revealed cards, unseen card counts, and remembered bottom returns; no unseen order or shuffle seed", objective: "Maximize estimated expected final score", seedPrefix, requestedDeals: count, policy: { name: "Hidden-deck Monte Carlo tree search", exact: false, revision: Native.revision, iterations, treeDepth: 9, minimumRootSamples: 48, knownEndgameCards: 8 }, rows: sorted.map(({ revision, iterations, ...row }) => row) };
  fs.writeFileSync(output + ".tmp", JSON.stringify(data) + "\n"); fs.renameSync(output + ".tmp", output);
  console.log(`Published ${count} replay-verified hidden-deck policy outcomes to ${output}`);
}
main().catch(error => { console.error(error); pool.forEach(s => s.abort()); process.exitCode = 1; });
