const assert=require('node:assert/strict');
const path=require('node:path');
const {seedOpening,waitWork}=require('./play-helpers.cjs');

module.exports=async(browser,base,out,name)=>{
  const report=[];
  for(const touch of [false,true]) {
    const context=await browser.newContext({viewport:touch?{width:390,height:844}:{width:1366,height:768},
      hasTouch:touch,serviceWorkers:'block',reducedMotion:'no-preference'});
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    const ready=()=>page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
    const caption=page.locator('#board .board-caption');
    const verb=touch?'Tap':'Click';
    try {
      // Two failed rolls, then an entry. Black is closed out and passes without
      // consuming dice. Every action uses real Play controls and saved history.
      await seedOpening(page,[2,3,4,5,1,2]);
      const load=async(entry='blocked')=>{
        await page.goto(base+'/backgammon/play/');await ready();
        await page.evaluate(async entry=>{
          const {put,saveSettings}=await import('/backgammon/core/storage.mjs');
          const {initialState}=await import('/backgammon/core/rules.mjs');
          const {localConfig}=await import('/backgammon/core/play-session.mjs');
          const points=Array(24).fill(0);for(let i=0;i<5;i++)points[i]=2;points[5]=4;
          for(let i=18;i<23;i++)points[i]=-2;points[17]=-4;
          if(entry!=='blocked') {
            for(let i=18;i<24;i++)points[i]=entry==='blots'?-1:0;
            points[17]=entry==='blots'?-8:-14;
          }
          const s=initialState({phase:'roll',points,bar:[1,1],matchLength:0,cube:{value:2,owner:0}});
          saveSettings({motion:'full',analysisAhead:false,equityBar:false,moveFeedback:false});
          await put('work',{id:'play',draft:[],game:{id:'auto-bar-fixture',started:true,state:s,initial:s,events:[],
            names:['You','Black'],config:localConfig({mode:'computer',humanSide:0,tutor:false,warning:false,strength:'quick'})}});
        },entry);
        await page.reload();await ready();await page.locator('#resume-match').click();
        await page.locator('#board.roll-ready').waitFor();
      };
      const tap=async(times=1)=>{
        const box=await page.locator('#board .bg-board').boundingBox();
        const pos={x:box.x+box.width*610/876,y:box.y+box.height*330/660};
        for(let i=0;i<times;i++) {
          if(touch)await page.touchscreen.tap(pos.x,pos.y);else await page.mouse.click(pos.x,pos.y);
        }
      };
      await load();
      assert.equal(await caption.locator('text').nth(0).textContent(),`${verb} to roll`);
      assert.equal(await caption.locator('text').nth(1).textContent(),`Double ${verb.toLowerCase()} to auto roll`);
      assert.equal(await caption.locator('text').nth(0).getAttribute('x'),'610','roll prompt stays in the right dice area');
      await page.screenshot({path:path.join(out,`${name}-roll-prompt-${touch?'phone':'desktop'}.png`)});
      await tap();
      await waitWork(page,w=>w?.game.localRolls?.cursor===1&&w.game.state.turn===0&&w.game.state.phase==='roll');
      await page.waitForTimeout(350);
      assert.equal((await waitWork(page,w=>!!w?.game)).game.localRolls.cursor,1,'single tap rolls only once');

      await load();await tap(2);
      await page.waitForFunction(()=>document.querySelector('#board .board-caption')?.textContent.includes('Auto roll on'));
      await page.locator('#preferences').click();
      await waitWork(page,w=>w?.game.localRolls?.cursor===1&&w.game.state.turn===0&&w.game.state.phase==='roll');
      await page.waitForTimeout(350);
      assert.equal((await waitWork(page,w=>!!w?.game)).game.localRolls.cursor,1,'a dialog pauses automatic rolling');
      await page.locator('.settings-dialog .close').click();
      const completed=await waitWork(page,w=>w?.game.localRolls?.cursor===3&&w.draft.some(step=>step.from==='bar'));
      assert.deepEqual(completed.game.events.filter(e=>e.action.type==='roll').map(e=>[e.actor,e.action.dice]),[[0,[2,3]],[0,[4,5]],[0,[1,2]]]);
      assert.equal(await caption.locator('text').count(),0,'auto-roll ends as soon as a checker enters the draft');
      assert.deepEqual(completed.draft,[{from:'bar',to:23,die:1}],'leave the remaining checker choices to the player');
      await page.waitForTimeout(350);
      assert.equal((await waitWork(page,w=>!!w?.game)).game.localRolls.cursor,3,'entry stops automatic rolling');

      await load();await tap(2);
      await page.waitForFunction(()=>document.querySelector('#board .board-caption')?.textContent.includes('Auto roll on'));
      // Tap the explicit stop control even while the failed dice are showing.
      await caption.locator('.board-caption-hit')[touch?'tap':'click']();
      await waitWork(page,w=>w?.game.localRolls?.cursor===1&&w.game.state.phase==='roll'&&w.game.state.turn===0);
      await page.waitForTimeout(350);
      assert.equal((await waitWork(page,w=>!!w?.game)).game.localRolls.cursor,1,'manual stop cancels the next automatic roll');

      for(const entry of ['open','blots']) {
        await load(entry);
        assert.deepEqual(await caption.locator('text').allTextContents(),[`${verb} to roll`],`${entry} entries do not advertise auto roll`);
        await tap(2);
        await waitWork(page,w=>w?.game.localRolls?.cursor===1&&w.game.state.phase==='move');
        assert.ok(!(await caption.textContent()).includes('Auto roll'),'double tapping cannot enable a hidden auto-roll action');
      }

      assert.deepEqual(await page.evaluate(async()=>{
        const {Board}=await import('/backgammon/ui/board.mjs'),{initialState}=await import('/backgammon/core/rules.mjs');
        const host=document.createElement('div'),b=new Board(host),s=initialState();
        const labels=[];for(const options of [{interactive:false},{preview:true,interactive:false},{editor:true,interactive:false}]){
          b.render(s,options);labels.push(host.querySelector('.board-caption').textContent);
        }
        b.destroy();return labels;
      }),['','Move preview','Position editor']);
      assert.deepEqual(errors,[]);
      report.push({touch,singleRoll:true,repeatedUntilEntry:true,dialogPauseAndResume:true,manualStop:true,requiresBlockedEntry:true});
    } finally {await context.close();}
  }
  return report;
};
