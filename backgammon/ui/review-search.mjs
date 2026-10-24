// SPDX-License-Identifier: GPL-3.0-or-later
import {el,button} from './shell.mjs';
import {equity} from './analysis.mjs';
import {EngineClient} from '../engine/client.mjs';
import {PRESETS} from '../engine/metadata.mjs';
import {gradeCube} from '../engine/cube-grade.mjs';
import {reviewDepthEstimate,reviewTime} from '../core/review-search.mjs';

// One lazily loaded worker per open review. Closing/cancelling releases it;
// deeper requests replace whole comparisons, never a mixture of depth scores.
export function reviewSearch(source,dialog,onResult,beforeRoll=null) {
  const node=el('section',{class:'review-search','aria-label':'Analysis depth'});
  const options=el('div',{class:'review-depth-options'});
  const progress=el('progress',{max:1,'aria-label':'Analysis progress'});
  const status=el('span',{role:'status',class:'review-search-status'});
  const cancel=button('Cancel',()=>stop(),'ghost');
  const working=el('div',{class:'review-search-working',hidden:true},status,cancel,progress);
  const notice=el('p',{class:'review-search-notice small muted',hidden:true});
  node.append(options,working,notice);
  const positionEquity=el('span',{class:'review-number review-preroll-equity'},'…');
  let engine=null,result=null,serial=0,timer=null,busy=false,loadingPosition=false,positionLoaded=false;
  const client=()=>engine || (engine=new EngineClient());
  const paintPosition=value=>{
    if (!Number.isFinite(value?.outcomes?.[0])) return false;
    positionEquity.textContent=equity(value.outcomes[0]);
    positionEquity.title=`Before rolling · ${value.settings?.plies ?? '?'} ply · ${source.turn?'Black':'White'}’s perspective`;
    positionLoaded=true;return true;
  };
  paintPosition(beforeRoll);
  async function loadPosition() {
    if (positionLoaded || loadingPosition || source.phase!=='move' || !dialog.open || busy) return;
    loadingPosition=true;
    try {
      const value=await client().analyze({...source,phase:'roll',dice:[],pending:null},{preset:'deep',kind:'cube',useBook:false,priority:1});
      if(dialog.open)paintPosition(value);
    } catch(error) {
      if(dialog.open && error.name!=='AbortError') {positionEquity.textContent='—';positionEquity.title='Pre-roll evaluation unavailable. Select Position to retry.';}
    } finally {loadingPosition=false;}
  }
  function stop() {
    serial++;busy=false;clearInterval(timer);timer=null;
    engine?.destroy();engine=null;loadingPosition=false;
    working.hidden=true;options.hidden=false;options.querySelectorAll('button').forEach(b=>b.disabled=false);
  }
  function setResult(next) {
    result=next;options.hidden=false;options.replaceChildren();
    const depth=next.method==='reference'?0:next.settings.plies;
    const presets=Object.entries(PRESETS).filter(([key,value])=>key!=='verify' && value.plies>depth && value.plies>=2);
    node.hidden=presets.length===0 && !busy;
    for(const [preset,settings] of presets) {
      const estimate=reviewDepthEstimate(next,settings.plies);
      const b=button('',()=>run(preset),'review-depth',{'aria-label':`Analyze at ${settings.plies} ply`,title:'Estimated time is approximate; position, device and cache affect the actual search. Runs a fresh local GNUbg comparison.'});
      b.append(el('strong',{},`${settings.plies} ply`),el('small',{},estimate?`~${reviewTime(estimate.ms)}`:'Time unknown'));
      options.append(b);
    }
    loadPosition();
  }
  async function run(preset,{expand=false}={}) {
    if(busy || !dialog.open)return;
    const basis=result,token=++serial,plies=PRESETS[preset].plies,started=performance.now();
    busy=true;notice.hidden=true;working.hidden=false;options.hidden=true;node.hidden=false;
    options.querySelectorAll('button').forEach(b=>b.disabled=true);
    progress.removeAttribute('value');status.textContent=`Starting ${plies}-ply analysis…`;
    const estimate=reviewDepthEstimate(basis,plies);let checkpoint=null;
    const update=()=>{
      const elapsed=performance.now()-started;
      status.textContent=checkpoint?.total ? `${checkpoint.plies} ply · ${checkpoint.completed}/${checkpoint.total} positions · ${reviewTime(elapsed)}`
        : `${plies} ply · ${reviewTime(elapsed)} elapsed${estimate?` · ~${reviewTime(Math.max(0,estimate.ms-elapsed))} remaining`:''}`;
    };
    timer=setInterval(update,500);
    const worker=client();worker.cancelWhere(job=>job.priority<20);
    try {
      let fresh=await worker.analyze(source,{preset,useBook:false,priority:20,submitted:basis.actual?.steps || null,
        onProgress:value=>{if(token!==serial || !dialog.open)return;checkpoint=value;
          if(value.total)progress.value=value.completed/value.total;else progress.removeAttribute('value');update();}});
      if(token!==serial || !dialog.open)return;
      if(fresh.type==='cube')fresh=gradeCube(source,fresh,basis.actualDecision || basis.decision?.actual?.action || fresh.action);
      progress.value=1;busy=false;clearInterval(timer);timer=null;working.hidden=true;
      onResult(fresh,false,true);
      notice.hidden=false;notice.textContent=`${plies} ply complete · ${reviewTime(performance.now()-started)}`;
      loadPosition();
    }catch(error){
      if(token!==serial || !dialog.open)return;
      busy=false;clearInterval(timer);timer=null;working.hidden=true;
      options.hidden=false;options.querySelectorAll('button').forEach(b=>b.disabled=false);
      notice.hidden=false;notice.replaceChildren(el('span',{role:'alert'},error.message+' '),button('Retry',()=>run(preset,{expand}),'ghost'));
      loadPosition();
    }
  }
  dialog.addEventListener('close',stop,{once:true});
  return {node,positionEquity,setResult,run,loadPosition};
}
