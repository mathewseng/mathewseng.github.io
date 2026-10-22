// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {initialState,transition,decisionPlayer} from '../core/rules.mjs';
const scripts=fileURLToPath(new URL('../scripts/',import.meta.url));
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bg-cube-test-'));
const source=path.join(dir,'test.c'),binary=path.join(dir,'test');
fs.writeFileSync(source,`#include <stdio.h>
#include "rollout-cube-policy.h"
int main(void){int mode,cube,owner,player,immediate;float nd,dt,db,dr;
while(scanf("%d %f %f %f %f %d %d %d %d",&mode,&nd,&dt,&db,&dr,&cube,&owner,&player,&immediate)==9){
BgCubeChoice r=mode?bg_cube_after_beaver(db,dr,cube,player,immediate):bg_cube_decision(nd,dt,db,dr,cube,owner,player,immediate);
printf("%d %d %d %d %.8f\\n",r.action,r.multiplier,r.owner,r.winner,r.value);}}
`);
execFileSync('cc',['-std=c99','-Wall','-Wextra','-Werror','-I',scripts,source,'-o',binary]);
process.on('exit',()=>fs.rmSync(dir,{recursive:true,force:true}));
const run=rows=>execFileSync(binary,{input:rows.map(r=>r.join(' ')).join('\n')+'\n',encoding:'utf8'}).trim().split('\n').map(s=>s.split(' ').map(Number));
const actions=[[],['double','take'],['double','pass'],['double','beaver','take'],['double','beaver','pass'],['double','beaver','raccoon','take'],['double','beaver','raccoon','pass']];
const cases=[
 [0,.6,.5,1,2,0],
 [0,.2,.5,1,2,1],
 [0,0,1.2,2.4,4.8,2],
 [0,-.9,-.2,-.4,-.8,3],
 [0,-3,0,-3,-6,4],
 [0,-.3,.5,-.5,-.2,5],
 [1,0,0,-1,6,6],
];
test('native offer decisions preserve game-rule ownership, cube and terminal payouts',()=>{
 const rows=[];
 for(const player of [0,1])for(const cube of [1,2,16,128])for(const c of cases)rows.push([c,player,cube]);
 const results=run(rows.map(([c,p,cube])=>[...c.slice(0,5),cube,-1,p,2]));
 rows.forEach(([c,p,cube],i)=>{
  const [action,mult,owner,winner]=results[i];assert.equal(action,c[5]);
  let s=initialState({matchLength:0});s.phase='roll';s.turn=p;s.cube={value:cube,owner:null};s.rules={...s.rules,jacoby:true,immediateRedoubles:2};
  for(const type of actions[action])s=transition(s,{type},decisionPlayer(s));
  assert.equal(s.cube.value,cube*mult);assert.equal(s.cube.owner??-1,owner);
  if(winner>=0){assert.equal(s.result.winner,winner);assert.equal(s.result.points,cube*mult);}
  else assert.equal(s.phase,'roll');
 });
});
test('beaver option changes a Jacoby double, with no reference-equity input',()=>{
 const ordinary=run([[0,-.3,-.2,-.4,-.8,1,-1,0,0]])[0];
 const beaver=run([[0,-.3,-.2,-.4,-.8,1,-1,0,2]])[0];
 assert.equal(ordinary[0],1);assert.equal(beaver[0],0);
 const forced=run([[0,-.9,-.2,-.4,-.8,1,-1,0,2]])[0];
 assert.deepEqual(forced.slice(0,4),[3,4,1,-1]);
});
test('money cube cap and offer depth prohibit unavailable immediate offers',()=>{
 assert.equal(run([[0,0,.5,-1,-2,1024,-1,0,2]])[0][0],0);
 assert.equal(run([[0,0,.5,-1,-2,1,1,0,2]])[0][0],0);
 assert.equal(run([[0,-.9,-.2,-.4,-.8,512,-1,0,2]])[0][0],1);
 assert.equal(run([[1,0,0,-.5,.1,256,-1,0,2]])[0][0],3);
 assert.equal(run([[1,0,0,-.5,.1,1,-1,0,1]])[0][0],3);
});
