const assert = require('node:assert/strict');
const path = require('node:path');
module.exports = async function diceOrder(browser,base,out,name) {
  let cases = 0;
  for (const touch of [false,true]) {
    const context = await browser.newContext({viewport:touch ? {width:390,height:844} : {width:1366,height:768},
      hasTouch:touch,reducedMotion:'reduce',serviceWorkers:'block'});
    const page = await context.newPage(), errors = [];
    page.on('pageerror',error=>errors.push(error.message));
    try {
      await page.goto(base+'/backgammon/');
      await page.waitForFunction(()=>document.documentElement.dataset.appReady === 'true');
      await page.evaluate(async()=>{
        const {shell,DraftBoard} = await import('/backgammon/ui/shell.mjs');
        const r = await import('/backgammon/core/rules.mjs'), st = await import('/backgammon/core/storage.mjs');
        st.saveSettings({interactionMode:'advanced',motion:'reduce',equityBar:false});
        window.orderTest = {d:new DraftBoard(shell('trainer','Dice order').board),r,st};
      });
      for (const turn of [0,1]) for (const orientation of [0,1]) for (let a=1;a<=6;a++) for (let b=a;b<=6;b++) {
        const result = await page.evaluate(({turn,orientation,a,b})=>{
          const {d,r,st} = orderTest;
          st.saveSettings({orientation});
          const state = r.initialState({phase:'move',dice:[a,b],turn});
          d.set(state,r.legalPaths(state));
          const values = [...d.board.svg.querySelectorAll('.board-die')].map(n=>+n.dataset.die);
          return {values,selected:d.activeDie(),recorded:state.dice};
        },{turn,orientation,a,b});
        assert.deepEqual(result.values,a===b ? Array(4).fill(a) : [b,a]);
        assert.equal(result.selected,b);
        assert.deepEqual(result.recorded,[a,b]);
        cases++;
      }
      await page.evaluate(()=>{
        const {d,r,st} = orderTest;
        st.saveSettings({orientation:0});
        const state = r.initialState({phase:'move',dice:[1,6]});
        d.set(state,r.legalPaths(state));
      });
      const values = ()=>page.locator('.board-die').evaluateAll(nodes=>nodes.map(n=>+n.dataset.die));
      const low = page.locator('.board-die[data-die="1"]');
      if (touch) await low.tap(); else await low.click();
      assert.equal(await page.locator('.board-die.preferred').getAttribute('data-die'),'1');
      assert.deepEqual(await values(),[6,1],'choosing the smaller die keeps the higher die first');
      const checker = page.locator('[data-point="7"] .checker').last();
      if (touch) await checker.tap(); else await checker.click();
      assert.deepEqual(await page.evaluate(()=>orderTest.d.draft),[{from:7,to:6,die:1}]);
      const used = page.locator('.board-die.consumed');
      assert.equal(await used.getAttribute('data-die'),'1');
      if (touch) await used.tap(); else await used.click();
      assert.deepEqual(await page.evaluate(()=>orderTest.d.draft),[],'sorted face undoes the correct draft step');
      await page.screenshot({path:path.join(out,`${name}-higher-die-first-${touch?'phone':'desktop'}.png`)});
      for (const editor of [false,true]) {
        const result = await page.evaluate(editor=>{
          const {d,r} = orderTest;
          const state = r.initialState({phase:editor?'move':'roll',dice:editor?[1,6]:[]});
          d.board.render(state,{editor,usedDice:[],orientation:0,
            lastMove:editor?null:{player:1,dice:[1,6],steps:[],points:{},origins:{},checkers:[]}});
          return {values:[...d.board.svg.querySelectorAll('.board-die')].map(n=>+n.dataset.die),dice:state.dice};
        },editor);
        assert.deepEqual(result.values,editor?[1,6]:[6,1]);
        assert.deepEqual(result.dice,editor?[1,6]:[]);
      }
      assert.deepEqual(errors,[]);
    } finally { await context.close(); }
  }
  return {cases,display:'Higher die first; explicit selection and undo preserved; history sorted; editor and recorded dice unchanged'};
};
