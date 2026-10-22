const assert = require('node:assert/strict');
const path = require('node:path');

module.exports = async function verifyUI(browser,base,out,name) {
  const context = await browser.newContext({viewport:{width:1366,height:768},serviceWorkers:'block',reducedMotion:'reduce'});
  const page = await context.newPage(), errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  try {
    await page.goto(base+'/backgammon/');
    const url=await page.evaluate(async()=> {
      const {shareURL}=await import('/backgammon/core/xgid.mjs');
      const fixtures=await (await fetch('/backgammon/data/exercises.json')).json();
      return shareURL(fixtures.items.find(row=>row.id==='bearoff-7-181').state);
    });
    await page.goto(url);
    await page.waitForFunction(()=>document.querySelector('#analyze')?.textContent==='Analyze' &&
      document.querySelector('#analysis-budget')?.textContent.includes('completed'));
    await page.getByText('Analysis settings',{exact:true}).click();
    const control=page.getByLabel('Analysis strength',{exact:true}).locator('[data-choice="verify"]');
    await control.click();
    assert.equal(await control.getAttribute('aria-pressed'),'true');
    await page.locator('#analyze').click();
    await page.waitForFunction(()=>document.querySelector('#analyze')?.textContent==='Analyze' &&
      document.querySelector('#panel')?.textContent.includes('Verify · unpruned · 4 ply'),null,{timeout:60000});
    await page.getByText('Analysis method & limits',{exact:true}).click();
    const explanation=page.getByText('Verify evaluates every displayed 4-ply checker finalist',{exact:false});
    await explanation.waitFor({state:'visible'});
    const text=await explanation.innerText();
    assert.match(text,/without GNUbg’s internal pruning network/);
    assert.match(text,/shortlist and its 3-ply leader check still use normal pruning/);
    assert.match(text,/does not establish greater playing strength or agreement with XG/);
    const screenshots=[];
    for(const [width,height] of [[1366,768],[390,844]]) {
      await page.setViewportSize({width,height});
      // The responsive shell rebuilds the result panel when it moves into the
      // phone sheet. Wait for that resize before opening the new details node.
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      if(width<=1024) await page.locator('#panel-toggle').click();
      if(!await explanation.isVisible()) await page.getByText('Analysis method & limits',{exact:true}).click();
      await explanation.waitFor({state:'visible'});
      await explanation.scrollIntoViewIfNeeded();
      // Inspect the painted scroll position inside the results sheet.
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const layout=await explanation.evaluate(node=> {
        const r=node.getBoundingClientRect(),style=getComputedStyle(node),body=node.closest('.dialog-body')?.getBoundingClientRect();
        return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,fontSize:parseFloat(style.fontSize),
          scrollViewport:body?{top:body.top,bottom:body.bottom}:null,
          overflow:document.documentElement.scrollWidth>innerWidth+1};
      });
      assert.ok(!layout.overflow && layout.left>=-1 && layout.right<=width+1,`Verify method fits ${width}: ${JSON.stringify(layout)}`);
      assert.ok(layout.top>=-1 && layout.bottom<=height+1,`Verify method readable within viewport ${width}: ${JSON.stringify(layout)}`);
      if(layout.scrollViewport)assert.ok(layout.top>=layout.scrollViewport.top-1&&layout.bottom<=layout.scrollViewport.bottom+1,
        `Verify method fits the results sheet's scrollable body: ${JSON.stringify(layout)}`);
      assert.ok(layout.fontSize>=12,'Verify explanation keeps a readable font size');
      const file=`${name}-verify-method-${width}.png`;
      await page.screenshot({path:path.join(out,file),animations:'disabled'});screenshots.push(file);
      assert.ok(await explanation.isVisible(),'Verify method remains expanded in the captured layout');
    }
    assert.deepEqual(errors,[]);
    return {browser:name,fixture:'bearoff-7-181',actualNativeSearch:true,selector:true,method:text,screenshots};
  } finally {await context.close();}
};
