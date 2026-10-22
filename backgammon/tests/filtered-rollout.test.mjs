// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {fromXGID} from '../core/xgid.mjs';
import {boardKey, legalTurns} from '../core/rules.mjs';

const bytes = path => fs.readFileSync(new URL('../' + path, import.meta.url));
const read = path => JSON.parse(bytes(path));
const hash = value => createHash('sha256').update(value).digest('hex');
const report = read('docs/filtered-rollout-regression.json');

test('mixed-depth regression retains legal candidates and the independently verified winner', () => {
  assert.equal(report.passed, true);
  const upstreamBuild = read('docs/upstream-focus-build.json');
  assert.equal(upstreamBuild.coreSourcesUnmodified, true);
  assert.equal(report.officialBinarySHA256, upstreamBuild.binarySHA256);
  assert.deepEqual(report.fixture, read('docs/filtered-rollout-regression-input.json'));
  for (const [field, path] of Object.entries({
    patchSHA256: 'engine/source/filtered-rollout-bg9.patch',
    harnessSHA256: 'scripts/filtered-rollout-regression.c',
    scriptSHA256: 'scripts/validate-filtered-rollout.py',
    inputSHA256: 'docs/filtered-rollout-regression-input.json',
  })) assert.equal(report[field], hash(bytes(path)));

  const legal = new Set(legalTurns(fromXGID(report.fixture.original)).map(t => boardKey(t.state)));
  const {before, after} = report;
  assert.equal(legal.size, 23);
  for (const result of [before, after]) {
    assert.equal(result.cacheEntries, 0);
    assert.equal(result.rows.length, legal.size);
    assert.deepEqual(new Set(result.rows.map(row => row.boardKey)), legal);
  }
  assert.equal(before.selectedDepth, 0);
  assert.equal(before.selectedPositionID, report.fixture.previousPositionID);
  assert.equal(after.selectedDepth, 2);
  assert.equal(after.selectedPositionID, report.fixture.expectedPositionID);
  assert.equal(after.selectedScore, Math.max(...after.rows.map(row => row.scores[1])));
  const oldMove = after.rows.find(row => row.positionID === before.selectedPositionID);
  assert.ok(after.selectedScore - oldMove.scores[1] > 0.022);
  assert.ok(before.selectedScore > after.selectedScore, 'stale shallow score displaced the deep winner');
  for (const row of before.rows) {
    const fixed = after.rows.find(other => other.positionID === row.positionID);
    assert.equal(row.boardKey, fixed.boardKey);
    assert.ok(row.scores.every((score, i) => Math.abs(score - fixed.scores[i]) <= 0.000001));
  }

  assert.equal(report.officialComparisons.length, legal.size * 2);
  for (const depth of [0, 2]) {
    const comparisons = report.officialComparisons.filter(row => row.depth === depth);
    assert.deepEqual(new Set(comparisons.map(row => row.boardKey)), legal);
    for (const row of comparisons) {
      const native = after.rows.find(other => other.positionID === row.positionID);
      assert.equal(row.nativeEquity, native.scores[depth / 2]);
      assert.equal(row.difference, Math.abs(row.upstreamEquity - row.nativeEquity));
      assert.ok(row.difference < 0.00001);
    }
  }
  assert.equal(report.officialMaxDifference, Math.max(...report.officialComparisons.map(row => row.difference)));
});

test('excluded replay records the isolated correction and preserves the residual', () => {
  const replay = report.excludedSeedReplays;
  const official = read('docs/upstream-rollout-cache-off-validation.json');
  assert.equal(replay.seed, report.fixture.seed);
  assert.equal(replay.trialsPerCandidate, 2);
  assert.equal(replay.excludedFromStudy, true);
  assert.equal(replay.cacheDisabled, true);
  assert.equal(replay.officialSourceSHA256, hash(bytes('docs/upstream-rollout-cache-off-validation.json')));
  assert.equal(report.frozenBinarySHA256, official.frozenNativeSHA256);
  assert.equal(replay.results.length, 2);
  for (const result of replay.results) {
    const prior = official.results.find(row => row.id === result.role + '-2ply');
    assert.deepEqual(result.official, prior.upstream);
    assert.deepEqual(result.before, prior.native);
    assert.equal(result.equityDifference, result.afterFix.equity - result.official.equity);
    assert.equal(result.afterFix.samples, 2);
    assert.equal(result.afterFix.checkerPlies, 2);
    assert.equal(result.afterFix.cubePlies, 2);
    assert.equal(result.afterFix.truncationPlies, 0);
  }
  const corrected = replay.results.find(row => row.role === 'previous-choice');
  const residual = replay.results.find(row => row.role === 'xg-choice');
  assert.ok(Math.abs(corrected.before.equity - corrected.official.equity) > 0.03);
  assert.ok(Math.abs(corrected.equityDifference) < 0.00001);
  assert.equal(residual.before.equity, residual.afterFix.equity);
  assert.ok(Math.abs(residual.equityDifference) > 0.0004);
});

test('captured checker traces retain the causal divergence and exact-score tie evidence', () => {
  const trace = JSON.parse(gunzipSync(bytes('docs/filtered-rollout-traces.json.gz')));
  assert.equal(trace.seed, report.fixture.seed);
  assert.equal(trace.excludedFromStudy, true);
  assert.equal(trace.frozenBinarySHA256, report.frozenBinarySHA256);
  for (const file of Object.values(trace.files)) assert.equal(hash(file.text), file.sha256);
  const normalize = token => token.replace(/[a-x]/g, c => String.fromCharCode(120 - c.charCodeAt(0) + 97));
  const nativeMoves = (name, game) => trace.files[name].text.trim().split('\n')
    .map(line => line.split(/\\t|\t/)).filter(row => Number(row[1]) === game)
    .map(row => `${Number(row[3]) === 0 ? 'B' : 'W'}[${normalize(row[6])}]`);
  const old = nativeMoves('previous-choice.trace.tsv', 1);
  const fixed = nativeMoves('previous-choice.fixed-trace.tsv', 1);
  const official = [...trace.files['previous-choice-0000001-a.sgf'].text.matchAll(/([BW])\[([1-6]{2}[a-z]*)\]/g)]
    .map(match => `${match[1]}[${match[2]}]`);
  assert.deepEqual(old.slice(0, 40), official.slice(0, 40));
  assert.equal(old[40], 'B[63aggj]');
  assert.equal(fixed[40], official[40]);
  assert.equal(fixed[40], 'B[63agmp]');
  const tie = trace.divergences.find(row => row.role === 'xg-choice');
  assert.equal(tie.turn, 50);
  assert.deepEqual(tie.state.dice, [3, 2]);
  const values = trace.files['xg-choice-divergence-2.native.txt'].text.trim().split('\n').map(JSON.parse);
  assert.equal(values.length, 2);
  assert.ok(values.every(row => row.equity === -1));
});
