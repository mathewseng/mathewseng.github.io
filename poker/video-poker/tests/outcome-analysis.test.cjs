const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const E=require('../engine.js'),net=require('../cribbage-net-analysis.json');
const hash=file=>createHash('sha256').update(fs.readFileSync(path.join(__dirname,'..',file))).digest('hex');
test('net-PnL fees have independent recommendations and match their reproducible sources',()=>{
 for(const [file,value]of Object.entries(net.hashes))assert.equal(hash(file),value,file);
 assert.equal(net.recommendations.length,24);
 for(const n of [4,5,6,7])for(const doubled of [false,true]){
  const rows=net.recommendations.filter(r=>r.id==='cribbage'+n&&r.doubleOnDraw===doubled);
  assert.equal(rows.length,3);assert.ok(rows[0].result.netEV>0);assert.ok(rows[1].result.netEV<=0);assert.ok(rows[2].result.netEV<rows[1].result.netEV);
  for(const r of rows){assert.deepEqual(r.rules,{payout:'net',scoreCap:7});assert.equal(r.result.estimated,n>5);}
  if(!doubled)assert.ok(Math.abs(rows[0].result.netEV-rows[1].result.netEV-1)<1e-10);
 }
});
test('zero cribbage points lose exactly the fee in net games and at most the stake in capped games',()=>{
 for(const n of [4,5,6,7]){
  const h=E.parseHand('2s 4h 6d 8c Ts Qh Kd'.split(' ').slice(0,n).join(' '),52,n);
  for(const payout of ['net','return']){const result=E.evaluate(h,{...E.byId['cribbage'+n],pays:{fee:20},rules:{payout,scoreCap:7}});assert.equal(result.points,0);assert.equal(result.payout-1,payout==='net'?-20:-1);assert.equal(2*(result.payout-1),payout==='net'?-40:-2);}
 }
});
test('all 35 default charts are normalized, tied to sources, and reproduce game EVs',()=>{
 const report=require('../outcome-analysis.json'),variants=require('../scripts/analyze-outcomes.cjs').configs(),sources=[require('../analysis.json'),require('../cribbage-analysis.json'),net];
 for(const [file,value]of Object.entries(report.hashes))assert.equal(hash(file),value,file);
 assert.equal(report.entries.length,35);assert.equal(variants.length,35);
 for(const v of variants){
  const entry=report.entries.find(r=>r.id===v.id&&r.doubleOnDraw===v.doubleOnDraw&&JSON.stringify(r.pays)===JSON.stringify(v.pays)&&JSON.stringify(r.rules)===JSON.stringify(v.rules));assert.ok(entry,v.id);
  const r=entry.result;assert.equal(r.estimated,(v.handSize||5)>5);assert.ok(Math.abs(r.win+r.push+r.loss-1)<1e-10);assert.ok(r.standardDeviation>=0);
  assert.ok(Math.abs(r.payouts.reduce((a,p)=>a+p.probability,0)-1)<1e-10);assert.ok(r.payouts.every(p=>p.probability>=0&&Number.isInteger(p.pnl)));
  const known=sources.flatMap(s=>s.recommendations).find(x=>x.id===v.id&&!!x.doubleOnDraw===v.doubleOnDraw&&JSON.stringify(x.pays)===JSON.stringify(v.pays)&&JSON.stringify(x.rules)===JSON.stringify(v.rules))?.result||sources[0].originals[v.id];
  assert.ok(Math.abs(r.netEV-known.netEV)<1e-7,`${v.id}/${v.rules?.payout}/${v.doubleOnDraw}`);
 }
});
