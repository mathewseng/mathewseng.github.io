const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/bar-revision.json')));
module.exports = async function checkerRevisions(browser, base, out, name) {
  const cases=[];
  for(const touch of [false,true]) {
    const context=await browser.newContext({viewport:touch?{width:390,height:844}:{width:1366,height:768},hasTouch:touch,reducedMotion:'reduce',serviceWorkers:'block'});
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
    const read=()=>page.evaluate(async()=> (await import('/backgammon/core/storage.mjs')).get('work','play'));
    const coords=(point,disc=false)=>page.evaluate(({point,disc})=>{
      const g=document.querySelector(`[data-point="${point}"]`),h=g.querySelector(disc?'.checker > circle':'.point-hit');
      const p=new DOMPoint(+h.getAttribute(disc?'cx':'x')+(disc?0:30),+h.getAttribute(disc?'cy':'y')+(disc?0:140)).matrixTransform(document.querySelector('.bg-board').getScreenCTM());
      return {x:p.x,y:p.y};
    },{point,disc});
    const tap=async(point,disc=false)=>{const p=await coords(point,disc);if(touch)await page.touchscreen.tap(p.x,p.y);else await page.mouse.click(p.x,p.y);};
    const wait=async(draft)=>{
      await page.waitForFunction(async draft=>JSON.stringify((await (await import('/backgammon/core/storage.mjs')).get('work','play'))?.draft)===JSON.stringify(draft),draft);
      await page.waitForTimeout(100);
      const w=await read();assert.deepEqual(w.draft,draft);assert.equal(w.game.events.length,0,'never commits a revision');
    };
    const load=async(turn,orientation,order,hints=true)=>{
      await page.goto(base+'/backgammon/');
      const id=await page.evaluate(async({fixture,turn,orientation,order,hints})=>{
        const r=await import('/backgammon/core/rules.mjs'),st=await import('/backgammon/core/storage.mjs');
        const s=r.clone(fixture.state),p=n=>typeof n==='number'&&turn?23-n:n;
        if(turn){s.turn=1;s.points=s.points.reverse().map(n=>-n);s.bar.reverse();s.off.reverse();}
        const draft=fixture.drafts[order].map(m=>({...m,from:p(m.from),to:p(m.to)}));
        st.saveSettings({orientation,numbers:true,motion:'reduce',moveHints:hints,boardTheme:{version:1,preset:'plum',colors:{}}});
        const id=crypto.randomUUID();
        await st.put('work',{id:'play',game:{id,initial:s,state:s,events:[],started:true,names:['You','Opponent'],config:{mode:'local',humanSide:turn,matchLength:0,rules:s.rules}},draft,positionKey:r.positionKey(s)});
        return id;
      },{fixture,turn,orientation,order,hints});
      await page.goto(base+'/backgammon/play/#resume='+id);await page.locator('#confirm').waitFor();
    };
    try {
      for(const turn of [0,1])for(const orientation of [0,1])for(const order of [0,1]){
        const p=n=>turn?23-n:n;
        for(const destination of [20,23]){
          await load(turn,orientation,order);
          await tap(p(19),true);
          for(const target of [20,23]) assert.equal(await page.locator(`[data-point="${p(target)}"].destination`).count(),1,'both 21 and 24 simultaneously highlighted');
          assert.equal(await page.locator(`[data-point="bar${turn}"].return-destination`).count(),1);
          if(!turn&&!orientation&&!order&&destination===20)await page.screenshot({path:path.join(out,`${name}-checker-revisions-${touch?'touch':'mouse'}.png`)});
          await tap(p(destination));
          await wait([{from:'bar',to:p(destination),die:destination===20?4:1}]);
          assert.equal(await page.locator('dialog[open]').count(),0);
          assert.equal(await page.locator('.board-die.consumed').count(),1);
          assert.ok(await page.locator('#confirm').isDisabled());
          await page.reload();await page.locator('#confirm').waitFor();
          await wait([{from:'bar',to:p(destination),die:destination===20?4:1}]);
          cases.push({touch,turn,orientation,order,destination:destination+1});
        }
      }
      if(!touch){
        for(const destination of [20,23]){
          await load(0,0,0);
          const a=await coords(19,true),b=await coords(destination);
          await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:8});await page.mouse.up();
          await wait([{from:'bar',to:destination,die:destination===20?4:1}]);
          await load(0,0,1);await tap(19,true);
          const key=await page.evaluate(async point=>{const k=await import('/backgammon/core/shortcuts.mjs');return k.SHORTCUTS.find(d=>/^(top|bottom)/.test(d.id)&&k.visiblePoint(d.id,0)===point).keys[0];},destination);
          await page.keyboard.press(key);await wait([{from:'bar',to:destination,die:destination===20?4:1}]);
        }
      }
      await load(0,0,0,false);await tap(19,true);
      assert.equal(await page.locator('.bg-board.no-move-hints').count(),1,'hints-off setting still honored');
      await tap(20);await wait([{from:'bar',to:20,die:4}]);
      assert.deepEqual(errors,[]);
    } finally {await context.close();}
  }
  return {browser:name,cases,extra:'drag, keyboard, reload, no auto-confirm, hints disabled'};
};
