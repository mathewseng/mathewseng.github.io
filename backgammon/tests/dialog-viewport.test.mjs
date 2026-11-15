import test from 'node:test';
import assert from 'node:assert/strict';
import {fitDialogViewport} from '../ui/dialog-viewport.mjs';

test('dialog bounds follow browser chrome, keyboard and panning; close releases every listener', () => {
  const previous = {window:globalThis.window,innerHeight:globalThis.innerHeight};
  const viewport = Object.assign(new EventTarget(),{width:390,height:760,offsetTop:0,offsetLeft:0,scale:1});
  const window = Object.assign(new EventTarget(),{visualViewport:viewport});
  globalThis.window = window; globalThis.innerHeight = 844;
  const styles = new Map(), attributes = new Map();
  const dialog = Object.assign(new EventTarget(),{
    style:{setProperty:(key,value)=>styles.set(key,value)},toggleAttribute:(key,value)=>attributes.set(key,value),
  });
  try {
    const stop = fitDialogViewport(dialog);
    assert.equal(styles.get('--dialog-visible-height'),'760px');
    assert.equal(attributes.get('data-keyboard'),false,'expanded browser chrome still gets visible bounds');
    Object.assign(viewport,{height:350,offsetTop:120});
    viewport.dispatchEvent(new Event('resize'));
    assert.equal(styles.get('--dialog-visible-top'),'120px');
    assert.equal(styles.get('--dialog-visible-height'),'350px');
    assert.equal(attributes.get('data-keyboard'),true);
    viewport.scale=2;viewport.height=180;viewport.dispatchEvent(new Event('resize'));
    assert.equal(styles.get('--dialog-visible-height'),'350px','pinch zoom does not relayout the modal');
    Object.assign(viewport,{scale:1,height:760,offsetTop:0,offsetLeft:20,width:350});
    viewport.dispatchEvent(new Event('scroll'));
    assert.equal(styles.get('--dialog-visible-left'),'20px');
    assert.equal(styles.get('--dialog-visible-width'),'350px');
    assert.equal(attributes.get('data-keyboard'),false);
    dialog.dispatchEvent(new Event('close'));
    const closed = [...styles];
    Object.assign(viewport,{height:200,offsetTop:200});
    viewport.dispatchEvent(new Event('resize'));viewport.dispatchEvent(new Event('scroll'));window.dispatchEvent(new Event('resize'));
    assert.deepEqual([...styles],closed,'closed modals are not retained by viewport listeners');
    stop(); // Update gate can clean up explicitly before removing the dialog.
  } finally {
    for(const [key,value] of Object.entries(previous)) {
      if(value===undefined) delete globalThis[key]; else globalThis[key]=value;
    }
  }
});

test('portrait decision warnings stay below the board and fall back when the viewport cannot fit both', () => {
  const keys = ['window', 'document', 'innerHeight', 'requestAnimationFrame', 'cancelAnimationFrame'];
  const previous = Object.fromEntries(keys.map(k => [k, globalThis[k]]));
  const viewport = Object.assign(new EventTarget(), {width:430,height:932,offsetTop:0,offsetLeft:0,scale:1});
  const styles = new Map(), attributes = new Map();
  let nextFrame, cancelled = false;
  globalThis.window = Object.assign(new EventTarget(), {visualViewport:viewport});
  globalThis.innerHeight = 932;
  globalThis.document = {querySelector:() => ({getBoundingClientRect:() => ({bottom:512})})};
  globalThis.requestAnimationFrame = fn => { nextFrame = fn; return 1; };
  globalThis.cancelAnimationFrame = () => { cancelled = true; };
  const dialog = Object.assign(new EventTarget(), {
    open:false, classList:{contains:() => true},
    style:{setProperty:(k,v) => styles.set(k,v)},
    toggleAttribute:(k,v) => attributes.set(k,v),
    getBoundingClientRect:() => ({height:259}),
  });
  try {
    fitDialogViewport(dialog);
    dialog.open = true;
    nextFrame();
    assert.equal(attributes.get('data-thumb-positioned'), true);
    assert.equal(styles.get('--decision-top'), '524px');
    viewport.height = 740;
    viewport.dispatchEvent(new Event('resize'));
    assert.equal(attributes.get('data-thumb-positioned'), false, 'the keyboard or a short viewport uses the safe layout');
    Object.assign(viewport, {width:932,height:430});
    viewport.dispatchEvent(new Event('resize'));
    assert.equal(attributes.get('data-thumb-positioned'), false, 'landscape keeps the regular dialog');
    dialog.dispatchEvent(new Event('close'));
    assert.equal(cancelled, true);
  } finally {
    for (const k of keys) previous[k] === undefined ? delete globalThis[k] : globalThis[k] = previous[k];
  }
});
