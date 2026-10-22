const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { gunzipSync } = require('node:zlib');

// Real WASM and worker results, with fixed inputs from the published native
// pruning audit. This checks the verification path, not agreement with XG.
module.exports = async function verifySearch(browser, base) {
  const audit = JSON.parse(gunzipSync(fs.readFileSync(path.join(__dirname,
    '../docs/internal-pruning-audit-data.json.gz'))));
  const find = id => audit.plan.cases.find(row => row.id === id).state;
  const fixtures = {
    abi: find('contact-18-money'),
    steps: [{from:5,to:1,die:4},{from:10,to:4,die:6}],
    state: find('contact-0-cubeless'),
    expected: audit.researchResults.find(row => row.id === 'contact-0-cubeless').arms,
  };
  const context = await browser.newContext({serviceWorkers:'block'});
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.exposeFunction('verifyStage',stage=>console.log(`  Verify: ${stage}`));
  try {
    await page.goto(base + '/backgammon/');
    const report = await page.evaluate(async fixtures => {
      const {EngineClient} = await import('/backgammon/engine/client.mjs');
      const {ENGINE_VERSION,PRESETS} = await import('/backgammon/engine/metadata.mjs');
      const {initialState,legalTurns,commitTurn} = await import('/backgammon/core/rules.mjs');
      const {toXGID} = await import('/backgammon/core/xgid.mjs');
      const {PreferredOpeningBook} = await import('/backgammon/engine/xg-reference-book.mjs');
      const check = (ok,message) => { if (!ok) throw Error(message); };
      const equal = (a,b,message) => check(JSON.stringify(a) === JSON.stringify(b),message);
      const compare = (a,b,label) => {
        check(a && b,`${label}: missing candidate`);
        let maximum = 0;
        for (const field of ['equity','cubeless','mwc']) {
          if (a[field] == null || b[field] == null) {
            // The native audit records money equity without an MWC field.
            check(a[field] == null && b[field] == null,`${label}: changed units`);
          } else maximum = Math.max(maximum,Math.abs(a[field]-b[field]));
        }
        check(a.probabilities.length === b.probabilities.length,`${label}: probability schema`);
        a.probabilities.forEach((value,i) => { maximum = Math.max(maximum,Math.abs(value-b.probabilities[i])); });
        check(Number.isFinite(maximum) && maximum <= 1e-5,`${label}: numerical difference ${maximum}`);
        return maximum;
      };
      const compareLists = (a,b,label) => {
        equal(a.map(c=>c.key).sort(),b.map(c=>c.key).sort(),`${label}: candidate coverage`);
        return Math.max(...a.map(c=>compare(c,b.find(other=>other.key===c.key),label)));
      };
      equal([PRESETS.verify.plies,PRESETS.verify.pruning],[4,false],'Verify preset must request unpruned four-ply checker search');

      // Call the actual exported native ABI in both executables. A large,
      // previously measured pruning effect detects an ignored policy flag.
      const data = await (await fetch('/backgammon/engine/vendor/gnubg-core-module.data')).arrayBuffer();
      const abi = [];
      for (const backend of ['scalar','simd']) {
        await window.verifyStage(`${backend} native ABI and pruning sensitivity`);
        const root = `/backgammon/engine/vendor/${backend === 'simd' ? 'simd/' : ''}`;
        const [{default:factory},bytes] = await Promise.all([
          import(root+'gnubg-core-module.js'),
          fetch(root+'gnubg-core-module.wasm').then(response=>response.arrayBuffer()),
        ]);
        const compiled = await WebAssembly.compile(bytes);
        const module = await factory({getPreloadedPackage:()=>data,
          instantiateWasm(imports,receive) {
            const instance = new WebAssembly.Instance(compiled,imports);
            receive(instance,compiled); return instance.exports;
          },print:()=>{},printErr:()=>{}});
        check(typeof module._bg_score_config === 'function',`${backend}: native bg_score_config export missing`);
        check(module.cwrap('init','number',[])() === 0,`${backend}: initialization failed`);
        const configured = module.cwrap('bg_score_config','number',['string','string','number','number','number']);
        const ordinary = module.cwrap('bg_score','number',['string','string','number','number']);
        const before = toXGID(fixtures.abi,{engine:true});
        const after = toXGID({...commitTurn(fixtures.abi,fixtures.steps),phase:'roll',dice:[]},{engine:true});
        const call = (fn,args) => {
          const pointer = fn(...args); check(pointer,`${backend}: missing native result`);
          try { const result=JSON.parse(module.UTF8ToString(pointer));check(!result.error,result.error);return result; }
          finally { module._free(pointer); }
        };
        try {
          const pruned = call(configured,[before,after,2,0,1]);
          const unpruned = call(configured,[before,after,2,0,0]);
          check(pruned.pruning === true && unpruned.pruning === false,`${backend}: native policy acknowledgment`);
          check(Math.abs(unpruned.equity-pruned.equity-.0465670149) < 1e-5,`${backend}: expected pruning-sensitive fixture changed`);
          compare(pruned,call(ordinary,[before,after,2,0]),`${backend}: ordinary ABI after unpruned call`);
          compare(pruned,call(configured,[before,after,2,0,1]),`${backend}: pruning cache isolation`);
          abi.push({backend,pruned,unpruned});
        } finally { module.cwrap('shutdown','number',[])(); }
      }
      const abiDifference = Math.max(compare(abi[0].pruned,abi[1].pruned,'scalar/SIMD pruned ABI'),
        compare(abi[0].unpruned,abi[1].unpruned,'scalar/SIMD unpruned ABI'));

      const messages = [];
      const create = (backend,trace=false,openingBook=null) => new EngineClient({openingBook,workerFactory:()=> {
        const worker = new Worker(`/backgammon/engine/worker.mjs?backend=${backend}`,{type:'module'});
        if (trace) { const send=worker.postMessage.bind(worker);worker.postMessage=message=> {
          if(message.type==='analyze') messages.push(structuredClone(message));send(message);
        }; }
        return worker;
      }});
      const warm=create('simd',true), cold=create('scalar'), independent=create('scalar');
      let bookEngine;
      try {
        const state=fixtures.state;
        await window.verifyStage('SIMD Research and Verify finalists');
        const research=await warm.analyze(state,{preset:'research'});
        const verified=await warm.analyze(state,{preset:'verify'});
        check(!messages.at(-1).prepared,'Research hint must not prepare a Verify hint');
        check(verified.engine===ENGINE_VERSION && verified.backend==='simd','Verify must run current SIMD worker');
        check(warm.startup.capabilities.unprunedChecker===true,'worker must advertise actual native export');
        equal([verified.settings.plies,verified.settings.pruning],[4,false],'Verify result settings');
        check(verified.screening.pruning===true && verified.screening.finalPruning===false,'screen and final policy must be explicit');
        check(verified.candidates.every(c=>c.pruning===false),'all Verify finalists must use native unpruned scores');
        equal(research.candidates.map(c=>c.key).sort(),verified.candidates.map(c=>c.key).sort(),'Research and Verify use the same shortlist');
        const nativeDifference=Math.max(
          compareLists(research.candidates,fixtures.expected.pruned.candidates,'Research/native audit'),
          compareLists(verified.candidates,fixtures.expected.unpruned.candidates,'Verify/native audit'));
        await window.verifyStage('fresh scalar Verify parity');
        const fresh=await cold.analyze(state,{preset:'verify'});
        check(fresh.backend==='scalar' && cold.startup.capabilities.unprunedChecker===true,'forced scalar Verify worker');
        const workerDifference=compareLists(verified.candidates,fresh.candidates,'warm SIMD/fresh scalar Verify');
        await window.verifyStage('Research/Verify native cache isolation');
        warm.cache.clear();
        const repeatResearch=await warm.analyze(state,{preset:'research'});
        compareLists(research.candidates,repeatResearch.candidates,'Research after native Verify cache');
        const repeatVerify=await warm.analyze(state,{preset:'verify'});
        compareLists(verified.candidates,repeatVerify.candidates,'Verify after native Research cache');
        const outside=legalTurns(state).find(turn=>!verified.candidates.some(c=>c.key===turn.key));
        check(outside,'fixture must have a legal move outside both shortlists');
        await window.verifyStage('prepared SIMD and independent scalar grading');
        const grade=await warm.analyze(state,{preset:'verify',submitted:outside.steps});
        check(messages.at(-1).prepared?.settings.pruning===false,'Verify grade must reuse only Verify preparation');
        check(grade.actual.key===outside.key && grade.actual.pruning===false,'unlisted move must receive an unpruned native score');
        for(const candidate of verified.candidates)
          compare(candidate,grade.candidates.find(c=>c.key===candidate.key),'prepared Verify retains completed finalist');
        const direct=await independent.analyze(state,{preset:'verify',submitted:outside.steps});
        const gradeDifference=compareLists(grade.candidates,direct.candidates,'prepared SIMD/direct scalar Verify grade');
        check(Math.abs(grade.error-direct.error)<=1e-5,'prepared grade loss changed');
        await window.verifyStage('Research grade after Verify');
        const researchGrade=await warm.analyze(state,{preset:'research',submitted:outside.steps});
        check(messages.at(-1).prepared?.settings.pruning===true,'Research grade must reuse only Research preparation');
        check(researchGrade.settings.pruning===true && researchGrade.actual.pruning!==false,'Verify must not contaminate Research grade');
        const peek=warm.peek(state,{preset:'verify',submitted:outside.steps});
        check(peek.settings.pruning===false && peek.actual.key===outside.key,'Verify display cache context');

        // Use the real published book provider and an eligible opening. It
        // must never be queried when manual verification was requested.
        const book=new PreferredOpeningBook(), lookup=book.lookup.bind(book);
        let bookCalls=0;
        book.lookup=(...args)=>{bookCalls++;return lookup(...args);};
        const opening=initialState({phase:'move',dice:[3,1],matchLength:0,
          rules:{jacoby:true,immediateRedoubles:2}});
        check(book.eligible(opening,{preset:'auto',kind:'checker',useBook:true}) && book.mayHave(opening),'book bypass fixture must be eligible for ordinary analysis');
        await window.verifyStage('native opening search bypasses reference book');
        bookEngine=create('simd',false,book);
        const openingResult=await bookEngine.analyze(opening,{preset:'verify'});
        check(bookCalls===0 && !openingResult.book && openingResult.method!=='reference','Verify must bypass published opening values');
        check(openingResult.engine===ENGINE_VERSION && openingResult.candidates.every(c=>c.pruning===false),'opening Verify must run native search');
        return {engine:ENGINE_VERSION,abiDifference,nativeDifference,workerDifference,gradeDifference,
          finalistCount:verified.candidates.length,legalCount:legalTurns(state).length,
          bookCalls,pruningEffect:abi[0].unpruned.equity-abi[0].pruned.equity,
          checks:['real configurable native ABI in both executables','pruning-sensitive native fixture',
            'four-ply worker/native audit parity','Research/Verify cache and prepared-grade separation',
            'scalar/SIMD parity','published book bypass']};
      } finally { warm.destroy();cold.destroy();independent.destroy();bookEngine?.destroy(); }
    },fixtures);
    assert.deepEqual(errors,[]);
    return report;
  } finally { await context.close(); }
};
