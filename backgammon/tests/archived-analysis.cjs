const assert = require('node:assert/strict'), path = require('node:path');
module.exports = async (browser, base, out, name) => {
  const context = await browser.newContext({viewport:{width:390,height:844},hasTouch:true,reducedMotion:'reduce',serviceWorkers:'block'});
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const ready = () => page.waitForFunction(() => document.documentElement.dataset.appReady === 'true');
  try {
    if (name === 'chromium') await context.route('**/ui/archived-games.mjs', async route => {
      const response = await route.fetch();
      const source = (await response.text()).replace('const rows = decisionHistory(item);',
        '(window.openedArchiveRefs ||= []).push(new WeakRef(item)); const rows = decisionHistory(item);');
      await route.fulfill({response, body:source});
    });
    await page.goto(base+'/backgammon/'); await ready();
    await page.evaluate(async () => {
      const r = await import('/backgammon/core/rules.mjs'), st = await import('/backgammon/core/storage.mjs');
      const {playAction} = await import('/backgammon/core/table.mjs'), {localConfig} = await import('/backgammon/core/play-session.mjs');
      const config = localConfig({mode:'computer',humanSide:0,tutor:true,warning:false,strength:'quick'});
      for (let n = 1; n <= 13; n++) {
        const initial = r.initialState({phase:'roll',matchLength:0}); initial.gameNumber = n;
        let game = {id:'archive-analysis',archiveId:`archive-${n}`,historyVersion:2,initial,state:initial,started:true,events:[],names:['You','Black'],config};
        if (n < 13) {
          for (let player = 0; player < 2; player++) {
            const before = game.state;
            game = playAction(game,{type:'roll',dice:[4,1]});
            game.events.at(-1).evaluation = {result:{type:'cube',status:'complete',positionKey:r.positionKey(before),
              settings:{name:'Test',plies:3},units:'current-cube-points',outcomes:[.2,.17,1]}};
            const s = game.state, turns = r.legalTurns(s), steps = turns[0].steps;
            game = playAction(game,{type:'move',steps});
            game.events.at(-1).evaluation = {result:{type:'checker',status:'complete',positionKey:r.positionKey(s),
              settings:{name:'Test',plies:3},units:'current-cube-points',candidates:[{equity:.2,steps:turns[1].steps}],actual:{equity:.19,steps}}};
            if (n === 10) delete game.events.at(-1).evaluation;
          }
          game = playAction(game,{type:'resign',level:1});
          game = playAction(game,{type:'accept'});
        }
        await st.saveMatchHistory(game,game.names,'computer');
        if (n === 13) await st.put('work',{id:'play',game,draft:[]});
      }
      // Existing archives must work even without the newly indexed split totals.
      const db = await st.database();
      await new Promise((resolve,reject) => {
        const tx = db.transaction(['items','summaries'],'readwrite');
        for (const store of ['items','summaries']) {
          const req = tx.objectStore(store).get('archive-12');
          req.onsuccess = () => {const v=req.result;delete v.lossSummary;tx.objectStore(store).put(v);};
        }
        tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
      });
      st.saveSettings({analysisAhead:false,equityBar:false,motion:'reduce'});
    });
    await page.goto(base+'/backgammon/play/'); await ready();
    await page.evaluate(async () => {
      (await import('/backgammon/engine/client.mjs')).EngineClient.prototype.analyze = () => new Promise(() => {});
      window.archiveReads = [];
      const get = IDBObjectStore.prototype.get;
      IDBObjectStore.prototype.get = function(key) {
        if (this.name === 'items' && /^archive-/.test(key) && key !== 'archive-13') {
          window.archiveReads.push(key);
          if (window.failArchiveRead) {window.failArchiveRead=false;throw Error('Test disk read failed');}
        }
        return get.call(this,key);
      };
    });
    await page.locator('#resume-match').tap();
    await page.locator('.archived-games').scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>document.querySelectorAll('.archived-game').length===8);
    assert.deepEqual(await page.evaluate(()=>archiveReads),[],'collapsed summaries do not hydrate games');
    assert.equal(await page.locator('.archived-game[open], .history-moves-disclosure[open]').count(),0);
    assert.equal(await page.locator('.archived-game .history-turn').count(),0);
    assert.deepEqual(await page.locator('.archived-game').evaluateAll(ns=>ns.map(n=>Number(n.dataset.game))),[12,11,10,9,8,7,6,5]);
    const latest = page.locator('[data-archive-id="archive-12"]');
    await latest.locator('.history-moves-disclosure > summary').tap();
    await latest.locator('.history-turn').waitFor();
    assert.deepEqual(await page.evaluate(()=>archiveReads),['archive-12']);
    assert.equal(await latest.locator('.feedback-review').count(),2,'cube and checker available under summary');
    assert.equal(await latest.locator('.history-turn').count(),1,'paired turn');
    assert.equal(await latest.locator('[data-stage="accepted"] strong').first().innerText(),'0.010','legacy summary upgrades on expansion');
    assert.equal(await latest.locator('.history-turn[data-history-side="opponent"]').count(),0,'You filter applies to archives');
    await latest.locator('[data-decision-type="checker"]').tap();
    await page.locator('.decision-dialog').waitFor();
    assert.match(await page.locator('.decision-caption').innerText(),/Best move/);
    await page.locator('.decision-dialog .close').tap();
    await page.locator('[data-history-filter="all"]').tap();
    assert.equal(await latest.locator('.history-turn').count(),2);
    assert.equal(await page.evaluate(()=>archiveReads.length),1,'filter uses the one loaded game');
    for (const [width,height] of [[390,844],[844,390],[1366,768]]) {
      await page.setViewportSize({width,height});
      await latest.scrollIntoViewIfNeeded();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await page.screenshot({path:path.join(out,`${name}-archived-analysis-${width}.png`)});
    }
    await page.setViewportSize({width:390,height:844});
    const next = page.locator('[data-archive-id="archive-11"]');
    await page.evaluate(()=>{window.failArchiveRead=true;});
    await next.locator('.history-moves-disclosure > summary').tap();
    await next.getByRole('button',{name:'Retry loading moves'}).waitFor();
    assert.equal(await latest.locator('.history-turn').count(),0,'opening another game releases previous moves');
    await next.getByRole('button',{name:'Retry loading moves'}).tap();
    await next.locator('.history-turn').first().waitFor();
    await next.locator('.history-moves-disclosure > summary').tap();
    await page.waitForFunction(()=>!document.querySelector('.archived-game .history-turn'));
    if (name === 'chromium') {
      const cdp = await context.newCDPSession(page);
      await cdp.send('HeapProfiler.collectGarbage');
      await cdp.send('HeapProfiler.collectGarbage');
      const retained = await page.evaluate(()=>openedArchiveRefs.filter(ref=>ref.deref()).length);
      assert.equal(retained,0,
        'collapsed games release their hydrated records, not just their DOM');
    }
    const pending = page.locator('[data-archive-id="archive-10"]');
    await pending.locator('.history-moves-disclosure > summary').tap();
    await pending.getByRole('button',{name:'Review',exact:true}).first().tap();
    await page.locator('.decision-dialog').waitFor();
    assert.match(await page.locator('.decision-caption').innerText(),/\d+\//,'unanalyzed moves still have a board preview');
    await page.locator('.decision-dialog .close').tap();
    await page.getByRole('button',{name:'Older games',exact:true}).tap();
    await page.waitForFunction(()=>document.querySelectorAll('.archived-game').length===4);
    assert.deepEqual(await page.locator('.archived-game').evaluateAll(ns=>ns.map(n=>Number(n.dataset.game))),[4,3,2,1]);
    await page.getByRole('button',{name:'Newer games',exact:true}).tap();
    await page.waitForFunction(()=>document.querySelectorAll('.archived-game').length===8);
    await latest.locator('.history-moves-disclosure > summary').tap();
    await latest.locator('[data-decision-type="checker"]').first().tap();
    await page.getByRole('button',{name:'Return to this position',exact:true}).tap();
    await page.waitForFunction(()=>document.querySelector('#subtitle').textContent.includes('Game 12'));
    const saved = await page.evaluate(async()=>{
      const st=await import('/backgammon/core/storage.mjs');
      return {current:await st.get('work','play'),old:await st.get('items','archive-13'),restored:await st.get('items','archive-12')};
    });
    assert.equal(saved.current.game.state.gameNumber,12);
    assert.equal(saved.old.state.gameNumber,13,'newer game is preserved');
    assert.ok(saved.restored.undoLog.length,'original archived line is preserved as a variation');
    assert.deepEqual(errors,[]);
    return {lazy:true,collapsedByDefault:true,pairedTurns:true,filters:true,retry:true,pagination:true,restore:true};
  } finally {await context.close();}
};
