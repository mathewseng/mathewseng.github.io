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
test('current rule extensions preserve historical book boards, legal turns and XGID encoding', async () => {
  const { pathToFileURL } = require('node:url');
  const root=resolveBookInputs();
  const oldRules=await import(pathToFileURL(path.join(root,'backgammon/core/rules.mjs')));
  const oldXgid=await import(pathToFileURL(path.join(root,'backgammon/core/xgid.mjs')));
  const rules=await import('../core/rules.mjs'), xgid=await import('../core/xgid.mjs');
  let s=rules.initialState({phase:'move',dice:[3,1],matchLength:0,rules:{cube:true,jacoby:true}});
  for(let n=0;n<32;n++) {
    for(let high=1;high<=6;high++)for(let low=1;low<=high;low++) {
      const rolled={...s,dice:[high,low]};
      assert.equal(xgid.toXGID(rolled,{engine:true}),oldXgid.toXGID(rolled,{engine:true}));
      assert.deepEqual(rules.legalTurns(rolled).map(t=>t.key).sort(),oldRules.legalTurns(rolled).map(t=>t.key).sort(),
        `historical boards agree at position ${n}, roll ${high}-${low}`);
    }
    assert.equal(xgid.toXGID(s,{engine:true}),oldXgid.toXGID(s,{engine:true}));
    const a=rules.legalTurns(s),b=oldRules.legalTurns(s);
    assert.deepEqual(a.map(t=>t.key).sort(),b.map(t=>t.key).sort());
    const chosen=a[(n*17)%a.length];
    assert.deepEqual(rules.commitTurn(s,chosen.steps),oldRules.commitTurn(s,chosen.steps));
    s=rules.commitTurn(s,chosen.steps);
    if(s.phase==='over') break;
    s={...s,phase:'move',dice:[n%6+1,(n*3+2)%6+1]};
  }
});
