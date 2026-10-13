const assert = require('node:assert/strict');
const path = require('node:path');
module.exports = async function controlPolish(browser, base, out, name) {
  const context = await browser.newContext({viewport:{width:1366,height:768},serviceWorkers:'block'});
  const page = await context.newPage(), errors = [], report = {layouts:[],motion:[]};
  page.on('pageerror', e=>errors.push(e.message));
  const ready = ()=>page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
  try {
    await page.goto(base+'/backgammon/play/');await ready();
    await page.evaluate(async()=>{
      const {put,saveSettings}=await import('/backgammon/core/storage.mjs');
      const {initialState}=await import('/backgammon/core/rules.mjs');
      const {localConfig}=await import('/backgammon/core/play-session.mjs');
      const s=initialState({phase:'move',dice:[4,1]});
      saveSettings({interactionMode:'advanced',motion:'system'});
      await put('work',{id:'play',game:{id:'control-polish',initial:s,state:s,events:[],started:true,names:['You','Friend'],config:localConfig({mode:'local'})},draft:[]});
    });
    await page.reload();await ready();await page.locator('#resume-match').click();
    assert.equal(await page.locator('.board-undo #undo').count(),1);
    assert.equal(await page.locator('.board-undo #reset-draft').count(),1);
    assert.equal(await page.locator('.action-help #undo').count(),0);
    assert.equal(await page.locator('#board .point-shortcut .keycap-face').count(),24);
    assert.equal(await page.locator('#board .point-shortcut .keycap-label').count(),24);
    assert.equal(await page.locator('#undo .keycap-art').count(),1);
    // An ordinary game shortcut should never leave the browser focus halo.
    await page.keyboard.press('1');
    report.motion = await page.locator('.moving-checker').evaluateAll(nodes=>nodes.flatMap(n=>n.getAnimations().map(a=>({duration:a.effect.getTiming().duration,frames:a.effect.getKeyframes().length}))));
    assert.ok(report.motion.some(m=>m.duration===460&&m.frames>=24),'slower sampled checker animation is running');
    await page.evaluate(()=>document.querySelector('#undo').focus());
    assert.equal(await page.locator('#undo').evaluate(n=>getComputedStyle(n).outlineStyle),'none');
    await page.locator('#undo').click();
    assert.equal(await page.locator('.board-die.consumed').count(),0,'undo interrupts animation safely');
    await page.keyboard.press('1');await page.keyboard.press('1');
    assert.equal(await page.locator('#reset-draft').isEnabled(),true);
    await page.locator('#reset-draft').click();
    assert.equal(await page.locator('.board-die.consumed').count(),0);
    // Explicit keyboard navigation still exposes a focus location.
    await page.locator('#preferences').focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(()=>document.documentElement.dataset.focusNavigation),'true');
    assert.equal(await page.evaluate(()=>{const n=document.activeElement;return getComputedStyle(n).outlineStyle!=='none'||(n.matches('.point')&&getComputedStyle(n.querySelector('.point-hit')).stroke!=='none');}),true);
    await page.locator('#player').click();
    assert.equal(await page.evaluate(()=>document.documentElement.dataset.focusNavigation),'false');
    await page.keyboard.press('Meta+a');
    assert.equal(await page.evaluate(()=>getSelection().toString()),'');
    const player=await page.locator('#player').boundingBox();
    await page.mouse.move(player.x+5,player.y+10);await page.mouse.down();await page.mouse.move(player.x+160,player.y+10,{steps:8});await page.mouse.up();
    assert.equal(await page.evaluate(()=>getSelection().toString()),'','dragging labels does not select text');
    await page.waitForFunction(()=>!document.querySelector('.moving-checker'));
    for (const [width,height] of [[320,568],[375,667],[390,844],[430,932],[844,390],[768,1024],[1024,768],[1366,768],[1440,900]]) {
      await page.setViewportSize({width,height});
      await page.waitForTimeout(70);
      const layout=await page.evaluate(()=>{
        const rect=s=>document.querySelector(s).getBoundingClientRect().toJSON();
        return {board:rect('#board > svg'),undo:rect('#undo'),reset:rect('#reset-draft'),confirm:rect('#confirm'),overflow:document.documentElement.scrollWidth>innerWidth+1};
      });
      assert.equal(layout.overflow,false,`horizontal overflow ${width}x${height}`);
      for(const key of ['undo','reset','confirm']){
        assert.ok(layout[key].width>=44&&layout[key].height>=44,`touch target ${key} ${width}`);
        assert.ok(layout[key].bottom<=height+2,`visible ${key} ${width}: ${JSON.stringify(layout)}`);
      }
      if(width>700 || height<501){
        assert.ok(layout.undo.right<=layout.board.left,'undo on left of board');
        assert.ok(layout.reset.right<=layout.board.left,'reset on left of board');
      } else {
        assert.ok(layout.undo.top>=layout.board.bottom-2,'portrait controls below full-width board');
        assert.ok(layout.reset.right<layout.confirm.left,'undo/reset to the left of confirm');
      }
      report.layouts.push({width,height,...layout});
      await page.screenshot({path:path.join(out,`${name}-controls-${width}x${height}.png`)});
    }
    // Form inputs remain editable despite blocking native selection on the UI.
    await page.setViewportSize({width:1366,height:768});
    await page.locator('#preferences').click();
    await page.getByRole('button',{name:'Keyboard',exact:true}).click();
    // Use the first shortcut field: labels describe the visible row, not canonical point IDs.
    const field=page.locator('.shortcut-points input').first();
    await field.fill('a');await field.selectText();
    assert.equal(await field.evaluate(n=>n.selectionEnd-n.selectionStart),1);
    await page.locator('dialog .close').click();
    const hitTiming = await page.evaluate(async()=>{
      const {Board}=await import('/backgammon/ui/board.mjs');
      const {initialState,applyStep}=await import('/backgammon/core/rules.mjs');
      const holder=document.createElement('div');holder.style.cssText='width:876px;height:660px';document.body.append(holder);
      const board=new Board(holder),points=Array(24).fill(0);points[5]=1;points[1]=-1;
      const before=initialState({phase:'move',dice:[4,1],points,off:[14,14]});
      const step={from:5,to:1,die:4},after=applyStep(before,step);
      board.render(after,{interactive:false});
      const finishedAt=board.animateMove(before,after,step);
      const flights=[...holder.querySelectorAll('.moving-checker')].flatMap(n=>n.getAnimations().map(a=>a.effect.getTiming()));
      board.destroy();holder.remove();
      return {finishedAt,finishes:flights.map(f=>f.duration+f.delay)};
    });
    assert.equal(hitTiming.finishes.length,2,'the hitter and hit checker both animate');
    assert.equal(hitTiming.finishedAt,Math.max(...hitTiming.finishes),'replay waits for hit checker to land');
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.keyboard.press('1');
    assert.equal(await page.locator('.moving-checker').count(),0,'reduced motion has no checker flight');
    assert.deepEqual(errors,[]);
    return report;
  } finally {await context.close();}
};
