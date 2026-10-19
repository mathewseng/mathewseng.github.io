import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {OpeningGuideData, OPENING_ROLLS, REPLY_ROLLS, buildOpenings, openingState, previewPosition, openingIdea} from '../ui/opening-guide-data.mjs';
import {boardKey, commitTurn, assertState} from '../core/rules.mjs';
const index=JSON.parse(readFileSync(new URL('../engine/opening-book-data/index.json',import.meta.url)));
const fileFetch=url=>Promise.resolve(new Response(readFileSync(url)));

test('opening guide covers every opening and precisely the book’s close window with compact legal notation',()=>{
  const guide=buildOpenings(index);
  assert.equal(guide.size,15);assert.equal(OPENING_ROLLS.length,15);
  assert.equal(REPLY_ROLLS.length,21);assert.equal(REPLY_ROLLS.filter(r=>r[0]===r[1]).length,6);
  for(const [roll,p] of guide){
    assertState(p.state);assert.equal(p.state.rules.immediateRedoubles,0);
    assert.equal(p.state.rules.jacoby,true);assert.equal(p.state.matchLength,0);
    assert.deepEqual(p.state.dice,[...roll].map(Number));
    const rows=index.openings[roll].rows;
    assert.equal(p.moves.length,rows.filter(r=>rows[0][1]-r[1]<=index.threshold+1e-8).length);
    assert.equal(p.moves[0].equity,rows[0][1]);
    for(const [i,m] of p.moves.entries()){
      assert.equal(m.loss,p.moves[0].equity-m.equity);
      assert.ok(m.loss<=.040+1e-8);
      assert.equal(boardKey(commitTurn(p.state,m.steps)),m.key);
      assert.equal(boardKey(previewPosition(p,i)),m.key);
      assert.equal(previewPosition(p,i).turn,0);
    }
  }
  assert.equal(guide.get('65').moves[0].notation,'24/13');
  assert.equal(guide.get('31').moves.length,1);
  assert.equal(openingIdea(guide.get('31'),0),'Make your 5-point.');
  assert.throws(()=>openingState('11'));
  assert.throws(()=>buildOpenings({...index,threshold:NaN}));
  assert.throws(()=>buildOpenings({...index,openings:{}}));
});

test('every best and close opening has all 21 correctly oriented, cached replies without mutating its source',async()=>{
  const requests=new Map();
  const data=new OpeningGuideData(url=>{requests.set(url.pathname,(requests.get(url.pathname)||0)+1);return fileFetch(url);});
  const guide=await data.openings();let count=0;
  for(const opening of guide.values()) for(let choice=0;choice<opening.moves.length;choice++){
    const saved=JSON.stringify(opening);
    const after=commitTurn(opening.state,opening.moves[choice].steps);
    for(const roll of REPLY_ROLLS){
      const reply=await data.reply(opening,choice,roll);
      assertState(reply.state);assert.equal(reply.state.turn,1);
      assert.equal(boardKey(reply.state),boardKey(after),'reply starts after the chosen opening, not always the best');
      assert.deepEqual(reply.state.dice,[...roll].map(Number));
      assert.equal(reply.moves[0].loss,0);
      for(const move of reply.moves){
        assert.ok(move.loss<=index.threshold+1e-8);
        assert.equal(boardKey(commitTurn(reply.state,move.steps)),move.key);
      }
      assert.equal(await data.reply(opening,choice,roll),reply,'cached position reused');
      count++;
    }
    assert.equal(JSON.stringify(opening),saved);
  }
  assert.equal(count,35*21);
  assert.equal(requests.size,1+Object.keys(index.replies).length,'only the index and the distinct reply positions; equivalent openings share a shard');
  assert.ok([...requests.values()].every(n=>n===1),'all rolls of a reply reuse one shard');
});

test('failed book downloads retry; incompatible data and wrong reply boards are rejected',async()=>{
  let failures=1;
  const data=new OpeningGuideData(url=>failures-- >0?Promise.resolve(new Response('',{status:503})):fileFetch(url));
  await assert.rejects(data.openings());
  const guide=await data.openings();assert.equal(guide.size,15);
  failures=1;
  await assert.rejects(data.reply(guide.get('31'),0,'11'));
  assert.equal((await data.reply(guide.get('31'),0,'11')).state.turn,1);
  await assert.rejects(data.reply(guide.get('31'),1,'31'));
  await assert.rejects(data.reply(guide.get('31'),0,'77'));
  const stale=new OpeningGuideData(()=>Promise.resolve(Response.json({...index,id:'old'})));
  await assert.rejects(stale.openings(),/version/);
  const wrong=new OpeningGuideData(async url=>{
    const json=JSON.parse(readFileSync(url));
    if(!url.pathname.endsWith('/index.json'))json.board='wrong';
    return Response.json(json);
  });
  const openings=await wrong.openings();
  await assert.rejects(wrong.reply(openings.get('31'),0,'31'),/mismatch/);
});
