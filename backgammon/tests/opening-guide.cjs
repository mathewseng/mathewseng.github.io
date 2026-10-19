const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async function openingGuide(browser,base,out,name){
  const results=[];
  for(const layout of ['desktop','portrait','landscape']){
    console.log(`Opening guide: ${name} ${layout}`);
    const touch=layout!=='desktop'&&name!=='firefox';
    const context=await browser.newContext({viewport:layout==='desktop'?{width:1440,height:1000}:layout==='portrait'?{width:390,height:844}:{width:844,height:390},hasTouch:touch,serviceWorkers:'block',reducedMotion:'reduce'});
    const page=await context.newPage(),errors=[],requests=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
    const activate=locator=>touch?locator.tap():locator.click();
    try{
      await page.goto(base+'/backgammon/#openings');
      await page.locator('#opening-panel').waitFor({state:'visible'});
      assert.equal(await page.locator('#opening-rolls button').count(),15);
      assert.equal(await page.locator('#opening-rolls [aria-pressed="true"]').getAttribute('data-roll'),'31');
      assert.equal(await page.locator('#opening-moves button').count(),1);
      assert.equal(await page.locator('#opening-board [data-point="4"] > .checker').count(),2);
      await page.evaluate(async()=>{
        const st=await import('/backgammon/core/storage.mjs');
        await st.put('work',{id:'opening-guide-test',sentinel:'unchanged'});
      });
      const rolls=await page.locator('#opening-rolls button').evaluateAll(ns=>ns.map(n=>n.dataset.roll));
      for(const roll of rolls){
        await activate(page.locator(`#opening-rolls [data-roll="${roll}"]`));
        assert.equal(await page.locator('#openings').getAttribute('data-roll'),roll);
        assert.equal(await page.locator('#opening-moves [aria-pressed="true"]').count(),1);
        const rows=page.locator('#opening-moves button');
        if(await rows.count()>1){
          await activate(rows.last());
          assert.equal(await rows.last().getAttribute('aria-pressed'),'true');
          assert.match(await page.locator('#opening-caption').textContent(),/Close alternative/);
        }
      }
      await activate(page.locator('#opening-rolls [data-roll="21"]'));
      await activate(page.locator('#opening-moves [data-choice="1"]'));
      const opening=await page.locator('#opening-moves [data-choice="1"] strong').textContent();
      await page.locator('#openings').screenshot({path:path.join(out,`${name}-opening-guide-${layout}.png`)});
      await activate(page.locator('#opening-next'));
      await page.waitForFunction(()=>document.querySelector('#openings').dataset.mode==='reply'&&document.querySelector('#openings').dataset.loading==='false');
      assert.match(await page.locator('#opening-context').textContent(),new RegExp(opening.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
      assert.equal(await page.locator('#opening-rolls button').count(),21);
      assert.equal(await page.locator('#opening-replies').getAttribute('aria-pressed'),'true');
      const replies=await page.locator('#opening-rolls button').evaluateAll(ns=>ns.map(n=>n.dataset.roll));
      for(const roll of replies){
        await activate(page.locator(`#opening-rolls [data-roll="${roll}"]`));
        await page.waitForFunction(roll=>document.querySelector('#openings').dataset.roll===roll&&document.querySelector('#openings').dataset.loading==='false',roll);
        assert.equal(await page.locator('#opening-moves [aria-pressed="true"]').count(),1);
        assert.match(await page.locator('#opening-board').getAttribute('aria-label'),/Black/);
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
      assert.equal(state.turn,1);assert.deepEqual(state.dice,[6,4]);
      assert.equal(state.rules.immediateRedoubles,0);
      await page.locator('#openings').screenshot({path:path.join(out,`${name}-opening-replies-${layout}.png`)});
      await activate(page.locator('#opening-openings'));
      assert.equal(await page.locator('#opening-moves [aria-pressed="true"] strong').textContent(),opening,'opening choice survives returning from replies');
      await page.locator('#opening-rolls [data-roll="31"]').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#openings').getAttribute('data-roll'),'31','keyboard can change roll');
      assert.equal(await page.evaluate(async()=> (await (await import('/backgammon/core/storage.mjs')).get('work','opening-guide-test')).sentinel),'unchanged');
      assert.equal(requests.filter(u=>u.includes('/opening-book-data/index.json')).length,1);
      assert.equal(requests.filter(u=>/\/opening-book-data\/reply-/.test(u)).length,1,'all 21 replies share a single position file');
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
