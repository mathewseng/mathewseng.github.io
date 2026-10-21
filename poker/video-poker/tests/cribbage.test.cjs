const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../cribbage.js'),S=require('../cribbage-solver.js'),E=require('../engine.js'),O=require('../../../ofc/fantasyland-core.js');
const hand=s=>E.parseHand(s,52,s.split(' ').length);
let seed=4729;function random(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
test('four/five card cribbage scores agree with the OFC reference',()=>{
 for(let n of [4,5])for(let i=0;i<1000;i++){
  const h=E.shuffledDeck(52,random).slice(0,n);
  assert.equal(C.score(h).total,O.cribbageScoreTotal(h.map(c=>O.makeCard(E.cardText(c)))));
 }
 assert.equal(C.score(hand('Js Jh 5s 5h 5d')).total,24);
 assert.equal(C.score(hand('Js Jh 5s 5h 5d')).nobs,2);
});
test('long hands support full-length runs and flushes and optional OFC caps',()=>{
 const h=hand('As 2s 3s 4s 5s 6s 7s');
 assert.equal(C.score(h).runs,7);assert.equal(C.score(h).flush,7);
 assert.equal(C.score(h,5).runs,15);assert.equal(C.score(h,5).flush,5);
 assert.equal(C.score(hand('2s 2h 3d 4c')).runs,6);
 assert.equal(C.score(hand('Js Qh Kd As')).runs,3);
});
function brute(h,mask,pay){const held=h.filter((_,i)=>mask&(1<<i)),deck=Array.from({length:52},(_,i)=>i).filter(c=>!h.includes(c));let total=0,count=0;function visit(start){if(held.length===h.length){total+=pay(C.score(held).total);count++;return;}for(let i=start;i<=deck.length-(h.length-held.length);i++){held.push(deck[i]);visit(i+1);held.pop();}}visit(0);return total/count;}
test('rank/suit draw counts agree with independent enumeration, including nobs and flush interactions',()=>{
 for(const text of ['Js 5s 5h 5d','As 2s 3s 4s 5s','Js Jh Jd 5s 5h 5d','Js Jh Jd Jc 5s 5h 5d','As 2s 3s 4s 5s 6s 7s']){
  const h=hand(text),last=(1<<h.length)-1;
  for(const mask of [last,last^1,last^3,last^5])for(const pay of [score=>Math.max(0,score-12),score=>score-10,()=>1]){
   assert.ok(Math.abs(S.expected(h,mask,pay)-brute(h,mask,pay))<1e-9,`${text}: ${mask}`);
  }
 }
 const h=hand('Js 5s 5h 5d');
 for(let mask=0;mask<16;mask++)assert.ok(Math.abs(S.expected(h,mask,s=>Math.max(0,s-8))-brute(h,mask,s=>Math.max(0,s-8)))<1e-9,`all draws ${mask}`);
});
test('every four-through-seven-card hold is normalized and doubled pat is excluded',()=>{
 for(let n=4;n<=7;n++){
  const h=hand('Js Jh 5s 5h 5d 6s 7d').slice(0,n),v={handSize:n,pays:{fee:0},doubleOnDraw:true};
  const rows=S.solveHand(h,v);assert.equal(rows.length,2**(n+1)-1);assert.equal(rows.filter(r=>r.doubled).length,2**n-1);
  for(let i=0;i<rows.length;i++){const r=rows[i];assert.equal(r.grossEV-r.stake,r.netEV);assert.equal(r.ev,r.netEV+1);if(i)assert.ok(rows[i-1].ev>=r.ev-1e-10);}
  assert.ok(!rows.find(r=>r.mask===2**n-1&&r.doubled));
 }
});
test('the generalized subset solver independently agrees on four/five-card cribbage',()=>{
 const full=require('../solver.js');
 for(const n of [4,5]){
  const v={...E.byId['cribbage'+n],doubleOnDraw:true},h=hand('Js 5s 5h 5d 6s').slice(0,n),a=full.solveHand(h,v),b=S.solveHand(h,v);
  for(const r of a){const other=b.find(x=>x.mask===r.mask&&x.doubled===r.doubled);assert.ok(Math.abs(r.ev-other.ev)<1e-10);}
 }
});
test('net-PnL settlement, arbitrary hand sizes, and the extra stake use the same arithmetic',()=>{
 for(let n=4;n<=7;n++){
  const h=hand('Js 5s 5h 5d 6s 6h 7s').slice(0,n),v={...E.byId['cribbage'+n],pays:{fee:50},rules:{payout:'net',scoreCap:7},doubleOnDraw:true};
  assert.equal(E.evaluate(h,v).payout-1,C.score(h).total-50);
  const rows=S.solveHand(h,v),pat=rows.find(r=>r.mask===2**n-1);
  assert.equal(pat.netEV,C.score(h).total-50);assert.ok(rows.every(r=>r.netEV<0));
  for(const row of rows.filter(r=>r.doubled)){const base=rows.find(r=>!r.doubled&&r.mask===row.mask);assert.ok(Math.abs(row.netEV-2*base.netEV)<1e-9);}
  assert.equal(E.parseHand(h.map(E.cardText).join(' '),52,n).length,n);
  assert.throws(()=>E.parseHand(h.map(E.cardText).join(' '),52,n===4?5:4));
 }
});
test('native analysis agrees with browser EVs and deterministic sampling',t=>{
 const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync,execFileSync}=require('node:child_process');
 const compiler=spawnSync('c++',['--version']);if(compiler.error||compiler.status){t.skip('C++ compiler unavailable');return;}
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'cribbage-test-')),binary=path.join(tmp,'analyze');
 try{
  execFileSync('c++',['-O3','-std=c++17',path.join(__dirname,'../scripts/cribbage-analyze.cpp'),'-o',binary]);
  for(const text of ['Js 5s 5h 5d','As 2s 3s 4s 5s 6s 7s']){
   const h=hand(text),v={...E.byId['cribbage'+h.length],pays:{fee:12}},rows=S.solveHand(h,v);
   const native=execFileSync(binary,[h.length,1,4729,12,12,...h].map(String),{encoding:'utf8'}).trim().split('\n').map(l=>l.split(' ').map(Number));
   assert.equal(native.length,2**h.length);for(const [mask,ev]of native)assert.ok(Math.abs(rows.find(r=>r.mask===mask).ev-ev)<1e-9);
  }
  const v={...E.byId.cribbage4,doubleOnDraw:true},native=JSON.parse(execFileSync(binary,['4','8','4729','5','5'],{encoding:'utf8'})).find(r=>r.doubleOnDraw).result,js=S.sampleGame(v,()=>{},8,4729);
  for(const key of ['rtp','netEV','averageStake','doubleFrequency','doubleTieFrequency','rtpSE'])assert.ok(Math.abs(native[key]-js[key])<1e-10,key);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
test('integer fees produce the expected lose/push/win boundaries',()=>{
 const h=hand('Js 5s 5h 5d'),points=C.score(h).total;
 for(let payout=0;payout<=2;payout++)assert.equal(E.evaluate(h,{...E.byId.cribbage4,pays:{fee:points-payout}}).payout,payout);
 assert.equal(E.evaluate(h,{...E.byId.cribbage4,pays:{fee:points+10}}).payout,0);
});
