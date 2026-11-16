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
