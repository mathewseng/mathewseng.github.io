const assert=require('node:assert/strict');
const path=require('node:path');
const {waitForAsync}=require('./play-helpers.cjs');
module.exports=async(browser,base,out,name)=>{
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:name!=='firefox',reducedMotion:'reduce',serviceWorkers:'block'});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  const {longMatch}=await import('./helpers/long-match.mjs');
  const game=longMatch();game.config={mode:'local',tutor:false,warning:false};
  await page.addInitScript(()=>{
   window.itemReads=[];
   const get=IDBObjectStore.prototype.get,getAll=IDBObjectStore.prototype.getAll;
   IDBObjectStore.prototype.get=function(key){if(this.name==='items')itemReads.push(key);return get.call(this,key);};
   IDBObjectStore.prototype.getAll=function(...args){if(this.name==='items')itemReads.push('ALL');return getAll.apply(this,args);};
  });
  await context.route('**/history-storage-fixture',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Storage migration</title>'}));
  await page.goto(base+'/history-storage-fixture');
  const upgrade=await page.evaluate(async()=>{
    const r=await import('/backgammon/core/rules.mjs');
    const s=await import('/backgammon/core/storage.mjs');
    const old=await new Promise((resolve,reject)=>{
      const request=indexedDB.open('backgammon-local',1);
      request.onupgradeneeded=()=>{for(const name of ['items','work','progress','cache'])request.result.createObjectStore(name,{keyPath:'id'});};
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });
    await new Promise((resolve,reject)=>{
      const tx=old.transaction('items','readwrite');
      tx.objectStore('items').put(s.itemRecord('position',{id:'v1-position',state:r.initialState(),notes:'Preserved through upgrade'}));
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
    });
    old.onversionchange=()=>setTimeout(()=>old.close(),100);
    const db=await s.database(),headers=await s.listItemSummaries();
    return {version:db.version,notes:headers.items[0].notes};
  });
  assert.deepEqual(upgrade,{version:2,notes:'Preserved through upgrade'});
  await page.goto(base+'/backgammon/');
  const migrated=await page.evaluate(async game=>{
   const s=await import('/backgammon/core/storage.mjs');
   const work={id:'play',game,draft:[],feedback:null};
   await s.put('work',work);
   const archive=structuredClone(game);
   const reviewed=archive.events.findLast(e=>e.action.type==='move');
   reviewed.evaluation={result:{status:'complete',engine:'Saved review',type:'checker',settings:{plies:2,name:'Deep'},
     candidates:[{steps:reviewed.action.steps,notation:'Reviewed move',equity:0,cubeless:0,probabilities:[0.5,0,0,0,0]}]}};
   await s.put('items',s.itemRecord('match',{id:game.id,title:'My original game',notes:'Keep these notes',initial:archive.initial,events:archive.events}));
   const original=IDBObjectStore.prototype.put;
   IDBObjectStore.prototype.put=function(value,...args){
    if(this.name==='summaries'&&value.gameNumber===4)throw Error('simulated quota failure');
    return original.call(this,value,...args);
   };
   let failed=false;
   try{await s.migratePlayHistory(work);}catch(e){failed=true;}
   IDBObjectStore.prototype.put=original;
   const intact=(await s.get('work','play')).game.events.length===game.events.length&&
    (await s.get('items',game.id)).events.length===game.events.length;
   const recovery={...work};delete recovery.id; // pagehide recovery has no store key
   const next=await s.migratePlayHistory(recovery),again=await s.migratePlayHistory(next);
   if(next.id!=='play')throw Error('Recovery did not retain its work key');
   const headers=await s.listItemSummaries({sessionId:game.id,limit:24});
   const notes=(await s.get('items',game.id)).notes;
   const reviewedGame=await s.get('items',headers.items.find(i=>i.gameNumber===11).id);
   if(!reviewedGame.events.some(e=>e.evaluation?.result.engine==='Saved review'))throw Error('Lost a newer archived review during migration');
   const backup=s.parseBackup(await s.backup(true));
   return {failed,intact,count:headers.items.length,events:next.game.events.length,gameNumber:next.game.state.gameNumber,
    sameId:next.game.id===game.id,idempotent:again===next,notes,backupCount:backup.items.length};
  },game);
  assert.deepEqual(migrated,{failed:true,intact:true,count:12,events:1,gameNumber:12,sameId:true,idempotent:true,notes:'Keep these notes',backupCount:12});
  await page.goto(base+'/backgammon/play/#resume='+game.id);
  await page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
  await page.evaluate(()=>itemReads.length=0);
  await page.locator('#saved-games').tap();
  await page.waitForFunction(()=>document.querySelectorAll('.saved-game').length===8);
  assert.deepEqual(await page.evaluate(()=>itemReads),[],'listing game headers does not load old game bodies');
  await page.screenshot({path:path.join(out,`${name}-saved-games-phone.png`)});
  await page.locator('#older-games').tap();
  await page.waitForFunction(()=>document.querySelectorAll('.saved-game').length===4);
  await page.locator('.saved-game').last().getByRole('button',{name:'History tree',exact:true}).tap();
  await page.locator('.history-dialog').waitFor();
  await page.screenshot({path:path.join(out,`${name}-archived-history-phone.png`)});
  assert.equal((await page.evaluate(()=>itemReads)).length,1,'only the requested game is loaded');
  await page.locator('.history-dialog [role=treeitem]').first().focus();
  await page.keyboard.press('Home');
  await page.locator('#history-return').tap();
  await waitForAsync(page,async()=>{
   const {get}=await import('/backgammon/core/storage.mjs');
   const work=await get('work','play');
   return work.game.state.gameNumber===1&&work.game.undoLog.length>0;
  });
  assert.equal(await page.evaluate(async()=>{
   const {listItemSummaries}=await import('/backgammon/core/storage.mjs');
   return (await listItemSummaries({limit:24,kind:'match'})).items.length;
  }),12,'restoring an old game does not delete the later games');
  await page.evaluate(async id=>{
    const {get,put}=await import('/backgammon/core/storage.mjs');
    const original=await get('items',id);
    for(let i=0;i<25;i++)await put('items',{...original,id:`older-copy-${i}`,sessionId:'another-session',
      title:`Saved game ${i+1}`,updatedAt:Date.now()+i});
  },game.id);
  await page.goto(base+'/backgammon/library/#games');
  await page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
  assert.deepEqual(await page.evaluate(()=>itemReads),[],'Library uses headers, not whole histories');
  assert.equal(await page.locator('.library-item').count(),12);
  const firstPage=await page.locator('.library-item').allTextContents();
  await page.getByRole('button',{name:'Older items',exact:true}).tap();
  await page.waitForFunction(first=>document.querySelector('.library-item').textContent!==first,firstPage[0]);
  assert.equal(await page.locator('.library-item').count(),12);
  assert.deepEqual(await page.evaluate(()=>itemReads),[],'paging still reads no game bodies');
  await page.evaluate(async()=>{
    const {Board}=await import('/backgammon/ui/board.mjs');
    const render=Board.prototype.render;
    window.previewBoards=[];
    Board.prototype.render=function(...args){
      if(this.container.classList.contains('library-preview')&&!previewBoards.some(r=>r.deref()===this))previewBoards.push(new WeakRef(this));
      return render.apply(this,args);
    };
  });
  await page.locator('.library-item').first().tap();
  await page.locator('#review-decisions').waitFor({state:'visible'});
  assert.equal((await page.evaluate(()=>itemReads)).length,1);
  await page.screenshot({path:path.join(out,`${name}-archived-library-phone.png`)});
  // Each inspector replaces its board. Global listeners and shader observers
  // must be torn down rather than retaining all previously opened previews.
  for(let i=0;i<8;i++){
    await page.evaluate(()=>document.querySelectorAll('.library-item')[1].click());
    await page.waitForFunction(count=>previewBoards.length>=count,i+2);
  }
  await page.waitForTimeout(500);
  if(name==='chromium'){
    const cdp=await context.newCDPSession(page);
    await cdp.send('HeapProfiler.collectGarbage');
    assert.equal(await page.evaluate(()=>previewBoards.filter(r=>r.deref()).length),1,'only the current Library preview survives');
    await cdp.detach();
  }
  assert.deepEqual(errors,[]);
  return migrated;
 }finally{await context.close();}
};
