// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {fromXGID} from '../core/xgid.mjs';
import {legalTurns,commitTurn} from '../core/rules.mjs';
import {bookBoardKey} from '../engine/opening-book.mjs';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url)));
test('paired diagnostic statistics, confidence correction and invalid-input checks',()=>{
 execFileSync('python3',['backgammon/tests/rollout-diagnostic.py'],{env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',NODE:process.execPath}});
});
test('published confirmation binds complete fresh batches to the fixed plan',()=>{
 const inputs=read('../docs/rollout-diagnostic-inputs.json'),report=read('../docs/rollout-diagnostic-comparison.json');
 const {signature,...unsigned}=inputs;
 const hash=v=>createHash('sha256').update(v).digest('hex');
 assert.equal(hash(JSON.stringify(unsigned)),signature);
 const raw=gunzipSync(readFileSync(new URL('../docs/rollout-diagnostic-batches.jsonl.gz',import.meta.url)));
 assert.equal(hash(raw),report.rawSHA256);
 const records=raw.toString().trim().split('\n').map(JSON.parse);
 assert.equal(records.length,6144);assert.equal(new Set(records.map(r=>r.key)).size,6144);
 assert.equal(report.complete,true);assert.equal(report.rows.length,24);
 assert.equal(report.rows.filter(r=>r.kind==='opening').length,1);
 assert.equal(report.rows.find(r=>r.kind==='opening').roll,'21');
 assert.equal(report.trialsPerMove,4096);
 for(const d of inputs.plan)for(const c of d.candidates){
  const state=fromXGID(c.original);
  assert.equal(bookBoardKey(state),d.board);
  assert.ok(legalTurns(state).some(t=>bookBoardKey(commitTurn(state,t.steps))===c.board),'fixed candidate is legal');
  assert.equal(bookBoardKey(commitTurn(state,c.steps)),c.board);
  assert.equal(bookBoardKey(fromXGID(c.after)),c.board);
 }

 for(const row of report.rows){
  assert.equal(row.gap.batches,128);
  assert.ok(row.estimates.every(e=>e.samples===4096));
  assert.ok(row.gap.familywise95.halfWidth>row.gap.interval95.halfWidth);
 }
 const compact=read('../data/rollout-diagnostic-comparison.json');
 assert.deepEqual(compact.rows,report.rows.map(r=>({...r,estimates:null})));
 assert.equal(compact.signature,signature);
});
