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
  const tap=async(p,checker=false)=>{
    if(checker)return point(p).locator(':scope > .checker').last().click();
    const q=await point(p).evaluate(g=>{
      const r=g.querySelector('.point-hit'),rect=r.getBoundingClientRect();
      const top=+r.getAttribute('y')<330;
      const y=/^\d+$/.test(g.dataset.point)?(top?275:385):+r.getAttribute('y')+ +r.getAttribute('height')/2;
      return {x:rect.x+rect.width/2,y:rect.y+(y-Number(r.getAttribute('y')))/Number(r.getAttribute('height'))*rect.height};
    });
    await page.mouse.click(q.x,q.y);
  };
  const position=async(p,checker=false)=>point(p).evaluate((g,checker)=>{
    const n=checker?[...g.querySelectorAll(':scope > .checker > circle')][0]:g.querySelector('.point-hit');
    const r=n.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};
  },checker);
  const drag=async(from,to,cancel=false)=>{
    const a=await position(from,true),b=await position(to);
    await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:8});
    if(await page.locator('.drag-checker').count()!==1){
      await page.screenshot({path:path.join(out,`${name}-solver-editor-drag-failure.png`)});
    }
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
    await tap(7,true);let s=await waitState(s=>s.off[0]===1);assert.equal(s.points[7],2);
    await tap(6);s=await waitState(s=>s.points[6]===1);assert.equal(s.off[0],0);
    await tap(16,true);await tap(15);s=await waitState(s=>s.points[15]===-1);assert.equal(s.points[16],-2);
    await tap(15,true);await tap('bar1');s=await waitState(s=>s.bar[1]===1);assert.equal(s.points[15],0);
    await tap('bar1',true);await tap(14);await waitState(s=>s.points[14]===-1&&s.bar[1]===0);
    await tap(6,true);await waitState(s=>s.off[0]===1);
    await page.locator('[data-editor-supply="0"]').click();await tap(6);await waitState(s=>s.off[0]===0&&s.points[6]===1);
    await page.locator('#editor-undo').click();await waitState(s=>s.off[0]===1);
    await page.locator('#editor-redo').click();await waitState(s=>s.off[0]===0);
    // No checkers are created when a tray is empty, or mixed with the other color.
    const stable=await saved();await tap(9);await tap(18);assert.deepEqual(await saved(),stable);
    await page.locator('#editor-tools').evaluate(n=>n.open=true);
    // Toolbar setup edits preserve context and can all be undone.
    await page.locator('#editor-clear').click();await waitState(s=>s.off[0]===15&&s.off[1]===15);
    // Context can be set before placing checkers on an empty draft.
    await page.locator('#board .board-cube').click();
    await page.getByLabel('Cube value (accepted stake)',{exact:true}).locator('[data-choice="4"]').click();
    await page.getByLabel('Cube owner',{exact:true}).getByRole('button',{name:'White',exact:true}).click();
    await page.getByRole('button',{name:'Apply context',exact:true}).click();
    await waitState(s=>s.cube.value===4&&s.cube.owner===0&&s.off.every(n=>n===15));
    await page.locator('#editor-undo').click();await waitState(s=>s.cube.value===1&&s.cube.owner===null);
    await tap(9);await tap(9);await waitState(s=>s.points[9]===2&&s.off[0]===13);
    await page.locator('[data-editor-supply="1"]').click();await tap(9);assert.equal((await saved()).points[9],2);
    await tap(9,true);await waitState(s=>s.points[9]===1&&s.off[0]===14);
    await page.locator('#editor-start').click();await waitState(s=>s.points[7]===3&&s.off[0]===0);
    await page.locator('#editor-undo').click();await waitState(s=>s.points[9]===1);
    for(let i=0;i<4;i++)await page.locator('#editor-undo').click();
    await waitState(s=>JSON.stringify(s)===JSON.stringify(stable));
    await page.locator('#solver-turn').click();await waitState(s=>s.turn===1);
    await page.locator('#editor-undo').click();await waitState(s=>s.turn===0);
    await page.locator('#editor-swap').click();await waitState(s=>s.turn===1&&s.points[23-14]===1);
    await page.locator('#editor-undo').click();await waitState(s=>JSON.stringify(s)===JSON.stringify(stable));
    await page.locator('#editor-decision [data-choice="roll"]').click();await waitState(s=>s.phase==='roll'&&!s.dice.length);
    await page.locator('#editor-decision [data-choice="double"]').click();await waitState(s=>s.phase==='double'&&s.pending.by===0);
    await page.locator('#editor-undo').click();await page.locator('#editor-undo').click();
    await waitState(s=>JSON.stringify(s)===JSON.stringify(stable));
    for(const [width,height] of [[390,844],[844,390],[1440,900]]) {
      await page.setViewportSize({width,height});await page.evaluate(()=>scrollTo(0,0));
      await page.locator('#editor-tools').evaluate(n=>n.open=true);
      for(const orientation of [0,1]) {
        if(orientation)await page.locator('#editor-flip').click();
        await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
        assert.equal(await page.locator('.bg-board.is-editor').count(),1,'settings changes keep editor active');
        await drag(12,9);await waitState(s=>s.points[9]===1);
        await page.locator('#editor-undo').click();await waitState(s=>s.points[9]===0);
        await drag(18,19);await waitState(s=>s.points[19]===-1);
        await page.locator('#editor-undo').click();await waitState(s=>s.points[19]===0);
        const before=await saved();await drag(12,9,true);assert.deepEqual(await saved(),before,'Escape cancels a drag');
        await page.locator('#editor-direction').click();
        assert.equal(await page.locator('.solver-mirrored').count(),1);
        await drag(12,9);await waitState(s=>s.points[9]===1);
        await page.locator('#editor-undo').click();await waitState(s=>s.points[9]===0);
        await tap(7,true);await waitState(s=>s.off[0]===1);
        await tap(9);await waitState(s=>s.points[9]===1&&s.off[0]===0);
        await page.locator('#editor-undo').click();await page.locator('#editor-undo').click();
        await waitState(s=>JSON.stringify(s)===JSON.stringify(before));
        if(width===390&&!orientation) await page.screenshot({path:path.join(out,`${name}-solver-editor-mirrored.png`)});
        await page.locator('#editor-direction').click();
        if(orientation)await page.locator('#editor-flip').click();
      }
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no page overflow');
      const controls=await page.locator('.position-editor button').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {label:e.textContent,w:r.width,h:r.height,visible:r.width>0};}));
      assert.ok(controls.filter(r=>r.visible).every(r=>r.w>=43.9&&r.h>=43.9),`editor has touch-sized controls: ${JSON.stringify(controls)}`);
      if(width<=700)await page.locator('#editor-tools').evaluate(n=>n.open=false);
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
      // The dialog follows visualViewport resize on the next frame (WebKit).
      await page.waitForFunction(()=>[document.querySelector('.dice-editor-dialog'),document.querySelector('.dice-editor-dialog .dialog-body')]
        .every(d=>d.scrollWidth<=d.clientWidth+1&&d.scrollHeight<=d.clientHeight+1),null,{timeout:5000}).catch(async e=>{
          await page.screenshot({path:path.join(out,`${name}-solver-dice-failure.png`)});
          throw e;
        });
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
    assert.equal(await page.locator('[data-analyze-preset="deep"]').textContent(),'2 ply');
    assert.equal(await page.locator('[data-analyze-preset="research"]').textContent(),'4 ply');
    assert.equal(await page.locator('#solver-rollout').textContent(),'Rollout');
    // A real result remains available after editing, with source preserved.
    await page.getByText('Analysis settings',{exact:true}).click();
    await page.getByLabel('Analysis strength',{exact:true}).locator('[data-choice="quick"]').click();
    const committed=await saved();await page.locator('#analyze').click();
    await page.waitForFunction(()=>document.querySelector('#analyze')?.textContent==='Analyze'&&document.querySelector('#panel .list-row'),null,{timeout:60000});
    assert.deepEqual(await saved(),committed);
    assert.equal(await page.locator('.position-editor').isHidden(),true);
    // The exposed search shortcuts use the actual engine at their stated depth.
    const endgame = await page.evaluate(async()=>{
      const {initialState}=await import('/backgammon/core/rules.mjs');
      const {shareURL}=await import('/backgammon/core/xgid.mjs');
      const s=initialState({phase:'move',dice:[2,1],matchLength:0});
      s.points=Array(24).fill(0);s.points[4]=1;s.points[19]=-1;s.off=[14,14];
      return shareURL(s);
    });
    // A hash-only goto stays in the existing document in Firefox. Open the
    // shared fixture as a fresh page, as an incoming shared link would be.
    await page.goto('about:blank');
    await page.goto(endgame);
    await waitState(s=>s.off[0]===14&&s.off[1]===14&&s.dice[0]===2);
    await page.locator('#edit-position').click();
    for(const [preset,label,plies] of [['deep','Deep',2],['research','Research',4]]) {
      await page.locator(`[data-analyze-preset="${preset}"]`).click();
      await page.waitForFunction(({label,plies})=>document.querySelector('#analyze')?.textContent==='Analyze'&&
        document.querySelector('#panel')?.textContent.includes(`${label} · ${plies} ply`),{label,plies},{timeout:60000}).catch(async e=>{
          console.log({preset,message:await page.locator('#message').textContent(),panel:await page.locator('#panel').textContent(),errors});
          throw e;
        });
    }
    await page.locator('#solver-rollout').click();
    assert.equal(await page.locator('#rollout-controls').getAttribute('open'),'');
    await page.getByLabel('Rollout trials per alternative').locator('[data-choice="64"]').click();
    await page.locator('#start-rollout').click();
    await page.waitForFunction(()=>document.querySelector('#analyze')?.textContent==='Analyze'&&
      document.querySelector('#panel')?.textContent.includes('64 trials per alternative'),null,{timeout:60000});
    const cp=await page.evaluate(async()=>(await(await import('/backgammon/core/storage.mjs')).get('work','solver-rollout'))?.checkpoint);
    assert.equal(cp.completed,64,'rollout samples are saved for resuming');
    await page.locator('#edit-position').click();
    await page.locator('#editor-tools').evaluate(n=>n.open=true);
    const preserved=await saved();
    await page.locator('#editor-direction').click();await page.locator('#editor-flip').click();
    await page.reload();await page.locator('.bg-board.is-editor').waitFor();
    assert.equal(await page.locator('.solver-mirrored').count(),1,'direction survives refresh');
    assert.equal(await page.locator('#editor-flip').getAttribute('aria-pressed'),'true');
    assert.deepEqual(await saved(),preserved,'view changes preserve the source');
    // Separate touch and mouse contexts so emulated devices do not switch
    // input types mid-gesture sequence (not supported consistently in Firefox).
    const touchContext=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block',reducedMotion:'reduce'});
    try {
      const t=await touchContext.newPage();t.on('pageerror',e=>errors.push(e.message));
      await t.goto(base+'/backgammon/solver/');await t.locator('#edit-position').tap();
      await t.locator('[data-point="7"] > .checker').last().tap();
      await waitForAsync(t,async()=>(await(await import('/backgammon/core/storage.mjs')).get('work','solver'))?.state.off[0]===1);
      await t.locator('[data-point="6"] .point-hit').tap();
      await waitForAsync(t,async()=>(await(await import('/backgammon/core/storage.mjs')).get('work','solver'))?.state.points[6]===1);
      await t.locator('#editor-undo').tap();
      await waitForAsync(t,async()=>(await(await import('/backgammon/core/storage.mjs')).get('work','solver'))?.state.points[6]===0);
    } finally {await touchContext.close();}
    assert.deepEqual(errors,[]);
  } finally {await context.close();}
};
