const assert=require('node:assert/strict'),path=require('node:path');
const returnFixture=require('./fixtures/origin-return.json');
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
      const tapPoint=async(point,zone='tip')=>{
        const position=await page.evaluate(({point,zone})=>{
          const b=targets.d.board,g=b.svg.querySelector(`[data-point="${point}"]`);
          const hit=g.querySelector(zone==='number'?'.point-number-hit':'.point-hit');
          const y=+hit.getAttribute('y');
          const p=new DOMPoint(+hit.getAttribute('x')+30,zone==='number'?y+14:y<330?285:375)
            .matrixTransform(b.svg.getScreenCTM());return{x:p.x,y:p.y};
        },{point,zone});
        if(touch&&name!=='firefox')await page.touchscreen.tap(position.x,position.y);
        else await page.mouse.click(position.x,position.y);
      };
      const tapChecker=async point=>{
        const q=await page.evaluate(point=>{
          const svg=targets.d.board.svg,c=[...svg.querySelectorAll(`[data-point="${point}"] > .checker > circle:first-child`)].at(-1);
          const p=new DOMPoint(+c.getAttribute('cx'),+c.getAttribute('cy')).matrixTransform(svg.getScreenCTM());return{x:p.x,y:p.y};
        },point);
        if(touch&&name!=='firefox')await page.touchscreen.tap(q.x,q.y);else await page.mouse.click(q.x,q.y);
      };
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
      // The open point and number lane extend an otherwise inactive resident
      // checker target. Beginner retains selection; Advanced plays one die.
      for(const mode of ['advanced','beginner'])for(const turn of [0,1])
        for(const orientation of [0,1])for(const zone of ['tip','number']){
          await fixture(mode,orientation);
          await page.evaluate(turn=>{const{d,rules:r}=targets;const s=r.initialState({phase:'move',dice:[4,1],turn});d.set(s,r.legalPaths(s));},turn);
          const point=turn?11:12;
          await tapPoint(point,zone);
          const outcome=await page.evaluate(()=>({draft:targets.d.draft,selected:targets.d.selected}));
          if(mode==='advanced')assert.deepEqual(outcome.draft,[{from:point,to:point+(turn?4:-4),die:4}],`${zone} plays resident, player ${turn}, orientation ${orientation}`);
          else{assert.deepEqual(outcome.draft,[]);assert.equal(outcome.selected,point);}
          await tapPoint(point,zone);
          assert.equal(await page.evaluate(()=>targets.d.draft.length),0,'original-location undo keeps priority after a point fallback move');
          if(mode==='beginner')assert.equal(await page.evaluate(()=>targets.d.selected),null,'second Beginner tap deselects');
          results.push({touch,mode,turn,orientation,zone,pointFallback:true});
        }
      await fixture('advanced',0);
      await page.evaluate(()=>{
        const{d,rules:r}=targets,points=Array(24).fill(0);points[12]=2;points[5]=13;points[8]=-2;points[23]=-13;
        const s=r.initialState({phase:'move',dice:[4,1],points});d.set(s,r.legalPaths(s));
      });
      await tapPoint(12);
      assert.deepEqual(await page.evaluate(()=>targets.d.draft),[{from:12,to:11,die:1}],'point fallback uses other die when needed');
      await page.evaluate(()=>{
        const{d,rules:r}=targets,points=Array(24).fill(0);points[12]=2;points[5]=13;points[23]=-15;
        const s=r.initialState({phase:'move',dice:[4,3],points});d.set(s,r.legalPaths(s));
      });
      await tapPoint(5);
      const arrival=await page.evaluate(()=>targets.d.draft);
      assert.equal(arrival.length,2);assert.equal(arrival[0].from,12);assert.equal(arrival.at(-1).to,5,'combined arrival wins over resident fallback');
      for(const turn of [0,1])for(const orientation of [0,1])for(const locked of [0,1,2]){
        await fixture('advanced',orientation);
        const draft=await page.evaluate(({fixture,turn,locked})=>{
          const {d,rules:r}=targets;let s=fixture.state;
          const p=n=>turn?23-n:n;
          if(turn)s={...s,turn,points:s.points.toReversed().map(n=>-n),bar:s.bar.toReversed(),off:s.off.toReversed()};
          d.set(s,r.legalPaths(s));d.draft=fixture.draft.map(m=>({...m,from:p(m.from),to:p(m.to)}));d.minDraft=locked;d.render();
          return d.draft;
        },{fixture:returnFixture,turn,locked});
        const point=turn?16:7;
        assert.equal(await page.locator(`[data-point="${point}"] .draft-undo-checker`).count(),locked===2?0:1,'amber cue matches single-step undo even after forced prefix');
        await tapChecker(point);
        assert.deepEqual(await page.evaluate(()=>targets.d.draft),locked===2?draft:draft.slice(0,1),'checker tap removes latest step only');
        if(locked<2){
          const previous=turn?13:10;
          assert.equal(await page.locator(`[data-point="${previous}"] > .checker`).count(),1,'checker lands at intermediate point');
          assert.equal(await page.locator(`[data-point="${point}"] > .checker`).count(),0);
          assert.equal(await page.locator('.board-die.consumed').count(),1,'one die restored');
        }
        results.push({touch,turn,orientation,locked,checkerStepUndo:true});
      }
      for(const count of [6,10,15])for(const orientation of [0,1]){
        await fixture('advanced',orientation);
        await page.evaluate(count=>{
          const{d,rules:r}=targets,points=Array(24).fill(0);points[12]=count;points[5]=-count;
          const s=r.initialState({phase:'move',dice:[4,1],points,off:[15-count,15-count]});d.set(s,r.legalPaths(s));
        },count);
        for(const point of [12,5]){
          const label=await page.locator(`[data-point="${point}"] > .checker text`).evaluate(n=>{
            const c=n.parentNode.querySelector('circle'),b=n.getBBox();
            return{text:n.textContent,x:+n.getAttribute('x'),y:+n.getAttribute('y'),cx:+c.getAttribute('cx'),cy:+c.getAttribute('cy'),anchor:n.getAttribute('text-anchor'),baseline:n.getAttribute('dominant-baseline'),dx:b.x+b.width/2- +c.getAttribute('cx'),dy:b.y+b.height/2- +c.getAttribute('cy')};
          });
          assert.equal(label.text,String(count));assert.equal(label.x,label.cx);assert.equal(label.y,label.cy);
          assert.equal(label.anchor,'middle');assert.equal(label.baseline,'central');
          assert.ok(Math.abs(label.dx)<1&&Math.abs(label.dy)<1,`centered label ${JSON.stringify(label)}`);
        }
        if(!orientation&&count!==6)await page.locator('.bg-board').screenshot({path:path.join(out,`${name}-centered-stack-${count}-${touch?'phone':'desktop'}.png`)});
        results.push({touch,count,orientation,centeredCount:true});
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
