/* OFC cribbage scoring, generalized to four through seven cards. No starter. */
(function(root){
  'use strict';
  function rankScore(counts,cap=7){
    let pairs=0,runs=0,longest=0;
    const ways=new Uint16Array(16);ways[0]=1;
    for(let r=1;r<=13;r++){
      const count=counts[r];pairs+=count*(count-1);
      for(let card=0;card<count;card++)for(let total=15;total>=Math.min(r,10);total--)ways[total]+=ways[total-Math.min(r,10)];
    }
    for(let length=cap;length>=3&&!runs;length--)for(let start=1;start<=14-length;start++){
      let multiplier=1;for(let r=start;r<start+length;r++)multiplier*=counts[r];
      if(multiplier){runs+=length*multiplier;longest=length;}
    }
    return {pairs,fifteens:2*ways[15],runs,runLength:longest,total:pairs+2*ways[15]+runs};
  }
  function score(cards,cap=7){
    const counts=new Uint8Array(14),suits=new Uint8Array(4),jacks=new Uint8Array(4);
    for(const c of cards){const r=Math.floor(c/4)+2;counts[r===14?1:r]++;suits[c%4]++;if(r===11)jacks[c%4]++;}
    const result=rankScore(counts,cap),largest=Math.max(...suits);
    result.flush=largest>=4?Math.min(largest,cap):0;
    result.nobs=suits.reduce((n,count,s)=>n+(count>1?jacks[s]:0),0);
    result.total+=result.flush+result.nobs;return result;
  }
  const api={score,rankScore};if(typeof module!=='undefined')module.exports=api;else root.VideoPokerCribbage=api;
})(typeof self!=='undefined'?self:globalThis);
