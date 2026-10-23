// A complete game through real touch targets, with real GNUbg and full motion.
// Can run against the assembled site or the deployed Pages release. Isolated
// browser storage never touches an existing user's match.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {seedOpening} = require('./play-helpers.cjs');
const stats = values => {
  const sorted = values.filter(Number.isFinite).sort((a,b)=>a-b);
  return {count:sorted.length,median:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.floor(sorted.length*.95)],max:sorted.at(-1)};
};

async function fullGame(browser, base, out, name) {
  fs.mkdirSync(out,{recursive:true});
  const context = await browser.newContext({viewport:{width:390,height:844},hasTouch:true,
    isMobile:name!=='firefox',deviceScaleFactor:2,reducedMotion:'no-preference'});
  const page=await context.newPage(), errors=[], turns=[];
  page.on('pageerror',error=>errors.push(error.message));
  let cdp, latest, completed=false;
  const dump=async()=>{
    const timing=await page.evaluate(()=>{
      const p=window.mobileGame;
      if(!p)return null;
      return {actions:p.actions,frames:p.frames.filter(f=>!p.endAt||f.at<p.endAt),tasks:p.tasks.filter(t=>!p.endAt||t.at<p.endAt),renders:p.renders.filter(r=>!p.endAt||r.at<p.endAt),calls:p.calls,
        release:p.release,version:p.version};
    }).catch(()=>null);
    const report={recordedAt:new Date().toISOString(),base,browser:`${name} ${browser.version()}`,
      viewport:{width:390,height:844},cpuSlowdown:name==='chromium'?Number(process.env.BG_CPU_RATE||1):1,
      completed,turns,game:latest,errors,timing};
    if(timing)report.summary={
      tapToFrame:stats(timing.actions.map(a=>a.frameMs)),
      byAction:Object.fromEntries([...new Set(timing.actions.map(a=>a.kind))].map(kind=>
        [kind,stats(timing.actions.filter(a=>a.kind===kind).map(a=>a.frameMs))])),
      actionToPosition: Object.fromEntries([...new Set(timing.actions.map(a=>a.kind))].map(kind=>
        [kind,stats(timing.actions.filter(a=>a.kind===kind).map(a=>a.positionMs))])),
      stalls:stats(timing.frames.map(f=>f.ms)),longTasks:stats(timing.tasks.map(t=>t.ms)),
      renders:stats(timing.renders.map(r=>r.ms)),
      slowestFrames:[...timing.frames].sort((a,b)=>b.ms-a.ms).slice(0,20)};
    fs.writeFileSync(path.join(out,`${name}-mobile-fullgame.json`),JSON.stringify(report,null,2));
    return report;
  };
  const tap=async(kind,locator,point)=>{
    await page.evaluate(kind=>{mobileGame.nextAction=kind},kind);
    if(point)await page.touchscreen.tap(point.x,point.y);
    else await locator.tap();
  };
  try {
    await seedOpening(page,[6,1]);
    await page.goto(base+'/backgammon/play/');
    await page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
    await page.evaluate(async()=>{
      const {DraftBoard}=await import('/backgammon/ui/shell.mjs');
      const {Board}=await import('/backgammon/ui/board.mjs');
      const {EngineClient}=await import('/backgammon/engine/client.mjs');
      const rules=await import('/backgammon/core/rules.mjs');
      const st=await import('/backgammon/core/storage.mjs');
      const version=await import('/backgammon/engine/metadata.mjs');
      const p=window.mobileGame={actions:[],frames:[],tasks:[],renders:[],calls:[],results:new Map(),rules,st,version:version.ENGINE_VERSION};
      p.release=new URL(document.querySelector('script[src*="app.js"]').src).searchParams.get('bgv');
      const context=()=>({sequence:p.d?.state?.sequence,phase:p.d?.state?.phase,player:p.d?.state?.turn,
        off:p.d?.current()?.off,draft:p.d?.draft.length,action:p.actions.at(-1)?.kind});
      const render=DraftBoard.prototype.render;
      DraftBoard.prototype.render=function(...args){
        if(this.board.container.id==='board')p.d=this;
        const at=performance.now(),result=render.apply(this,args);
        p.renders.push({at,ms:performance.now()-at,...context()});
        const action=p.actions.at(-1);
        if(this===p.d&&action&&action.positionMs===undefined&&
          (this.state.sequence!==action.sequence||this.draft.length!==action.draft))
          action.positionMs=performance.now()-action.at;
        return result;
      };
      const boardRender=Board.prototype.render;
      Board.prototype.render=function(...args){
        const at=performance.now(),result=boardRender.apply(this,args);
        p.renders.push({at,ms:performance.now()-at,board:true,...context()});return result;
      };
      const analyze=EngineClient.prototype.analyze;
      EngineClient.prototype.analyze=function(state,options={}){
        const row={at:performance.now(),sequence:state.sequence,phase:state.phase,player:state.turn,priority:options.priority};p.calls.push(row);
        return analyze.call(this,state,options).then(result=>{
          row.ms=performance.now()-row.at;row.cached=!!result.cached;row.plies=result.settings?.plies;
          if(result.type==='checker')p.results.set(result.positionKey,result);
          return result;
        },error=>{row.ms=performance.now()-row.at;row.error=error.name;throw error});
      };
      document.addEventListener('pointerup',()=>{
        if(!p.nextAction)return;
        const a={kind:p.nextAction,at:performance.now(),...context()};p.actions.push(a);p.nextAction=null;
        requestAnimationFrame(()=>a.frameMs=performance.now()-a.at);
      },true);
      let last=performance.now();
      function frame(now){
        if(p.endAt)return;
        if(now-last>34)p.frames.push({at:now,ms:now-last,...context()});
        last=now;requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
      if(PerformanceObserver.supportedEntryTypes.includes('longtask'))new PerformanceObserver(list=>{
        for(const e of list.getEntries())p.tasks.push({at:e.startTime,ms:e.duration,...context()});
      }).observe({type:'longtask'});
    });
    if(process.env.BG_EXPECT_RELEASE)assert.equal(await page.evaluate(()=>mobileGame.release),process.env.BG_EXPECT_RELEASE,
      'the browser loaded the expected deployed release');
    if(name==='chromium'){
      cdp=await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate',{rate:Number(process.env.BG_CPU_RATE||1)});
      if(process.env.BG_PROFILE){await cdp.send('Profiler.enable');await cdp.send('Profiler.start');}
    }
    await tap('start',page.locator('#start-match'));
    const deadline=Date.now()+Number(process.env.BG_GAME_TIMEOUT_MS||1200000);
    let lastSequence=-1, chosenAt=0, lastActionAt=Date.now(), rollTapped=-1;
    while(Date.now()<deadline){
      const state=await page.evaluate(()=>{
        const p=mobileGame,d=p.d;
        const visible=node=>node&&node.getBoundingClientRect().height>0&&!node.disabled;
        return {state:d?.state,enabled:d?.enabled,draft:d?.draft,complete:d?.complete(),
          opening:!!document.querySelector('.opening-roll'),moving:!!d?.board.playbackTimer||!!document.querySelector('.moving-checker'),
          over:d?.state?.phase==='over',
          warning:!![...document.querySelectorAll('dialog[open] button')].find(n=>n.textContent.trim()==='Confirm anyway'),
          dialog:document.querySelector('dialog[open]')?.textContent.slice(0,350),
          roll:!!document.querySelector('#roll:not(:disabled)')&&document.querySelector('#board').classList.contains('roll-ready'),
          confirm:visible(document.querySelector('#confirm')),
          take:visible(document.querySelector('#take-cube'))};
      });
      if(state.state?.sequence!==lastSequence){
        lastSequence=state.state?.sequence;chosenAt=Date.now();
        turns.push({at:Date.now(),sequence:lastSequence,phase:state.state?.phase,player:state.state?.turn,off:state.state?.off});
        console.log(`${name}: ${lastSequence} ${state.state?.phase} player ${state.state?.turn}, off ${state.state?.off}`);
      }
      if(state.over){completed=true;break;}
      if(state.warning){
        await tap('accept-warning',page.locator('dialog[open]').getByRole('button',{name:'Confirm anyway',exact:true}));lastActionAt=Date.now();continue;
      }
      if(state.take){await tap('take-cube',page.locator('#take-cube'));lastActionAt=Date.now();continue;}
      if(!state.opening&&!state.moving&&state.roll&&rollTapped!==lastSequence){
        const b=await page.locator('#board .bg-board').boundingBox();
        await tap('roll',null,{x:b.x+b.width*.28,y:b.y+b.height*.5});lastActionAt=Date.now();
        rollTapped=lastSequence;
        await page.waitForTimeout(250);continue;
      }
      if(!state.opening&&!state.moving&&state.enabled&&state.state?.phase==='move'&&Date.now()-chosenAt>800){
        if(state.confirm){await tap('confirm',page.locator('#confirm'));lastActionAt=Date.now();await page.waitForTimeout(200);continue;}
        const target=await page.evaluate(()=>{
          const {d,rules,results}=mobileGame;
          const next=d.candidates(),die=d.activeDie();
          const best=results.get(rules.positionKey(d.state))?.candidates?.[0];
          const prefix=path=>d.draft.every((step,i)=>JSON.stringify(step)===JSON.stringify(path.steps[i]));
          const preferred=best?d.paths.filter(prefix).filter(p=>rules.boardKey(p.state)===best.key)
            .map(p=>p.steps[d.draft.length]).filter(Boolean):[];
          // Advance the back checkers when analysis is still running, rather
          // than always moving the first (home-board) array entry. This also
          // exercises human bearing-off taps in an ordinary complete game.
          const distance=step=>step.from==='bar'?25:d.state.turn?24-step.from:step.from+1;
          const playable=[...next].sort((a,b)=>distance(b)-distance(a));
          const step=preferred.find(s=>s.die===die)||playable.find(s=>s.die===die)||playable[0];
          if(!step)return null;
          const raw=step.from==='bar'?'bar'+d.state.turn:step.from;
          const face=document.querySelector(`#board [data-point="${raw}"] .checker`);
          if(!face)return {missing:raw};
          const circle=face.querySelector('circle'),xy=new DOMPoint(+circle.getAttribute('cx'),+circle.getAttribute('cy')).matrixTransform(circle.getScreenCTM());
          return {x:xy.x,y:xy.y,kind:step.to==='off'?'bearoff':'checker',step};
        });
        assert.ok(target&&!target.missing,`No legal touch target: ${JSON.stringify({state,target})}`);
        await tap(target.kind,null,target);lastActionAt=Date.now();await page.waitForTimeout(350);continue;
      }
      if(Date.now()-lastActionAt>90000)throw Error(`Game stopped responding: ${JSON.stringify(state)}`);
      await page.waitForTimeout(100);
    }
    assert.ok(completed,'the game reaches its result card');
    await page.waitForTimeout(500);
    // Export/replay the growing saved game only after the timed run. Sending
    // its full history through the automation protocol each turn would itself
    // block the page and misreport test overhead as application jank.
    await page.evaluate(()=>{mobileGame.endAt=performance.now()});
    latest=await page.evaluate(async()=> (await mobileGame.st.get('work','play')).game);
    assert.equal(latest.state.phase,'over');
    assert.ok(await page.evaluate(async()=>{
      const {st,rules}=mobileGame,g=(await st.get('work','play')).game;
      return JSON.stringify(rules.replay(g.initial,g.events).at(-1))===JSON.stringify(g.state);
    }),'the complete game independently replays');
    await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
    await page.screenshot({path:path.join(out,`${name}-mobile-fullgame-result.png`)});
    assert.deepEqual(errors,[]);
    const report=await dump();console.log(JSON.stringify(report.summary));return report;
  } finally {
    await dump();
    if(cdp&&process.env.BG_PROFILE)fs.writeFileSync(path.join(out,`${name}-mobile-fullgame.cpuprofile`),JSON.stringify((await cdp.send('Profiler.stop')).profile));
    await context.close();
  }
}
module.exports=fullGame;
if(require.main===module)(async()=>{
  const {launchQuietBrowser}=require('../../scripts/quiet-browser.cjs');
  const name=process.env.BG_BROWSER||'chromium';
  const browser=await launchQuietBrowser(require('playwright')[name]);
  try{await fullGame(browser,process.env.BG_BASE_URL||'https://mathewseng.github.io',
    process.env.BG_TEST_OUT||'backgammon/test-results/live-mobile',name);}
  finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
