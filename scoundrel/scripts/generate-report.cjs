// Fixed work budgets with an emergency time guard. Every row has a legal witness.
const fs = require("node:fs");
const path = require("node:path");
const { Worker, isMainThread, parentPort } = require("node:worker_threads");
const E = require("../engine.js"), S = require("../solver.js");
const SETTINGS = { timeMs: 600000, maxNodes: 900000, beamWidth: 160, rollouts: 48 };
if (!isMainThread) {
  parentPort.on("message", ({ index, seed }) => {
    const state = E.createGame({ seed }), r = S.solve(state, SETTINGS);
    let replay = state;
    for (const action of r.line) replay = E.transition(replay, action);
    if (E.score(replay) !== r.score) throw new Error("Unverified report outcome");
    parentPort.postMessage({ index, seed, score: r.score, upper: r.exact ? r.score : r.ceiling, exact: r.exact, nodes: r.nodes, line: r.line });
  });
} else {
  const count = Number(process.argv[2] || 128);
  const output = path.resolve(__dirname, "../reports/outcomes.json");
  const rows = [], pool = [];
  let next = 0;
  const publish = () => {
    const sorted = rows.slice().sort((a, b) => a.index - b.index);
    const payload = { version: 1, study: "scoundrel-oracle-v1", generatedAt: new Date().toISOString(), rules: "strict-weapon-chain", information: "Full remaining dungeon order", objective: "Maximize final score, including potion bonus and negative loss score", seedPrefix: "scoundrel-study-v1-", requestedDeals: count, settings: SETTINGS, rows: sorted };
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output + ".tmp", JSON.stringify(payload) + "\n");
    fs.renameSync(output + ".tmp", output);
  };
  for (let i = 0; i < Math.min(4, count); i++) {
    const worker = new Worker(__filename); pool.push(worker);
    worker.on("error", (e) => { console.error(e); process.exitCode = 1; for (const w of pool) w.terminate(); });
    const dispatch = () => { if (next >= count) return worker.terminate(); const index = next++; worker.postMessage({ index, seed: "scoundrel-study-v1-" + String(index).padStart(4, "0") }); };
    worker.on("message", (row) => { rows.push(row); if (rows.length === count) publish(); if (rows.length % 8 === 0 || rows.length === count) { const exact = rows.filter((r) => r.exact).length; console.log(`${rows.length}/${count} deals, ${exact} proven, achieved mean ${(rows.reduce((n, r) => n + r.score, 0) / rows.length).toFixed(3)}`); } dispatch(); });
    dispatch();
  }
}
