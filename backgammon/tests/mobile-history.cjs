const assert = require("node:assert/strict"), path = require("node:path");
module.exports = async function mobileHistory(browser, base, out, name) {
  const context = await browser.newContext({viewport:{width:390,height:844},hasTouch:true,reducedMotion:"reduce",serviceWorkers:"block"});
  const page = await context.newPage(), errors = [];
  page.on("pageerror", e => errors.push(e.message));
  const shot = label => page.screenshot({path:path.join(out,`${name}-mobile-history-${label}.png`)});
  const saved = () => page.evaluate(async () => (await import("/backgammon/core/storage.mjs")).get("work","play"));
  try {
    await page.goto(base + "/backgammon/play/");
    const fixture = await page.evaluate(async () => {
      const r = await import("/backgammon/core/rules.mjs"), t = await import("/backgammon/core/table.mjs"), s = await import("/backgammon/core/storage.mjs");
      s.saveSettings({interactionMode:"beginner"});
      const initial = r.initialState({phase:"roll",matchLength:0});
      let game = {id:"mobile-history",started:true,names:["You","GNUbg"],initial,state:initial,events:[],
        config:{mode:"computer",humanSide:0,matchLength:0,rules:initial.rules,strength:"quick",reviewStrength:"quick",tutor:true,warning:false}};
      for (let p=0;p<2;p++) {
        game=t.playAction(game,{type:"roll",dice:[3,1]});
        game=t.playAction(game,{type:"move",steps:r.legalTurns(game.state)[0].steps});
      }
      game=t.playAction(game,{type:"roll",dice:[4,2]});
      await s.put("work",{id:"play",game,positionKey:r.positionKey(game.state),draft:[]});
      return game.state;
    });
    await page.goto(base + "/backgammon/play/#resume=mobile-history");
    await page.reload();
    await page.locator("#confirm").waitFor();
    await page.locator('#mobile-game-summary > summary').tap();
    const board = await page.locator("#board").boundingBox();
    const sourcePicker = page.getByLabel("Select a checker",{exact:true});
    if (!await sourcePicker.inputValue()) await sourcePicker.selectOption({index:1});
    await page.getByLabel("Move selected checker",{exact:true}).selectOption({index:1});
    await page.locator(".draft-progress").waitFor();
    assert.match(await page.locator(".draft-progress-moves").textContent(), /(\d+|bar)\//);
    assert.match(await page.locator(".draft-progress-status").textContent(), /1 move left|Ready to confirm/);
    assert.deepEqual(await page.locator("#board").boundingBox(),board,"draft status never resizes the board");
    await shot("draft");
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press("z");
    await page.locator(".draft-progress").waitFor({state:"detached"});
    assert.match(await page.locator("#message").textContent(), /Use all playable dice|Enter from the bar/);
    assert.deepEqual((await saved()).game.state,fixture,"undo only changes the draft");
    // Complete through the same accessible move controller, then show notation
    // at every supported size without moving the board or hiding Confirm.
    await page.locator("#panel-toggle").tap();
    for (let i=0;i<4 && await page.locator("#confirm").isDisabled();i++)
      await page.getByLabel("Accessible move selection",{exact:true}).selectOption({index:1});
    await page.locator("#details-dialog .close").tap();
    assert.equal(await page.locator(".draft-progress-status").textContent(),"Ready to confirm");
    for (const [width,height] of [[320,568],[375,667],[390,844],[430,932],[844,390],[768,1024],[1366,768]]) {
      await page.setViewportSize({width,height});
      await page.evaluate(()=>scrollTo(0,0));
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      if (width>320) {
        const action=await page.locator("#confirm").boundingBox();
        assert.ok(action.y+action.height<=height+1,`Confirm fits ${width}x${height}`);
      }
      await shot(`ready-${width}`);
    }
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press("x");
    await page.locator(".draft-progress").waitFor({state:"detached"});
    // Real GNUbg results, including both players' checker and cube decisions.
    await page.waitForFunction(()=>document.querySelectorAll(".feedback-review").length===3,null,{timeout:60000});
    assert.equal(await page.locator('[data-history-filter="self"]').getAttribute("aria-pressed"),"true","You is selected by default");
    assert.deepEqual(await page.locator(".history-turn").evaluateAll(es=>es.map(e=>[...e.querySelectorAll(".feedback-review")].map(b=>b.dataset.decisionType))),
      [["cube"],["cube","checker"]]);
    const original=await saved();
    await page.locator("#analysis-jump").tap();
    assert.equal(await page.locator(".feedback-review").count(),3);
    assert.equal(await page.locator(".history-turn").count(),2);
    assert.equal(await page.locator('.feedback-review[data-history-side="opponent"]').count(),0);
    assert.match(await page.locator('[data-history-filter="self"]').getAttribute("aria-label"), /3 decisions/);
    await shot("your-decisions");
    await page.locator(".feedback-review").first().tap();
    await page.locator(".decision-dialog").waitFor();
    await page.locator(".decision-dialog .close").tap();
    assert.equal(await page.locator('[data-history-filter="self"]').getAttribute("aria-pressed"),"true");
    await page.locator('[data-history-filter="opponent"]').tap();
    assert.equal(await page.locator(".feedback-review").count(),2);
    assert.equal(await page.locator(".history-turn").count(),1);
    assert.equal(await page.locator('.feedback-review[data-history-side="self"]').count(),0);
    for (const [width,height] of [[320,568],[375,667],[390,844],[430,932],[844,390],[1366,768]]) {
      await page.setViewportSize({width,height});
      await page.evaluate(()=>document.querySelector("#review-heading").scrollIntoView({block:"start"}));
      const buttons=await page.locator(".history-filters button").evaluateAll(es=>es.map(e=>{
        const r=e.getBoundingClientRect();return {height:r.height,left:r.left,right:r.right};
      }));
      assert.ok(buttons.every(r=>r.height>=44 && r.left>=0 && r.right<=width+1));
      const groups=await page.locator(".history-turn").evaluateAll(es=>es.map(e=>{
        const r=e.getBoundingClientRect();
        const buttons=[...e.querySelectorAll(".feedback-review")].map(b=>{const q=b.getBoundingClientRect();return {x:q.x,y:q.y,width:q.width,height:q.height}});
        return {width:r.width,scrollWidth:e.scrollWidth,height:r.height,buttons};
      }));
      for(const g of groups) {
        assert.ok(g.scrollWidth<=g.width+1,"turn content does not overflow");
        assert.ok(g.buttons.every(b=>b.height>=44 && b.x>=0 && b.x+b.width<=width+1));
        assert.equal(g.buttons[0].y,g.buttons[1].y,"cube and move share one row at every viewport");
        if(width===1366) {
          assert.ok(g.height<135,"a combined turn is shorter than two separate cards");
        }
      }
      assert.ok(await page.locator('[data-history-filter="opponent"] .history-filter-label').evaluate(n=>n.scrollWidth<=n.clientWidth+1),"Opponent label is readable in full");
      if (width>=1025) assert.ok((await page.locator("#move-feedback").boundingBox()).width>700,"filters never push desktop history into the narrow column");
      await shot(`opponent-${width}`);
    }
    await page.setViewportSize({width:390,height:844});
    await page.locator('[data-history-filter="all"]').focus();
    await page.keyboard.press("Enter");
    assert.equal(await page.locator(".feedback-review").count(),5);
    assert.equal(await page.locator(".history-turn").count(),3);
    assert.deepEqual(await page.locator(".history-turn").evaluateAll(es=>es.map(e=>[...e.querySelectorAll(".feedback-review")].map(b=>b.dataset.decisionType))),
      [["cube"],["cube","checker"],["cube","checker"]]);
    for (const [width,height] of [[390,844],[1366,768]]) {
      await page.setViewportSize({width,height});
      await page.evaluate(()=>document.querySelector("#review-heading").scrollIntoView({block:"start"}));
      await shot(`all-${width}`);
    }
    await page.setViewportSize({width:390,height:844});
    assert.ok(await page.locator('[data-history-filter="all"]').evaluate(e=>e===document.activeElement),"keyboard focus stays on filter");
    assert.deepEqual((await saved()).game,original.game,"history filters and previews never alter the game or analysis");
    await page.getByRole("button",{name:"Back to board ↑",exact:true}).tap();
    assert.equal(await page.evaluate(()=>scrollY),0);
    await page.goto(base + "/backgammon/trainer/");
    await page.locator("#submit-decision").waitFor();
    await page.locator("#panel-toggle").tap();
    for (let i=0;i<4 && await page.locator("#submit-decision").isDisabled();i++)
      await page.getByLabel("Accessible move selection",{exact:true}).selectOption({index:1});
    await page.locator("#details-dialog .close").tap();
    assert.equal(await page.locator(".draft-progress-status").textContent(),"Ready to submit");
    assert.ok(await page.locator(".study-strip").isHidden(),"draft summary reveals no answer");
    await shot("trainer-draft");
    const edgeCases = await page.evaluate(async () => {
      const r = await import("/backgammon/core/rules.mjs"), {DraftBoard} = await import("/backgammon/ui/shell.mjs");
      const read = state => {
        r.assertState(state);
        const paths=r.legalPaths(state), draft=[paths[0].steps[0]];
        const node=DraftBoard.prototype.progressMessage.call({state,paths,draft},"Choose a move");
        return node.querySelector(".draft-progress-status").textContent;
      };
      const blocked=r.initialState({phase:"move",dice:[6,1]});
      blocked.points=Array(24).fill(0);blocked.bar=[1,0];blocked.off=[14,0];
      blocked.points[23]=-13;blocked.points[17]=-2;
      const winning=r.initialState({phase:"move",dice:[3,1]});
      winning.points=Array(24).fill(0);winning.points[0]=1;winning.points[23]=-15;winning.off=[14,0];
      return {blocked:read(blocked),winning:read(winning),doubles:read(r.initialState({phase:"move",dice:[3,3]}))};
    });
    assert.deepEqual(edgeCases,{blocked:"Ready to confirm",winning:"Ready to confirm",doubles:"3 moves left"},"remaining count respects blocked dice, winning early and doubles");
    assert.deepEqual(errors,[]);
    return {browser:name,realEngine:true,playerFilters:true,filterFocus:true,draftProgress:true,undoReset:true,trainerSpoilerFree:true,viewports:7};
  } finally {await context.close();}
};
