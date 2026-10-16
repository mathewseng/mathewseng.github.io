const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async function checkerTargets(browser,base,out,name){
  const results=[];
  for(const touch of [false,true]){
    const context=await browser.newContext({viewport:touch?{width:390,height:844}:{width:1366,height:768},hasTouch:touch && name!=='firefox',serviceWorkers:'block'});
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    try{
      await page.goto(base+'/backgammon/');
      await page.evaluate(async()=>{
        const {shell,DraftBoard}=await import('/backgammon/ui/shell.mjs');
        const rules=await import('/backgammon/core/rules.mjs'),storage=await import('/backgammon/core/storage.mjs');
        const ui=shell('trainer','Checker targets');window.targets={d:new DraftBoard(ui.board),rules,storage};
      });
      const fixture=async(mode,orientation,count=0,motion='reduce')=>page.evaluate(({mode,orientation,count,motion})=>{
        const {d,rules:r,storage:st}=targets;st.saveSettings({interactionMode:mode,orientation,motion,moveHints:false,equityBar:false});
        document.documentElement.dataset.motion=motion;
        let s=r.initialState({phase:'move',dice:[4,1]});
        if(count){const points=Array(24).fill(0);points[12]=15-count;points[8]=count;points[23]=-15;s=r.initialState({phase:'move',dice:[4,1],points});}
        d.set(s,r.legalPaths(s));d.board.suppressClickUntil=0;
      },{mode,orientation,count,motion});
      const coordinates=()=>page.evaluate(()=>{
        const b=targets.d.board,n=b.svg.querySelector('[data-point="12"] > .checker > circle'),hit=b.svg.querySelector('[data-point="8"] .point-hit');
        const project=(x,y)=>{const p=new DOMPoint(x,y).matrixTransform(b.svg.getScreenCTM());return{x:p.x,y:p.y};};
        const y=+hit.getAttribute('y'),h=+hit.getAttribute('height');
        return{start:project(+n.getAttribute('cx')+27,+n.getAttribute('cy')+12),end:project(+hit.getAttribute('x')+30,y+(y<300?h-18:18))};
      });
      for(const mode of ['advanced','beginner'])for(const orientation of [0,1]){
        await fixture(mode,orientation);
        let {start,end}=await coordinates();
        if(touch && name!=='firefox')await page.touchscreen.tap(start.x,start.y);else await page.mouse.click(start.x,start.y);
        assert.equal(await page.evaluate(()=>targets.d.selected===12 || targets.d.draft[0]?.from===12),true,'outside disc edge still activates that checker');
        await fixture(mode,orientation);({start,end}=await coordinates());
        // Actual mouse path on both viewport sizes; native touch path is also
        // covered in drag-feedback. Firefox touch emulation suppresses mouse
        // pointer events, so its small-screen drag uses a mouse-capable context. The same enlarged SVG hit region is used.
        await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:8});
        assert.equal(await page.locator('.drag-checker').count(),1,JSON.stringify({message:'near-edge drag picks up the checker',touch,mode,orientation,start,end,state:await page.evaluate(()=>({pointer:targets.d.board.pointer,selected:targets.d.selected,draft:targets.d.draft,enabled:targets.d.enabled}))}));
        assert.equal(await page.locator('.bg-board.no-move-hints').count(),0,'drag shows targets even with hints disabled');
        const highlighted=await page.evaluate(()=>{
          const {d}=targets;return d.routes().every(r=>{
            const raw=typeof r.to==='number'?r.to:r.to+d.state.turn;
            return d.board.svg.querySelector(`[data-point="${raw}"]`)?.classList.contains('destination');
          });
        });
        assert.equal(highlighted,true,'every legal route endpoint is highlighted');
        if(mode==='advanced'&&!orientation)await page.screenshot({path:path.join(out,`${name}-drag-targets-${touch?'phone':'desktop'}.png`)});
        await page.mouse.up();
        assert.equal(await page.locator('.bg-board.no-move-hints').count(),1,'release restores hint preference');
        assert.equal(await page.evaluate(()=>targets.d.draft[0]?.to),8);
        results.push({touch,mode,orientation,expandedTarget:true,dragHighlights:true});
      }
      for(const count of [5,8]){
        await fixture('advanced',0,count,'full');
        await page.evaluate(()=>{
          targets.d.move({from:12,to:8,die:4});
          window.flight=targets.d.board.svg.querySelector('.moving-checker');
          window.flightAnimation=flight.getAnimations()[0];flightAnimation.pause();flightAnimation.currentTime=0;
        });
        const cap=await page.locator('[data-point="8"] .arrival-resident').evaluate(n=>({opacity:getComputedStyle(n).opacity,count:n.querySelector('text')?.textContent||null}));
        assert.deepEqual(cap,{opacity:'1',count:count===5?null:String(count)},'old cap stays opaque with its original count');
        await page.evaluate(()=>{flightAnimation.currentTime=flightAnimation.effect.getTiming().duration*.5;});
        assert.equal(await page.locator('[data-point="8"] .arrival-resident').evaluate(n=>getComputedStyle(n).opacity),'1');
        await page.screenshot({path:path.join(out,`${name}-stack-arrival-${count}-${touch?'phone':'desktop'}.png`)});
        await page.evaluate(()=>flightAnimation.finish());
        await page.waitForFunction(()=>!document.querySelector('.moving-checker'));
        assert.equal(await page.locator('.arrival-resident').count(),0);
        assert.equal(await page.locator('[data-point="8"] > .checker').count(),5);
        assert.equal(await page.locator('[data-point="8"] > .checker text').textContent(),String(count+1));
      }
      // A real drop plus an unrelated redraw preserves the old stack cap and
      // both landing sprites until touchdown, then leaves exactly five discs.
      await fixture('advanced',0,8,'full');
      const {start,end}=await coordinates();await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:8});
      await page.waitForTimeout(220);
      await page.evaluate(()=>targets.d.board.svg.addEventListener('pointerup',()=>{
        window.flight=targets.d.board.svg.querySelector('.moving-checker');window.flightAnimation=flight.getAnimations()[0];flightAnimation.pause();flightAnimation.currentTime=100;
      },{once:true}));
      await page.mouse.up();
      await page.evaluate(()=>targets.d.render());
      assert.equal(await page.locator('.arrival-resident').count(),1);
      assert.equal(await page.locator('.arrival-resident text').textContent(),'8');
      await page.evaluate(()=>flightAnimation.finish());await page.waitForFunction(()=>!document.querySelector('.moving-checker'));
      assert.equal(await page.locator('.arrival-resident').count(),0);
      assert.equal(await page.locator('[data-point="8"] > .checker text').textContent(),'9');
      assert.deepEqual(errors,[]);
    }finally{await context.close();}
  }
  return results;
};
