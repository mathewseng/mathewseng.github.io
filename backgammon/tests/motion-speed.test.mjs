import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMotionScale } from '../core/motion.mjs';
import { motionDuration, motionTiming, checkerFlight, checkerDrop } from '../ui/motion.mjs';
import { settings, saveSettings, PREFIX } from '../core/storage.mjs';

test('animation preferences migrate and remain bounded and independent of game storage', () => {
  const prior=globalThis.localStorage, data=new Map([[PREFIX+'work','saved game']]);
  globalThis.localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
  try {
    assert.equal(settings().motionScale,1);
    data.set(PREFIX+'settings',JSON.stringify({motion:'reduce'}));
    assert.equal(settings().motionScale,0);
    saveSettings({motion:'system',motionScale:2.5});
    assert.equal(settings().motionScale,2.5);
    saveSettings({numbers:false});
    assert.equal(settings().motionScale,2.5);
    saveSettings({motion:'reduce'});
    assert.equal(settings().motionScale,0);
    saveSettings({motion:'system'});
    assert.equal(settings().motionScale,1);
    for(const value of [null,'2',false,NaN,Infinity]) assert.equal(normalizeMotionScale(value),1);
    assert.equal(normalizeMotionScale(-2),0);
    assert.equal(normalizeMotionScale(20),3);
    assert.equal(normalizeMotionScale(3,'reduce'),0,'legacy reduced motion remains instant');
    assert.equal(data.get(PREFIX+'work'),'saved game');
  } finally {globalThis.localStorage=prior;}
});

test('all presentation clocks scale together without changing routes or allocating extra slow-motion frames', () => {
  const previous={document:globalThis.document,matchMedia:globalThis.matchMedia};
  const dataset={motion:'system',motionScale:'1'};
  globalThis.document={documentElement:{dataset}};
  globalThis.matchMedia=()=>({matches:false});
  try {
    const route=[{x:10,y:20},{x:100,y:50},{x:150,y:250}];
    const base=checkerFlight(route), drop=checkerDrop(route[0],route[2]);
    for(const scale of [0,.25,.5,1,2,3]) {
      dataset.motionScale=String(scale);
      const flight=checkerFlight(route), landing=checkerDrop(route[0],route[2]);
      assert.deepEqual(flight.frames,base.frames);
      assert.equal(flight.duration,base.duration*scale);
      assert.deepEqual(flight.landings,base.landings.map(n=>n*scale));
      assert.equal(landing.duration,drop.duration*scale);
      assert.deepEqual(motionTiming({duration:760,delay:520,fill:'both'}),{duration:760*scale,delay:520*scale,fill:'both'});
    }
    dataset.motionScale='3';
    globalThis.matchMedia=()=>({matches:true});
    assert.equal(motionDuration(560),0,'system reduced motion still wins');
  } finally {Object.assign(globalThis,previous);}
});
