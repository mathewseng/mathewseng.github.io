const assert = require("node:assert/strict"), path = require("node:path");
module.exports = async function touchMoves(browser, base, out, name) {
  const context = await browser.newContext({viewport:{width:390,height:844},hasTouch:true,reducedMotion:"reduce",serviceWorkers:"block"});
  const page = await context.newPage(), errors = [];
  page.on("pageerror", e => errors.push(e.message));
  try {
    await page.goto(base + "/backgammon/");
    await page.evaluate(async () => {
      const {shell,DraftBoard} = await import("/backgammon/ui/shell.mjs");
      const rules = await import("/backgammon/core/rules.mjs");
      const storage = await import("/backgammon/core/storage.mjs");
      window.touchTest = {rules,storage,draft:new DraftBoard(shell("trainer","Practice").board)};
    });
    const source = page.getByLabel("Select a checker",{exact:true});
    const destination = page.getByLabel("Move selected checker",{exact:true});
    const set = (kind, turn=0, orientation=0) => page.evaluate(({kind,turn,orientation})=>{
      const {rules:r,storage:st,draft:d}=touchTest;
      st.saveSettings({orientation,moveHints:true});
      let s=r.initialState({phase:"move",dice:kind==="doubles"?[3,3]:[4,1]});
      let steps=[];
      if(kind==="bar") {
        s.points[23]--;s.bar[0]=1;
        steps=[{from:"bar",to:23,die:1},{from:23,to:19,die:4}];
      }
      if(kind==="off") {
        s.points=Array(24).fill(0);s.points[2]=15;s.points[23]=-15;s.dice=[3,4];
      }
      if(turn) {
        s.points.reverse();s.points=s.points.map(n=>-n);s.bar.reverse();s.off.reverse();s.turn=1;
        steps=steps.map(step=>({...step,from:typeof step.from==="number"?23-step.from:step.from,to:typeof step.to==="number"?23-step.to:step.to}));
      }
      r.assertState(s); d.set(s,r.legalPaths(s)); d.draft=steps; d.selected=kind==="bar"?(turn?4:19):null;d.render();
    },{kind,turn,orientation});
    const read=()=>page.evaluate(()=>({draft:touchTest.draft.draft,selected:touchTest.draft.selected,points:touchTest.draft.current().points}));
    for(const turn of [0,1])for(const orientation of [0,1]) {
      const p=n=>turn?23-n:n;
      await set("start",turn,orientation);
      const box=await page.locator("#board").boundingBox();
      assert.ok(await destination.isDisabled(),"choose a source first");
      await source.selectOption({value:String(p(12))});
      assert.equal((await read()).selected,p(12));
      assert.deepEqual((await read()).draft,[],"source picker only selects");
      assert.equal(await source.locator("option:checked").textContent(),`From ${orientation?24-p(12):p(12)+1}`,"numbers match displayed orientation");
      const targets=await destination.locator("option").evaluateAll(ns=>ns.map(n=>n.value).filter(Boolean));
      const legal=await page.evaluate(()=>[...new Set(touchTest.draft.routes().map(r=>String(r.to)))]);
      assert.deepEqual(targets.sort(),legal.sort(),"every advertised destination comes from the shared resolver");
      await destination.selectOption({value:String(p(7))});
      assert.equal((await read()).draft.length,2,`combined route uses both dice ${turn}/${orientation}: ${JSON.stringify(await read())}`);
      assert.equal(await page.getByRole("dialog").count(),0,"quiet equivalent paths need no prompt");
      assert.deepEqual(await page.locator("#board").boundingBox(),box,"changing choices never resizes board");
      await source.selectOption({value:""});
      assert.equal((await read()).selected,null);
      await source.selectOption({value:String(p(7))});
      await destination.selectOption({value:String(p(12))});
      assert.deepEqual((await read()).draft,[],"original-position return restores dice");
      await set("bar",turn,orientation);
      const revised=await destination.locator("option").evaluateAll(ns=>ns.map(n=>n.value));
      for(const target of [p(20),p(23)]) assert.ok(revised.includes(String(target)),"both first-die entries remain available after combined entry");
      await destination.selectOption({value:String(p(20))});
      assert.deepEqual((await read()).draft,[{from:"bar",to:p(20),die:4}]);
      await destination.selectOption({value:String(p(19))});
      assert.equal((await read()).draft.length,2);
    }
    await set("doubles");
    await source.selectOption({value:"12"});
    await destination.selectOption({value:"3"});
    assert.equal((await read()).draft.length,3,"multi-die shortcuts use the same legal paths");
    await set("off");
    await source.selectOption({value:"2"});
    await destination.selectOption({value:"off"});
    await page.getByRole("dialog",{name:"Choose a die"}).waitFor();
    await page.getByRole("dialog").getByRole("button",{name:"Close",exact:true}).tap();
    await destination.selectOption({value:"off"});
    await page.getByRole("button",{name:"Use 4",exact:true}).tap();
    assert.equal((await read()).draft[0].die,4,"ambiguous bearoff preserves explicit die choice");
    await set("start");
    await page.locator('#board [data-point="12"] .checker > circle').first().tap();
    assert.equal(await source.inputValue(),"12","board selection synchronizes the picker");
    await page.locator('#board [data-point="12"] .checker > circle').first().tap();
    assert.equal(await source.inputValue(),"","board deselection synchronizes the picker");
    await source.focus();await page.keyboard.press("ArrowDown");await page.keyboard.press("Enter");
    assert.ok(await source.evaluate(n=>document.activeElement===n),"updates retain native input focus");
    await page.evaluate(()=>{touchTest.storage.saveSettings({moveHints:false});touchTest.draft.render()});
    assert.ok(await page.locator(".touch-moves").isHidden(),"hints off hides legal options");
    await set("start");
    await page.evaluate(()=>{touchTest.draft.preview=touchTest.draft.state;touchTest.draft.render()});
    assert.ok(await page.locator(".touch-moves").isHidden(),"no editing a preview");
    await set("start");
    await page.evaluate(()=>{touchTest.draft.enabled=false;touchTest.draft.render()});
    assert.ok(await page.locator(".touch-moves").isHidden(),"no tools during opponent/forced actions");
    await set("start");
    for(const [width,height] of [[320,568],[375,667],[390,844],[430,932]]) {
      await page.setViewportSize({width,height});
      await source.selectOption({value:"12"});
      for(const control of [source,destination]) {
        const b=await control.boundingBox();
        assert.ok(b.width>=44 && b.height>=44,"generous touch targets");
        assert.ok(b.x>=0 && b.x+b.width<=width,"no sideways scrolling");
      }
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await page.screenshot({path:path.join(out,`${name}-touch-moves-${width}.png`)});
    }
    await page.setViewportSize({width:1366,height:768});
    assert.ok(await page.locator(".touch-moves").isHidden(),"desktop keeps its existing board and accessible selector");
    assert.deepEqual(errors,[]);
    return {browser:name,orientations:4,barRevision:true,combinedMoves:true,bearoffChoice:true,boardSync:true,focus:true,hintsAndPreview:true};
  } finally { await context.close(); }
};
