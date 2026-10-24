const assert=require('node:assert/strict'),path=require('node:path');
const {waitWork}=require('./play-helpers.cjs');
module.exports=async(browser,base,out,name)=>{
  const report=[];
  for(const touch of [false,true]) {
    const context=await browser.newContext({viewport:touch?{width:390,height:844}:{width:1366,height:768},hasTouch:touch,reducedMotion:'no-preference',serviceWorkers:'block'});
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    const ready=()=>page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
    try {
      await page.goto(base+'/backgammon/play/');await ready();
      const sourceKey=await page.evaluate(async()=>{
        const {initialState,legalPaths,boardKey,positionKey}=await import('/backgammon/core/rules.mjs');
        const {put,saveSettings}=await import('/backgammon/core/storage.mjs');
        const {localConfig}=await import('/backgammon/core/play-session.mjs');
        const s=initialState({phase:'move',dice:[4,1],matchLength:0});
        saveSettings({motion:'full',motionScale:1,analysisAhead:false,equityBar:false,moveFeedback:false});
        await put('work',{id:'play',positionKey:positionKey(s),draft:[legalPaths(s)[0].steps[0]],game:{id:'hint-return',started:true,state:s,initial:s,events:[],names:['You','Black'],config:localConfig({mode:'computer',humanSide:0,strength:'quick',reviewStrength:'quick',warning:false,tutor:false})}});
        return boardKey(s);
      });
      await page.reload();await ready();
      await page.evaluate(async()=>{
        const {Board}=await import('/backgammon/ui/board.mjs'),{boardKey}=await import('/backgammon/core/rules.mjs');
        const restore=Board.prototype.animateRestore,play=Board.prototype.playTurn;
        window.hintMotion=[];
        Board.prototype.animateRestore=function(before,after,...args){
          const row=this.container.id==='board'?{kind:'restore',before:boardKey(before),after:boardKey(after),start:performance.now()}:null;
          if(row)hintMotion.push(row);
          return Promise.resolve(restore.call(this,before,after,...args)).then(()=>{if(row)row.end=performance.now();});
        };
        Board.prototype.playTurn=function(before,steps,...args){
          if(this.container.id==='board')hintMotion.push({kind:'play',before:boardKey(before),steps,start:performance.now(),moving:this.svg.querySelectorAll('.moving-checker').length});
          return play.call(this,before,steps,...args);
        };
      });
      await page.locator('#resume-match').click();
      await waitWork(page,w=>w?.draft.length===1);
      await page.locator('#hint').click();
      await page.getByRole('button',{name:'Play best',exact:true}).waitFor({timeout:60000});
      assert.equal(await page.getByRole('button',{name:'Use best move',exact:true}).count(),0);
      await page.screenshot({path:path.join(out,`${name}-hint-single-action-${touch?'phone':'desktop'}.png`)});
      const button=page.getByRole('button',{name:'Play best',exact:true});
      if(touch)await button.tap();else await button.click();
      await page.waitForFunction(()=>hintMotion.some(r=>r.kind==='restore'));
      assert.equal(await page.locator('.decision-dialog[open]').count(),0,'return is visible on the live board');
      assert.equal(await page.locator('#confirm').isDisabled(),true,'input stays locked during return');
      await page.screenshot({path:path.join(out,`${name}-hint-return-${touch?'phone':'desktop'}.png`)});
      await page.waitForFunction(()=>hintMotion.some(r=>r.kind==='play'));
      const trace=await page.evaluate(()=>hintMotion);
      const restore=trace.find(r=>r.kind==='restore'),play=trace.find(r=>r.kind==='play');
      assert.notEqual(restore.before,sourceKey,'fixture has a moved checker');
      assert.equal(restore.after,sourceKey,'return restores the original position');
      assert.ok(restore.end>restore.start+250,'return animation has time to finish');
      assert.equal(play.before,sourceKey,'best move animates from the original position');
      assert.ok(play.start>=restore.end,'best playback waits for the return to finish');
      assert.equal(play.moving,0,'no return flights remain when best playback starts');
      const saved=await waitWork(page,w=>w?.game.events.some(e=>e.actor===0&&e.action.type==='move'));
      assert.equal(saved.game.events.filter(e=>e.actor===0&&e.action.type==='move').length,1,'Play best commits once');
      assert.deepEqual(errors,[]);report.push({touch,restoreMs:restore.end-restore.start,playAfterReturn:true,singleAction:true});
    }finally{await context.close();}
  }
  return report;
};
