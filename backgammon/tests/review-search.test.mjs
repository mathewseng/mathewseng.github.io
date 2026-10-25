import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewDepthEstimate,reviewTime} from '../core/review-search.mjs';
test('review time estimates use measured search work and never book/cache retrieval latency',()=>{
 const result={settings:{plies:3},elapsedMs:800};
 assert.equal(reviewDepthEstimate(result,4).ms,6400);
 for(const patch of [{cached:true},{book:{}},{method:'reference'},{method:'rollout'}])assert.equal(reviewDepthEstimate({...result,...patch},4).source,'prior');
 assert.equal(reviewDepthEstimate({...result,budget:{forecast:{nextPlies:4,estimateMs:12345}}},4).ms,12345);
 assert.equal(reviewDepthEstimate({...result,budget:{levels:[{plies:2,elapsedMs:100},{plies:3,elapsedMs:600}]}},4).ms,3600);
 assert.equal(reviewDepthEstimate({settings:{plies:3},elapsedMs:0},4).source,'prior');
 assert.equal(reviewTime(800),'<1 s');assert.equal(reviewTime(2000),'2 s');assert.equal(reviewTime(65000),'2 min');
});

test('every manual review depth has a finite ETA, refined by local measured work',()=>{
 for(const result of [null,{}, {settings:{plies:5},book:{},elapsedMs:1}, {settings:{plies:3},cached:true,elapsedMs:1}]) {
  let previous=0;
  for(const target of [2,3,4,5,6]) {
   const estimate=reviewDepthEstimate(result,target);
   assert.ok(Number.isFinite(estimate.ms)&&estimate.ms>previous);previous=estimate.ms;
   assert.equal(estimate.source,'prior');assert.doesNotMatch(reviewTime(estimate.ms),/unknown|unavailable/i);
  }
 }
 const measured={settings:{plies:4},elapsedMs:2000};
 assert.equal(reviewDepthEstimate({book:{}},5,measured).ms,16000);
 assert.equal(reviewDepthEstimate({cached:true},6,measured).ms,128000);
});
