// Writes a redirect page into the built site for every old path in redirects.json.
// GitHub Pages has no server-side redirects, so each old URL gets an index.html
// that forwards the query string and hash (room codes and share links live there).
// Usage: node scripts/build-redirects.mjs <site-dir>
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, dirname, extname } from "node:path";

const siteDir = process.argv[2];
if (!siteDir) {
  console.error("Usage: node scripts/build-redirects.mjs <site-dir>");
  process.exit(1);
}

const redirects = JSON.parse(readFileSync(new URL("../redirects.json", import.meta.url), "utf8"));
const written = new Map();

for (const [from, to] of Object.entries(redirects)) {
  // Fragments never reach the server. The surviving page handles these links
  // in its own versioned source, so assembly must not overwrite that page.
  if (from.includes("#")) {
    const page = join(siteDir, from.split("#")[0], "index.html");
    const source = existsSync(page) ? readFileSync(page, "utf8") : "";
    if (!source.includes(`data-fragment-redirect="${from}"`) || !source.includes(JSON.stringify(to)))
      throw new Error(`Missing source-managed fragment redirect: ${from} -> ${to}`);
    console.log(`${from} -> ${to} (fragment)`);
    continue;
  }
  // Legacy projects also used filenames (including uppercase paths). Preserve
  // those exact URLs rather than creating a directory named Something.html.
  const page = extname(from) ? join(siteDir, from) : join(siteDir, from, "index.html");
  if (written.get(page) === to) continue;
  if (existsSync(page)) {
    // macOS commonly uses a case-insensitive disk: /Games/Cardsweeper/ already
    // resolves to /games/cardsweeper/. Leave that real page intact locally.
    // Linux deployment creates the exact uppercase redirect as usual.
    const normalizedFrom = from.replace(/index\.html$/, "");
    const targetPage = join(siteDir, to, "index.html");
    if (normalizedFrom !== to && normalizedFrom.toLowerCase() === to.toLowerCase() &&
        existsSync(targetPage) && statSync(page).dev === statSync(targetPage).dev &&
        statSync(page).ino === statSync(targetPage).ino) {
      console.log(`${from} -> ${to} (case-insensitive filesystem alias)`);
      continue;
    }
    console.error(`Refusing to overwrite a real page at ${from} with a redirect to ${to}`);
    process.exit(1);
  }
  mkdirSync(dirname(page), { recursive: true });
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
  written.set(page, to);
  console.log(`${from} -> ${to}`);
}
