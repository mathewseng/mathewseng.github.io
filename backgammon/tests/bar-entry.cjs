// Bar entry returns to the legal-move overview for every shared input path.
const assert = require("node:assert/strict"), path = require("node:path");
module.exports = async function barEntry(browser, base, out, name) {
  const cases = [];
  for (const touch of [false, true]) {
    const context = await browser.newContext({
      viewport: touch ? {width:390,height:844} : {width:1366,height:768},
      hasTouch: touch, reducedMotion: "reduce", serviceWorkers: "block",
    });
    const page = await context.newPage(), errors = [];
    page.on("pageerror", e => errors.push(e.message));
    try {
      await page.goto(base + "/backgammon/");
      await page.waitForFunction(() => document.documentElement.dataset.appReady === "true");
      await page.evaluate(async () => {
        const {shell,DraftBoard} = await import("/backgammon/ui/shell.mjs");
        window.entryTest = {
          rules: await import("/backgammon/core/rules.mjs"),
          storage: await import("/backgammon/core/storage.mjs"),
          draft: new DraftBoard(shell("trainer","Practice").board),
        };
      });
      const set = (turn, orientation, count = 1, dice = [4,1], hints = true) =>
        page.evaluate(({turn,orientation,count,dice,hints}) => {
          const {rules:r,storage:st,draft:d} = entryTest;
          st.saveSettings({orientation,moveHints:hints,motion:"reduce"});
          const s = r.initialState({phase:"move",dice});
          s.points[23] -= count; s.bar[0] = count;
          if (turn) {
            s.points = s.points.reverse().map(n => -n);
            s.bar.reverse(); s.off.reverse(); s.turn = turn;
          }
          r.assertState(s); d.set(s,r.legalPaths(s));
        }, {turn,orientation,count,dice,hints});
      const read = () => page.evaluate(() => ({
        selected: entryTest.draft.selected,
        draft: entryTest.draft.draft,
        bar: entryTest.draft.current().bar,
        sources: [...document.querySelectorAll("#board .movable")].map(n => n.dataset.point),
        targets: [...document.querySelectorAll("#board .reachable")].map(n => n.dataset.point),
      }));
      const coords = (point, checker = false) => page.evaluate(({point,checker}) => {
        const g = document.querySelector(`#board [data-point="${point}"]`);
        const h = g.querySelector(checker ? ".checker > circle" : ".point-hit");
        const p = new DOMPoint(
          +h.getAttribute(checker ? "cx" : "x") + (checker ? 0 : 25),
          +h.getAttribute(checker ? "cy" : "y") + (checker ? 0 : 140),
        ).matrixTransform(document.querySelector("#board svg").getScreenCTM());
        return {x:p.x,y:p.y};
      }, {point,checker});
      const tap = async (point, checker = false) => {
        const p = await coords(point,checker);
        if (touch) await page.touchscreen.tap(p.x,p.y);
        else await page.mouse.click(p.x,p.y);
      };
      const overview = async (targets, sources = []) => {
        const s = await read();
        assert.equal(s.selected,null,"entry must clear selection");
        assert.equal(await page.locator("#board .selected").count(),0);
        for (const p of targets) assert.ok(s.targets.includes(String(p)),`missing legal destination ${p}`);
        for (const p of sources) assert.ok(s.sources.includes(String(p)),`missing movable checker ${p}`);
        if (touch) assert.equal(await page.getByLabel("Select a checker",{exact:true}).inputValue(),"");
        return s;
      };
      for (const turn of [0,1]) for (const orientation of [0,1]) {
        const p = n => turn ? 23-n : n;
        await set(turn,orientation);
        await tap(p(23)); // Enter with 1; other checkers can use the 4.
        await overview([p(19),p(8),p(3),p(1)],[p(23),p(12),p(7),p(5)]);
        if (!turn && !orientation) await page.screenshot({path:path.join(out,`${name}-bar-entry-${touch?"phone":"desktop"}.png`)});
        await tap(p(3));
        assert.deepEqual((await read()).draft,[{from:"bar",to:p(23),die:1},{from:p(7),to:p(3),die:4}],"another checker moves immediately without deselecting the entered checker");

        await set(turn,orientation);
        if (touch) await page.getByLabel("Move selected checker",{exact:true}).selectOption(String(p(20)));
        else {
          const a = await coords(`bar${turn}`,true), b = await coords(p(20));
          await page.mouse.move(a.x,a.y); await page.mouse.down();
          await page.mouse.move(b.x,b.y,{steps:8}); await page.mouse.up();
        }
        await overview([p(19),p(6),p(4)],[p(7),p(5)]);
        assert.equal((await read()).draft[0].die,4);

        await set(turn,orientation,2);
        await tap(p(23));
        const partial = await overview([p(20)],[`bar${turn}`]);
        assert.equal(partial.bar[turn],1);
        for (const other of [p(12),p(7),p(5)]) assert.ok(!partial.sources.includes(String(other)),"other checkers remain blocked by bar priority");

        await set(turn,orientation,2,[3,3]);
        await tap(p(21));
        await overview([p(21)],[`bar${turn}`]);
        assert.equal((await read()).draft.length,1,"a single entry does not consume all doubles");

        await set(turn,orientation);
        await tap(p(19)); // Combined 1+4 or 4+1 entry.
        await overview([p(20),p(23)]);
        assert.equal((await read()).draft.length,2);
        await tap(p(19),true); // Explicitly reselect to revise entry.
        await tap(p(20));
        await overview([p(19),p(6),p(4)]);
        assert.deepEqual((await read()).draft,[{from:"bar",to:p(20),die:4}]);

        await set(turn,orientation,1,[4,1],false);
        await tap(p(23));
        assert.equal((await read()).selected,null);
        assert.equal(await page.locator("#board .source-ring:visible,#board .point-wash:visible,#board .landing-ring:visible").count(),0,"hints-off setting stays respected");
        cases.push({touch,turn,orientation,single:true,combined:true,revision:true,multipleBar:true,doubles:true,hintsOff:true});
      }
      assert.deepEqual(errors,[]);
    } finally { await context.close(); }
  }
  return {browser:name,cases};
};
