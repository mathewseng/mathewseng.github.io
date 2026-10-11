const assert = require("node:assert/strict");

module.exports = async function engineCacheContext(browser, base) {
  const context = await browser.newContext({serviceWorkers:"block"});
  const page = await context.newPage();
  try {
    await page.goto(base + "/backgammon/");
    const report = await page.evaluate(async () => {
      const { EngineClient } = await import("/backgammon/engine/client.mjs");
      const { initialState } = await import("/backgammon/core/rules.mjs");
      const money = initialState({phase:"move",dice:[3,1],matchLength:0});
      const dmp = initialState({phase:"move",dice:[3,1],matchLength:7,scores:[6,6],crawfordPlayed:true});
      const doubles = initialState({phase:"move",dice:[3,3]});
      const contexts = [
        {name:"money then double-match-point",warm:[{state:money,preset:"quick"}],state:dmp,preset:"quick"},
        {name:"double-match-point then money",warm:[{state:dmp,preset:"quick"}],state:money,preset:"quick"},
        {name:"Quick → Standard → Deep doubles",warm:[{state:doubles,preset:"quick"},{state:doubles,preset:"standard"}],state:doubles,preset:"deep"},
        {name:"Deep → Quick",warm:[{state:doubles,preset:"deep"}],state:doubles,preset:"quick"},
        {name:"Deep → Standard",warm:[{state:doubles,preset:"deep"}],state:doubles,preset:"standard"},
      ];
      const rows = [];
      for (const {name,warm,state,preset} of contexts) {
        const cold = new EngineClient(), reused = new EngineClient();
        try {
          const expected = await cold.analyze(state,{preset});
          for (const job of warm) await reused.analyze(job.state,{preset:job.preset});
          reused.cache.clear();
          const actual = await reused.analyze(state,{preset});
          const differences = expected.candidates.map(c => {
            const other = actual.candidates.find(x=>x.key===c.key);
            if (!other) throw new Error(`${name}: missing candidate`);
            return Math.abs(c.equity-other.equity);
          });
          const maxDifference = Math.max(...differences);
          if (maxDifference > 0.00001) throw new Error(`${name}: cache changed equity by ${maxDifference}`);
          if (actual.candidates[0].key !== expected.candidates[0].key) throw new Error(`${name}: changed best move`);
          if (state.matchLength && actual.candidates.some(c=>c.mwc<0||c.mwc>1)) throw new Error(`${name}: invalid match winning chance`);
          rows.push({name,candidates:actual.candidates.length,maxDifference,best:actual.candidates[0].notation,equity:actual.candidates[0].equity});
        } finally { cold.destroy(); reused.destroy(); }
      }
      return rows;
    });
    assert.equal(report.length,5);
    return report;
  } finally { await context.close(); }
};
