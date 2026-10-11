// Real browser/WASM study. Run from the repository root after assembling _site.
// Checkpoints are append-only; rerun the same command to resume unfinished work.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { webkit } = require("playwright");
const { launchQuietBrowser } = require("../../scripts/quiet-browser.cjs");

const root = process.cwd();
const site = path.resolve(process.env.BG_SITE || "_site");
const checkpoint = path.resolve(process.env.BG_CHECKPOINT || "backgammon/test-results/depth-study/checkpoint.jsonl");
const output = path.resolve(process.env.BG_OUTPUT || "backgammon/test-results/depth-study/results.json");
const sha = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");
const command = (cmd, args) => {
  try { return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { return null; }
};
const environment = () => ({
  cpu: os.cpus()[0].model, cores: os.cpus().length,
  memoryGB: os.totalmem() / 1024 ** 3, os: `${os.platform()} ${os.release()} ${os.arch()}`,
  battery: command("pmset", ["-g", "batt"]), powerSettings: command("pmset", ["-g", "custom"]),
  loadAverage: os.loadavg(),
});
const corpusBytes = fs.readFileSync("backgammon/data/accuracy-reference.json");
const corpus = JSON.parse(corpusBytes);
const engineFiles = [];
function collect(folder) {
  for (const entry of fs.readdirSync(path.join(root, folder), { withFileTypes: true })) {
    const relative = path.join(folder, entry.name);
    if (entry.isDirectory()) collect(relative);
    else if (/\.(mjs|js|wasm|data|json)$/.test(relative)) engineFiles.push(relative);
  }
}
collect("backgammon/engine");
engineFiles.push("backgammon/core/rules.mjs", "backgammon/core/xgid.mjs", "backgammon/data/accuracy-reference.json");
const hashes = Object.fromEntries(engineFiles.sort().map(file => {
  const original = fs.readFileSync(path.join(root, file));
  if (!original.equals(fs.readFileSync(path.join(site, file)))) throw Error(`Assembled asset mismatch: ${file}`);
  return [file, sha(original)];
}));
const signature = sha(JSON.stringify({ schema: 1, corpus: sha(corpusBytes), hashes, browser: "webkit", methodology: "fresh-worker-per-depth-v1" }));
fs.mkdirSync(path.dirname(checkpoint), { recursive: true });
fs.mkdirSync(path.dirname(output), { recursive: true });
// A killed process may leave a partial final line. All complete lines are durable.
let events = [];
if (fs.existsSync(checkpoint)) {
  const text = fs.readFileSync(checkpoint, "utf8");
  const boundary = text.lastIndexOf("\n") + 1;
  events = text.slice(0, boundary).split("\n").filter(Boolean).map(JSON.parse);
  if (boundary !== text.length) fs.truncateSync(checkpoint, Buffer.byteLength(text.slice(0, boundary)));
}
const append = (event) => {
  fs.appendFileSync(checkpoint, JSON.stringify(event) + "\n");
  events.push(event);
};
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost").pathname;
  const file = path.join(site, url.endsWith("/") ? url + "index.html" : url);
  if (!file.startsWith(site + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404); res.end(); return; }
    res.setHeader("Content-Type", ({ ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".json": "application/json", ".css": "text/css", ".wasm": "application/wasm" })[path.extname(file)] || "application/octet-stream");
    res.end(data);
  });
});

(async () => {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await launchQuietBrowser(webkit);
    const browserVersion = browser.version();
    if (events.length && (events[0].signature !== signature || events[0].browser.version !== browserVersion))
      throw Error("Checkpoint belongs to different assets/settings/browser. Choose a new BG_CHECKPOINT.");
    if (!events.length) append({
      type: "header", schema: 1, signature, startedAt: new Date().toISOString(),
      revision: command("git", ["rev-parse", "HEAD"]), corpusSha256: sha(corpusBytes), hashes,
      browser: { name: "webkit", version: browserVersion }, environment: environment(),
      method: "300 existing reference positions; 100 each contact/race/crashed. Fixed 2/3/4-ply product presets. One fresh worker/native cache per position/depth, one worker at a time; HTTP/compilation caches may be warm. Local HTTP, assembled production WASM, no artificial CPU throttling. Classes interleaved and depth order rotated. One timing sample per position/depth, excluding separately recorded startup. Supplemental grading is outside baseline timing. Background apps remain running. Desktop benchmark, not physical-phone testing.",
    });
    append({ type: "session", at: new Date().toISOString(), environment: environment() });
    const page = await browser.newPage({ serviceWorkers: "block" });
    await page.goto(`http://127.0.0.1:${server.address().port}/backgammon/`);
    await page.exposeFunction("recordDepth", event => {
      append({ ...event, at: new Date().toISOString() });
      const done = events.filter(e => e.type === "sample").length;
      console.log(`${done}/900 ${event.topic}:${event.line} ${event.preset} ${event.type} ${(event.wallMs / 1000).toFixed(3)}s`);
    });
    const completed = events.filter(e => ["sample", "grade"].includes(e.type));
    const metadata = await page.evaluate(async ({ corpus, completed }) => {
      const { EngineClient } = await import("/backgammon/engine/client.mjs");
      const { ENGINE_VERSION, PRESETS } = await import("/backgammon/engine/metadata.mjs");
      const { legalTurns, positionKey } = await import("/backgammon/core/rules.mjs");
      const byId = new Map(completed.map(e => [`${e.index}:${e.type}:${e.preset}`, e]));
      const topics = ["contact", "race", "crashed"];
      const groups = topics.map(topic => corpus.items.map((item, index) => ({ ...item, index })).filter(item => item.topic === topic));
      const schedule = Array.from({ length: 100 }, (_, n) => groups.map(group => group[n])).flat();
      const presets = ["deep", "expert", "research"];
      async function evaluate(row, preset, submitted = null) {
        const engine = new EngineClient({ openingBook: null });
        try {
          const start = performance.now();
          await engine.start();
          const startupWallMs = performance.now() - start;
          const begin = performance.now();
          const result = await engine.analyze(row.state, { preset, submitted });
          const event = {
            type: submitted ? "grade" : "sample", index: row.index, topic: row.topic, line: row.line, key: row.key,
            preset, positionKey: positionKey(row.state), wallMs: performance.now() - begin,
            computeMs: result.elapsedMs, startupWallMs, startup: engine.startup, backend: result.backend,
            settings: result.settings, engine: result.engine,
            candidates: result.candidates.map(c => ({ key: c.key, notation: c.notation, equity: c.equity })),
            screening: result.screening ? { plies: result.screening.plies, total: result.screening.total, finalists: result.screening.finalists } : null,
            submittedKey: result.actual?.key ?? null,
          };
          if (!event.candidates.length || event.candidates.some(c => !Number.isFinite(c.equity))) throw Error("Invalid candidates");
          await window.recordDepth(event);
          byId.set(`${row.index}:${event.type}:${preset}`, event);
          return event;
        } finally { engine.destroy(); }
      }
      for (const [order, row] of schedule.entries()) {
        // Rotate by sample number within class as well as class.
        const offset = (Math.floor(order / 3) + order % 3) % 3;
        for (let n = 0; n < 3; n++) {
          const preset = presets[(n + offset) % 3];
          if (!byId.has(`${row.index}:sample:${preset}`)) await evaluate(row, preset);
        }
        const expert = byId.get(`${row.index}:sample:expert`);
        const research = byId.get(`${row.index}:sample:research`);
        // The 4-ply root screen is narrower. Explicitly score an omitted 3-ply
        // winner at 4 ply, without replacing the default 4-ply result/timing.
        if (!research.candidates.some(c => c.key === expert.candidates[0].key) && !byId.has(`${row.index}:grade:research`)) {
          const turn = legalTurns(row.state).find(t => t.key === expert.candidates[0].key);
          if (!turn) throw Error("3-ply winner not in legal turn set");
          await evaluate(row, "research", turn.steps);
        }
      }
      return { engine: ENGINE_VERSION, presets: PRESETS };
    }, { corpus, completed });
    const report = {
      ...events[0], ...metadata, finishedAt: new Date().toISOString(), environmentEnd: environment(),
      sources: corpus.sources, description: corpus.description,
      sessions: events.filter(e => e.type === "session"),
      samples: events.filter(e => e.type === "sample").sort((a, b) => a.index - b.index || a.settings.plies - b.settings.plies),
      supplementalGrades: events.filter(e => e.type === "grade"),
    };
    fs.writeFileSync(output, JSON.stringify(report) + "\n");
    console.log(`COMPLETE ${report.samples.length} depth samples, ${report.supplementalGrades.length} supplemental grades. ${output}`);
  } finally { await browser?.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
