const assert = require('node:assert/strict');

// Published worker/native assets; this reproduces the omitted-leader defect
// independently of the study's baseline Git checkout or mocked score table.
module.exports = async function researchScreen(browser, base, output, browserName, { backend = null } = {}) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(base + '/backgammon/');
    const rows = await page.evaluate(async backend => {
      const { EngineClient } = await import('/backgammon/engine/client.mjs');
      const { initialState, legalTurns } = await import('/backgammon/core/rules.mjs');
      const { PRESETS } = await import('/backgammon/engine/metadata.mjs');
      const source = (await (await fetch('/backgammon/data/accuracy-reference.json')).json()).items[58].state;
      const mirror = { ...source, points: [...source.points].reverse().map(n => -n),
        bar: [...source.bar].reverse(), off: [...source.off].reverse(), turn: 1 - source.turn };
      const cases = [{ id: 'omitted-58', state: source }, { id: 'mirror-58', state: mirror },
        { id: 'owned-cube-match', state: initialState({ phase: 'move', dice: [3, 1],
          matchLength: 7, scores: [2, 4], cube: { value: 2, owner: 1 } }) }];
      const rows = [], check = (condition, message) => { if (!condition) throw Error(message); };
      const create = () => new EngineClient({ openingBook: null,
        ...(backend ? { workerFactory: () => new Worker('/backgammon/engine/worker.mjs?backend=' + backend,
          { type: 'module' }) } : {}) });
      const difference = (a, b) => {
        check(a.key === b.key, 'different legal result');
        let maximum = 0;
        for (const field of ['equity', 'cubeless', 'mwc']) {
          if (a[field] == null || b[field] == null) check(a[field] === b[field], 'match units changed');
          else maximum = Math.max(maximum, Math.abs(a[field] - b[field]));
        }
        check(a.probabilities.length === b.probabilities.length, 'probability schema changed');
        a.probabilities.forEach((v, i) => { maximum = Math.max(maximum, Math.abs(v - b.probabilities[i])); });
        return maximum;
      };
      for (const { id, state } of cases) {
        const engine = create(), cold = create();
        let direct;
        try {
          const deep = await engine.analyze(state, { preset: 'deep' });
          const oldPool = deep.candidates.filter((c, i) => i < 2 ||
            (i < PRESETS.research.finalists && deep.candidates[0].equity - c.equity <= PRESETS.research.threshold));
          const expert = await engine.analyze(state, { preset: 'expert' });
          const result = await engine.analyze(state, { preset: 'research' });
          check(result.settings.screeningPolicy === 'retain-expert-leader-v1', 'missing screening identity');
          check(result.candidates.some(c => c.key === expert.candidates[0].key), 'Expert leader lost');
          check(oldPool.every(c => result.candidates.some(r => r.key === c.key)), 'old four-ply candidate lost');
          const oldBest = Math.max(...result.candidates.filter(c => oldPool.some(p => p.key === c.key)).map(c => c.equity));
          const gain = result.candidates[0].equity - oldBest;
          if (id !== 'owned-cube-match') {
            check(!oldPool.some(c => c.key === expert.candidates[0].key), 'fixture no longer exposes omission');
            check(result.candidates[0].key === expert.candidates[0].key, 'known four-ply improvement missing');
            check(Math.abs(gain - .00545973) < .00002, 'unexpected same-depth improvement ' + gain);
          }
          const fresh = await cold.analyze(state, { preset: 'research' });
          check(fresh.candidates[0].key === result.candidates[0].key, 'cold/progressive leaders differ');
          let maxDifference = 0;
          for (const c of result.candidates) {
            const f = fresh.candidates.find(r => r.key === c.key);
            check(f, 'cold finalist missing');
            maxDifference = Math.max(maxDifference, difference(c, f));
          }
          check(maxDifference < .00001, 'cache changed values ' + maxDifference);
          const submitted = legalTurns(state).find(t => !result.candidates.some(c => c.key === t.key));
          check(submitted, 'need a move outside the hint list');
          const grade = await engine.analyze(state, { preset: 'research', submitted: submitted.steps });
          check(grade.actual.key === submitted.key, 'unlisted submitted move was not graded');
          check(Math.abs(grade.error - (grade.candidates[0].equity - grade.actual.equity)) < 1e-9, 'inconsistent grading depth');
          check(result.candidates.every(c => grade.candidates.some(r => r.key === c.key)), 'grade lost a retained candidate');
          for (const c of result.candidates)
            check(difference(c, grade.candidates.find(r => r.key === c.key)) === 0, 'completed finalist was changed');

          // No hint, progressive search, client cache, or warm native cache on
          // this arm. Compare the whole grade against an independent worker.
          cold.destroy(); direct = create();
          const independent = await direct.analyze(state, { preset: 'research', submitted: submitted.steps });
          check(independent.candidates.length === grade.candidates.length, 'grade coverage changed');
          check(independent.candidates[0].key === grade.candidates[0].key, 'grade leader changed');
          check(independent.units === grade.units && independent.perspective === grade.perspective, 'grade context changed');
          let gradeDifference = Math.max(difference(grade.actual, independent.actual), Math.abs(grade.error - independent.error));
          for (const c of grade.candidates) {
            const other = independent.candidates.find(r => r.key === c.key);
            check(other, 'direct grade omitted a finalist');
            gradeDifference = Math.max(gradeDifference, difference(c, other));
          }
          check(gradeDifference < .00001, 'warm grading differs from direct grading ' + gradeDifference);

          // Force dispatch to the evaluator instead of satisfying this request
          // from the EngineClient result cache.
          engine.cache.clear();
          const repeated = await engine.analyze(state, { preset: 'research' });
          check(repeated.candidates.length === result.candidates.length, 'submitted move leaked into hint');
          for (const c of result.candidates)
            check(difference(c, repeated.candidates.find(r => r.key === c.key)) === 0, 'hint changed after arbitrary grade');
          rows.push({ id, gain, maxDifference, gradeDifference, finalists: result.candidates.length,
            backend: grade.backend,
            actual: grade.actual.notation, engine: result.engine, settings: result.settings });
        } finally { engine.destroy(); cold.destroy(); direct?.destroy(); }
      }
      return rows;
    }, backend);
    if (output) {
      const url = await page.evaluate(async () => {
        const { shareURL } = await import('/backgammon/core/xgid.mjs');
        const state = (await (await fetch('/backgammon/data/accuracy-reference.json')).json()).items[58].state;
        return shareURL(state);
      });
      await page.goto(url);
      await page.waitForFunction(() => document.querySelector('#analyze')?.textContent === 'Analyze' &&
        document.querySelector('#analysis-budget')?.textContent.includes('completed'), {}, { timeout: 180000 });
      await page.getByText('Analysis settings', { exact: true }).click();
      await page.getByLabel('Analysis strength', { exact: true }).locator('[data-choice="research"]').click();
      await page.locator('#analyze').click();
      await page.waitForFunction(() => document.querySelector('#analyze')?.textContent === 'Analyze' &&
        document.querySelector('#panel')?.textContent.includes('Research · 4 ply'), {}, { timeout: 180000 });
      await page.getByText('Analysis method & limits', { exact: true }).click();
      const policy = page.getByText('Research keeps the 3-ply shortlist’s leader', { exact: false });
      await policy.waitFor({ state: 'visible' });
      for (const [width, height] of [[1366, 768], [390, 844]]) {
        await page.setViewportSize({ width, height });
        // Solver moves the same result panel into its phone drawer.
        if (!(await policy.isVisible())) await page.locator('#panel-toggle').click();
        await policy.scrollIntoViewIfNeeded();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await page.screenshot({ path: `${output}/${browserName}-research-screen-${width}.png`, fullPage: true });
      }
    }
    assert.deepEqual(errors, []);
    return rows;
  } finally { await context.close(); }
};
