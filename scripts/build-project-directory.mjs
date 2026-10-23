// Static, accessible directories. Git dates and catalog data are resolved at build time.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { updateProjectDates } from './update-project-dates.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mapFile = resolve(root, 'shared/site-map.json');
const map = updateProjectDates(JSON.parse(readFileSync(mapFile, 'utf8')), { root });
writeFileSync(mapFile, JSON.stringify(map, null, 2) + '\n');
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const date = value => new Date(`${value}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const dates = p => `<span>Created <time datetime="${p.created}">${date(p.created)}</time></span><span>Updated <time datetime="${p.updated}">${date(p.updated)}</time></span>`;
const favicon = readFileSync(resolve(root, 'index.html'), 'utf8').match(/<link rel="icon" href="([^"]+)"\s*\/>/)?.[1];

function row(p) {
  const label = p.kind === 'source' ? 'Source' : p.status === 'prototype' ? 'Prototype' : p.kind === 'hub' ? 'Hub' : '';
  return `<li data-project="${esc(p.path)}" data-search="${esc(`${p.name} ${p.description} ${p.category} ${label}`.toLocaleLowerCase())}">
    <a class="project-row" href="${esc(p.path)}">
      <div><h3>${esc(p.name)}</h3>${label ? `<span class="project-kind">${label}</span>` : ''}<p>${esc(p.description)}</p></div>
      <div class="project-dates">${dates(p)}</div><span class="project-arrow" aria-hidden="true">↗</span>
    </a>
  </li>`;
}

function directory(category) {
  const cats = category ? [category] : map.categories;
  const projects = map.projects.filter(p => !category || p.category === category.id);
  const title = category ? category.name : 'Mathew Seng';
  const intro = category ? category.description : 'Games to play, ideas to explore, and tools I wanted to exist.';
  const heading = category ? esc(category.name) : 'A collection of <em>curiosities.</em>';
  const nav = map.categories.map(c => {
    const size = map.projects.filter(p => p.category === c.id).length;
    return `<a href="${category ? `/#${c.id}` : `#${c.id}`}"${category?.id === c.id ? ' aria-current="page"' : ''}>${esc(c.name)}<span>${size}</span></a>`;
  }).join('\n');
  return `<!doctype html>
<html lang="en" data-family="home">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#08090d" />
  <meta name="description" content="${esc(intro)} Browse ${projects.length} projects with creation and update dates." />
  <title>${esc(title)} — Projects</title>
  <link rel="icon" href="${favicon}" />
  <link rel="stylesheet" href="/shared/tokens.css?v=20261023" />
  <link rel="stylesheet" href="/shared/app.css?v=20261023" />
  <link rel="stylesheet" href="/shared/hub.css?v=20261023" />
  <link rel="stylesheet" href="/shared/hub-art.css?v=20261023" />
  <link rel="stylesheet" href="/shared/directory.css?v=20261023" />
  <link rel="stylesheet" href="/shared/dither.css?v=20261023" />
  <script type="module" src="/shared/dither.js?v=20261023"></script>
  <script src="/shared/directory.js?v=20261023" defer></script>
</head>
<body class="directory dither-theme">
  <div class="dither-background" aria-hidden="true"><canvas></canvas></div>
  <a class="skip-link" href="#main">Skip to content</a>
  <div class="directory-shell">
    <header class="directory-top"><a class="directory-brand" href="/"><span class="mark" aria-hidden="true">MS</span>Mathew Seng</a><a href="https://github.com/mathewseng/mathewseng.github.io">GitHub ↗</a></header>
    <main id="main" tabindex="-1">
      <section class="directory-hero" aria-labelledby="directory-title"><div><p class="directory-eyebrow">${category ? 'The project collection' : 'A personal collection'}</p><h1 id="directory-title">${heading}</h1><p>${esc(intro)}</p></div><div class="archive-stamp"><strong>${projects.length}</strong>projects &amp; experiments<br>Built out of curiosity.</div></section>
      <form class="directory-controls" role="search" onsubmit="return false">
        <label class="directory-search" for="project-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><span class="visually-hidden">Search projects</span><input id="project-search" type="search" placeholder="Search projects, games, and tools…" autocomplete="off" /></label>
        <span class="directory-count" id="project-count" role="status" aria-live="polite">${projects.length} projects</span><button class="directory-clear" id="clear-search" type="button" hidden>Clear</button>
      </form>
      <div class="catalog-workspace">
        <nav class="category-nav" aria-label="Project categories">${nav}<p>Made over the years.<br>Collected in one place.</p></nav>
        <div class="project-directory" tabindex="0" role="region" aria-label="Project directory">
          ${cats.map(c => `<section class="project-section" id="${c.id}" aria-labelledby="heading-${c.id}"><div class="project-section-head"><div><h2 id="heading-${c.id}">${esc(c.name)}</h2><p>${esc(c.description)}</p></div>${category ? '<a href="/">All projects ↗</a>' : `<a href="${c.path}">Open hub ↗</a>`}</div><ul class="project-list">${projects.filter(p => p.category === c.id).map(row).join('\n')}</ul></section>`).join('\n')}
          <p class="directory-empty" id="directory-empty" hidden>No projects match your search. Try a name or a category.</p>
        </div>
      </div>
    </main>
    <footer class="directory-footer"><button class="dither-toggle" type="button" aria-pressed="false" hidden>Pause background</button><span>Created dates follow the first recorded commit. Updated dates follow project changes.</span><span>Older projects from matheweon.github.io</span></footer>
  </div>
</body>
</html>\n`;
}

function homepage() {
  const featured = new Set();
  let html = readFileSync(resolve(root, 'scripts/templates/home.html'), 'utf8');
  // Keep the original illustrated tiles and source link, adding only their dates.
  html = html.replace(/<li\b([^>]*)>([\s\S]*?)<\/li>/g, (item, attributes, body) => {
    const path = body.match(/<a\b[^>]*href="([^"]+)"/)?.[1];
    const project = map.projects.find(p => p.path === path);
    if (!project) return item;
    featured.add(path);
    const metadata = `<div class="project-dates">${dates(project)}</div>`;
    body = body.includes('</p>') ? body.replace('</p>', `</p>${metadata}`) : `${body}${metadata}`;
    return `<li${attributes} data-project="${esc(path)}">${body}</li>`;
  });

  const accents = { poker: 'poker', backgammon: 'backgammon', games: 'blackjack', music: 'microtonal', tools: 'gym' };
  const groups = map.categories.map(category => {
    const projects = map.projects.filter(p => p.category === category.id && !featured.has(p.path));
    return `<section class="group" id="${category.id}" aria-labelledby="heading-${category.id}" style="--project-accent: var(--family-${accents[category.id]})">
          <div class="group-head"><h2 id="heading-${category.id}">${esc(category.name)}</h2><span>${projects.length} projects</span></div>
          <ul class="tiles" role="list">${projects.map((p, i) => `<li data-project="${esc(p.path)}">
            <a class="tile tile--catalog" href="${esc(p.path)}" style="--i: ${i % 4}">
              <div><h3>${esc(p.name)}</h3><p>${esc(p.description)}</p><div class="project-dates">${dates(p)}</div></div>
              <span class="go" aria-hidden="true"><svg viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></span>
            </a>
          </li>`).join('\n')}</ul>
        </section>`;
  }).join('\n\n');
  return html.replace('<!-- project-groups -->', groups);
}

writeFileSync(resolve(root, 'index.html'), homepage());
for (const category of map.categories.filter(c => ['games', 'music', 'tools'].includes(c.id))) {
  mkdirSync(resolve(root, category.id), { recursive: true });
  writeFileSync(resolve(root, category.id, 'index.html'), directory(category));
}

// Preserve each older app's interface; dates live in its small common breadcrumb.
for (const p of map.projects.filter(p => p.origin && p.path.startsWith('/'))) {
  const file = resolve(root, '.' + p.path, 'index.html');
  if (!existsSync(file)) continue;
  let html = readFileSync(file, 'utf8');
  // Remove the whole generated block, including its surrounding whitespace,
  // so repeated builds do not accumulate blank lines in every imported page.
  html = html.replace(/\s*<div class="project-dates">\s*<!-- project-dates -->[\s\S]*?<!-- \/project-dates -->\s*<\/div>\s*/g, '');
  html = html.replace(/(<header\b[^>]*class="legacy-header"[\s\S]*?)(<\/header>)/, `$1\n<div class="project-dates"><!-- project-dates -->${dates(p)}<!-- /project-dates --></div>$2`);
  // Avoid nesting wrappers across repeated builds.
  html = html.replace(/<div class="project-dates"><\/div>/g, '');
  writeFileSync(file, html);
}
console.log(`Built directories for ${map.projects.length} projects.`);
