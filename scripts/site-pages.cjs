// Test tooling only. Serves an assembled site directory over a local HTTP
// server and lists its real pages (every index.html that is not a generated
// redirect). Shared by scripts/shell-browser.cjs and scripts/screenshots.cjs.
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
  ".woff2": "font/woff2",
  ".txt": "text/plain",
  ".data": "application/octet-stream",
};

// Starts a static server for `root`; resolves to { base, close }.
async function serveSite(root) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    let file = path.resolve(root, "." + decodeURIComponent(url.pathname));
    if (!file.startsWith(root + path.sep) && file !== root) {
      res.writeHead(403);
      return res.end();
    }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      if (!url.pathname.endsWith("/")) {
        res.writeHead(301, { Location: url.pathname + "/" + url.search });
        return res.end();
      }
      file = path.join(file, "index.html");
    }
    fs.readFile(file, (error, data) => {
      if (error) {
        res.writeHead(404);
        return res.end("Not found");
      }
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
      res.end(data);
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

// Every published page as a URL path ("/", "/poker/play/", ...), sorted.
// Redirect stubs written by scripts/build-redirects.mjs are skipped.
function listPages(root) {
  const pages = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === "index.html") {
        const html = fs.readFileSync(full, "utf8");
        if (/http-equiv="refresh"/.test(html)) continue;
        const rel = path.relative(root, path.dirname(full)).split(path.sep).join("/");
        pages.push(rel ? `/${rel}/` : "/");
      }
    }
  };
  walk(root);
  return pages.sort();
}

// A file-name-safe label for a page path: "/" -> "home", "/poker/play/" -> "poker-play".
function pageLabel(page) {
  return page === "/" ? "home" : page.replace(/^\/|\/$/g, "").replace(/\//g, "-");
}

// Waits for fonts, idle network (bounded) and a short settle so canvases and
// lazily rendered boards have painted before anything is measured.
async function settle(page, { idle = 4000, after = 350 } = {}) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForLoadState("networkidle", { timeout: idle }).catch(() => {});
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await page.waitForTimeout(after);
}

module.exports = { serveSite, listPages, pageLabel, settle, MIME };
