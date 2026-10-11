// Research-only, real WebKit/WASM diagnostic sample; not a strength benchmark.
// BG_PILOT_BUILD=$(build-five-ply-pilot.sh's printed path) node .../five-ply-pilot.cjs
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { webkit } = require("playwright");
const { launchQuietBrowser } = require("../../scripts/quiet-browser.cjs");
const root = process.cwd();
const build = process.env.BG_PILOT_BUILD;
if (!build) throw Error("Set BG_PILOT_BUILD to the experimental build directory.");
const output = path.resolve(process.env.BG_OUTPUT || "backgammon/test-results/five-ply-pilot/results.json");
fs.mkdirSync(path.dirname(output), { recursive: true });
const sha = data => crypto.createHash("sha256").update(data).digest("hex");
const command = (cmd, args) => { try { return execFileSync(cmd, args, { encoding: "utf8" }).trim(); } catch { return null; } };
const environment = () => ({ cpu: os.cpus()[0].model, cores: os.cpus().length, os: `${os.platform()} ${os.release()} ${os.arch()}`, memoryGB: os.totalmem() / 1024 ** 3, power: command("pmset", ["-g", "batt"]), powerSettings: command("pmset", ["-g", "custom"]), load: os.loadavg() });
const corpusBytes = fs.readFileSync("backgammon/data/accuracy-reference.json");
const studyBytes = fs.readFileSync("backgammon/docs/depth-study-results.json");
const corpus = JSON.parse(corpusBytes), study = JSON.parse(studyBytes);
// Chosen before this experiment: three diagnostic disagreements, a near tie,
// an oscillating race, and one stable crashed case. This is intentionally NOT
// a random/representative six-position sample or an update to the 300 mean.
const selection = [
  [58, "4-ply root screen omitted the 3-ply winner"],
  [89, "large historical-reference improvement at 4 ply"],
  [139, "near-tie race with omitted 3-ply winner"],
  [150, "race changed at 3 ply and returned at 4 ply"],
  [216, "large historical-reference regression at 4 ply"],
  [250, "stable crashed control"],
];
const workerSource = `
import create from '/experiment/gnubg-core-module.js';
const module = await create({ locateFile: p => '/experiment/' + p });
if (module.cwrap('init', 'number', [])() !== 0) throw Error('Initialization failed');
const score = module.cwrap('bg_score', 'number', ['string','string','number','number']);
postMessage({type:'ready'});
onmessage = ({data}) => {
  try {
    const begin = performance.now();
    const candidates = data.candidates.map(c => {
      const start = performance.now(), ptr = score(data.original, c.after, data.depth, 0);
      if (!ptr) throw Error('Empty native result');
      let value;
      try { value = JSON.parse(module.UTF8ToString(ptr)); } finally { module._free(ptr); }
      if(value.error || !Number.isFinite(value.equity)) throw Error(value.error || 'Invalid equity');
      postMessage({type:'progress',key:c.key,depth:data.depth,elapsedMs:performance.now()-start});
      return {...c, ...value};
    });
    candidates.sort((a,b)=>b.equity-a.equity);
    postMessage({type:'result', candidates, computeMs:performance.now()-begin});
  } catch(error) {postMessage({type:'error',error:error.message});}
};`;
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost").pathname;
  res.setHeader("Content-Type", ({ ".mjs": "text/javascript", ".js": "text/javascript", ".wasm": "application/wasm", ".json": "application/json" })[path.extname(url)] || "text/html");
  if (url === "/") return res.end("<!doctype html><title>Five-ply diagnostic pilot</title>");
  if (url === "/experiment/worker.mjs") return res.end(workerSource);
  const base = url.startsWith("/experiment/") ? path.resolve(build, "dist_simd") : root;
  const file = path.resolve(base, "." + (url.startsWith("/experiment/") ? url.slice("/experiment".length) : url));
  if (!file.startsWith(base + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (error, data) => { if (error) res.writeHead(404); res.end(error ? "Not found" : data); });
});
(async () => {
  const { legalTurns, notation, assertState } = await import("../core/rules.mjs");
  const { toXGID } = await import("../core/xgid.mjs");
  const jobs = selection.map(([index, reason]) => {
    const row = corpus.items[index], turns = legalTurns(row.state), old = study.samples.filter(s => s.index === index);
    assertState(row.state);
    const old4 = old.find(s => s.settings.plies === 4);
    const keys = [...new Set([...old4.candidates.map(c => c.key), ...old.map(s => s.candidates[0].key), row.reference[0].key])];
    const candidates = keys.map(key => {
      const turn = turns.find(t => t.key === key);
      if (!turn) throw Error(`Illegal candidate ${index}`);
      return { key, notation: notation(turn.steps, row.state.turn), after: toXGID({ ...turn.state, dice: [], phase: "roll" }, { engine: true }), referenceLoss: row.reference.find(r => r.key === key)?.loss ?? null };
    });
    return { index, topic: row.topic, line: row.line, reason, state: row.state, original: toXGID(row.state, { engine: true }), candidates, production4: old4.candidates, production4WallMs: old4.wallMs };
  });
  const report = {
    schema: 1, startedAt: new Date().toISOString(), revision: command("git", ["rev-parse", "HEAD"]),
    engine: study.engine + "+five-ply-checker-pilot", selection, environment: environment(),
    method: "Six deliberately selected diagnostic cases. Same fixed candidate union at 4 and 5 ply: original 4-ply finalists, all 2/3/4-ply winners, and historical-reference leader. This pool is informed by the earlier study/reference and is not an independent accuracy test. One fresh worker per position/depth; depth order alternates. No root-screen cost included; one timing observation per job, local HTTP, browser caches may be warm. 300-second timeout per job terminates the worker. Genuine single-thread SIMD WASM; checker binding guard is the only C source modification from bg5.",
    hashes: { corpus: sha(corpusBytes), previousStudy: sha(studyBytes), sourceArchive: sha(fs.readFileSync("backgammon/engine/source/gnubg-core-955555c-bg5.tar.gz")), bridge: sha(fs.readFileSync(path.join(build,"src/bridge.c"))), worker:sha(workerSource), script:sha(fs.readFileSync(__filename)), ...Object.fromEntries(["js","wasm","data"].map(ext=>[ext,sha(fs.readFileSync(path.join(build,"dist_simd",`gnubg-core-module.${ext}`)))])) },
    jobs, samples: [],
  };
  const save = () => fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
  let browser;
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    browser = await launchQuietBrowser(webkit);
    report.browser = { name: "webkit", version: browser.version() }; save();
    const page = await browser.newPage({ serviceWorkers: "block" });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.exposeFunction("pilotProgress", e => console.log(JSON.stringify(e)));
    for (const [i, job] of jobs.entries()) for (const depth of (i % 2 ? [5,4] : [4,5])) {
      const sample = await page.evaluate(({job,depth}) => new Promise(resolve => {
        const start = performance.now(), worker = new Worker('/experiment/worker.mjs', {type:'module'});
        let computeStart, startupMs;
        const finish = result => { clearTimeout(timeout); worker.terminate(); resolve({index:job.index,depth,startupMs, ...result}); };
        const timeout = setTimeout(()=>finish({status:'timeout',wallMs:performance.now()-(computeStart??start)}),300000);
        worker.onerror = event => finish({status:'error',error:event.message});
        worker.onmessage = ({data}) => {
          if(data.type==='ready') {startupMs=performance.now()-start; computeStart=performance.now(); worker.postMessage({original:job.original,candidates:job.candidates,depth});}
          else if(data.type==='progress') window.pilotProgress({index:job.index,...data});
          else if(data.type==='error') finish({status:'error',error:data.error});
          else if(data.type==='result') finish({status:'complete',wallMs:performance.now()-computeStart,computeMs:data.computeMs,candidates:data.candidates});
        };
      }), {job,depth});
      report.samples.push(sample); save();
      if(sample.status!=='complete') throw Error(`${job.index}/${depth}: ${sample.status}`);
      if(depth===4) for(const old of job.production4) {
        const current = sample.candidates.find(c=>c.key===old.key);
        if(!current || Math.abs(current.equity-old.equity)>0.00001) throw Error(`4-ply parity failed: ${job.index}`);
      }
      console.log(`COMPLETE ${job.topic}:${job.line} ${depth} ply ${(sample.wallMs/1000).toFixed(3)}s ${sample.candidates[0].notation}`);
    }
    report.finishedAt = new Date().toISOString(); report.environmentEnd = environment();
    report.validation = { allCandidatesLegal:true, fourPlyMatchesProductionWithin:0.00001, allSamplesCompleted:true };
    save(); console.log(output);
  } finally { await browser?.close(); server.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
