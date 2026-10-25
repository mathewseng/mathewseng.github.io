const assert = require('node:assert/strict');
module.exports = async function decisionValueSummaries(browser, base) {
  const context = await browser.newContext({serviceWorkers:'block'}), page = await context.newPage();
  try {
    await page.goto(base + '/backgammon/');
    const cases = await page.evaluate(async () => {
      const {decisionValues} = await import('/backgammon/ui/decision-values.mjs');
      const cases = [
        {name:'best played', before:.123, actual:.123, best:.123, expected:['before']},
        {name:'worse played', before:.123, actual:.103, best:.123, expected:['before','actual']},
        {name:'same displayed precision', before:.1231, actual:.1232, best:.1233, expected:['before']},
        {name:'distinct best', before:.1, actual:.08, best:.2, expected:['before','actual','best']},
        {name:'actual matches before', before:.1, actual:.1, best:.2, expected:['before','best']},
        {name:'negative drop tie', before:-1, actual:-1, best:-1, expected:['before']},
      ];
      return cases.map(c => {
        const row = value => ({equity:value,ev:value});
        const f = {before:row(c.before),actual:row(c.actual),best:row(c.best),money:true,cube:1,tone:'close'};
        const compact = decisionValues(f,true), full = decisionValues(f);
        return {...c, kinds:[...compact.querySelectorAll('[data-value-kind]')].map(n=>n.dataset.valueKind),
          values:[...compact.querySelectorAll('strong')].map(n=>n.textContent),fullRows:full.querySelectorAll('tbody tr').length};
      });
    });
    for (const c of cases) {
      assert.deepEqual(c.kinds,c.expected,c.name);
      assert.equal(c.values.length,new Set(c.values).size,c.name);
      assert.equal(c.fullRows,c.expected.length,c.name);
    }
    return cases;
  } finally {await context.close();}
};
