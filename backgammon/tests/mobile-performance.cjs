const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Real mobile-sized SVG, full motion, real tap events. CPU throttling is a
// reproducible stress test, not a claim to emulate a particular phone chipset.
module.exports = async function mobilePerformance(browser, base, out, name) {
  const context = await browser.newContext({viewport:{width:390,height:844}, hasTouch:true,
    serviceWorkers:'block', reducedMotion:'no-preference'});
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const cdp = name === 'chromium' ? await context.newCDPSession(page) : null;
  try {
    await page.goto(base + '/backgammon/');
    await page.waitForFunction(() => document.documentElement.dataset.appReady === 'true');
    await page.evaluate(async () => {
      const {shell,DraftBoard} = await import('/backgammon/ui/shell.mjs');
      const r = await import('/backgammon/core/rules.mjs'), st = await import('/backgammon/core/storage.mjs');
      st.saveSettings({interactionMode:'advanced',motion:'system',moveHints:true,sound:{enabled:true,volume:50}});
      const d = new DraftBoard(shell('trainer','Practice').board);
      const s = r.initialState({phase:'move',dice:[4,1]}); d.set(s,r.legalPaths(s));
      const perf = window.mobilePerf = {d,r,st,renders:[],frames:[],actions:[],running:true};
      const render = d.board.render;
      d.board.render = function(...args) {
        const start=performance.now(); const result=render.apply(this,args);
        perf.renders.push(performance.now()-start); return result;
      };
      document.addEventListener('click', () => {
        const at=performance.now(); requestAnimationFrame(()=>perf.actions.push(performance.now()-at));
      },true);
      let last=performance.now();
      const frame = now => {if (!perf.running) return; perf.frames.push(now-last); last=now; requestAnimationFrame(frame);};
      requestAnimationFrame(frame);
    });
    await page.waitForTimeout(500);
    if(cdp) {
      await cdp.send('Emulation.setCPUThrottlingRate',{rate:6});
      await cdp.send('Performance.enable');
      if(process.env.BG_PROFILE) {await cdp.send('Profiler.enable'); await cdp.send('Profiler.start');}
    }
    const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
    const before=cdp ? await metrics() : {};
    await page.evaluate(()=>{mobilePerf.renders=[]; mobilePerf.frames=[];});
    for(let i=0;i<12;i++) {
      // Switch on an untouched roll, then move and undo using the actual die.
      if(i%3===0) {
        await page.evaluate(()=>mobilePerf.stationary=document.querySelector('#board [data-point="17"]'));
        await page.locator('#board .dice-switch').tap();
        if(!process.env.BG_PERF_BASELINE) assert.ok(await page.evaluate(()=>mobilePerf.stationary===document.querySelector('#board [data-point="17"]')),
          'switching dice keeps the checker board mounted');
      }
      else if(i%3===1) {
        await page.evaluate(()=>mobilePerf.stationary=document.querySelector('#board [data-point="17"]'));
        const pos=await page.locator('#board [data-point="12"] .checker').first().boundingBox();
        await page.touchscreen.tap(pos.x+pos.width/2,pos.y+pos.height/2);
        assert.equal(await page.evaluate(()=>mobilePerf.d.draft.length),1);
        if(!process.env.BG_PERF_BASELINE) assert.ok(await page.evaluate(()=>mobilePerf.stationary===document.querySelector('#board [data-point="17"]')),
          'moving a checker preserves unrelated stacks');
      } else {
        await page.locator('#board .board-die[data-status="used"]').tap();
        assert.equal(await page.evaluate(()=>mobilePerf.d.draft.length),0);
      }
      await page.waitForTimeout(400);
    }
    const after=cdp ? await metrics() : {};
    const report=await page.evaluate(()=>{
      mobilePerf.running=false;
      const stats=values=>{const v=[...values].sort((a,b)=>a-b);return {count:v.length,median:v[Math.floor(v.length*.5)],p95:v[Math.floor(v.length*.95)],max:v.at(-1)};};
      return {tapToFrameMs:stats(mobilePerf.actions),renderMs:stats(mobilePerf.renders),frameMs:stats(mobilePerf.frames),framesOver50ms:mobilePerf.frames.filter(v=>v>50).length};
    });
    report.cpuSlowdown=cdp ? 6 : 1;
    report.styleRecalculations=(after.RecalcStyleCount||0)-(before.RecalcStyleCount||0);
    report.styleMs=((after.RecalcStyleDuration||0)-(before.RecalcStyleDuration||0))*1000;
    report.layoutMs=((after.LayoutDuration||0)-(before.LayoutDuration||0))*1000;
    if(cdp && process.env.BG_PROFILE) fs.writeFileSync(path.join(out,'mobile-performance.cpuprofile'),JSON.stringify((await cdp.send('Profiler.stop')).profile));
    // Functional stress cases use full motion on the same mobile surface.
    // Keep these separate from the timed workload above for comparable reports.
    report.scenarios=[];
    for(const scenario of ['double','bearoff','beginner']) {
      await page.evaluate(scenario=>{
        const {d,r,st}=mobilePerf;
        st.saveSettings({interactionMode:scenario==='beginner'?'beginner':'advanced'});
        const options={phase:'move',dice:scenario==='double'?[3,3]:[4,1]};
        if(scenario==='bearoff') Object.assign(options,{
          points:[2,2,2,3,2,4,...Array(12).fill(0),-4,-2,-3,-2,-2,-2],bar:[0,0],off:[0,0]});
        const state=r.initialState(options); d.set(state,r.legalPaths(state));
      },scenario);
      for(let turn=0;turn<3;turn++) {
        const source=await page.evaluate(()=>mobilePerf.d.candidates()[0].from);
        const box=await page.locator(`#board [data-point="${source}"] .checker`).last().boundingBox();
        await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);
        if(scenario==='beginner') {
          const target=await page.evaluate(()=>{
            const {d}=mobilePerf, to=d.routes().find(r=>!r.undo).to;
            const hit=d.board.svg.querySelector(`[data-point="${to}"] .point-hit`);
            const xy=new DOMPoint(+hit.getAttribute('x')+25,+hit.getAttribute('y')+(+hit.getAttribute('height'))/2).matrixTransform(d.board.svg.getScreenCTM());
            return {x:xy.x,y:xy.y};
          });
          await page.touchscreen.tap(target.x,target.y);
        }
        assert.equal(await page.evaluate(()=>mobilePerf.d.draft.length),1);
        await page.waitForTimeout(100);
        await page.locator('#board .board-die[data-draft-index]').first().tap();
        assert.equal(await page.evaluate(()=>mobilePerf.d.draft.length),0);
      }
      report.scenarios.push(scenario);
    }
    // Absolute timings are recorded, not brittle CI limits: other work can
    // saturate the host. Assert bounded DOM and stable-node reuse instead.
    assert.ok(await page.locator('#board [data-highlight-exit]').count()<120);
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify(report));
    return report;
  } finally {await context.close();}
};
