/* Optimal-play outcome frequencies. Exact for 4/5 cards; sampled deals for 6/7. */
(function(root){
 'use strict';
 const E=typeof module!=='undefined'?require('./engine.js'):root.VideoPoker;
 const S=typeof module!=='undefined'?require('./solver.js'):root.VideoPokerSolver;
 const CS=typeof module!=='undefined'?require('./cribbage-solver.js'):root.VideoPokerCribbageSolver;
 const CD=typeof module!=='undefined'?require('./cribbage-distribution.js'):root.VideoPokerCribbageDistribution;
 function summarize(bins,deals,estimated=false){
  const payouts=[...bins].sort((a,b)=>a[0]-b[0]).map(([pnl,weight])=>({pnl,probability:Math.max(0,weight/deals)}));
  const mass=payouts.reduce((a,r)=>a+r.probability,0);if(Math.abs(mass-1)>1e-7)throw Error('Outcome probabilities do not sum to one.');
  for(const r of payouts)r.probability/=mass;
  let netEV=0,second=0,win=0,push=0,loss=0;for(const r of payouts){netEV+=r.pnl*r.probability;second+=r.pnl*r.pnl*r.probability;if(r.pnl>0)win+=r.probability;else if(r.pnl<0)loss+=r.probability;else push+=r.probability;}
  return {payouts,netEV,win,push,loss,standardDeviation:Math.sqrt(Math.max(0,second-netEV*netEV)),deals,estimated,method:estimated?'Sampled starting hands; exact optimal decisions and conditional payout frequencies':'Exhaustive starting hands and legal draws under optimal play'};
 }
 function exact(v,table,progress=()=>{}){
  table=table||S.build(v);const n=v.deckSize,count=v.handSize||5,limit=1<<count,deals=S.C[n][count],ix=new Int32Array(limit),a=new Float64Array(limit);
  // Inclusion–exclusion records the distribution of the optimal policy as
  // coefficients on final-hand subsets. It avoids enumerating billions of draws.
  const weights=[new Float64Array(table.sums.length),...(v.doubleOnDraw?[new Float64Array(table.sums.length)]:[])];
  S.eachHand(n,(h,i)=>{
   S.indices(h,ix);for(let m=0;m<limit;m++)a[m]=table.sums[table.offsets[S.size[m]]+ix[m]];S.invert(a);
   let best=-Infinity,chosen=0,stake=1;
   for(let m=0;m<limit;m++)for(const st of v.doubleOnDraw&&m!==limit-1?[1,2]:[1]){
    const net=st*(a[m]/S.C[n-count][count-S.size[m]]-1);
    if(net>best+1e-12||(Math.abs(net-best)<=1e-12&&(st<stake||st===stake&&S.size[m]>S.size[chosen]))){best=net;chosen=m;stake=st;}
   }
   const discarded=(limit-1)^chosen,denom=S.C[n-count][count-S.size[chosen]],w=weights[stake-1];
   for(let sub=discarded;;sub=(sub-1)&discarded){const m=chosen|sub;w[table.offsets[S.size[m]]+ix[m]]+=(S.size[sub]%2?-1:1)/denom;if(!sub)break;}
   if(i%100000===0)progress(.5*i/deals);
  },count);
  const bins=new Map();
  S.eachHand(n,(h,i)=>{
   S.indices(h,ix);const pay=E.evaluate(h,v).payout;
   for(let st=1;st<=weights.length;st++){let w=0;for(let m=0;m<limit;m++)w+=weights[st-1][table.offsets[S.size[m]]+ix[m]];if(w<-1e-7)throw Error('Negative final-hand probability.');if(w>0){const net=st*(pay-1);bins.set(net,(bins.get(net)||0)+w);}}
   if(i%100000===0)progress(.5+.5*i/deals);
  },count);
  progress(1);return summarize(bins,deals);
 }
 function sampled(v,progress=()=>{},samples=128,seed=739021){
  const bins=new Map();let doubles=0,ties=0,sum=0,sq=0;
  for(let deal=0;deal<samples;deal++){
   const deck=Array.from({length:52},(_,i)=>i);for(let i=51;i>0;i--){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const j=Math.floor(seed/4294967296*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}
   const hand=deck.slice(0,v.handSize),rows=CS.solveHand(hand,v),best=rows[0],dist=CD.distribution(hand,best.mask,v.rules.scoreCap);doubles+=best.doubled;sum+=best.netEV;sq+=best.netEV*best.netEV;const extra=rows.find(r=>r.doubled);if(!best.doubled&&extra&&Math.abs(extra.netEV-best.netEV)<1e-10)ties++;
   for(let points=0;points<dist.length;points++)if(dist[points]>0){const net=best.stake*(v.rules.payout==='net'?points-v.pays.fee:Math.max(0,points-v.pays.fee)-1);bins.set(net,(bins.get(net)||0)+dist[points]);}
   progress((deal+1)/samples);
  }
  const result=summarize(bins,samples,true),averageStake=1+doubles/samples;
  return {...result,doubleCount:doubles,doubleFrequency:doubles/samples,doubleTieCount:ties,doubleTieFrequency:ties/samples,averageStake,expectedReturn:result.netEV+averageStake,rtp:1+result.netEV/averageStake,netEVSE:Math.sqrt(Math.max(0,(sq-sum*sum/samples)/(samples-1)/samples))};
 }
 const api={exact,sampled,summarize};if(typeof module!=='undefined')module.exports=api;else root.VideoPokerOutcomes=api;
})(typeof self!=='undefined'?self:globalThis);
