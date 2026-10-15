const assert = require('node:assert/strict'), path = require('node:path');
module.exports = async function dragFeedback(browser, base, out, name) {
  const ctx = await browser.newContext({ viewport:{width:1366,height:900}, serviceWorkers:'block' });
  const page = await ctx.newPage(), errors=[], shots=[];
  page.on('pageerror', e=>errors.push(e.message));
  const snapshot=()=>page.evaluate(()=>({draft:dragTest.d.draft, selected:dragTest.d.selected, state:dragTest.d.current()}));
  const fixture=async({mode='advanced',turn=0,orientation=0,kind='opening',motion='reduce'}={})=>page.evaluate(async options=>{
    const {d,r,st}=dragTest;
    st.saveSettings({interactionMode:options.mode,orientation:options.orientation,motion:options.motion,equityBar:false,boardTheme:{preset:'plum'}});
    document.documentElement.dataset.motion=options.motion;
    (await import('/backgammon/core/appearance.mjs')).applyBoardTheme({preset:'plum'});
    let s=r.initialState({phase:'move',dice:[4,1]});
    if(options.kind==='stack') {const points=Array(24).fill(0);points[12]=8;points[5]=7;points[23]=-15;s=r.initialState({points,phase:'move',dice:[4,1]});}
    if(options.kind==='bar') {const points=Array(24).fill(0);points[5]=13;points[11]=-15;s=r.initialState({points,bar:[2,0],phase:'move',dice:[4,1]});}
    if(options.kind==='off') {const points=Array(24).fill(0);points[0]=2;points[23]=-15;s=r.initialState({points,off:[13,0],phase:'move',dice:[1,2]});}
    if(options.turn) s={...s,turn:1,points:s.points.toReversed().map(n=>-n),bar:s.bar.toReversed(),off:s.off.toReversed()};
    d.set(s,r.legalPaths(s)); window.sourceJSON=JSON.stringify(s);
  },{mode,turn,orientation,kind,motion});
  const coord=async(point,disc=false,index=-1)=>page.evaluate(({point,disc,index})=>{
    const node=document.querySelector(`[data-point="${point}"]`);
    const c=disc?[...node.querySelectorAll(':scope > .checker > circle:first-child')].at(index):node.querySelector('.point-hit');
    const p=disc?{x:+c.getAttribute('cx'),y:+c.getAttribute('cy')}:{x:+c.getAttribute('x')+ +c.getAttribute('width')/2,y:+c.getAttribute('y')+ +c.getAttribute('height')/2};
    const q=new DOMPoint(p.x,p.y).matrixTransform(node.getScreenCTM());return{x:q.x,y:q.y};
  },{point,disc,index});
  const lift=async(from,to,{outside=false,index=-1}={})=>{
    const a=await coord(from,true,index), b=outside?{x:2,y:2}:await coord(to);
    await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:6});
    assert.equal(await page.locator('.drag-checker').count(),1);
    assert.ok(await page.locator('.drag-origin').count()>0);
    assert.ok(await page.locator('.drag-origin').evaluateAll(ns=>ns.every(n=>getComputedStyle(n).visibility==='hidden')),'no faded original checker');
    assert.equal(await page.locator('.drop-hover').count(),1);
    assert.equal(await page.evaluate(()=>JSON.stringify(dragTest.d.state)===sourceJSON),true,'pickup never mutates game');
    return await page.locator('.drop-hover').getAttribute('data-point');
  };
  const release=async()=>{await page.mouse.up();assert.equal(await page.locator('.drag-checker,.drag-origin,.drag-remainder,.drop-hover').count(),0);};
  const shot=async(label)=>{const file=`${name}-${label}.png`;await page.screenshot({path:path.join(out,file)});shots.push(file);};
  try {
    await page.goto(base+'/backgammon/');
    await page.evaluate(async()=>{
      const {shell,DraftBoard}=await import('/backgammon/ui/shell.mjs');
      const r=await import('/backgammon/core/rules.mjs'),st=await import('/backgammon/core/storage.mjs');
      const ui=shell('trainer','Checker interactions');const d=new DraftBoard(ui.board);
      window.dragTest={d,r,st};
    });
    // Actual pointer clicks: amber means this disc's click undoes, never moves forward.
    for(const turn of [0,1]) for(const orientation of [0,1]) {
      await fixture({turn,orientation});
      const map=p=>turn?23-p:p;
      await page.evaluate(map=>dragTest.d.move({from:map[0],to:map[1],die:4}),[map(12),map(8)]);
      assert.equal(await page.locator('.draft-undo-checker').count(),0,'remaining forward die is not an undo cue');
      await page.evaluate(map=>dragTest.d.move({from:map[0],to:map[1],die:1}),[map(5),map(4)]);
      assert.equal(await page.locator('.draft-undo-checker').count(),2);
      const q=await coord(map(8),true);await page.mouse.click(q.x,q.y);
      assert.deepEqual((await snapshot()).draft,[{from:map(5),to:map(4),die:1}]);
      assert.equal(await page.locator('.draft-undo-checker').count(),1,'the other checker is still blocked by the opposing one-point');
      assert.equal(await page.locator(`[data-point="${map(4)}"] .draft-undo-checker`).count(),1);
    }
    await fixture();
    await page.evaluate(()=>{const d=dragTest.d;d.move({from:12,to:8,die:4});d.move({from:5,to:4,die:1});d.minDraft=2;d.render();});
    assert.equal(await page.locator('.draft-undo-checker').count(),0,'forced moves are not undoable');
    for(const mode of ['advanced','beginner']) for(const orientation of [0,1]) {
      await fixture({mode,orientation});
      await lift(12,8);await release();assert.deepEqual((await snapshot()).draft,[{from:12,to:8,die:4}]);
      await fixture({mode,orientation});
      const target=await lift(12,8,{outside:true});await release();
      assert.equal((await snapshot()).draft.at(-1).to,Number(target),'outside drop matches its preview');
      await fixture({mode,orientation});await lift(12,11); // opponent's blocked point
      assert.notEqual(await page.locator('.drop-hover').getAttribute('data-point'),'11');
      await release();assert.ok((await snapshot()).draft.length>0);
      await fixture({mode,orientation});await lift(12,8);await page.keyboard.press('Escape');await page.mouse.up();
      assert.equal((await snapshot()).draft.length,0,'Escape cancels without a move');
      assert.equal(await page.locator('.drag-checker,.drag-origin').count(),0);
    }
    await fixture();
    await page.evaluate(()=>{const d=dragTest.d;d.move({from:12,to:8,die:4});d.move({from:5,to:4,die:1});d.preview=d.current();d.render();});
    assert.equal(await page.locator('.draft-undo-checker').count(),0,'previews never advertise undo');
    // Every visible stack disc can be picked up; compressed stacks show an
    // accurate remaining count while retaining five visible discs.
    await fixture({kind:'stack'});await lift(12,8,{index:0});
    assert.equal(await page.locator('[data-point="12"] > .checker:not(.drag-origin)').count(),5);
    assert.equal(await page.locator('[data-point="12"] > .checker:not(.drag-origin) text').textContent(),'7');
    await release();assert.equal((await snapshot()).state.points[12],7);
    await fixture({kind:'bar'});await lift('bar0',20);
    assert.equal(await page.locator('[data-point="bar0"] .drag-remainder text').count(),0,'two on bar becomes one while lifted');
    await release();assert.equal((await snapshot()).state.bar[0],1);
    await fixture({kind:'off'});
    await page.evaluate(()=>{dragTest.d.move({from:0,to:'off',die:1});});
    assert.equal(await page.locator('[data-point="off0"] .draft-undo-checker').count(),1);
    await lift('off0',0);await release();assert.equal((await snapshot()).state.off[0],13);
    await fixture({mode:'beginner'});await page.evaluate(()=>{dragTest.d.move({from:12,to:8,die:4});dragTest.d.move({from:5,to:4,die:1});});
    assert.equal(await page.locator('.draft-undo-checker').count(),0,'beginner clicks still select');
    await fixture({motion:'full'});
    await page.evaluate(()=>{dragTest.d.move({from:12,to:8,die:4});dragTest.d.move({from:5,to:4,die:1});});
    await page.waitForTimeout(600);await shot('amber-draft-desktop');
    for(const [width,height] of [[390,844],[844,390],[1366,900]]) {
      await page.setViewportSize({width,height});await fixture({motion:'full'});
      await lift(12,8);await page.waitForTimeout(180);
      await shot(`lifted-checker-${width}`);
      // Redraws from unrelated UI updates must keep the held checker attached.
      await page.evaluate(()=>dragTest.d.render());
      assert.equal(await page.locator('.drag-checker').count(),1);
      await release();assert.equal((await snapshot()).draft.length,1);
      await page.waitForFunction(()=>!document.querySelector('.moving-checker'));
      assert.equal(await page.locator('[data-arriving]').count(),0);
    }
    // Browser-dispatched touch, not synthetic JS pointer events, checks that
    // mobile panning never steals an actual checker drag.
    if(name==='chromium') {
      const touchContext=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block'});
      const t=await touchContext.newPage();await t.goto(base+'/backgammon/');
      await t.evaluate(async()=>{
        const {shell,DraftBoard}=await import('/backgammon/ui/shell.mjs');
        const r=await import('/backgammon/core/rules.mjs');const st=await import('/backgammon/core/storage.mjs');
        st.saveSettings({interactionMode:'advanced',motion:'full',equityBar:false,boardTheme:{preset:'plum'}});
        const d=new DraftBoard(shell('trainer','Touch drag').board),s=r.initialState({phase:'move',dice:[4,1]});d.set(s,r.legalPaths(s));window.touchDraft=d;
      });
      const coords=await t.evaluate(()=>{const b=touchDraft.board,cv=(x,y)=>{const p=new DOMPoint(x,y).matrixTransform(b.svg.getScreenCTM());return{x:p.x,y:p.y};};return{a:cv(54,230),b:cv(234,460)};});
      const cdp=await touchContext.newCDPSession(t);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...coords.a,id:1}]});
      for(let i=1;i<=10;i++) await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:coords.a.x+(coords.b.x-coords.a.x)*i/10,y:coords.a.y+(coords.b.y-coords.a.y)*i/10,id:1}]});
      assert.equal(await t.locator('.drag-checker').count(),1);
      await t.waitForTimeout(180);
      const file=`${name}-actual-touch-pickup.png`;await t.screenshot({path:path.join(out,file)});shots.push(file);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      assert.equal(await t.evaluate(()=>touchDraft.draft.length),1);
      assert.equal(await t.evaluate(()=>scrollY),0);
      assert.equal(await t.locator('.drag-checker,.drag-origin').count(),0);
      await t.evaluate(()=>touchDraft.set(touchDraft.state,touchDraft.paths));
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...coords.a,id:2}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...coords.b,id:2}]});
      assert.equal(await t.locator('.drag-checker').count(),1);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
      assert.equal(await t.evaluate(()=>touchDraft.draft.length),0,'interrupted touch cancels');
      assert.equal(await t.locator('.drag-checker,.drag-origin').count(),0);
      await touchContext.close();
    }
    // Real Play persists only the draft. It does not confirm or reroll on drop.
    for(const [width,height] of [[1366,900],[390,844]]) {
      await page.setViewportSize({width,height});await page.goto(base+'/backgammon/');
      await page.evaluate(async()=>{
        const st=await import('/backgammon/core/storage.mjs'),r=await import('/backgammon/core/rules.mjs');
        const {localConfig}=await import('/backgammon/core/play-session.mjs');
        const state=r.initialState({phase:'move',dice:[4,1],matchLength:0});
        st.saveSettings({interactionMode:'advanced',motion:'system',equityBar:false,boardTheme:{preset:'plum'}});
        await st.put('work',{id:'play',game:{id:'drag-live',initial:state,state,events:[],started:true,names:['You','Friend'],config:localConfig({mode:'local'})},draft:[]});
      });
      await page.goto(base+'/backgammon/play/#resume=drag-live');
      await page.locator('#confirm').waitFor();
      const a=await coord(12,true),b=await coord(8);
      await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:6});
      assert.equal(await page.locator('.drag-checker').count(),1);await shot(`live-drag-${width}`);
      await page.mouse.up();
      await page.waitForFunction(async()=>{const v=await(await import('/backgammon/core/storage.mjs')).get('work','play');return v.draft.length===1;});
      const q=await coord(5,true);await page.mouse.click(q.x,q.y);
      await page.waitForFunction(async()=>{const v=await(await import('/backgammon/core/storage.mjs')).get('work','play');return v.draft.length===2;});
      await page.waitForTimeout(600);await shot(`live-amber-${width}`);
      assert.equal(await page.locator('.draft-undo-checker').count(),2);
      const stored=await page.evaluate(async()=>await(await import('/backgammon/core/storage.mjs')).get('work','play'));
      assert.equal(stored.game.events.length,0);assert.deepEqual(stored.game.state.dice,[4,1]);
    }
    assert.deepEqual(errors,[]);
    return {screenshots:shots,checks:['amber matches click-to-undo','forced/preview/beginner exclusions','actual source hidden','nearest legal release','blocked/outside drops','Escape cancellation','both modes/orientations/players','compressed/bar/off stacks','mid-drag redraw','desktop and mobile layout',...(name==='chromium'?['Chromium native touch']:[])]};
  } finally {await ctx.close();}
};
