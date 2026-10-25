const assert = require('node:assert/strict');
const {waitWork,seedOpening} = require('./play-helpers.cjs');

// Exercise the actual Play bot, including its ready-only path, against the
// same guide data a player sees. Each context has isolated browser storage.
module.exports = async (browser, base, out, name) => {
  const context = await browser.newContext({viewport:{width:390,height:844},hasTouch:true,
    serviceWorkers:'block',reducedMotion:'reduce'});
  const page = await context.newPage(), errors=[], played=[];
  page.on('pageerror',e=>errors.push(e.message));
  try {
    await seedOpening(page,[4,4,4,6]);
    await page.goto(base+'/backgammon/');
    const cases=await page.evaluate(async()=>{
      const {OpeningGuideData}=await import('/backgammon/ui/opening-guide-data.mjs');
      const {XGReferenceBook}=await import('/backgammon/engine/xg-reference-book.mjs');
      const {boardKey,commitTurn,initialState}=await import('/backgammon/core/rules.mjs');
      const guide=new OpeningGuideData(undefined,{referenceBook:new XGReferenceBook()});
      const opening=(await guide.openings()).get('64'),cases=[];
      const add=(label,position,turn,cube)=>{
        const state={...position.state,cube:{value:cube,owner:null}};
        let steps=position.moves[0].steps;
        if(state.turn!==turn){
          state.turn=turn;state.points=state.points.toReversed().map(n=>-n);
          state.bar=state.bar.toReversed();state.off=state.off.toReversed();
          steps=steps.map(s=>({...s,from:typeof s.from==='number'?23-s.from:s.from,to:typeof s.to==='number'?23-s.to:s.to}));
        }
        cases.push({label,state,expected:boardKey(commitTurn(state,steps)),method:position.method});
      };
      for(const turn of [0,1])for(const cube of [1,2])add(`opening-${turn}-${cube}`,opening,turn,cube);
      cases.push({...cases.at(-1),label:'actual-opening-tie',humanSide:0,
        state:initialState({phase:'opening',matchLength:0,rules:{...opening.state.rules,automaticDoubles:-1}})});
      for(const choice of [0,1])for(const roll of ['64','33']){
        const reply=await guide.reply(opening,choice,roll,1);
        add(`reply-${choice}-${roll}`,reply,1,2);
      }
      return cases;
    });
    for(const fixture of cases){
      // Leave the previous game before replacing its save, so pagehide cannot
      // overwrite the next fixture with the old game's checkpoint.
      await page.goto(base+'/backgammon/');
      await page.evaluate(async fixture=>{
        const st=await import('/backgammon/core/storage.mjs');
        const {localConfig}=await import('/backgammon/core/play-session.mjs');
        st.saveSettings({motion:'reduce',analysisAhead:false,equityBar:false});
        const state=fixture.state;
        await st.put('work',{id:'play',game:{id:fixture.label,initial:state,state,started:true,events:[],names:['White','Black'],
          config:localConfig({mode:'computer',humanSide:fixture.humanSide??1-state.turn,strength:'auto',reviewStrength:'auto',tutor:false,warning:false,matchLength:0,rules:state.rules})},draft:[]});
      },fixture);
      await page.goto(base+'/backgammon/play/#resume='+fixture.label);
      const work=await waitWork(page,w=>w?.game.id===fixture.label&&w.game.events.some(e=>e.action.type==='move'));
      const event=work.game.events.find(e=>e.action.type==='move');
      assert.equal(event.evaluation?.result.book?.source,'published-xg-reference',fixture.label+' uses the reference');
      assert.equal(event.evaluation.result.actual.key,fixture.expected,fixture.label+' plays the guide leader');
      if(fixture.label==='actual-opening-tie') {
        assert.equal(work.game.state.cube.value,2);
        assert.deepEqual(work.game.events.filter(e=>e.action.type==='opening').map(e=>e.action.dice),[[4,4],[4,6]]);
      }
      played.push({label:fixture.label,move:event.evaluation.result.actual.notation,source:event.evaluation.result.book.source});
    }
    assert.deepEqual(errors,[]);
    return {browser:name,played};
  } finally {await context.close();}
};
