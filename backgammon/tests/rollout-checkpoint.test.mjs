// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {appendCheckpoint,retryCheckpoint} from '../scripts/rollout-checkpoint.mjs';
test('disk-full partial writes are removed before another batch can append, then retried without loss',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bg-checkpoint-test-')),file=path.join(dir,'batches.jsonl');
 const first={id:'saved'},a={id:'retry'},b={id:'other'};fs.writeFileSync(file,JSON.stringify(first)+'\n');
 let writes=0,waits=0,warnings=0;
 const io={...fs,appendFileSync(f,line){if(writes++===0){fs.appendFileSync(f,line.slice(0,5));throw Object.assign(Error('full'),{code:'ENOSPC'});}fs.appendFileSync(f,line);}};
 try{
  await appendCheckpoint(file,a,{io,onRetry:()=>warnings++,pause:async()=>{waits++;assert.deepEqual(fs.readFileSync(file,'utf8').trim().split('\n').map(JSON.parse),[first]);await appendCheckpoint(file,b);}});
  assert.deepEqual(fs.readFileSync(file,'utf8').trim().split('\n').map(JSON.parse),[first,b,a]);
  assert.equal(waits,1);assert.equal(warnings,1);
 }finally{fs.rmSync(dir,{recursive:true});}
});
test('checkpoint retries preserve non-storage failures and also handle quota exhaustion',async()=>{
 const error=Object.assign(Error('permission'),{code:'EACCES'});
 await assert.rejects(retryCheckpoint(()=>{throw error;}),e=>e===error);
 let attempts=0,waits=0;
 const result=await retryCheckpoint(()=>{if(attempts++<2)throw Object.assign(Error('quota'),{code:'EDQUOT'});return 'saved';},{pause:async()=>waits++});
 assert.equal(result,'saved');assert.equal(attempts,3);assert.equal(waits,2);
});
