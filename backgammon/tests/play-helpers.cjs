// Real application fixtures: deterministic entropy, committed storage and paced UI.
// Computer games use HMAC-indexed dice; same-device games draw individual bytes.
const { createHmac } = require('node:crypto');
const assert = require('node:assert/strict');
// Playwright's in-page poll treats an async predicate's Promise as truthy,
// even when that Promise resolves to false. Await the actual result in Node.
exports.waitForAsync = async (page, predicate, argument, {timeout = 30000} = {}) => {
  const until = Date.now() + timeout;
  do {
    const value = await page.evaluate(predicate, argument);
    if (value) return value;
    await page.waitForTimeout(30);
  } while (Date.now() < until);
  throw new Error(`Async browser condition did not become true within ${timeout} ms: ${predicate}`);
};
exports.seedOpening = async (page, dice) => {
  assert.ok(dice.length > 0 && dice.length % 2 === 0 && dice.every(n => Number.isInteger(n) && n >= 1 && n <= 6), "opening fixture contains complete legal rolls");
  let seed;
  for (let nonce = 0; nonce < 1000000; nonce++) {
    const key = Buffer.alloc(32); key.writeUInt32LE(nonce);
    const draws = [];
    for (let cursor = 0; cursor < dice.length / 2; cursor++) {
      const bytes = createHmac('sha256', key).update(`backgammon-local-roll-v1:${cursor}:0`).digest();
      draws.push(...[...bytes].filter(n => n < 252).slice(0, 2).map(n => n % 6 + 1));
    }
    if (draws.every((n, i) => n === dice[i])) { seed = [...key]; break; }
  }
  assert.ok(seed, 'fixture seed exists');
  await page.addInitScript(({seed, dice}) => {
    const random = crypto.getRandomValues.bind(crypto), bytes = dice.map(n => n - 1);
    crypto.getRandomValues = a => {
      if (a instanceof Uint8Array && a.length === 32) { a.set(seed); return a; }
      if (a instanceof Uint8Array && a.length === 1 && bytes.length) { a[0] = bytes.shift(); return a; }
      return random(a);
    };
  }, {seed, dice});
};
exports.work = page => page.evaluate(async () => (await import('/backgammon/core/storage.mjs')).get('work', 'play'));
exports.waitWork = async (page, predicate, timeout = 45000) => {
  const until = Date.now() + timeout;
  let value;
  do {
    value = await exports.work(page);
    if (predicate(value)) return value;
    await page.waitForTimeout(30);
  } while (Date.now() < until);
  throw new Error(`Saved game did not reach expected state: ${JSON.stringify({state:value?.game.state, draft:value?.draft, events:value?.game.events.length})}`);
};
exports.openingComplete = async page => {
  await page.locator('#confirm').waitFor({timeout:20000});
  await page.locator('.opening-roll').waitFor({state:'detached'});
  return exports.waitWork(page, w => w?.game.state.phase === 'move');
};
exports.roll = async page => {
  await page.locator('#board.roll-ready').waitFor();
  await page.keyboard.press('c');
};
