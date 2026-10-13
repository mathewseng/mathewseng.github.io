const assert = require('node:assert/strict');
const path = require('node:path');
// Real Play resume, original committed roll, and an isolated analysis dialog.
module.exports = async function moveArrows(browser, base, out, name) {
  const context = await browser.newContext({ serviceWorkers:'block', reducedMotion:'reduce', hasTouch:true });
  const page = await context.newPage(), errors=[], screenshots=[];
  page.on('pageerror', e=>errors.push(e.message));
  const readGame = () => page.evaluate(async()=> {
    const g=(await (await import('/backgammon/core/storage.mjs')).get('work','play')).game;
    // Background review may append evaluations; it must not alter live play.
    return JSON.stringify({initial:g.initial,state:g.state,id:g.id,names:g.names,
      events:g.events.map(e=>({actor:e.actor,action:e.action}))});
  });
  try {
    await page.goto(base+'/backgammon/');
    const id=await page.evaluate(async()=>{
      const r=await import('/backgammon/core/rules.mjs');
      const {playAction}=await import('/backgammon/core/table.mjs');
      const st=await import('/backgammon/core/storage.mjs');
      const initial=r.initialState({phase:'move',turn:1,dice:[3,1],matchLength:0});
      const steps=r.legalPaths(initial).find(p=>p.steps[0].to===p.steps[1].from).steps;
      const game=playAction({id:'arrow-preview',initial,state:initial,events:[],started:true,
        names:['You','GNUbg'],config:{mode:'computer',humanSide:0,strength:'quick',tutor:false,matchLength:0,rules:initial.rules}}, {type:'move',steps});
      await st.put('work',{id:'play',game,draft:[],positionKey:r.positionKey(game.state)});
      st.saveSettings({motion:'reduce',equityBar:false,boardTheme:{preset:'plum'}});
      return game.id;
    });
    for(const preset of ['plum','linen']) {
      await page.goto(base+'/backgammon/');
      await page.evaluate(async preset=>(await import('/backgammon/core/storage.mjs')).saveSettings({boardTheme:{preset}}),preset);
      await page.goto(base+'/backgammon/play/#resume='+id);
      await page.locator('#board.roll-ready').waitFor();
      assert.ok(await page.locator('#board .last-move-arrow').count()>0);
      const rings=await page.locator('#board circle[stroke-dasharray]').evaluateAll(ns=>ns.map(n=>({length:Number(n.getAttribute('pathLength')), dash:n.getAttribute('stroke-dasharray').split(' ').map(Number),cap:n.getAttribute('stroke-linecap')})));
      assert.ok(rings.length);
      for(const ring of rings) {assert.equal(ring.length % (ring.dash[0]+ring.dash[1]),0);assert.equal(ring.cap,'round');}
      const saved=await readGame();
      for(const [width,height] of [[390,844],[844,390],[1366,768]]) {
        await page.setViewportSize({width,height});
        const geometry=await page.locator('#board .move-arrow-line').evaluateAll(paths=>paths.map(p=>{
          const length=p.getTotalLength(), q=p.getPointAtLength(length/2), screen=q.matrixTransform(p.getScreenCTM());
          const hit=document.elementFromPoint(screen.x,screen.y);
          return {length,intercept:!!hit?.closest('.last-move-arrows')};
        }));
        assert.ok(geometry.every(g=>g.length>0&&!g.intercept),'arrows never own board hits');
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
        const file=`${name}-move-arrows-play-${preset}-${width}.png`;
        await page.screenshot({path:path.join(out,file),animations:'disabled'});screenshots.push(file);
      }
      assert.equal(await readGame(),saved);
      // Opening a hint/result uses a second shared board with its own mask id.
      await page.evaluate(async()=>{
        const {initialState}=await import('/backgammon/core/rules.mjs');
        const {EngineClient}=await import('/backgammon/engine/client.mjs');
        const {decisionReview}=await import('/backgammon/ui/decision-review.mjs');
        const source=initialState({phase:'move',dice:[3,1]}),engine=new EngineClient();
        try {const result=await engine.analyze(source,{preset:'quick'});
          decisionReview(source).result({...result,actual:result.candidates[0]});
        } finally {engine.destroy();}
      });
      assert.match(await page.locator('.decision-caption').textContent(),/^Best\/your move ·/);
      assert.equal(await page.locator('.decision-choices button').count(),2);
      const ids=await page.locator('.last-move-arrows mask').evaluateAll(ns=>ns.map(n=>n.id));
      assert.ok(ids.length>=2);assert.equal(new Set(ids).size,ids.length);
      for(const [width,height] of [[390,844],[1366,768]]) {
        await page.setViewportSize({width,height});
        await page.getByRole('button',{name:'Board',exact:true}).click();
        const file=`${name}-move-arrows-review-${preset}-${width}.png`;
        await page.screenshot({path:path.join(out,file),animations:'disabled'});screenshots.push(file);
      }
      await page.getByRole('button',{name:'Position',exact:true}).click();
      assert.equal(await page.locator('.decision-board .last-move-arrow').count(),0);
      assert.ok(await page.locator('#board .last-move-arrow').count()>0);
      await page.keyboard.press('Escape');
      assert.equal(await readGame(),saved);
    }
    // The reported two-transfer layout: one cross-board move and one move
    // around the occupied six-point stack, in both orientations.
    await page.goto(base+'/backgammon/');
    await page.evaluate(async()=>{
      const r=await import('/backgammon/core/rules.mjs'),{moveTrace}=await import('/backgammon/core/move-trace.mjs');
      const {Board}=await import('/backgammon/ui/board.mjs');
      const source=r.initialState({phase:'move',turn:1,dice:[3,6]});
      const steps=[{from:11,to:14,die:3},{from:0,to:6,die:6}];
      const state=steps.reduce((s,step)=>r.applyStep(s,step),source),trace=moveTrace(state,1,steps,source.dice);
      document.body.replaceChildren();const slot=document.createElement('div');slot.style.cssText='width:min(100%,1100px);margin:auto';document.body.append(slot);
      new Board(slot).render(state,{interactive:false,numbers:true,orientation:0,lastMove:trace});
    });
    await page.setViewportSize({width:1440,height:1000});
    const file=`${name}-move-arrows-reported-stack.png`;
    await page.screenshot({path:path.join(out,file),animations:'disabled'});screenshots.push(file);
    assert.equal(await page.locator('.last-move-arrow').count(),2);
    assert.deepEqual(errors,[]);
    return {browser:name,screenshots,isolated:true,pointerTransparent:true};
  }finally{await context.close();}
};
