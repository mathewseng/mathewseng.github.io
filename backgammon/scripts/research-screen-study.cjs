// SPDX-License-Identifier: GPL-3.0-or-later
// Same native engine; compare only JS screening/reuse against the pinned release.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const crypto = require('node:crypto'), os = require('node:os'), { execFileSync } = require('node:child_process');
const browsers = require('playwright'), { launchQuietBrowser } = require('../../scripts/quiet-browser.cjs');
const root = process.cwd(), ref = '97e999e2a4fd3d637ee788ecd4dcb4b571162648';
const baseline = execFileSync('git', ['show', ref + ':backgammon/engine/evaluate.mjs']);
const name = process.env.BG_BROWSER || 'chromium', samples = Number(process.env.BG_SAMPLES || 3);
if (!Number.isInteger(samples) || samples < 1 || samples > 5) throw Error('Invalid sample count');
const output = process.env.BG_OUTPUT || 'backgammon/test-results/research-screen/' + name + '.json';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const worker = `
onmessage=async({data:{state,variant,mode,submitted}})=>{try{
 const {default:create}=await import('/backgammon/engine/vendor/simd/gnubg-core-module.js');
 const {createEvaluator}=await import('/backgammon/engine/'+(variant==='baseline'?'baseline-evaluate.mjs':'evaluate.mjs'));
 const init=performance.now(),module=await create({locateFile:p=>'/backgammon/engine/vendor/'+(p.endsWith('.data')?'':'simd/')+p,print:()=>{},printErr:()=>{}});
 const calls={},cwrap=module.cwrap.bind(module);
 module.cwrap=(name,...args)=>{const fn=cwrap(name,...args);return name==='bg_score'?((...args)=>{calls[args[2]]=(calls[args[2]]||0)+1;return fn(...args);}):fn;};
 const engine=createEvaluator(module),startupMs=performance.now()-init;
 const began=performance.now();let previous=null;
 if(mode==='progressive') previous=engine.analyze(state,'expert','checker',submitted);
 if(mode==='automatic') for(const preset of ['quick','standard','deep','expert']) previous=engine.analyze(state,preset,'checker',submitted,{automatic:true,retainKeys:previous?[previous.candidates[0].key]:[]});
 const prepareMs=performance.now()-began,before={...calls},start=performance.now();
 const answer=engine.analyze(state,'research','checker',submitted,{automatic:mode==='automatic',retainKeys:mode==='automatic'?[previous.candidates[0].key]:[]});
 postMessage({answer,previous,prepareMs,researchMs:performance.now()-start,totalMs:performance.now()-began,startupMs,
  calls:Object.fromEntries(Object.entries(calls).map(([depth,count])=>[depth,count-(before[depth]||0)]))});
}catch(e){postMessage({error:e.stack});}};`;
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost').pathname;
  if (url === '/') { res.end('<!doctype html><title>Research screening comparison</title>'); return; }
  res.setHeader('Content-Type', url.endsWith('.wasm') ? 'application/wasm' : url.endsWith('.json') ? 'application/json' : 'text/javascript');
  if (url === '/study-worker.mjs') { res.end(worker); return; }
  if (url === '/backgammon/engine/baseline-evaluate.mjs') { res.end(baseline); return; }
  const file = path.resolve(root, '.' + url);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (error, bytes) => { if (error) res.writeHead(404); res.end(error ? 'Not found' : bytes); });
});
const report = { schema: 1, startedAt: new Date().toISOString(), baselineRef: ref,
  method: 'Paired fresh workers, alternating order. Same bg6 SIMD WASM and model. Direct Research, Expert then Research, and automatic progressive prefix then Research are separate workloads. Initialization excluded. Diagnostic positions are deliberately selected; not representative or independent strength evidence. Local HTTP, desktop browsers, not physical phones. Single-sample validation runs are not latency benchmarks.',
  environment: { cpu: os.cpus()[0].model, os: `${os.platform()} ${os.release()} ${os.arch()}`, load: os.loadavg() },
  hashes: { baseline: sha(baseline), script: sha(fs.readFileSync(__filename)), worker: sha(worker) }, samples, rows: [] };
for (const file of ['engine/evaluate.mjs', 'engine/metadata.mjs', 'engine/adaptive.mjs', 'core/rules.mjs',
  'engine/vendor/simd/gnubg-core-module.js', 'engine/vendor/simd/gnubg-core-module.wasm', 'engine/vendor/gnubg-core-module.data'])
  report.hashes[file] = sha(fs.readFileSync('backgammon/' + file));
const save = () => { fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n'); };
(async () => {
  const reference = JSON.parse(fs.readFileSync('backgammon/data/accuracy-reference.json')).items;
  const fixtures = JSON.parse(fs.readFileSync('backgammon/data/exercises.json')).items;
  const { initialState, legalTurns } = await import('../core/rules.mjs');
  let cases = [58, 139, 216, 245].map(index => ({ id: 'omitted-' + index, state: reference[index].state }));
  cases.push(...['opening', 'contact', 'race', 'bearoff'].map(topic => ({ id: topic, state: fixtures.find(f => f.topic === topic).state })),
    { id: 'match', state: initialState({ phase: 'move', dice: [3, 1], matchLength: 7, scores: [2, 4], cube: { value: 2, owner: 1 } }) });
  if (process.env.BG_CASES) cases = cases.filter(c => process.env.BG_CASES.split(',').includes(c.id));
  if (!cases.length) throw Error('No cases selected');
  report.cases = cases;
  const modes = (process.env.BG_MODES || 'direct,progressive,automatic').split(',');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); let browser;
  try {
    browser = await launchQuietBrowser(browsers[name]); report.browser = { name, version: browser.version() };
    const page = await browser.newPage({ serviceWorkers: 'block' }); await page.goto('http://127.0.0.1:' + server.address().port);
    for (const item of cases) for (const mode of modes) for (let sample = 0; sample < samples; sample++) {
      const submitted = process.env.BG_SUBMITTED === '1' ? legalTurns(item.state).at(-1).steps : null;
      const pair = {};
      for (const variant of sample % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate']) {
        pair[variant] = await page.evaluate(payload => new Promise((resolve, reject) => {
          const worker = new Worker('/study-worker.mjs', { type: 'module' });
          const timeout = setTimeout(() => { worker.terminate(); reject(Error('Research exceeded 180 seconds')); }, 180000);
          const done = () => { clearTimeout(timeout); worker.terminate(); };
          worker.onmessage = ({ data }) => { done(); data.error ? reject(Error(data.error)) : resolve(data); };
          worker.onerror = event => { done(); reject(Error(event.message)); };
          worker.postMessage(payload);
        }), { state: item.state, variant, mode, submitted });
      }
      const a = pair.baseline.answer, b = pair.candidate.answer;
      let maxDifference = 0;
      for (const previous of a.candidates) {
        const current = b.candidates.find(c => c.key === previous.key);
        if (!current) throw Error('New filter dropped an old finalist');
        for (const field of ['equity', 'cubeless', 'mwc']) {
          if (current[field] == null || previous[field] == null) { if (current[field] !== previous[field]) throw Error('Units differ'); }
          else maxDifference = Math.max(maxDifference, Math.abs(current[field] - previous[field]));
        }
        current.probabilities.forEach((p, i) => { maxDifference = Math.max(maxDifference, Math.abs(p - previous.probabilities[i])); });
      }
      if (maxDifference > .00001) throw Error('Same-depth numerical mismatch ' + maxDifference);
      if (b.candidates[0].equity < a.candidates[0].equity - .00001) throw Error('Lower best evaluated four-ply equity');
      if (mode !== 'direct' && pair.candidate.calls[3]) throw Error('Repeated completed three-ply work');
      if (mode === 'automatic' && a.candidates[0].key !== b.candidates[0].key) throw Error('Automatic leader changed');
      const row = { id: item.id, mode, sample, submitted, maxDifference,
        added: b.candidates.length - a.candidates.length,
        changed: b.candidates[0].key !== a.candidates[0].key,
        fourPlyGain: b.candidates[0].equity - b.candidates.find(c => c.key === a.candidates[0].key).equity,
        ...pair };
      report.rows.push(row); save();
      console.log(JSON.stringify({ id: row.id, mode, sample, added: row.added, changed: row.changed, fourPlyGain: row.fourPlyGain,
        baselineMs: pair.baseline.researchMs, candidateMs: pair.candidate.researchMs, calls: pair.candidate.calls }));
    }
    report.finishedAt = new Date().toISOString(); save();
  } finally { await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { report.error = error.stack; save(); console.error(error); process.exitCode = 1; });
