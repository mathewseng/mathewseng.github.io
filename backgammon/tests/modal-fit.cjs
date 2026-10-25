const assert = require('node:assert/strict'), path = require('node:path');

// Real review/settings/save/history content in an isolated phone context.
// Simulate visualViewport geometry only: Playwright cannot display Safari's
// status bar, expanding address bar, or software keyboard.
module.exports = async (browser, base, out, name) => {
  const context = await browser.newContext({viewport:{width:390,height:844},hasTouch:true,
    ...(name === 'firefox' ? {} : {isMobile:true}),reducedMotion:'reduce',serviceWorkers:'block'});
  const page = await context.newPage(), errors = [], checks = [];
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(base+'/backgammon/');
    await page.evaluate(async () => {
      const shell = await import('/backgammon/ui/shell.mjs'), rules = await import('/backgammon/core/rules.mjs');
      const {decisionReview} = await import('/backgammon/ui/decision-review.mjs');
      const {XGReferenceBook} = await import('/backgammon/engine/xg-reference-book.mjs');
      const {EngineClient} = await import('/backgammon/engine/client.mjs');
      const {gradeCube} = await import('/backgammon/engine/cube-grade.mjs');
      const {historyExplorer} = await import('/backgammon/ui/history-tree.mjs');
      // The user's 42P-22 screenshot, including its six published XG credits.
      const source = rules.initialState({phase:'move',dice:[2,2],matchLength:0,rules:{jacoby:true,immediateRedoubles:2},
        points:[-2,0,0,0,0,5,0,3,0,0,0,-5,5,0,0,0,-2,0,-4,0,-2,0,0,2]});
      const book = await new XGReferenceBook().lookup(source,{preset:'auto'});
      if (book?.candidates.length !== 6) throw Error('Expected the real six-move doubles reference');
      const cube = {...source, phase:'roll',dice:[]}, engine = new EngineClient();
      let cubeResult;
      try { cubeResult = gradeCube(cube,await engine.analyze(cube,{preset:'quick'}),'roll'); } finally { engine.destroy(); }
      const storage = await import('/backgammon/core/storage.mjs');
      await storage.put('work',{id:'modal-fit-checkpoint',state:source,draft:[book.candidates[0].steps[0]]});
      window.modalFixture = {source,book,storage,shell};
      window.openFit = async kind => {
        if(kind === 'review') decisionReview(source,{beforeRoll:{outcomes:[-.166,0,0]},onReplay:()=>{},replayLabel:'Play best'}).result(book,false);
        if(kind === 'cube') decisionReview(cube).result(cubeResult,false);
        if(kind === 'save') shell.saveDialog(source);
        if(kind === 'settings') await shell.preferences();
        if(kind === 'history') historyExplorer({id:'fit',initial:source,state:source,events:[],started:true,names:['White','Black']},{onReturn:()=>{}});
        if(kind === 'warning') shell.dialog('Revise this move?',shell.el('p',{},'This move gives up equity. You can revise it, look at the hint, or play the best move.'),[
          shell.button('Hint',()=>{}),shell.button('Play Best',()=>{},'primary'),shell.button('Reset',()=>{}),shell.button('Play Anyway',()=>{})]).classList.add('checker-warning');
        if(kind === 'sheet') shell.dialog('Controls',shell.el('div',{class:'grid'},...Array.from({length:8},(_,i)=>shell.button(`Control ${i+1}`,()=>{}))),[],{sheet:true});
      };
    });
    const before = await page.evaluate(()=>modalFixture.storage.get('work','modal-fit-checkpoint'));
    const fit = async (kind, width, height, viewport = null) => {
      const result = await page.locator('.bg-dialog[open]').last().evaluate(d => {
        const rect = n => n?.getBoundingClientRect().toJSON();
        const cs = getComputedStyle(d);
        return {box:rect(d),head:rect(d.querySelector('.dialog-head')),foot:rect(d.querySelector('.dialog-foot')),
          overflowX:d.scrollWidth>d.clientWidth+1,overflowY:d.scrollHeight>d.clientHeight+1,
          wide:[...d.querySelectorAll('.dialog-body, .decision-content, .review-depth-options')].filter(n=>n.scrollWidth>n.clientWidth+1).map(n=>n.className),
          top:cs.getPropertyValue('--dialog-visible-top'),height:cs.getPropertyValue('--dialog-visible-height')};
      });
      const v = viewport || {top:0,left:0,width,height};
      assert.ok(result.box.top >= v.top+19 && result.box.bottom <= v.top+v.height-11,
        `${kind} vertical safe bounds ${JSON.stringify({width,height,v,result})}`);
      assert.ok(result.box.left >= v.left+7 && result.box.right <= v.left+v.width-7,
        `${kind} horizontal safe bounds ${JSON.stringify({width,height,v,result})}`);
      assert.ok(!result.overflowX && !result.overflowY,`${kind} content scrolls inside modal ${JSON.stringify(result)}`);
      assert.deepEqual(result.wide,[],`${kind} content needs no sideways scrolling`);
      assert.ok(result.head.top>=result.box.top && result.head.bottom<=result.box.bottom,`${kind} header remains reachable`);
      if(result.foot.height) assert.ok(result.foot.top>=result.head.bottom && result.foot.bottom<=result.box.bottom,`${kind} footer remains reachable`);
      checks.push({kind,width,height,viewport:v});
    };
    for(const [width,height] of [[320,568],[390,844],[430,932],[844,390],[852,320],[1366,768]]) {
      await page.setViewportSize({width,height});
      for(const kind of ['review','cube','save','settings','history','warning','sheet']) {
        await page.evaluate(kind=>openFit(kind),kind);
        if(width===320) await page.locator('.bg-dialog[open]').last().evaluate(d=>d.style.fontFamily='Verdana, sans-serif');
        await fit(kind,width,height);
        if(kind==='review') {
          const list=await page.locator('.review-move-rows').evaluate(n=>({height:n.clientHeight,total:n.scrollHeight,
            six:[...n.children].reduce((s,c)=>s+c.getBoundingClientRect().height,0)+4}));
          assert.ok(Math.abs(list.height-list.six)<1,'six credited moves have no extra empty list space');
          assert.ok(list.total<=list.height+1,'six moves do not need list scrolling');
          assert.equal(await page.locator('.review-position .return-icon path').getAttribute('d'),'M8 7v-7a8 8 0 0 0-16 0v2m-4-4 4 4 4-4');
          await page.screenshot({path:path.join(out,`${name}-modal-fit-reference-${width}.png`)});
          await page.getByRole('button',{name:'Position',exact:true}).tap();
          assert.equal(await page.locator('.review-position').getAttribute('aria-pressed'),'true');
          await page.locator('.review-move[data-rank="6"]').tap();
          assert.equal(await page.locator('.review-move[data-rank="6"]').getAttribute('aria-pressed'),'true');
        }
        await page.locator('.bg-dialog[open]').last().locator('.close').tap();
        await page.locator('.bg-dialog[open]').waitFor({state:'detached'});
      }
    }
    // Safari's expanded chrome is not a keyboard: it can shrink the visual
    // viewport by less than 100px. Test both that and the keyboard/panned case.
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(() => {
      window.originalViewport = Object.getOwnPropertyDescriptor(window,'visualViewport');
      window.fitViewport = Object.assign(new EventTarget(),{scale:1,width:390,height:774,offsetTop:0,offsetLeft:0});
      Object.defineProperty(window,'visualViewport',{configurable:true,value:fitViewport});
    });
    for (const kind of ['review','cube','save','settings','history','warning','sheet']) {
      await page.evaluate(kind=>openFit(kind),kind);
      for(const v of [{top:0,left:0,width:390,height:774},{top:44,left:0,width:390,height:720},{top:120,left:0,width:390,height:360}]) {
        await page.evaluate(v=>{Object.assign(fitViewport,{height:v.height,width:v.width,offsetTop:v.top,offsetLeft:v.left});fitViewport.dispatchEvent(new Event('resize'));},v);
        await fit(kind,390,844,v);
      }
      await page.locator('.bg-dialog[open]').last().locator('.close').tap();
      await page.locator('.bg-dialog[open]').waitFor({state:'detached'});
    }
    await page.evaluate(()=>{
      Object.assign(fitViewport,{height:844,width:390,offsetTop:0,offsetLeft:0});
      fitViewport.dispatchEvent(new Event('resize'));
      openFit('review');
    });
    // Emulate the additional physical notch / home-indicator insets. Browser
    // emulation reports env(safe-area-inset-*) as zero even for iPhone sizes.
    await page.locator('.decision-dialog').evaluate(d=>{
      d.style.setProperty('--dialog-edge-top','71px');
      d.style.setProperty('--dialog-edge-bottom','34px');
    });
    const safe=await page.locator('.decision-dialog').boundingBox();
    assert.ok(safe.y>=71 && safe.y+safe.height<=810);
    await page.screenshot({path:path.join(out,`${name}-modal-fit-safe-area.png`)});
    await page.getByRole('button',{name:'Save position',exact:true}).tap();
    const child=page.getByRole('dialog',{name:'Save to Library',exact:true});
    await child.getByLabel('Name',{exact:true}).fill('Preserve this form');
    await child.locator('.close').tap();
    await child.waitFor({state:'detached'});
    assert.ok(await page.locator('.decision-dialog').isVisible());
    assert.ok(await page.evaluate(()=>document.documentElement.classList.contains('bg-dialog-open')));
    await page.locator('.decision-dialog .close').tap();
    await page.locator('.decision-dialog').waitFor({state:'detached'});
    assert.deepEqual(await page.evaluate(()=>modalFixture.storage.get('work','modal-fit-checkpoint')),before,'reviewing/resizing preserves saved game and draft');
    assert.deepEqual(errors,[]);
    return {browser:name,checks,realReference:true,safeArea:true,nestedForm:true,savedGamePreserved:true};
  } finally {await context.close();}
};
