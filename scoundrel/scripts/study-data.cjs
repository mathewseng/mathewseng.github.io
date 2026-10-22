const fs = require("node:fs"), path = require("node:path"), { createHash } = require("node:crypto");
const E = require("../engine.js"), H = require("../reports/history-codec.js");
const seedFor = (prefix, index) => prefix + String(index).padStart(4, "0");
function verify(row, seedPrefix, keepSlots = row.keepSlots === true) {
  if (!Number.isInteger(row.index) || row.index < 0 || row.seed !== seedFor(seedPrefix, row.index)) throw Error("Unexpected study seed");
  const line = Array.isArray(row.line) ? row.line : H.decode(row.line);
  if (!line.length) throw Error("Missing history");
  let state = E.createGame({ seed: row.seed, keepSlots });
  for (const action of line) state = E.transition(state, action);
  if (!["won", "lost"].includes(state.phase) || E.score(state) !== row.score || row.survived !== (state.phase === "won")) throw Error("Report replay failed at deal " + row.index);
  return line;
}
function atomicJSON(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = file + ".tmp-" + process.pid;
  fs.writeFileSync(temporary, JSON.stringify(value) + "\n"); fs.renameSync(temporary, file);
}
function publish({ rows, output, seedPrefix, requestedDeals, policy, startedAt, deadline }) {
  rows = [...rows].sort((a, b) => a.index - b.index);
  if (!rows.length || rows.some((r, i) => r.index !== i)) throw Error("Only a contiguous, unfiltered cohort can be published");
  const chunkSize = 1000, directory = `histories/${policy.revision.slice(0, 16)}-${policy.iterations}`, hashes = [];
  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    const lines = chunk.map(row => { const line = verify(row, seedPrefix, policy.keepSlots === true); return H.encode(line); });
    const shard = { version: 1, revision: policy.revision, iterations: policy.iterations, start, lines };
    const file = path.join(path.dirname(output), directory, `${String(start).padStart(6, "0")}.json`);
    atomicJSON(file, shard); hashes.push(createHash("sha256").update(fs.readFileSync(file)).digest("hex"));
  }
  const data = {
    version: 4, study: "scoundrel-hidden-deck-v1", generatedAt: new Date().toISOString(), startedAt, deadline,
    rules: "strict-weapon-chain-bidirectional-avoidance",
    information: "Revealed cards, unseen card counts, and remembered bottom returns; no unseen order or shuffle seed",
    objective: "Maximize estimated expected final score", seedPrefix, requestedDeals, completedDeals: rows.length, verifiedDeals: rows.length,
    policy, scores: rows.map(r => r.score), histories: { format: "actions-u8-base64-v1", directory, chunkSize, sha256: hashes },
  };
  // Shards are in place before the small manifest is replaced.
  atomicJSON(output, data); return data;
}
function* iterateRows(data, output) {
  if (data.version === 3) { yield* data.rows; return; }
  const { directory, chunkSize } = data.histories;
  for (let start = 0; start < data.scores.length; start += chunkSize) {
    const file = path.join(path.dirname(output), directory, `${String(start).padStart(6, "0")}.json`), bytes = fs.readFileSync(file);
    if (createHash("sha256").update(bytes).digest("hex") !== data.histories.sha256[start / chunkSize]) throw Error("History checksum mismatch");
    const shard = JSON.parse(bytes);
    if (shard.start !== start || shard.revision !== data.policy.revision || shard.iterations !== data.policy.iterations || shard.lines.length !== Math.min(chunkSize, data.scores.length - start)) throw Error("History shard mismatch");
    for (const [i, line] of shard.lines.entries()) { const index = start + i; yield { index, seed: seedFor(data.seedPrefix, index), score: data.scores[index], survived: data.scores[index] > 0, verified: true, ...(data.policy.keepSlots ? { keepSlots: true } : {}), line: H.decode(line) }; }
  }
}
function readRows(data, output, limit = Infinity) {
  const rows = [];
  for (const row of iterateRows(data, output)) { if (rows.length >= limit) break; rows.push(row); }
  return rows;
}
module.exports = { seedFor, verify, atomicJSON, publish, readRows, iterateRows };
