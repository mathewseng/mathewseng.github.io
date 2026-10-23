const assert = require('node:assert/strict'), path = require('node:path');
module.exports = async function landscapeViewport(browser, base, out, name) {
  const context = await browser.newContext({ viewport: {width:390, height:844}, hasTouch:true,
    reducedMotion:'reduce', serviceWorkers:'block' });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(base + '/backgammon/');
    await page.evaluate(async () => {
      const r = await import('/backgammon/core/rules.mjs'), s = await import('/backgammon/core/storage.mjs');
      s.saveSettings({equityBar:true, analysisAhead:false, interactionMode:'advanced', motion:'reduce'});
      const initial = r.initialState({phase:'move', dice:[3,1], matchLength:0});
      await s.put('work', {id:'play', game:{id:'landscape-fit', started:true, initial, state:initial, events:[],
        names:['White','Black'], config:{mode:'computer', humanSide:0, strength:'quick', reviewStrength:'quick',
          tutor:true, warning:false, matchLength:0, rules:initial.rules}}, draft:[], positionKey:r.positionKey(initial)});
    });
    await page.goto(base + '/backgammon/play/#resume=landscape-fit');
    await page.locator('#equity-bar[data-state="ready"]').waitFor({timeout:60000});
    const before = await page.evaluate(async () => (await import('/backgammon/core/storage.mjs')).get('work','play'));
    // Safari's two toolbar rows leave substantially less space than the
    // phone's physical 430px height. Also cover expanding/collapsing chrome.
    for (const [width,height] of [[932,310],[844,280],[667,260],[932,430],[844,390],[932,310],[390,844],[1440,900]]) {
      await page.setViewportSize({width,height});
      await page.waitForTimeout(100);
      const metrics = await page.evaluate(() => {
        const rect = selector => {const r=document.querySelector(selector).getBoundingClientRect();
          return {left:r.left, top:r.top, right:r.right, bottom:r.bottom, width:r.width, height:r.height};};
        const svg=document.querySelector('.bg-board'), matrix=svg.getScreenCTM(), vb=svg.viewBox.baseVal;
        const a=new DOMPoint(vb.x,vb.y).matrixTransform(matrix), b=new DOMPoint(vb.width,vb.height).matrixTransform(matrix);
        return {app:rect('.app'), board:{left:a.x,top:a.y,right:b.x,bottom:b.y},
          rail:rect('#equity-bar'), meter:rect('.equity-meter'), confirm:rect('#confirm'),
          overflow:document.documentElement.scrollWidth>innerWidth+1};
      });
      assert.ok(!metrics.overflow, JSON.stringify({width,height,metrics}));
      if (width > height && height <= 500) {
        assert.ok(metrics.app.bottom <= height+1, 'landscape fits below Safari chrome: '+JSON.stringify({width,height,metrics}));
        assert.ok(metrics.board.top >= 0 && metrics.board.bottom <= height+1, 'whole board stays visible');
        assert.ok(metrics.rail.right <= metrics.board.left+1, 'equity cannot overlap the board');
        assert.ok(Math.abs(metrics.meter.top-metrics.board.top)<2 && Math.abs(metrics.meter.bottom-metrics.board.bottom)<2,
          'equity track aligns with the full board height: '+JSON.stringify(metrics));
        for (const selector of ['#confirm','#preferences','#sound-toggle','#screen-toggle','#panel-toggle','#mobile-tools','#undo-turn','#hint','#all-controls','#analysis-jump']) {
          const box=await page.locator(selector).boundingBox();
          assert.ok(box && box.y >= -1 && box.y+box.height <= height+1 && box.x>=0 && box.x+box.width<=width+1,
            `${selector} fits at ${width}x${height}: ${JSON.stringify(box)}`);
          assert.ok(box.height>=44, selector+' keeps a touch target');
          assert.ok(await page.locator(selector).evaluate(n => {
            const r=n.getBoundingClientRect(), hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
            return n === hit || n.contains(hit);
          }), selector+' is not obscured');
        }
        await page.locator('.equity-meter').tap();
        await page.getByRole('button',{name:'Show equity bar',exact:true}).tap();
        await page.locator('#equity-bar[data-state="ready"]').waitFor({timeout:60000});
      }
      await page.screenshot({path:path.join(out,`${name}-landscape-${width}x${height}.png`)});
    }
    await page.setViewportSize({width:932,height:310});
    // Exercise Safari's no-fullscreen capability and rejected requests. These
    // capability stubs do not pretend headless WebKit includes Safari chrome.
    await page.evaluate(() => {
      Object.defineProperty(document,'fullscreenEnabled',{configurable:true,value:false});
      Object.defineProperty(document,'webkitFullscreenEnabled',{configurable:true,value:false});
    });
    await page.locator('#screen-toggle').tap();
    await page.locator('.fullscreen-help').waitFor();
    assert.match(await page.locator('.fullscreen-help').innerText(), /Hide Toolbar/);
    assert.match(await page.locator('.fullscreen-help').innerText(), /Open as Web App/);
    await page.screenshot({path:path.join(out,`${name}-landscape-toolbar-help.png`)});
    await page.locator('.fullscreen-help .close').tap();
    await page.evaluate(() => {
      Object.defineProperty(document,'fullscreenEnabled',{configurable:true,value:true});
      document.documentElement.requestFullscreen = () => Promise.reject(new Error('Browser denied fullscreen'));
    });
    await page.locator('#screen-toggle').tap();
    await page.locator('.fullscreen-help').waitFor();
    await page.locator('.fullscreen-help .close').tap();
    await page.evaluate(() => {
      let element=null;
      window.fullscreenRequests=0;
      Object.defineProperty(document,'fullscreenElement',{configurable:true,get:()=>element});
      document.documentElement.requestFullscreen=async () => {
        window.fullscreenRequests++; element=document.documentElement;
        document.dispatchEvent(new Event('fullscreenchange'));
      };
      document.exitFullscreen=async () => {element=null; document.dispatchEvent(new Event('fullscreenchange'));};
    });
    await page.setViewportSize({width:390,height:844});
    await page.setViewportSize({width:932,height:310});
    assert.equal(await page.evaluate(()=>window.fullscreenRequests),0,'rotation never makes a disallowed fullscreen request');
    await page.locator('#screen-toggle').tap();
    assert.equal(await page.locator('#screen-toggle').getAttribute('aria-label'),'Exit full screen');
    await page.locator('#screen-toggle').tap();
    assert.equal(await page.locator('#screen-toggle').getAttribute('aria-label'),'Full screen');
    // A changing visual viewport also updates layout when innerHeight does
    // not change (Safari toolbar animation). Pinch zoom must remain intact.
    await page.evaluate(() => {
      Object.defineProperty(visualViewport,'height',{configurable:true,value:280});
      visualViewport.dispatchEvent(new Event('resize'));
    });
    await page.waitForFunction(()=>document.querySelector('.app').getBoundingClientRect().height<=281);
    await page.evaluate(() => {
      Object.defineProperty(visualViewport,'scale',{configurable:true,value:2});
      Object.defineProperty(visualViewport,'height',{configurable:true,value:140});
      visualViewport.dispatchEvent(new Event('resize'));
    });
    await page.waitForTimeout(80);
    assert.equal(await page.locator('.app').evaluate(n=>n.getBoundingClientRect().height),280,'pinch zoom does not shrink the game');
    const after = await page.evaluate(async () => (await import('/backgammon/core/storage.mjs')).get('work','play'));
    assert.deepEqual(after.game,before.game); assert.deepEqual(after.draft,before.draft);
    // Primary decisions also fit when there is no checker-confirm button.
    for (const phase of ['roll','double','over']) {
      await page.goto(base+'/backgammon/');
      await page.evaluate(async phase => {
        const r=await import('/backgammon/core/rules.mjs'), s=await import('/backgammon/core/storage.mjs');
        let state=r.initialState({phase:'roll',matchLength:0,rules:{immediateRedoubles:2}});
        if (phase!=='roll') state=r.transition(state,{type:'double'});
        if (phase==='over') state=r.transition(state,{type:'pass'},r.decisionPlayer(state));
        await s.put('work',{id:'play',game:{id:'landscape-'+phase,started:true,initial:state,state,events:[],
          names:['White','Black'],config:{mode:'local',humanSide:r.decisionPlayer(state),strength:'quick',
            reviewStrength:'quick',tutor:true,matchLength:0,rules:state.rules}},draft:[],positionKey:r.positionKey(state)});
      },phase);
      await page.goto(base+'/backgammon/play/#resume=landscape-'+phase);
      await page.setViewportSize({width:667,height:260});
      await page.locator('#all-controls').waitFor();
      await page.waitForTimeout(80);
      const selectors=phase==='double'?['#drop-cube','#take-cube','#immediate-redouble']:
        phase==='over'?['#next-game','#game-review']:['#screen-toggle'];
      for (const selector of [...selectors,'#undo-turn','#all-controls','#analysis-jump']) {
        const box=await page.locator(selector).boundingBox();
        assert.ok(box && box.y>=0 && box.y+box.height<=261 && box.height>=44,
          `${phase}: ${selector} fits with browser chrome: ${JSON.stringify(box)}`);
      }
      await page.screenshot({path:path.join(out,`${name}-landscape-${phase}.png`)});
    }
    assert.deepEqual(errors,[]);
    return {browser:name, toolbarHeights:[260,280,310], rotation:true, gamePreserved:true,
      fullscreenFallback:true, fullscreenRejection:true, visualViewport:true, pinchZoom:true};
  } catch(error) {
    await page.screenshot({path:path.join(out,`${name}-landscape-failure.png`)}); throw error;
  } finally {await context.close();}
};
