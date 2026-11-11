// SPDX-License-Identifier: GPL-3.0-or-later
// Exact, conservative race adjudication. No evaluation scores, probabilities,
// future seeded dice, or assumptions about sensible play enter this proof.
const rolls = [];
for (let a=1;a<=6;a++) for (let b=a;b<=6;b++) rolls.push([a,b]);
rolls.sort((a,b)=>(a[0]===a[1]?4*a[0]:a[0]+a[1])-(b[0]===b[1]?4*b[0]:b[0]+b[1]));
const count = h => h.reduce((a,b)=>a+b,0);
const pips = h => h.reduce((a,b,i)=>a+b*(i+1),0);
const cache = new Map();

// All legal outcomes for one side of a contact-free race, indexed from its own
// ace point. No point can be blocked, so every die is playable until the last
// checker is borne off; bearing off needs every checker in the home board.
export function homeRollOutcomes(home, dice) {
  const outcomes=new Map(), orders=dice[0]===dice[1] ? [Array(4).fill(dice[0])] : [dice,[...dice].reverse()];
  const walk=(h,order,index)=>{
    if(index===order.length||!h.some(Boolean)){outcomes.set(h.join(','),h);return;}
    const die=order[index],highest=h.findLastIndex(Boolean);
    for(let from=0;from<h.length;from++){
      if(!h[from]||(from<die&&(highest>5||(from+1<die&&from!==highest))))continue;
      const next=[...h];next[from]--;
      if(from>=die)next[from-die]++;
      walk(next,order,index+1);
    }
  };
  for(const order of orders)walk(home,order,0);
  return [...outcomes.values()].sort((a,b)=>pips(b)-pips(a));
}

// Earliest possible turn for each goal: four sixes a turn, one quadrant a move.
const fastest={
  finish:side=>Math.ceil(side.reduce((sum,n,i)=>sum+n*Math.ceil((i+1)/6),0)/4),
  off:side=>Math.ceil((side.reduce((sum,n,i)=>sum+n*Math.floor(i/6),0)+1)/4),
  escape:side=>Math.ceil(count(side.slice(18))/4),
};
const trim=side=>side.slice(0,Math.max(6,side.findLastIndex(Boolean)+1));

// True when EVERY roll and EVERY legal play reaches the goal within `turns`:
// 'finish' bears off the last checker, 'off' bears off the first one, and
// 'escape' leaves the opponent's home board (points 19-24).
function proveWithin(side, turns, goal, budget, memo) {
  const n=count(side),pip=pips(side);
  if(!n||(goal==='escape'&&!side.slice(18).some(Boolean)))return true;
  if(turns<=0)return false;
  // Each unfinished turn reduces (pips + checkers) by at least three. Without
  // a bearoff it reduces pips by at least three, and a turn that bears nothing
  // off leaves at least one pip a checker; one that leaves a checker in the
  // opponent's home board leaves at least 18 more.
  const upper=goal==='finish'?Math.floor((pip+n+1)/3):Math.floor((pip-n-(goal==='escape'?18:0))/3)+1;
  if(turns>=upper)return true;
  if(turns<fastest[goal](side))return false;
  const key=`${side}:${turns}:${goal}`;
  if(memo.has(key))return memo.get(key);
  if(--budget.nodes<0)return null;
  for(const dice of rolls)for(const next of homeRollOutcomes(side,dice)){
    if(--budget.outcomes<0)return null;
    if(goal==='off'&&count(next)<n)continue;
    const proof=proveWithin(next,turns-1,goal,budget,memo);
    if(proof!==true){if(proof===false)memo.set(key,false);return proof;}
  }
  memo.set(key,true);return true;
}

export function certainBearoff(state) {
  if(!['roll','move'].includes(state.phase)||state.pending||state.bar.some(Boolean))return null;
  const white=state.points.flatMap((n,i)=>n>0?[i]:[]),black=state.points.flatMap((n,i)=>n<0?[i]:[]);
  if(!white.length||!black.length||Math.max(...white)>=Math.min(...black))return null;
  const homes=[0,1].map(player=>Array.from({length:24},(_,i)=>Math.max(0,state.points[player?23-i:i]*(player?-1:1))));
  const jacoby=!state.matchLength&&state.rules?.jacoby&&state.cube.owner===null;
  // A single game already ends the match for this winner: gammons add nothing.
  const flat=[0,1].map(winner=>!!(jacoby||(state.matchLength&&state.cube.value>=state.matchLength-state.scores[winner])));
  const key=JSON.stringify([homes,state.turn,flat,state.phase==='move'?state.dice:null]);
  if(cache.has(key))return cache.get(key);
  const budget={nodes:2000,outcomes:20000},memo=new Map();
  let result=proveRace(homes,state.turn,flat,budget,memo);
  if(!result&&state.phase==='move') {
    // The current dice are known; future dice are still ALL possible rolls.
    // Every legal way to use this roll must lead to the same exact award.
    // One shared work budget covers every branch, including future proofs.
    let common=null;
    const mover=state.turn,other=homes[1-mover];
    for(const next of homeRollOutcomes(trim(homes[mover]),state.dice)) {
      if(--budget.outcomes<0){common=null;break;}
      const after=homes.map((home,p)=>p===mover?[...next,...Array(24-next.length).fill(0)]:home);
      const proof=count(next)===0
        ? {winner:mover,level:flat[mover]||count(other)<15?1:other.slice(18).some(Boolean)?3:2}
        : proveRace(after,1-mover,flat,budget,memo);
      if(!proof||(common&&(common.winner!==proof.winner||common.level!==proof.level))){common=null;break;}
      common=proof;
    }
    result=common;
  }
  // A deterministic work cap gives an inconclusive answer, never a guess.
  // Keep proof work bounded on phones, including hostile imported positions.
  result=result?Object.freeze(result):null;
  cache.set(key,result);if(cache.size>256)cache.delete(cache.keys().next().value);
  return result;
}

function proveRace(homes,turn,flat,budget,memo) {
  for(const winner of [turn,1-turn]){
    const own=trim(homes[winner]),loser=1-winner,other=homes[loser];
    const loserFirst=turn===loser?1:0;
    const within=(turns,side=own,goal='finish')=>proveWithin(side,turns,goal,budget,memo)===true;
    // The winner's slowest finish must precede the loser's fastest one.
    if(!within(fastest.finish(other)-loserFirst))continue;
    if(count(other)<15||flat[winner])return Object.freeze({winner,level:1});
    // The loser's turns before the winner's fastest possible finish.
    const reprieve=fastest.finish(own)-(turn===winner?1:0);
    const back=other.slice(18).some(Boolean);
    let level=0;
    if(back&&within(fastest.escape(other)-loserFirst))level=3;
    else if(within(fastest.off(other)-loserFirst)){
      if(!back||within(reprieve,other,'escape'))level=2;
    } else if(within(reprieve,trim(other),'off'))level=1;
    if(level)return Object.freeze({winner,level});
  }
  return null;
}
