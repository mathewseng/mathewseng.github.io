const { waitForAsync } = require("./play-helpers.cjs");
const assert = require('node:assert/strict'), path = require('node:path');
module.exports = async function dragFeedback(browser, base, out, name) {
  const ctx = await browser.newContext({ viewport:{width:1366,height:900}, serviceWorkers:'block' });
  const page = await ctx.newPage(), errors=[], shots=[];
  page.on('pageerror', e=>errors.push(e.message));
  const snapshot=()=>page.evaluate(()=>({draft:dragTest.d.draft, selected:dragTest.d.selected, state:dragTest.d.current()}));
  const fixture=async({mode='advanced',turn=0,orientation=0,kind='opening',motion='reduce',count=8}={})=>page.evaluate(async options=>{
    const {d,r,st}=dragTest;
    st.saveSettings({interactionMode:options.mode,orientation:options.orientation,motion:options.motion,motionScale:1,equityBar:false,boardTheme:{preset:'plum'}});
    (await import('/backgammon/ui/motion.mjs')).applyMotionSettings(st.settings());
    (await import('/backgammon/core/appearance.mjs')).applyBoardTheme({preset:'plum'});
    let s=r.initialState({phase:'move',dice:[4,1]});
    if(options.kind==='stack') {const points=Array(24).fill(0);points[12]=options.count;points[5]=15-options.count;points[23]=-15;s=r.initialState({points,phase:'move',dice:[4,1]});}
    if(options.kind==='bar') {const points=Array(24).fill(0);points[5]=13;points[11]=-15;s=r.initialState({points,bar:[2,0],phase:'move',dice:[4,1]});}
    if(options.kind==='off') {const points=Array(24).fill(0);points[0]=2;points[23]=-15;s=r.initialState({points,off:[13,0],phase:'move',dice:[1,2]});}
    if(['hit','landing-stack','doubles'].includes(options.kind)) {const points=Array(24).fill(0);points[12]=15;points[23]=-15;
      if(options.kind==='hit') {points[8]=-1;points[23]=-14;}
      if(options.kind==='landing-stack') {points[12]=7;points[8]=8;}
      s=r.initialState({points,phase:'move',dice:options.kind==='doubles'?[2,2]:[4,1]});}
    if(options.kind==='revision') {const points=Array(24).fill(0);points[5]=14;points[11]=-15;s=r.initialState({points,bar:[1,0],phase:'move',dice:[4,1]});}
    if(options.turn) s={...s,turn:1,points:s.points.toReversed().map(n=>-n),bar:s.bar.toReversed(),off:s.off.toReversed()};
    d.set(s,r.legalPaths(s)); d.board.suppressClickUntil=0; window.sourceJSON=JSON.stringify(s);
  },{mode,turn,orientation,kind,motion,count});
  const coord=async(point,disc=false,index=-1)=>page.evaluate(({point,disc,index})=>{
    const node=document.querySelector(`[data-point="${point}"]`);
    const c=disc?[...node.querySelectorAll(':scope > .checker > circle:first-child')].at(index):node.querySelector('.point-hit');
    const p=disc?{x:+c.getAttribute('cx'),y:+c.getAttribute('cy')}:{x:+c.getAttribute('x')+ +c.getAttribute('width')/2,y:+c.getAttribute('y')+ +c.getAttribute('height')/2};
    const q=new DOMPoint(p.x,p.y).matrixTransform(node.getScreenCTM());return{x:q.x,y:q.y};
  },{point,disc,index});
  const lift=async(from,to,{outside=false,index=-1}={})=>{
    const a=await coord(from,true,index), b=outside?{x:2,y:2}:await coord(to);
    await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:6});
    assert.equal(await page.locator('.drag-checker').count(),1);
    assert.ok(await page.locator('.drag-origin').count()>0);
    assert.ok(await page.locator('.drag-origin').evaluateAll(ns=>ns.every(n=>getComputedStyle(n).visibility==='hidden')),'no faded original checker');
    assert.equal(await page.locator('.drop-hover').count(),1);
    assert.equal(await page.locator('.drag-landing-ghost').count(),1);
    assert.equal(await page.locator('.drag-landing-ghost').getAttribute('data-target'),await page.locator('.drop-hover').getAttribute('data-point'));
    assert.equal(await page.evaluate(()=>JSON.stringify(dragTest.d.state)===sourceJSON),true,'pickup never mutates game');
    return await page.locator('.drop-hover').getAttribute('data-point');
  };
  const release=async()=>{
    const landing=await page.locator('.drag-landing-ghost').evaluate(n=>{const m=new DOMMatrix(n.style.transform);return {target:n.dataset.target,x:m.e,y:m.f};});
    await page.mouse.up();
    assert.equal(await page.locator('.drag-checker,.drag-origin,.drag-remainder,.drop-hover,.drag-landing-ghost').count(),0);
    const actual=await page.locator(`[data-point="${landing.target}"] > .checker > circle:first-child`).last().evaluate(c=>({x:+c.getAttribute('cx'),y:+c.getAttribute('cy')}));
    assert.deepEqual(actual,{x:landing.x,y:landing.y},'ghost previews the actual resulting checker slot');
  };
  const shot=async(label)=>{const file=`${name}-${label}.png`;await page.screenshot({path:path.join(out,file)});shots.push(file);};
  // Freeze on the actual release, after the legal draft dispatch, so frame
  // assertions do not depend on how fast this computer runs the browser.
  const holdDrop=async(p=page)=>p.evaluate(()=>{
    const board=document.querySelector('.bg-board');
    board.addEventListener('pointerup',()=>{
      const ghost=board.querySelector('.drop-landing-ghost'),piece=ghost?.nextElementSibling;
      window.dropProbe=ghost ? {ghost,piece,ga:ghost.getAnimations()[0],pa:piece.getAnimations()[0]} : null;
      if(dropProbe) for(const a of [dropProbe.ga,dropProbe.pa]) {a.pause();a.currentTime=0;}
    },{once:true});
  });
  try {
    await page.goto(base+'/backgammon/');
    await page.evaluate(async()=>{
      const {shell,DraftBoard}=await import('/backgammon/ui/shell.mjs');
      const r=await import('/backgammon/core/rules.mjs'),st=await import('/backgammon/core/storage.mjs');
      const ui=shell('trainer','Checker interactions');const d=new DraftBoard(ui.board);
      window.dragTest={d,r,st};
    });
    // Actual pointer clicks: amber means this disc's click undoes, never moves forward.
    for(const turn of [0,1]) for(const orientation of [0,1]) {
      await fixture({turn,orientation});
      const map=p=>turn?23-p:p;
      await page.evaluate(map=>dragTest.d.move({from:map[0],to:map[1],die:4}),[map(12),map(8)]);
      assert.equal(await page.locator('.draft-undo-checker').count(),0,'remaining forward die is not an undo cue');
      await page.evaluate(map=>dragTest.d.move({from:map[0],to:map[1],die:1}),[map(5),map(4)]);
      assert.equal(await page.locator('.draft-undo-checker').count(),2);
      const q=await coord(map(8),true);await page.mouse.click(q.x,q.y);
      assert.deepEqual((await snapshot()).draft,[{from:map(5),to:map(4),die:1}]);
      assert.equal(await page.locator('.draft-undo-checker').count(),1,'the other checker is still blocked by the opposing one-point');
      assert.equal(await page.locator(`[data-point="${map(4)}"] .draft-undo-checker`).count(),1);
    }
    await fixture();
    await page.evaluate(()=>{const d=dragTest.d;d.move({from:12,to:8,die:4});d.move({from:5,to:4,die:1});d.minDraft=2;d.render();});
    assert.equal(await page.locator('.draft-undo-checker').count(),0,'forced moves are not undoable');
    for(const mode of ['advanced','beginner']) for(const orientation of [0,1]) {
      await fixture({mode,orientation});
      await lift(12,8);await release();assert.deepEqual((await snapshot()).draft,[{from:12,to:8,die:4}]);
      await fixture({mode,orientation});
      const target=await lift(12,8,{outside:true});await release();
      assert.equal((await snapshot()).draft.at(-1)?.to ?? 12,Number(target),'outside drop matches its preview, including staying at origin');
      await fixture({mode,orientation});await lift(12,11); // opponent's blocked point
      assert.notEqual(await page.locator('.drop-hover').getAttribute('data-point'),'11');
      await release(); // A miss may now settle back at the original point.
      await fixture({mode,orientation});await lift(12,8);
      const origin=await coord(12);await page.mouse.move(origin.x,origin.y);
      assert.equal(await page.locator('.drag-landing-ghost').getAttribute('data-target'),'12');
      await release();assert.equal((await snapshot()).draft.length,0,'release at origin cancels the drag');
      await fixture({mode,orientation});
      await page.evaluate(()=>dragTest.d.move({from:12,to:8,die:4}));
      const previous=await page.evaluate(()=>{
        const n=document.querySelector('[data-point="12"] .point-hit');
        const y=+n.getAttribute('y'),h=+n.getAttribute('height');
        const q=new DOMPoint(+n.getAttribute('x')+30,y+(y<300?h-15:15)).matrixTransform(n.getScreenCTM());
        return{x:q.x,y:q.y};
      });await page.mouse.click(previous.x,previous.y);
      assert.equal((await snapshot()).draft.length,0,'tap original point space restores checker');
      await fixture({mode,orientation});await lift(12,8);await page.keyboard.press('Escape');await page.mouse.up();
      assert.equal((await snapshot()).draft.length,0,'Escape cancels without a move');
      assert.equal(await page.locator('.drag-checker,.drag-origin').count(),0);
    }
    await fixture();
    await page.evaluate(()=>{const d=dragTest.d;d.move({from:12,to:8,die:4});d.move({from:5,to:4,die:1});d.preview=d.current();d.render();});
    assert.equal(await page.locator('.draft-undo-checker').count(),0,'previews never advertise undo');
    // Every visible disc is a hitbox for the top checker. Lower discs stay
    // painted, including across a redraw, cancellation, and compressed stacks.
    for(const turn of [0,1]) for(const orientation of [0,1]) for(const count of [3,5,6,8]) for(const index of [0,1,-1]) {
      const from=turn?11:12,to=turn?15:8;
      await fixture({kind:'stack',turn,orientation,count});
      await lift(from,to,{index});
      const checkTop=()=>page.locator(`[data-point="${from}"]`).evaluate(n=>{
        const pieces=[...n.querySelectorAll(':scope > .checker:not(.drag-remainder)')];
        return {hidden:pieces.map(p=>getComputedStyle(p).visibility==='hidden'),text:n.querySelector('.drag-remainder text')?.textContent??null};
      });
      for(const redraw of [false,true]) {
        if(redraw) await page.evaluate(()=>dragTest.d.render());
        const actual=await checkTop();
        assert.deepEqual(actual.hidden,Array.from({length:Math.min(count,5)},(_,i)=>i===Math.min(count,5)-1));
        assert.equal(actual.text,count>6?String(count-1):null,'six becomes five without a count label');
      }
      await page.keyboard.press('Escape');await page.mouse.up();
      assert.equal((await snapshot()).draft.length,0);
      assert.equal(await page.locator('.drag-origin,.drag-remainder').count(),0);
    }
    // Empty point tips are also pickup space, in either direction/orientation.
    // Stationary taps retain their destination behavior in the existing cases above.
    for(const turn of [0,1]) for(const orientation of [0,1]) for(const mode of ['advanced','beginner']) {
      await fixture({kind:'stack',count:3,turn,orientation,mode});
      const from=turn?11:12,to=turn?15:8;
      const a=await page.locator(`[data-point="${from}"] .point-hit`).evaluate(n=>{
        const y=+n.getAttribute('y'),h=+n.getAttribute('height');
        const p=new DOMPoint(+n.getAttribute('x')+25,y+(y<300?h-20:20)).matrixTransform(n.getScreenCTM());
        return {x:p.x,y:p.y};
      });
      const b=await coord(to);
      await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:6});
      assert.equal(await page.locator('.drag-checker').count(),1,'open point lane picks up its stack');
      assert.deepEqual(await page.locator(`[data-point="${from}"] > .checker`).evaluateAll(ns=>ns.map(n=>n.classList.contains('drag-origin'))),[false,false,true]);
      await release();
      assert.deepEqual((await snapshot()).draft,[{from,to,die:4}]);
    }
    // Compressed stacks keep an accurate remaining count during pickup.
    await fixture({kind:'stack'});await lift(12,8,{index:0});
    assert.equal(await page.locator('[data-point="12"] > .checker:not(.drag-origin)').count(),5);
    assert.equal(await page.locator('[data-point="12"] > .checker:not(.drag-origin) text').textContent(),'7');
    await release();assert.equal((await snapshot()).state.points[12],7);
    await fixture({kind:'bar'});await lift('bar0',20);
    assert.equal(await page.locator('[data-point="bar0"] .drag-remainder text').count(),0,'two on bar becomes one while lifted');
    await release();assert.equal((await snapshot()).state.bar[0],1);
    await fixture({kind:'off'});
    await page.evaluate(()=>{dragTest.d.move({from:0,to:'off',die:1});});
    assert.equal(await page.locator('[data-point="off0"] .draft-undo-checker').count(),1);
    await lift('off0',0);await release();assert.equal((await snapshot()).state.off[0],13);
    // Landing slots are based on the resulting legal draft: occupied stacks,
    // hits, multi-die journeys, original returns and replacement-die routes.
    for(const turn of [0,1]) for(const orientation of [0,1]) {
      const map=p=>turn?23-p:p;
      for(const kind of ['hit','landing-stack','doubles']) {
        await fixture({kind,turn,orientation});
        await lift(map(12),map(kind==='doubles'?4:8));
        if(kind==='landing-stack') assert.equal(await page.locator('.drag-landing-count').textContent(),'9');
        if(kind==='landing-stack' && !turn && !orientation) await shot('landing-compressed-stack');
        await release();
        assert.equal((await snapshot()).draft.length,kind==='doubles'?4:1);
        if(kind==='hit') assert.equal((await snapshot()).state.bar[1-turn],1);
        await lift(map(kind==='doubles'?4:8),map(12));
        assert.equal(await page.locator('.drag-landing-ghost.is-undo').count(),1);
        if(kind==='hit' && !turn && !orientation) await shot('landing-undo');
        await release();assert.equal((await snapshot()).draft.length,0);
      }
      await fixture({kind:'off',turn,orientation});
      await page.evaluate(()=>{dragTest.d.preferred=1;dragTest.d.render();});
      await lift(map(0),`off${turn}`);await release();
      assert.equal((await snapshot()).state.off[turn],14);
      await fixture({kind:'revision',turn,orientation});
      await page.evaluate(({a,b})=>{dragTest.d.move({from:'bar',to:a,die:4});dragTest.d.move({from:a,to:b,die:1});},{a:map(20),b:map(19)});
      await lift(map(19),map(23));await release();
      assert.deepEqual((await snapshot()).draft,[{from:'bar',to:map(23),die:1}]);
      await lift(map(23),`bar${turn}`);await release();assert.equal((await snapshot()).state.bar[turn],1);
    }
    // Real pointer movement retargets one ghost from its currently visible pose.
    await fixture({motion:'full'});await lift(12,8);await page.waitForTimeout(210);
    const target=await coord(7);await page.mouse.move(target.x,target.y);
    const motionCheck=await page.evaluate(()=>{
      const b=dragTest.d.board,n=b.dragLanding,a=b.dragLandingMove;
      a.pause();a.currentTime=60;
      const read=()=>{const m=new DOMMatrix(getComputedStyle(n).transform);return{x:m.e,y:m.f};};
      const middle=read();b.followDrag(b.pointer.clientX,b.pointer.clientY);
      const unchanged=a===b.dragLandingMove;
      dragTest.d.render();const redraw=a===b.dragLandingMove && n===b.dragLanding;
      const prior=read(),m=b.svg.getScreenCTM(),q=new DOMPoint(234,460).matrixTransform(m);
      b.followDrag(q.x,q.y);b.dragLandingMove.pause();b.dragLandingMove.currentTime=0;
      const resumed=read();
      return{middle,unchanged,redraw,prior,resumed};
    });
    assert.ok(motionCheck.middle.x>234 && motionCheck.middle.x<294,'ghost glides between points');
    assert.ok(motionCheck.middle.y<606 && motionCheck.middle.y>474,'ghost glides to occupied stack slot');
    assert.equal(motionCheck.unchanged,true,'movement within one region does not restart the glide');
    assert.equal(motionCheck.redraw,true,'unrelated redraw retains node and in-flight animation');
    assert.ok(Math.hypot(motionCheck.prior.x-motionCheck.resumed.x,motionCheck.prior.y-motionCheck.resumed.y)<.1,'rapid reversal starts at visible position');
    await page.evaluate(()=>{document.documentElement.dataset.motion='reduce';dispatchEvent(new Event('bg-motion'));});
    assert.equal(await page.evaluate(()=>dragTest.d.board.dragLanding.getAnimations().length),0);
    await page.keyboard.press('Escape');await page.mouse.up();
    assert.equal(await page.locator('.drag-landing-ghost').count(),0);
    // Both sprites settle together for forward, combined, hit, undo, revised
    // and bearoff moves. The game updates immediately; animation is decoration.
    for(const kind of ['opening','combined','undo','hit','revision','off']) {
      await fixture({kind:['combined','undo'].includes(kind)?'opening':kind,motion:'full'});
      let from=12,to=kind==='combined'?7:8;
      if(kind==='undo') {await page.evaluate(()=>dragTest.d.move({from:12,to:8,die:4}));from=8;to=12;}
      if(kind==='revision') {
        await page.evaluate(()=>{dragTest.d.move({from:'bar',to:20,die:4});dragTest.d.move({from:20,to:19,die:1});});from=19;to=23;
      }
      if(kind==='off') {await page.evaluate(()=>{dragTest.d.preferred=1;dragTest.d.render();});from=0;to='off0';}
      await page.waitForTimeout(600);await lift(from,to);await page.waitForTimeout(210);
      const initialOpacity=await page.locator('.drag-landing-ghost').evaluate(n=>Number(getComputedStyle(n).opacity));
      await holdDrop();await page.mouse.up();
      const frames=await page.evaluate(()=>{
        if(!dropProbe) return null;
        const {ga,pa,ghost}=dropProbe;
        const at=f=>{ga.currentTime=f*ga.effect.getTiming().duration;pa.currentTime=f*pa.effect.getTiming().duration;return Number(getComputedStyle(ghost).opacity);};
        return {duration:ga.effect.getTiming().duration,checkerDuration:pa.effect.getTiming().duration,
          opacity:[at(0),at(.3),at(.65),at(.95)],
          ghostEnd:ga.effect.getKeyframes().at(-1).transform,checkerEnd:pa.effect.getKeyframes().at(-1).transform,
          pointerEvents:getComputedStyle(ghost).pointerEvents,hidden:ghost.getAttribute('aria-hidden')};
      });
      assert.ok(frames,`${kind}: ghost survives release`);
      assert.equal(frames.duration,frames.checkerDuration,'ghost fades on the checker landing clock');
      assert.equal(frames.ghostEnd,frames.checkerEnd,'both converge on the same landing position');
      assert.ok(Math.abs(frames.opacity[0]-initialOpacity)<.01,'no opacity jump at release');
      assert.ok(Math.abs(frames.opacity[0]-frames.opacity[1])<.001,'ghost stays visible during approach');
      assert.ok(frames.opacity[2]>0 && frames.opacity[2]<frames.opacity[1]);
      assert.ok(frames.opacity[3]<.02,'ghost vanishes as the checker settles');
      assert.equal(frames.pointerEvents,'none');assert.equal(frames.hidden,'true');
      assert.equal(await page.evaluate(()=>{
        const {ga,pa,ghost,piece}=dropProbe;
        const time=ga.currentTime;dragTest.d.render();
        return ghost.isConnected && piece.isConnected && ga.currentTime===time &&
          ghost.getAnimations()[0]===ga && piece.getAnimations()[0]===pa;
      }),true,'unchanged redraw retains the landing and fade clocks');
      if(kind==='opening' || kind==='undo') {
        await page.evaluate(()=>{for(const a of [dropProbe.ga,dropProbe.pa])a.currentTime=a.effect.getTiming().duration*.6;});
        await shot(`drop-settling-${kind}`);
      }
      await page.evaluate(()=>{for(const a of [dropProbe.ga,dropProbe.pa])a.play();});
      await page.waitForFunction(()=>!document.querySelector('.drop-landing-ghost,.moving-checker'));
      assert.equal(await page.locator('[data-arriving]').count(),0);
      assert.equal(await page.evaluate(()=>JSON.stringify(dragTest.d.state)===sourceJSON),true,'settling does not commit the draft');
    }
    await fixture({motion:'full'});await lift(12,8);await page.waitForTimeout(210);
    const across=await coord(7);await page.mouse.move(across.x,across.y);
    const beforeDrop=await page.evaluate(()=>{const b=dragTest.d.board;b.dragLandingMove.pause();b.dragLandingMove.currentTime=50;return getComputedStyle(b.dragLanding).transform;});
    await holdDrop();await page.mouse.up();
    assert.ok(await page.evaluate(before=>{
      const a=new DOMMatrix(before),b=new DOMMatrix(getComputedStyle(dropProbe.ghost).transform);
      return Math.hypot(a.e-b.e,a.f-b.f)<.01;
    },beforeDrop),'release continues an interrupted glide');
    await page.evaluate(()=>{document.documentElement.dataset.motion='reduce';dispatchEvent(new Event('bg-motion'));});
    assert.equal(await page.locator('.drop-landing-ghost,.moving-checker,[data-arriving]').count(),0);
    await fixture({motion:'reduce'});await lift(12,8);await release();
    assert.equal(await page.locator('.drop-landing-ghost,.moving-checker').count(),0);
    await fixture({motion:'full'});await lift(12,8);await holdDrop();await page.mouse.up();
    await page.evaluate(()=>dragTest.d.set(dragTest.d.state,dragTest.d.paths));
    assert.equal(await page.locator('.drop-landing-ghost,.moving-checker,[data-arriving]').count(),0,'new state clears interrupted release');
    await fixture({mode:'beginner'});await page.evaluate(()=>{dragTest.d.move({from:12,to:8,die:4});dragTest.d.move({from:5,to:4,die:1});});
    assert.equal(await page.locator('.draft-undo-checker').count(),0,'beginner clicks still select');
    await fixture({motion:'full'});
    await page.evaluate(()=>{dragTest.d.move({from:12,to:8,die:4});dragTest.d.move({from:5,to:4,die:1});});
    await page.waitForTimeout(600);await shot('amber-draft-desktop');
    for(const [width,height] of [[390,844],[844,390],[1366,900]]) {
      await page.setViewportSize({width,height});await fixture({motion:'full'});
      await lift(12,8);await page.waitForTimeout(180);
      await shot(`lifted-checker-${width}`);
      // Redraws from unrelated UI updates must keep the held checker attached.
      await page.evaluate(()=>dragTest.d.render());
      assert.equal(await page.locator('.drag-checker').count(),1);
      await release();assert.equal((await snapshot()).draft.length,1);
      await page.waitForFunction(()=>!document.querySelector('.moving-checker'));
      assert.equal(await page.locator('[data-arriving]').count(),0);
    }
    // Browser-dispatched touch, not synthetic JS pointer events, checks that
    // mobile panning never steals an actual checker drag.
    if(name==='chromium') {
      const touchContext=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block'});
      const t=await touchContext.newPage();await t.goto(base+'/backgammon/');
      await t.evaluate(async()=>{
        const {shell,DraftBoard}=await import('/backgammon/ui/shell.mjs');
        const r=await import('/backgammon/core/rules.mjs');const st=await import('/backgammon/core/storage.mjs');
        st.saveSettings({interactionMode:'advanced',motion:'full',motionScale:1,equityBar:false,boardTheme:{preset:'plum'}});
        const d=new DraftBoard(shell('trainer','Touch drag').board),s=r.initialState({phase:'move',dice:[4,1]});d.set(s,r.legalPaths(s));window.touchDraft=d;
      });
      const coords=await t.evaluate(()=>{const b=touchDraft.board,cv=(x,y)=>{const p=new DOMPoint(x,y).matrixTransform(b.svg.getScreenCTM());return{x:p.x,y:p.y};};return{a:cv(54,282),b:cv(234,460)};});
      const cdp=await touchContext.newCDPSession(t);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...coords.a,id:1}]});
      for(let i=1;i<=10;i++) await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:coords.a.x+(coords.b.x-coords.a.x)*i/10,y:coords.a.y+(coords.b.y-coords.a.y)*i/10,id:1}]});
      assert.equal(await t.locator('.drag-checker').count(),1,'touch pickup works outside the visible disc');
      assert.equal(await t.locator('.bg-board.no-move-hints').count(),0,'touch drag exposes all legal targets');
      assert.equal(await t.locator('.drag-landing-ghost[data-target="8"]').count(),1);
      const occupied=await t.evaluate(()=>{const p=new DOMPoint(294,460).matrixTransform(touchDraft.board.svg.getScreenCTM());return{x:p.x,y:p.y};});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...occupied,id:1}]});
      assert.equal(await t.locator('.drag-landing-ghost[data-target="7"]').count(),1);
      assert.equal(await t.evaluate(()=>touchDraft.draft.length),0,'touch preview never plays a move');
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...coords.b,id:1}]});
      await t.waitForTimeout(180);
      const file=`${name}-actual-touch-pickup.png`;await t.screenshot({path:path.join(out,file)});shots.push(file);
      await holdDrop(t);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      assert.equal(await t.locator('.drop-landing-ghost').count(),1,'touch release retains the ghost');
      await t.evaluate(()=>{for(const a of [dropProbe.ga,dropProbe.pa])a.currentTime=a.effect.getTiming().duration*.6;});
      const settling=`${name}-touch-drop-settling.png`;await t.screenshot({path:path.join(out,settling)});shots.push(settling);
      await t.evaluate(()=>{for(const a of [dropProbe.ga,dropProbe.pa])a.play();});
      await t.waitForFunction(()=>!document.querySelector('.drop-landing-ghost,.moving-checker'));
      assert.equal(await t.evaluate(()=>touchDraft.draft.length),1);
      assert.equal(await t.evaluate(()=>scrollY),0);
      assert.equal(await t.locator('.drag-checker,.drag-origin,.drag-landing-ghost').count(),0);
      await t.evaluate(()=>touchDraft.set(touchDraft.state,touchDraft.paths));
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...coords.a,id:2}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...coords.b,id:2}]});
      assert.equal(await t.locator('.drag-checker').count(),1);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
      assert.equal(await t.evaluate(()=>touchDraft.draft.length),0,'interrupted touch cancels');
      assert.equal(await t.locator('.drag-checker,.drag-origin,.drag-landing-ghost').count(),0);
      // Reduced-motion redraws replace the touched disc synchronously. Drag
      // the outside disc of a stack as well as its innermost checker above.
      await t.evaluate(async()=>{
        (await import('/backgammon/core/storage.mjs')).saveSettings({motion:'reduce'});
        document.documentElement.dataset.motion='reduce';
        touchDraft.set(touchDraft.state,touchDraft.paths);
      });
      const reduced=await t.locator('[data-point="12"] .checker > circle').first().evaluate(c=>{
        const p=new DOMPoint(+c.getAttribute('cx'),+c.getAttribute('cy')).matrixTransform(c.getScreenCTM());
        return {x:p.x,y:p.y};
      });
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...reduced,id:3}]});
      for(let i=1;i<=10;i++) {
        await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:reduced.x+(coords.b.x-reduced.x)*i/10,y:reduced.y+(coords.b.y-reduced.y)*i/10,id:3}]});
        await t.waitForTimeout(20);
      }
      assert.deepEqual(await t.locator('[data-point="12"] > .checker').evaluateAll(ns=>ns.map(n=>n.classList.contains('drag-origin'))),[false,false,false,false,true],'touching bottom disc lifts top');
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await t.waitForFunction(()=>touchDraft.draft.length===1);
      assert.deepEqual(await t.evaluate(()=>touchDraft.draft),[{from:12,to:8,die:4}]);
      assert.equal(await t.evaluate(()=>scrollY),0,'reduced-motion touch drag retains its pointer');
      await touchContext.close();
    }
    // Real Play persists only the draft. It does not confirm or reroll on drop.
    for(const [width,height] of [[1366,900],[390,844]]) {
      await page.setViewportSize({width,height});await page.goto(base+'/backgammon/');
      await page.evaluate(async()=>{
        const st=await import('/backgammon/core/storage.mjs'),r=await import('/backgammon/core/rules.mjs');
        const {localConfig}=await import('/backgammon/core/play-session.mjs');
        const state=r.initialState({phase:'move',dice:[4,1],matchLength:0});
        st.saveSettings({interactionMode:'advanced',motion:'system',motionScale:1,equityBar:false,boardTheme:{preset:'plum'}});
        await st.put('work',{id:'play',game:{id:'drag-live',initial:state,state,events:[],started:true,names:['You','Friend'],config:localConfig({mode:'local'})},draft:[]});
      });
      await page.goto(base+'/backgammon/play/#resume=drag-live');
      await page.locator('#confirm').waitFor();
      const a=await coord(12,true),b=await coord(8);
      await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:6});
      assert.equal(await page.locator('.drag-checker').count(),1);await shot(`live-drag-${width}`);
      await holdDrop();
      await page.mouse.up();
      assert.equal(await page.locator('.drop-landing-ghost').count(),1);
      await waitForAsync(page,async()=>{const v=await(await import('/backgammon/core/storage.mjs')).get('work','play');return v.draft.length===1;});
      await page.evaluate(()=>{for(const a of [dropProbe.ga,dropProbe.pa])a.currentTime=a.effect.getTiming().duration*.6;});
      await shot(`live-drop-settling-${width}`);
      await page.evaluate(()=>{for(const a of [dropProbe.ga,dropProbe.pa])a.play();});
      await page.waitForFunction(()=>!document.querySelector('.drop-landing-ghost,.moving-checker'));
      const q=await coord(5,true);await page.mouse.click(q.x,q.y);
      await waitForAsync(page,async()=>{const v=await(await import('/backgammon/core/storage.mjs')).get('work','play');return v.draft.length===2;});
      await page.waitForTimeout(600);await shot(`live-amber-${width}`);
      assert.equal(await page.locator('.draft-undo-checker').count(),2);
      const stored=await page.evaluate(async()=>await(await import('/backgammon/core/storage.mjs')).get('work','play'));
      assert.equal(stored.game.events.length,0);assert.deepEqual(stored.game.state.dice,[4,1]);
    }
    assert.deepEqual(errors,[]);
    return {screenshots:shots,checks:['amber matches click-to-undo','forced/preview/beginner exclusions','actual source hidden','nearest legal release','ghost matches final landing slot','hits and compressed destination counts','multi-die journeys and dice revisions','interrupted ghost glide and mid-drag redraw','ghost retained through release and fades on landing','settle clocks survive unchanged redraws','real Play and touch settle without committing turn','reduced motion settles ghost','blocked/outside drops','Escape cancellation','both modes/orientations/players','compressed/bar/off stacks','desktop and mobile layout',...(name==='chromium'?['Chromium native touch and retargeting']:[])]};
  } finally {await ctx.close();}
};
