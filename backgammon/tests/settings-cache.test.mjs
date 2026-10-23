import test from 'node:test';
import assert from 'node:assert/strict';
import {settings,saveSettings,PREFIX} from '../core/storage.mjs';

test('cached settings stay independent and notice external writes, removal and malformed storage',()=>{
  const previous=globalThis.localStorage;
  const values=new Map();
  globalThis.localStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
  try {
    assert.equal(settings().cubeOneAsOne, false, 'existing cube convention is the default');
    saveSettings({cubeOneAsOne:true});
    assert.equal(settings().cubeOneAsOne, true);
    saveSettings({motion:'system',shortcuts:settings().shortcuts});
    assert.equal(settings().cubeOneAsOne, true, 'other preference changes preserve cube display');
    const a=settings(), b=settings();
    a.moveHints=false; a.shortcuts.undo[0]='!'; a.boardTheme.colors.frame='#ABCDEF'; a.sound.enabled=false;
    assert.notDeepEqual(a,b);
    assert.deepEqual(settings(),b,'callers cannot modify the cached copy');
    values.set(PREFIX+'settings',JSON.stringify({...b,motion:'reduce'}));
    assert.equal(settings().motion,'reduce','other-tab writes invalidate by value');
    values.delete(PREFIX+'settings');
    assert.equal(settings().motion,'system');
    assert.equal(settings().cubeOneAsOne,false);
    values.set(PREFIX+'settings',JSON.stringify({cubeOneAsOne:'true'}));
    assert.equal(settings().cubeOneAsOne,false,'only a boolean enables cube display');
    values.set(PREFIX+'settings','broken');
    assert.equal(settings().motion,'system');
    saveSettings({motion:'reduce'});
    assert.equal(settings().motion,'reduce');
  } finally {globalThis.localStorage=previous;}
});
