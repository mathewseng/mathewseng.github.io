/* Exact score distribution of one cribbage draw, including discarded-card exclusion. */
(function(root){
 'use strict';
 const C=typeof module!=='undefined'?require('./cribbage.js'):root.VideoPokerCribbage;
 const S=typeof module!=='undefined'?require('./cribbage-solver.js'):root.VideoPokerCribbageSolver;
 const choose=S.choose,bits=Array.from({length:16},(_,m)=>m.toString(2).replace(/0/g,'').length);
 function distribution(h,mask,cap=7){
  const n=h.length,held=new Uint8Array(14),avail=new Uint8Array(14).fill(15),counts=new Uint8Array(14),take=new Uint8Array(14),hist=new Float64Array(128);let kept=0;
  for(let i=0;i<n;i++){const r=h[i]/4|0,rank=r===12?1:r+2,bit=1<<(h[i]%4);avail[rank]&=~bit;if(mask&(1<<i)){held[rank]|=bit;kept++;}}
  function suits(points){
   const j=counts[11];
   for(let jm=avail[11];;jm=(jm-1)&avail[11]){
    if(bits[jm]===take[11]){
     const jack=jm|held[11];
     for(let absent=jack;;absent=(absent-1)&jack){
      const b=bits[absent];let ways=1;
      for(let r=1;r<=13&&ways;r++)if(r!==11){if(held[r]&absent){ways=0;break;}ways*=choose[bits[avail[r]&~absent]][take[r]];}
      if(ways){
       for(let k=0;k<=b;k++)hist[points+j-k]+=((b-k)%2?-1:1)*choose[b][k]*ways;
       for(let s=0;s<4;s++){
        const bit=1<<s;if(absent&bit)continue;let fixed=jack&bit?1:0,possible=0;
        for(let r=1;r<=13;r++)if(r!==11){if(held[r]&bit)fixed++;if(take[r]&&(avail[r]&bit))possible++;}
        if(fixed+possible<4)continue;
        const poly=new Float64Array(n+1);poly[0]=1;let degree=0;
        for(let r=1;r<=13;r++)if(r!==11&&take[r]){const allowed=avail[r]&~absent,q=take[r],has=!!(allowed&bit),other=bits[allowed]-Number(has),a=choose[other][q],z=has?choose[other][q-1]:0;for(let k=Math.min(n,degree+1);k>=0;k--)poly[k]=poly[k]*a+(k?poly[k-1]*z:0);degree++;}
        for(let f=Math.max(0,4-fixed);f<=degree&&f+fixed<=n;f++)if(poly[f])for(let k=0;k<=b;k++){const w=((b-k)%2?-1:1)*choose[b][k]*poly[f];hist[points+j-k+Math.min(cap,f+fixed)]+=w;hist[points+j-k]-=w;}
       }
      }
      if(!absent)break;
     }
    }
    if(!jm)break;
   }
  }
  function visit(r,left){if(r===14){if(!left)suits(C.rankScore(counts,cap).total);return;}for(let q=0;q<=Math.min(left,bits[avail[r]]);q++){counts[r]=bits[held[r]]+q;take[r]=q;visit(r+1,left-q);}}
  visit(1,n-kept);const denom=choose[52-n][n-kept];for(let i=0;i<hist.length;i++)hist[i]/=denom;return hist;
 }
 const api={distribution};if(typeof module!=='undefined')module.exports=api;else root.VideoPokerCribbageDistribution=api;
})(typeof self!=='undefined'?self:globalThis);
