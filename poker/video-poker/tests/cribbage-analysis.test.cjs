const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const E=require('../engine.js'),S=require('../solver.js'),report=require('../cribbage-analysis.json');
test('cribbage fee analysis is tied to its source and gives three options per game',()=>{
 for(const [file,hash]of Object.entries(report.hashes))assert.equal(createHash('sha256').update(fs.readFileSync(path.join(__dirname,'..',file))).digest('hex'),hash,file);
 assert.equal(report.recommendations.length,24);
 for(const n of [4,5,6,7])for(const doubled of [false,true]){
  const id='cribbage'+n,options=report.recommendations.filter(r=>r.id===id&&r.doubleOnDraw===doubled),original=report[doubled?'doubleOriginals':'originals'][id];
  assert.equal(options.length,3);assert.deepEqual(original.pays,E.byId[id].pays);assert.deepEqual(original.rules,E.byId[id].rules);
  const fees=options.map(r=>r.pays.fee).sort((a,b)=>a-b);assert.equal(fees[1]-fees[0],1);assert.equal(fees[2]-fees[1],1);
  assert.ok(options.some(r=>r.result.rtp<=1));assert.ok(options.some(r=>r.result.rtp>1));
  for(const rec of options){
   const r=rec.result;assert.ok(Number.isInteger(rec.pays.fee));assert.deepEqual(rec.rules,{payout:'return',scoreCap:7});assert.equal(!!r.estimated,n>5);
   if(n>5){assert.equal(r.deals,n===6?8192:4096);assert.ok(r.rtpSE>0);assert.equal(r.seed,report.sampling[n].seed);assert.match(r.method,/Sampled/);}
   else{assert.equal(r.deals,S.C[52][n]);assert.match(r.method,/Exhaustive/);}
   if(doubled){assert.equal(r.doubleFrequency,r.doubleCount/r.deals);assert.ok(Math.abs(r.averageStake-(1+r.doubleFrequency))<1e-12);assert.ok(Math.abs(r.rtp-r.expectedReturn/r.averageStake)<1e-12);assert.ok(Math.abs(r.netEV-(r.expectedReturn-r.averageStake))<1e-12);}
  }
 }
});
test('four-card fee 5 reproduces its exhaustive original return',()=>{
 const v=E.byId.cribbage4,table=S.build(v);
 for(const doubled of [false,true]){const expected=S.solveAll({...v,doubleOnDraw:doubled},table),saved=report[doubled?'doubleOriginals':'originals'].cribbage4;assert.ok(Math.abs(saved.rtp-expected.rtp)<1e-12);if(doubled)assert.equal(saved.doubleCount,expected.doubleCount);}
});
