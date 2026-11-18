import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { artifactDir, solverUrl } from "../project_paths.mjs";
const {fromXGID} = await import(solverUrl("backgammon/core/xgid.mjs"));
const {legalTurns} = await import(solverUrl("backgammon/core/rules.mjs"));

const directory = path.join(artifactDir, "v2");
const files=fs.readdirSync(directory).filter(name=>/^game-\d-analysis\.json$/.test(name)).sort();
for (const file of files) {
  const data=JSON.parse(fs.readFileSync(path.join(directory,file),'utf8'));
  const decisions=[...data.analyses,...data.conditional.flatMap(a=>a.byPlayer)];
  for(const decision of decisions) {
    const legal=legalTurns(fromXGID(decision.xgid));
    assert.deepEqual(legal.map(t=>t.key).sort(),decision.actions.map(b=>b.key).sort(),
      `Different action set in ${file} at frame ${decision.preMoveFrame}`);
    const top4=decision.actions.slice(0,4);
    assert(top4.every(c=>Number.isFinite(c.equity4)));
    assert(decision.actions.filter(c=>c.isPlayed).every(c=>Number.isFinite(c.equity4)));
    assert(!decision.countedInGameLoss || !decision.evidence.includes('partial-dice'));
  }
  console.log(JSON.stringify({game:data.number,decisions:decisions.length,
    legalResults:decisions.reduce((sum,r)=>sum+r.actions.length,0),status:'verified'}));
}
