const assert = require('node:assert/strict'), path = require('node:path');
const {waitForAsync} = require('./play-helpers.cjs');
module.exports = async function solverEditor(browser, base, out, name) {
  const context=await browser.newContext({viewport:{width:1440,height:900},hasTouch:name==='chromium',serviceWorkers:'block',reducedMotion:'reduce'});
  const page=await context.newPage(), errors=[];page.on('pageerror',e=>errors.push(e.message));
  const saved=()=>page.evaluate(async()=>(await(await import('/backgammon/core/storage.mjs')).get('work','solver'))?.state);
  const waitState=async predicate=>{
    for(let i=0;i<100;i++){const s=await saved();if(s&&predicate(s))return s;await page.waitForTimeout(30);}
    assert.fail('Editor state was not saved: '+JSON.stringify({state:await saved(),selected:await page.locator('#board .selected').evaluateAll(es=>es.map(e=>e.dataset.point))}));
  };
  const point=p=>page.locator(`#board [data-point="${p}"]`);
  const tap=async(p,checker=false)=>{await (checker?point(p).locator(':scope > .checker').last():point(p).locator('.point-hit').first()).click();};
  const position=async(p,checker=false)=>point(p).evaluate((g,checker)=>{
    const n=checker?[...g.querySelectorAll(':scope > .checker > circle')][0]:g.querySelector('.point-hit');
    const x=checker?+n.getAttribute('cx'):+n.getAttribute('x')+ +n.getAttribute('width')/2;
    const y=checker?+n.getAttribute('cy'):+n.getAttribute('y')+ +n.getAttribute('height')/2;
    const q=new DOMPoint(x,y).matrixTransform(g.getScreenCTM());return{x:q.x,y:q.y};
  },checker);
  const drag=async(from,to,cancel=false)=>{
    const a=await position(from,true),b=await position(to);
    await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:8});
    assert.equal(await page.locator('.drag-checker').count(),1,JSON.stringify({from,to,a,b,viewport:page.viewportSize()}));
    assert.ok(await page.locator('.editor-target').count());
    assert.equal(await page.locator('.drag-landing-ghost').count(),1);
    if(cancel)await page.keyboard.press('Escape');await page.mouse.up();
  };
  try {
    await page.goto(base+'/backgammon/solver/');await page.locator('#edit-position').click();
    await page.locator('.bg-board.is-editor').waitFor();
    assert.equal(await page.locator('.position-editor select').count(),0);
    assert.equal(await page.locator('#panel select').count(),0);
    assert.equal(await page.locator('[data-editor-supply="0"]').getAttribute('aria-label'),'Place White checkers');
    assert.equal(await page.locator('[data-editor-supply="1"]').getAttribute('aria-label'),'Place Black checkers');
    await tap(7,true);assert.equal(await point(7).getAttribute('aria-pressed'),'true');
    await tap(6);let s=await waitState(s=>s.points[6]===1);assert.equal(s.points[7],2);
    await tap(16,true);await tap(15);s=await waitState(s=>s.points[15]===-1);assert.equal(s.points[16],-2);
    await tap(15,true);await tap('bar1');s=await waitState(s=>s.bar[1]===1);assert.equal(s.points[15],0);
    await tap('bar1',true);await tap(14);await waitState(s=>s.points[14]===-1&&s.bar[1]===0);
    await tap(6,true);await page.locator('#editor-to-tray').click();await waitState(s=>s.off[0]===1);
    await page.locator('[data-editor-supply="0"]').click();await tap(6);await waitState(s=>s.off[0]===0&&s.points[6]===1);
    await page.locator('#editor-undo').click();await waitState(s=>s.off[0]===1);
    await page.locator('#editor-redo').click();await waitState(s=>s.off[0]===0);
    // Selecting or deselecting a checker never edits its position.
    const stable=await saved();await tap(6,true);await tap(6,true);assert.deepEqual(await saved(),stable);
    for(const [width,height] of [[390,844],[844,390],[1440,900]]) {
      await page.setViewportSize({width,height});await page.evaluate(()=>scrollTo(0,0));
      for(const orientation of [0,1]) {
        await page.evaluate(async orientation=>{(await import('/backgammon/core/storage.mjs')).saveSettings({orientation});dispatchEvent(new Event('bg-settings'));},orientation);
        await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
        assert.equal(await page.locator('.bg-board.is-editor').count(),1,'settings changes keep editor active');
        await drag(12,9);await waitState(s=>s.points[9]===1);
        await page.locator('#editor-undo').click();await waitState(s=>s.points[9]===0);
        await drag(18,19);await waitState(s=>s.points[19]===-1);
        await page.locator('#editor-undo').click();await waitState(s=>s.points[19]===0);
        const before=await saved();await drag(12,9,true);assert.deepEqual(await saved(),before,'Escape cancels a drag');
      }
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no page overflow');
      const controls=await page.locator('.position-editor button').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {w:r.width,h:r.height,visible:r.width>0};}));
      assert.ok(controls.filter(r=>r.visible).every(r=>r.w>=44&&r.h>=44),'editor has touch-sized controls');
      await page.screenshot({path:path.join(out,`${name}-solver-editor-${width}.png`)});
    }
    await drag(18,'bar1');await waitState(s=>s.bar[1]===1);
    await drag('bar1',19);await waitState(s=>s.bar[1]===0&&s.points[19]===-1);
    await page.locator('#editor-undo').click();await waitState(s=>s.bar[1]===1);
    await page.locator('#editor-undo').click();await waitState(s=>s.bar[1]===0);
    await drag(12,'off0');await waitState(s=>s.off[0]===1);
    await drag('off0',9);await waitState(s=>s.off[0]===0&&s.points[9]===1);
    await page.locator('#editor-undo').click();await waitState(s=>s.off[0]===1);
    await page.locator('#editor-undo').click();await waitState(s=>s.off[0]===0);
    if(name==='chromium') {
      await page.setViewportSize({width:390,height:844});
      await page.emulateMedia({reducedMotion:'no-preference'});
      const cdp=await context.newCDPSession(page), a=await position(12,true), b=await position(9);
      const touch=(type,p)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:p?[{...p,id:1}]:[]});
      await touch('touchStart',a);
      for(let i=1;i<=8;i++) await touch('touchMove',{x:a.x+(b.x-a.x)*i/8,y:a.y+(b.y-a.y)*i/8});
      assert.equal(await page.locator('.drag-checker').count(),1);
      assert.equal(await page.locator('.drag-landing-ghost[data-target="9"]').count(),1);
      await touch('touchEnd');await waitState(s=>s.points[9]===1);
      await page.waitForFunction(()=>!document.querySelector('.drag-checker,.moving-checker,.drag-landing-ghost'));
      await page.locator('#editor-undo').tap();await waitState(s=>s.points[9]===0);
      await cdp.detach();await page.emulateMedia({reducedMotion:'reduce'});
      await page.setViewportSize({width:1440,height:900});
    }
    // Dice are edited directly using pip buttons. Editing does not play a turn.
    await page.locator('[data-die-index="0"]').click();
    await page.getByRole('dialog',{name:'Set dice',exact:true}).waitFor();
    assert.equal(await page.getByLabel('Player on roll',{exact:true}).getByRole('button',{name:'White',exact:true}).count(),1);
    assert.equal(await page.getByLabel('Player on roll',{exact:true}).getByRole('button',{name:'Black',exact:true}).count(),1);
    for(const [width,height] of [[320,568],[390,844],[667,375]]) {
      await page.setViewportSize({width,height});
      const size=await page.locator('.dice-editor-dialog').evaluate(d=>({w:d.scrollWidth,cw:d.clientWidth,h:d.scrollHeight,ch:d.clientHeight}));
      assert.ok(size.w<=size.cw+1&&size.h<=size.ch+1,`dice choices fit without scrolling: ${JSON.stringify(size)}`);
      const body=await page.locator('.dice-editor-dialog .dialog-body').evaluate(d=>({w:d.scrollWidth,cw:d.clientWidth,h:d.scrollHeight,ch:d.clientHeight}));
      assert.ok(body.w<=body.cw+1&&body.h<=body.ch+1,`dice form fits without scrolling: ${JSON.stringify(body)}`);
      const pipWidth=(await page.locator('.dice-choices button').first().boundingBox()).width;
      assert.ok(pipWidth>=44,`pip choices remain easy to tap at ${width}: ${pipWidth}`);
      await page.screenshot({path:path.join(out,`${name}-solver-dice-${width}.png`)});
    }
    await page.setViewportSize({width:1440,height:900});
    await page.getByLabel('First die',{exact:true}).getByRole('button',{name:'6',exact:true}).click();
    await page.getByLabel('Second die',{exact:true}).getByRole('button',{name:'6',exact:true}).click();
    await page.getByRole('button',{name:'Apply dice',exact:true}).click();
    await waitState(s=>s.dice[0]===6&&s.dice[1]===6);
    assert.equal(await page.locator('.board-die').count(),2,'editing doubles shows the two dice being configured');
    await page.locator('#editor-undo').click();await waitState(s=>s.dice[0]===3&&s.dice[1]===1);
    // A real result remains available after editing, with source preserved.
    await page.getByText('Analysis settings',{exact:true}).click();
    await page.getByLabel('Analysis strength',{exact:true}).locator('[data-choice="quick"]').click();
    const committed=await saved();await page.locator('#analyze').click();
    await page.waitForFunction(()=>document.querySelector('#analyze')?.textContent==='Analyze'&&document.querySelector('#panel .list-row'),null,{timeout:60000});
    assert.deepEqual(await saved(),committed);
    assert.equal(await page.locator('.position-editor').isHidden(),true);
    // Separate touch and mouse contexts so emulated devices do not switch
    // input types mid-gesture sequence (not supported consistently in Firefox).
    const touchContext=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block',reducedMotion:'reduce'});
    try {
      const t=await touchContext.newPage();t.on('pageerror',e=>errors.push(e.message));
      await t.goto(base+'/backgammon/solver/');await t.locator('#edit-position').tap();
      await t.locator('[data-point="7"] > .checker').last().tap();
      await t.waitForFunction(()=>document.querySelector('[data-point="7"]')?.getAttribute('aria-pressed')==='true');
      await t.locator('[data-point="6"] .point-hit').tap();
      await waitForAsync(t,async()=>(await(await import('/backgammon/core/storage.mjs')).get('work','solver'))?.state.points[6]===1);
      await t.locator('#editor-undo').tap();
      await waitForAsync(t,async()=>(await(await import('/backgammon/core/storage.mjs')).get('work','solver'))?.state.points[6]===0);
    } finally {await touchContext.close();}
    assert.deepEqual(errors,[]);
  } finally {await context.close();}
};
