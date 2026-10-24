import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMotionScale, DEFAULT_MOTION_SCALE, MOTION_SPEED_OPTIONS } from '../core/motion.mjs';
import { motionDuration, motionTiming, checkerFlight, checkerDrop } from '../ui/motion.mjs';
import { settings, saveSettings, PREFIX } from '../core/storage.mjs';

test('animation preferences migrate and remain bounded and independent of game storage', () => {
  const prior=globalThis.localStorage, data=new Map([[PREFIX+'work','saved game']]);
  globalThis.localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
  try {
    assert.equal(settings().motionScale,DEFAULT_MOTION_SCALE);
    data.set(PREFIX+'settings',JSON.stringify({motion:'reduce'}));
    assert.equal(settings().motionScale,0);
    saveSettings({motion:'system',motionScale:1/1.75});
    assert.equal(settings().motionScale,1/1.75);
    saveSettings({numbers:false});
    assert.equal(settings().motionScale,1/1.75);
    saveSettings({motion:'reduce'});
    assert.equal(settings().motionScale,0);
    saveSettings({motion:'system'});
    assert.equal(settings().motionScale,DEFAULT_MOTION_SCALE);
    for(const value of [null,'2',false,NaN,Infinity]) assert.equal(normalizeMotionScale(value),DEFAULT_MOTION_SCALE);
    assert.equal(normalizeMotionScale(-2),0);
    assert.equal(normalizeMotionScale(20),4);
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
    for(const scale of MOTION_SPEED_OPTIONS.map(option=>option.scale)) {
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

test('speed stops are the requested playback rates, defaulting to 2x',()=>{
  assert.deepEqual(MOTION_SPEED_OPTIONS.map(o=>o.label),['Instant','4×','3×','2.5×','2×','1.75×','1.5×','1.25×','1×','0.75×','0.5×','0.25×']);
  assert.equal(DEFAULT_MOTION_SCALE,.5);
  for(const {scale} of MOTION_SPEED_OPTIONS) assert.equal(normalizeMotionScale(scale),scale);
  assert.equal(normalizeMotionScale(.01),.25,'legacy positive speed never turns off animation');
  assert.equal(normalizeMotionScale(2.4),2,'old slider values migrate to nearest duration');
});
