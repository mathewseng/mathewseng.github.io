import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';

// Only adapt the generated copy. Browser releases and their cache hashes stay intact.
export async function prepareBundle(root, revision = 'development') {
  const files = [];
  async function walk(dir) {
    for (const item of await readdir(dir, { withFileTypes: true })) {
      if (item.isDirectory()) await walk(join(dir, item.name));
      else if (item.isFile()) files.push(join(dir, item.name));
    }
  }
  await walk(root);
  for (const file of files.filter(f => f.endsWith('.html'))) {
    let html = await readFile(file, 'utf8');
    // WKWebView has a bundled, immutable release. Disable website SW installers
    // before any page script runs so caches can never mask an app update.
    const adapter = '<script src="/native-adapter.js"></script>';
    html = html.replace(/<head(\s[^>]*)?>/i, match => match + '\n' + adapter);
    // PeerJS is only used by online rooms, but should not delay local table setup.
    html = html.replace(/<script src="https:\/\/unpkg\.com\/peerjs@1\.5\.2\/dist\/peerjs\.min\.js"><\/script>/g,
      '<script async src="https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js"></script>');
    await writeFile(file, html);
  }
  await writeFile(join(root, 'native-adapter.js'), `// Native-only adapter: app updates replace the complete site bundle.
try { delete Object.getPrototypeOf(navigator).serviceWorker; } catch {}
window.POCKET_SITE = Object.freeze({ bundled: true });
`);
  const sources = files.filter(f => relative(root, f).startsWith('backgammon/engine/source/') && /\.(gz|patch|c|txt)$/.test(f));
  await writeFile(join(root, 'native-licenses.html'), `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Licenses & source</title><link rel="stylesheet" href="/shared/tokens.css"><link rel="stylesheet" href="/shared/app.css"></head><body><main style="max-width:48rem;margin:2rem auto;padding:1rem"><h1>Licenses & source</h1><p>This app includes GNU Backgammon and its corresponding source and build patches.</p><p><a href="/backgammon/COPYING.txt">Backgammon notices</a> · <a href="/backgammon/licenses/GPL-3.0.txt">GNU GPL v3</a> · <a href="/backgammon/engine/vendor/puretd/LICENSE.txt">PureTD license</a></p><p><a href="https://github.com/mathewseng/mathewseng.github.io/tree/main/ios">Native app source</a></p><h2>Bundled engine source</h2><ul>${sources.map(f => `<li><a download href="/${relative(root, f)}">${relative(join(root, 'backgammon/engine/source'), f)}</a></li>`).join('')}</ul></main></body></html>`);
  const bundledFiles = [...files, join(root, 'native-adapter.js'), join(root, 'native-licenses.html')];
  const sizes = await Promise.all(bundledFiles.map(async f => (await stat(f)).size));
  const info = { revision, pages: bundledFiles.filter(f => f.endsWith('.html')).length,
    files: bundledFiles.length + 1, bytes: sizes.reduce((a, b) => a + b, 0),
    routes: files.filter(f => f.endsWith('/index.html')).map(f => '/' + relative(root, f).replace(/index\.html$/, '')).sort(),
    onlineOnly: ['Multiplayer rooms', 'External links', 'Embedded remote media and historical images'] };
  await writeFile(join(root, 'bundle-info.json'), JSON.stringify(info, null, 2) + '\n');
  return info;
}
if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const revision = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  console.log(await prepareBundle(resolve(process.argv[2]), revision));
}
