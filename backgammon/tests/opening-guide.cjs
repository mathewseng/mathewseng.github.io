const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async function openingGuide(browser,base,out,name){
  const results=[];
  for(const layout of ['desktop','portrait','landscape','narrow']){
    console.log(`Opening guide: ${name} ${layout}`);
    const touch=layout!=='desktop'&&name!=='firefox';
    const context=await browser.newContext({viewport:layout==='desktop'?{width:1440,height:1000}:layout==='portrait'?{width:390,height:844}:layout==='narrow'?{width:320,height:568}:{width:844,height:390},hasTouch:touch,serviceWorkers:'block',reducedMotion:'reduce'});
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
        })));
        assert.equal(cells.length,36);
        assert.equal(new Set(cells.map(c=>c.x)).size,6,'six columns');
        assert.equal(new Set(cells.map(c=>c.y)).size,6,'six rows');
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
      assert.equal(await page.locator('#opening-rolls [aria-pressed="true"]').getAttribute('data-roll'),'31');
      assert.equal(await page.locator('#opening-moves button').count(),1);
      assert.equal(await page.locator('#opening-board [data-point="4"] > .checker').count(),2);
      await page.evaluate(async()=>{
        const st=await import('/backgammon/core/storage.mjs');
        await st.put('work',{id:'opening-guide-test',sentinel:'unchanged'});
      });
      const rolls=await page.locator('#opening-rolls button').evaluateAll(ns=>ns.map(n=>n.dataset.roll).filter(r=>r[0]>r[1]));
      for(const roll of rolls){
        await activate(page.locator(`#opening-rolls [data-roll="${roll}"]`));
        assert.equal(await page.locator('#openings').getAttribute('data-roll'),roll);
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
      assert.equal(await page.locator('#openings').getAttribute('data-roll'),'21','either dice order shares the same opening');
      assert.equal(await page.locator('#opening-rolls [aria-pressed="true"]').getAttribute('data-roll'),'12');
      await activate(page.locator('#opening-rolls [data-roll="21"]'));
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
      const replies=await page.locator('#opening-rolls button').evaluateAll(ns=>ns.map(n=>n.dataset.roll).filter(r=>r[0]>=r[1]));
      for(const roll of replies){
        await activate(page.locator(`#opening-rolls [data-roll="${roll}"]`));
        await page.waitForFunction(roll=>document.querySelector('#openings').dataset.roll===roll&&document.querySelector('#openings').dataset.loading==='false',roll);
        assert.equal(await page.locator('#opening-moves [aria-pressed="true"]').count(),1);
        await alternativesMatch();
        assert.match(await page.locator('#opening-board').getAttribute('aria-label'),/White/);
      }
      await activate(page.locator('#opening-rolls [data-roll="64"]'));
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
      await page.locator('#opening-rolls [data-roll="31"]').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#openings').getAttribute('data-roll'),'31','keyboard can change roll');
      assert.equal(await page.evaluate(async()=> (await (await import('/backgammon/core/storage.mjs')).get('work','opening-guide-test')).sentinel),'unchanged');
      assert.equal(requests.filter(u=>u.includes('/opening-book-data/index.json')).length,1);
      assert.equal(requests.filter(u=>/\/opening-book-data\/reply-/.test(u)).length,1,'all 21 replies share a single position file');
      // This reply has nine alternatives. Keep all of them readable at 320px,
      // and keep the color band proportional even when its row grows taller.
      await activate(page.locator('#opening-rolls [data-roll="63"]'));
      await activate(page.locator('#opening-next'));
      await page.waitForFunction(()=>document.querySelector('#openings').dataset.mode==='reply'&&document.querySelector('#openings').dataset.loading==='false');
      await activate(page.locator('#opening-rolls [data-roll="32"]'));
      assert.equal(await page.locator('#opening-moves button').count(),10);
      await alternativesMatch();await matrix();
      await page.locator('#opening-rolls').screenshot({path:path.join(out,`${name}-opening-many-alternatives-${layout}.png`)});
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
    await page.route('**/opening-book-data/index.json',route=>failIndex?(failIndex=false,route.fulfill({status:503,body:''})):route.continue());
    await page.route('**/opening-book-data/reply-*.json',async route=>{
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
