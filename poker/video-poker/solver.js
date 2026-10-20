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
  function solveHand(h,v,table){E.validateHand(h,v.deckSize);table=table||build(v);const sorted=[...h].sort((a,b)=>a-b),a=values(h,table);
    return Array.from(a,(sum,m)=>{let mask=0;for(let i=0;i<5;i++)if(m&(1<<i))mask|=1<<h.indexOf(sorted[i]);const outcomes=C[v.deckSize-5][5-size[m]];return {mask,ev:sum/outcomes,outcomes,held:size[m]};}).sort((a,b)=>b.ev-a.ev||b.held-a.held||a.mask-b.mask);
  }
  function solveAll(v,table,progress=()=>{}){
    table=table||build(v);const ix=new Int32Array(32),a=new Float64Array(32),n=v.deckSize,holdCounts=[0,0,0,0,0,0];let total=0,compensation=0;
    eachHand(n,(h,i)=>{indices(h,ix);for(let m=0;m<32;m++)a[m]=table.sums[table.offsets[size[m]]+ix[m]];invert(a);let best=-1,held=0;for(let m=0;m<32;m++){const ev=a[m]/C[n-5][5-size[m]];if(ev>best+1e-12||(Math.abs(ev-best)<1e-12&&size[m]>held)){best=ev;held=size[m];}}holdCounts[held]++;const y=best-compensation,t=total+y;compensation=(t-total)-y;total=t;if(i%100000===0)progress(i/C[n][5]);});
    progress(1);return {rtp:total/C[n][5],netEV:total/C[n][5]-1,deals:C[n][5],holdCounts,method:'Exhaustive: every initial hand, all 32 holds, every legal draw'};
  }
  const api={C,size,eachHand,layout,indices,invert,build,solveHand,solveAll};if(typeof module!=='undefined')module.exports=api;else root.VideoPokerSolver=api;
})(typeof self!=='undefined'?self:globalThis);
