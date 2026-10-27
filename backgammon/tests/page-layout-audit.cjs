const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async(browser,base,out,name)=>{
 const report=[];
 for(const [layout,width,height,touch] of [['desktop',1366,768,false],['portrait',390,844,true],['landscape',844,390,true]]){
  const context=await browser.newContext({viewport:{width,height},hasTouch:touch,reducedMotion:'reduce',serviceWorkers:'block'});
  await context.addInitScript(()=>localStorage.setItem('backgammon.v1.settings',JSON.stringify({motion:'reduce',analysisAhead:false})));
  try{
   for(const route of ['','play','trainer','solver','openings','library','controls','reports','refresh']){
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    try{
     await page.goto(base+'/backgammon/'+(route?route+'/':''));
     await page.waitForFunction(()=>!document.querySelector('.app-boot'));
     await page.waitForLoadState('networkidle',{timeout:15000}).catch(()=>{});
     await page.evaluate(()=>document.fonts.ready);
     const inspect=()=>page.evaluate(()=>{
      const label=n=>n.id||n.getAttribute('aria-label')||n.textContent.trim().slice(0,45);
      const scope=document.querySelector('dialog[open]')||document;
      const visibleBox=n=>{
       const b=n.getBoundingClientRect();let {left,right,top,bottom}=b;
       for(let p=n.parentElement;p;p=p.parentElement){
        const s=getComputedStyle(p),r=p.getBoundingClientRect();
        if(s.overflowX!=='visible'){left=Math.max(left,r.left);right=Math.min(right,r.right);}
        if(s.overflowY!=='visible'){top=Math.max(top,r.top);bottom=Math.min(bottom,r.bottom);}
       }
       return {left,right,top,bottom};
      };
      const nodes=[...scope.querySelectorAll('button:not([disabled]),a.btn,.tool-nav a,summary,input:not([type=hidden])')].filter(n=>{
       const b=n.getBoundingClientRect(),s=getComputedStyle(n);
       const closed=n.closest('details:not([open])');
       if(closed&&!closed.querySelector(':scope > summary')?.contains(n))return false;
       return b.width>0&&b.height>0&&s.visibility!=='hidden'&&b.left>=0&&b.top>=0&&b.right<=innerWidth+1&&b.bottom<=innerHeight+1&&!n.closest('svg');
      });
      const overlaps=[];
      for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
       const a=nodes[i],b=nodes[j];if(a.contains(b)||b.contains(a))continue;
       const x=visibleBox(a),y=visibleBox(b);
       const w=Math.min(x.right,y.right)-Math.max(x.left,y.left),h=Math.min(x.bottom,y.bottom)-Math.max(x.top,y.top);
       if(w>2&&h>2)overlaps.push([label(a),label(b),Math.round(w),Math.round(h)]);
      }
      return {overflow:document.documentElement.scrollWidth>innerWidth+1,overlaps};
     });
     const metrics=await inspect();
     await page.screenshot({path:path.join(out,`${name}-audit-${route||'hub'}-${layout}.png`)});
     report.push({route:route||'hub',layout,...metrics,errors});
     if(route==='library'){
      await page.evaluate(async()=>{
       const st=await import('/backgammon/core/storage.mjs'),r=await import('/backgammon/core/rules.mjs');
       for(const title of ['Opening position','Race position with a longer name to check wrapping'])
        await st.put('items',st.itemRecord('position',{state:r.initialState({phase:'move',dice:[6,4]}),title,notes:'Saved in isolated audit storage.',tags:['practice','saved']}));
      });
      await page.reload();await page.locator('.library-item').first().waitFor();
      await page.screenshot({path:path.join(out,`${name}-audit-library-saved-${layout}.png`)});
      await page.locator('.library-item').first().click();
      await page.waitForFunction(()=>document.querySelector('#panel input, #panel textarea'));
      await page.screenshot({path:path.join(out,`${name}-audit-library-details-${layout}.png`)});
      report.push({route,layout,panel:'saved item',...await inspect()});
     }
     if(['controls','reports','hub'].includes(route||'hub')){
      await page.evaluate(()=>scrollTo(0,(document.documentElement.scrollHeight-innerHeight)/2));
      await page.screenshot({path:path.join(out,`${name}-audit-${route||'hub'}-body-${layout}.png`)});
      report.push({route:route||'hub',layout,part:'body',...await inspect()});
      await page.evaluate(()=>scrollTo(0,0));
     }
     // Check the settings and details sheets on the pages that provide them.
     if(['play','trainer','solver'].includes(route)){
      for(const trigger of ['#preferences','#panel-toggle']){
       if(!await page.locator(trigger).isVisible())continue;
       await page.locator(trigger).click();await page.locator('dialog[open]').waitFor();
       const dialog=await page.locator('dialog[open]').last().boundingBox();
       const geometry={...await inspect(),dialogFits:dialog.x>=-1&&dialog.y>=-1&&dialog.x+dialog.width<=width+1&&dialog.y+dialog.height<=height+1};
       await page.screenshot({path:path.join(out,`${name}-audit-${route}-${trigger.slice(1)}-${layout}.png`)});
       report.push({route,layout,panel:trigger,...geometry});
       await page.locator('dialog[open]').last().locator('.close').click();
       await page.locator('dialog[open]').waitFor({state:'hidden'});
      }
     }
     console.log(`AUDIT ${name} ${route||'hub'} ${layout}: ${JSON.stringify(metrics)}`);
    }finally{await page.close();}
   }
  }finally{await context.close();}
 }
 if(!process.env.BG_AUDIT_BASELINE)for(const row of report){
  assert.equal(row.overflow,false,JSON.stringify(row));
  assert.deepEqual(row.errors||[],[],JSON.stringify(row));
  assert.notEqual(row.dialogFits,false,JSON.stringify(row));
  assert.deepEqual(row.overlaps,[],JSON.stringify(row));
 }
 return report;
};
