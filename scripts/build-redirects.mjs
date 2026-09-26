// Writes a redirect page into the built site for every old path in redirects.json.
// GitHub Pages has no server-side redirects, so each old URL gets an index.html
// that forwards the query string and hash (room codes and share links live there).
// Usage: node scripts/build-redirects.mjs <site-dir>
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const siteDir = process.argv[2];
if (!siteDir) {
  console.error("Usage: node scripts/build-redirects.mjs <site-dir>");
  process.exit(1);
}

const redirects = JSON.parse(readFileSync(new URL("../redirects.json", import.meta.url), "utf8"));

for (const [from, to] of Object.entries(redirects)) {
  const page = join(siteDir, from, "index.html");
  if (existsSync(page)) {
    console.error(`Refusing to overwrite a real page at ${from} with a redirect to ${to}`);
    process.exit(1);
  }
  mkdirSync(join(siteDir, from), { recursive: true });
  writeFileSync(
    page,
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Moved to ${to}</title>
    <meta name="robots" content="noindex" />
    <link rel="canonical" href="${to}" />
    <script>location.replace(${JSON.stringify(to)} + location.search + location.hash);</script>
    <meta http-equiv="refresh" content="0; url=${to}" />
  </head>
  <body>
    <p>This page moved to <a href="${to}">${to}</a>.</p>
  </body>
</html>
`,
  );
  console.log(`${from} -> ${to}`);
}
