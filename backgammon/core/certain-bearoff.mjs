// SPDX-License-Identifier: GPL-3.0-or-later
// Exact, conservative race adjudication. No evaluation scores, probabilities,
// future seeded dice, or assumptions about sensible play enter this proof.
const rolls = [];
for (let a=1;a<=6;a++) for (let b=a;b<=6;b++) rolls.push([a,b]);
rolls.sort((a,b)=>(a[0]===a[1]?4*a[0]:a[0]+a[1])-(b[0]===b[1]?4*b[0]:b[0]+b[1]));
const count = h => h.reduce((a,b)=>a+b,0);
const pips = h => h.reduce((a,b,i)=>a+b*(i+1),0);
const cache = new Map();

// All legal outcomes for one side already wholly in its home board. With no
// contact, every die is playable until the last checker is borne off.
export function homeRollOutcomes(home, dice) {
  const outcomes=new Map(), orders=dice[0]===dice[1] ? [Array(4).fill(dice[0])] : [dice,[...dice].reverse()];
  const walk=(h,order,index)=>{
    if(index===order.length||!h.some(Boolean)){outcomes.set(h.join(','),h);return;}
    const die=order[index],highest=h.findLastIndex(Boolean);
    for(let from=0;from<6;from++){
      if(!h[from]||(from+1<die&&from!==highest))continue;
      const next=[...h];next[from]--;
      if(from+1>die)next[from-die]++;
      walk(next,order,index+1);
    }
  };
  for(const order of orders)walk(home,order,0);
  return [...outcomes.values()].sort((a,b)=>pips(b)-pips(a));
}

function proveWithin(home, turns, firstOff, budget, memo) {
  const n=count(home),pip=pips(home);
  if(!n)return true;
  if(turns<=0)return false;
  // Each unfinished turn reduces (pips + checkers) by at least three.
  // Until the first bearoff, it reduces pips by at least three instead.
  const upper=firstOff?Math.floor((pip-n)/3)+1:Math.floor((pip+n+1)/3);
  if(turns>=upper)return true;
  if(!firstOff&&turns<Math.ceil(n/4))return false;
  const key=`${home}:${turns}:${firstOff}`;
  if(memo.has(key))return memo.get(key);
  if(--budget.nodes<0)return null;
  for(const dice of rolls)for(const next of homeRollOutcomes(home,dice)){
    if(--budget.outcomes<0)return null;
    if(firstOff&&count(next)<n)continue;
    const proof=proveWithin(next,turns-1,firstOff,budget,memo);
    if(proof!==true){if(proof===false)memo.set(key,false);return proof;}
  }
  memo.set(key,true);return true;
}

export function certainBearoff(state) {
  if(state.phase!=='roll'||state.pending||state.bar.some(Boolean))return null;
  const white=state.points.flatMap((n,i)=>n>0?[i]:[]),black=state.points.flatMap((n,i)=>n<0?[i]:[]);
  if(!white.length||!black.length||Math.max(...white)>=Math.min(...black))return null;
  const homes=[0,1].map(player=>Array.from({length:24},(_,i)=>Math.max(0,state.points[player?23-i:i]*(player?-1:1))));
  const jacoby=!state.matchLength&&state.rules?.jacoby&&state.cube.owner===null;
  const key=JSON.stringify([homes,state.turn,jacoby]);
  if(cache.has(key))return cache.get(key);
  const budget={nodes:2000,outcomes:20000},memo=new Map();
  let result=null;
  for(const winner of [state.turn,1-state.turn]){
    const own=homes[winner],loser=1-winner,other=homes[loser];
    if(own.slice(6).some(Boolean))continue;
    // Passed checkers may still sit in the winner's home board: contact is
    // impossible but a backgammon can still change the award. Leave it live.
    if(count(other)===15&&!jacoby&&other.slice(18).some(Boolean))continue;
    // Four sixes achieve these earliest possible turns in a contact-free race.
    const fastest=side=>Math.ceil(side.reduce((sum,n,i)=>sum+n*Math.ceil((i+1)/6),0)/4);
    const loserFirst=state.turn===loser?1:0;
    const winBy=fastest(other)-loserFirst;
    if(proveWithin(own.slice(0,6),winBy,false,budget,memo)!==true)continue;
    let level;
    if(count(other)<15||jacoby)level=1;
    else {
      const firstOff=Math.ceil((other.reduce((sum,n,i)=>sum+n*Math.floor(i/6),0)+1)/4);
      if(proveWithin(own.slice(0,6),firstOff-loserFirst,false,budget,memo)===true)level=2;
      else if(!other.slice(6).some(Boolean)&&
        proveWithin(other.slice(0,6),fastest(own)-(state.turn===winner?1:0),true,budget,memo)===true)level=1;
    }
    if(level){result=Object.freeze({winner,level});break;}
  }
  // A deterministic work cap gives an inconclusive answer, never a guess.
  // Keep proof work bounded on phones, including hostile imported positions.
  cache.set(key,result);if(cache.size>256)cache.delete(cache.keys().next().value);
  return result;
}
