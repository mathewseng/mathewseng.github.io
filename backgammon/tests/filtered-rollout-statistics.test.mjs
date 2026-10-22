import test from 'node:test';
import {execFileSync} from 'node:child_process';
test('fixed rollout merge and statistics reject incomplete or corrupted samples and preserve paired inference',()=>{
 execFileSync('python3',[new URL('./filtered-rollout-statistics.test.py',import.meta.url).pathname],{
  env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},stdio:'pipe',timeout:30000});
});
