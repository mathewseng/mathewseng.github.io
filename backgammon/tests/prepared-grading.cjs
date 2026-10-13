const assert=require('node:assert/strict');
// Real worker + real GNUbg: an unlisted submission is scored once at the
// prepared depth, with unchanged probabilities, perspective and cube units.
module.exports=async function preparedGrading(browser,base){
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
  try {
    await page.goto(base+'/backgammon/');
    const report=await page.evaluate(async()=>{
      const{EngineClient}=await import('/backgammon/engine/client.mjs');
      const{initialState,legalTurns}=await import('/backgammon/core/rules.mjs');
      const{ENGINE_VERSION}=await import('/backgammon/engine/metadata.mjs');
      const fixtures=(await(await fetch('/backgammon/data/exercises.json')).json()).items;
      const rows=[];
      const cases=[
        {name:'money-beavers',state:initialState({phase:'move',dice:[4,1],matchLength:0,rules:{jacoby:true,immediateRedoubles:2}}),preset:'expert'},
        {name:'match-opposite-player',state:initialState({phase:'move',dice:[3,1],turn:1,matchLength:7,scores:[2,4],cube:{value:2,owner:1}}),preset:'expert'},
        {name:'fixed-four-bearoff',state:fixtures.find(f=>f.id==='bearoff-7-181').state,preset:'research'},
      ];
      const check=(v,m)=>{if(!v)throw Error(m);};
      for(const{name,state,preset}of cases){
        const messages=[];
        const engine=new EngineClient({openingBook:null,workerFactory:()=>{
          const w=new Worker('/backgammon/engine/worker.mjs',{type:'module'}),send=w.postMessage.bind(w);
          w.postMessage=m=>{if(m.type==='analyze')messages.push(m);send(m);};return w;
        }});
        const reference=new EngineClient({openingBook:null});
        try{
          const hint=await engine.analyze(state,{preset});
          const outside=legalTurns(state).find(t=>!hint.candidates.some(c=>c.key===t.key));
          check(outside,`${name}: must exercise a move outside the shortlist`);
          const began=performance.now(),grade=await engine.analyze(state,{preset,submitted:outside.steps});
          const gradeMs=performance.now()-began;
          check(messages.length===2&&messages[1].prepared,`${name}: missing prepared basis`);
          check(grade.settings.plies===hint.settings.plies,'mixed evaluation depths');
          for(const c of hint.candidates)check(JSON.stringify(c)===JSON.stringify(grade.candidates.find(g=>g.key===c.key)),'completed alternative changed');
          const fresh=await reference.analyze(state,{preset,submitted:outside.steps});
          let maxDifference=0;
          for(const[x,y]of [[grade.actual.equity,fresh.actual.equity],[grade.actual.cubeless,fresh.actual.cubeless],[grade.actual.mwc,fresh.actual.mwc],...grade.actual.probabilities.map((v,i)=>[v,fresh.actual.probabilities[i]])]){
            if(x===null||y===null)check(x===y,'changed match units');
            else maxDifference=Math.max(maxDifference,Math.abs(x-y));
          }
          check(maxDifference<=.00001,`${name}: fresh score differs by ${maxDifference}`);
          check(grade.error===Math.max(0,grade.candidates[0].equity-grade.actual.equity),'loss uses incompatible alternatives');
          check(hint.actual===null,'hint was mutated');
          const cached=await engine.analyze(state,{preset,submitted:outside.steps});
          check(cached.cached&&messages.length===2,'completed grade did not reuse its cache');
          rows.push({name,plies:grade.settings.plies,gradeMs,candidates:hint.candidates.length,legal:legalTurns(state).length,maxDifference});
        }finally{engine.destroy();reference.destroy();}
      }
      return{engine:ENGINE_VERSION,rows};
    });
    assert.equal(report.rows.length,3);return report;
  }finally{await context.close();}
};
