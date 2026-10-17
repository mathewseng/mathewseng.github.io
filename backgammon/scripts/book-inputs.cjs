// SPDX-License-Identifier: GPL-3.0-or-later
// Historical book inputs are independent of the current application's engine.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const recipe = require('./book-inputs-bg5.json');
const family = path.resolve(__dirname, '..');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
function verifyBookInputs(root, expected = recipe) {
  for (const [file, hash] of Object.entries({ ...expected.assets, [expected.sharedData.file]: expected.sharedData.sha256 })) {
    if (digest(fs.readFileSync(path.join(root, 'backgammon', file))) !== hash)
      throw Error('Pinned book input mismatch: ' + file);
  }
  return root;
}
function resolveBookInputs() {
  // Planning and canonical board construction still use these current modules.
  // Refuse a future rules/encoding change until its book compatibility is checked.
  // The 2026-10-13 extensions change high money cubes/opening limits only.
  // The 2026-10-17 player-label rename is presentation only.
  // Optional certain-race adjudication leaves ordinary legal turns unchanged.
  // book-inputs.test.cjs compares current legal turns and encoding to the
  // immutable bg5 snapshot. Compatible hashes do not change book provenance.
  for (const file of ['core/rules.mjs', 'core/xgid.mjs'])
    if (digest(fs.readFileSync(path.join(family, file))) !== (recipe.compatibleApplicationModules?.[file] || recipe.assets[file]))
      throw Error('Book rules changed; review the pinned recipe before generation: ' + file);
  if (process.env.BG_BOOK_INPUT_ROOT) return verifyBookInputs(path.resolve(process.env.BG_BOOK_INPUT_ROOT));
  const parent = path.join(family, 'test-results/book-inputs');
  const root = path.join(parent, recipe.archiveSHA256);
  if (fs.existsSync(root)) return verifyBookInputs(root);
  const archive = path.join(__dirname, recipe.archive);
  if (digest(fs.readFileSync(archive)) !== recipe.archiveSHA256) throw Error('Pinned book archive checksum mismatch.');
  fs.mkdirSync(parent, { recursive: true });
  const stage = fs.mkdtempSync(path.join(parent, 'prepare-'));
  try {
    execFileSync('tar', ['-xzf', archive, '-C', stage]);
    fs.copyFileSync(path.join(family, recipe.sharedData.file), path.join(stage, 'backgammon', recipe.sharedData.file));
    verifyBookInputs(stage);
    // A concurrent preparation may have won. Only accept its verified result.
    try { fs.renameSync(stage, root); }
    catch (error) { if (!fs.existsSync(root)) throw error; verifyBookInputs(root); }
    return root;
  } finally { fs.rmSync(stage, { recursive: true, force: true }); }
}
module.exports = { resolveBookInputs, verifyBookInputs, recipe };
