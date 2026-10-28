import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { prepareBundle } from './prepare-bundle.mjs';

test('native snapshot disables website caches before module boot without editing website sources', async t => {
  const root = await mkdtemp(join(tmpdir(), 'ios-bundle-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'backgammon'), { recursive: true });
  await writeFile(join(root, 'backgammon/index.html'), '<!doctype html><html><head><script type="module" src="app.js"></script></head></html>');
  await writeFile(join(root, 'backgammon/app.js'), '/* original */');
  const info = await prepareBundle(root, 'test-revision');
  assert.equal(info.pages, 2);
  assert.equal(info.revision, 'test-revision');
  const html = await readFile(join(root, 'backgammon/index.html'), 'utf8');
  assert.ok(html.indexOf('native-adapter.js') < html.indexOf('type="module"'));
  assert.equal(await readFile(join(root, 'backgammon/app.js'), 'utf8'), '/* original */');
  const navigator = Object.create({ serviceWorker: {} });
  vm.runInNewContext(await readFile(join(root, 'native-adapter.js'), 'utf8'), { navigator, window: {} });
  assert.equal('serviceWorker' in navigator, false);
});
