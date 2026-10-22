import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {initialState,legalTurns,boardKey,commitTurn} from '../core/rules.mjs';
import {bookResult,DOUBLES_BOOK_ID,DOUBLES_BOOK_ENGINE_VERSION} from '../engine/opening-book.mjs';
import {buildOpenings,openingState,OpeningGuideData} from '../ui/opening-guide-data.mjs';

const file=p=>new URL('../'+p,import.meta.url),read=p=>JSON.parse(readFileSync(file(p)));
const index=read('engine/opening-book-data/doubles/index.json');
const auditBytes=gunzipSync(readFileSync(file('docs/opening-doubles-evaluations.json.gz')));
const audit=JSON.parse(auditBytes),sha=b=>createHash('sha256').update(b).digest('hex');
const scores=gunzipSync(readFileSync(file('docs/opening-doubles-scores.jsonl.gz')));
const records=new Map(scores.toString().trim().split('\n').map(line=>{const r=JSON.parse(line);return [r.key,r];}));
const rowsByBoard=entry=>new Map(entry.rows.map(r=>[JSON.stringify(r[0]),r]));

test('five-ply doubles publish every legal move and preserve complete computation provenance',()=>{
  assert.equal(index.id,DOUBLES_BOOK_ID);assert.equal(index.engine,DOUBLES_BOOK_ENGINE_VERSION);
  assert.equal(index.plies,5);assert.equal(index.settings.plies,5);
  assert.deepEqual(Object.keys(index.openings),['11','22','33','44','55','66']);
  assert.equal(index.provenance.auditSHA256,sha(auditBytes));
  assert.equal(index.provenance.scoresSHA256,sha(scores));
  assert.equal(index.provenance.signature,sha(JSON.stringify(audit.inputs)));
  assert.equal(audit.signature,index.provenance.signature);
  assert.equal(audit.inputs.generator,sha(readFileSync(file('scripts/build-opening-doubles.mjs'))));
  assert.ok(audit.maxParityDifference<=1e-5);
  assert.equal(audit.inputs.policy.openingDepth,5);assert.equal(audit.inputs.policy.replies,false);
  assert.equal(index.replies,undefined,'no invented replies after impossible opening doubles');
  let candidates=0;
  for(const d of audit.positions){
    const state=openingState(d.roll),entry=index.openings[d.roll],published=rowsByBoard(entry);
    const legal=new Set(legalTurns(state).map(t=>t.key));
    assert.equal(d.candidates.length,legal.size);assert.equal(entry.rows.length,legal.size);
    assert.equal(entry.total,legal.size);
    assert.deepEqual(new Set(d.candidates.map(c=>boardKey(commitTurn(state,c.steps)))),legal);
    for(const c of d.candidates){
      const packed=published.get(JSON.stringify(c.steps.map(({from,to,die})=>[from,to,die])));
      assert.ok(packed);assert.equal(c.steps.length,4);
      for(const [depth,name]of [[3,'threePly'],[4,'fourPly'],[5,'fivePly']]){
        const v=c[name];assert.ok(v&&Number.isFinite(v.equity));
        const record=records.get(sha(`${c.after}|${depth}|beavers=0`));
        assert.ok(record);assert.equal(record.depth,depth);assert.equal(record.after,c.after);
        assert.deepEqual(v,record.value);
      }
      assert.deepEqual(packed.slice(1),[c.fivePly.equity,c.fivePly.cubeless,...c.fivePly.probabilities]);
      candidates++;
    }
    const result=bookResult(state,entry,index,'auto');
    assert.equal(result.settings.plies,5);assert.equal(result.screening,null);
    const mirrored={...state,turn:1,points:state.points.toReversed().map(p=>-p),bar:[0,0],off:[0,0]};
    assert.deepEqual(bookResult(mirrored,entry,index,'auto').candidates.map(c=>c.equity),result.candidates.map(c=>c.equity));
    const submitted=result.candidates.at(-1),grade=bookResult(state,entry,index,'auto',submitted.steps);
    assert.equal(grade.actual.key,submitted.key);assert.equal(grade.error,result.candidates[0].equity-submitted.equity);
  }
  assert.equal(candidates,257);assert.equal(audit.coverage.openingCandidates,257);
});

test('every close double alternative uses the final five-ply ranking and none are dropped',()=>{
  const guide=buildOpenings(index,Object.keys(index.openings));
  for(const [roll,p]of guide){
    const r=bookResult(openingState(roll),index.openings[roll],index,'auto');
    const near=r.candidates.filter(c=>r.candidates[0].equity-c.equity<=.040+1e-8);
    assert.deepEqual(p.moves.map(c=>c.key),near.map(c=>c.key));
    assert.deepEqual(p.moves.map(c=>c.equity),near.map(c=>c.equity));
    assert.ok(p.moves.every(c=>Math.abs(c.loss-(near[0].equity-c.equity))<1e-10));
    assert.throws(()=>bookResult(openingState(roll),index.openings[roll],{...index,plies:3},'auto'),/Invalid/);
    assert.throws(()=>bookResult(openingState(roll),index.openings[roll],{...index,id:'jacoby-starting-doubles-3ply-v1'},'auto'),/version/);
  }
});

test('shared after-positions match the existing five-ply opening book',()=>{
  const deep=read('engine/opening-book-data/deep/index.json'),known=new Map();
  for(const [roll,entry]of Object.entries(deep.openings)){
    const state=initialState({matchLength:0,phase:'move',dice:[...roll].map(Number),rules:{cube:true,jacoby:true,immediateRedoubles:0}});
    for(const c of bookResult(state,entry,deep,'auto').candidates)known.set(c.key,c);
  }
  let overlaps=0;
  for(const [roll,entry]of Object.entries(index.openings))for(const c of bookResult(openingState(roll),entry,index,'auto').candidates){
    const old=known.get(c.key);if(!old)continue;
    assert.ok(Math.abs(c.equity-old.equity)<=1e-5,`${roll}: comparable five-ply EV`);
    for(let i=0;i<5;i++)assert.ok(Math.abs(c.probabilities[i]-old.probabilities[i])<=1e-5);
    overlaps++;
  }
  assert.ok(overlaps>=10,'check overlapping positions across different dice histories');
});

test('doubled replies to normal openings remain available for both colors',async()=>{
  const data=new OpeningGuideData(url=>Promise.resolve(new Response(readFileSync(url))));
  const openings=await data.openings();
  for(const roll of ['31','42','65'])for(const player of [0,1]){
    const replies=await data.replies(openings.get(roll),0,player);
    assert.equal(replies.size,21);
    for(const d of ['11','22','33','44','55','66']){
      const reply=replies.get(d);assert.equal(reply.plies,5);assert.equal(reply.state.turn,player);
      assert.ok(reply.moves.length);assert.ok(reply.moves.every(m=>m.steps.length===4));
    }
  }
});
