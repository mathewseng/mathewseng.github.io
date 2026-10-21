/* Exact single-draw EV. No sampling, no replacement of the five dealt cards. */
(function(root){
  'use strict';
  const E=typeof module!=='undefined'?require('./engine.js'):root.VideoPoker;
  const C=Array.from({length:54},()=>new Float64Array(8));
  for(let n=0;n<54;n++){C[n][0]=1;for(let k=1;k<=7;k++)C[n][k]=n?(C[n-1][k-1]+C[n-1][k]):0;}
  const size=new Uint8Array(128),last=new Uint8Array(128),prev=new Uint8Array(128);
  for(let m=1;m<128;m++){last[m]=31-Math.clz32(m);prev[m]=m^(1<<last[m]);size[m]=size[prev[m]]+1;}
  function eachHand(n,visit,count=5){let i=0;const h=new Array(count);function walk(pos,limit){if(pos<0){visit(h,i++);return;}for(h[pos]=pos;h[pos]<limit;h[pos]++)walk(pos-1,h[pos]);}walk(count-1,n);}
  function layout(n,count=5){const offsets=[0];for(let k=1;k<=count;k++)offsets[k]=offsets[k-1]+C[n][k-1];return {offsets,length:offsets[count]+C[n][count]};}
  function indices(h,out){out[0]=0;for(let m=1;m<(1<<h.length);m++)out[m]=out[prev[m]]+C[h[last[m]]][size[m]];}
  function invert(a){for(let bit=1;bit<a.length;bit<<=1)for(let m=0;m<a.length;m++)if(!(m&bit))a[m]-=a[m|bit];}
  function build(v,progress=()=>{}){
    const n=v.deckSize,count=v.handSize||5,limit=1<<count;
    if(count>5)throw Error("Use the rank-combination solver for six- and seven-card hands.");
    const {offsets,length}=layout(n,count),sums=new Float64Array(length),ix=new Int32Array(limit);
    eachHand(n,(h,i)=>{const pay=E.evaluate(h,v).payout;if(pay){indices(h,ix);for(let m=0;m<limit;m++)sums[offsets[size[m]]+ix[m]]+=pay;}if(i%100000===0)progress(i/C[n][count]);},count);
    progress(1);return {sums,offsets,n,count};
  }
  function values(h,table){const sorted=[...h].sort((a,b)=>a-b),ix=new Int32Array(1<<h.length),a=new Float64Array(1<<h.length);indices(sorted,ix);for(let m=0;m<a.length;m++)a[m]=table.sums[table.offsets[size[m]]+ix[m]];invert(a);return a;}
  // `ev` is return less any added stake, so ev - 1 is profit per initial deal.
  // This preserves the ordinary one-credit return while comparing different stakes fairly.
  function solveHand(h,v,table){
    const count=v.handSize||5,limit=1<<count;E.validateHand(h,v.deckSize,count);table=table||build(v);
    const sorted=[...h].sort((a,b)=>a-b),a=values(h,table),rows=[];
    for(let m=0;m<limit;m++){
      let mask=0;for(let i=0;i<count;i++)if(m&(1<<i))mask|=1<<h.indexOf(sorted[i]);
      const outcomes=C[v.deckSize-count][count-size[m]],baseEV=a[m]/outcomes;
      for(const stake of v.doubleOnDraw&&m!==limit-1?[1,2]:[1]){
        const grossEV=stake*baseEV,netEV=grossEV-stake;
        rows.push({mask,ev:baseEV*stake-(stake-1),netEV,grossEV,stake,doubled:stake===2,outcomes,held:size[m]});
      }
    }
    return rows.sort((a,b)=>Math.abs(a.ev-b.ev)>1e-12?b.ev-a.ev:a.stake-b.stake||b.held-a.held||a.mask-b.mask);
  }
  function solveAll(v,table,progress=()=>{}){
    table=table||build(v);const count=v.handSize||5,limit=1<<count,ix=new Int32Array(limit),a=new Float64Array(limit),n=v.deckSize,holdCounts=new Array(count+1).fill(0);
    let total=0,compensation=0,doubleCount=0,doubleTieCount=0;
    eachHand(n,(h,i)=>{
      indices(h,ix);for(let m=0;m<limit;m++)a[m]=table.sums[table.offsets[size[m]]+ix[m]];invert(a);
      let single=-Infinity,double=-Infinity,singleHeld=0,doubleHeld=0;
      for(let m=0;m<limit;m++){
        const ev=a[m]/C[n-count][count-size[m]];
        if(ev>single+1e-12||(Math.abs(ev-single)<1e-12&&size[m]>singleHeld)){single=ev;singleHeld=size[m];}
        if(v.doubleOnDraw&&m!==limit-1){const doubled=2*ev-1;if(doubled>double+1e-12||(Math.abs(doubled-double)<1e-12&&size[m]>doubleHeld)){double=doubled;doubleHeld=size[m];}}
      }
      const useDouble=double>single+1e-12,best=useDouble?double:single;
      if(useDouble)doubleCount++;else if(v.doubleOnDraw&&Math.abs(double-single)<1e-12)doubleTieCount++;
      holdCounts[useDouble?doubleHeld:singleHeld]++;
      const y=best-compensation,t=total+y;compensation=(t-total)-y;total=t;
      if(i%100000===0)progress(i/C[n][count]);
    },count);
    progress(1);const deals=C[n][count],netEV=total/deals-1;
    if(!v.doubleOnDraw)return {rtp:total/deals,netEV,deals,holdCounts,method:`Exhaustive: every initial hand, all ${limit} holds, every legal draw`};
    const doubleFrequency=doubleCount/deals,averageStake=1+doubleFrequency,expectedReturn=netEV+averageStake;
    return {rtp:expectedReturn/averageStake,netEV,expectedReturn,averageStake,doubleCount,doubleFrequency,doubleTieCount,doubleTieFrequency:doubleTieCount/deals,deals,holdCounts,method:`Exhaustive: every initial hand, ${limit} base-stake and ${limit-1} 2× decisions, every legal draw; maximize net profit, prefer base stake on ties`};
  }
  const api={C,size,eachHand,layout,indices,invert,build,solveHand,solveAll};if(typeof module!=='undefined')module.exports=api;else root.VideoPokerSolver=api;
})(typeof self!=='undefined'?self:globalThis);
