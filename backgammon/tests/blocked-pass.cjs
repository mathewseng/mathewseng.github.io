const { waitForAsync } = require('./play-helpers.cjs');
const assert = require('node:assert/strict');
const path = require('node:path');

module.exports = async function blockedPass(browser, base, out, name) {
  const report = [];
  for (const touch of [false,true]) {
    const context = await browser.newContext({viewport:touch?{width:390,height:844}:{width:1366,height:768},hasTouch:touch,reducedMotion:'reduce',serviceWorkers:'block'});
    const page = await context.newPage(), errors = [];
    let scenario='initial';
    page.on('pageerror',e=>errors.push({scenario,message:e.stack || e.message}));
    const ready = () => page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
    const read = () => page.evaluate(async()=>(await import('/backgammon/core/storage.mjs')).get('work','play'));
    const activate = locator => touch ? locator.tap() : locator.click();
    const load = async ({turn=0,mode='local',kind='closed',human=false}={}) => {
      scenario=JSON.stringify({turn,mode,kind,human,step:'loading'});
      await page.goto(base+'/backgammon/');await ready();
      await page.evaluate(async({turn,mode,kind,human})=>{
        const {put,saveSettings}=await import('/backgammon/core/storage.mjs');
        const {initialState,transition}=await import('/backgammon/core/rules.mjs');
        const {localConfig}=await import('/backgammon/core/play-session.mjs');
        const points=Array(24).fill(0);points[5]=14;points[17]=-3;
        for(let i=18;i<24;i++)points[i]=-2;
        let off=[0,0];
        if(kind==='open'||kind==='rolled'){points[23]=-1;points[17]=-4;}
        if(kind==='good-double'||kind==='close-cube'){
          const count=kind==='good-double'?10:8;
          points[5]=points[17]=0;points[0]=14-count;points[21]=-5;off=[count,0];
        }
        let s=initialState({phase:kind==='rolled'?'move':'roll',dice:kind==='rolled'?[4,6]:[],matchLength:0,turn,
          cube:kind==='closed'?{value:2,owner:1-turn}:{value:1,owner:null},
          points:turn?points.toReversed().map(n=>-n):points,bar:turn?[0,1]:[1,0],off:turn?off.toReversed():off});
        if(kind==='cube')s=transition(s,{type:'double'},turn);
        saveSettings({motion:'reduce',orientation:turn,moveFeedback:false,analysisAhead:false,equityBar:false});
        await put('work',{id:'play',game:{id:'blocked-bar',initial:s,state:s,events:[],started:true,names:['You','Friend'],
          ...(mode==='computer'?{localRolls:{version:1,seed:'39'.padStart(64,'0'),cursor:0}}:{}),
          config:localConfig({mode,humanSide:human?turn:1-turn,strength:'quick',reviewStrength:human?'deep':'quick',tutor:false,warning:false})},draft:[]});
      },{turn,mode,kind,human});
      await page.goto(base+'/backgammon/play/');await ready();await activate(page.locator('#resume-match'));
      scenario=JSON.stringify({turn,mode,kind,human,step:'playing'});
    };
    const waitEvents = count => waitForAsync(page,async count=>{
      const t=(await(await import('/backgammon/core/storage.mjs')).get('work','play')).game;
      return t.events.length>=count;
    },count);
    const finishedCubeCheck = () => page.waitForFunction(()=>!document.querySelector('#message').textContent.includes('checking cube'));
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
        await load({turn,mode});await waitEvents(1);
        const game=(await read()).game;
        assert.equal(game.state.turn,1-turn);assert.equal(game.state.phase,'roll');assert.deepEqual(game.state.dice,[]);
        assert.deepEqual(game.events.map(e=>[e.actor,e.action.type,e.automatic]),[[turn,'skip-roll',true]]);
        assert.equal(game.events[0].action.dice,undefined);
        assert.equal(await page.evaluate(()=>window.rollBytes),0,'closed-out turn never draws random dice');
        if(mode==='computer')assert.equal(game.localRolls.cursor,0,'closed-out turn never consumes a seeded roll');
        assert.equal(await page.locator('#confirm').count(),0);assert.equal(await page.locator('#undo-turn').isEnabled(),false);
        await page.screenshot({path:path.join(out,`${name}-blocked-pass-${touch?'phone':'desktop'}-${mode}-${turn}.png`)});
        if(mode==='local'){
          await page.reload();await ready();await activate(page.locator('#resume-match'));
          assert.deepEqual((await read()).game.events,game.events,'refresh preserves the no-dice pass');
          assert.equal(await page.evaluate(()=>window.rollBytes),0);
        }
        report.push({touch,mode,turn,noCubeAutomaticPassWithoutDice:true});
      }
      await load({kind:'rolled'});await waitEvents(1);
      assert.equal((await read()).game.state.turn,1);
      assert.equal(await page.evaluate(()=>window.rollBytes),0,'already rolled blocked turn keeps its original dice');
      for(const kind of ['open','cube']){
        await load({kind});await page.waitForTimeout(150);
        assert.equal((await read()).game.events.length,0,`${kind} retains its decision`);
        assert.equal(await page.evaluate(()=>window.rollBytes),0);
        assert.equal(await page.locator(kind==='cube'?'#take-cube':'#roll').isEnabled(),true);
        if(kind==='open')assert.match(await page.locator('#roll').innerText(),/^Roll dice/);
      }
      // No engine advice is introduced in unassisted human games.
      for(const turn of [0,1]){
        await load({kind:'choice',turn});
        assert.match(await page.locator('#roll').innerText(),/^No double · pass/);
        assert.equal(await page.locator('#double-cube').isEnabled(),true);
        await activate(page.locator('#roll'));await waitEvents(1);
        const game=(await read()).game;
        assert.deepEqual(game.events[0].action,{type:'skip-roll'});
        assert.equal(game.events[0].automatic,undefined,'deliberate no-double remains a human cube decision');
        assert.equal(await page.evaluate(()=>window.rollBytes),0);
      }
      await load({kind:'choice'});await activate(page.locator('#double-cube'));
      await page.locator('#take-cube').waitFor();await activate(page.locator('#take-cube'));await waitEvents(3);
      assert.deepEqual((await read()).game.events.map(e=>e.action.type),['double','take','skip-roll']);
      assert.equal(await page.evaluate(()=>window.rollBytes),0,'accepted cube is followed by a pass, never a roll');
      await load({kind:'open',mode:'computer',human:true});
      await page.waitForTimeout(150);
      assert.equal((await read()).game.events.length,0,'one open entry never auto-rolls, even against the computer');
      assert.equal((await read()).game.localRolls.cursor,0);
      const box=await page.locator('#board').boundingBox();
      await page.locator('#board')[touch?'tap':'click']({position:{x:box.width*.25,y:box.height*.5}});
      await waitEvents(2);
      const entered=(await read()).game;
      assert.deepEqual(entered.events[0].action,{type:'roll',dice:[4,6]});
      assert.deepEqual(entered.events[1].action,{type:'move',steps:[]},'a rolled failure passes with no second tap');
      report.push({touch,oneOpenEntryKeepsNormalRoll:true});
      // Real bundled GNUbg: retain both a correct double and a no-double with
      // less than 0.25 margin, even though every entry is closed.
      for(const kind of ['good-double','close-cube']){
        await load({kind,mode:'computer',human:true});await finishedCubeCheck();
        assert.equal((await read()).game.events.length,0,`${kind} must not auto-decline`);
        assert.equal(await page.locator('#double-cube').isEnabled(),true);
        assert.match(await page.locator('#roll').innerText(),/^No double · pass/);
        assert.equal((await read()).game.localRolls.cursor,0);
        await page.screenshot({path:path.join(out,`${name}-blocked-pass-${touch?'phone':'desktop'}-${kind}.png`)});
        report.push({touch,kind,realEngineRetainsCube:true});
        if(kind==='good-double'){
          await activate(page.locator('#roll'));await waitEvents(1);
          await waitForAsync(page,async()=>{
            const game=(await(await import('/backgammon/core/storage.mjs')).get('work','play')).game;
            return game.events[0]?.evaluation?.result?.actualDecision==='roll';
          });
          const first=(await read()).game.events[0];
          assert.deepEqual(first.action,{type:'skip-roll'});
          assert.equal(first.automatic,undefined);
          assert.equal(first.initialDecision.action.type,'skip-roll');
          assert.ok(first.evaluation.result.error>.01,'deliberately declining the correct double is graded');
        }
      }
      for(const turn of [0,1]){
        await load({kind:'choice',mode:'computer',human:true,turn});await waitEvents(1);
        const game=(await read()).game;
        assert.deepEqual(game.events[0].action,{type:'skip-roll'});
        assert.equal(game.events[0].automatic,true,'real engine confirms clearly inferior double');
        assert.equal(game.events[0].initialDecision,undefined,'automatic decision is not attributed to the player');
        report.push({touch,turn,realEngineAutomaticPass:true});
      }
      // Fault injection only: engine failure must expose the cube choice and
      // must neither draw dice nor silently authorize the automatic decision.
      await page.route('**/engine/worker.mjs*',route=>route.fulfill({contentType:'text/javascript',body:
        "self.onmessage=({data})=>postMessage({id:data.id,type:'error',message:'Cube check unavailable in test'});"}));
      await load({kind:'choice',mode:'computer',human:true});await finishedCubeCheck();
      assert.equal((await read()).game.events.length,0);assert.equal((await read()).game.localRolls.cursor,0);
      assert.equal(await page.locator('#double-cube').isEnabled(),true);
      assert.equal(await page.locator('#roll').isEnabled(),true);
      await page.unroute('**/engine/worker.mjs*');
      assert.deepEqual(errors,[]);
    } finally {await context.close();}
  }
  return report;
};
