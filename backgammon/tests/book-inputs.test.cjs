const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { recipe, resolveBookInputs, verifyBookInputs } = require('../scripts/book-inputs.cjs');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
test('book generator resolves exact historical inputs without current engine or a compiler', () => {
  const root = resolveBookInputs();
  assert.equal(verifyBookInputs(root), root);
  const index = JSON.parse(fs.readFileSync(path.join(__dirname, '../engine/opening-book-data/index.json')));
  assert.equal(recipe.engine, index.engine);
  for (const [file, expected] of Object.entries(index.provenance.assets))
    assert.equal(digest(fs.readFileSync(path.join(root, 'backgammon', file))), expected);
  assert.match(fs.readFileSync(path.join(root, 'backgammon/engine/metadata.mjs'), 'utf8'), /\+bg5/);
  assert.equal(resolveBookInputs(), root);
});
test('pinned recipe rejects corrupted or substituted transitive modules', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bg-book-input-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  execFileSync('tar', ['-xzf', path.join(__dirname, '../scripts/', recipe.archive), '-C', root]);
  fs.copyFileSync(path.join(__dirname, '../', recipe.sharedData.file), path.join(root, 'backgammon', recipe.sharedData.file));
  verifyBookInputs(root);
  const file = path.join(root, 'backgammon/engine/metadata.mjs');
  fs.appendFileSync(file, '\n// edited runtime\n');
  assert.throws(() => verifyBookInputs(root), /Pinned book input mismatch/);
});
