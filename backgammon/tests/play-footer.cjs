const assert = require('node:assert/strict');
const path = require('node:path');

// The footer must work as one utility row, including skins that frame it.
module.exports = async function playFooter(browser, base, out, name) {
  const context = await browser.newContext({viewport:{width:390,height:844}, hasTouch:true,
    serviceWorkers:'block', reducedMotion:'reduce'});
  const page = await context.newPage(), errors = [], layouts = [];
  page.on('pageerror', error => errors.push(error.message));
  async function load(phase, skin = 'liquid-chrome', mode = 'computer') {
    await page.goto(base + '/backgammon/');
    await page.evaluate(async ({phase,skin,mode}) => {
      const r = await import('/backgammon/core/rules.mjs');
      const st = await import('/backgammon/core/storage.mjs');
      st.saveSettings({skin, motion:'reduce', analysisAhead:false, equityBar:false, interactionMode:'advanced'});
      const state = r.initialState({matchLength:0,phase:phase === 'move' ? 'move' : 'roll', dice:phase === 'move' ? [4,1] : []});
      if (phase === 'double') {state.phase='double';state.turn=1;state.pending={type:'double',by:1};}
      if (phase === 'over') {
        state.phase='over'; state.result={winner:0,points:2,level:2,reason:'bearoff',matchOver:false};
        state.points.fill(0);state.off=[15,0];state.points[23]=-15;
      }
      r.assertState(state);
      await st.put('work',{id:'play',game:{id:'footer-'+phase,initial:state,state,events:[],started:true,
        names:['You','GNUbg'],config:{mode,humanSide:0,strength:'quick',reviewStrength:'quick',tutor:true,
          warning:false,matchLength:0,rules:state.rules}},draft:[],positionKey:r.positionKey(state)});
    },{phase,skin,mode});
    await page.goto(base + '/backgammon/play/#resume=footer-'+phase);
    await page.locator('.live-table').waitFor();
    await page.waitForFunction(skin => document.documentElement.dataset.skin===skin, skin);
    const summary=page.locator('#mobile-game-summary');
    if(await summary.isVisible()) {
      assert.ok(await summary.evaluate(n=>n.open),'summary defaults open in '+phase);
      const bounds=await summary.boundingBox();
      assert.ok(bounds.y+bounds.height<=page.viewportSize().height+1,'summary fits in '+phase+' / '+mode);
      if(mode==='local') {
        const current=await summary.locator('[data-summary-player]').getAttribute('data-summary-player');
        await summary.locator('.mobile-summary-player').tap();
        assert.equal(await summary.locator('[data-summary-player]').getAttribute('data-summary-player'),String(1-Number(current)));
        assert.ok(await summary.locator('.mobile-summary-player').evaluate(n=>document.activeElement===n),'player switch keeps keyboard focus');
      }
      await page.screenshot({path:path.join(out,`${name}-summary-${phase}-${mode}.png`)});
      await summary.locator(':scope > summary').tap();
    }
  }
  async function check(label, uniform = true) {
    const geometry = await page.evaluate(() => {
      const rect = n => {const r=n.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
      const area=document.querySelector('.action-area');
      const buttons=[...document.querySelectorAll('.turn-tools button')].filter(n=>n.getClientRects().length && getComputedStyle(n).visibility!=='hidden');
      return {area:rect(area),overflow:document.documentElement.scrollWidth>innerWidth+1,
        utilities:buttons.filter(n=>n.closest('.turn-tools')).map(n=>({id:n.id,...rect(n)})),
        buttons:buttons.map(n=>({id:n.id,...rect(n)})),
        message:rect(document.querySelector('#message'))};
    });
    assert.ok(!geometry.overflow,label+' does not scroll horizontally');
    for (const button of geometry.buttons) {
      assert.ok(button.height >=44,label+' touch target '+button.id);
      assert.ok(button.x>=0 && button.right<=page.viewportSize().width,
        label+' tool fits on screen: '+JSON.stringify(button));
    }
    if (uniform) {
      const first=geometry.utilities[0];
      for (const button of geometry.utilities) {
        assert.ok(Math.abs(button.y-first.y)<1 && Math.abs(button.height-first.height)<1,label+' aligned buttons');
        assert.ok(Math.abs(button.width-first.width)<1,label+' evenly sized buttons');
      }
    }
    layouts.push({label,...geometry});
    await page.screenshot({path:path.join(out,`${name}-footer-${label}.png`)});
  }
  try {
    await load('roll');
    for (const width of [320,390,430]) {
      await page.setViewportSize({width,height:844});
      await check('roll-'+width);
      assert.ok(await page.locator('#message').evaluate(n=>getComputedStyle(n).clipPath==='inset(50%)'),
        'routine roll guidance stays accessible without repeating the board prompt');
    }
    await page.locator('#all-controls').tap();
    await page.locator('#analysis-jump').tap();
    assert.ok(await page.locator('#review-heading').evaluate(n=>document.activeElement===n));
    await page.getByRole('button',{name:'Back to board ↑',exact:true}).tap();
    await page.locator('#all-controls').tap();
    await page.locator('.practice-controls-dialog').waitFor();
    await page.setViewportSize({width:844,height:390});
    await page.locator('.practice-controls-dialog .close').tap();
    await page.locator('.practice-controls-dialog').waitFor({state:'detached'});
    assert.equal(await page.locator('.help-cluster #help-actions').count(),1,'original controls return after rotation');
    await check('landscape-roll',false);
    await page.setViewportSize({width:1440,height:900});
    await check('desktop-roll',false);
    for (const phase of ['move','double','over']) {
      await page.setViewportSize({width:390,height:844});
      await load(phase);
      await check(phase+'-390');
      if (phase === 'move') {
        const bounds=await page.locator('#confirm').boundingBox();
        const board=await page.locator('#board').boundingBox();
        assert.ok(bounds.width>=44 && bounds.height>=44,'accessible touch target');
        assert.ok(bounds.y>=board.y && bounds.y+bounds.height<=board.y+board.height,'Confirm is inside board');
        assert.equal(await page.locator('#confirm .confirm-copy').count(),0,'icon-only confirmation');
      }
    }
    await load('roll','classic');
    await check('classic-roll');
    await load('move','liquid-chrome','local');
    await check('same-device-move');
    assert.deepEqual(errors,[]);
    return {layouts,analysisNavigation:true,practiceRotation:true};
  } finally {await context.close();}
};
