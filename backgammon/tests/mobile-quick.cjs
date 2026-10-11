const assert = require("node:assert/strict"), path = require("node:path");

module.exports = async function mobileQuick(browser, base, out, name) {
  const context = await browser.newContext({
    viewport: {width:390,height:844}, hasTouch:true, deviceScaleFactor:1,
    ...(name === "firefox" ? {} : {isMobile:true}),
    reducedMotion:"reduce", serviceWorkers:"block",
  });
  const page = await context.newPage(), errors = [], requests = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("request", r => requests.push(r.url()));
  const shot = label => page.screenshot({path:path.join(out,`${name}-quick-${label}.png`)});
  const fits = async selector => {
    const r = await page.locator(selector).boundingBox(), viewport = page.viewportSize();
    assert.ok(r && r.x>=0 && r.y>=0 && r.x+r.width<=viewport.width+1 && r.y+r.height<=viewport.height+1,
      `${selector} fits ${JSON.stringify(viewport)}: ${JSON.stringify(r)}`);
  };
  try {
    await page.goto(base+"/backgammon/");
    await page.locator("#hub-board svg").waitFor();
    for (const [width,height] of [[320,568],[375,667],[390,844],[430,932]]) {
      await page.setViewportSize({width,height});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await fits("#hub-play");
      const tools = await page.locator(".hub-tools").boundingBox(), board = await page.locator("#hub-board").boundingBox();
      assert.ok(tools.y+tools.height<=board.y,"all tools precede the decorative preview");
      if(width>320) await fits(".hub-tools");
      await shot(`hub-${width}`);
    }
    assert.ok(!requests.some(url=>/\/engine\/vendor\//.test(url)),"hub doesn't load the engine");
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(async () => {
      const {shell,DraftBoard} = await import("/backgammon/ui/shell.mjs");
      const rules = await import("/backgammon/core/rules.mjs");
      const storage = await import("/backgammon/core/storage.mjs");
      window.quickTest = {rules,storage,draft:new DraftBoard(shell("trainer","Practice").board)};
    });
    const set = (kind="start", turn=0, orientation=0) => page.evaluate(({kind,turn,orientation}) => {
      const {rules:r,storage:st,draft:d}=quickTest;
      st.saveSettings({orientation,moveHints:true});
      let state=r.initialState({phase:"move",dice:kind==="doubles"?[3,3]:[4,1]}), steps=[];
      if(kind==="bar") {
        state.points[23]--; state.bar[0]=1;
        steps=[{from:"bar",to:23,die:1},{from:23,to:19,die:4}];
      }
      if(kind==="off") {state.points=Array(24).fill(0);state.points[2]=15;state.points[23]=-15;state.dice=[3,4];}
      if(turn) {
        state.points=state.points.reverse().map(n=>-n);state.bar.reverse();state.off.reverse();state.turn=1;
        steps=steps.map(s=>({...s,from:typeof s.from==="number"?23-s.from:s.from,to:typeof s.to==="number"?23-s.to:s.to}));
      }
      r.assertState(state);d.set(state,r.legalPaths(state));d.draft=steps;
      d.selected=kind==="bar"?(turn?4:19):null;d.render();
    },{kind,turn,orientation});
    const read = () => page.evaluate(()=>({draft:quickTest.draft.draft,selected:quickTest.draft.selected}));
    const tap = point => page.locator(`.touch-destinations [data-destination="${point}"]`).tap();
    const select = point => page.getByLabel("Select a checker",{exact:true}).selectOption(String(point));
    for(const turn of [0,1]) for(const orientation of [0,1]) {
      const p = n => turn?23-n:n;
      await set("start",turn,orientation);
      const board = await page.locator("#board").boundingBox();
      assert.ok(await page.locator(".touch-destinations").isHidden());
      await select(p(12));
      const shown=await page.locator(".touch-destinations button").evaluateAll(ns=>ns.map(n=>n.dataset.destination).sort());
      const legal=await page.evaluate(()=>[...new Set(quickTest.draft.routes().map(r=>String(r.to)))].sort());
      assert.deepEqual(shown,legal,"quick buttons contain exactly the shared controller's legal destinations");
      for(const button of await page.locator(".touch-destinations button").all()) {
        const r=await button.boundingBox();
        assert.ok(r.width>=44 && r.height>=48,"every quick destination has a large touch target");
        assert.ok(await button.getAttribute("aria-label"));
      }
      await tap(p(7));
      assert.equal((await read()).draft.length,2,"tap plays a combined route without selecting a resident checker");
      if((await read()).selected!==p(7)) await select(p(7));
      const back=page.locator(`.touch-destinations [data-destination="${p(12)}"]`);
      assert.equal(await back.getAttribute("data-kind"),"return");
      await back.tap();
      assert.deepEqual((await read()).draft,[],"return restores this checker's dice and original position");
      assert.deepEqual(await page.locator("#board").boundingBox(),board,"controls never resize the board");
      await set("bar",turn,orientation);
      await tap(p(20));
      assert.deepEqual((await read()).draft,[{from:"bar",to:p(20),die:4}],"bar-entry revision uses the other die");
      await tap(p(19));
      assert.equal((await read()).draft.length,2);
    }
    await set("doubles");await select(12);await tap(3);
    assert.equal((await read()).draft.length,3,"doubles permit combined destinations");
    await set("off");await select(2);await tap("off");
    await page.getByRole("dialog",{name:"Choose a die",exact:true}).waitFor();
    await page.getByRole("button",{name:"Use 4",exact:true}).tap();
    assert.equal((await read()).draft[0].die,4,"bearoff keeps genuine die choices");
    await set();await select(12);
    await page.locator('.touch-destinations [data-destination="8"]').focus();
    await page.keyboard.press("Enter");
    assert.ok((await read()).draft.length>0);
    assert.ok(await page.getByLabel("Select a checker",{exact:true}).evaluate(n=>n===document.activeElement),"keyboard focus survives a move");
    await set();await select(12);
    for(const [width,height] of [[320,568],[375,667],[390,844],[430,932],[844,390],[768,1024],[1366,768]]) {
      await page.setViewportSize({width,height});
      const visible=width===390||width===430;
      assert.equal(await page.locator(".touch-destinations").isVisible(),visible,"extra shortcuts appear only when there is room");
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      if(visible) {await fits(".touch-destinations");await fits(".touch-moves");}
      await shot(`moves-${width}`);
    }
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(()=>{quickTest.storage.saveSettings({moveHints:false});quickTest.draft.render()});
    assert.ok(await page.locator(".touch-destinations").isHidden(),"hints off never reveals quick moves");
    await set();await select(12);
    await page.evaluate(()=>{quickTest.draft.preview=quickTest.draft.state;quickTest.draft.render()});
    assert.ok(await page.locator(".touch-destinations").isHidden(),"previews are not editable");
    await set();await select(12);
    await page.evaluate(()=>{quickTest.draft.enabled=false;quickTest.draft.render()});
    assert.ok(await page.locator(".touch-destinations").isHidden(),"opponent/forced actions offer no moves");

    const id=await page.evaluate(async()=>{
      const {rules:r,storage:st}=quickTest;
      st.saveSettings({moveHints:true,orientation:0});
      const initial=r.initialState({phase:"move",dice:[4,1],matchLength:0}), id=crypto.randomUUID();
      await st.put("work",{id:"play",game:{id,initial,state:initial,events:[],started:true,
        names:["You","Friend"],config:{mode:"local",humanSide:0,strength:"quick",matchLength:0,rules:initial.rules}},
        draft:[],positionKey:r.positionKey(initial)});
      return id;
    });
    await page.goto(base+"/backgammon/");
    const resume=page.getByRole("link",{name:"Resume your game",exact:true});
    await resume.waitFor();
    assert.equal(await resume.getAttribute("href"),`/backgammon/play/#resume=${id}`);
    await fits(".hub-tools");
    await shot("hub-resume");
    await resume.tap();
    await page.locator("#confirm").waitFor();
    const board=await page.locator("#board").boundingBox(), confirm=await page.locator("#confirm").boundingBox();
    await select(12);await tap(7);
    assert.ok(await page.locator("#confirm").isEnabled(),"a chosen complete turn still waits for confirmation");
    const saved=await page.evaluate(async()=>(await import("/backgammon/core/storage.mjs")).get("work","play"));
    assert.equal(saved.game.events.length,0,"quick actions never auto-commit a chosen turn");
    assert.deepEqual(await page.locator("#board").boundingBox(),board);
    assert.deepEqual(await page.locator("#confirm").boundingBox(),confirm,"primary action remains in place");
    await tap(12);
    for(const [width,height] of [[320,568],[375,667],[390,844],[430,932],[844,390],[768,1024],[1024,768],[1366,768]]) {
      await page.setViewportSize({width,height});
      await page.evaluate(()=>scrollTo(0,0));
      await page.waitForTimeout(50);
      await page.locator('#board [data-point="12"] .checker > circle').first().tap();
      if(width>320) await fits("#confirm");
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await shot(`play-${width}`);
      if(width===320) {
        await page.locator("#confirm").scrollIntoViewIfNeeded();
        await fits("#confirm");
        await shot("play-small-actions");
      }
      await page.locator('#board [data-point="12"] .checker > circle').first().tap();
    }
    await page.setViewportSize({width:390,height:844});await select(12);
    await page.evaluate(()=>document.documentElement.style.zoom="1.4");
    await page.locator("#confirm").scrollIntoViewIfNeeded();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),"enlarged text reflows without sideways scrolling");
    await shot("play-enlarged");
    await page.locator("#all-controls").tap();
    await page.locator(".practice-controls-dialog .close").tap();
    await page.evaluate(()=>document.documentElement.style.zoom="");
    assert.deepEqual(errors,[]);
    return {browser:name,mobileContext:name!=="firefox",hubEntrances:true,resume:true,largeDestinations:true,barRevision:true,bearoffChoice:true,orientations:4,keyboard:true,noSpoilers:true,stableBoardAndConfirm:true,enlargedContent:true};
  } finally {await context.close();}
};
