/* Exact single-draw EV. No sampling, no replacement of the five dealt cards. */
(function(root){
  'use strict';
  const E=typeof module!=='undefined'?require('./engine.js'):root.VideoPoker;
  const C=Array.from({length:54},()=>new Float64Array(6));
  for(let n=0;n<54;n++){C[n][0]=1;for(let k=1;k<=5;k++)C[n][k]=n?(C[n-1][k-1]+C[n-1][k]):0;}
  const size=new Uint8Array(32),last=new Uint8Array(32),prev=new Uint8Array(32);
  for(let m=1;m<32;m++){last[m]=31-Math.clz32(m);prev[m]=m^(1<<last[m]);size[m]=size[prev[m]]+1;}
  function eachHand(n,visit){let i=0;const h=[0,1,2,3,4];for(h[4]=4;h[4]<n;h[4]++)for(h[3]=3;h[3]<h[4];h[3]++)for(h[2]=2;h[2]<h[3];h[2]++)for(h[1]=1;h[1]<h[2];h[1]++)for(h[0]=0;h[0]<h[1];h[0]++)visit(h,i++);}
  function layout(n){const offsets=[0];for(let k=1;k<=5;k++)offsets[k]=offsets[k-1]+C[n][k-1];return {offsets,length:offsets[5]+C[n][5]};}
  function indices(h,out){out[0]=0;for(let m=1;m<32;m++)out[m]=out[prev[m]]+C[h[last[m]]][size[m]];}
  function invert(a){for(let bit=1;bit<32;bit<<=1)for(let m=0;m<32;m++)if(!(m&bit))a[m]-=a[m|bit];}
  function build(v,progress=()=>{}){
    const n=v.deckSize,{offsets,length}=layout(n),sums=new Float64Array(length),ix=new Int32Array(32);
    eachHand(n,(h,i)=>{const pay=E.evaluate(h,v).payout;if(pay){indices(h,ix);for(let m=0;m<32;m++)sums[offsets[size[m]]+ix[m]]+=pay;}if(i%100000===0)progress(i/C[n][5]);});
    progress(1);return {sums,offsets,n};
  }
  function values(h,table){const sorted=[...h].sort((a,b)=>a-b),ix=new Int32Array(32),a=new Float64Array(32);indices(sorted,ix);for(let m=0;m<32;m++)a[m]=table.sums[table.offsets[size[m]]+ix[m]];invert(a);return a;}
  // `ev` is return less any added stake, so ev - 1 is profit per initial deal.
  // This preserves the ordinary one-credit return while comparing different stakes fairly.
  function solveHand(h,v,table){
    E.validateHand(h,v.deckSize);table=table||build(v);
    const sorted=[...h].sort((a,b)=>a-b),a=values(h,table),rows=[];
    for(let m=0;m<32;m++){
      let mask=0;for(let i=0;i<5;i++)if(m&(1<<i))mask|=1<<h.indexOf(sorted[i]);
      const outcomes=C[v.deckSize-5][5-size[m]],baseEV=a[m]/outcomes;
      for(const stake of v.doubleOnDraw&&m!==31?[1,2]:[1]){
        const grossEV=stake*baseEV,netEV=grossEV-stake;
        rows.push({mask,ev:baseEV*stake-(stake-1),netEV,grossEV,stake,doubled:stake===2,outcomes,held:size[m]});
      }
    }
    return rows.sort((a,b)=>Math.abs(a.ev-b.ev)>1e-12?b.ev-a.ev:a.stake-b.stake||b.held-a.held||a.mask-b.mask);
  }
  function solveAll(v,table,progress=()=>{}){
    table=table||build(v);const ix=new Int32Array(32),a=new Float64Array(32),n=v.deckSize,holdCounts=[0,0,0,0,0,0];
    let total=0,compensation=0,doubleCount=0,doubleTieCount=0;
    eachHand(n,(h,i)=>{
      indices(h,ix);for(let m=0;m<32;m++)a[m]=table.sums[table.offsets[size[m]]+ix[m]];invert(a);
      let single=-Infinity,double=-Infinity,singleHeld=0,doubleHeld=0;
      for(let m=0;m<32;m++){
        const ev=a[m]/C[n-5][5-size[m]];
        if(ev>single+1e-12||(Math.abs(ev-single)<1e-12&&size[m]>singleHeld)){single=ev;singleHeld=size[m];}
        if(v.doubleOnDraw&&m!==31){const doubled=2*ev-1;if(doubled>double+1e-12||(Math.abs(doubled-double)<1e-12&&size[m]>doubleHeld)){double=doubled;doubleHeld=size[m];}}
      }
      const useDouble=double>single+1e-12,best=useDouble?double:single;
      if(useDouble)doubleCount++;else if(v.doubleOnDraw&&Math.abs(double-single)<1e-12)doubleTieCount++;
      holdCounts[useDouble?doubleHeld:singleHeld]++;
      const y=best-compensation,t=total+y;compensation=(t-total)-y;total=t;
      if(i%100000===0)progress(i/C[n][5]);
    });
    progress(1);const deals=C[n][5],netEV=total/deals-1;
    if(!v.doubleOnDraw)return {rtp:total/deals,netEV,deals,holdCounts,method:'Exhaustive: every initial hand, all 32 holds, every legal draw'};
    const doubleFrequency=doubleCount/deals,averageStake=1+doubleFrequency,expectedReturn=netEV+averageStake;
    return {rtp:expectedReturn/averageStake,netEV,expectedReturn,averageStake,doubleCount,doubleFrequency,doubleTieCount,doubleTieFrequency:doubleTieCount/deals,deals,holdCounts,method:'Exhaustive: every initial hand, 32 single-stake and 31 double-stake decisions, every legal draw; maximize net profit, prefer single stake on ties'};
  }
  const api={C,size,eachHand,layout,indices,invert,build,solveHand,solveAll};if(typeof module!=='undefined')module.exports=api;else root.VideoPokerSolver=api;
})(typeof self!=='undefined'?self:globalThis);
