import test from 'node:test';
import assert from 'node:assert/strict';
import {longMatch} from './helpers/long-match.mjs';
import {splitGameHistory,nextGameTable,archivedTable} from '../core/game-archive.mjs';
import {replay,transition,decisionPlayer,clone} from '../core/rules.mjs';
import {historyTree} from '../core/history-tree.mjs';

test('legacy sessions split into independently replayable games without changing a single action',()=>{
  const source=longMatch();source.config={mode:'computer'};
  source.events[0].evaluation={result:{retained:'grade'}};
  let id=0;
  const {games,current}=splitGameHistory(source,()=>`part-${++id}`);
  assert.equal(games.length,12);assert.equal(current,games[11]);
  const joined=[];
  for(const [i,game] of games.entries()){
    assert.deepEqual(replay(game.initial,game.events).at(-1),game.state);
    assert.ok(!game.events.some(e=>e.action.type==='next'));
    assert.equal(game.initial.gameNumber,i+1);
    if(i){
      const before=games[i-1].state,actor=decisionPlayer(before),action={type:'next'};
      assert.deepEqual(transition(before,action,actor),game.initial);
      joined.push({actor,action});
    }
    joined.push(...game.events);
  }
  assert.deepEqual(joined,source.events);
  assert.deepEqual(current.state,source.state);
  assert.equal(current.events.length,1);
  assert.equal(games[0].events[0].evaluation.result.retained,'grade');
  assert.equal(splitGameHistory(current).games.length,0,'migration is idempotent');
});

test('migration keeps variations in their own game, including detached legacy lines',()=>{
  const source=longMatch();source.config={mode:'local'};
  // One former complete line plus a partial detached branch from game one.
  source.undoLog=[{by:0,acceptedBy:null,initial:clone(source.initial),prefix:[],events:clone(source.events.slice(0,-1)),reason:'history-return'},
    {by:0,acceptedBy:null,initial:replay(source.initial,source.events.slice(0,1)).at(-1),events:clone(source.events.slice(1,2))}];
  const {games,current}=splitGameHistory(source);
  assert.ok(current.undoLog.length);
  assert.ok(games.some(g=>g.archivedVariation));
  for(const g of games){
    const tree=historyTree(g);
    assert.ok(tree.nodes.length);
    assert.ok(tree.nodes.every(n=>n.state.gameNumber===g.initial.gameNumber));
  }
  assert.equal(source.undoLog[0].events.length,source.events.length-1,'input stays untouched');
});

test('next game keeps score and dice cursor but releases the completed history',()=>{
  const source=longMatch(),boundary=source.events.findIndex(e=>e.action.type==='next');
  const events=source.events.slice(0,boundary+1),state=replay(source.initial,events).at(-1);
  const table={...source,state,events,archiveId:'old',localRolls:{seed:'kept',cursor:57},undoLog:[{large:'old branch'}]};
  const next=nextGameTable(table,'new');
  assert.equal(next.id,source.id);assert.equal(next.archiveId,'new');assert.equal(next.previousGameId,'old');
  assert.deepEqual(next.initial,state);assert.equal(next.state,state);
  assert.deepEqual(next.localRolls,table.localRolls);
  assert.deepEqual(next.events,[]);assert.deepEqual(next.undoLog,[]);
  assert.equal(table.undoLog.length,1);
  const restored=archivedTable({id:'old',sessionId:table.id,initial:source.initial,state,events,names:['White','Black'],tableContext:{localRolls:table.localRolls}},{mode:'local'});
  assert.equal(restored.archiveId,'old');assert.deepEqual(restored.localRolls,table.localRolls);
});
