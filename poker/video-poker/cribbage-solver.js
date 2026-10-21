/* Exact conditional draws by rank combinations and suit generating functions.
 * No 52-choose-7 payout table; discarded cards remain excluded throughout. */
(function(root){
  'use strict';
  const C=typeof module!=='undefined'?require('./cribbage.js'):root.VideoPokerCribbage;
  const choose=Array.from({length:53},()=>new Float64Array(8));
  for(let n=0;n<=52;n++){choose[n][0]=1;for(let k=1;k<=7;k++)choose[n][k]=n?choose[n-1][k]+choose[n-1][k-1]:0;}
  const bits=Array.from({length:16},(_,m)=>m.toString(2).replace(/0/g,'').length);
  const rankscores=new Map(),coefficientCache=new WeakMap();
  const cardRank=c=>Math.floor(c/4)===12?1:Math.floor(c/4)+2;
  function rankScore(counts,cap){
    let key=0;for(let r=1;r<=13;r++)key=key*5+counts[r];key=key*8+cap;
    if(!rankscores.has(key))rankscores.set(key,C.rankScore(counts,cap).total);
    return rankscores.get(key);
  }
  function coefficients(fn,j){
    const out=[];for(let b=0;b<=j;b++){let sum=0;for(let k=0;k<=b;k++)sum+=((b-k)%2?-1:1)*choose[b][k]*fn(j-k);out.push(sum);}return out;
  }
  // Sum payouts over suit assignments for one final rank multiplicity.
  function suitSum(rankPoints,counts,held,available,take,n,pay,cap){
    const heldJ=held[11],drawJ=take[11],jackOptions=[];
    for(let m=available[11];;m=(m-1)&available[11]){if(bits[m]===drawJ)jackOptions.push(m|heldJ);if(m===0)break;}
    const j=counts[11];
    let cache=coefficientCache.get(pay);if(!cache){cache=new Map();coefficientCache.set(pay,cache);}
    const key=((rankPoints*5+j)*8+n)*8+cap;
    let coeff=cache.get(key);
    if(!coeff){const base=coefficients(k=>pay(rankPoints+k),j),correction=[];for(let f=4;f<=n;f++)correction[f]=coefficients(k=>pay(rankPoints+k+Math.min(f,cap))-pay(rankPoints+k),j);coeff={base,correction,flushNeeded:base.map((_,b)=>correction.some(row=>row&&row[b]))};cache.set(key,coeff);}
    const {base,correction,flushNeeded}=coeff;
    let total=0;
    for(const jackMask of jackOptions){
      for(let absent=jackMask;;absent=(absent-1)&jackMask){
        const b=bits[absent];let ways=1;
        for(let r=1;r<=13&&ways;r++)if(r!==11){if(held[r]&absent){ways=0;break;}ways*=choose[bits[available[r]&~absent]][take[r]];}
        if(ways){
          total+=base[b]*ways;
          for(let suit=0;suit<4;suit++){
            if(!flushNeeded[b])break;
            const bit=1<<suit;if(absent&bit)continue;
            let fixed=jackMask&bit?1:0,possible=0;
            for(let r=1;r<=13;r++)if(r!==11){if(held[r]&bit)fixed++;if(take[r]&&(available[r]&bit))possible++;}
            if(fixed+possible<4)continue;
            // A suit can score only with four or more cards. For <=7 cards
            // these events are disjoint across suits, so corrections add.
            const poly=new Float64Array(n+1);poly[0]=1;let degree=0;
            for(let r=1;r<=13;r++)if(r!==11&&take[r]){
              const allowed=available[r]&~absent,q=take[r],has=!!(allowed&bit),other=bits[allowed]-(has?1:0);
              const a=choose[other][q],z=has?choose[other][q-1]:0;
              for(let k=Math.min(n,degree+1);k>=0;k--)poly[k]=poly[k]*a+(k?poly[k-1]*z:0);
              degree++;
            }
            for(let k=Math.max(0,4-fixed);k<=degree&&k+fixed<=n;k++)total+=correction[k+fixed][b]*poly[k];
          }
        }
        if(absent===0)break;
      }
    }
    return total;
  }
  function expected(h,mask,pay,cap=7){
    const n=h.length,held=new Uint8Array(14),available=new Uint8Array(14).fill(15),counts=new Uint8Array(14),take=new Uint8Array(14);
    let kept=0;
    for(let i=0;i<n;i++){const r=cardRank(h[i]),bit=1<<(h[i]%4);available[r]&=~bit;if(mask&(1<<i)){held[r]|=bit;counts[r]++;kept++;}}
    const need=n-kept;if(!need)return pay(C.score(h,cap).total);
    let sum=0;
    function visit(r,left){
      if(r===14){if(left===0){const points=rankScore(counts,cap);sum+=suitSum(points,counts,held,available,take,n,pay,cap);}return;}
      const fixed=bits[held[r]],max=Math.min(left,bits[available[r]]);
      for(let q=0;q<=max;q++){counts[r]=fixed+q;take[r]=q;visit(r+1,left-q);}
      counts[r]=fixed;take[r]=0;
    }
    visit(1,need);return sum/choose[52-n][need];
  }
  function solveHand(h,v,progress=()=>{}){
    const n=v.handSize,last=(1<<n)-1,pay=score=>v.rules?.payout==='net'?1+score-v.pays.fee:Math.max(0,score-v.pays.fee),rows=[];
    if(h.length!==n||new Set(h).size!==n||h.some(c=>!Number.isInteger(c)||c<0||c>=52))throw Error(`Choose ${n} different cards from the deck.`);
    for(let mask=0;mask<=last;mask++){
      const base=expected(h,mask,pay,v.rules?.scoreCap||7),held=mask.toString(2).replace(/0/g,'').length;
      for(const stake of v.doubleOnDraw&&mask!==last?[1,2]:[1]){const grossEV=base*stake,netEV=grossEV-stake;rows.push({mask,held,stake,doubled:stake===2,grossEV,netEV,ev:netEV+1,outcomes:choose[52-n][n-held]});}
      progress((mask+1)/(last+1));
    }
    return rows.sort((a,b)=>Math.abs(a.ev-b.ev)>1e-10?b.ev-a.ev:a.stake-b.stake||b.held-a.held||a.mask-b.mask);
  }
  function sampleGame(v,progress=()=>{},samples=128,seed=739021){
    let netSum=0,netSq=0,stakeSum=0,stakeSq=0,cross=0,doubleCount=0,doubleTieCount=0;
    for(let deal=0;deal<samples;deal++){
      const deck=Array.from({length:52},(_,i)=>i);
      for(let i=51;i>0;i--){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const j=Math.floor(seed/4294967296*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}
      const rows=solveHand(deck.slice(0,v.handSize),v),best=rows[0],base=rows.find(r=>!r.doubled),extra=rows.find(r=>r.doubled);
      const net=best.netEV,stake=best.stake;netSum+=net;netSq+=net*net;stakeSum+=stake;stakeSq+=stake*stake;cross+=net*stake;
      if(best.doubled)doubleCount++;else if(extra&&Math.abs(extra.netEV-base.netEV)<1e-10)doubleTieCount++;
      progress((deal+1)/samples);
    }
    const netEV=netSum/samples,averageStake=stakeSum/samples,ratio=netEV/averageStake;
    const rtpSE=Math.sqrt(Math.max(0,(netSq-2*ratio*cross+ratio*ratio*stakeSq)/(samples-1)/samples))/averageStake;
    return {rtp:1+ratio,netEV,expectedReturn:netEV+averageStake,averageStake,deals:samples,doubleCount,doubleFrequency:doubleCount/samples,doubleTieCount,doubleTieFrequency:doubleTieCount/samples,rtpSE,estimated:true,method:'Sampled initial deals; exact EV for every legal draw and hold on each sampled deal'};
  }
  const api={choose,expected,solveHand,sampleGame};if(typeof module!=='undefined')module.exports=api;else root.VideoPokerCribbageSolver=api;
})(typeof self!=='undefined'?self:globalThis);
