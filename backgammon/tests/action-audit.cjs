const assert = require("node:assert/strict");
const path = require("node:path");

module.exports = async function actionAudit(browser, base, out, name) {
  const report = [];
  for (const touch of [false, true]) {
    const context = await browser.newContext({
      viewport: touch ? { width: 390, height: 844 } : { width: 1366, height: 768 },
      hasTouch: touch, reducedMotion: "reduce", serviceWorkers: "block",
    });
    const page = await context.newPage(), errors = [];
    page.on("pageerror", e => errors.push(e.message));
    try {
      await page.goto(base + "/backgammon/");
      await page.evaluate(async () => {
        const { shell, DraftBoard } = await import("/backgammon/ui/shell.mjs");
        const r = await import("/backgammon/core/rules.mjs");
        const st = await import("/backgammon/core/storage.mjs");
        window.audit = {r, st, d: new DraftBoard(shell("trainer", "Interaction audit").board)};
      });
      const set = async (kind, turn, orientation, selected = null) => page.evaluate(({kind,turn,orientation,selected}) => {
        const {r,st,d} = audit, p = n => turn ? 23-n : n, sg=r.sign(turn);
        st.saveSettings({orientation, numbers:true});
        const s=r.initialState({phase:"move",dice:kind==="self"?[6,5]:[4,3],turn});
        let draft=[];
        if (["revision","forced"].includes(kind)) draft=[{from:p(12),to:p(8),die:4}];
        if (kind==="mixed") {
          s.points=Array(24).fill(0);
          for (const n of [5,8,9]) s.points[p(n)]=5*sg;
          s.points[p(23)]=-15*sg;
          s.dice=[2,1]; draft=[{from:p(8),to:p(6),die:2}];
        }
        if (kind==="off") {
          s.points=Array(24).fill(0);
          s.points[p(2)]=3*sg; s.points[p(1)]=12*sg; s.points[p(20)]=-15*sg;
          s.dice=[3,2]; draft=[{from:p(2),to:"off",die:3}];
        }
        if (kind==="bar") {
          s.points[p(23)]=0; s.bar[turn]=2;
          draft=[{from:"bar",to:p(21),die:3}];
        }
        if (kind==="bar-repeat") {
          s.dice=[5,1]; s.points[p(23)]-=sg; s.bar[turn]=1;
          s.points[p(12)]-=sg; s.points[p(20)]+=sg;
        }
        if (kind==="hit") { s.points[p(8)]=-sg; s.points[p(18)]+=sg; }
        r.assertState(s);
        d.set(s,r.legalPaths(s)); d.draft=draft;
        d.minDraft=kind==="forced"?1:0;
        d.selected=typeof selected==="number"?p(selected):selected;
        d.render();
      }, {kind,turn,orientation,selected});
      const read=()=>page.evaluate(()=>({draft:audit.d.draft,selected:audit.d.selected,bar:audit.d.current().bar,off:audit.d.current().off}));
      let clicks=0;
      const tap=async (point, region="space")=>{
        const pos=await page.evaluate(({point,region})=>{
          const g=document.querySelector(`[data-point="${point}"]`);
          let x,y;
          if(region==="disc"||region==="count") {
            const c=g.querySelector(region==="count"?".checker > circle":".checker > circle,.off-checker");
            if(c.tagName==="circle") {x=+c.getAttribute("cx");y=+c.getAttribute("cy");}
            else {x=+c.getAttribute("x")+16;y=+c.getAttribute("y")+3.5;}
          } else {
            const h=g.querySelector(region==="number"?".point-number-hit":".point-hit");
            x=+h.getAttribute("x") + +h.getAttribute("width")/2;
            y=region==="number"?+h.getAttribute("y")+14:
              point.startsWith("off") ? +h.getAttribute("y")+120:
              +h.getAttribute("y")<100?280:380;
            if(point.startsWith("bar")&&y===380)y=405;
          }
          const pos=new DOMPoint(x,y).matrixTransform(document.querySelector(".bg-board").getScreenCTM());
          return {x:pos.x,y:pos.y};
        },{point:String(point),region});
        clicks++;
        if(touch)await page.touchscreen.tap(pos.x,pos.y);
        else await page.mouse.click(pos.x,pos.y);
      };
      for(const turn of [0,1])for(const orientation of [0,1]){
        const p=n=>turn?23-n:n;
        await set("start",turn,orientation,12);
        await tap(p(3));
        assert.deepEqual((await read()).draft,[],"unhighlighted empty destination cannot steal another source");
        assert.equal((await read()).selected,null,"unavailable point clears selection without moving a hidden source");
        await set("start",turn,orientation,12);
        await tap(p(7));
        assert.equal((await read()).selected,p(7),"unhighlighted friendly stack changes source, never plays hidden incoming route");
        await tap(p(3));
        assert.equal((await read()).draft[0].from,p(7));
        for(const target of ["frame","page","die","button"]) {
          await set("start",turn,orientation,12);
          const before=await read();
          if(target==="frame") {
            const pos=await page.evaluate(()=>{const p=new DOMPoint(10,330).matrixTransform(document.querySelector(".bg-board").getScreenCTM());return {x:p.x,y:p.y};});
            if(touch)await page.touchscreen.tap(pos.x,pos.y);else await page.mouse.click(pos.x,pos.y);
          } else {
            const selector=target==="page"?"#draft-line":target==="button"?"#preferences":'.board-die[role="button"]';
            if(touch)await page.locator(selector).first().tap();else await page.locator(selector).first().click();
          }
          assert.deepEqual((await read()).draft,before.draft);
          assert.equal((await read()).selected,["die","button"].includes(target)?p(12):null,`${name} ${touch ? "touch" : "mouse"} player ${turn} orientation ${orientation}: ${target} selection policy`);
          if(target==="button") {
            await page.locator("dialog[open]").waitFor();
            await page.keyboard.press("Escape");
            assert.equal((await read()).selected,p(12),"dialog actions preserve selection");
          }
        }
        for(const region of ["disc","space","number"]){
          await set("start",turn,orientation,12);
          await tap(p(5),region);
          if(region==="disc"){
            assert.equal((await read()).selected,p(5));
            assert.equal((await read()).draft.length,0,"selectable resident disc wins over a destination");
          }else{
            assert.equal((await read()).draft.length,2,"point area and number play selected combined route");
            assert.equal((await read()).draft[0].from,p(12));
          }
          await set("self",turn,orientation,12);
          await tap(p(12),region);
          assert.equal((await read()).selected,null,"selected source deselects even when a different checker could land there");
          assert.equal((await read()).draft.length,0);
        }
        await set("revision",turn,orientation);
        await tap(p(12),"disc");
        assert.equal((await read()).selected,p(12));
        assert.equal((await read()).draft.length,1);
        await set("revision",turn,orientation);
        await tap(p(12));
        assert.equal((await read()).draft.length,0,"amber point returns while its movable resident disc selects");
        await set("revision",turn,orientation,8);
        await tap(p(9));
        assert.deepEqual((await read()).draft,[{from:p(12),to:p(9),die:3}],"alternate die revises instead of adding a move");
        await set("forced",turn,orientation,8);
        assert.equal(await page.locator(".return-destination,.entry-switch-destination").count(),0);
        await tap(p(12));
        assert.deepEqual((await read()).draft,[{from:p(12),to:p(8),die:4}],"locked prefix cannot be undone by point input");
        await set("mixed",turn,orientation);
        assert.equal(await page.locator(`[data-point="${p(8)}"].reachable:not(.return-destination)`).count(),1);
        await tap(p(8));
        assert.deepEqual((await read()).draft.at(-1),{from:p(9),to:p(8),die:1},"forward wash wins without selection");
        await tap(p(8));
        assert.equal((await read()).draft.length,2,"surplus repeat cannot activate the overlapping return");
        assert.equal((await read()).selected,null,"completed draft keeps its landing selected; another click deselects at any speed");
        await set("mixed",turn,orientation,6);
        assert.equal(await page.locator(`[data-point="${p(8)}"].return-destination`).count(),1);
        await tap(p(8));
        assert.equal((await read()).draft.length,0,"explicit selected amber route wins over another source's forward arrival");
        await set("off",turn,orientation);
        assert.equal(await page.locator(`[data-point="off${turn}"] .source-ring`).count(),1);
        await tap(`off${turn}`,"disc");
        assert.equal((await read()).selected,"off","borne-off disc selects the reversible checker");
        assert.equal(await page.locator(`[data-point="off${turn}"]`).getAttribute("aria-pressed"),"true");
        assert.equal((await read()).draft.length,1);
        await tap(p(2));
        assert.equal((await read()).draft.length,0);
        await set("off",turn,orientation);
        await tap(`off${turn}`,"count");
        assert.equal((await read()).selected,"off","large count checker provides the same selection target as the thin strips");
        assert.equal((await read()).draft.length,1);
        await set("off",turn,orientation);
        await tap(`off${turn}`);
        assert.equal((await read()).draft.length,2,"empty tray space bears off while tray discs select");
        await set("bar",turn,orientation,21);
        await tap(`bar${turn}`,"disc");
        assert.equal((await read()).selected,"bar","resident bar checker selects even over a return target");
        assert.equal((await read()).draft.length,1);
        await set("bar",turn,orientation,21);
        await tap(`bar${turn}`);
        assert.equal((await read()).draft.length,0,"bar badge returns the selected entry");
        await set("bar-repeat",turn,orientation,"bar");
        await page.locator(`[data-point="${p(19)}"]`).focus();
        await page.keyboard.press("Enter");
        assert.equal((await read()).selected,p(19),"entry landing is automatically selected");
        await page.keyboard.press("Enter");
        assert.equal((await read()).selected,null,"same point key deselects regardless of speed");
        assert.equal((await read()).draft.length,1);
        await page.keyboard.press("Shift+Enter");
        assert.deepEqual((await read()).draft.at(-1),{from:p(20),to:p(19),die:1},"Shift explicitly requests the nearest destination move");
        for(const region of ["disc","space"]){
          await set("hit",turn,orientation,12);
          await tap(p(8),region);
          assert.equal((await read()).bar[1-turn],1,"opponent blot is a destination, never a selectable source");
        }
      }
      for(const kind of ["start","mixed"]) {
        const outcomes=[];
        for(const delay of [0,450]) {
          await set(kind,0,0);
          const target=kind==="mixed"?8:5;
          const steps=[];
          for(let i=0;i<3;i++) {
            if(delay) await page.waitForTimeout(delay);
            await tap(target);
            steps.push(await read());
          }
          outcomes.push(steps);
        }
        assert.deepEqual(outcomes[0],outcomes[1],"fast and slow clicks have identical semantics");
      }
      // A mobile scroll cancels its pointer; movement away and back is not a tap.
      for (const gesture of ["cancel", "move"]) {
        await set("start",0,0,12);
        await page.evaluate((gesture)=>{
          const target=document.querySelector("#draft-line");
          const fire=(type,x=10)=>target.dispatchEvent(new PointerEvent(type,{
            bubbles:true,pointerId:71,isPrimary:true,pointerType:"touch",
            button:0,clientX:x,clientY:10,
          }));
          fire("pointerdown");
          if(gesture==="cancel")fire("pointercancel");
          else fire("pointermove",30);
          fire("pointerup");
        },gesture);
        assert.equal((await read()).selected,12,`${gesture} does not dismiss selection`);
        assert.deepEqual((await read()).draft,[]);
      }

      // Cross every source selection with every board/bar/off target. These
      // controller checks supplement native geometric clicks above; they are
      // not presented as physical-device testing or proof for all game states.
      let combinations = 0;
      for (const kind of ["start","revision","mixed","off","bar","hit","forced"]) {
        for (const turn of [0,1]) {
          await set(kind,turn,turn);
          combinations += await page.evaluate(() => {
            const {d,r}=audit, initial=[...d.draft], minDraft=d.minDraft;
            const choices=[null,...new Set([...d.sources(),...d.entrySwitches().map(m=>m.from)])];
            const targets=[...Array(24).keys(),"bar0","bar1","off0","off1"];
            const check=(ok,label)=>{if(!ok)throw new Error(label);};
            let count=0;
            for(const selected of choices)for(const raw of targets)for(const disc of [false,true]) {
              d.draft=[...initial];d.selected=selected;d.minDraft=minDraft;d.render();
              const p=d.normalize(raw), state=d.current(), o=d.board.renderOptions;
              const own=typeof p==="number"?state.points[p]*r.sign(state.turn)>0:
                p==="bar"?state.bar[state.turn]>0:p==="off"&&state.off[state.turn]>0;
              if(disc&&!own)continue;
              const selectable=d.sources().includes(p)||d.entrySwitches().some(m=>m.from===p);
              const advertised=[...o.destinations,...o.reachable,...o.reverseTargets].includes(p);
              const before=JSON.stringify(d.draft), beforeMessage=document.querySelector("#draft-line").textContent;
              d.point(raw,{quick:!disc,checkerTap:disc});
              const changed=JSON.stringify(d.draft)!==before;
              const modal=document.querySelector("dialog[open]");
              const label=JSON.stringify({selected,raw,disc,advertised,selectable,draft:initial});
              if(disc&&(selectable||p===selected)){
                check(!changed&&!modal,`disc unexpectedly moved: ${label}`);
                check(d.selected===(p===selected?null:p),`disc did not toggle: ${label}`);
              }else if(advertised)check(changed||modal,`advertised destination did not act: ${label}`);
              else {
                check(!changed&&!modal,`unadvertised route moved: ${label}`);
                if(!selectable && p!==selected) {
                  check(d.selected===null,`inactive click did not clear selection: ${label}`);
                  if(selected===null)check(document.querySelector("#draft-line").textContent===beforeMessage,`inactive click changed message with no selection: ${label}`);
                }
              }
              check(JSON.stringify(d.draft.slice(0,minDraft))===JSON.stringify(initial.slice(0,minDraft)),`forced prefix changed: ${label}`);
              check(r.matchingPaths(d.paths,d.draft).length>0,`illegal draft prefix: ${label}`);
              modal?.close();count++;
            }
            return count;
          });
        }
      }
      await set("off",0,0,"off");
      await page.screenshot({path:path.join(out,`${name}-audit-off-${touch?"touch":"mouse"}.png`)});
      assert.deepEqual(errors,[]);
      report.push({input:touch?"touch":"mouse",clicks,combinations});
    }finally{await context.close();}
  }
  return {browser:name,cases:report};
};
