import test from "node:test";
import assert from "node:assert/strict";
import { initialState, transition, replay, decisionPlayer } from "../core/rules.mjs";
import { defaultPlayRules } from "../core/play-session.mjs";
import { ruleGuide } from "../core/rule-guide.mjs";

test("every opening tie doubles, survives replay, and stops at the cube limit", () => {
  const initial = initialState({ matchLength: 0, rules: defaultPlayRules(0) });
  let s=initial; const events=[];
  for(let i=1;i<=12;i++) {
    const e={actor:decisionPlayer(s),action:{type:"opening",dice:[i%6+1,i%6+1]}};
    events.push(e);s=transition(s,e.action,e.actor);
    assert.equal(s.cube.value,2**Math.min(i,10));
    assert.equal(s.cube.owner,null);assert.equal(s.phase,"opening");
  }
  assert.deepEqual(replay(initial,events).at(-1),s);
  const roll=initialState({matchLength:0,phase:"roll",rules:defaultPlayRules(0)});
  assert.equal(transition(roll,{type:"roll",dice:[6,6]}).cube.value,1);
});
test("rule reference covers basics and reflects every money/match option", () => {
  const guide=(options)=>Object.fromEntries(ruleGuide(initialState(options)));
  const money=guide({matchLength:0,rules:defaultPlayRules(0)});
  for(const title of ["Opening roll","Using the dice","Blocked points and hits","Entering from the bar","Bearing off","Scoring","Doubling cube","Resignation","Drafts, forced play and undo"])assert.ok(money[title]);
  assert.match(money["Opening stakes"],/1 → 2 → 4 → 8/);
  assert.match(money.Jacoby,/^On/);
  assert.match(money["Beavers and raccoons"],/^Off/);
  const capped=guide({matchLength:0,rules:{automaticDoubles:1,immediateRedoubles:2}});
  assert.match(capped["Opening stakes"],/at most 1/);
  assert.match(capped["Beavers and raccoons"],/Raccoons are also on/);
  assert.match(capped.Jacoby,/^Off/);
  assert.match(guide({matchLength:0,rules:{cube:false}})["Doubling cube"],/^Disabled/);
  const match=guide({matchLength:1});
  assert.match(match.Crawford,/This is the Crawford game/);
  assert.match(match["Opening stakes"],/do not raise/);
  assert.match(match.Jacoby,/Not used/);
});
