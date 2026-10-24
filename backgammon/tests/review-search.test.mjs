import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewDepthEstimate,reviewTime} from '../core/review-search.mjs';
test('review time estimates use measured search work and never book/cache retrieval latency',()=>{
 const result={settings:{plies:3},elapsedMs:800};
 assert.equal(reviewDepthEstimate(result,4).ms,6400);
 for(const patch of [{cached:true},{book:{}},{method:'reference'},{method:'rollout'}])assert.equal(reviewDepthEstimate({...result,...patch},4),null);
 assert.equal(reviewDepthEstimate({...result,budget:{forecast:{nextPlies:4,estimateMs:12345}}},4).ms,12345);
 assert.equal(reviewDepthEstimate({...result,budget:{levels:[{plies:2,elapsedMs:100},{plies:3,elapsedMs:600}]}},4).ms,3600);
 assert.equal(reviewDepthEstimate({settings:{plies:3},elapsedMs:0},4),null);
 assert.equal(reviewTime(800),'<1 s');assert.equal(reviewTime(2000),'2 s');assert.equal(reviewTime(65000),'2 min');
});
