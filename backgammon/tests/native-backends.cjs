const assert=require("node:assert/strict");
module.exports=async function nativeBackends(browser,base,{corpus=true}={}) {
  const context=await browser.newContext({serviceWorkers:"block"}), page=await context.newPage();
  try {
    await page.goto(base+"/backgammon/");
    const report=await page.evaluate(async({corpus})=>{
      const {EngineClient}=await import("/backgammon/engine/client.mjs");
      const {initialState,clone,legalTurns}=await import("/backgammon/core/rules.mjs");
      const {ENGINE_VERSION}=await import("/backgammon/engine/metadata.mjs");
      const scalar=new EngineClient({workerFactory:()=>new Worker("/backgammon/engine/worker.mjs?backend=scalar",{type:"module"})});
      const simd=new EngineClient();
      const rows=[],checks=[];
      const check=(ok,message)=>{if(!ok)throw Error(message);};
      const compare=(a,b,label)=>{
        check(a.engine===ENGINE_VERSION&&b.engine===ENGINE_VERSION,`${label}: engine version changed`);
        check(a.positionKey===b.positionKey&&JSON.stringify(a.settings)===JSON.stringify(b.settings),`${label}: settings or position changed`);
        check(a.type===b.type&&a.method===b.method&&a.units===b.units&&a.perspective===b.perspective,`${label}: result context changed`);
        const ac=a.candidates||[a],bc=b.candidates||[b];
        check(ac.length===bc.length,`${label}: legal result coverage changed`);
        check((a.candidates?.[0].key||a.action)===(b.candidates?.[0].key||b.action),`${label}: best decision changed`);
        let max=0;
        const number=(x,y)=>{
          if(x==null||y==null)check(x===y,`${label}: units changed`);
          else {check(Number.isFinite(x)&&Number.isFinite(y),`${label}: invalid number`); max=Math.max(max,Math.abs(x-y));}
        };
        for(const c of ac) {
          const other=a.candidates?bc.find(o=>o.key===c.key):b;
          check(other,`${label}: missing move`);
          for(const field of ["equity","cubeless","mwc","standardError","mwcStandardError"])number(c[field],other[field]);
          for(const field of ["probabilities","outcomes","outcomesMWC","outcomeSE"])
            if(c[field]) {check(c[field].length===other[field]?.length,`${label}: ${field} missing`);c[field].forEach((x,i)=>number(x,other[field][i]));}
        }
        if(a.decisionOptions) {
          check(a.decisionOptions.length===b.decisionOptions?.length,`${label}: cube options changed`);
          for(const option of a.decisionOptions) {
            const other=b.decisionOptions.find(o=>o.action===option.action);
            check(other,`${label}: missing cube option`);number(option.equity,other.equity);
          }
        }
        if(a.actual) {check(a.actual.key===b.actual?.key,`${label}: submitted move changed`);number(a.actual.equity,b.actual.equity);number(a.error,b.error);}
        check(!!a.screening===!!b.screening,`${label}: screening presence changed`);
        if(a.screening) {
          // Tree screening retains excluded evaluations; rollout screening
          // records counts only. Verify each actual schema, not an assumed list.
          const {excluded:ax,...as}=a.screening,{excluded:bx,...bs}=b.screening;
          check(JSON.stringify(as)===JSON.stringify(bs),`${label}: screening context changed`);
          check(Array.isArray(ax)===Array.isArray(bx),`${label}: excluded evaluations changed`);
          if(ax) {
            check(JSON.stringify(ax.map(c=>c.key).sort())===JSON.stringify(bx.map(c=>c.key).sort()),`${label}: screening changed`);
            for(const c of ax) {
              const other=bx.find(o=>o.key===c.key);
              for(const field of ["equity","cubeless","mwc"])number(c[field],other[field]);
              c.probabilities.forEach((x,i)=>number(x,other.probabilities[i]));
            }
          }
        }
        check(max<=0.00001,`${label}: scores differ by ${max}`);
        return {label,positionKey:a.positionKey,best:a.candidates?.[0].key||a.action,candidates:ac.length,maxDifference:max};
      };
      try {
        await Promise.all([scalar.start(),simd.start()]);
        check(scalar.startup.backend==="scalar","Forced scalar did not load");
        check(simd.startup.backend==="simd"&&!simd.startup.fallback,"SIMD did not load in a supporting browser");
        const fixtures=(await(await fetch("/backgammon/data/exercises.json")).json()).items;
        for(const f of fixtures) for(const preset of ["quick","standard","deep"]) {
          const a=await scalar.analyze(f.state,{preset}),b=await simd.analyze(f.state,{preset});
          rows.push(compare(a,b,`${f.id}/${preset}`));
        }
        const opening=initialState({phase:"move",dice:[3,3]});
        const dmp=initialState({phase:"move",dice:[3,1],matchLength:7,scores:[6,6],crawfordPlayed:true});
        const money=initialState({phase:"move",dice:[3,1],matchLength:0});
        for(const state of [opening,dmp,money]) {
          const a=await scalar.analyze(state,{preset:"deep"}),b=await simd.analyze(state,{preset:"deep"});
          rows.push(compare(a,b,"mixed depth / match context"));
        }
        const submitted=legalTurns(opening).at(-1).steps;
        rows.push(compare(await scalar.analyze(opening,{preset:"deep",submitted}),await simd.analyze(opening,{preset:"deep",submitted}),"arbitrary move grading"));
        const match=initialState({phase:"move",dice:[3,1],matchLength:7,scores:[2,4],cube:{value:2,owner:1}});
        const mirrored={...clone(match),turn:1,points:match.points.slice().reverse().map(n=>-n),bar:[...match.bar].reverse(),off:[...match.off].reverse(),scores:[...match.scores].reverse(),cube:{value:2,owner:0}};
        for(const state of [match,mirrored])for(const preset of ["quick","deep","expert"])rows.push(compare(await scalar.analyze(state,{preset}),await simd.analyze(state,{preset}),`owned cube/player ${state.turn}/${preset}`));
        const bearoff=fixtures.find(f=>f.topic==="bearoff").state;
        rows.push(compare(await scalar.analyze(bearoff,{preset:"research"}),await simd.analyze(bearoff,{preset:"research"}),"four-ply bearoff"));
        if(corpus) {
          const reference=(await(await fetch("/backgammon/data/accuracy-reference.json")).json()).items;
          for(const item of reference)rows.push(compare(await scalar.analyze(item.state,{preset:"deep"}),await simd.analyze(item.state,{preset:"deep"}),`reference ${item.topic}/${item.line}`));
        }
        const race=fixtures.find(f=>f.topic==="race").state;
        const wholeScalar=await scalar.analyze(race,{rollout:{trials:64,seed:7788}});
        const wholeSIMD=await simd.analyze(race,{rollout:{trials:64,seed:7788}});
        rows.push(compare(wholeScalar,wholeSIMD,"seeded rollout"));
        simd.cache.clear();
        let cp,cancelled=false;
        try {await simd.analyze(race,{rollout:{trials:256,seed:7788},onProgress:checkpoint=>{cp=checkpoint;simd.cancel();}});}
        catch(e){cancelled=e.name==="AbortError";}
        check(cancelled&&cp.completed===32,"SIMD cancellation must save one completed batch");
        const resumed=await scalar.analyze(race,{rollout:{trials:64,seed:7788,resume:cp}});
        rows.push(compare(wholeScalar,resumed,"SIMD checkpoint → scalar resume"));
        checks.push("both runtime variants","all authored fixtures at 0/1/2 ply","money, match, cube owner and mirrored player contexts","3/4-ply evaluation","seeded rollout and cross-backend resume");
        return {engine:ENGINE_VERSION,scalar:scalar.startup,simd:simd.startup,corpus,checks,rows};
      } finally {scalar.destroy();simd.destroy();}
    },{corpus});
    assert.ok(report.rows.length>100);
    return report;
  } finally {await context.close();}
};
