const assert = require('node:assert/strict');
const path = require('node:path');

module.exports = async function highlightMotion(browser, base, out, name) {
  const report = [];
  for (const touch of [false, true]) {
    const context = await browser.newContext({ viewport: touch ? {width:390,height:844} : {width:1366,height:768},
      hasTouch: touch, serviceWorkers:'block', reducedMotion:'no-preference' });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    try {
      await page.addInitScript(() => {
        const animate = Element.prototype.animate;
        Element.prototype.animate = function(frames, options) {
          const result = animate.call(this, frames, options);
          if (options?.id === 'board-highlight') { result.pause(); result.currentTime = 0; }
          return result;
        };
      });
      await page.goto(base + '/backgammon/');
      await page.waitForFunction(() => document.documentElement.dataset.appReady === 'true');
      await page.evaluate(async () => {
        const {shell,DraftBoard} = await import('/backgammon/ui/shell.mjs');
        const r = await import('/backgammon/core/rules.mjs'), st = await import('/backgammon/core/storage.mjs');
        st.saveSettings({interactionMode:'beginner',motion:'system',moveHints:true});
        const d = new DraftBoard(shell('trainer','Practice').board); d.shortcutsEnabled = true;
        const {installPlayShortcuts} = await import('/backgammon/ui/shortcuts.mjs');
        installPlayShortcuts({phase:()=>d.state.phase,point:p=>d.point(p),run:action=>{
          if(action==='swap') d.switchDice(); else if(action==='undo') d.undo();
          else if(action==='reset') d.reset(); else return false;
        }});
        window.hm = {r,st,d};
        const s = r.initialState({phase:'move',dice:[4,1]}); d.set(s,r.legalPaths(s));
      });
      const read = () => page.locator('#board [data-highlight]').evaluateAll(nodes => nodes.map(n => {
        const a = n.getAnimations().find(a => a.id === 'board-highlight');
        return {key:n.dataset.highlight,exit:n.hasAttribute('data-highlight-exit'),opacity:+getComputedStyle(n).opacity,
          visible:getComputedStyle(n).display !== 'none', pointer:getComputedStyle(n).pointerEvents,
          frames:a?.effect.getKeyframes().map(f=>+f.opacity)};
      }));
      const seek = ms => page.evaluate(ms => {
        document.getAnimations().filter(a=>a.id==='board-highlight').forEach(a=>a.currentTime=ms);
      },ms);
      const finish = async () => {
        await page.evaluate(() => document.getAnimations().filter(a=>a.id==='board-highlight').forEach(a=>a.finish()));
        await page.waitForFunction(() => !document.querySelector('[data-highlight-exit]'));
      };
      const tap = async (point, disc=false) => {
        const pos = await page.evaluate(({point,disc})=>{
          const group = document.querySelector(`#board [data-point="${point}"]`);
          const n=group.querySelector(disc?'.checker > circle':'.point-hit');
          const p=new DOMPoint(+n.getAttribute(disc?'cx':'x')+(disc?0:25),
            +n.getAttribute(disc?'cy':'y')+(disc?0:+n.getAttribute('height')/2)).matrixTransform(document.querySelector('#board svg').getScreenCTM());
          return {x:p.x,y:p.y};
        },{point,disc});
        if(touch) await page.touchscreen.tap(pos.x,pos.y); else await page.mouse.click(pos.x,pos.y);
      };
      await finish();
      await tap(12,true);
      assert.equal(await page.evaluate(()=>hm.d.selected),12,'checker selects immediately');
      let items = await read();
      const selected = items.find(n=>n.key==='12:source-ring:0'&&!n.exit);
      assert.deepEqual(selected.frames,[0,1],'solid selected ring fades in');
      assert.ok(items.some(n=>n.exit&&n.frames[0]===1&&n.frames[1]===0),'old available/checker highlights fade out');
      assert.ok(items.filter(n=>n.key.includes('destination')).every(n=>n.frames?.[0]===0),'destination labels fade with their targets');
      assert.ok(items.every(n=>n.pointer==='none'),'visual effects never intercept taps');
      await seek(90);
      items = await read();
      assert.ok(items.some(n=>n.exit&&n.opacity>0&&n.opacity<1));
      assert.ok(items.some(n=>!n.exit&&n.opacity>0&&n.opacity<1));
      await page.screenshot({path:path.join(out,`${name}-highlight-selection-${touch?'phone':'desktop'}.png`)});
      const oldRing = items.find(n=>n.key==='12:source-ring:0'&&n.exit);
      await tap(12,true);
      assert.equal(await page.evaluate(()=>hm.d.selected),null,'same checker deselects during the fade');
      const restored = (await read()).find(n=>n.key==='12:source-ring:0'&&!n.exit);
      assert.ok(Math.abs(restored.frames[0]-oldRing.opacity)<1e-6,'rapid deselection resumes the previous outline at its current opacity');
      await finish();
      await page.keyboard.press('s');
      assert.equal(await page.evaluate(()=>hm.d.preferred),1,'S switches the preferred die');
      assert.ok((await read()).every(n=>!n.frames),'switching dice does not pulse unchanged legal destinations');
      await tap(12,true); await finish();
      await tap(8); // 13/9 with the 4; destination remains live during visual transitions.
      assert.deepEqual(await page.evaluate(()=>hm.d.draft),[{from:12,to:8,die:4}]);
      await seek(90);
      await page.keyboard.press('z');
      assert.equal(await page.evaluate(()=>hm.d.draft.length),0,'undo applies immediately');
      assert.ok((await read()).some(n=>n.frames),'undo animates the restored legal overview');
      await seek(90);
      await page.screenshot({path:path.join(out,`${name}-highlight-undo-${touch?'phone':'desktop'}.png`)});
      await finish();
      await page.evaluate(()=>hm.d.render());
      assert.ok((await read()).every(n=>!n.frames),'an unchanged render does not restart settled highlights');

      // Hints off retains just the selected checker; disappearing assistance fades.
      await tap(12,true); await finish();
      await page.evaluate(()=>{hm.st.saveSettings({moveHints:false});hm.d.render();});
      assert.ok((await read()).some(n=>n.exit),'hiding assistance fades its old fragments');
      await finish();
      assert.deepEqual((await read()).filter(n=>n.visible).map(n=>n.key),['12:source-ring:0']);
      await tap(12,true); await seek(90);
      await page.emulateMedia({reducedMotion:'reduce'});
      await page.waitForFunction(()=>!document.querySelector('[data-highlight-exit]'));
      assert.ok((await read()).every(n=>!n.frames),'reduced motion cancels in-flight highlights');
      await tap(12,true);
      assert.ok((await read()).every(n=>!n.frames),'reduced-motion selection is immediate');
      await page.emulateMedia({reducedMotion:'no-preference'});
      await page.evaluate(()=>{hm.st.saveSettings({moveHints:true});hm.d.render();}); await finish();

      // Bar entry and bearoff use the same accents, including undo back to bar.
      for (const kind of ['bar','off','doubles']) {
        await page.evaluate(kind=>{
          const {r,d}=hm, s=r.initialState({phase:'move',dice:kind==='doubles'?[3,3]:[4,1]});
          if(kind==='bar'){s.points[23]--;s.bar[0]++;}
          if(kind==='off'){s.points=Array(24).fill(0);s.points[3]=3;s.points[1]=12;s.points[20]=-15;}
          r.assertState(s);d.set(s,r.legalPaths(s));
        },kind); await finish();
        if(kind==='bar') {
          await tap(23); await finish();
          assert.ok((await read()).some(n=>n.key==='bar0:point-accent:0'&&n.visible),'bar return has a dedicated visual accent');
        } else if(kind==='off') {
          assert.ok((await read()).some(n=>n.key==='off0:point-accent:0'&&n.visible),'bearoff has a dedicated visual accent');
          await tap('off0'); await finish();
        } else { await tap(12,true); await tap(9); await finish(); }
        await page.keyboard.press('z'); await seek(90);
        assert.ok((await read()).some(n=>n.frames),`${kind} undo animates highlights`);
        await finish();
      }
      // Rapid input must not accumulate stale decorative copies or pause rules.
      const stress = await page.evaluate(() => {
        const {r,d}=hm, s=r.initialState({phase:'move',dice:[4,1]});d.set(s,r.legalPaths(s));
        let maxFragments=0;const elapsed=[];
        for(let i=0;i<30;i++) {
          const start=performance.now();d.selected=i%2===0?12:null;d.render();elapsed.push(performance.now()-start);
          document.getAnimations().filter(a=>a.id==='board-highlight').forEach(a=>a.currentTime=60);
          maxFragments=Math.max(maxFragments,document.querySelectorAll('#board [data-highlight]').length);
        }
        elapsed.sort((a,b)=>a-b);
        return {maxFragments,medianRenderMs:elapsed[15],maxRenderMs:elapsed.at(-1)};
      });
      assert.ok(stress.maxFragments<120,'rapid toggles keep a bounded set of decorative fragments');
      await finish();
      // Let animations finish on their own once; exits must not collect in the DOM.
      await tap(12,true);
      await page.evaluate(()=>document.getAnimations().filter(a=>a.id==='board-highlight').forEach(a=>a.play()));
      await page.waitForFunction(()=>!document.querySelector('[data-highlight-exit]'));
      await page.waitForFunction(()=>!document.getAnimations().some(a=>a.id==='board-highlight'));
      assert.deepEqual(errors,[]);
      report.push({touch,selection:true,interruption:true,diceSwitch:true,undo:true,hintsOff:true,
        bar:true,bearoff:true,doubles:true,reducedMotion:true,cleanup:true,...stress});
    } finally {await context.close();}
  }
  return report;
};
