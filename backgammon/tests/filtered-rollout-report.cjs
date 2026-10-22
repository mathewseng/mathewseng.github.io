const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');

// UI-only synthetic estimates deliberately distinguish a point estimate from
// interval support. The native execution/statistical tests validate real data.
function completedFixture(plan){
 const result={schema:1,id:plan.id,complete:true,records:14336,totalTrials:458752,trialsPerMovePolicy:16384,equityTolerance:.005,
  executionUrl:'https://github.com/mathewseng/mathewseng.github.io/actions/runs/fixture',rows:[],effects:[],candidateEffects:[]};
 for(const row of plan.plan){
  const best=row.candidates.find(c=>c.board===row.referenceBest.board);
  const policies=plan.policies.filter(p=>p.caseIds.includes(row.id)).map(policy=>{
   const candidates=row.candidates.map((c,i)=>{
    const difference=row.kind==='opening'&&i===0?.02:i===1?.001:0;
    const familywise95=i===1?{lower:-.002,upper:.004}:{lower:difference-.03,upper:difference+.03};
    return{candidateId:c.candidateId,role:c.role,move:c.notation,board:c.board,equity:c.reference.xgEquity+difference,standardError:.002,
     referenceEquity:c.reference.xgEquity,referenceConfidenceHalfWidth:c.reference.confidenceHalfWidth,
     referenceCredit:plan.referenceAttributions[row.id][c.candidateId],referenceDifference:difference,withinTolerance:Math.abs(difference)<=.005,
     intervalWithinTolerance:familywise95.lower>=-.005&&familywise95.upper<=.005,absoluteComparison:{difference,familywise95}};
   });
   const selected=candidates.find(c=>c.candidateId===best.candidateId);
   const gaps=candidates.filter(c=>c.candidateId!==best.candidateId).map(c=>({xgCandidateId:best.candidateId,alternativeCandidateId:c.candidateId,
    referenceGap:best.reference.xgEquity-c.referenceEquity,difference:selected.equity-c.equity,
    familywise95:{lower:selected.equity-c.equity-.1,upper:selected.equity-c.equity+.1},direction:'unresolved'}));
   if(row.id===plan.plan[1].id)for(const gap of gaps){gap.familywise95={lower:.0001,upper:.03};gap.direction='XG-choice-ahead';}
   const leader=candidates.reduce((a,b)=>a.equity>b.equity?a:b);
   return{id:policy.id,label:policy.label,runtime:policy.runtime,candidates,gaps,sampledLeader:leader.candidateId,sampledLeaderAgrees:leader.candidateId===best.candidateId};
  });
  result.rows.push({id:row.id,kind:row.kind,roll:row.roll,source:row.source,referenceBest:row.referenceBest,policies});
 }
 const focus=plan.plan.find(row=>row.id==='reply-7985255600f3563f-44');
 for(const[after,before]of plan.comparisons.gapEffects){
  result.effects.push({id:focus.id,after,before,difference:0,familywise95:{lower:-.01,upper:.01}});
  for(const c of focus.candidates)result.candidateEffects.push({id:focus.id,candidateId:c.candidateId,move:c.notation,after,before,difference:.01,familywise95:{lower:.001,upper:.019}});
 }
 assert.equal(result.rows[0].policies[0].sampledLeaderAgrees,false,'fixture must exercise a sampled disagreement with an unresolved interval');
 return result;
}

module.exports=async function(browser,base,out,name){
 const context=await browser.newContext({serviceWorkers:'block',reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  const published=JSON.parse(fs.readFileSync('backgammon/data/filtered-rollout-v1-comparison.json'));
  assert.deepEqual(published,JSON.parse(fs.readFileSync('backgammon/docs/filtered-rollout-v1-comparison.json')));
  await page.goto(base+'/backgammon/reports/#corrected-rollout');
  const section=page.locator('#corrected-rollout-content');await section.locator('p').first().waitFor();
  assert.equal(await section.locator('.error').count(),0);
  assert.ok(await page.locator('#corrected-rollout').evaluate(node=>!!(node.compareDocumentPosition(document.querySelector('#cube-policy-study'))&Node.DOCUMENT_POSITION_FOLLOWING)),'corrected study precedes historical study');
  assert.equal(await page.getByRole('link',{name:'Corrected checker study',exact:true}).getAttribute('href'),'#corrected-rollout');
  if(!published.complete){
   assert.match(await section.textContent(),new RegExp(published.status.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
   assert.match(await section.textContent(),/458,752 full-game trials.*seven positions.*28 candidate\/policy combinations.*14,336 batches/s);
   assert.equal(await section.locator('table').count(),0,'pending study must not show interim EVs');
   assert.doesNotMatch(await section.textContent(),/[+-]\d+[.]\d{4,}|Sampled leader|Block SE/);
   assert.equal(await section.locator('p.notice').count(),1);
   if(published.executionUrl)assert.equal(await section.getByRole('link',{name:'Experiment progress'}).getAttribute('href'),published.executionUrl);
   for(const width of[1366,390,320]){
    await page.setViewportSize({width,height:900});
    await section.evaluate(node=>node.closest('section').scrollIntoView({block:'start',behavior:'instant'}));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    if(out)await page.screenshot({path:path.join(out,`${name}-corrected-study-pending-${width}.png`),animations:'disabled'});
   }
  }
  const fixture=completedFixture(JSON.parse(fs.readFileSync('backgammon/docs/filtered-rollout-v1-inputs.json')));
  await page.route('**/data/filtered-rollout-v1-comparison.json',route=>route.fulfill({json:fixture}));
  await page.reload();await section.locator('table').first().waitFor();
  assert.equal(await section.locator('.error').count(),0);
  const tables=section.locator('table');assert.equal(await tables.count(),5);
  for(const[i,n]of[[0,9],[1,19],[2,28],[3,2],[4,4]])assert.equal(await tables.nth(i).locator('tbody tr').count(),n);
  const first=tables.nth(0).locator('tbody tr').first();
  assert.equal(await first.locator('td').nth(1).textContent(),'No');
  assert.equal(await first.locator('td').nth(2).textContent(),'Unresolved');
  assert.match(await tables.nth(0).textContent(),/XG move supported/);
  const comparisonRows=await tables.nth(2).locator('tbody tr').evaluateAll(rows=>rows.map(row=>[...row.querySelectorAll('td')].map(td=>td.textContent)));
  assert.ok(comparisonRows.some(row=>row[4]==='Yes'&&row[5]==='No'),'point estimate within tolerance must remain distinct from interval containment');
  assert.ok(comparisonRows.some(row=>row[4]==='Yes'&&row[5]==='Yes'));
  assert.ok(comparisonRows.some(row=>row[4]==='No'&&row[5]==='No'));
  assert.equal(await tables.nth(2).getByRole('link',{name:/^XG · /}).count(),28);
  assert.equal(await tables.nth(2).getByText('Block SE 0.00200',{exact:true}).count(),28);
  assert.match(await section.textContent(),/not joint intervals for uncertainty in both engines/);
  assert.match(await section.textContent(),/does not establish accuracy for all openings and replies/);
  assert.match(await section.textContent(),/unresolved interval does not prove agreement or sampling noise/);
  assert.doesNotMatch(await section.textContent(),/undefined|NaN/);
  for(const[label,file]of[['Fixed positions, policies and seeds','inputs.json'],['Complete estimates and intervals','comparison.json'],['Raw paired batches (gzip)','batches.jsonl.gz'],['Validated execution records','execution.json']])
   assert.equal(await section.getByRole('link',{name:label}).getAttribute('href'),'../docs/filtered-rollout-v1-'+file);
  for(const width of[1366,390,320]){
   await page.setViewportSize({width,height:900});
   await section.evaluate(node=>node.closest('section').scrollIntoView({block:'start',behavior:'instant'}));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   const overflow=await section.locator('.report-table-wrap').evaluateAll(nodes=>nodes.some(node=>node.getBoundingClientRect().right>innerWidth+1));
   assert.equal(overflow,false,'tables must scroll within the page width');
   if(width<=390){
    for(const wrap of await section.locator('.report-table-wrap').all()){
     const geometry=await wrap.evaluate(node=>{
      node.scrollLeft=node.scrollWidth;
      const first=node.querySelector('tbody tr th').getBoundingClientRect(),last=node.querySelector('tbody tr td:last-child').getBoundingClientRect(),outer=node.getBoundingClientRect();
      return{pinnedWidth:first.width,viewport:outer.width,visible:last.right>first.right&&last.left<outer.right};
     });
     assert.ok(geometry.pinnedWidth<geometry.viewport*.6,'pinned policy label leaves room to read numeric columns');
     assert.ok(geometry.visible,'rightmost data column remains visible beside the pinned label');
     await wrap.evaluate(node=>{node.scrollLeft=0;});
    }
   }
   if(out)await page.screenshot({path:path.join(out,`${name}-corrected-study-fixture-${width}.png`),animations:'disabled'});
  }
  assert.deepEqual(errors,[]);
 }finally{await context.close();}
 return{actualState:JSON.parse(fs.readFileSync('backgammon/data/filtered-rollout-v1-comparison.json')).complete?'complete':'pending',positions:7,policies:9,pairedGaps:19,candidateEVs:28,policyGapEffects:2,candidateEffects:4,viewports:3};
};
