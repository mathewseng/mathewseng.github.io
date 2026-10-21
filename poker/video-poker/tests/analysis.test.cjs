const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const E=require('../engine.js'),S=require('../solver.js'),report=require('../analysis.json');
test('saved analysis matches shipped code and all preset paytables',()=>{
 for(const [file,key]of [['engine.js','engineSha256'],['solver.js','solverSha256'],['payout-options.json','optionsSha256']])assert.equal(createHash('sha256').update(fs.readFileSync(path.join(__dirname,'..',file))).digest('hex'),report[key]);
 assert.equal(Object.keys(report.originals).length,E.variants.filter(v=>!v.cribbage).length);
 for(const v of E.variants.filter(v=>!v.cribbage)){assert.deepEqual(report.originals[v.id].pays,v.pays,v.id);if(v.rules)assert.deepEqual(report.originals[v.id].rules,v.rules,v.id);}
});
test('custom originals and recommendations reproduce exactly',()=>{
 for(const id of ['low27','badeucey']){assert.ok(Math.abs(S.solveAll(E.byId[id]).rtp-report.originals[id].rtp)<1e-12);const rec=report.recommendations.find(r=>r.id===id);assert.ok(Math.abs(S.solveAll({...E.byId[id],pays:rec.pays}).rtp-rec.result.rtp)<1e-12);assert.ok(rec.result.rtp>.98&&rec.result.rtp<1);}
 assert.equal(report.recommendations.find(r=>r.id==='badeucey').pays.qualify,1);
});

test('all payout options are complete integer configurations with results for their own stake rules',()=>{
 const options=require('../payout-options.json');
 assert.equal(report.recommendations.length,12);
 for(const id of ['low27','badeucey'])for(const doubled of [false,true])assert.equal(report.recommendations.filter(r=>r.id===id&&!!r.doubleOnDraw===doubled).length,3);
 for(const option of options){const rec=report.recommendations.find(r=>r.key===option.key);for(const [key,value]of Object.entries(option))assert.deepEqual(rec[key],value);}
 for(const rec of report.recommendations){
  assert.ok(Object.values(rec.pays).every(n=>Number.isInteger(n)&&n>=0));
  assert.ok(rec.result.rtp>.98&&rec.result.rtp<1,rec.key||rec.id);
  if(rec.id==='badeucey'){assert.equal(rec.pays.qualify,1);assert.deepEqual(E.normalizeBadeuceyRules(rec.rules),rec.rules);}
  if(rec.doubleOnDraw){const r=rec.result;assert.equal(r.doubleFrequency,r.doubleCount/r.deals);assert.equal(r.averageStake,1+r.doubleFrequency);assert.ok(Math.abs(r.rtp-r.expectedReturn/r.averageStake)<1e-12);assert.ok(Math.abs(r.netEV-(r.expectedReturn-r.averageStake))<1e-12);assert.ok(r.doubleTieCount+r.doubleCount<=r.deals);}
 }
});
test('double-on-draw originals and selected payout options reproduce their optimal EV and double frequency',()=>{
 for(const id of ['low27','badeucey']){
  const original=S.solveAll({...E.byId[id],doubleOnDraw:true}),saved=report.doubleOriginals[id];
  assert.ok(Math.abs(original.rtp-saved.rtp)<1e-12);assert.equal(original.doubleCount,saved.doubleCount);assert.equal(original.doubleTieCount,saved.doubleTieCount);
  const rec=report.recommendations.find(r=>r.id===id&&r.doubleOnDraw),result=S.solveAll({...E.byId[id],pays:rec.pays,rules:rec.rules,doubleOnDraw:true});
  assert.ok(Math.abs(result.netEV-rec.result.netEV)<1e-12);assert.equal(result.doubleCount,rec.result.doubleCount);
 }
});
