const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");

// A fresh install prepared from the hub must work without a previous engine
// launch or a surviving browser HTTP cache. WebKit's setOffline can fail before
// service-worker interception, so turn off the actual origin instead.
module.exports = async function offlineDownload(browser, _base, out, browserName) {
  const root = path.resolve("_site"), errors = [], report = {cases: [], screenshots: []};
  let online = true, failEngine = true;
  const mime = {".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".wasm": "application/wasm"};
  const server = http.createServer((req, res) => {
    if (!online) return req.socket.destroy();
    let pathname = new URL(req.url, "http://localhost").pathname;
    if (failEngine && pathname.endsWith("gnubg-core-module.data")) {
      res.writeHead(503);
      return res.end("Interrupted download");
    }
    if (pathname.endsWith("/")) pathname += "index.html";
    const file = path.join(root, pathname);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (error, data) => {
      res.setHeader("Cache-Control", "no-store");
      if (error) { res.writeHead(404); return res.end(); }
      res.setHeader("Content-Type", mime[path.extname(file)] || "application/octet-stream");
      res.end(data);
    });
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const context = await browser.newContext({viewport: {width: 1440, height: 900}});
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  const ready = () => page.waitForFunction(() => document.documentElement.dataset.appReady === "true");
  try {
    await page.goto(base + "/backgammon/");
    await ready();
    await page.locator("#download-offline").click();
    await page.waitForFunction(() => document.querySelector("#offline-status").dataset.state === "error", null, {timeout: 120000});
    assert.equal(await page.locator("#download-offline").isEnabled(), true);
    assert.equal(await page.locator("#download-offline").innerText(), "Retry offline download");
    report.cases.push("interrupted engine download reports failure and allows retry without claiming readiness");
    failEngine = false;
    await page.locator("#download-offline").click();
    await page.waitForFunction(() => document.querySelector("#offline-status").dataset.state === "ready", null, {timeout: 120000});
    report.cases.push("fresh hub install downloads shell and real engine without launching GNUbg");
    assert.equal(await page.locator("#download-offline").innerText(), "Refresh offline files");
    const styles = await page.evaluate(() => ({
      font: getComputedStyle(document.body).fontFamily,
      color: getComputedStyle(document.body).color,
      background: getComputedStyle(document.body).backgroundColor,
    }));
    online = false;
    server.closeAllConnections();
    // First navigation into the now-active worker, with no network or HTTP cache.
    await page.reload();
    await ready();
    assert.deepEqual(await page.evaluate(() => ({
      font: getComputedStyle(document.body).fontFamily,
      color: getComputedStyle(document.body).color,
      background: getComputedStyle(document.body).backgroundColor,
    })), styles);
    const dependencies = await page.evaluate(async () => {
      const cache = await caches.open((await caches.keys()).find(k => k.startsWith("backgammon-assets-")));
      const keys = (await cache.keys()).map(r => new URL(r.url).pathname).filter(p => p.startsWith("/shared/"));
      return Promise.all(keys.map(async path => {
        const response = await fetch(path + "?offline-regression=1");
        return {path, status: response.status, control: response.headers.get("Cache-Control"), bytes: (await response.text()).length};
      }));
    });
    assert.ok(dependencies.some(r => r.path === "/shared/tokens.css"));
    assert.ok(dependencies.some(r => r.path === "/shared/app.css"));
    for (const asset of dependencies) {
      assert.equal(asset.status, 200, asset.path);
      assert.equal(asset.control, "no-store", asset.path);
      assert.ok(asset.bytes > 0, asset.path);
    }
    report.cases.push("all shared styles, typography, icons and helpers load offline with identical computed styles");
    await page.locator("#download-offline").click();
    await page.waitForFunction(() => document.querySelector("#offline-status").dataset.state === "ready");
    for (const [name, viewport] of [["desktop", {width: 1440, height: 900}], ["portrait", {width: 390, height: 844}], ["landscape", {width: 844, height: 390}]]) {
      await page.setViewportSize(viewport);
      await page.waitForFunction(() => [...document.querySelectorAll(".tile")].every(tile => Number(getComputedStyle(tile).opacity) > 0.99));
      const button = await page.locator("#download-offline").boundingBox();
      assert.ok(button.height >= 44 && button.width >= 44);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.locator('.offline-install').evaluate(n=>{n.open=true;});
      assert.match(await page.locator('.offline-install').innerText(), /Add to Home Screen/);
      await page.locator('#download-offline').evaluate(n=>n.scrollIntoView({block:'start'}));
      const file = `${browserName}-offline-${name}.png`;
      await page.screenshot({path: path.join(out, file), animations: "disabled"});
      report.screenshots.push(file);
    }
    await page.setViewportSize({width: 1440, height: 900});
    await page.goto(base + "/backgammon/solver/");
    await ready();
    await page.locator("#analyze").click();
    await page.getByText("Evaluated moves", {exact: true}).waitFor({timeout: 60000});
    report.cases.push("real GNUbg initializes and analyzes a position entirely offline");
    await page.goto(base + "/backgammon/play/");
    await ready();
    await page.getByRole("button", {name: "Same device", exact: true}).click();
    await page.locator("#start-match").click();
    await page.locator("#confirm").waitFor({timeout: 30000});
    report.cases.push("local game starts and reaches checker play offline");
    assert.deepEqual(errors, []);
    return report;
  } catch (error) {
    await page.screenshot({path: path.join(out, `${browserName}-offline-failure.png`), fullPage: true});
    fs.writeFileSync(path.join(out, `${browserName}-offline-failure.txt`), JSON.stringify({errors, body: await page.locator("body").innerText()}, null, 2));
    throw error;
  } finally {
    await context.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
};
