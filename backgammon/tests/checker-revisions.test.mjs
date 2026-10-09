import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initialState, legalPaths, matchingPaths, applyStep, assertState, sign } from '../core/rules.mjs';
import { dieSwitchRoutes, checkerRoutes, originalReturnRoutes } from '../core/draft.mjs';
const fixture = JSON.parse(readFileSync(new URL('./fixtures/bar-revision.json', import.meta.url)));
const at = (s, steps) => steps.reduce((b, st) => applyStep(b, st), s);
const targets = rs => [...new Set(rs.map(r => r.to))].sort((a,b) => a-b);
function verify(s, paths, draft, min = 0) {
  const original = JSON.stringify({s, paths, draft});
  const current = at(s, draft);
  const routes = dieSwitchRoutes(s, paths, draft, min);
  const counts = b => [b.bar[s.turn], ...b.points.map(n => Math.max(0,n*sign(s.turn))), b.off[s.turn]];
  const index = p => p === 'bar' ? 0 : p === 'off' ? 25 : p+1;
  for (const r of routes) {
    assert.ok(matchingPaths(paths, r.remaining).length);
    assert.deepEqual(r.remaining.slice(0,min), draft.slice(0,min));
    const result = at(s,r.remaining);
    assertState(result);
    const delta = counts(current).map((n,i) => counts(result)[i]-n);
    const expected = Array(26).fill(0); expected[index(r.from)]--; expected[index(r.to)]++;
    assert.deepEqual(delta, expected, 'only the selected own checker changes location');
  }
  assert.equal(JSON.stringify({s,paths,draft}),original,'route queries never mutate a draft');
  return routes;
}
test('screenshot: both 21 and 24 offered from 20 regardless of dice order, side or displayed orientation', () => {
  for (const turn of [0,1]) for (const draft of fixture.drafts) {
    const s=structuredClone(fixture.state), p=n=>typeof n==='number' && turn ? 23-n : n;
    if(turn){s.turn=1;s.points=s.points.reverse().map(n=>-n);s.bar.reverse();s.off.reverse();}
    const d=draft.map(st=>({...st,from:p(st.from),to:p(st.to)})), paths=legalPaths(s);
    assert.ok(matchingPaths(paths,d).length);
    const rs=verify(s,paths,d).filter(r=>r.from===p(19));
    assert.deepEqual(targets(rs),[p(20),p(23)].sort((a,b)=>a-b));
    for(const r of rs) assert.equal(r.remaining.length,1,'release exactly one die');
    assert.deepEqual(targets(originalReturnRoutes(s,paths,d)),['bar']);
    for(const r of rs) {
      const all=[...verify(s,paths,r.remaining),...checkerRoutes(paths,r.remaining,r.to)];
      assert.ok(all.some(a=>a.from===r.to && a.to===p(19)),'can play the chain forward again');
    }
  }
});
test('bar entry cannot borrow a die used by another checker',()=>{
  const s=fixture.state, paths=legalPaths(s);
  const draft=[{from:'bar',to:23,die:1},{from:7,to:3,die:4}];
  assert.ok(matchingPaths(paths,draft).length);
  assert.deepEqual(verify(s,paths,draft).filter(r=>r.from===23),[]);
});
function doublePosition(){
 const points=Array(24).fill(0);points[12]=1;points[5]=14;points[23]=-15;
 return initialState({phase:'move',dice:[2,2],points});
}
test('doubles offer every partial placement, and protect the forced prefix',()=>{
  const s=doublePosition(), paths=legalPaths(s);
  const draft=[{from:12,to:10,die:2},{from:10,to:8,die:2},{from:8,to:6,die:2},{from:6,to:4,die:2}];
  assert.deepEqual(targets(verify(s,paths,draft)),[6,8,10]);
  assert.deepEqual(targets(verify(s,paths,draft,1)),[6,8,10]);
  assert.deepEqual(targets(verify(s,paths,draft,2)),[6,8]);
  assert.deepEqual(verify(s,paths,draft,4),[]);
  assert.deepEqual(originalReturnRoutes(s,paths,draft,1),[]);
});
test('interleaved moves stay fixed while selected checker reuses its dice and unused dice',()=>{
 const s=doublePosition(), paths=legalPaths(s);
 const other={from:5,to:3,die:2};
 const draft=[{from:12,to:10,die:2},other,{from:10,to:8,die:2}];
 const rs=verify(s,paths,draft).filter(r=>r.from===8);
 assert.deepEqual(targets(rs),[6,10]);
 for(const r of rs) assert.equal(r.remaining.filter(st=>st.from===5&&st.to===3).length,1);
 assert.ok(rs.some(r=>r.to===6&&r.remaining.length===4));
 assert.ok(rs.some(r=>r.to===10&&r.remaining.length===2));
});
test('bearoff revisions use legal intermediate placements and preserve the other checker',()=>{
 const points=Array(24).fill(0);points[3]=1;points[0]=1;points[23]=-15;
 const s=initialState({phase:'move',dice:[3,1],points,off:[13,0]}),paths=legalPaths(s);
 const d=[{from:3,to:0,die:3},{from:0,to:'off',die:1}];
 const rs=verify(s,paths,d);
 assert.deepEqual(targets(rs.filter(r=>r.from==='off')),[0,2]);
});
test('all prefixes of varied legal turns preserve other own checkers and locked steps',()=>{
 const positions=[fixture.state,doublePosition()];
 let examined=0;
 for(const base of positions) for(const dice of [[1,2],[1,4],[2,2],[3,5],[6,6]]){
  const s={...base,dice},paths=legalPaths(s);
  for(const path of paths.slice(0,40)) for(let n=1;n<=path.steps.length;n++) for(let min=0;min<=n;min++) {
   examined+=verify(s,paths,path.steps.slice(0,n),min).length;
  }
 }
 assert.ok(examined>100);
});
