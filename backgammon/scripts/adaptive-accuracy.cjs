// Validate the automatic root filter against exhaustive same-depth GNUbg.
const fs = require("node:fs");
const { chromium } = require("playwright");
const { launchQuietBrowser } = require("../../scripts/quiet-browser.cjs");
(async () => {
  const browser = await launchQuietBrowser(chromium, { headless:true });
  try {
    const page = await browser.newPage({serviceWorkers:"block"});
    await page.goto((process.env.BG_BASE_URL || "http://127.0.0.1:8878") + "/backgammon/");
    await page.exposeFunction("progress", (done,total) => console.log(`${done}/${total} compared`));
    const report = await page.evaluate(async () => {
      const [{default:create}, {createEvaluator}, {ENGINE_VERSION}, {ADAPTIVE_ROOT}, {legalTurns}] = await Promise.all([
        import("/backgammon/engine/vendor/simd/gnubg-core-module.js"),
        import("/backgammon/engine/evaluate.mjs"), import("/backgammon/engine/metadata.mjs"),
        import("/backgammon/engine/adaptive.mjs"), import("/backgammon/core/rules.mjs")]);
      const [wasmBinary,data,corpus,fixtures] = await Promise.all([
        fetch("/backgammon/engine/vendor/simd/gnubg-core-module.wasm").then(r=>r.arrayBuffer()),
        fetch("/backgammon/engine/vendor/gnubg-core-module.data").then(r=>r.arrayBuffer()),
        fetch("/backgammon/data/accuracy-reference.json").then(r=>r.json()),
        fetch("/backgammon/data/exercises.json").then(r=>r.json())]);
      const module = await create({wasmBinary,getPreloadedPackage:()=>data,print:()=>{},printErr:()=>{}}), e = createEvaluator(module), rows = [];
      try {
        const cases = [...corpus.items.map(c=>({...c,id:`reference-${c.topic}-${c.line}`})), ...fixtures.items.filter(c=>c.state.phase==="move")];
        for (const c of cases) {
          const full = e.analyze(c.state,"deep"), automatic = e.analyze(c.state,"deep","checker",null,{automatic:true});
          const filtered = full.candidates.find(o=>o.key===automatic.candidates[0].key);
          let maxDifference = 0;
          for (const a of automatic.candidates) {
            const b = full.candidates.find(o=>o.key===a.key);
            if (!b) throw Error("Unexpected move");
            maxDifference = Math.max(maxDifference, Math.abs(a.equity-b.equity));
          }
          if (maxDifference > .00001) throw Error("Inconsistent same-depth equity");
          const outside = full.candidates.find(o=>!automatic.candidates.some(a=>a.key===o.key));
          if (outside) {
            const graded = e.analyze(c.state,"deep","checker",legalTurns(c.state).find(t=>t.key===outside.key).steps,{automatic:true});
            if (!graded.actual || Math.abs(graded.actual.equity-outside.equity)>.00001) throw Error("Missing or inconsistent arbitrary-move grade");
          }
          rows.push({id:c.id,topic:c.topic,positionKey:full.positionKey,total:full.candidates.length,retained:automatic.candidates.length,
            fullBest:full.candidates[0].key,automaticBest:automatic.candidates[0].key,
            lossAgainstFull:Math.max(0,full.candidates[0].equity-filtered.equity),maxDifference,arbitraryMoveTested:!!outside,
            referenceLossFull:c.reference?.find(r=>r.key===full.candidates[0].key)?.loss??null,
            referenceLossAutomatic:c.reference?.find(r=>r.key===automatic.candidates[0].key)?.loss??null});
          if (rows.length%10===0) await window.progress(rows.length,cases.length);
        }
        return {engine:ENGINE_VERSION,rootFilter:ADAPTIVE_ROOT,rows};
      } finally {e.shutdown();}
    });
    report.summary = {positions:report.rows.length,identicalBest:report.rows.filter(r=>r.fullBest===r.automaticBest).length,
      maxLoss:Math.max(...report.rows.map(r=>r.lossAgainstFull)),meanLoss:report.rows.reduce((s,r)=>s+r.lossAgainstFull,0)/report.rows.length,
      arbitraryMoveChecks:report.rows.filter(r=>r.arbitraryMoveTested).length,maxNumericalDifference:Math.max(...report.rows.map(r=>r.maxDifference))};
    report.recordedAt = new Date().toISOString();
    report.method = "Real assembled SIMD WASM. Automatic 0-ply root filter compared with exhaustive 2-ply evaluation on 300 historical cubeless money positions plus authored checker fixtures. An omitted candidate is explicitly submitted and graded for each screened position. Same engine/weights; not independent strength or Elo evidence. Historical rollout reference is incomplete and approximate; missing listed moves remain null, never zero loss.";
    fs.writeFileSync(process.env.BG_ACCURACY_REPORT || "backgammon/data/adaptive-accuracy.json",JSON.stringify(report,null,2)+"\n");
    console.log(report.summary);
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
