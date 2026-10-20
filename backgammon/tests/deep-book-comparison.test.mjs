import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initialState,legalTurns,boardKey} from '../core/rules.mjs';
import {canonicalState,notationBoard,normalizeReference,compareBook} from '../scripts/deep-book-comparison.mjs';

const reference=JSON.parse(readFileSync(new URL('../docs/deep-book-xg-reference.json',import.meta.url)));
test('all published reference candidates resolve to legal complete turns',()=>{
  const rows=normalizeReference(reference);
  assert.equal(rows.length,729);
  assert.equal(rows.reduce((n,r)=>n+r.candidates.length,0),2584);
  assert.ok(rows.every(r=>r.beavers));
  assert.equal(rows.filter(r=>r.sourceIssue).length,1);
  const sixFive=rows.find(r=>r.title==='Opening-65');
  assert.equal(sixFive.roll,'65');
  assert.equal(sixFive.board,boardKey(initialState()));
  const original=reference.sources[0].positions.find(p=>p.title==='Opening-65');
  assert.notEqual(original.xgid,original.normalizedXgid,'source correction must remain auditable');
});
test('notation matching handles combined moves, repetitions, and hits by final board',()=>{
  const start=initialState({matchLength:0,phase:'move',dice:[6,5]});
  assert.equal(notationBoard(start,'24/13'),notationBoard(start,'24/18 18/13'));
  assert.ok(legalTurns(start).some(t=>t.key===notationBoard(start,'24/13')));
  const reply=reference.sources.find(s=>s.url.endsWith('Replies_to_31P.html')).positions[0];
  const state=canonicalState(reply.xgid);
  assert.ok(legalTurns(state).some(t=>t.key===notationBoard(state,'24/22 6/5(2)')));
  const hit={...start,points:[...start.points],bar:[0,0]};
  hit.points[17]=-1;hit.points[18]++;
  const after=notationBoard(hit,'24/18* 13/8').split(',').map(Number);
  assert.equal(after[17],1);assert.equal(after[25],1);
  assert.throws(()=>notationBoard(start,'24/12'),/Blocked/);
  assert.throws(()=>notationBoard(start,'bad'),/Unsupported/);
});
test('comparison uses identical candidate cohort and keeps uncovered losses unknown',()=>{
  const ref=normalizeReference(reference)[0],a=ref.candidates[0],b=ref.candidates[1];
  const make=(r,offset)=>({board:r.board,notation:r.move,historical:{equity:r.equity+offset},fourPly:{equity:r.equity+offset/2},fivePly:{equity:r.equity}});
  const result={id:'fixture',openings:[{id:'opening-21',board:ref.board,roll:'21',candidates:[make(a,.02),make(b,.01)]}],replies:[]};
  const report=compareBook(result,reference);
  assert.equal(report.summaries.opening.depths['3'].commonCandidateEV.n,2);
  assert.ok(Math.abs(report.summaries.opening.depths['3'].commonCandidateEV.meanAbsoluteDifference-.015)<1e-9);
  assert.equal(report.summaries.opening.depths['5'].commonCandidateEV.meanAbsoluteDifference,0);
  assert.equal(report.summaries.opening.depths['5'].bestMoveAgreement,1);
  result.openings[0].candidates.push({board:'not-listed-in-reference',notation:'unlisted',historical:{equity:1},fourPly:{equity:1},fivePly:{equity:1}});
  const missing=compareBook(result,reference);
  assert.equal(missing.rows[0].byDepth['5'].selectedMoveReferenceLoss,null);
  assert.equal(missing.summaries.opening.depths['5'].choiceLossCovered,0);
  assert.equal(missing.summaries.opening.depths['5'].commonCandidateEV.n,2);
});
