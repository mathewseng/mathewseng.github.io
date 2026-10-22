import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {OpeningGuideData, OPENING_ROLLS, REPLY_ROLLS, buildOpenings, openingState, previewPosition, openingIdea, openingSummary} from '../ui/opening-guide-data.mjs';
import {boardKey, commitTurn, assertState} from '../core/rules.mjs';
import {bookBoardKey} from '../engine/opening-book.mjs';
const index=JSON.parse(readFileSync(new URL('../engine/opening-book-data/deep/index.json',import.meta.url)));
const fileFetch=url=>Promise.resolve(new Response(readFileSync(url)));

test('opening guide covers every opening and precisely the book’s close window with compact legal notation',()=>{
  const guide=buildOpenings(index);
  assert.equal(guide.size,15);assert.equal(OPENING_ROLLS.length,21);
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
      assert.ok(openingSummary(p,i).label);
    }
  }
  assert.equal(guide.get('65').moves[0].notation,'24/13');
  assert.equal(guide.get('31').moves.length,1);
  assert.equal(openingIdea(guide.get('31'),0),'Make your 5-point.');
  assert.equal(openingSummary(guide.get('65'),0).label,'Run');
  assert.equal(openingSummary(guide.get('65'),0).kind,'run');
  assert.equal(openingSummary(guide.get('31'),0).kind,'point');
  assert.deepEqual(guide.get('21').moves.map((_,i)=>openingSummary(guide.get('21'),i).kind),
    ['split','slot','split','build'],'best and alternatives retain their own main idea');
  assert.match(openingSummary(guide.get('21'),0).description,/Split.*builder/);
  assert.deepEqual(openingState('11').dice,[1,1]);
  assert.throws(()=>openingState('77'));
  assert.throws(()=>buildOpenings({...index,threshold:NaN}));
  assert.throws(()=>buildOpenings({...index,openings:{}}));
});

test('reply colors mirror the legal board and preserve all notation, equity and descriptions',async()=>{
  const data=new OpeningGuideData(fileFetch),guide=await data.openings();
  const replies=await data.replies(guide.get('31'),0);
  assert.equal(openingSummary(replies.get('22'),0).label,'3-anchor + Make 4-point');
  assert.equal(openingSummary(replies.get('22'),0).kind,'anchor');
  const together=replies.get('33'),i=together.moves.findIndex(m=>m.notation==='24/18(2)');
  assert.ok(i>=0);
  assert.equal(openingIdea(together,i),'Make your 18-point.','moving two back checkers together is not a split');
  let anchors=0,hits=0;
  for(const opening of guide.values())if(opening.state.dice[0]!==opening.state.dice[1])for(let choice=0;choice<opening.moves.length;choice++){
    const white=await data.replies(opening,choice),black=await data.replies(opening,choice,1);
    assert.equal(white.size,21);assert.equal(black.size,21);
    for(const [roll,w]of white){
      const b=black.get(roll);
      assertState(w.state);assert.equal(w.state.turn,0);assert.equal(b.state.turn,1);
      assert.deepEqual(w.state.points,b.state.points.toReversed().map(n=>-n));
      assert.deepEqual(w.state.bar,b.state.bar.toReversed());
      for(const [i,m]of w.moves.entries()){
        assert.equal(boardKey(commitTurn(w.state,m.steps)),m.key);
        assert.equal(m.notation,b.moves[i].notation);assert.equal(m.equity,b.moves[i].equity);
        const summary=openingSummary(w,i);
        assert.deepEqual(summary,openingSummary(b,i));
        if(summary.label.includes('anchor'))anchors++;
        if(summary.label.includes('Hit')){hits++;assert.equal(summary.kind,'hit','hitting is the main idea when combined with another action');}
      }
    }
  }
  assert.ok(anchors>0);assert.ok(hits>0);
  await assert.rejects(data.reply(guide.get('31'),0,'31',2));
});

test('every best and close opening has all 21 correctly oriented, cached replies without mutating its source',async()=>{
  const requests=new Map();
  const data=new OpeningGuideData(url=>{requests.set(url.pathname,(requests.get(url.pathname)||0)+1);return fileFetch(url);});
  const guide=await data.openings();let count=0;const visitedBoards=new Set();
  const standard=[...guide.values()].filter(p=>p.state.dice[0]!==p.state.dice[1]);
  for(const opening of standard) for(let choice=0;choice<opening.moves.length;choice++){
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
  for(const opening of guide.values())if(opening.state.dice[0]!==opening.state.dice[1])for(const choice of opening.moves)
    visitedBoards.add(bookBoardKey({...commitTurn(opening.state,choice.steps),turn:1}));
  assert.equal(count,standard.reduce((n,p)=>n+p.moves.length,0)*21);
  assert.equal(requests.size,2+visitedBoards.size,'standard index, doubles book, and distinct standard reply positions');
  assert.ok([...requests.values()].every(n=>n===1),'all rolls of a reply reuse one shard');
});

test('failed book downloads retry; incompatible data and wrong reply boards are rejected',async()=>{
  let failures=1;
  const data=new OpeningGuideData(url=>failures-- >0?Promise.resolve(new Response('',{status:503})):fileFetch(url));
  await assert.rejects(data.openings());
  const guide=await data.openings();assert.equal(guide.size,21);
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

test('all six starting doubles have four-step legal previews and independently labeled estimates',async()=>{
  const guide=await new OpeningGuideData(fileFetch).openings();
  const doubles=JSON.parse(readFileSync(new URL('../engine/opening-book-data/doubles/index.json',import.meta.url)));
  for(const roll of OPENING_ROLLS.filter(r=>r[0]===r[1])){
    const p=guide.get(roll);
    assert.equal(p.plies,5);assert.equal(p.method,'tree');assert.equal(p.screened,false);
    assert.equal(p.state.rules.immediateRedoubles,0);
    assert.equal(p.moves.length,doubles.openings[roll].rows.filter(r=>doubles.openings[roll].rows[0][1]-r[1]<=.040+1e-8).length);
    for(const [i,m]of p.moves.entries()){
      assert.equal(m.steps.length,4);assert.ok(m.steps.every(s=>s.die===Number(roll[0])));
      assertState(previewPosition(p,i));assert.equal(boardKey(previewPosition(p,i)),m.key);
      assert.ok(openingSummary(p,i).description);
    }
  }
  const data=new OpeningGuideData(fileFetch);
  const openings=await data.openings();
  await assert.rejects(data.replies(openings.get('11'),0),/study-only/);
});

test('a missing or invalid doubles book can be retried without restarting standard downloads',async()=>{
  let attempts=0,standard=0;
  const data=new OpeningGuideData(url=>{
    if(url.pathname.endsWith('/doubles/index.json')&&attempts++===0)return Promise.resolve(new Response('',{status:503}));
    if(url.pathname.endsWith('/deep/index.json'))standard++;
    return fileFetch(url);
  });
  await assert.rejects(data.openings());
  assert.equal((await data.openings()).size,21);assert.equal(standard,1);assert.equal(attempts,2);
  const wrong=new OpeningGuideData(url=>url.pathname.endsWith('/doubles/index.json')?Promise.resolve(Response.json(index)):fileFetch(url));
  await assert.rejects(wrong.openings(),/version/);
});
