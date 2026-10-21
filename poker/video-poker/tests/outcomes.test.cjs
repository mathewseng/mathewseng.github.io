const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
const E=require('../engine.js'),S=require('../solver.js'),CS=require('../cribbage-solver.js'),C=require('../cribbage.js'),D=require('../cribbage-distribution.js'),O=require('../outcomes.js');
test('optimal payout distribution matches independent draws on reduced decks, including both loss rules and 2×',()=>{
 for(const payout of ['return','net'])for(const doubleOnDraw of [false,true]){
  const v={...E.byId.cribbage4,deckSize:10,pays:{fee:payout==='net'?7:6},rules:{payout,scoreCap:7},doubleOnDraw},bins=new Map(),table=S.build(v);
  S.eachHand(10,h=>{
   const best=S.solveHand(h,v,table)[0],held=h.filter((_,i)=>best.mask&(1<<i)),available=Array.from({length:10},(_,i)=>i).filter(c=>!h.includes(c)),draw=4-held.length,denom=S.C[6][draw];
   S.eachHand(available.length,indices=>{const final=held.concat(indices.map(i=>available[i])),net=best.stake*(E.evaluate(final,v).payout-1);bins.set(net,(bins.get(net)||0)+1/denom);},draw);
  },4);
  const expected=O.summarize(bins,S.C[10][4]),actual=O.exact(v,table);
  for(const row of expected.payouts)assert.ok(Math.abs(row.probability-(actual.payouts.find(r=>r.pnl===row.pnl)?.probability||0))<1e-10,`${payout}/${doubleOnDraw}/${row.pnl}`);
  assert.ok(Math.abs(expected.netEV-actual.netEV)<1e-10);
 }
});
test('conditional score histogram agrees with direct draw enumeration and the exact EV solver',()=>{
 for(const text of ['Js Jh 5s 5h','Js 5s 5h 5d 6s','Js 5s 5h 5d 6s 6h','Js Jh 5s 5h 6s 6h 7s']){
  const n=text.split(' ').length,h=E.parseHand(text,52,n),mask=((1<<n)-1)^3,dist=D.distribution(h,mask),brute=new Float64Array(128),available=Array.from({length:52},(_,i)=>i).filter(c=>!h.includes(c));
  for(let i=0;i<available.length;i++)for(let j=i+1;j<available.length;j++)brute[C.score([available[i],available[j],...h.slice(2)]).total]++;
  for(let points=0;points<128;points++)assert.ok(Math.abs(dist[points]-brute[points]/S.C[52-n][2])<1e-12);
  assert.ok(Math.abs(dist.reduce((sum,p,i)=>sum+p*i,0)-CS.expected(h,mask,x=>x))<1e-10);
 }
});
test('native linear score expectation agrees with exact JS draws for every hold',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cribbage-net-test-')),binary=path.join(dir,'analyze');
 try{
  execFileSync('c++',['-O3','-std=c++17',path.join(__dirname,'../scripts/cribbage-net-analyze.cpp'),'-o',binary]);
  for(const text of ['Js Jh 5s 5h','As 2s 3s 4s 5s','Js Jh 5s 5h 6s 6h','As 2s 3s 5s 6s 7s 8s']){
   const n=text.split(' ').length,h=E.parseHand(text,52,n),v={...E.byId['cribbage'+n],rules:{payout:'net',scoreCap:7},pays:{fee:0}},rows=CS.solveHand(h,v),native=JSON.parse(execFileSync(binary,[n,1,739021,...h].map(String),{encoding:'utf8'}));
   for(const row of rows)assert.ok(Math.abs(native[row.mask]-row.netEV)<1e-9,`${text}/${row.mask}: ${native[row.mask]} / ${row.netEV}`);
  }
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('sampled game histograms reproduce conditional strategy EV and doubling rate',()=>{
 for(const payout of ['return','net']){
  const v={...E.byId.cribbage6,pays:{fee:16},rules:{payout,scoreCap:5},doubleOnDraw:true},a=O.sampled(v,()=>{},3,739021),b=CS.sampleGame(v,()=>{},3,739021);
  for(const key of ['netEV','doubleFrequency','doubleTieFrequency','averageStake'])assert.ok(Math.abs(a[key]-b[key])<1e-10,key);
 }
});
