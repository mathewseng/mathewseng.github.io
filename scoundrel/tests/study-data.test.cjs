const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const E = require("../engine.js"), H = require("../reports/history-codec.js"), D = require("../scripts/study-data.cjs"), S = require("../reports/statistics.js");
test("compact history preserves every card identity, combat mode, and avoidance direction", () => {
  const line = E.makeDeck().flatMap(c => c.type === "monster" ? [{ type: "fight", id: c.id, mode: "bare" }, { type: "fight", id: c.id, mode: "weapon" }] : [{ type: c.type === "weapon" ? "equip" : "drink", id: c.id }]);
  line.push({ type: "flee", direction: "left" }, { type: "flee", direction: "right" }, { type: "descend" });
  assert.deepEqual(H.decode(H.encode(line)), line);
  assert.throws(() => H.decode("invalid!"));assert.throws(() => H.decode(Buffer.from([255]).toString("base64")));
});
test("sharded studies retain every score and replay, and reject missing or corrupted records", () => {
  const source = require("../reports/outcomes.json"), original = D.readRows(source, require.resolve("../reports/outcomes.json"), 10);
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "scoundrel-shards-")), output = path.join(folder, "outcomes.json");
  const args = { rows: original, output, seedPrefix: source.seedPrefix, requestedDeals: 100000, policy: source.policy };
  try {
    const compact = D.publish(args); S.validate(compact);
    assert.equal(compact.completedDeals, original.length);assert.equal(compact.requestedDeals, 100000);
    const restored = D.readRows(compact, output);
    assert.deepEqual(restored, original.map(({ index, seed, score, survived, line }) => ({ index, seed, score, survived, line, verified: true })));
    restored.forEach(r => D.verify(r, source.seedPrefix));
    assert.deepEqual(S.summarize(S.studyRows(compact)), S.summarize(original));
    for (const patch of [{ verifiedDeals: 9 }, { completedDeals: 11 }, { scores: [31, ...compact.scores.slice(1)] }, { histories: { ...compact.histories, directory: "../escape" } }]) assert.throws(() => S.validate({ ...compact, ...patch }));
    assert.throws(() => D.publish({ ...args, rows: original.slice(1) }), /contiguous/);
    assert.throws(() => D.publish({ ...args, rows: [{ ...original[0], score: 31 }, ...original.slice(1)] }), /replay failed/);
    const shard = path.join(folder, compact.histories.directory, "000000.json");fs.appendFileSync(shard, " ");
    assert.throws(() => D.readRows(compact, output), /checksum/);
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
});

test("deadline resumes a verified prefix, repairs a torn record, and publishes the actual count", () => {
  const { spawnSync } = require("node:child_process"), Native = require("../scripts/native-solver.cjs");
  const source = require("../reports/outcomes.json"), rows = D.readRows(source, require.resolve("../reports/outcomes.json"), 3);
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "scoundrel-deadline-")), output = path.join(folder, "outcomes.json"), checkpoint = path.join(folder, "checkpoint.jsonl");
  try {
    fs.writeFileSync(checkpoint, rows.map(r => JSON.stringify({ ...r, line: H.encode(r.line), revision: Native.revision, iterations: source.policy.iterations }) + "\n").join("") + '{"index":3');
    const result = spawnSync(process.execPath, [path.resolve(__dirname, "../scripts/generate-report.cjs"), "100000", `--iterations=${source.policy.iterations}`, "--workers=2", `--output=${output}`, `--checkpoint=${checkpoint}`, "--deadline=2000-01-01T00:00:00Z"], { encoding: "utf8", timeout: 30000 });
    assert.equal(result.status, 0, result.stderr);
    const actual = S.validate(JSON.parse(fs.readFileSync(output, "utf8"))), progress = JSON.parse(fs.readFileSync(checkpoint + ".progress.json", "utf8"));
    assert.equal(actual.completedDeals, 3);assert.equal(actual.requestedDeals, 100000);
    assert.equal(progress.status, "complete");assert.equal(progress.deadlineReached, true);
    assert.equal(fs.readFileSync(checkpoint, "utf8").trim().split("\n").length, 3);
    assert.deepEqual(actual.scores, rows.map(r => r.score));
    for (const row of D.iterateRows(actual, output)) D.verify(row, actual.seedPrefix);
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
});
