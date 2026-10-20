const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async function openingGuide(browser,base,out,name){
  const results=[];
  const viewports={desktop:{width:1440,height:900},laptop:{width:1280,height:800},portrait:{width:390,height:844},landscape:{width:844,height:390},narrow:{width:320,height:568}};
  for(const [layout,viewport] of Object.entries(viewports)){
    console.log(`Opening guide: ${name} ${layout}`);
    const touch=!['desktop','laptop'].includes(layout)&&name!=='firefox';
    const context=await browser.newContext({viewport,hasTouch:touch,serviceWorkers:'block',reducedMotion:'reduce'});
    const page=await context.newPage(),errors=[],requests=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
    const activate=locator=>touch?locator.tap():locator.click();
    try{
      await page.goto(base+'/backgammon/#openings');
      await page.locator('#opening-panel').waitFor({state:'visible'});
      const matrix=async()=>{
        const cells=await page.locator('#opening-rolls button').evaluateAll(ns=>ns.map(n=>({
          x:Math.round(n.getBoundingClientRect().x),y:Math.round(n.getBoundingClientRect().y),
          width:n.getBoundingClientRect().width,overflows:n.scrollWidth>n.clientWidth+1,text:n.querySelector('.opening-roll-notation').textContent,
          idea:n.querySelector('.opening-roll-idea').textContent,disabled:n.disabled,
          roll:n.dataset.roll,canonical:n.dataset.canonical,
          dice:[...n.querySelectorAll('.opening-dice svg')].map(d=>d.querySelectorAll('circle').length),label:n.getAttribute('aria-label'),
        })));
        assert.equal(cells.length,21);
        assert.equal(new Set(cells.map(c=>c.canonical)).size,21,'each dice combination appears exactly once');
        assert.equal(new Set(cells.map(c=>c.x)).size,6,'six columns');
        assert.equal(new Set(cells.map(c=>c.y)).size,6,'six rows');
        const columns=[...new Set(cells.map(c=>c.x))].sort((a,b)=>a-b),rows=[...new Set(cells.map(c=>c.y))].sort((a,b)=>a-b);
        assert.deepEqual(rows.map(y=>cells.filter(c=>c.y===y).length),[6,5,4,3,2,1],'upper-right triangle');
        assert.ok(cells.every(c=>c.roll[0]<=c.roll[1]&&c.x===columns[+c.roll[1]-1]&&c.y===rows[+c.roll[0]-1]),'removed duplicates leave the lower-left half empty');
        for(const c of cells){
          assert.deepEqual(c.dice,[...c.canonical].map(Number),'higher die appears first in every button');
          assert.ok(c.label.includes(c.dice.join('–')),'accessible roll name matches the visible dice');
        }
        assert.ok(cells.every(c=>c.width>=44&&c.idea&&c.idea!=='…'&&(c.disabled||c.text)),
          'readable touch targets include notation and a move description');
        assert.ok(cells.every(c=>!c.overflows),'move labels stay within their grid cells');
        const appearance=await page.locator('#opening-rolls button').evaluateAll(ns=>{
          const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
          const ctx=canvas.getContext('2d',{willReadFrequently:true});
          const luminance=color=>{
            ctx.fillStyle=color;ctx.fillRect(0,0,1,1);
            return [...ctx.getImageData(0,0,1,1).data].slice(0,3).map(v=>v/255)
              .map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
          };
          const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
          return ns.map(n=>{
            const bounds=n.getBoundingClientRect(),band=n.querySelector('.opening-alternative-colors'),b=band.getBoundingClientRect();
            const labels=[...n.querySelectorAll('.opening-roll-alternative')],segments=[...band.children],style=getComputedStyle(n);
            const textColor=getComputedStyle(n.querySelector('.opening-roll-idea')).color;
            const walker=document.createTreeWalker(n.querySelector('.opening-roll-content'),NodeFilter.SHOW_TEXT),clipped=[];
            while(walker.nextNode()){
              const text=walker.currentNode;if(!text.textContent.trim())continue;
              const range=document.createRange();range.selectNodeContents(text);
              if([...range.getClientRects()].some(r=>r.x<bounds.x-.5||r.right>bounds.right+.5||r.y<bounds.y-.5||r.bottom>bounds.bottom+.5))clipped.push(text.textContent);
            }
            return {roll:n.dataset.roll,disabled:n.disabled,kind:n.dataset.openingKind,clipped,
              contrast:n.disabled?7:contrast(textColor,style.backgroundColor),
              faint:labels.every(l=>getComputedStyle(l).color!==getComputedStyle(n.querySelector('.opening-roll-notation')).color),
              hidden:band.hidden,labels:labels.map(l=>l.dataset.openingKind),
              third:band.hidden||Math.abs(b.height-n.clientHeight/3)<1,
              bottom:band.hidden||Math.abs(b.bottom-(bounds.bottom-1))<1,
              segments:segments.map((s,i)=>{const r=s.getBoundingClientRect();return {
                kind:s.dataset.openingKind,contrast:contrast(textColor,getComputedStyle(s).backgroundColor),
                fits:Math.abs(r.width-b.width/segments.length)<1&&Math.abs(r.x-(b.x+i*b.width/segments.length))<1&&Math.abs(r.y-b.y-parseFloat(getComputedStyle(band).borderTopWidth))<1,
              };}),
            };
          });
        });
        for(const c of appearance){
          assert.deepEqual(c.clipped,[],`${c.roll}: no clipped text`);
          assert.ok(c.contrast>=4.5,`${c.roll}: muted text contrast ${c.contrast}`);
          if(c.disabled){assert.equal(c.kind,undefined);continue;}
          assert.ok(c.kind&&c.faint,`${c.roll}: best is prominent, alternatives are fainter`);
          assert.equal(c.hidden,c.labels.length===0);
          assert.deepEqual(c.segments.map(s=>s.kind),c.labels,'alternative colors follow notation order');
          assert.ok(c.third&&c.bottom,'color band occupies precisely the bottom third');
          assert.ok(c.segments.every(s=>s.fits&&s.contrast>=4.5),`${c.roll}: horizontal segments have equal width and legible text: ${JSON.stringify(c.segments)}`);
        }
      };
      const alternativesMatch=async()=>{
        const button=page.locator('#opening-rolls [aria-pressed="true"]');
        const labels=await button.locator('.opening-alternative-notation').evaluateAll(ns=>ns.map(n=>[...n.children].map(s=>s.textContent).join(' ')));
        const ranked=await page.locator('#opening-moves button strong').allTextContents();
        assert.deepEqual(labels,ranked.slice(1),'roll button includes every close alternative in ranked order');
        if(labels.length)assert.match(await button.getAttribute('aria-label'),/Close alternatives:/);
      };
      await matrix();
      assert.equal(await page.locator('#opening-rolls button:disabled').count(),6);
      assert.equal(await page.locator('#opening-side').isVisible(),false);
      assert.equal(await page.locator('#opening-rolls [aria-pressed="true"]').getAttribute('data-roll'),'13');
      assert.equal(await page.locator('#opening-moves button').count(),1);
      assert.equal(await page.locator('#opening-board [data-point="4"] > .checker').count(),2);
      await page.evaluate(async()=>{
        const st=await import('/backgammon/core/storage.mjs');
        await st.put('work',{id:'opening-guide-test',sentinel:'unchanged'});
      });
      const rolls=await page.locator('#opening-rolls button:enabled').evaluateAll(ns=>ns.map(n=>n.dataset.roll));
      assert.equal(rolls.length,15);
      for(const roll of rolls){
        await activate(page.locator(`#opening-rolls [data-roll="${roll}"]`));
        assert.equal(await page.locator('#openings').getAttribute('data-roll'),[...roll].reverse().join(''));
        assert.equal(await page.locator('#opening-moves [aria-pressed="true"]').count(),1);
        await alternativesMatch();
        const rows=page.locator('#opening-moves button');
        if(await rows.count()>1){
          await activate(rows.last());
          assert.equal(await rows.last().getAttribute('aria-pressed'),'true');
          assert.match(await page.locator('#opening-caption').textContent(),/Close alternative/);
        }
      }
      await activate(page.locator('#opening-rolls [data-roll="12"]'));
      assert.equal(await page.locator('#openings').getAttribute('data-roll'),'21','upper-right cell maps to its canonical opening');
      assert.equal(await page.locator('#opening-rolls [aria-pressed="true"]').getAttribute('data-roll'),'12');
      await activate(page.locator('#opening-moves [data-choice="1"]'));
      const opening=await page.locator('#opening-moves [data-choice="1"] strong').textContent();
      await page.locator('#openings').screenshot({path:path.join(out,`${name}-opening-guide-${layout}.png`)});
      await activate(page.locator('#opening-next'));
      await page.waitForFunction(()=>document.querySelector('#openings').dataset.mode==='reply'&&document.querySelector('#openings').dataset.loading==='false');
      assert.match(await page.locator('#opening-context').textContent(),new RegExp(opening.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
      await matrix();
      assert.equal(await page.locator('#opening-rolls button:disabled').count(),0,'doubles are playable replies');
      assert.equal(await page.locator('#opening-side [aria-pressed="true"]').getAttribute('data-side'),'0','White replies by default');
      assert.equal(await page.locator('#opening-replies').getAttribute('aria-pressed'),'true');
      const replies=await page.locator('#opening-rolls button').evaluateAll(ns=>ns.map(n=>n.dataset.roll));
      assert.equal(replies.length,21);
      for(const roll of replies){
        await activate(page.locator(`#opening-rolls [data-roll="${roll}"]`));
        await page.waitForFunction(roll=>document.querySelector('#openings').dataset.roll===roll&&document.querySelector('#openings').dataset.loading==='false',[...roll].reverse().join(''));
        assert.equal(await page.locator('#opening-moves [aria-pressed="true"]').count(),1);
        await alternativesMatch();
        assert.match(await page.locator('#opening-board').getAttribute('aria-label'),/White/);
      }
      await activate(page.locator('#opening-rolls [data-roll="46"]'));
      await page.waitForFunction(()=>document.querySelector('#openings').dataset.roll==='64');
      if(await page.locator('#opening-moves button').count()>1)await activate(page.locator('#opening-moves button').last());
      const selected=await page.locator('#opening-moves [aria-pressed="true"] strong').textContent();
      await activate(page.locator('#opening-before'));
      assert.equal(await page.locator('#opening-before').getAttribute('aria-pressed'),'true');
      assert.equal(await page.locator('#opening-board .last-move-arrows').count(),0);
      await activate(page.locator('#opening-after'));
      assert.equal(await page.locator('#opening-after').getAttribute('aria-pressed'),'true');
      assert.ok(await page.locator('#opening-board .last-move-arrows').count());
      assert.ok((await page.locator('#opening-caption').textContent()).includes(selected));
      const state=JSON.parse(new URLSearchParams(new URL(await page.locator('#opening-solver').getAttribute('href')).hash.slice(1)).get('state'));
      assert.equal(state.turn,0);assert.deepEqual(state.dice,[6,4]);
      assert.equal(state.rules.immediateRedoubles,0);
      await page.locator('#openings').screenshot({path:path.join(out,`${name}-opening-replies-${layout}.png`)});
      const whiteNotation=await page.locator('#opening-moves button').first().locator('strong').textContent();
      await activate(page.locator('#opening-side [data-side="1"]'));
      await page.waitForFunction(()=>document.querySelector('#opening-board').getAttribute('aria-label').startsWith('Black')&&document.querySelector('#openings').dataset.loading==='false');
      await matrix();
      const black=JSON.parse(new URLSearchParams(new URL(await page.locator('#opening-solver').getAttribute('href')).hash.slice(1)).get('state'));
      assert.equal(black.turn,1);
      assert.deepEqual(black.points,state.points.toReversed().map(n=>-n||0));
      assert.equal(await page.locator('#opening-moves button').first().locator('strong').textContent(),whiteNotation);
      await activate(page.locator('#opening-side [data-side="0"]'));
      await page.waitForFunction(()=>document.querySelector('#opening-board').getAttribute('aria-label').startsWith('White')&&document.querySelector('#openings').dataset.loading==='false');
      await activate(page.locator('#opening-openings'));
      assert.equal(await page.locator('#opening-moves [aria-pressed="true"] strong').textContent(),opening,'opening choice survives returning from replies');
      await page.locator('#opening-rolls [data-roll="16"]').focus();
      // Safari's Option-Tab includes buttons when full keyboard access is off.
      await page.keyboard.press(name==='webkit'?'Alt+Tab':'Tab');
      assert.equal(await page.evaluate(()=>document.activeElement.dataset.roll),'23','keyboard skips the empty triangle and disabled opening ties');
      await page.locator('#opening-rolls [data-roll="13"]').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#openings').getAttribute('data-roll'),'31','keyboard can change roll');
      assert.equal(await page.evaluate(async()=> (await (await import('/backgammon/core/storage.mjs')).get('work','opening-guide-test')).sentinel),'unchanged');
      assert.equal(requests.filter(u=>u.includes('/opening-book-data/deep/index.json')).length,1);
      assert.equal(requests.filter(u=>/\/opening-book-data\/deep\/reply-/.test(u)).length,1,'all 21 replies share a single position file');
      // This reply has nine alternatives. Keep all of them readable at 320px,
      // and keep the color band proportional even when its row grows taller.
      await activate(page.locator('#opening-rolls [data-roll="36"]'));
      await activate(page.locator('#opening-next'));
      await page.waitForFunction(()=>document.querySelector('#openings').dataset.mode==='reply'&&document.querySelector('#openings').dataset.loading==='false');
      await activate(page.locator('#opening-rolls [data-roll="23"]'));
      assert.equal(await page.locator('#opening-moves button').count(),10);
      await alternativesMatch();await matrix();
      await page.locator('#opening-rolls').screenshot({path:path.join(out,`${name}-opening-many-alternatives-${layout}.png`)});
      const choicesBefore=await page.locator('#opening-moves button strong').allTextContents();
      const colorsBefore=await page.locator('#opening-rolls button').evaluateAll(ns=>ns.map(n=>[n.dataset.roll,n.dataset.openingKind,...[...n.querySelectorAll('.opening-alternative-colors > span')].map(s=>s.dataset.openingKind)]));
      await activate(page.locator('#opening-layout [data-layout="compact"]'));
      assert.equal(await page.locator('#openings').getAttribute('data-layout'),'compact');
      assert.equal(await page.locator('#opening-layout [aria-pressed="true"]').getAttribute('data-layout'),'compact');
      await matrix();
      assert.deepEqual(await page.locator('#opening-rolls button').evaluateAll(ns=>ns.map(n=>[n.dataset.roll,n.dataset.openingKind,...[...n.querySelectorAll('.opening-alternative-colors > span')].map(s=>s.dataset.openingKind)])),colorsBefore,'same color arrangement in Compact');
      assert.ok(await page.locator('#opening-rolls button').evaluateAll(ns=>ns.every(n=>!n.innerText.trim()&&n.querySelectorAll('.opening-dice svg').length===2)),'compact cells show just two dice');
      const compactBounds=await page.evaluate(()=>{
        const rect=s=>document.querySelector(s).getBoundingClientRect().toJSON();
        return {grid:rect('#opening-rolls'),board:rect('#opening-board'),list:rect('#opening-moves')};
      });
      assert.ok(compactBounds.grid.height<=320,'all dice buttons fit in a compact six-row block');
      if(viewport.width>760){
        assert.ok(compactBounds.grid.x>=compactBounds.board.right,'dice grid sits beside the board');
        assert.ok(compactBounds.list.height<=281,'long equity list scrolls beside the board');
      }else assert.ok(compactBounds.grid.y>=compactBounds.board.bottom,'phone portrait stacks usable targets below the board');
      assert.equal(await page.locator('#opening-moves .opening-equity:visible').count(),10,'every next-best move retains its equity');
      await activate(page.locator('#opening-moves button').last());
      assert.ok((await page.locator('#opening-caption').textContent()).includes(choicesBefore.at(-1)),'compact move rows preview their choice');
      await page.locator('#openings').screenshot({path:path.join(out,`${name}-opening-compact-${layout}.png`)});
      await activate(page.locator('#opening-layout [data-layout="expanded"]'));
      assert.equal(await page.locator('#opening-picker').evaluate(n=>n.parentElement.id),'opening-controls');
      assert.equal(await page.locator('#opening-moves [aria-pressed="true"] strong').textContent(),choicesBefore.at(-1),'changing layouts preserves the selected alternative');
      await activate(page.locator('#opening-layout [data-layout="compact"]'));
      const selectedVisible=await page.locator('#opening-moves').evaluate(n=>{
        const list=n.getBoundingClientRect(),choice=n.querySelector('[aria-pressed="true"]').getBoundingClientRect();
        return choice.top>=list.top-1&&choice.bottom<=list.bottom+1;
      });
      assert.ok(selectedVisible,'Compact reveals the selected alternative in its scrollable list');
      await activate(page.locator('#opening-side [data-side="1"]'));
      await page.waitForFunction(()=>document.querySelector('#opening-board').getAttribute('aria-label').startsWith('Black')&&document.querySelector('#openings').dataset.loading==='false');
      assert.equal(await page.locator('#openings').getAttribute('data-layout'),'compact');
      await matrix();
      await activate(page.locator('#opening-openings'));
      assert.equal(await page.locator('#opening-rolls button:disabled').count(),6);
      assert.equal(await page.locator('#opening-compact-picker #opening-picker').count(),1);
      await page.reload();
      await page.locator('#opening-panel').waitFor({state:'visible'});
      assert.equal(await page.locator('#openings').getAttribute('data-layout'),'compact','layout preference survives reload');
      assert.equal(requests.filter(u=>/\/engine\/vendor\/|engine\/worker/.test(u)).length,0,'guide never starts live search');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      assert.deepEqual(errors,[]);
      results.push({layout,openings:15,replies:21});
    }catch(error){
      await page.screenshot({path:path.join(out,`${name}-opening-guide-${layout}-failure.png`),fullPage:true});
      console.error(await page.evaluate(()=>({scrollY,roll:document.querySelector('#openings').dataset.roll,
        buttons:[...document.querySelectorAll('#opening-moves button')].map(n=>({text:n.textContent,rect:n.getBoundingClientRect().toJSON()}))})));
      throw error;
    }finally{await context.close();}
  }
  // Errors remain local to study content. Retry reloads failed files and a
  // slow reply cannot overwrite a newer roll or a return to the opening view.
  const context=await browser.newContext({serviceWorkers:'block',reducedMotion:'reduce'}),page=await context.newPage();
  try{
    let failIndex=true,failReply=true;
    await page.route('**/opening-book-data/deep/index.json',route=>failIndex?(failIndex=false,route.fulfill({status:503,body:''})):route.continue());
    await page.route('**/opening-book-data/deep/reply-*.json',async route=>{
      if(failReply){failReply=false;return route.fulfill({status:503,body:''});}
      await new Promise(r=>setTimeout(r,250));return route.continue();
    });
    await page.goto(base+'/backgammon/#openings');
    await page.locator('#opening-retry').waitFor({state:'visible'});
    assert.ok(await page.locator('#hub-play').isEnabled());
    await page.locator('#opening-retry').click();
    await page.locator('#opening-panel').waitFor({state:'visible'});
    await page.locator('#opening-replies').click();
    await page.locator('#opening-retry').waitFor({state:'visible'});
    await page.locator('#opening-retry').click();
    await page.locator('#opening-rolls [data-roll="66"]').click();
    await page.waitForFunction(()=>document.querySelector('#openings').dataset.mode==='reply'&&document.querySelector('#openings').dataset.roll==='66'&&document.querySelector('#openings').dataset.loading==='false');
    await page.locator('#opening-openings').click();
    assert.equal(await page.locator('#openings').getAttribute('data-mode'),'opening');
    assert.equal(await page.locator('#opening-retry').isVisible(),false);
    results.push({retry:true,latestRollWins:true});
  }finally{await context.close();}
  return results;
};
