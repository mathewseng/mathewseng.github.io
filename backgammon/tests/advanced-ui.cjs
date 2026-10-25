const { showPlayControls } = require("./play-helpers.cjs");
const assert = require('node:assert/strict'), path = require('node:path');
module.exports = async function advancedUI(browser,base,out,name='browser') {
  const report={cases:[],screenshots:[]};
  const ctx=await browser.newContext({viewport:{width:1366,height:768},serviceWorkers:'block'});
  const page=await ctx.newPage(), errors=[];page.on('pageerror',e=>errors.push(e.message));
  const ready=()=>page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
  try {
    await page.goto(base+'/backgammon/play/');await ready();
    assert.equal(await page.getByLabel('Computer strength',{exact:true}).inputValue(),'auto');
    assert.equal(await page.getByLabel('Hint & review strength',{exact:true}).inputValue(),'auto');
    assert.equal(await page.getByLabel('Show move feedback',{exact:true}).isChecked(),true);
    assert.equal(await page.getByLabel('Warn before confirming a costly move').isChecked(),true);
    assert.equal(await page.getByLabel('Automatic opening doubles',{exact:true}).inputValue(),'-1');
    assert.equal(await page.getByLabel('Immediate redoubles',{exact:true}).inputValue(),'2');
    assert.deepEqual(await page.getByLabel('Computer strength',{exact:true}).locator('option').evaluateAll(nodes=>nodes.map(node=>node.value)),
      ['auto','quick','standard','deep','expert','research','verify']);
    await page.locator('#preferences').click();
    assert.equal(await page.getByLabel('Playing style',{exact:true}).inputValue(),'advanced');
    await page.locator('dialog .close').click();
    report.cases.push('Auto / feedback / warning / rules / advanced defaults');
    // Animate two opening ties, then a winner. Source still uses committed cryptoDice.
    await page.evaluate(()=>{let i=0;const values=[1,1,3,3,5,0];crypto.getRandomValues=buffer=>{for(let j=0;j<buffer.length;j++)buffer[j]=values[i++]??0;return buffer;};});
    await page.getByRole('button',{name:'Same device',exact:true}).click();
    await page.evaluate(()=>{window.openingReveals=[];new MutationObserver(()=>{
      const n=document.querySelectorAll('.opening-player.revealed').length;
      if(n&&openingReveals.at(-1)!==n)openingReveals.push(n);
    }).observe(document.body,{subtree:true,attributes:true,attributeFilter:['class']});});
    await page.locator('#start-match').click();
    await page.waitForSelector('.opening-roll');
    assert.equal(await page.locator('#begin-turn').count(),0);
    assert.equal(await page.locator('#roll').count(),0);
    await page.waitForSelector('.opening-player.revealed');
    await page.screenshot({path:path.join(out,`${name}-opening-reveal.png`)});
    await page.waitForSelector('#confirm',{timeout:15000});
    assert.ok(await page.evaluate(()=>openingReveals.includes(1)&&openingReveals.includes(2)),
      'opening dice reveal separately, even if the test runner samples after both reveals');
    const stored=await page.evaluate(async()=>{const {get}=await import('/backgammon/core/storage.mjs');return (await get('work','play')).game;});
    assert.deepEqual(stored.events.slice(0,3).map(e=>e.action.dice),[[2,2],[4,4],[6,1]]);
    assert.equal(stored.state.cube.value,4);
    report.cases.push('automatic paced opening, repeated ties, committed dice');
    // Use an isolated real shared board to verify pointer, touch, keyboard,
    // blocked/forced dice and both modes without involving a bot timer.
    await page.goto(base+'/backgammon/');await ready();
    await page.evaluate(async()=>{
      const {shell,DraftBoard}=await import('/backgammon/ui/shell.mjs');
      const r=await import('/backgammon/core/rules.mjs'),st=await import('/backgammon/core/storage.mjs');
      const ui=shell('trainer','Interaction test');const d=new DraftBoard(ui.board);d.shortcutsEnabled=true;
      window.advancedTest={r,st,d};st.saveSettings({motion:'reduce',interactionMode:'advanced',equityBar:false});
      d.set(r.initialState({phase:'move',dice:[4,1]}),r.legalPaths(r.initialState({phase:'move',dice:[4,1]})));
    });
    const snapshot=()=>page.evaluate(()=>({draft:advancedTest.d.draft,selected:advancedTest.d.selected,die:advancedTest.d.activeDie()}));
    const tap=async(point,checker=false)=>{
      const p=await page.evaluate(({point,checker})=>{const el=document.querySelector(`[data-point="${point}"]`);
        const n=checker?el.querySelector('.checker > circle'):el.querySelector('.point-hit');
        const x=checker?+n.getAttribute('cx'):+n.getAttribute('x')+30;
        const y=checker?+n.getAttribute('cy'):+n.getAttribute('y')+130;
        const pt=new DOMPoint(x,y).matrixTransform(document.querySelector('#board svg').getScreenCTM());return{x:pt.x,y:pt.y};
      },{point,checker});await page.mouse.click(p.x,p.y);
    };
    await tap(12,true);assert.deepEqual((await snapshot()).draft,[{from:12,to:8,die:4}]);
    assert.equal((await snapshot()).selected,null);
    await page.evaluate(()=>advancedTest.d.switchDice());assert.equal((await snapshot()).draft.length,0);
    await page.evaluate(()=>advancedTest.d.switchDice());assert.equal((await snapshot()).die,1);
    await tap(4);assert.deepEqual((await snapshot()).draft,[{from:5,to:4,die:1}]);
    await tap(12,true);assert.equal((await snapshot()).draft.length,2);
    await tap(8,true);assert.equal((await snapshot()).draft.length,1,'exhausted moved checker goes back');
    assert.equal(await page.locator('#board .no-move-hints').count(),1);
    assert.equal(await page.locator('.point-shortcut').count(),24);
    for (const turn of [0,1]) {
      await page.evaluate(turn=>{const{d,r}=advancedTest;const points=Array(24).fill(0);points[7]=2;points[23]=-15;const s=r.initialState({phase:'move',dice:[4,3],turn,points:turn?points.reverse().map(n=>-n):points,off:turn?[0,13]:[13,0]});d.set(s,r.legalPaths(s));},turn);
      await tap(turn ? 23 : 0);
      assert.equal((await snapshot()).draft.length,2,'point-space click plays both dice');
      assert.equal(await page.locator('dialog[open]').count(),0,'equivalent quiet routes need no modal');
    }
    report.cases.push('both-dice destination clicks, both players, without route prompt');
    await page.evaluate(()=>{const {d,st,r}=advancedTest;st.saveSettings({interactionMode:'beginner'});d.set(r.initialState({phase:'move',dice:[4,1]}),r.legalPaths(r.initialState({phase:'move',dice:[4,1]})));});
    await tap(12,true);assert.equal((await snapshot()).selected,12);assert.equal((await snapshot()).draft.length,0);
    await tap(8);assert.equal((await snapshot()).draft.length,1);
    report.cases.push('checker vs point, selected die, S switch/undo, exhausted checker undo, beginner selection');
    await page.evaluate(()=>{const{d,r,st}=advancedTest;st.saveSettings({interactionMode:'advanced'});const points=Array(24).fill(0);points[22]=-2;const s=r.initialState({phase:'move',dice:[1,2],points,bar:[1,0],off:[14,13]});d.set(s,r.legalPaths(s));});
    assert.equal(await page.locator('.board-die.blocked[data-die="2"]').count(),1);
    await page.screenshot({path:path.join(out,`${name}-blocked-dice.png`)});
    await page.evaluate(()=>{const d=advancedTest.d;d.move(d.candidates()[0]);d.minDraft=1;d.render();});
    assert.equal(await page.locator('.board-die.forced').count(),1);
    const count=(await snapshot()).draft.length;await page.evaluate(()=>advancedTest.d.switchDice());assert.equal((await snapshot()).draft.length,count);
    await page.screenshot({path:path.join(out,`${name}-forced-blocked-dice.png`)});
    report.cases.push('red X for unusable die, orange forced arrow, locked forced step');
    // A seeded saved local position gives stable layouts across rotations.
    await page.evaluate(async()=>{const {put}=await import('/backgammon/core/storage.mjs');const {localConfig,defaultPlayRules}=await import('/backgammon/core/play-session.mjs');const {initialState}=await import('/backgammon/core/rules.mjs');const s=initialState({matchLength:0,rules:defaultPlayRules(0),phase:'move',dice:[4,1]});await put('work',{id:'play',game:{id:'responsive-test',state:s,initial:s,events:[],started:true,names:['You','Friend'],config:localConfig({mode:'local'})},draft:[]});});
    await page.goto(base+'/backgammon/play/');await ready();await page.locator('#resume-match').click();
    for (const [width,height] of [[320,568],[375,667],[390,844],[430,932],[844,390],[768,1024],[1024,768],[1366,768],[1440,900]]) {
      await page.setViewportSize({width,height});await page.waitForTimeout(100);
      const dims=await page.evaluate(()=>{const c=document.querySelector('#confirm').getBoundingClientRect(),b=document.querySelector('#board svg').getBoundingClientRect();return{overflow:document.documentElement.scrollWidth>innerWidth+1,confirm:c.toJSON(),board:b.toJSON()};});
      assert.equal(dims.overflow,false,`overflow at ${width}`);
      assert.ok(dims.confirm.top>=0&&dims.confirm.bottom<=height+2,`confirmation visible at ${width}: ${JSON.stringify(dims.confirm)}`);
      // The expanded footer reserves the summary and Confirm; short phones
      // scale the board into the remaining space without cropping it.
      const minBoardHeight=width<=600&&height<=740?100:200;
      assert.ok(dims.board.top>=0&&dims.board.bottom<=height+2&&dims.board.height>=minBoardHeight&&dims.board.width>260,`board visible at ${width}: ${JSON.stringify(dims.board)}`);
      if(width>height&&height<=500)assert.ok(dims.board.height>height*.85,'landscape board uses almost all height');
      const shot=`${name}-advanced-${width}x${height}.png`;await page.screenshot({path:path.join(out,shot)});report.screenshots.push(shot);
    }
    await page.setViewportSize({width:390,height:844});await showPlayControls(page);await page.locator('#analysis-jump').click();assert.ok(await page.locator('#review-heading').isVisible());
    assert.deepEqual(errors,[]);return report;
  } finally {await ctx.close();}
};
