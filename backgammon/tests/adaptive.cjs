const assert = require("node:assert/strict");
module.exports = async function adaptive(browser,base,out,name="browser") {
  const context = await browser.newContext({serviceWorkers:"block"});
  try {
    const page = await context.newPage();
    await page.goto(base+"/backgammon/");
    const report = await page.evaluate(async()=>{
      const {EngineClient}=await import("/backgammon/engine/client.mjs");
      const {initialState,legalTurns,positionKey}=await import("/backgammon/core/rules.mjs");
      const {PRESETS}=await import("/backgammon/engine/metadata.mjs");
      const state=initialState({phase:"move",dice:[3,3]}), submitted=legalTurns(state).at(-1).steps;
      const e=new EngineClient({ openingBook: null }), updates=[];
      try {
        await e.start();
        const start=performance.now();
        const a=await e.analyze(state,{preset:"auto",submitted,onEvaluation:r=>updates.push(r)});
        const elapsedMs=performance.now()-start;
        if(a.status!=="complete"||!a.actual||a.positionKey!==positionKey(state))throw Error("Lost original decision context");
        if(!updates.length||updates.some((r,i)=>r.settings.plies!==i||!r.actual))throw Error("Incomplete or skipped depth published");
        const preset=Object.keys(PRESETS).find(k=>PRESETS[k].plies===a.settings.plies);
        // Manual search also includes the actual move, even outside screening.
        const fixed=await e.analyze(state,{preset,submitted});
        if(Math.abs(a.actual.equity-fixed.actual.equity)>.00001)throw Error("Inconsistent actual-move equity");
        for(const candidate of a.candidates) {
          const expected=fixed.candidates.find(c=>c.key===candidate.key);
          if(expected && Math.abs(candidate.equity-expected.equity)>.00001)throw Error("Mixed-depth comparison");
        }
        if(Math.abs(a.error-Math.max(0,a.candidates[0].equity-a.actual.equity))>1e-10)throw Error("Incorrect loss");
        if(!(await e.analyze(state,{preset:"auto",submitted})).cached)throw Error("Completed result not cached");
        // Cancel on the first published complete level, then immediately reuse
        // this client for a different position. Old messages cannot win.
        const next={...state,dice:[6,5]};let cancelled=false;
        try {await e.analyze(next,{preset:"auto",onEvaluation:()=>e.cancel()});}
        catch(error){cancelled=error.name==="AbortError";}
        if(!cancelled)throw Error("Explicit cancellation resolved unexpectedly");
        const retry=await e.analyze(next,{preset:"quick"});
        if(retry.positionKey!==positionKey(next))throw Error("Stale result after restart");
        const cube=await e.analyze(initialState({phase:"roll"}),{preset:"auto"});
        if(cube.type!=="cube"||cube.settings.plies<2||!Number.isFinite(cube.equity))throw Error("Cube Auto did not complete its minimum depth");
        return {elapsedMs,completedPlies:a.settings.plies,cubePlies:cube.settings.plies,cubeReason:cube.budget.reason,
          actual:a.actual.notation,levels:updates.map(r=>r.settings.plies)};
      } finally {e.destroy();}
    });
    assert.ok(report.completedPlies>=2&&report.completedPlies<=4);
    // A deeper screen may discard the move being previewed. Preserve the
    // board but never label it Original or display the new leader's equity.
    assert.deepEqual(await page.evaluate(async()=>{
      const {StudyStrip}=await import("/backgammon/ui/study-strip.mjs");
      const {initialState,legalTurns}=await import("/backgammon/core/rules.mjs");
      const source=initialState({phase:"move",dice:[3,1]}), turns=legalTurns(source);
      const candidates=turns.slice(0,2).map(t=>({key:t.key,steps:t.steps,notation:"fixture",equity:.1,mwc:null}));
      let selected="unchanged";
      const holder=document.createElement("div"), strip=new StudyStrip(c=>{selected=c;},{container:holder});
      strip.set({type:"checker",units:"current-cube-points",settings:{name:"Quick"},candidates},turns[1].state);
      strip.set({type:"checker",units:"current-cube-points",settings:{name:"Expert"},candidates:[candidates[0]]},turns[1].state);
      const value=strip.select.value, message=strip.value.textContent;
      strip.next.click();
      await Promise.resolve(); // Shared buttons dispatch their action in a microtask.
      return {value,message,returnedToSource:selected===null};
    }),{value:"-2",message:"This preview was not retained at the current depth.",returnedToSource:true});
    const url = await page.evaluate(async()=>{
      const {shareURL}=await import("/backgammon/core/xgid.mjs");
      const {initialState}=await import("/backgammon/core/rules.mjs");
      return shareURL(initialState({phase:"move",dice:[3,1],matchLength:0}));
    });
    for(const viewport of [{width:1366,height:768},{width:390,height:844}]) {
      await page.setViewportSize(viewport);
      await page.goto(url);
      await page.waitForFunction(()=>document.querySelector("#analyze")?.textContent==="Analyze"&&
        document.querySelector("#analysis-budget")?.textContent.includes("completed")&&
        !document.querySelector("#analysis-budget")?.textContent.includes("searching deeper"));
      assert.equal(await page.getByLabel("Analysis strength").locator('[aria-pressed="true"]').getAttribute("data-choice"),"auto");
      // On phones study controls open the same complete analysis panel.
      if(viewport.width<600) {
        await page.locator("#panel-toggle").click();
      }
      await page.screenshot({path:`${out}/${name}-adaptive-${viewport.width}.png`,fullPage:true,animations:"disabled"});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    }
    await page.goto(base+"/backgammon/reports/#automatic");
    await page.waitForFunction(()=>document.querySelectorAll("#automatic-content tbody tr").length===7);
    await page.getByLabel("Automatic search browser").selectOption("webkit");
    assert.match(await page.locator("#automatic-content").textContent(),/331 of 331/);
    await page.screenshot({path:`${out}/${name}-adaptive-report-390.png`,animations:"disabled"});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    return report;
  } finally {await context.close();}
};
