const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../engine.js'),S=require('../solver.js');

function constantTable(n,payout){
  const {offsets,length}=S.layout(n),sums=new Float64Array(length);
  for(let k=0;k<=5;k++)sums.fill(payout*S.C[n-k][5-k],offsets[k],offsets[k]+S.C[n][k]);
  return {offsets,sums,n};
}
test('double decisions subtract the extra stake, prohibit standing pat, and prefer single stake on ties',()=>{
  const v={...E.byId.low27,deckSize:10,doubleOnDraw:true},h=[0,1,2,3,4];
  for(const payout of [0,.5,1,2]){
    const table=constantTable(10,payout),rows=S.solveHand(h,v,table),result=S.solveAll(v,table);
    assert.equal(rows.length,63);
    assert.equal(rows.filter(r=>r.doubled).length,31);
    assert.ok(!rows.some(r=>r.mask===31&&r.doubled));
    for(const row of rows){assert.equal(row.netEV,row.stake*(payout-1));assert.equal(row.grossEV,row.stake*payout);assert.equal(row.ev,row.netEV+1);}
    assert.equal(rows[0].doubled,payout>1);
    assert.equal(result.doubleFrequency,payout>1?1:0);
    assert.equal(result.doubleTieFrequency,payout===1?1:0);
    assert.equal(result.averageStake,payout>1?2:1);
    assert.equal(result.netEV,(payout-1)*(payout>1?2:1));
    assert.equal(result.rtp,payout);
    assert.equal(result.expectedReturn,payout*result.averageStake);
  }
});

// Independent exhaustive enumeration on a reduced deck checks both decisions
// and total-stake accounting without using the solver's subset sums or EV formula.
test('full-game double EV and frequency match independent deal/draw enumeration',()=>{
  const v={...E.byId.jacks,deckSize:12,doubleOnDraw:true,pays:{...E.byId.jacks.pays,quads:3,fullHouse:2,trips:1,twoPair:1}},table=S.build(v);
  let net=0,gross=0,stakes=0,doubles=0,ties=0,deals=0;
  function combinations(cards,count,visit,picked=[],start=0){if(!count){visit([...picked]);return;}for(let i=start;i<=cards.length-count;i++){picked.push(cards[i]);combinations(cards,count-1,visit,picked,i+1);picked.pop();}}
  combinations(Array.from({length:12},(_,i)=>i),5,h=>{
    let bestSingle=-Infinity,bestDouble=-Infinity;
    const remaining=Array.from({length:12},(_,i)=>i).filter(c=>!h.includes(c)),rows=S.solveHand(h,v,table);
    for(let mask=0;mask<32;mask++){
      const held=h.filter((_,i)=>mask&(1<<i));let profit1=0,profit2=0,draws=0;
      combinations(remaining,5-held.length,draw=>{const pay=E.evaluate([...held,...draw],v).payout;profit1+=pay-1;profit2+=pay*2-2;draws++;});
      const single=profit1/draws,double=profit2/draws;
      assert.ok(Math.abs(rows.find(r=>r.mask===mask&&!r.doubled).netEV-single)<1e-12);
      bestSingle=Math.max(bestSingle,single);
      if(mask!==31){assert.ok(Math.abs(rows.find(r=>r.mask===mask&&r.doubled).netEV-double)<1e-12);bestDouble=Math.max(bestDouble,double);}
    }
    const useDouble=bestDouble>bestSingle+1e-12,profit=useDouble?bestDouble:bestSingle,stake=useDouble?2:1;
    assert.equal(rows[0].doubled,useDouble);
    net+=profit;gross+=profit+stake;stakes+=stake;doubles+=useDouble;ties+=Math.abs(bestDouble-bestSingle)<1e-12;deals++;
  });
  const result=S.solveAll(v,table);
  assert.equal(result.deals,deals);assert.equal(result.doubleCount,doubles);assert.equal(result.doubleTieCount,ties);
  assert.ok(Math.abs(result.netEV-net/deals)<1e-12);
  assert.ok(Math.abs(result.expectedReturn-gross/deals)<1e-12);
  assert.ok(Math.abs(result.rtp-gross/stakes)<1e-12);
  assert.ok(Math.abs(result.averageStake-stakes/deals)<1e-12);
});

test('a large made-hand payout can beat a profitable doubled draw',()=>{
  const v={...E.byId.low27,doubleOnDraw:true},h=E.parseHand('7s 5h 4d 3c 2s'),rows=S.solveHand(h,v);
  assert.equal(rows[0].mask,31);assert.equal(rows[0].doubled,false);
  assert.ok(rows.some(r=>r.doubled&&r.netEV>0));
  assert.equal(rows[0].netEV,9);
});
