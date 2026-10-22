// Native-to-browser validation of actual release assets, not a mocked engine.
const assert=require('node:assert/strict'),fs=require('node:fs'),zlib=require('node:zlib'),path=require('node:path');
module.exports=async function puretdParity(browser,base,out,name) {
 const wide=process.env.BG_PURETD_MODEL==='wide';
 const corpus=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname,`../docs/puretd-${wide?'wide-':''}native-parity.json.gz`))));
 const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
 page.on('console',m=>{if(m.type()==='log'&&m.text().startsWith('PureTD parity'))console.log(name,m.text());});
 try {
  await page.goto(base+'/backgammon/');
  const report=await page.evaluate(async({corpus,name,full,wide})=>{
   const {createPuretdEvaluator}=await import('/backgammon/engine/puretd.mjs');
   const registry=await import('/backgammon/engine/puretd-metadata.mjs');
   const PURETD=wide?registry.PURETD_WIDE:registry.PURETD;
   const {legalTurns,positionKey}=await import('/backgammon/core/rules.mjs');
   const {validateItem,itemRecord,parseBackup}=await import('/backgammon/core/storage.mjs');
   const check=(value,message)=>{if(!value)throw Error(message);};
   const rows=[],release={};
   // Cover all 15 opening rolls and each of the 21 reply rolls once, in
   // different opening contexts. A stride of 21 repeats the same reply roll.
   const onePlyOpeningIndices=[...Array.from({length:15},(_,i)=>i),...Array.from({length:21},(_,i)=>15+22*i)];
   const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
   const model=await(await fetch('/backgammon/engine/vendor/puretd/'+PURETD.file)).arrayBuffer();
   check(await digest(model)===PURETD.modelSHA256,'model hash');
   for(const backend of ['simd','scalar']) {
    const prefix='/backgammon/engine/vendor/puretd/'+(backend==='scalar'?'scalar/':'');
    const wasm=await(await fetch(prefix+'puretd-module.wasm')).arrayBuffer();
    release[backend]=await digest(wasm);check(release[backend]===PURETD.assets[(backend==='scalar'?'scalar/':'')+'puretd-module.wasm'],'WASM hash');
    const loader=await import(prefix+'puretd-module.mjs'),module=await loader.default({wasmBinary:wasm,print:()=>{},printErr:()=>{}});
    module.FS.writeFile('/'+PURETD.file,new Uint8Array(model));const evaluator=createPuretdEvaluator(module,PURETD);
    try {
     // Every opening at 0 ply on both backends; complete 1-ply Chromium/SIMD
     // audit, all opening rolls and one of each reply roll elsewhere. General 1-ply
     // cross-browser checks retain every fifth corpus context and all 30
     // edge cases; Chromium/SIMD checks all 210 at both depths.
     for(const [group,cases] of [['openings',corpus.openings],['general',corpus.general]])
      for(const [i,c] of cases.entries()) for(const expected of c.results) {
       if(group==='openings'&&expected.plies===1&&!(full&&backend==='simd')&&!onePlyOpeningIndices.includes(i))continue;
       if(group==='general'&&expected.plies===1&&!(full&&backend==='simd')&&i<180&&i%5!==0)continue;
       const before=JSON.stringify(c.state),actual=evaluator.analyze(c.state,{plies:expected.plies});
       check(JSON.stringify(c.state)===before,c.id+': state mutation');
       check(actual.engine===PURETD.id&&actual.positionKey===positionKey(c.state),c.id+': identity');
       check(actual.perspective===c.state.turn&&actual.settings.plies===expected.plies,c.id+': context');
       const byKey=new Map(expected.moves.map(m=>[m.key,m.equity]));
       check(actual.candidates.length===byKey.size,c.id+': move count');let maximum=0;
       for(const move of actual.candidates) {
        check(byKey.has(move.key)&&Number.isFinite(move.equity),c.id+': legal/numeric result');
        maximum=Math.max(maximum,Math.abs(move.equity-byKey.get(move.key)));
        check(move.probabilities===null&&move.cubeless===null&&move.mwc===null,c.id+': invented values');
       }
       check(maximum<=1e-5,c.id+': native parity '+maximum);
       const topLoss=expected.moves[0].equity-byKey.get(actual.candidates[0].key);
       check(topLoss<=1e-5,c.id+': changed decision '+topLoss);
       rows.push({id:c.id,group,backend,plies:expected.plies,candidates:actual.candidates.length,
        maximumDifference:maximum,topAgrees:actual.candidates[0].key===expected.moves[0].key,elapsedMs:actual.elapsedMs});
       if(i%100===0)console.log(`PureTD parity ${backend} ${group} ${i+1}/${cases.length}, ${expected.plies} ply, ${actual.elapsedMs.toFixed(1)} ms`);
       if(group==='general'&&i===0&&expected.plies===1) {
        const steps=legalTurns(c.state).at(-1).steps,graded=evaluator.analyze(c.state,{plies:1,submitted:steps});
        check(graded.actual&&graded.error>=0,'submitted move grade');
        const saved=itemRecord('position',{state:c.state,analysis:graded});validateItem(saved);
        check(parseBackup(JSON.stringify({format:'backgammon-library',version:1,items:[saved],progress:[]})).items[0].analysis.model.sha256===PURETD.modelSHA256,'backup model roundtrip');
       }
      }
    } finally {evaluator.destroy();}
   }
   return {schema:1,browser:name,engine:PURETD.id,modelSHA256:PURETD.modelSHA256,release,onePlyOpeningIndices,rows};
  },{corpus,name,wide,full:name==='chromium'&&process.env.BG_PURETD_QUICK!=='1'});
  assert.equal(report.rows.length,name==='chromium'&&process.env.BG_PURETD_QUICK!=='1'?2919:2082);
  return {...report,summary:{cases:report.rows.length,maximumDifference:Math.max(...report.rows.map(r=>r.maximumDifference)),
   tiedOrChangedTop:report.rows.filter(r=>!r.topAgrees).length}};
 } finally {await context.close();}
};
