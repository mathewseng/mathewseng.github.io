const assert = require('node:assert/strict');
const path = require('node:path');
const {waitWork,seedOpening} = require('./play-helpers.cjs');

// Render real saved table states, then exercise their controls. Engine work is
// held independently so the visual audit is deterministic, including waiting.
module.exports = async (browser, base, out, name) => {
  const report = [];
  for (const [layout, width, height, touch] of [
    ['desktop',1366,768,false], ['portrait',390,844,true], ['landscape',844,390,true],
  ]) {
    const context = await browser.newContext({viewport:{width,height},hasTouch:touch,reducedMotion:'reduce',serviceWorkers:'block'});
    const page = await context.newPage(), errors = [];
    await seedOpening(page,[6,1]);
    page.on('pageerror', e => errors.push(e.message));
    const ready = () => page.waitForFunction(() => document.documentElement.dataset.appReady === 'true');
    const seed = async kind => {
      // Play checkpoints on pagehide. Leave it before replacing the fixture.
      await page.goto(base+'/backgammon/'); await ready();
      await page.evaluate(async kind => {
        const r = await import('/backgammon/core/rules.mjs');
        const st = await import('/backgammon/core/storage.mjs');
        const {playAction} = await import('/backgammon/core/table.mjs');
        const {localConfig,defaultPlayRules} = await import('/backgammon/core/play-session.mjs');
        const moving = ['move','partial','confirm','bearoff'].includes(kind);
        const points = Array(24).fill(0);
        for (const [i,n] of [2,3,2,4,0,4].entries()) {points[i]=n;points[23-i]=-n;}
        const initial = r.initialState({phase:moving?'move':'roll',dice:moving?[4,1]:[],matchLength:kind==='match-over'?1:0,
          rules:defaultPlayRules(kind==='match-over'?1:0),...(kind==='bearoff'?{points}:{}),
          ...(['game-over','resign'].includes(kind)?{cube:{value:4,owner:0}}:{})});
        let game = {id:'state-layout-'+kind,started:true,initial,state:initial,events:[],names:['White','Black'],
          config:localConfig({mode:['bot','game-over','match-over'].includes(kind)?'computer':'local',humanSide:kind==='bot'?1:0,tutor:false,warning:false,matchLength:initial.matchLength,rules:initial.rules})};
        let draft = [];
        if (moving) {
          game.reviewingTurn = true;
          const steps=r.legalTurns(initial)[0].steps;
          draft = kind==='partial'?steps.slice(0,1):['confirm','bearoff'].includes(kind)?steps:[];
        }
        if (['double','beaver','raccoon','re-beaver'].includes(kind)) {
          game=playAction(game,{type:'double'});
          if (kind!=='double') game=playAction(game,{type:'beaver'});
          if (['raccoon','re-beaver'].includes(kind)) game=playAction(game,{type:'raccoon'});
          if (kind==='re-beaver') game=playAction(game,{type:'beaver'});
        }
        if (kind==='resign') game=playAction(game,{type:'resign',level:2});
        if (['game-over','match-over','undo-request'].includes(kind)) {
          // A complete checker turn gives Review and the summary real content.
          game=playAction(game,{type:'roll',dice:[4,1]});
          const s=game.state,turns=r.legalTurns(s);
          game=playAction(game,{type:'move',steps:turns[1].steps});
          game.events.at(-1).evaluation={result:{type:'checker',status:'complete',positionKey:r.positionKey(s),settings:{name:'3 ply',plies:3},units:'current-cube-points',
            candidates:turns.slice(0,10).map((t,i)=>({equity:.2-i*.01,steps:t.steps})),actual:{equity:.19,steps:turns[1].steps}}};
          if (kind==='undo-request') game.undoRequest={by:0,target:0};
          else {game=playAction(game,{type:'resign',level:2});game=playAction(game,{type:'accept'});}
        }
        if (kind==='blocked-bar') {
          const p=Array(24).fill(0);p[5]=14;
          for(let i=18;i<24;i++)p[i]=-2;
          p[17]=-3;
          game.initial=game.state=r.initialState({phase:'roll',matchLength:0,points:p,bar:[1,0],rules:initial.rules});
          game.reviewingTurn=true;
        }
        st.saveSettings({motion:'reduce',analysisAhead:false,equityBar:true});
        await st.put('work',{id:'play',game,draft,positionKey:r.positionKey(game.state)});
      },kind);
      await page.goto(base+'/backgammon/play/'); await ready();
      await page.evaluate(async () => {(await import('/backgammon/engine/client.mjs')).EngineClient.prototype.analyze=()=>new Promise(()=>{});});
      await page.locator('#resume-match').click();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(100);
    };
    const inspect = async kind => {
      const metrics = await page.evaluate(() => {
        const box=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
        const label=n=>n.id||n.getAttribute('aria-label')||n.textContent.trim();
        const scope=document.querySelector('dialog[open]')||document;
        const controls=[...scope.querySelectorAll('button,a.btn,summary')].filter(n=>{
          const b=box(n),s=getComputedStyle(n),closed=n.closest('details:not([open])');
          return !n.closest('svg')&&(!closed||closed.querySelector(':scope > summary')?.contains(n))&&s.visibility!=='hidden'&&b.width>0&&b.height>0&&b.y>=0&&b.bottom<=innerHeight+1;
        });
        const problems=[], clipped=[];
        for (const n of controls) {
          const b=box(n);
          if(n.closest('.board-actions,#actions,.dialog-foot')&&(b.width<43||b.height<43))problems.push({label:label(n),issue:'small target',box:b});
          const walker=document.createTreeWalker(n,NodeFilter.SHOW_TEXT);
          while(walker.nextNode()) {
            const t=walker.currentNode;if(!t.textContent.trim()||t.parentElement.closest('svg,.sr-only')||getComputedStyle(t.parentElement).clipPath!=='none')continue;
            const range=document.createRange();range.selectNodeContents(t);
            for(const r of range.getClientRects())if(r.width&&r.height&&(r.left<b.x-1||r.right>b.right+1||r.top<b.y-1||r.bottom>b.bottom+1))
              clipped.push({label:label(n),text:t.textContent});
          }
        }
        for(let i=0;i<controls.length;i++)for(let j=i+1;j<controls.length;j++) {
          const a=controls[i],b=controls[j];if(a.contains(b)||b.contains(a))continue;
          const x=box(a),y=box(b);
          if(Math.min(x.right,y.right)-Math.max(x.x,y.x)>2&&Math.min(x.bottom,y.bottom)-Math.max(x.y,y.y)>2)
            problems.push({issue:'overlap',labels:[label(a),label(b)]});
        }
        const result=document.querySelector('.game-over-card:not([hidden])');
        if(result) {
          const r=box(result),b=box(document.querySelector('#board'));
          if(r.y<b.y-1||r.bottom>b.bottom+1)problems.push({issue:'result outside board',result:r,board:b});
        }
        return {problems,clipped,overflow:document.documentElement.scrollWidth>innerWidth+1,
          board:box(document.querySelector('#board')),buttons:controls.filter(n=>n.closest('.board-actions,#actions')).map(n=>({label:label(n),...box(n)}))};
      });
      await page.screenshot({path:path.join(out,`${name}-play-state-${kind}-${layout}.png`)});
      report.push({layout,kind,...metrics});
      assert.equal(metrics.overflow,false,`${layout}/${kind}: page overflow`);
      assert.deepEqual(metrics.problems,[],`${layout}/${kind}: controls`);
      assert.deepEqual(metrics.clipped,[],`${layout}/${kind}: labels`);
      return metrics;
    };
    try {
      for (const kind of ['roll','move','partial','confirm','bearoff','blocked-bar','double','beaver','raccoon','re-beaver','resign','undo-request','bot','game-over','match-over']) {
        await seed(kind);
        if(kind==='bot')await page.getByRole('button',{name:'Cancel',exact:true}).waitFor();
        await inspect(kind);
        if(layout!=='desktop'&&['resign','undo-request','bot'].includes(kind)) {
          assert.ok(await page.locator('.table-action-status').isVisible(),'offers and waiting actions have visible context');
          assert.ok((await page.locator('.table-action-status').innerText()).length>10);
        }
        if(kind==='bot') {
          await page.getByRole('button',{name:'Cancel',exact:true}).click();
          await page.getByRole('button',{name:'Resume computer',exact:true}).waitFor();
          await inspect('bot-paused');
        }
        if(kind==='game-over'||kind==='match-over') {
          if(layout==='portrait') {
            const summary=await page.locator('#mobile-game-summary').boundingBox();
            assert.ok(summary.y+summary.height<=height+1,'the end-of-game summary fits below the buttons');
          }
          if(kind==='game-over'&&layout!=='desktop') {
            for(const size of layout==='portrait'?[[320,568],[375,667],[430,932]]:[[667,260],[932,310]]) {
              await page.setViewportSize({width:size[0],height:size[1]});
              await page.waitForTimeout(80);await page.evaluate(()=>scrollTo(0,0));
              await inspect(kind+'-'+size.join('x'));
            }
            await page.setViewportSize({width,height});await page.waitForTimeout(80);
          }
          // Geometry and label fit still apply when controls require scrolling
          // on a short landscape phone. Exercise each end-of-game destination.
          for(const selector of ['#next-game','#game-review','.board-actions a[href*="library"],#actions a[href*="library"]','#all-controls']) {
            const button=page.locator(selector);await button.scrollIntoViewIfNeeded();
            const b=await button.boundingBox();assert.ok(b.width>=90&&b.height>=44,`${layout}/${kind}: ${selector} usable`);
          }
          await page.locator('#game-review').click();
          await page.locator('dialog[open]').waitFor();await inspect(kind+'-review');
          await page.locator('dialog[open] .close').click();
          assert.equal(await page.locator('.board-actions a[href="/backgammon/library/#games"],#actions a[href="/backgammon/library/#games"]').count(),1);
          await page.locator('#all-controls').click();await inspect(kind+'-controls');
          await page.locator('dialog[open] .close').click();
          await page.locator('#next-game').click();
          await waitWork(page,w=>w.game.state.phase!=='over');
          await page.locator('#confirm').waitFor();await inspect(kind+'-next');
          assert.ok(await page.locator('.turn-tools #hint').isVisible(),'Hint returns in the new game');
        }
      }
      assert.deepEqual(errors,[]);
    } finally {await context.close();}
  }
  return report;
};
