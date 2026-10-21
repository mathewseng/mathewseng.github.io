/* UI state is isolated from evaluators and the worker's exhaustive solver. */
(() => {
  'use strict';
  const E=VideoPoker,$=id=>document.getElementById(id),fmt=(n,d=3)=>Number(n.toFixed(d)).toLocaleString('en-US',{maximumFractionDigits:d}),pct=n=>(n*100).toFixed(4)+'%';
  const clone=v=>JSON.parse(JSON.stringify(v));
  const isCustom=id=>E.byId[id]?.family==='Custom variants';
  const handSize=()=>v.handSize||5,allHeld=()=> (1<<handSize())-1,usesNetEV=()=>v.doubleOnDraw||v.cribbage;
  const resultPercent=r=>r.estimated?'≈ '+(r.rtp*100).toFixed(2)+'%':pct(r.rtp);
  const signedEV=n=>(n>0?'+':'')+fmt(n,6);
  const resultEV=r=>(r.estimated?'≈ ':'')+signedEV(r.netEV);
  const interval=r=>`${(Math.max(0,r.rtp-1.96*r.rtpSE)*100).toFixed(2)}%–${((r.rtp+1.96*r.rtpSE)*100).toFixed(2)}%`;
  const variantKey=(id,doubled=false,payout='return')=>id+(E.byId[id]?.cribbage&&payout==='net'?'-net':'')+(isCustom(id)&&doubled?'-double':'');
  const settlementName=payout=>payout==='net'?'Points − fee':'Capped loss';
  const selections=E.variants.flatMap(v=>(v.cribbage?['return','net']:['return']).flatMap(payout=>(isCustom(v.id)?[false,true]:[false]).map(doubled=>({key:variantKey(v.id,doubled,payout),id:v.id,doubled,payout,name:v.cribbage?`${v.handSize} cards${doubled?' · 2×':''} · ${settlementName(payout)}`:v.name+(doubled?' · 2×':''),family:v.cribbage?'Cribbage':v.family}))));
  function readSaved(key){try{const value=JSON.parse(localStorage.getItem(key)||'null');return value&&typeof value==='object'&&!Array.isArray(value)?value:null;}catch{return null;}}
  const storedKey='video-poker-paytables-v2',rulesKey='video-poker-rules-v2';
  // Preserve old edits in the mode they belonged to; the other mode starts with original settings.
  const legacyModes=readSaved('video-poker-draw-rules-v1')||{};
  function loadSettings(key,legacyKey){const current=readSaved(key);if(current)return current;const migrated={};for(const [id,value]of Object.entries(readSaved(legacyKey)||{}))migrated[variantKey(id,legacyModes[id]===true)]=value;return migrated;}
  let saved=loadSettings(storedKey,'video-poker-paytables-v1'),savedRules=loadSettings(rulesKey,'video-poker-rules-v1');
  // Move legacy net-settlement edits into their own menu entry without losing either mode.
  for(const [key,rules]of Object.entries(savedRules))if(/^cribbage[4-7](-double)?$/.test(key)&&rules.payout==='net'){const target=key.replace(/^(cribbage[4-7])/, '$1-net');savedRules[target]??=rules;if(saved[key])saved[target]??=saved[key];delete savedRules[key];delete saved[key];}
  let v=clone(E.byId.jacks),phase='idle',hand=[],deck=[],mask=0,pnl=0,hands=0,rows=null,strategyHand=[],review=null,showAll=false,worker=null,workerKind=null,request=0,busy=false,report=null,liveResult=null,outcomeReport=null;
  const historyTotals={win:0,loss:0,push:0};
  let holdTouch=null,lastHoldTouch=null;
  const families=['Custom variants','Cribbage',...new Set(selections.filter(x=>!['Custom variants','Cribbage'].includes(x.family)).map(x=>x.family))];
  $('variant').innerHTML=families.map(f=>`<optgroup label="${f}">${selections.filter(x=>x.family===f).map(x=>`<option value="${x.key}"${isCustom(x.id)?' disabled':''}>${x.name}</option>`).join('')}</optgroup>`).join('');
  function bestRecommendation(id,doubled,payout='return'){const metric=r=>E.byId[id].cribbage?r.result.netEV:r.result.rtp-1;return report?.recommendations.filter(r=>r.id===id&&!!r.doubleOnDraw===!!doubled&&(!E.byId[id].cribbage||r.rules.payout===payout)&&metric(r)<=0).sort((a,b)=>metric(b)-metric(a))[0];}
  function configFor(key){
    const {id,doubled,payout}=selections.find(x=>x.key===key),result=clone(E.byId[id]),p=saved[key],best=bestRecommendation(id,doubled,payout);
    if(result.cribbage)result.rules.payout=payout;
    if(best){result.pays=clone(best.pays);if(best.rules)result.rules=clone(best.rules);}
    if(p){
      const merged=Object.fromEntries(Object.keys(result.pays).map(k=>[k,p[k]??E.byId[id].pays[k]]));
      if(Object.values(merged).every(n=>Number.isInteger(n)&&n>=0&&n<=1000000)&&(id!=='badeucey'||merged.qualify===1))result.pays=merged;
    }
    if(result.cribbage&&savedRules[key]&&['return','net'].includes(savedRules[key].payout)&&[5,7].includes(savedRules[key].scoreCap))result.rules=clone(savedRules[key]);
    if(id==='badeucey'&&savedRules[key])try{result.rules=E.normalizeBadeuceyRules(savedRules[key]);}catch{}
    if(isCustom(id))result.doubleOnDraw=doubled;
    return result;
  }
  function isBasePaytable(){return Object.keys(E.byId[v.id].pays).every(k=>v.pays[k]===E.byId[v.id].pays[k])&&(!v.rules||Object.keys(v.rules).every(k=>v.rules[k]===E.byId[v.id].rules[k]));}
  function isOriginal(){return !v.doubleOnDraw&&isBasePaytable();}
  function knownResult(){
    if(liveResult)return liveResult;
    if(isBasePaytable()){const original=v.doubleOnDraw?report?.doubleOriginals?.[v.id]:report?.originals[v.id];if(original)return original;}
    return report?.recommendations.find(r=>r.id===v.id&&!!r.doubleOnDraw===!!v.doubleOnDraw&&Object.keys(v.pays).every(k=>r.pays[k]===v.pays[k])&&(!v.rules||Object.keys(v.rules).every(k=>r.rules?.[k]===v.rules[k])))?.result;
  }
  function announce(message){$('global-status').textContent=message;}
  function setView(view){for(const b of document.querySelectorAll('[data-view]')){const selected=b.dataset.view===view;b.classList.toggle('active',selected);b.setAttribute('aria-pressed',selected);}for(const name of ['play','lab','rules'])$('view-'+name).hidden=name!==view;}
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
  $('open-lab').onclick=()=>setView('lab');
  function cancel(keepWorker=false){request++;if(worker&&(!keepWorker||(busy&&(workerKind==='all'||v.cribbage)))){worker.terminate();worker=null;}busy=false;$('solve-progress').hidden=true;$('cancel-solve').hidden=true;$('solve-all').disabled=false;renderControls();}
  function clearStrategy(){rows=null;strategyHand=[];review=null;showAll=false;$('strategy-title').textContent='The best decision';$('decision-summary').hidden=true;$('decision-summary').replaceChildren();$('strategy-results').replaceChildren();$('strategy-status').textContent='Solve a hand to compare the exact EV of every decision.';$('show-all').hidden=true;}
  function selectVariant(id){const unfinished=phase==='draw';cancel();v=configFor(id);liveResult=null;phase='idle';hand=[];deck=[];mask=0;clearStrategy();$('variant').value=id;renderConfig();renderHand();$('hand-status').textContent=`${handSize()} cards. One decision.`;announce(unfinished?'Unfinished hand canceled. PnL unchanged.':'');}
  $('variant').onchange=()=>selectVariant($('variant').value);
  function label(k){if(k==='highPair')return v.pairMin===10?'Tens or better':v.pairMin===13?'Kings or better':E.labels[k];if(k==='quads'&&v.pays.aces!==undefined)return v.pays.faceQuads!==undefined?'Four 5s–Ts':'Four 5s–Ks';if(k==='fiveKind'&&v.pays.fiveLow!==undefined)return 'Five 6s–Ks';return E.labels[k];}
  function payEntries(){const order=['fee','royal','deucesAce','deuces','fiveAces','fiveLow','wildRoyal','fiveKind','straightFlush','acesKicker','lowKicker','aces','faceQuads','lowQuads','quads','fullHouse','flush','straight','trips','twoPair','highPair','qualify','wheel','low7','low8','low9','lowT','lowJ','bad5','bad6','bad7','bad8','bad9','badT'];return order.filter(k=>v.pays[k]!==undefined);}
  function rankName(r){return {14:'A',11:'J',10:'T'}[r]||String(r);}
  function qualificationSummary(){
    const r=v.rules,parts=[{ 'high-card':'Five-card high card required (no pairs, straights or flushes).',unpaired:'Five distinct ranks required; straights and flushes may qualify.',any:'Any five-card hand may qualify, including pairs, straights and flushes.'}[r.fiveCard]];
    parts.push(r.minBadugi?`At least ${r.minBadugi} different ranks in different suits${r.maxBadugiRank<14?`, all ${rankName(r.maxBadugiRank)} or lower`:''} required.`:'No badugi required to qualify.');
    if(r.maxLowRank<14)parts.push(`All five cards must be ${rankName(r.maxLowRank)} or lower.`);
    return parts.join(' ');
  }
  function payoutGroups(){return v.id==='badeucey'?[
    {name:'Qualifying return',keys:['qualify']},
    {name:'Five-card low points',keys:['wheel','low7','low8','low9','lowT']},
    {name:'Four-card badugi points',keys:['bad5','bad6','bad7','bad8','bad9','badT']}
  ]:[{name:'Returns per credit',keys:payEntries()}];}
  function qualificationEditor(){
    const r=v.rules;
    const select=(id,title,values,value)=>`<label class="rule-input" for="${id}"><span>${title}</span><select id="${id}">${values.map(([n,label])=>`<option value="${n}"${n===value?' selected':''}>${label}</option>`).join('')}</select></label>`;
    return `<fieldset id="qualification-rules"><legend>Qualification rules</legend>${select('rule-five-card','Five-card requirement',[['high-card','High card only'],['unpaired','Unpaired · straights / flushes allowed'],['any','Any hand · pairs allowed']],r.fiveCard)}${select('rule-min-badugi','Minimum badugi size',[[4,'4 cards'],[3,'3 cards'],[2,'2 cards'],[0,'No badugi required']],r.minBadugi)}${select('rule-low-rank','Highest card in the five-card hand',[[14,'No rank limit · aces high'],...[11,10,9,8,7].map(n=>[n,rankName(n)+' or lower'])],r.maxLowRank)}${select('rule-badugi-rank','Highest card in the qualifying badugi',[[14,'No rank limit · aces high'],...[11,10,9,8,7,6,5,4].map(n=>[n,rankName(n)+' or lower'])],r.maxBadugiRank)}<p>Qualifying returns your stake. Low points still require a valid 2–7 low; badugi points still require four cards. A three-card badugi can qualify without earning badugi points.</p></fieldset>`;
  }
  function renderConfig(){
    const badeucey=v.id==='badeucey';
    $('hand').dataset.size=handSize();
    document.querySelector('.shortcut-note').textContent=`Tap cards to hold · Keys 1–${handSize()} · Space to deal or draw`;
    document.querySelector('label[for=spot-hand]').textContent=`${handSize()} cards, separated by spaces`;
    $('spot-hand').placeholder=['7s','5h','4d','3c','2s','Ah','Jd'].slice(0,handSize()).join(' ');
    $('variant').value=variantKey(v.id,v.doubleOnDraw,v.rules?.payout);
    $('variant-subtitle').textContent=isOriginal()?v.subtitle:badeucey?'Custom rules & payouts':'Custom paytable';$('variant-family').textContent=(v.cribbage?'Cribbage · '+settlementName(v.rules.payout):v.family)+' · '+v.deckSize+' cards'+(v.doubleOnDraw?' · Double on draw':'');
    $('paytable-unit').textContent=v.cribbage?'Points − fee':badeucey?'Push + points':'Return / 1 credit';
    let html='<table>';
    for(const group of payoutGroups()){
      html+='<tbody>'+(badeucey?`<tr class="group-label"><th colspan="2">${group.name}</th></tr>`:'');
      for(const k of group.keys)html+=`<tr data-pay="${k}"><th scope="row">${label(k)}</th><td>${fmt(v.pays[k])}${v.cribbage||badeucey&&k!=='qualify'?'':'×'}</td></tr>`;
      html+='</tbody>';
    }
    $('paytable').innerHTML=v.cribbage?`<table><tbody><tr class=group-label><th colspan=2>Cribbage scoring</th></tr><tr><th>Each fifteen</th><td>2</td></tr><tr><th>Each pair</th><td>2</td></tr><tr><th>Longest runs · 3+ cards</th><td>Length × copies</td></tr><tr><th>Flush · 4+ cards</th><td>${v.rules.scoreCap===5?'Up to 5':'Length'}</td></tr><tr><th>Each jack sharing its suit</th><td>1</td></tr><tr class=group-label><th>Entry fee</th><td>−${v.pays.fee}</td></tr></tbody></table>`:html+'</table>';
    $('paytable-note').textContent=v.cribbage?`${handSize()} cards, one draw, no starter. Aces low; faces count 10 toward fifteens. ${v.rules.scoreCap===5?'Runs and flushes use the OFC cap of 5.':'Runs and flushes score their full length.'} ${v.rules.payout==='net'?`Net PnL = points − fee. Maximum loss: ${v.pays.fee}${v.doubleOnDraw?' (twice the fee at 2×)':''}.`:'Return = max(0, points − fee), including your stake. Return 0 loses; return 1 pushes.'}`:badeucey?qualificationSummary()+' Return = 1 + low points + four-card badugi points. Best award per section only. 0 disables an award.':v.id==='low27'?'Aces high. Pairs, straights and flushes lose. Only the best category pays; returns include your stake.':'One category pays. Returns include your stake. Royal payout uses the max-coin rate, normalized to one credit.';
    if(v.doubleOnDraw)$('paytable-note').textContent+=v.cribbage?' At 2×, both gains and losses double. You must replace at least one card.':' Double on draw: pay 1 extra credit and receive twice the listed return. You must replace at least one card.';
    const payoutInput=k=>`<div class="pay-input"><label for="pay-${k}">${label(k)}</label><input id="pay-${k}" data-key="${k}" type="number" min="0" max="1000000" step="1" value="${v.pays[k]}" required${badeucey&&k==='qualify'?' disabled':''} /></div>`;
    $('pay-editor').innerHTML=(isCustom(v.id)?`<fieldset id="draw-rules"><legend>Draw variant</legend><label class="rule-input" for="rule-double"><span>Stake rule</span><select id="rule-double"><option value="false">Single stake</option><option value="true"${v.doubleOnDraw?' selected':''}>Optional 2× stake on a draw</option></select></label><p>After the deal, you may add one credit to double the entire final return. Replace at least one card; standing pat cannot double.</p></fieldset>`:'')+(v.cribbage?`<fieldset><legend>Scoring rules</legend><label class=rule-input for=rule-cribbage-payout><span>Settlement</span><select id=rule-cribbage-payout><option value=return>Capped loss · maximum 1</option><option value=net${v.rules.payout==='net'?' selected':''}>Points − fee · maximum loss is fee</option></select></label><label class=rule-input for=rule-cribbage-cap><span>Runs and flushes</span><select id=rule-cribbage-cap><option value=7>Score full length</option><option value=5${v.rules.scoreCap===5?' selected':''}>OFC cap of 5</option></select></label></fieldset>`:badeucey?qualificationEditor():'')+payoutGroups().map(group=>badeucey?`<fieldset class="payout-group"><legend>${group.name}</legend>${group.keys.map(payoutInput).join('')}</fieldset>`:group.keys.map(payoutInput).join('')).join('');
    $('editor-note').textContent=v.cribbage?'Choose an integer fee, deducted once from the total cribbage score. At 2×, the entire settled result doubles.':badeucey?'Choose qualification rules and integer point awards. Apply your changes before playing or solving.':'Edit total returns per credit. Categories follow the game’s ranking; only one category pays.';
    $('pay-form').querySelector('button[type=submit]').textContent=isCustom(v.id)?'Apply rules & payouts':'Apply paytable';
    $('edit-status').textContent=phase==='draw'?'Finish your current draw before changing payouts.':'';
    $('solve-all').textContent=v.cribbage&&handSize()>5?'Estimate game · 128 deals':'Solve full game';
    document.querySelector('.analysis-panel h2').textContent=v.cribbage?(handSize()>5?'Estimated net EV':'Exact net EV'):'Exact return';
    $('return-label').textContent=v.cribbage?'EV / hand':'Perfect-play return';
    $('best-pays').textContent=v.cribbage?'Recommended fee':'Best RTP table';
    $('solve-status').textContent='';renderMetrics();renderControls();document.querySelector('.analysis-column').scrollTop=0;document.querySelector('.editor-panel').scrollTop=0;
  }
  function renderMetrics(){
    renderOutcomes();
    const result=knownResult(),value=result?(v.cribbage?resultEV(result):resultPercent(result)):'Not solved';
    $('return-value').textContent=value;$('lab-rtp').textContent=value;
    $('analysis-badge').textContent=isOriginal()?'Original paytable':v.doubleOnDraw?'Double on draw':'Custom rules / paytable';
    if(v.cribbage){
      $('lab-result').textContent=result?`Expected PnL per initial hand, after the fee and all stakes. ${result.deals.toLocaleString()} ${result.estimated?'sampled':'starting'} hands solved.${result.estimated?' Game EV is estimated; each sampled hand uses exact optimal draw EVs.':''}`:handSize()>5?'Estimate game samples 128 initial deals and solves each exactly. This can take several minutes; play stays responsive. Saved fee options use larger samples.':'Apply your settings, then solve the full game to calculate its exact net EV per hand.';
    }else{
      $('lab-result').textContent=result?`Net EV: ${result.netEV>=0?'+':''}${fmt(result.netEV,6)} credits / initial deal. ${result.rtp<=1?'House':'Player'} edge: ${pct(Math.abs(1-result.rtp))} of total stakes. ${result.deals.toLocaleString()} ${result.estimated?'sampled':'starting'} hands solved.${result.estimated?` Approximate 95% RTP interval: ${interval(result)}. Each sampled hand uses exact optimal draw EVs; the whole-game return is an estimate.`:''}`:'Apply your settings, then solve the full game to calculate its exact perfect-play return.';
    }
    $('double-metrics').hidden=!v.doubleOnDraw;
    $('double-metrics').innerHTML=v.doubleOnDraw&&result?`<div><span>Optimal to double</span><strong id="double-frequency">${result.estimated?'≈ ':''}${pct(result.doubleFrequency)}</strong></div><div><span>Average stake / deal</span><strong>${fmt(result.averageStake,6)}</strong></div><div><span>${v.cribbage?'Expected PnL / hand':'Expected return / deal'}</span><strong>${v.cribbage?resultEV(result):fmt(result.expectedReturn,6)}</strong></div><p>2× is optimal on ${result.doubleCount.toLocaleString()} of ${result.deals.toLocaleString()} ${result.estimated?'sampled ':''}deals. An additional ${pct(result.doubleTieFrequency)} tie between doubling and single stake; use single stake on ties. ${v.cribbage?'EV includes the full stake and is measured per initial hand.':'RTP divides expected return by average total stake.'} Strategy maximizes net profit per initial deal.</p>`:v.doubleOnDraw?'<p>Solve to see the optimal double frequency and average stake.</p>':'';
  }
  function renderOutcomes(){
    const same=(a,b)=>JSON.stringify(Object.entries(a||{}).sort())===JSON.stringify(Object.entries(b||{}).sort());
    const result=liveResult?.outcomes||outcomeReport?.entries.find(r=>r.id===v.id&&!!r.doubleOnDraw===!!v.doubleOnDraw&&same(r.pays,v.pays)&&same(r.rules,v.rules))?.result;
    $('outcome-summary').replaceChildren();$('outcome-chart').replaceChildren();
    $('outcome-note').textContent=result?`${result.estimated?'Estimated from '+result.deals.toLocaleString()+' sampled starting hands':'Exact across all '+result.deals.toLocaleString()+' starting hands'}. Optimal holds${v.doubleOnDraw?' and 2× choices':''}; each legal draw is counted. Amounts are net PnL after the full stake. Ties prefer 1×, then more held cards.`:'Solve the game to calculate payout frequencies for these settings.';
    if(!result)return;
    $('outcome-summary').innerHTML=[['Win',result.win],['Push',result.push],['Lose',result.loss]].map(([name,p])=>`<div><span>${name}</span><strong>${(p*100).toFixed(2)}%</strong></div>`).join('')+`<div><span>PnL standard deviation</span><strong>${fmt(result.standardDeviation)}</strong></div>`;
    const rows=result.payouts.filter(r=>r.probability>1e-12),max=Math.max(...rows.map(r=>r.probability));
    $('outcome-chart').innerHTML='<table><thead><tr><th scope="col">Net PnL</th><th scope="col">Frequency</th><th scope="col">About 1 in</th></tr></thead><tbody>'+rows.map(r=>`<tr class="${r.pnl>0?'win':r.pnl<0?'loss':'push'}"><th scope="row">${r.pnl===0?'Push':signedEV(r.pnl)}</th><td><span class="frequency-bar" style="--frequency:${100*r.probability/max}%" aria-hidden="true"></span><span>${fmt(r.probability*100,6)}%</span></td><td>${fmt(1/r.probability,1)}</td></tr>`).join('')+'</tbody></table>';
  }
  function renderStakeControl(){const active=phase==='draw';$('double-draw').hidden=!v.doubleOnDraw||!active;$('double-draw').disabled=!active||mask===allHeld();$('double-draw').title=mask===allHeld()?'Release at least one card to double.':'Add 1 credit, double the final return, and draw.';}
  function renderControls(){const active=phase==='draw';$('deal').disabled=false;$('deal').innerHTML=active?'Draw cards <span aria-hidden="true">→</span>':'Deal hand <span aria-hidden="true">→</span>';$('solve-hand').disabled=busy||hand.length!==handSize();$('solve-hand').textContent=phase==='complete'?'Review decision':'Solve hand';$('hold-best').disabled=busy||!rows||!['draw','study'].includes(phase);$('spot-hand').disabled=active;$('spot-form').querySelector('button').disabled=active;$('pay-form').querySelector('button[type=submit]').disabled=active;$('reset-pays').disabled=active;$('best-pays').hidden=!isCustom(v.id);$('best-pays').disabled=active||!bestRecommendation(v.id,v.doubleOnDraw,v.rules?.payout);for(const select of document.querySelectorAll('#pay-editor select'))select.disabled=active||(select.id==='rule-badugi-rank'&&$('rule-min-badugi')?.value==='0');
    renderStakeControl();
    document.querySelectorAll('[data-recommend]').forEach(b=>b.disabled=active);$('pnl').textContent=(pnl>0?'+':'')+fmt(pnl);$('hands-played').textContent=hands;
  }
  function renderHand(animate=false){holdTouch=null;const canHold=['draw','study'].includes(phase);document.querySelector('.machine').classList.toggle('complete',phase==='complete');$('hand').classList.toggle('dealt',animate);$('hand').innerHTML=Array.from({length:handSize()},(_,i)=>`<div class="card-slot${mask&(1<<i)?' held':''}" style="--i:${i}">${PlayingCards.html(hand.length?E.cardText(hand[i]):'BACK',{tag:canHold?'button':'span',interactive:canHold,pressed:canHold?!!(mask&(1<<i)):undefined,selected:!!(mask&(1<<i)),attrs:canHold?{'data-card':i}:{},title:canHold?'Hold or release card '+(i+1):undefined})}<span class="hold-label">${mask&(1<<i)?'HELD':canHold?'HOLD':' '}</span></div>`).join('');
    $('hold-instruction').textContent=phase==='draw'?(v.doubleOnDraw?'Draw at 1×, or add 1 credit and double. Release at least one card to double.':'Select your holds, then draw once.'):phase==='study'?'Study hand · no credit wagered. Deal starts a random hand.':phase==='complete'?'Hand complete. Deal again when you’re ready.':'Deal a hand to begin.';renderControls();
  }
  function updateHolds(){
    for(const card of $('hand').querySelectorAll('[data-card]')){const held=!!(mask&(1<<Number(card.dataset.card))),slot=card.parentElement;slot.classList.toggle('held',held);card.classList.toggle('selected',held);card.setAttribute('aria-pressed',String(held));slot.querySelector('.hold-label').textContent=held?'HELD':'HOLD';}
    renderStakeControl();
  }
  function toggleHold(i){if(!['draw','study'].includes(phase))return;mask^=1<<i;updateHolds();renderStrategy(true);}
  function cancelTouchHold(){
    if(!holdTouch)return;
    const touch=holdTouch;holdTouch=null;
    if(touch.hand!==hand||!['draw','study'].includes(phase))return;
    mask=touch.held?mask|(1<<touch.index):mask&~(1<<touch.index);updateHolds();renderStrategy(true);
  }
  // Touch acts on contact; native scrolling stays enabled and cancels the provisional hold.
  $('hand').addEventListener('pointerdown',e=>{
    const card=e.target.closest('[data-card]');
    if(e.pointerType==='mouse'){lastHoldTouch=null;return;}
    if(!card||!e.isPrimary||e.button!==0||!['draw','study'].includes(phase))return;
    cancelTouchHold();const index=Number(card.dataset.card);
    holdTouch={id:e.pointerId,index,held:!!(mask&(1<<index)),x:e.clientX,y:e.clientY,hand};
    lastHoldTouch={card,id:e.pointerId,at:performance.now()};toggleHold(index);
  });
  document.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse'&&!e.isPrimary)cancelTouchHold();},{passive:true});
  document.addEventListener('pointermove',e=>{if(holdTouch&&e.pointerId===holdTouch.id&&Math.hypot(e.clientX-holdTouch.x,e.clientY-holdTouch.y)>10)cancelTouchHold();},{passive:true});
  document.addEventListener('pointercancel',e=>{if(holdTouch&&e.pointerId===holdTouch.id)cancelTouchHold();},{passive:true});
  document.addEventListener('pointerup',e=>{if(lastHoldTouch?.id===e.pointerId)lastHoldTouch.at=performance.now();if(holdTouch&&e.pointerId===holdTouch.id)holdTouch=null;},{passive:true});
  $('hand').onclick=e=>{
    const card=e.target.closest('[data-card]');if(!card)return;
    // detail=0 preserves keyboard and assistive activation. WebKit can label the
    // touch compatibility click as mouse; a real mouse pointerdown clears this guard.
    if(e.detail!==0&&(e.pointerType==='touch'||e.pointerType==='pen'||(lastHoldTouch?.card===card&&performance.now()-lastHoldTouch.at<1000))){e.preventDefault();return;}
    toggleHold(Number(card.dataset.card));
  };
  function random(){const a=new Uint32Array(1);crypto.getRandomValues(a);return a[0]/4294967296;}
  function recordHand(profit,doubled){
    const outcome=profit>0?'win':profit<0?'loss':'push';historyTotals[outcome]++;
    const entry=document.createElement('li');entry.className='history-entry '+outcome;entry.dataset.net=profit;entry.dataset.hand=hands;
    entry.innerHTML=`<span>#${hands} · ${E.byId[v.id].name}${v.cribbage?' · '+settlementName(v.rules.payout):''}${doubled?' · 2×':''}</span><strong>${profit>0?'Won +'+fmt(profit):profit<0?'Lost −'+fmt(-profit):'Push'}</strong>`;
    $('history-list').prepend(entry);$('history-list').hidden=false;$('history-list').scrollLeft=0;$('history-empty').hidden=true;
    $('history-summary').textContent=`${historyTotals.win} won · ${historyTotals.loss} lost · ${historyTotals.push} pushed`;
  }
  function completeDraw(doubled=false){
    if(phase!=='draw'||(doubled&&(!v.doubleOnDraw||mask===allHeld())))return;
    cancel(true);announce('');const stake=doubled?2:1;
    review={hand:[...hand],mask,doubled};strategyHand=[...hand];$('strategy-title').textContent='Decision review';
    hand=E.draw(hand,mask,deck);const result=E.evaluate(hand,v);const returned=stake*result.payout;pnl+=returned-stake;hands++;recordHand(returned-stake,doubled);phase='complete';mask=0;renderHand(true);$('hand-status').textContent=returned<stake?'You lose'+(v.cribbage&&v.rules.payout==='net'?' '+fmt(stake-returned):''):returned===stake?'Push':'Won +'+fmt(returned-stake);
    if(v.cribbage)$('hold-instruction').textContent=`${result.label} · fifteens ${result.breakdown.fifteens}, pairs ${result.breakdown.pairs}, runs ${result.breakdown.runs}, flush ${result.breakdown.flush}, suited jacks ${result.breakdown.nobs}`;
    document.querySelectorAll('[data-pay]').forEach(el=>el.classList.toggle('paying',result.keys.includes(el.dataset.pay)));if(rows)renderStrategy();else run('hand');
  }
  $('double-draw').onclick=()=>completeDraw(true);
  $('deal').onclick=()=>{if(phase==='draw'){completeDraw();return;}cancel(true);announce('');
    const shuffled=E.shuffledDeck(v.deckSize,random);hand=shuffled.slice(0,handSize());deck=shuffled.slice(handSize());mask=0;phase='draw';clearStrategy();renderHand(true);$('hand-status').textContent='Choose your hold';document.querySelectorAll('[data-pay]').forEach(el=>el.classList.remove('paying'));
  };
  function describe(m,h=strategyHand){return m===0?`Draw ${h.length}`:m===(1<<h.length)-1?`Hold all ${h.length}`:h.filter((_,i)=>m&(1<<i)).map(E.cardText).join(' ');}
  function decisionLabel(r){return describe(r.mask)+(r.doubled?' · 2×':'');}
  function displayEV(r){return usesNetEV()?r.netEV:r.ev;}
  function formatEV(r){const n=displayEV(r);return (usesNetEV()&&n>0?'+':'')+fmt(n,6)+(usesNetEV()?'':'×');}
  function renderStrategy(selectionOnly=false){
    if(!rows)return;
    const selectedMask=review?review.mask:mask,selected=rows.find(r=>r.mask===selectedMask&&r.doubled===!!(review?.doubled)),best=rows[0];
    $('decision-summary').hidden=!review;
    if(review){
      const loss=Math.max(0,best.ev-selected.ev);
      $('strategy-title').textContent='Decision review';
      $('strategy-status').textContent=`Original deal: ${strategyHand.map(E.cardText).join(' ')}. `+(usesNetEV()?'EV is expected net profit after subtracting the full 1- or 2-credit stake, before the draw.':'EV is expected return per credit, including your stake, before the draw.');
      $('decision-summary').innerHTML=`<div><span>Your decision ${usesNetEV()?'net ':''}EV</span><strong id="decision-ev" data-ev="${displayEV(selected)}">${formatEV(selected)}</strong><small>${decisionLabel(selected)}</small></div><div><span>Best decision ${usesNetEV()?'net ':''}EV</span><strong id="best-decision-ev" data-ev="${displayEV(best)}">${formatEV(best)}</strong><small>${decisionLabel(best)}</small></div><div><span>EV given up</span><strong id="decision-loss" data-ev="${loss}">${fmt(loss,6)}</strong><small>${loss<1e-10?'Optimal decision':'credits / initial deal'}</small></div>`;
    }else{
      const doubleHold=rows.find(r=>r.mask===mask&&r.doubled);
      $('strategy-status').textContent=`Best: ${decisionLabel(best)} · ${formatEV(best)} ${usesNetEV()?'net credits / initial deal':'returned / credit'}. Your hold: ${formatEV(selected)}.`+(doubleHold?` At 2×: ${formatEV(doubleHold)} net.`:'');
    }
    if(selectionOnly&&!review)return;
    const visible=showAll?[...rows]:rows.slice(0,5);
    if(review&&!showAll&&!visible.includes(selected))visible.push(selected);
    $('strategy-results').innerHTML=visible.map(r=>{
      const optimal=Math.abs(r.ev-best.ev)<1e-10,chosen=!!review&&r===selected;
      return `<div class="strategy-row${optimal?' best':''}${chosen?' chosen':''}" data-mask="${r.mask}" data-doubled="${r.doubled}"><span class="choice"><span class="rank">${rows.indexOf(r)+1}</span><span>${decisionLabel(r)}${chosen?'<small class="decision-marker">Your decision</small>':''}</span></span><span class="ev">${formatEV(r)}<small>${optimal?(usesNetEV()?'best net EV':'best return'):'−'+fmt(best.ev-r.ev,6)}</small></span></div>`;
    }).join('');
    $('show-all').hidden=false;$('show-all').textContent=showAll?'Show top 5':usesNetEV()?`Show all ${rows.length} decisions`:`Show all ${rows.length} holds`;renderControls();
  }
  $('show-all').onclick=()=>{showAll=!showAll;renderStrategy();};
  function run(kind){const queryHand=[...(review?review.hand:hand)];cancel(true);busy=true;renderControls();const id=++request;$('solve-all').disabled=true;$('cancel-solve').hidden=false;$('solve-progress').hidden=false;$('solve-progress').value=0;const status=kind==='all'?$('solve-status'):$('strategy-status');status.textContent=kind==='hand'&&review?'Reviewing your draw decision…':'Starting exact solver…';
    try{if(!worker)worker=new Worker('./worker.js?v=20261021-outcomes');workerKind=kind;const activeWorker=worker;worker.onerror=error=>{if(worker!==activeWorker)return;if(id!==request){worker.terminate();worker=null;return;}finishError(error.message||'The solver could not start. Reload the page and try again.');};worker.onmessage=({data})=>{if(data.id!==request)return;if(data.error){finishError(data.error);return;}if(data.progress!==undefined){status.textContent=data.stage+' · '+Math.round(data.progress*100)+'%';$('solve-progress').value=data.progress;return;}busy=false;$('cancel-solve').hidden=true;$('solve-progress').hidden=true;$('solve-all').disabled=false;
      if(kind==='all'){liveResult=data.result;renderMetrics();document.querySelector('.analysis-column').scrollTop=0;status.textContent=data.result.estimated?'Complete. Estimated net EV per hand; every sampled hand was solved exactly.':'Complete. Every hold was re-optimized for these rules and payouts.';}else{rows=data.result;strategyHand=queryHand;renderStrategy();}renderControls();};worker.postMessage({id,kind,variant:v,hand:queryHand});}
    catch(error){finishError(error.message);}
    function finishError(message){cancel();status.textContent=message;announce(message);}
  }
  $('solve-hand').onclick=()=>run('hand');$('solve-all').onclick=()=>run('all');$('cancel-solve').onclick=()=>{cancel();$('solve-status').textContent='Calculation canceled.';$('strategy-status').textContent=rows?'Previous solution retained.':'Calculation canceled. You can try again.';};
  $('hold-best').onclick=()=>{if(rows){mask=rows[0].mask;updateHolds();renderStrategy(true);if(v.doubleOnDraw)announce(rows[0].doubled?'Best hold selected. Use Double & draw for the optimal stake.':'Best hold selected. Use Draw cards at the single stake.');}};
  $('spot-form').onsubmit=e=>{e.preventDefault();if(phase==='draw')return;try{const h=E.parseHand($('spot-hand').value,v.deckSize,handSize());cancel(true);hand=h;deck=[];mask=0;phase='study';clearStrategy();renderHand();$('hand-status').textContent='Study a specific hand';announce('');run('hand');}catch(error){announce(error.message);}};
  function persist(){try{const key=variantKey(v.id,v.doubleOnDraw,v.rules?.payout);saved[key]=v.pays;if(v.rules)savedRules[key]=v.rules;localStorage.setItem(storedKey,JSON.stringify(saved));localStorage.setItem(rulesKey,JSON.stringify(savedRules));return true;}catch{return false;}}
  function apply(pays,rules=v.rules,doubleOnDraw=!!v.doubleOnDraw){if(phase==='draw'){announce('Finish the current draw before changing the game.');return;}cancel();v={...v,pays,doubleOnDraw:isCustom(v.id)&&doubleOnDraw,...(v.cribbage?{rules}:v.id==='badeucey'?{rules:E.normalizeBadeuceyRules(rules)}:{})};liveResult=null;clearStrategy();phase='idle';hand=[];mask=0;const kept=persist();renderConfig();renderHand();$('hand-status').textContent=`${handSize()} cards. One decision.`;announce(kept?'Settings applied and saved in this browser.':'Settings applied for this session; browser storage is unavailable.');}
  $('pay-form').onsubmit=e=>{e.preventDefault();const pays={};for(const input of $('pay-editor').querySelectorAll('input')){if(input.value.trim()===''){announce('Enter a payout for every category.');return;}const n=Number(input.value);if(!Number.isInteger(n)||n<0||n>1000000){announce('Payouts must be whole numbers between 0 and 1,000,000.');return;}pays[input.dataset.key]=n;}const rules=v.cribbage?{payout:$('rule-cribbage-payout').value,scoreCap:Number($('rule-cribbage-cap').value)}:v.id==='badeucey'?{fiveCard:$('rule-five-card').value,minBadugi:Number($('rule-min-badugi').value),maxLowRank:Number($('rule-low-rank').value),maxBadugiRank:Number($('rule-badugi-rank').value)}:undefined;apply(pays,rules,$('rule-double')?.value==='true');};
  $('best-pays').onclick=()=>{const rec=bestRecommendation(v.id,v.doubleOnDraw,v.rules?.payout);if(rec)apply(clone(rec.pays),rec.rules,!!rec.doubleOnDraw);};
  $('reset-pays').onclick=()=>{const base=E.byId[v.id],rec=v.cribbage&&v.rules.payout==='net'?bestRecommendation(v.id,v.doubleOnDraw,'net'):null;apply({...((rec&&rec.pays)||base.pays)},{...base.rules,...(v.cribbage?{payout:v.rules.payout}:{})},!!v.doubleOnDraw);};
  $('pay-form').oninput=()=>{renderControls();$('edit-status').textContent='Unapplied changes. Apply settings to use them in play and the solver.';};
  function renderRecommendations(){
    if(!report)return;
    $('recommendations').innerHTML=E.variants.filter(x=>isCustom(x.id)).flatMap(x=>(x.cribbage?['return','net']:['return']).map(payout=>({id:x.id,payout}))).map(({id,payout})=>`<section class="option-family"><h3>${E.byId[id].name}${E.byId[id].cribbage?' · '+settlementName(payout):''}</h3>${[false,true].map(doubled=>`<details class="option-mode"${doubled?'':' open'}><summary>${doubled?'Optional double on draw':'Single stake'} · ${report.recommendations.filter(r=>r.id===id&&!!r.doubleOnDraw===doubled&&(!E.byId[id].cribbage||r.rules.payout===payout)).length} options</summary>${report.recommendations.filter(r=>r.id===id&&!!r.doubleOnDraw===doubled&&(!E.byId[id].cribbage||r.rules.payout===payout)).map(rec=>`<article class="recommendation"><h4>${rec.name||'Balanced'}</h4><div class="return-comparison">${E.byId[id].cribbage?resultEV(rec.result)+' EV / hand':resultPercent(rec.result)+' RTP'}</div><p>${E.byId[id].cribbage?'Expected PnL after fees and stakes':'Net EV '+signedEV(rec.result.netEV)+' / initial deal'}${doubled?` · Double ${pct(rec.result.doubleFrequency)} of deals`:''}.</p><p>${rec.summary}</p><p>${E.byId[id].cribbage?'Whole-point fees preserve the scoring. The recommended fee has the closest non-positive EV; compare adjacent fees to see their effect.':rec.rationale}${rec.result.estimated?` Estimated game EV from ${rec.result.deals.toLocaleString()} sampled deals; each hand is solved exactly. Sampling uncertainty may change which fee is closest to zero EV.`:''}</p><button class="text-button" data-recommend="${rec.key||rec.id}">Use ${rec.name||'balanced'} →</button></article>`).join('')}</details>`).join('')}</section>`).join('');
    document.querySelectorAll('[data-recommend]').forEach(b=>b.onclick=()=>{
      if(phase==='draw')return;
      const rec=report.recommendations.find(r=>(r.key||r.id)===b.dataset.recommend);
      selectVariant(variantKey(rec.id,rec.doubleOnDraw,rec.rules?.payout));apply({...E.byId[rec.id].pays,...rec.pays},rec.rules||E.byId[rec.id].rules,!!rec.doubleOnDraw);liveResult=rec.result;renderMetrics();setView('lab');
    });renderControls();
  }
  document.addEventListener('keydown',e=>{if(e.repeat||e.altKey||e.ctrlKey||e.metaKey||e.target.closest('input,select,textarea')||$('view-play').hidden)return;if(/^[1-7]$/.test(e.key)&&Number(e.key)<=handSize()){e.preventDefault();toggleHold(+e.key-1);}if(e.code==='Space'&&!e.target.closest('button,summary,a')){e.preventDefault();$('deal').click();}});
  selectVariant('jacks');
  fetch('./outcome-analysis.json?v=20261021-outcomes').then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{outcomeReport=data;renderOutcomes();}).catch(()=>{$('outcome-note').textContent='Saved payout frequencies could not load. Solve the game to calculate them locally.';});
  Promise.all(['analysis.json','cribbage-analysis.json','cribbage-net-analysis.json'].map(file=>fetch('./'+file+'?v=20261021-cribbage-modes').then(r=>{if(!r.ok)throw Error();return r.json();}).catch(error=>{if(file==='analysis.json')throw error;return null;}))).then(([data,cribbage,net])=>{report=data;if(net)report.recommendations.push(...net.recommendations);if(cribbage){report.recommendations.push(...cribbage.recommendations);Object.assign(report.originals,cribbage.originals);Object.assign(report.doubleOriginals,cribbage.doubleOriginals);}for(const option of $('variant').options)option.disabled=false;renderMetrics();renderRecommendations();}).catch(()=>{for(const option of $('variant').options)option.disabled=false;$('recommendations').textContent='Saved analysis could not load. Custom games use original tables unless you have saved edits. Use “Solve full game” to calculate any paytable locally.';});
})();
