import test from 'node:test';
import assert from 'node:assert/strict';
import {createEvaluator} from '../engine/evaluate.mjs';
import {initialState, legalTurns} from '../core/rules.mjs';
import {toXGID} from '../core/xgid.mjs';
import {PRESETS} from '../engine/metadata.mjs';
import {ADAPTIVE_SEARCH} from '../engine/adaptive.mjs';
import {bookEligible} from '../engine/opening-book.mjs';
import {referenceEligible} from '../engine/xg-reference-book.mjs';

const state = () => initialState({phase:'move',dice:[3,1],matchLength:0});
function fixture({supported=true, confirmation=false}={}) {
  const s=state(), turns=legalTurns(s), calls=[];
  const ids=turns.map(t=>toXGID({...t.state,phase:'roll',dice:[]},{engine:true}).split(':')[0]);
  const module={
    ...(supported?{_bg_score_config(){}}:{}),
    cwrap(name) {
      if(name==='init'||name==='shutdown')return()=>0;
      return(original,after,depth,beavers,pruning)=>{
        calls.push({name,original,after,depth,beavers,pruning});
        if(name==='bg_cube')return JSON.stringify({action:'roll',equity:.1,cubeless:.1,
          probabilities:[.5,.1,0,.1,0],outcomes:[.1,.2,1],mwc:null});
        const i=ids.indexOf(after.split(':')[0]);assert.ok(i>=0);
        // Expert's leader is outside the base Research shortlist. Unpruned
        // final scores have a different leader so cache mixing is observable.
        const equity=name==='bg_score_config'?(i===1?.7:-i*.02):(depth>=3&&i===5?.2:-i*.01);
        return JSON.stringify({equity,cubeless:equity,mwc:null,probabilities:[.5,.1,0,.1,0],
          ...(name==='bg_score_config'?{pruning:confirmation}: {})});
      };
    },UTF8ToString:p=>p,_free(){},
  };
  return{engine:createEvaluator(module),calls,s,turns};
}

test('Verify preserves Research finalists and expert leader but independently scores every finalist unpruned',()=>{
  const {engine,calls,s}=fixture();
  const research=engine.analyze(s,'research'),verify=engine.analyze(s,'verify');
  assert.equal(verify.settings.plies,4);assert.equal(verify.settings.pruning,false);
  assert.deepEqual(new Set(verify.candidates.map(c=>c.key)),new Set(research.candidates.map(c=>c.key)));
  assert.notEqual(verify.candidates[0].key,research.candidates[0].key);
  assert.equal(verify.screening.retainedLeader.key,research.screening.retainedLeader.key);
  const configured=calls.filter(c=>c.name==='bg_score_config');
  assert.equal(configured.length,verify.candidates.length);
  assert.ok(configured.every(c=>c.depth===4&&c.pruning===0));
  const before=calls.length;
  assert.equal(engine.analyze(s,'research').candidates[0].key,research.candidates[0].key);
  assert.equal(engine.analyze(s,'verify').candidates[0].key,verify.candidates[0].key);
  assert.equal(calls.length,before,'bounded independent finalist caches reuse both policies');
});

test('an unlisted submitted move receives unpruned verification at the prepared depth',()=>{
  const {engine,calls,s,turns}=fixture();const prepared=engine.analyze(s,'verify');
  const actual=turns.find(t=>!prepared.candidates.some(c=>c.key===t.key));assert.ok(actual);
  const count=calls.length,result=engine.gradePrepared(s,prepared,actual.steps);
  assert.equal(calls.length,count+1);assert.equal(calls.at(-1).name,'bg_score_config');
  assert.equal(calls.at(-1).pruning,0);assert.equal(calls.at(-1).depth,4);
  assert.equal(result.settings.pruning,false);assert.equal(result.actual.key,actual.key);
  assert.ok(!prepared.candidates.some(c=>c.key===actual.key),'prepared root stays immutable');
});

test('Verify cube requests retain Research cube behavior and explicitly report normal pruning',()=>{
  const {engine,calls,s}=fixture({supported:false});const cube={...s,dice:[],phase:'roll'};
  const research=engine.analyze(cube,'research','cube'),verify=engine.analyze(cube,'verify','cube');
  assert.equal(verify.equity,research.equity);assert.equal(verify.settings.pruning,true);
  assert.match(verify.settings.verification,/checker-only/);
  assert.deepEqual(calls.filter(c=>c.name==='bg_cube').map(c=>[c.after,c.depth]),[[4,0],[4,0]]);
  assert.ok(calls.every(c=>c.name!=='bg_score_config'));
});

test('unsupported or unconfirmed checker verification fails instead of silently returning pruned values',()=>{
  const old=fixture({supported:false});assert.equal(old.engine.capabilities.unprunedChecker,false);
  assert.throws(()=>old.engine.analyze(old.s,'verify'),/does not support unpruned/);
  assert.equal(old.calls.length,0);
  const wrong=fixture({confirmation:true});assert.equal(wrong.engine.capabilities.unprunedChecker,true);
  assert.throws(()=>wrong.engine.analyze(wrong.s,'verify'),/did not confirm unpruned/);
});

test('Verify stays manual and bypasses books while Research and Auto settings remain unchanged',()=>{
  assert.ok(!ADAPTIVE_SEARCH.presets.includes('verify'));
  assert.equal(PRESETS.research.pruning,true);
  assert.equal(PRESETS.verify.pruning,false);
  const ordinary={...state(),rules:{cube:true,jacoby:true,automaticDoubles:0,immediateRedoubles:0}};
  const reference={...ordinary,rules:{...ordinary.rules,immediateRedoubles:2}};
  assert.equal(bookEligible(ordinary,{preset:'auto',kind:'checker',useBook:true}),true);
  assert.equal(referenceEligible(reference,{preset:'auto',kind:'checker',useBook:true}),true);
  assert.equal(bookEligible(ordinary,{preset:'verify',kind:'checker',useBook:true}),false);
  assert.equal(referenceEligible(reference,{preset:'verify',kind:'checker',useBook:true}),false);
});
