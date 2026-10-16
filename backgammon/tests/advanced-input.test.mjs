import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, legalPaths, nextSteps, matchingPaths, transition, assertState, MAX_CUBE } from '../core/rules.mjs';
import { advancedAction, selectedDie } from '../core/advanced-input.mjs';
import { originalReturnRoutes, availableRoutes } from '../core/draft.mjs';
import { defaultPlayRules, localConfig } from '../core/play-session.mjs';
import { settings, saveSettings, settingsDefaults } from '../core/storage.mjs';
import { toXGID } from '../core/xgid.mjs';
import { DEFAULT_SHORTCUTS, shortcutAction } from '../core/shortcuts.mjs';

test('advanced selected-die clicks are complete-turn legal across both players, every roll and draft prefix', () => {
  let checked = 0;
  for (const turn of [0, 1]) for (let a = 1; a <= 6; a++) for (let b = a; b <= 6; b++) {
    const source = initialState({ phase:'move', dice:[a,b], turn });
    const paths = legalPaths(source);
    for (const path of paths.slice(0, 8)) for (let i=0; i<=path.steps.length; i++) {
      const draft = path.steps.slice(0,i), candidates = nextSteps(paths,draft);
      const returns = originalReturnRoutes(source, paths, draft, 0);
      for (const preferred of [a,b]) for (const point of [...Array(24).keys(), 'bar','off']) for (const checker of [false,true]) {
        const action = advancedAction({ point, checker, candidates, returns, routes:availableRoutes(paths,draft), preferred, dice:source.dice, turn });
        if (!action) continue;
        const next = action.type === 'move' ? [...draft,action.step] : action.type === 'routes' ? [...draft,...action.routes[0].steps] : action.route.remaining;
        if (action.type === 'routes') for (const route of action.routes) assert.ok(matchingPaths(paths,[...draft,...route.steps]).length);
        assert.ok(matchingPaths(paths,next).length);
        if (action.type === 'move' && checker) {
          const selected=selectedDie(candidates,preferred,source.dice);
          if(candidates.some(s=>s.from===point&&s.die===selected))assert.equal(action.step.die,selected);
          else assert.ok(candidates.some(s=>s.from===point&&s.die===action.step.die));
        }
        else if (action.type === "undo" && checker) assert.ok(!candidates.some(s=>s.from===point));
        checked++;
      }
    }
  }
  assert.ok(checked>1000);
});
test('a checker uses the other die when the selected die cannot move it, before considering undo', () => {
  const candidates = [{from:7,to:3,die:4},{from:5,to:4,die:1}];
  const returns = [{from:5,to:9,remaining:[]}];
  assert.deepEqual(advancedAction({point:5,checker:true,candidates,returns,preferred:4,dice:[4,1],turn:0}),{type:'move',step:candidates[1]});
  assert.equal(selectedDie(candidates.slice(1),4,[4,1]),1);
  assert.equal(advancedAction({point:5,checker:true,candidates:[],returns,preferred:4,dice:[4,1],turn:0}).type,'undo');
});
test('new tables default to adaptive bot and reviews, visible feedback, warnings and advanced input; explicit preferences survive', () => {
  assert.equal(localConfig().strength,'auto'); assert.equal(localConfig().reviewStrength,'auto');
  assert.equal(localConfig().warning,true); assert.equal(localConfig().tutor,true);
  for (const strength of ['auto','quick','standard','deep','expert','research'])
    assert.equal(localConfig({strength,reviewStrength:strength}).strength,strength);
  const previous = globalThis.localStorage; const data = new Map();
  globalThis.localStorage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};
  try {
    assert.equal(settings().interactionMode,'advanced'); assert.equal(settings().equityBar,true); assert.equal(settings().moveFeedback,true);
    saveSettings({interactionMode:'beginner',equityBar:false,moveFeedback:false});
    assert.equal(settings().interactionMode,'beginner'); assert.equal(settings().equityBar,false); assert.equal(settings().moveFeedback,false);
  } finally { globalThis.localStorage=previous; }
  assert.equal(shortcutAction(DEFAULT_SHORTCUTS,'c','move'),'confirm');
  assert.equal(shortcutAction(DEFAULT_SHORTCUTS,'c','roll'),'roll');
  assert.equal(shortcutAction(DEFAULT_SHORTCUTS,'d','double'),'redouble');
});
test('unlimited opening doubles exceed old ten-tie limit, finite limits and match rules stay explicit', () => {
  const rules=defaultPlayRules(0); assert.equal(rules.automaticDoubles,-1); assert.equal(rules.immediateRedoubles,2);
  let s=initialState({matchLength:0,rules});
  for(let i=0;i<14;i++) { s=transition(s,{type:'opening',dice:[2,2]}); assert.equal(s.cube.value,2**(i+1)); }
  s=transition(s,{type:'opening',dice:[6,1]}); assertState(s);
  assert.equal(s.cube.owner,null); assert.equal(s.cube.value,16384);
  assert.match(toXGID(s,{engine:true}),/:1:0:1:61:0:0:/);
  assert.throws(()=>toXGID(s),/position link/);
  for(const limit of [0,1,2,10]) {
    let finite=initialState({matchLength:0,rules:{...rules,automaticDoubles:limit}});
    for(let i=0;i<12;i++) finite=transition(finite,{type:'opening',dice:[3,3]});
    assert.equal(finite.cube.value,2**limit);
  }
  const match=defaultPlayRules(5); assert.equal(match.automaticDoubles,0); assert.equal(match.immediateRedoubles,0);
  assert.throws(()=>transition(initialState({matchLength:0,rules,cube:{value:MAX_CUBE,owner:null}}),{type:'opening',dice:[1,1]}),/numeric cube limit/);
});

test('destination hierarchy: direct selected die, direct other die, then combined; a disc never spends both dice',()=>{
  const s=initialState({phase:'move',dice:[4,3]});
  const paths=legalPaths(s),candidates=nextSteps(paths,[]),routes=availableRoutes(paths,[]);
  const choose=(point,checker=false)=>advancedAction({point,checker,candidates,routes,returns:[],preferred:4,dice:s.dice,turn:0});
  // 13/6 is available, but 8/6 is not: this arrival genuinely needs both dice.
  const combined=choose(5); // 13/9/6, no direct arrival from the opening board.
  assert.equal(combined.type,'routes');assert.ok(combined.routes.every(r=>r.steps.length===2 && r.from===12));
  assert.equal(choose(4).type,'move');assert.equal(choose(4).step.die,3,'direct 8/5 takes precedence over a multi-die route');
  assert.equal(choose(7,true).type,'move');assert.equal(choose(7,true).step.die,4);
});

test('a combined destination shortcut cannot silently rewrite already-spent dice',()=>{
  const route={from:5,to:10,steps:[{from:12,to:9,die:3},{from:9,to:5,die:4}],remaining:[],switchDie:true};
  assert.equal(advancedAction({point:10,checker:false,candidates:[],returns:[],routes:[route],preferred:4,dice:[4,3],turn:0}),null);
});
test('point-space at an original draft location returns that checker while disc input keeps its normal meaning',()=>{
  const s=initialState({phase:'move',dice:[4,2]}),paths=legalPaths(s),draft=[{from:12,to:8,die:4}];
  const candidates=nextSteps(paths,draft),returns=originalReturnRoutes(s,paths,draft);
  const options={point:12,checker:false,candidates,returns,preferred:2,dice:s.dice,turn:0};
  assert.deepEqual(advancedAction(options).route.remaining,[]);
  assert.equal(advancedAction({...options,checker:true}).type,'move');
  assert.equal(advancedAction({...options,returns:originalReturnRoutes(s,paths,draft,1)}),null,'forced origin cannot undo');
});
