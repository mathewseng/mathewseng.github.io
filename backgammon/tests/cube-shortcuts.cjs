const assert = require('node:assert/strict'), path = require('node:path');
const { waitWork } = require('./play-helpers.cjs');
module.exports = async (browser, base, out, name) => {
 const report = [];
 for (const scenario of [
  {stage:'double',key:'d',action:'pass',invalid:['p','r','c']},
  {stage:'double',key:'b',action:'beaver',invalid:['r']},
  {stage:'beaver',key:'r',action:'raccoon',invalid:['b']},
  {stage:'raccoon',key:'t',action:'take',invalid:['b','r'],capture:'desktop'},
  {stage:'raccoon',key:'d',action:'pass',invalid:['b','r'],capture:'mobile'},
 ]) {
  const mobile = scenario.capture === 'mobile';
  const ctx = await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1366,height:768},hasTouch:mobile,reducedMotion:'reduce',serviceWorkers:'block'});
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const ready = () => page.waitForFunction(() => document.documentElement.dataset.appReady === 'true');
  try {
   await page.goto(base+'/backgammon/'); await ready();
   await page.evaluate(async stage => {
    const r = await import('/backgammon/core/rules.mjs'), st = await import('/backgammon/core/storage.mjs');
    const {localConfig} = await import('/backgammon/core/play-session.mjs');
    const {DEFAULT_SHORTCUTS} = await import('/backgammon/core/shortcuts.mjs');
    const turn = stage === 'beaver' ? 0 : 1;
    let s = r.transition(r.initialState({turn,phase:'roll',matchLength:0,rules:{immediateRedoubles:2}}),{type:'double'},turn);
    if(stage !== 'double') s = r.transition(s,{type:'beaver'},1-turn);
    if(stage === 'raccoon') s = r.transition(s,{type:'raccoon'},turn);
    st.saveSettings({motion:'reduce',analysisAhead:false,equityBar:false,keyboardEnabled:true,skin:'liquid-chrome'});
    // Simulate a returning player with the previous defaults persisted on disk.
    const settings=JSON.parse(localStorage.getItem('backgammon.v1.settings'));
    settings.shortcuts={...DEFAULT_SHORTCUTS,drop:['p'],redouble:['d']}; delete settings.shortcuts.raccoon;
    localStorage.setItem('backgammon.v1.settings',JSON.stringify(settings));
    await st.put('work',{id:'play',game:{id:'cube-keys-'+stage,started:true,initial:s,state:s,events:[],names:['You','Black'],config:localConfig({mode:'computer',humanSide:0,matchLength:0,rules:s.rules,tutor:false,warning:false})},draft:[]});
   }, scenario.stage);
   await page.goto(base+'/backgammon/play/'); await ready();
   await page.evaluate(async () => {(await import('/backgammon/engine/client.mjs')).EngineClient.prototype.analyze=()=>new Promise(()=>{});});
   await page.locator('#resume-match').click(); await page.locator('#take-cube').waitFor();
   assert.equal(await page.locator('#drop-cube kbd text').textContent(),'D');
   assert.equal(await page.locator('#take-cube kbd text').textContent(),'T');
   if(scenario.stage === 'raccoon') {
    assert.equal(await page.locator('#immediate-redouble').count(),0,'no further redouble after a raccoon');
    assert.equal(await page.locator('#drop-cube .cube-reply-value').textContent(),'−4');
    assert.equal(await page.locator('#take-cube .cube-reply-value').textContent(),'8');
   } else assert.equal(await page.locator('#immediate-redouble kbd text').textContent(),scenario.stage==='double'?'B':'R');
   const colors = await page.locator('#take-cube').evaluate(button => ({
    text:getComputedStyle(button.querySelector('.cube-reply-face')).color,
    badge:getComputedStyle(button.querySelector('kbd')).color,
    glyph:getComputedStyle(button.querySelector('kbd text')).fill,
   }));
   assert.equal(colors.badge,colors.text,'badge matches dark text on the light Take face');
   assert.equal(colors.glyph,colors.text,'SVG shortcut letter inherits the contrast color');
   assert.ok(colors.text.match(/[\d.]+/g).slice(0,3).every(n=>Number(n)<128),'Take shortcut is dark in Liquid Chrome');
   await page.evaluate(() => {
    window.cubeKeyClicks=[];
    document.querySelectorAll('.cube-reply').forEach(button=>button.addEventListener('click',()=>window.cubeKeyClicks.push(button.id)));
   });
   for(const key of scenario.invalid) await page.keyboard.press(key);
   assert.deepEqual(await page.evaluate(()=>window.cubeKeyClicks),[],'unavailable cube shortcuts cannot trigger a different response');
   await page.waitForLoadState('networkidle');
   if(scenario.capture) await page.screenshot({path:path.join(out,`${name}-facing-raccoon-${scenario.capture}.png`)});
   await page.keyboard.press(scenario.key);
   const saved = await waitWork(page,w=>w?.game.events.some(e=>e.action.type===scenario.action));
   assert.equal(saved.game.events[0].action.type,scenario.action);
   assert.equal(saved.game.events[0].actor,0);
   if(scenario.stage==='raccoon'&&scenario.action==='pass') assert.equal(saved.game.state.result.points,4);
   await page.waitForLoadState('networkidle');
   assert.deepEqual(errors,[]);
   report.push({...scenario,colors});
  } finally { await ctx.close(); }
 }
 return report;
};
