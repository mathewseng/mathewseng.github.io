const test = require("node:test"), assert = require("node:assert/strict");
const E=require("../engine.js"), S=require("../solver.js"), Stats=require("../reports/statistics.js");
// Independent exhaustive reference uses only public rules transitions.
function brute(s) { if(!E.actions(s).length)return E.score(s); return Math.max(...E.actions(s).map(a=>brute(E.transition(s,a)))); }
test("solver agrees with independent exhaustive search on small rooms, ties and potion choices",()=>{
  const cases=[
    {deck:["8d","8s","8c","Th"],health:15},
    {deck:["As","2h","3d","4s"],health:3},
    {deck:["8d","Qs","3h","2s","Th","7c"],health:12},
    {deck:["5h","7h","9d","Ks","2s"],health:18},
    {deck:["5s","5c","6h","8d","As","Th"],health:11},
  ];
  for(const {deck,health} of cases){const s=E.createGame({deck,seed:"endgame"});s.health=health;const optimal=brute(s), r=S.solve(s,{timeMs:10000,maxNodes:1000000,beamWidth:8,rollouts:8});assert.equal(r.exact,true);assert.equal(r.score,optimal);let replay=s;for(const a of r.line)replay=E.transition(replay,a);assert.equal(E.score(replay),optimal);}
});
test("every compact transition matches the engine, including automatic refills",()=>{
  for(let seed=0;seed<10;seed++){
    let s=E.createGame({seed:"compact-"+seed});
    for(let i=0;i<80&&E.actions(s).length;i++){
      if(s.phase==="ready"){s=E.transition(s,{type:"descend"});continue;}
      const legal=E.actions(s);
      for(const a of legal){const compact=S.pack(s), c=s.room.find(c=>c?.id===a.id), move=a.type==="flee"?{flee:true}:{c:c.value+(c.type==="weapon"?16:c.type==="potion"?32:0),...(a.type==="fight"?{armed:a.mode==="weapon"}:{})};const next=S.step(compact,move);let actual=E.transition(s,a);if(actual.phase==="ready")actual=E.transition(actual,{type:"descend"});if(next.score!=null)assert.equal(next.score,E.score(actual));else { const expected=S.pack(actual); if(!expected.f) { expected.r.sort((a,b)=>a-b); next.state.r.sort((a,b)=>a-b); } assert.deepEqual(next.state,expected); }}
      s=E.transition(s,legal[(i*7+seed)%legal.length]);
    }
  }
});
test("published report rows all replay to their claimed scores and obey optimal bounds",()=>{
  const data=require("../reports/outcomes.json"); assert.equal(data.rows.length,data.requestedDeals);assert.equal(new Set(data.rows.map(r=>r.seed)).size,data.rows.length);
  for(const row of data.rows){let s=E.createGame({seed:row.seed});for(const a of row.line)s=E.transition(s,a);assert.ok(["won","lost"].includes(s.phase));assert.equal(E.score(s),row.score);assert.ok(row.score<=row.upper);assert.ok(row.upper<=30);if(row.exact)assert.equal(row.score,row.upper);}
});
test("statistics handle even medians, loss scores, proof coverage, and missing cohorts",()=>{
  const s=Stats.summarize([{score:-10,upper:20,exact:false},{score:20,upper:20,exact:true},{score:30,upper:30,exact:true},{score:10,upper:30,exact:false}]);
  assert.equal(s.mean,12.5);assert.equal(s.meanUpper,25);assert.equal(s.median,15);assert.equal(s.medianUpper,25);assert.equal(s.wins,3);assert.equal(s.exact,2);assert.equal(Stats.median([]),null);assert.equal(Stats.summarize([]).mean,null);
});
