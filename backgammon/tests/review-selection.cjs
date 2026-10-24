const assert = require("node:assert/strict"), path = require("node:path");

// Real GNUbg candidates: all entry points into a preview agree on its selected
// state. In particular, a ranked row's "Move 3" label must select "Your move".
module.exports = async function reviewSelection(browser, base, out, name) {
  const context = await browser.newContext({viewport:{width:1366,height:768}, hasTouch:true, serviceWorkers:"block", reducedMotion:"reduce"});
  const page = await context.newPage(), errors=[];
  page.on("pageerror", e=>errors.push(e.message));
  try {
    await page.goto(base+"/backgammon/");
    await page.evaluate(async()=>{
      const {initialState}=await import("/backgammon/core/rules.mjs");
      const {EngineClient}=await import("/backgammon/engine/client.mjs");
      const {decisionReview}=await import("/backgammon/ui/decision-review.mjs");
      const source=initialState({phase:"move",dice:[4,3],matchLength:0});
      const engine=new EngineClient();
      try {
        const result=await engine.analyze(source,{preset:"quick"});
        window.openReview=(opponent=false,same=false)=>decisionReview(source,{opponent,title:"Checker decision",onReturn:()=>{}})
          .result({...result,actual:result.candidates[same?0:2]},false);
        window.openReview();
      } finally {engine.destroy();}
    });
    const active=page.locator('.review-move[aria-pressed="true"]');
    assert.equal(await active.getAttribute("data-rank"),"1");
    await page.locator('.review-move[data-rank="3"]').click();
    assert.equal(await active.getAttribute("data-rank"),"3");
    assert.equal(await page.locator('.review-move[aria-pressed="true"]').getAttribute("data-rank"),"3");
    await page.getByRole("button",{name:"Position",exact:true}).click();
    assert.equal(await active.getAttribute("data-preview"),"position");
    assert.equal(await page.locator('.review-move[data-rank][aria-pressed="true"]').count(),0);
    await page.locator('.review-move[data-rank="3"]').click();
    assert.equal(await active.getAttribute("data-rank"),"3");
    await page.locator('.review-move[data-rank="2"]').click();
    assert.equal(await active.getAttribute("data-rank"),"2");
    await page.locator('.review-move[data-rank="1"]').click();
    assert.equal(await active.getAttribute("data-rank"),"1");
    const colors=await page.locator('.review-move').evaluateAll(es=>es.map(e=>({active:e.getAttribute("aria-pressed"),bg:getComputedStyle(e).backgroundColor})));
    assert.notEqual(colors.find(c=>c.active==="true").bg,colors.find(c=>c.active==="false").bg,"active preview has an unmistakable filled surface");
    for(const [width,height] of [[320,568],[375,667],[390,844],[430,932],[844,390],[768,1024],[1024,768],[1366,768],[1440,900]]) {
      await page.setViewportSize({width,height});

      if([390,1366].includes(width)) await page.screenshot({path:path.join(out,`${name}-review-selection-comparison-${width}.png`)});

      await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      assert.equal(await page.locator('.decision-dialog select').count(),0);
      await page.locator('.review-move[data-rank="3"]').click();
      assert.equal(await active.getAttribute("data-rank"),"3");
      await page.getByRole('button',{name:'Position',exact:true}).click();
      assert.equal(await active.getAttribute("data-preview"),"position");
      await page.locator('.review-move[data-rank="1"]').click();
      assert.equal(await active.getAttribute("data-rank"),"1");
      const fits=await page.locator('.decision-dialog').evaluate(d=>({
        x:d.scrollWidth<=d.clientWidth+1, y:d.scrollHeight<=d.clientHeight+1,
        controls:[...d.querySelectorAll('.review-position, .review-depth-options button')]
          .filter(b=>b.getBoundingClientRect().height).every(b=>{const r=b.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1}),
      }));
      assert.deepEqual(fits,{x:true,y:true,controls:true},`${width}×${height}`);
      await page.screenshot({path:path.join(out,`${name}-review-selection-${width}.png`)});
    }
    await page.keyboard.press("Escape");
    await page.locator(".decision-dialog").waitFor({state:"detached"});
    for(const [opponent,same,label] of [[true,false,"Opponent’s move"],[false,true,"Best/your move"],[true,true,"Best/their move"]]) {
      await page.evaluate(([opponent,same])=>window.openReview(opponent,same),[opponent,same]);
      if(!same) await page.locator('.review-move[data-rank="3"]').click();
      assert.match(await active.textContent(),same?new RegExp(label):/Opponent’s choice/);
      assert.equal(await active.count(),1);
      assert.equal(await page.locator('.decision-choices button').count(),0);
      await page.keyboard.press("Escape");
    await page.locator(".decision-dialog").waitFor({state:"detached"});
    }
    assert.deepEqual(errors,[]);
    return {browser:name,realEngine:true,viewports:9,buttons:true,rankedRows:true,directMoveButtons:true,sharedBest:true};
  } finally {await context.close();}
};
