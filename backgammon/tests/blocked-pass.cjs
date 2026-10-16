const assert = require('node:assert/strict');
const path = require('node:path');

module.exports = async function blockedPass(browser, base, out, name) {
  const report = [];
  for (const touch of [false,true]) {
    const context = await browser.newContext({viewport:touch?{width:390,height:844}:{width:1366,height:768},hasTouch:touch,reducedMotion:'reduce',serviceWorkers:'block'});
    const page = await context.newPage(), errors = [], failed = [];
    page.on('pageerror',e=>errors.push(e.stack || e.message));
    page.on('requestfailed',r=>failed.push({url:r.url(),error:r.failure()?.errorText}));
    const ready = () => page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
    const read = () => page.evaluate(async()=>(await import('/backgammon/core/storage.mjs')).get('work','play'));
    const activate = locator => touch ? locator.tap() : locator.click();
    const load = async ({turn=0,mode='local',kind='closed'}={}) => {
      await page.evaluate(async({turn,mode,kind})=>{
        const {put,saveSettings}=await import('/backgammon/core/storage.mjs');
        const {initialState,transition}=await import('/backgammon/core/rules.mjs');
        const {localConfig}=await import('/backgammon/core/play-session.mjs');
        const points=Array(24).fill(0);points[5]=14;points[17]=-3;
        for(let i=18;i<24;i++)points[i]=-2;
        if(kind==='open'||kind==='rolled'){points[23]=-1;points[17]=-4;}
        let s=initialState({phase:kind==='rolled'?'move':'roll',dice:kind==='rolled'?[4,6]:[],matchLength:0,turn,
          points:turn?points.toReversed().map(n=>-n):points,bar:turn?[0,1]:[1,0]});
        if(kind==='cube')s=transition(s,{type:'double'},turn);
        saveSettings({motion:'reduce',orientation:turn});
        await put('work',{id:'play',game:{id:'blocked-bar',initial:s,state:s,events:[],started:true,names:['You','Friend'],
          ...(mode==='computer'?{localRolls:{version:1,seed:'39'.padStart(64,'0'),cursor:0}}:{}),
          config:localConfig({mode,humanSide:1-turn,strength:'quick',reviewStrength:'quick',tutor:false,warning:false})},draft:[]});
      },{turn,mode,kind});
      await page.reload();await ready();await activate(page.locator('#resume-match'));
    };
    try {
      await page.addInitScript(()=>{
        const random=crypto.getRandomValues.bind(crypto);window.rollBytes=0;
        crypto.getRandomValues=a=>{
          if(a instanceof Uint8Array && a.length===1){a[0]=window.rollBytes++%2?5:3;return a;}
          return random(a);
        };
      });
      await page.goto(base+'/backgammon/play/');await ready();
      for(const mode of ['local','computer'])for(const turn of [0,1]){
        await load({turn,mode});
        await page.waitForFunction(async()=>{
          const t=(await(await import('/backgammon/core/storage.mjs')).get('work','play')).game;
          return t.events.length===2;
        });
        const saved=await read(), game=saved.game;
        assert.equal(game.state.turn,1-turn);
        assert.equal(game.state.phase,'roll');
        assert.deepEqual(game.events.map(e=>[e.actor,e.action.type,e.automatic]),[[turn,'roll',true],[turn,'move',true]]);
        assert.deepEqual(game.events[0].action.dice,[4,6]);
        assert.deepEqual(game.events[1].action.steps,[]);
        assert.equal(await page.evaluate(()=>window.rollBytes),mode==='computer'?0:2,'one recorded roll, never retries RNG');
        assert.equal(await page.locator('#confirm').count(),0,'no pass confirmation');
        assert.equal(await page.locator('#undo-turn').isEnabled(),false);
        if(mode==='local'){
          await page.screenshot({path:path.join(out,`${name}-blocked-pass-${touch?'phone':'desktop'}-${turn}.png`)});
          await page.reload();await ready();await activate(page.locator('#resume-match'));
          assert.deepEqual((await read()).game.events,game.events,'refresh preserves the pass and dice');
          assert.equal(await page.evaluate(()=>window.rollBytes),0,'resuming the next turn never rerolls the skipped one');
        }
        report.push({touch,mode,turn,automaticRollAndPass:true});
      }
      await load({kind:'rolled'});
      await page.waitForFunction(async()=>(await(await import('/backgammon/core/storage.mjs')).get('work','play')).game.events.length===1);
      assert.equal((await read()).game.state.turn,1);
      assert.equal(await page.evaluate(()=>window.rollBytes),0,'already rolled blocked turn keeps its original dice');
      for(const kind of ['open','cube']){
        await load({kind});
        await page.waitForTimeout(150); // More than the reduced-motion automatic-pass timer.
        assert.equal((await read()).game.events.length,0,`${kind} keeps its decision`);
        assert.equal(await page.evaluate(()=>window.rollBytes),0);
        assert.equal(await page.locator(kind==='cube'?'#take-cube':'#roll').isEnabled(),true);
      }
      assert.deepEqual(errors,[],JSON.stringify({touch,failed}));
    } finally {await context.close();}
  }
  return report;
};
