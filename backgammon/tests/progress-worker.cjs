const assert=require('node:assert/strict');
module.exports=async function progressWorker(browser,base) {
  const report=[];
  for(const blocked of [false,true]) {
    const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
    try {
      if(blocked) await page.route('**/core/progress-worker.mjs',route=>route.abort());
      await page.goto(base+'/backgammon/');
      const result=await page.evaluate(async()=>{
        const {ProgressWriter}=await import('/backgammon/core/progress-writer.mjs');
        const {initialState,transition,legalTurns,replay}=await import('/backgammon/core/rules.mjs');
        const {get,put,itemRecord}=await import('/backgammon/core/storage.mjs');
        const initial=initialState(),events=[];
        let state=initial;
        const action={type:'opening',dice:[6,1]};
        state=transition(state,action,0); events.push({actor:0,action});
        const move={type:'move',steps:legalTurns(state)[0].steps},actor=state.turn;
        state=transition(state,move,actor);events.push({actor,action:move});
        const game={id:'worker-game',started:true,initial,state,events,names:['White','Black'],config:{mode:'local'}};
        await put('items',itemRecord('match',{id:game.id,title:'Keep my title',notes:'Keep my notes',initial,events:[]}));
        const writer=new ProgressWriter(),stored=[];
        const work={id:'play',game,draft:[],feedback:null};
        const first=writer.save(work,{history:true,stored:key=>stored.push(JSON.parse(key))});
        work.feedback={marker:'latest'};
        const second=writer.save(work,{stored:key=>stored.push(JSON.parse(key))});
        work.feedback.marker='mutated-after-save';
        await Promise.all([first,second]);
        const saved=await get('work','play'),archive=await get('items',game.id);
        const result={fallback:!!writer.unavailable,stored:stored.map(v=>v.feedback),feedback:saved.feedback,
          title:archive.title,notes:archive.notes,events:archive.events.length,
          replayed:JSON.stringify(replay(saved.game.initial,saved.game.events).at(-1))===JSON.stringify(saved.game.state)};
        writer.worker?.terminate();return result;
      });
      assert.equal(result.fallback,blocked);
      assert.deepEqual(result.stored,[null,{marker:'latest'}]);
      assert.deepEqual(result.feedback,{marker:'latest'});
      assert.equal(result.title,'Keep my title');assert.equal(result.notes,'Keep my notes');
      assert.equal(result.events,2);assert.equal(result.replayed,true);
      report.push(result);
    } finally {await context.close();}
  }
  return report;
};
