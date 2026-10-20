const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../engine.js'),S=require('../solver.js');
const hand=s=>E.parseHand(s,53),ev=(s,id)=>E.evaluate(hand(s),E.byId[id]);
test('standard ranks, ace-low straights, and nonpaying pairs',()=>{
  for(const [h,key,pay]of [['As Ks Qs Js Ts','royal',800],['As 2s 3s 4s 5s','straightFlush',50],['2s 2h 2d 2c As','quads',25],['Js Jh Jd 2c 2s','fullHouse',9],['As Qs 8s 5s 2s','flush',6],['As 2h 3d 4c 5s','straight',4],['Js Jh Jd 3c 2s','trips',3],['Ts Th 2d 2c 3s','twoPair',2],['Js Jh 9d 3c 2s','highPair',1],['Ts Th 9d 3c 2s',null,0]]){const r=ev(h,'jacks');assert.equal(r.payout,pay,h);assert.deepEqual(r.keys,key?[key]:[]);}
  assert.equal(ev('Ts Th 9d 3c 2s','tens').payout,1);
});
test('bonus tiers and exact kicker boundaries',()=>{
  assert.equal(ev('As Ah Ad Ac 2s','double-double').payout,400);
  assert.equal(ev('As Ah Ad Ac 5s','double-double').payout,160);
  assert.equal(ev('2s 2h 2d 2c As','double-double').payout,160);
  assert.equal(ev('4s 4h 4d 4c 5s','double-double').payout,80);
  assert.equal(ev('5s 5h 5d 5c As','double-double').payout,50);
  assert.equal(ev('As Ah Ad Ac 2s','triple-double').payout,800);
  assert.equal(ev('Ks Kh Kd Kc 2s','super-double').payout,120);
});
test('deuces and joker wild categories, including five of a kind and full houses',()=>{
  for(const [h,key]of [['As Ks Qs Js Ts','royal'],['2s 2h 2d 2c As','deuces'],['As Ks Qs Js 2h','wildRoyal'],['3s 3h 3d 3c 2h','fiveKind'],['5s 6s 7s 2c 2h','straightFlush'],['As Ah Ad 2c 3s','quads'],['As Ah Kd Kc 2s','fullHouse'],['As 8s 6s 3s 2h','flush'],['As 3h 4d 5c 2s','straight'],['As Ah 2c 8d 4s','trips']])assert.deepEqual(ev(h,'deuces').keys,[key],h);
  assert.equal(ev('2s 2h 2d 2c As','bonus-deuces').payout,400);
  assert.equal(ev('As Ah Ad 2s 2h','bonus-deuces').payout,80);
  assert.equal(ev('4s 4h 4d 2s 2h','bonus-deuces').payout,40);
  assert.equal(ev('Ks Kh Kd Kc JK','joker').payout,200);
  assert.equal(ev('As Ks Qs Js JK','joker').payout,100);
  assert.equal(ev('Ks 9h 7d 4c JK','joker').payout,1);
  assert.equal(ev('Qs Qh 9d 3c 2s','joker').payout,0);
});
test('2–7 pays a single exclusive tier, with aces high and straights/flushes excluded',()=>{
  for(const [h,p]of [['7s 5h 4d 3c 2s',10],['7s 6h 4d 3c 2s',5],['8s 6h 4d 3c 2s',4],['9s 6h 4d 3c 2s',3],['Ts 6h 4d 3c 2s',2],['Js 6h 4d 3c 2s',1],['Qs 6h 4d 3c 2s',0],['As 2h 3d 4c 5s',0],['6s 5h 4d 3c 2s',0],['7s 5s 4s 3s 2s',0],['7s 5h 4d 2c 2s',0]])assert.equal(ev(h,'low27').payout,p,h);
});
test('Badeucey requires both qualifiers and adds push plus best award per half',()=>{
  assert.equal(ev('Ks Jh 9d 7c 2s','badeucey').payout,1,'qualifies without point awards');
  assert.equal(ev('7s 5h 4d 3c 2s','badeucey').payout,25,'wheel + 5-dugi + stake');
  assert.equal(ev('7s 5h 4d 3c 2h','badeucey').payout,13,'wheel + 7-dugi + stake');
  assert.equal(ev('7s 5s 4h 3h 2d','badeucey').payout,0,'no four suits');
  assert.equal(ev('7s 4h 4d 3c 2s','badeucey').payout,0,'paired five-card low fails despite badugi');
  assert.equal(ev('6s 5h 4d 3c 2s','badeucey').payout,0,'straight fails despite badugi');
  assert.equal(ev('As 5h 4d 3c 2s','badeucey').payout,17,'ace-high low qualifies and can discard ace for 5-dugi');
  assert.equal(ev('As 5h 4d 3c 2h','badeucey').payout,1,'ace is high in badugi too');
});
test('card validation and drawing never return discarded cards',()=>{
  assert.throws(()=>E.parseHand('As As 2h 3h 4h'));
  assert.throws(()=>E.parseHand('As Ks Qs Js JK'));
  assert.throws(()=>E.parseHand('As Ks Qs Js'));
  assert.throws(()=>E.parseHand('As Ks Qs Js 1s'));
  assert.equal(hand('10s Kh Qd Jc JK')[0],32);
  const deck=E.shuffledDeck();assert.equal(new Set(deck).size,52);
  for(let mask=0;mask<32;mask++){const drawn=E.draw(deck.slice(0,5),mask,deck.slice(5));assert.equal(new Set(drawn).size,5);for(let i=0;i<5;i++)assert.equal(drawn[i]===deck[i],!!(mask&(1<<i)));}
});
// Independent direct-draw enumerator verifies the subset solver, including
// the easy-to-miss exclusion of initial discards. It does not use its transform.
function brute(h,v,mask){const held=h.filter((_,i)=>mask&(1<<i)),remain=Array.from({length:v.deckSize},(_,i)=>i).filter(c=>!h.includes(c)),need=5-held.length;let sum=0,n=0;function walk(start){if(held.length===5){sum+=E.evaluate(held,v).payout;n++;return;}for(let i=start;i<=remain.length-(5-held.length);i++){held.push(remain[i]);walk(i+1);held.pop();}}walk(0);return {ev:sum/n,n};}
test('exact holds match independent draw enumeration for all 32 holds',()=>{
  const v=E.byId.low27,h=hand('7s 5h 4d 3c Kh'),results=S.solveHand(h,v);
  assert.equal(results.length,32);assert.equal(new Set(results.map(r=>r.mask)).size,32);
  for(const r of results){const b=brute(h,v,r.mask);assert.equal(r.outcomes,b.n);assert.ok(Math.abs(r.ev-b.ev)<1e-11,`mask ${r.mask}`);}
});
test('Badeucey and joker direct-draw comparisons include suit and wildcard effects',()=>{
  for(const [id,h]of [['badeucey',hand('7s 5h 4d 3c 2h')],['joker',hand('As Ks Qs 3c JK')]]){
    const v=E.byId[id],results=S.solveHand(h,v);for(const mask of [0,7,15,23,31]){const b=brute(h,v,mask),r=results.find(r=>r.mask===mask);assert.equal(r.outcomes,b.n);assert.ok(Math.abs(r.ev-b.ev)<1e-10,`${id}/${mask}`);}
  }
});
test('exhaustive whole-game returns reproduce independent published benchmarks',()=>{
  for(const [id,expected]of [['jacks',.9954390437],['deuces',1.0076196120],['joker',1.0064629663]]){const r=S.solveAll(E.byId[id]);assert.ok(Math.abs(r.rtp-expected)<1e-9,`${id}: ${r.rtp}`);assert.equal(r.holdCounts.reduce((a,b)=>a+b),r.deals);}
});
test('zero payouts and a constant payout prove normalization for every hold',()=>{
  const v={...E.byId.jacks,pays:Object.fromEntries(Object.keys(E.byId.jacks.pays).map(k=>[k,0]))};
  assert.equal(S.solveAll(v).rtp,0);
  const {offsets,length}=S.layout(52),sums=new Float64Array(length);
  for(let k=0;k<=5;k++)sums.fill(S.C[52-k][5-k],offsets[k],offsets[k]+S.C[52][k]);
  for(const r of S.solveHand(hand('As 9h 5d 3c 2s'),E.byId.jacks,{offsets,sums,n:52}))assert.equal(r.ev,1);
});

test('Badeucey T-high tiers pay independently and never stack within a section',()=>{
  const v={...E.byId.badeucey,pays:{...E.byId.badeucey.pays,lowT:4,badT:3}};
  const score=s=>E.evaluate(hand(s),v);
  assert.equal(score('Ts 9h 8d 7c 2h').payout,8,'push + T-high + T-dugi');
  assert.equal(ev('Ts 9h 8d 7c 2h','badeucey').payout,1,'new tiers default to zero');
  assert.equal(score('9s 8h 7d 6c 2h').payout,3,'9-high tiers replace T-high tiers');
});
test('Badeucey qualification rules are independent of point eligibility',()=>{
  const score=(s,rules)=>E.evaluate(hand(s),{...E.byId.badeucey,rules:E.normalizeBadeuceyRules(rules)}).payout;
  assert.equal(score('7s 5s 4h 3h 2d',{minBadugi:3}),9,'three-card badugi qualifies for push and wheel, no badugi points');
  assert.equal(score('7s 5s 4h 3h 2d',{minBadugi:4}),0);
  assert.equal(score('7s 5s 4h 3h 2s',{minBadugi:2}),9);
  assert.equal(score('7s 5s 4h 3h 2s',{minBadugi:3}),0);
  assert.equal(score('7s 5h 4d 3c 3s',{fiveCard:'any'}),5,'pair allowed to qualify, only 7-dugi award');
  assert.equal(score('7s 5h 4d 3c 3s',{fiveCard:'unpaired'}),0);
  assert.equal(score('6s 5h 4d 3c 2s',{fiveCard:'unpaired'}),17,'straight qualifies, only 5-dugi award');
  assert.equal(score('7s 5s 4s 3s 2s',{fiveCard:'unpaired',minBadugi:0}),1,'flush qualifies but has no low or four-card badugi points');
  assert.equal(score('7s 5s 4s 3s 2s',{fiveCard:'high-card',minBadugi:0}),0);
  assert.equal(score('7s 7h 7d 3c 3d',{fiveCard:'any',minBadugi:2}),1,'full house can qualify under any-hand mode');
});
test('rank limits test the qualifying subset, while low rank limits test all five cards',()=>{
  const score=(s,rules)=>E.evaluate(hand(s),{...E.byId.badeucey,rules:E.normalizeBadeuceyRules(rules)}).payout;
  assert.equal(score('Ks 5h 4d 3c 2h',{minBadugi:3,maxBadugiRank:4}),1,'4-high three-card subset qualifies even with a K-high four-card badugi');
  assert.equal(score('Ks 5h 4d 3c 2h',{minBadugi:4,maxBadugiRank:4}),0);
  assert.equal(score('Ks 5h 4d 3c 2s',{maxBadugiRank:5}),17);
  assert.equal(score('Ks 5h 4d 3c 2s',{maxLowRank:10}),0);
  assert.equal(score('7s 7h 7d 3c 3d',{fiveCard:'any',minBadugi:0,maxBadugiRank:4}),1,'badugi rank cap is inactive when there is no badugi requirement');
  assert.throws(()=>E.normalizeBadeuceyRules({minBadugi:5}));
  assert.throws(()=>E.normalizeBadeuceyRules({fiveCard:'pair'}));
});
test('badugi subset scorer agrees with an independent rank/suit-set enumeration',()=>{
  let state=713;
  const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  for(let sample=0;sample<500;sample++){
    const h=E.shuffledDeck(52,random).slice(0,5);
    for(const n of [2,3,4]){
      let expected=15;
      for(let m=1;m<32;m++){
        const subset=h.filter((_,i)=>m&(1<<i));
        if(subset.length!==n)continue;
        const ranks=subset.map(E.rank),suits=subset.map(E.suit);
        if(new Set(ranks).size===n&&new Set(suits).size===n)expected=Math.min(expected,Math.max(...ranks));
      }
      assert.equal(E.badugiHigh(h,n),expected);
    }
  }
});
test('custom-rule strategy excludes discarded cards and uses changed qualification',()=>{
  const v={...E.byId.badeucey,rules:E.normalizeBadeuceyRules({fiveCard:'any',minBadugi:3,maxBadugiRank:8}),pays:{...E.byId.badeucey.pays,lowT:2,badT:3}};
  const h=hand('Ts 8h 4d 3c 3s'),results=S.solveHand(h,v);
  for(const mask of [7,15,23,31]){const b=brute(h,v,mask),r=results.find(r=>r.mask===mask);assert.equal(r.outcomes,b.n);assert.ok(Math.abs(r.ev-b.ev)<1e-10,`custom mask ${mask}`);}
});
