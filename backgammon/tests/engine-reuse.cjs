const assert = require("node:assert/strict");

// Actual published WASM, not a mocked answer. The client must reuse full
// candidate searches without changing arbitrary-move grading or context.
module.exports = async function engineReuse(browser, base) {
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage(), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    await page.goto(base + "/backgammon/");
    const report = await page.evaluate(async () => {
      const { EngineClient } = await import("/backgammon/engine/client.mjs");
      const { initialState, legalTurns } = await import("/backgammon/core/rules.mjs");
      const { ENGINE_VERSION } = await import("/backgammon/engine/metadata.mjs");
      const fixtures = (await (await fetch("/backgammon/data/exercises.json")).json()).items;
      const cases = [
        ...["opening", "contact", "race", "bearoff"].map(topic => ({topic, state: fixtures.find(f => f.topic === topic).state})),
        {topic:"doubles",state:initialState({phase:"move",dice:[3,3]})},
        {topic:"match",state:initialState({phase:"move",dice:[3,1],matchLength:7,scores:[2,4]})},
      ];
      let jobs = 0;
      const engine = new EngineClient({openingBook:null,workerFactory: () => {
        const w = new Worker("/backgammon/engine/worker.mjs",{type:"module"});
        const send = w.postMessage.bind(w);
        w.postMessage = message => { if (message.type === "analyze") jobs++; send(message); };
        return w;
      }});
      const rows = [];
      let queuedDraft;
      function check(condition, message) { if (!condition) throw new Error(message); }
      try {
        for (const {topic,state} of cases) for (const preset of ["quick","standard","deep"]) {
          const chosen = legalTurns(state).at(-1).steps, before = jobs;
          const hint = engine.analyze(state,{preset});
          const grade = engine.analyze(state,{preset,submitted:chosen});
          const [answer,graded] = await Promise.all([hint,grade]);
          check(jobs === before + 1, `${topic}/${preset}: in-flight search duplicated`);
          check(answer.actual === null && answer.error === null, "hint contains another caller's grade");
          check(graded.actual, "missing concurrent grade");
          // Select the worst evaluated legal result, including moves outside
          // the upstream 40-hint list; there must be no additional WASM job.
          const worst = answer.candidates.at(-1);
          const start = performance.now();
          const pending = engine.analyze(state,{preset,submitted:worst.steps});
          const dispatchMs = performance.now() - start;
          const cached = await pending;
          const cachedMs = performance.now() - start;
          check(cached.cached && jobs === before + 1, "cached grading recalculated the search");
          check(cached.actual.key === worst.key, "wrong submitted move graded");
          check(answer.actual === null, "cached hint mutated");
          engine.cache.clear();
          const fresh = await engine.analyze(state,{preset,submitted:worst.steps});
          check(jobs === before + 2, "reference search did not run");
          check(fresh.candidates.length === answer.candidates.length, "candidate coverage changed");
          let maxDifference = 0;
          for (const c of answer.candidates) {
            const other = fresh.candidates.find(f => f.key === c.key);
            check(other, "legal result missing from repeated search");
            for (const [x,y] of [[c.equity,other.equity],[c.cubeless,other.cubeless],[c.mwc,other.mwc],...c.probabilities.map((p,i)=>[p,other.probabilities[i]])]) {
              if (x === null || y === null) check(x === y, "match units changed");
              else maxDifference = Math.max(maxDifference,Math.abs(x-y));
            }
          }
          // GNUbg's incremental float32 arithmetic can vary in the final
          // digits between cold/warm native caches; 1e-5 is below display units.
          check(maxDifference <= 0.00001, `${topic}/${preset}: evaluation changed by ${maxDifference}; before=${answer.candidates[0].equity}, after=${fresh.candidates[0].equity}`);
          check(Math.abs(fresh.error - cached.error) <= 0.00002, "loss differs from fresh evaluation");
          rows.push({topic,preset,candidates:answer.candidates.length,maxDifference,dispatchMs,cachedMs});
        }
        // A user can edit a draft while another search holds the worker.
        // The queued request must grade the original move, not its later edits.
        engine.cache.clear();
        const state = initialState({phase:"move",dice:[3,1]}), turns = legalTurns(state);
        const selected = structuredClone(turns.at(-1).steps), originalKey = turns.at(-1).key;
        const busy = engine.analyze(fixtures.find(f=>f.topic === "contact").state,{priority:20});
        const queued = engine.analyze(state,{preset:"expert",submitted:selected,priority:0});
        selected.splice(0,selected.length,...structuredClone(turns[0].steps));
        const [,answer] = await Promise.all([busy,queued]);
        check(answer.actual.key === originalKey, "queued draft edits changed the move being graded");
        check(answer.actual.key !== turns[0].key, "fixture must change the legal result");
        const cached = await engine.analyze(state,{preset:"expert",submitted:turns.at(-1).steps});
        check(cached.cached && cached.actual.key === originalKey, "queue mutation poisoned the grade cache");
        queuedDraft = {actual:answer.actual.key,edited:turns[0].key,equity:answer.actual.equity,cachePreserved:true};
      } finally { engine.destroy(); }
      return {engine:ENGINE_VERSION,rows,jobs,queuedDraft};
    });
    assert.equal(report.rows.length,18);
    assert.ok(report.rows.some(row=>row.candidates>40), "must grade beyond the upstream hint limit");
    assert.deepEqual(errors,[]);
    return report;
  } finally { await context.close(); }
};
