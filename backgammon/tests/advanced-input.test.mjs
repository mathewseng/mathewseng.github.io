import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, legalPaths, nextSteps, matchingPaths, transition, assertState, MAX_CUBE } from '../core/rules.mjs';
import { advancedAction, selectedDie } from '../core/advanced-input.mjs';
import { originalReturnRoutes, checkerUndoRoutes, availableRoutes } from '../core/draft.mjs';
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
      const checkerReturns = checkerUndoRoutes(source, paths, draft, 0);
      for (const preferred of [a,b]) for (const point of [...Array(24).keys(), 'bar','off']) for (const checker of [false,true]) {
        const action = advancedAction({ point, checker, candidates, returns, checkerReturns, routes:availableRoutes(paths,draft), preferred, dice:source.dice, turn });
        if (!action) continue;
        const next = action.type === 'move' ? [...draft,action.step] : action.type === 'routes' ? [...draft,...action.routes[0].steps] : action.route.remaining;
        if (action.type === 'routes') for (const route of action.routes) assert.ok(matchingPaths(paths,[...draft,...route.steps]).length);
        assert.ok(matchingPaths(paths,next).length);
        if (action.type === 'move' && checker) {
          const selected=selectedDie(candidates,preferred,source.dice);
          if(candidates.some(s=>s.from===point&&s.die===selected))assert.equal(action.step.die,selected);
          else assert.ok(candidates.some(s=>s.from===point&&s.die===action.step.die));
        }
        else if (action.type === "undo" && checker) {
          assert.ok(!candidates.some(s=>s.from===point));
          assert.equal(next.length,draft.length-action.route.steps.length,'checker undo restores its complete journey');
          assert.equal(action.route.to,action.route.steps[0].from);
          assert.equal(action.route.from,action.route.steps.at(-1).to);
        }
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
  assert.equal(advancedAction({point:5,checker:true,candidates:[],returns,checkerReturns:returns,preferred:4,dice:[4,1],turn:0}).type,'undo');
});
test('a new roll starts with the higher playable die while explicit choices and recorded order survive', () => {
  const dice = [1,6], candidates = [{from:12,to:11,die:1},{from:12,to:6,die:6}];
  assert.equal(selectedDie(candidates,null,dice),6);
  assert.equal(selectedDie(candidates,1,dice),1);
  assert.equal(selectedDie(candidates.slice(0,1),null,dice),1);
  assert.deepEqual(dice,[1,6]);
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

test('bear-off destination uses the selected legal die for both players and every roll',()=>{
  for (const turn of [0,1]) for (let a=1;a<=6;a++) for (let b=a;b<=6;b++) {
    const points=Array(24).fill(0);points.fill(2,0,6);points[18]=-15;
    const s=initialState({phase:'move',dice:[a,b],turn,
      points:turn?points.toReversed().map(n=>-n):points,off:turn?[0,3]:[3,0]});
    const paths=legalPaths(s),candidates=nextSteps(paths,[]);
    for (const preferred of [a,b]) {
      const action=advancedAction({point:'off',checker:false,candidates,returns:[],
        routes:availableRoutes(paths,[]),preferred,dice:s.dice,turn});
      assert.deepEqual(action,{type:'move',step:{from:turn?24-preferred:preferred-1,to:'off',die:preferred}});
      assert.ok(matchingPaths(paths,[action.step]).length);
    }
  }
  const points=Array(24).fill(0);points[0]=5;points[1]=5;points[2]=5;points[18]=-15;
  const s=initialState({phase:'move',dice:[6,1],points}),paths=legalPaths(s);
  assert.deepEqual(advancedAction({point:'off',checker:false,candidates:nextSteps(paths,[]),
    returns:[],preferred:6,dice:s.dice,turn:0}),
    {type:'move',step:{from:2,to:'off',die:6}},'oversized die removes the highest checker, not the nearest');
});
test('point-space at an original draft location returns that checker while disc input keeps its normal meaning',()=>{
  const s=initialState({phase:'move',dice:[4,2]}),paths=legalPaths(s),draft=[{from:12,to:8,die:4}];
  const candidates=nextSteps(paths,draft),returns=originalReturnRoutes(s,paths,draft);
  const options={point:12,checker:false,candidates,returns,preferred:2,dice:s.dice,turn:0};
  assert.deepEqual(advancedAction(options).route.remaining,[]);
  assert.equal(advancedAction({...options,checker:true}).type,'move');
  assert.deepEqual(advancedAction({...options,returns:originalReturnRoutes(s,paths,draft,1)}),
    {type:'move',step:{from:12,to:10,die:2}},'forced origin cannot undo, but its resident can still play forward');
});

test('clicking point 5 after two 5/4 moves plays 6/5 instead of undoing 5/4',()=>{
  for (const turn of [0,1]) {
    const p = point => turn ? 23-point : point;
    const points = Array(24).fill(0);
    for (const [point,count] of [[5,2],[6,5],[8,3],[10,1],[13,3],[18,1],[3,-3],[19,-3],[20,-1],[21,-2],[22,-2],[23,-2],[24,-2]])
      points[p(point-1)] = count * (turn ? -1 : 1);
    const s = initialState({phase:'move', dice:[1,1], turn, points});
    const paths = legalPaths(s), draft = Array.from({length:2},()=>({from:p(4),to:p(3),die:1}));
    const options = {point:p(4),checker:false,candidates:nextSteps(paths,draft),
      returns:originalReturnRoutes(s,paths,draft),routes:availableRoutes(paths,draft),preferred:1,dice:s.dice,turn};
    assert.ok(options.returns.some(route=>route.to===p(4)), 'the clicked point is also an undo destination');
    const action = advancedAction(options);
    assert.deepEqual(action,{type:'move',step:{from:p(5),to:p(4),die:1}});
    assert.ok(matchingPaths(paths,[...draft,action.step]).length);
    assert.equal(advancedAction({...options,candidates:[]}).type,'undo','original-point undo remains available without a direct arrival');
  }
});

test('otherwise inactive point space plays its resident with the same die as a checker tap',()=>{
  for(const turn of [0,1]) for(const dice of [[4,1],[3,3]]) {
    const s=initialState({phase:'move',dice,turn}),paths=legalPaths(s);
    const point=turn ? 11 : 12;
    const options={point,checker:false,candidates:nextSteps(paths,[]),returns:[],routes:availableRoutes(paths,[]),preferred:dice[0],dice,turn};
    const action=advancedAction(options);
    assert.equal(action.type,'move');assert.equal(action.step.from,point);assert.equal(action.step.die,dice[0]);
    assert.deepEqual(action,advancedAction({...options,checker:true}));
    assert.ok(matchingPaths(paths,[action.step]).length);
  }
  const points=Array(24).fill(0);points[12]=2;points[5]=13;points[8]=-2;points[23]=-13;
  const s=initialState({phase:'move',dice:[4,1],points}),paths=legalPaths(s);
  const options={point:12,checker:false,candidates:nextSteps(paths,[]),returns:[],routes:availableRoutes(paths,[]),preferred:4,dice:s.dice,turn:0};
  assert.equal(selectedDie(options.candidates,4,s.dice),4,'four is usable elsewhere');
  assert.deepEqual(advancedAction(options),{type:'move',step:{from:12,to:11,die:1}},'fallback uses other die when necessary');
});

test('point fallback preserves destination priority and cannot bypass bar priority or spend unavailable dice',()=>{
  const points=Array(24).fill(0);points[12]=2;points[5]=13;points[23]=-15;
  const s=initialState({phase:'move',dice:[4,3],points}),paths=legalPaths(s);
  const options={point:5,checker:false,candidates:nextSteps(paths,[]),returns:[],routes:availableRoutes(paths,[]),preferred:4,dice:s.dice,turn:0};
  assert.equal(advancedAction(options).type,'routes','combined arrival wins over moving the resident');
  assert.equal(advancedAction({...options,checker:true}).step.from,5,'disc still plays the resident');
  points[12]=14;points[5]=0;points[23]=-2;points[19]=-13;
  const blocked=initialState({phase:'move',dice:[4,1],points,bar:[1,0]}),barPaths=legalPaths(blocked);
  const barOptions={...options,point:12,dice:blocked.dice,candidates:nextSteps(barPaths,[]),routes:availableRoutes(barPaths,[])};
  assert.equal(advancedAction(barOptions),null,'bar must enter before a resident can move');
  assert.deepEqual(advancedAction({...barOptions,point:'bar'}),{type:'move',step:{from:'bar',to:20,die:4}});
  for(const point of [12,23,7,'bar','off'])
    assert.equal(advancedAction({...options,point,candidates:[],routes:[]}),null,'no remaining move stays a quiet no-op');
});

test('spent 6–5 checker can return to either 9 or 10 without a selection, in both directions', async()=>{
  const {dieSwitchRoutes} = await import('../core/draft.mjs');
  for(const turn of [0,1]) for(const first of [6,5]) {
    const p=n=>turn?24-n:n-1, points=Array(24).fill(0);
    for(const [n,count] of [[4,2],[5,3],[6,3],[7,2],[8,2],[11,1],[13,1],[15,1],[2,-1],[3,-4],[19,-1],[20,-2],[21,-2],[23,-3],[24,-2]]) points[p(n)]=count*(turn?-1:1);
    const s=initialState({phase:'move',dice:[6,5],turn,points}),paths=legalPaths(s);
    const draft=[{from:p(15),to:p(15-first),die:first},{from:p(15-first),to:p(4),die:11-first}];
    assert.ok(matchingPaths(paths,draft).length);
    for(const target of [9,10]) {
      const options={point:p(target),checker:false,candidates:nextSteps(paths,draft),returns:originalReturnRoutes(s,paths,draft),
        revisions:dieSwitchRoutes(s,paths,draft),preferred:6,dice:s.dice,turn};
      const action=advancedAction(options);
      assert.equal(action.type,'routes');
      for(const route of action.routes) {
        assert.deepEqual(route.remaining,[{from:p(15),to:p(target),die:15-target}]);
        assert.ok(matchingPaths(paths,route.remaining).length);
      }
      const locked=advancedAction({...options,revisions:dieSwitchRoutes(s,paths,draft,2)});
      assert.equal(locked,null,'forced moves cannot be revised');
      const partlyLocked=advancedAction({...options,revisions:dieSwitchRoutes(s,paths,draft,1)});
      if(target===15-first) assert.deepEqual(partlyLocked.routes[0].remaining,[draft[0]]);
      else assert.equal(partlyLocked,null,'cannot replace a forced first die');
    }
  }
});

test('return targets preserve moves made by a different checker',async()=>{
  const {dieSwitchRoutes}=await import('../core/draft.mjs');
  const s=initialState({phase:'move',dice:[4,1]}), paths=legalPaths(s);
  const draft=[{from:12,to:8,die:4},{from:5,to:4,die:1}];
  const options={point:11,checker:false,candidates:[],returns:originalReturnRoutes(s,paths,draft),revisions:dieSwitchRoutes(s,paths,draft),preferred:1,dice:s.dice,turn:0};
  assert.equal(advancedAction(options),null,'cannot steal the one used by a different checker');
  assert.deepEqual(advancedAction({...options,point:12}).route.remaining,[draft[1]],'original return leaves the other checker alone');
  const incoming={from:15,to:12,die:3};
  assert.deepEqual(advancedAction({...options,point:12,candidates:[incoming],dice:[3,1]}),{type:'move',step:incoming},'direct arrival wins over a return');
});
