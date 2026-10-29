// Scripted grades isolate summary arithmetic/persistence from engine accuracy.
const assert = require("node:assert/strict"), path = require("node:path");
const {showPlayControls} = require('./play-helpers.cjs');
module.exports = async function gameLossSummary(browser, base, out, name) {
  const report = [];
  for (const [layout, viewport] of Object.entries({ desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 }, landscape: { width: 844, height: 390 } })) {
    const context = await browser.newContext({ viewport, hasTouch: layout !== "desktop", reducedMotion: "reduce", serviceWorkers: "block" });
    const page = await context.newPage(), errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const ready = () => page.waitForFunction(() => document.documentElement.dataset.appReady === "true");
    const resume = async () => {
      if (!await page.locator("#resume-match").isVisible()) await page.locator("#panel-toggle").click();
      await page.locator("#resume-match").click();
      const drawer = page.locator("#details-dialog[open]");
      if (await drawer.count()) await page.keyboard.press("Escape");
      await showPlayControls(page);
    };
    try {
      await page.goto(base + "/backgammon/play/"); await ready();
      const expected = await page.evaluate(async () => {
        const r = await import("/backgammon/core/rules.mjs");
        const { playAction } = await import("/backgammon/core/table.mjs");
        const { beginDecisionAttempt, recordInitialEvaluation } = await import("/backgammon/core/decision-attempt.mjs");
        const { put, saveSettings } = await import("/backgammon/core/storage.mjs");
        const { localConfig } = await import("/backgammon/core/play-session.mjs");
        const { presentMove } = await import("/backgammon/core/move-presentation.mjs");
        const moves = [];
        const initial = r.initialState({ phase: "roll", matchLength: 0 });
        initial.cube.value = 2;
        let game = { id: "loss-summary", initial, state: initial, started: true, events: [],
          names: ["You", "GNUbg"], config: localConfig({ strength: "quick", reviewStrength: "quick" }) };
        for (const player of [0, 1]) {
          const source = game.state;
          beginDecisionAttempt(game, { type: "double" });
          game = playAction(game, { type: "roll", dice: [1, 4] });
          game.events.at(-1).evaluation = { result: { type: "cube", status: "complete", positionKey: r.positionKey(source),
            settings: { name: "Test", plies: 0 }, units: "current-cube-points", outcomes: [.2, player ? .19 : .17, 1] } };
          const state = game.state, turns = r.legalTurns(state);
          const first = { type: "move", steps: turns[0].steps }, accepted = { type: "move", steps: turns[1].steps };
          moves.push({ initial: presentMove(state, first.steps).notation, accepted: r.notation(accepted.steps, player) });
          const grade = (action, loss) => ({ result: { type: "checker", status: "complete", positionKey: r.positionKey(state),
            settings: { name: "Test", plies: 0 }, units: "current-cube-points",
            candidates: [{ equity: .2, steps: turns[1].steps }], actual: { equity: .2 - loss, steps: action.steps } } });
          beginDecisionAttempt(game, first);
          recordInitialEvaluation(game, first, grade(first, player ? .04 : .06));
          game = playAction(game, accepted);
          game.events.at(-1).evaluation = grade(accepted, player ? .02 : .01);
        }
        game = playAction(game, { type: "resign", level: 1 });
        game = playAction(game, { type: "accept" });
        saveSettings({ analysisAhead: false, equityBar: false, motion: "reduce" });
        await put("work", { id: "play", game, draft: [] });
        return moves;
      });
      await page.reload(); await ready(); await resume();
      const card = page.getByRole("region", { name: "Game result", exact: true });
      await card.waitFor();
      const value = (player, kind, stage) => card.locator(`[data-summary-player="${player}"] [data-loss-kind="${kind}"] [data-stage="${stage}"]`);
      // Assert the values separately; line breaks depend on responsive layout.
      const summaryValues = (kind, stage) => value(0, kind, stage).locator(':scope > strong, :scope > small').allTextContents();
      assert.deepEqual(await summaryValues("checker", "initial"), ["0.060", "0.060 / move"]);
      assert.deepEqual(await summaryValues("checker", "accepted"), ["0.010", "0.010 / move"]);
      assert.deepEqual(await summaryValues("cube", "initial"), ["0.030", "1 mistake"]);
      assert.deepEqual(await summaryValues("cube", "accepted"), ["0.000", "0 mistakes"]);
      assert.equal(await card.locator('[data-summary-player="1"]').count(), 0, "bot losses are hidden");
      assert.equal(await card.locator('[data-summary-player]').count(), 1);
      assert.ok(!(await card.locator('.game-loss-summary').innerText()).includes('GNUbg'));
      for (const [kind,stage,tone] of [["checker","initial","medium"],["checker","accepted","close"],["cube","initial","small"],["cube","accepted","perfect"]])
        assert.equal(await value(0,kind,stage).locator('strong').getAttribute('data-loss-tone'),tone);
      assert.equal(await value(0,"checker","initial").locator('small span').getAttribute('data-loss-tone'),'medium');
      const colors = await card.locator('[data-loss-tone]').evaluateAll(nodes => [...new Set(nodes.map(node => getComputedStyle(node).color))]);
      assert.equal(colors.length,4,'EV totals and averages use the existing loss colors');
      const bounds = await card.evaluate(node => {
        const box = node.getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom,
          overflow: node.scrollWidth > node.clientWidth + 1, height: box.height };
      });
      assert.ok(bounds.left >= 0 && bounds.right <= viewport.width + 1, `${layout}: horizontal fit ${JSON.stringify(bounds)}`);
      assert.equal(bounds.overflow, false);
      assert.ok(bounds.top >= 0 && bounds.bottom <= viewport.height + 1,
        `${layout}: result card fits the viewport ${JSON.stringify(bounds)}`);
      // Portrait keeps these details in the playing-area summary instead of
      // repeating them inside the compact result card.
      if (await card.locator('.game-loss-summary').isVisible()) {
        await card.locator("summary").scrollIntoViewIfNeeded();
        await card.locator("summary").click();
        assert.ok(await card.locator("details").evaluate(node => node.open));
        assert.match(await card.innerText(), /0.002/);
        await card.locator("summary").click();
      }
      await card.evaluate(node => { node.scrollTop = 0; });
      await card.screenshot({ path: path.join(out, `${name}-game-loss-summary-${layout}.png`) });
      await card.getByRole('button', { name: 'Hide the result to see the board' }).click();
      const checker = page.locator('#move-feedback .history-turn[data-history-side="self"] [data-decision-type="checker"]');
      const cube = page.locator('#move-feedback .history-turn[data-history-side="self"] [data-decision-type="cube"]');
      for (const decision of [cube,checker]) {
        assert.deepEqual(await decision.locator('.history-move').evaluate(n=>[...n.children].filter(n=>!n.classList.contains('feedback-best')).map(n=>n.classList[0])),
          ['history-kind',...(decision === checker ? ['history-accepted'] : []),'history-initial'],
          'Cube and Move use heading, equity, played, initial order, omitting the empty no-double action');
        assert.equal(await decision.locator('.history-equity').innerText(),'+0.200');
        assert.equal(await decision.locator('.history-depth, .decision-values-compact').count(),0,'depth and duplicate equity labels stay out of history');
      }
      assert.equal(await cube.locator('.history-played-best').count(),0,'correct no-double decisions omit Played best');
      const cubeBox = await cube.boundingBox(), moveBox = await checker.boundingBox();
      assert.ok(Math.abs(moveBox.width - cubeBox.width * 2) < 1,'Move receives twice the width of Cube');
      const rollBox = await checker.locator('.history-roll').boundingBox();
      const headingBox = await checker.locator('.history-kind').boundingBox();
      assert.ok(Math.abs(rollBox.x + rollBox.width - headingBox.x - headingBox.width) < 1,'dice stay at the top right');
      assert.deepEqual(await checker.locator('.history-roll .die').evaluateAll(ns=>ns.map(n=>n.getAttribute('aria-label'))),['4','1']);
      assert.equal(await cube.locator('.history-roll').count(),0,'pre-roll cube decisions do not imply knowledge of the next roll');
      assert.equal(await cube.locator('.history-loss').count(),0,'best cube decisions hide zero loss');
      assert.equal(await cube.locator('.history-initial-loss strong').innerText(),'0.030','initial cube mistakes remain visible');
      assert.equal(await checker.locator('.history-initial .history-played').innerText(), expected[0].initial);
      assert.equal(await checker.locator('.history-initial-loss strong').innerText(), '0.060', 'initial loss is not multiplied by cube 2');
      assert.equal(await checker.locator('.history-accepted .history-played').innerText(), expected[0].accepted);
      assert.equal(await checker.locator('.history-loss .value').innerText(), '0.010', 'played loss stays independent');
      assert.equal(await checker.locator('.history-initial-loss').getAttribute('data-loss-tone'), 'medium');
      await page.locator('#review-heading').evaluate(n => n.scrollIntoView({block:'start'}));
      if (layout === 'landscape') await checker.evaluate(n => n.closest('.history-turn').scrollIntoView({block:'center'}));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'history fits horizontally');
      await page.screenshot({path: path.join(out, `${name}-initial-move-${layout}.png`)});
      // A pending original grade updates in place when background review finishes,
      // without changing the accepted grade or the game/score.
      // Leave Play before replacing its save so pagehide cannot checkpoint the old fixture.
      // Finish the hub's imports before navigating away again (especially WebKit).
      await page.goto(base + '/backgammon/'); await ready();
      await page.waitForLoadState('networkidle');
      await page.evaluate(async () => {
        const { get, put } = await import("/backgammon/core/storage.mjs");
        const work = await get("work", "play");
        delete work.game.events[1].initialDecision.evaluation;
        await put("work", work);
      });
      await page.goto(base + '/backgammon/play/'); await ready();
      await page.evaluate(async () => {
        const { EngineClient } = await import("/backgammon/engine/client.mjs");
        const { positionKey } = await import("/backgammon/core/rules.mjs");
        EngineClient.prototype.analyze = (state, options) => new Promise(resolve => {
          window.completeSummaryGrade = () => resolve({ type: "checker", status: "complete", positionKey: positionKey(state),
            settings: { name: "Test", plies: 0 }, units: "current-cube-points",
            candidates: [{ equity: .2, steps: [] }], actual: { equity: .14, steps: options.submitted } });
        });
      });
      await resume();
      await page.waitForFunction(() => typeof window.completeSummaryGrade === "function");
      assert.match(await value(0, "checker", "initial").innerText(), /1 pending/);
      assert.equal(await checker.locator('.history-initial').getAttribute('data-initial-status'), 'pending');
      assert.equal(await checker.locator('.history-initial-loss').innerText(), 'EV loss pending');
      assert.equal(await value(0,"checker","initial").locator('strong').getAttribute('data-loss-tone'),null,'unknown loss stays ungraded');
      await page.evaluate(() => window.completeSummaryGrade());
      await page.waitForFunction(() => document.querySelector('[data-summary-player="0"] [data-loss-kind="checker"] [data-stage="initial"] strong')?.textContent === "0.060");
      assert.equal(await checker.locator('.history-initial-loss strong').innerText(), '0.060', 'history refreshes when only the initial grade changes');
      assert.equal(await checker.locator('.history-loss .value').innerText(), '0.010');
      assert.equal(await value(0, "checker", "accepted").locator("strong").innerText(), "0.010");
      const archived = await page.evaluate(async () => (await (await import("/backgammon/core/storage.mjs")).get("items", "loss-summary")));
      assert.ok(Math.abs(archived.decisionSummary[0].loss-.01)<1e-7,"saved totals exclude cube multiplier");
      assert.ok(archived.events[1].initialDecision.evaluation, "background initial grade is archived as well as saved to play");
      assert.equal(await value(0,"checker","initial").locator('strong').getAttribute('data-loss-tone'),'medium');
      // Human control can be either color. Local/online summaries retain both humans.
      for (const [mode,humanSide,expected] of [["computer",1,["1"]],["local",0,["0","1"]]]) {
        await page.goto(base + '/backgammon/'); await ready();
        await page.waitForLoadState('networkidle');
        await page.evaluate(async ({mode,humanSide}) => {
          const {get,put} = await import('/backgammon/core/storage.mjs');
          const work = await get('work','play');
          work.game.config.mode = mode;
          work.game.config.humanSide = humanSide;
          await put('work',work);
        },{mode,humanSide});
        await page.goto(base + '/backgammon/play/'); await ready(); await resume();
        assert.deepEqual(await card.locator('[data-summary-player]').evaluateAll(nodes=>nodes.map(node=>node.dataset.summaryPlayer)),expected);
      }
      // Correcting the original mistake to the best move keeps the original
      // loss visible, but replaces the accepted zero-loss display with a label.
      await page.goto(base + '/backgammon/'); await ready();
      await page.waitForLoadState('networkidle');
      await page.evaluate(async () => {
        const {get,put} = await import('/backgammon/core/storage.mjs');
        const work = await get('work','play');
        work.game.config.mode = 'computer';
        work.game.config.humanSide = 0;
        const result = work.game.events[1].evaluation.result;
        result.actual.equity = result.candidates[0].equity;
        await put('work',work);
      });
      await page.goto(base + '/backgammon/play/'); await ready(); await resume();
      await card.getByRole('button', {name:'Hide the result to see the board'}).click();
      assert.equal(await checker.locator('.history-accepted .history-attempt-label').innerText(),'Played best');
      assert.equal(await checker.locator('.history-loss').count(),0,'best play does not show a redundant zero loss');
      assert.equal(await checker.locator('.history-initial-loss strong').innerText(),'0.060','initial mistake stays visible');
      await page.locator('#review-heading').evaluate(n => n.scrollIntoView({block:'start'}));
      if (layout === 'landscape') await checker.evaluate(n => n.closest('.history-turn').scrollIntoView({block:'center'}));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({path:path.join(out,`${name}-played-best-${layout}.png`)});
      const boundaryCases = await page.evaluate(async () => {
        const {get} = await import('/backgammon/core/storage.mjs');
        const {decisionHistory,groupDecisionTurns} = await import('/backgammon/core/decision-history.mjs');
        const {decisionFeedback} = await import('/backgammon/core/decision-feedback.mjs');
        const {historyTurn} = await import('/backgammon/ui/history-turn.mjs');
        const row = decisionHistory((await get('work','play')).game).find(r => r.action.type === 'move');
        const render = overrides => {
          const entry = {...row,attempts:undefined,...overrides};
          const node = historyTurn(groupDecisionTurns([entry])[0],{names:['White','Black'],viewer:0,local:false,actions:()=>({})});
          return {label:node.querySelector('.history-accepted .history-attempt-label')?.textContent,
            loss:node.querySelector('.history-loss .value')?.textContent,initial:!!node.querySelector('.history-initial')};
        };
        const almost = {...row.result,actual:{...row.result.actual,equity:row.feedback.best.equity-.0001}};
        return {
          unchanged:render({initialAction:row.action,initialFeedback:row.feedback}),
          legacy:render({initialAction:null,initialFeedback:null}),
          pending:render({result:null,feedback:null}),
          rounded:render({result:almost,feedback:decisionFeedback(almost,row.source)}),
        };
      });
      assert.deepEqual(boundaryCases.unchanged,{label:'Played best',loss:undefined,initial:false});
      assert.deepEqual(boundaryCases.legacy,{label:'Played best',loss:undefined,initial:false});
      assert.notEqual(boundaryCases.pending.label,'Played best','pending evaluations never claim best');
      assert.equal(boundaryCases.rounded.loss,'0.000','rounding alone does not make a move best');
      assert.notEqual(boundaryCases.rounded.label,'Played best');
      assert.deepEqual(errors, []);
      report.push({ layout, bounds, initialAndAccepted: true, liveUpdate: true });
    } catch (error) {
      await page.screenshot({ path: path.join(out, `${name}-game-loss-summary-${layout}-failure.png`), fullPage: true });
      throw error;
    } finally { await context.close(); }
  }
  return report;
};
