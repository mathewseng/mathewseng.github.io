/* UI state is isolated from evaluators and the worker's exhaustive solver. */
(() => {
  'use strict';
  const E=VideoPoker,$=id=>document.getElementById(id),fmt=(n,d=3)=>Number(n.toFixed(d)).toLocaleString('en-US',{maximumFractionDigits:d}),pct=n=>(n*100).toFixed(4)+'%';
  const clone=v=>JSON.parse(JSON.stringify(v));
  const isCustom=id=>['low27','badeucey'].includes(id);
  const variantKey=(id,doubled=false)=>id+(isCustom(id)&&doubled?'-double':'');
  const selections=E.variants.flatMap(v=>isCustom(v.id)?[false,true].map(doubled=>({key:variantKey(v.id,doubled),id:v.id,doubled,name:v.name+(doubled?' · 2× on draw':''),family:v.family})):[{key:v.id,id:v.id,doubled:false,name:v.name,family:v.family}]);
  function readSaved(key){try{const value=JSON.parse(localStorage.getItem(key)||'null');return value&&typeof value==='object'&&!Array.isArray(value)?value:null;}catch{return null;}}
  const storedKey='video-poker-paytables-v2',rulesKey='video-poker-rules-v2';
  // Preserve old edits in the mode they belonged to; the other mode starts with original settings.
  const legacyModes=readSaved('video-poker-draw-rules-v1')||{};
  function loadSettings(key,legacyKey){const current=readSaved(key);if(current)return current;const migrated={};for(const [id,value]of Object.entries(readSaved(legacyKey)||{}))migrated[variantKey(id,legacyModes[id]===true)]=value;return migrated;}
  let saved=loadSettings(storedKey,'video-poker-paytables-v1'),savedRules=loadSettings(rulesKey,'video-poker-rules-v1');
  let v=clone(E.byId.jacks),phase='idle',hand=[],deck=[],mask=0,pnl=0,hands=0,rows=null,strategyHand=[],review=null,showAll=false,worker=null,request=0,busy=false,report=null,liveResult=null;
  const families=['Custom variants',...new Set(E.variants.filter(x=>x.family!=='Custom variants').map(x=>x.family))];
  $('variant').innerHTML=families.map(f=>`<optgroup label="${f}">${selections.filter(x=>x.family===f).map(x=>`<option value="${x.key}">${x.name}</option>`).join('')}</optgroup>`).join('');
  function configFor(key){
    const {id,doubled}=selections.find(x=>x.key===key),result=clone(E.byId[id]),p=saved[key];
    if(p){
      const merged=Object.fromEntries(Object.keys(result.pays).map(k=>[k,p[k]??result.pays[k]]));
      if(Object.values(merged).every(n=>Number.isInteger(n)&&n>=0&&n<=1000000)&&(id!=='badeucey'||merged.qualify===1))result.pays=merged;
    }
    if(id==='badeucey')try{result.rules=E.normalizeBadeuceyRules(savedRules[key]);}catch{}
    if(isCustom(id))result.doubleOnDraw=doubled;
    return result;
  }
  function isBasePaytable(){return Object.keys(E.byId[v.id].pays).every(k=>v.pays[k]===E.byId[v.id].pays[k])&&(v.id!=='badeucey'||Object.keys(E.BADEUCEY_RULES).every(k=>v.rules[k]===E.BADEUCEY_RULES[k]));}
  function isOriginal(){return !v.doubleOnDraw&&isBasePaytable();}
  function knownResult(){
    if(liveResult)return liveResult;
    if(isBasePaytable())return v.doubleOnDraw?report?.doubleOriginals?.[v.id]:report?.originals[v.id];
    return report?.recommendations.find(r=>r.id===v.id&&!!r.doubleOnDraw===!!v.doubleOnDraw&&Object.keys(v.pays).every(k=>r.pays[k]===v.pays[k])&&(v.id!=='badeucey'||Object.keys(E.BADEUCEY_RULES).every(k=>r.rules?.[k]===v.rules[k])))?.result;
  }
  function announce(message){$('global-status').textContent=message;}
  function setView(view){for(const b of document.querySelectorAll('[data-view]')){const selected=b.dataset.view===view;b.classList.toggle('active',selected);b.setAttribute('aria-pressed',selected);}for(const name of ['play','lab','rules'])$('view-'+name).hidden=name!==view;}
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
  $('open-lab').onclick=()=>setView('lab');
  function cancel(){request++;if(worker){worker.terminate();worker=null;}busy=false;$('solve-progress').hidden=true;$('cancel-solve').hidden=true;$('solve-all').disabled=false;renderControls();}
  function clearStrategy(){rows=null;strategyHand=[];review=null;showAll=false;$('strategy-title').textContent='The best decision';$('decision-summary').hidden=true;$('decision-summary').replaceChildren();$('strategy-results').replaceChildren();$('strategy-status').textContent='Solve a hand to compare the exact EV of every decision.';$('show-all').hidden=true;}
  function selectVariant(id){cancel();v=configFor(id);liveResult=null;phase='idle';hand=[];deck=[];mask=0;clearStrategy();$('variant').value=id;renderConfig();renderHand();$('hand-status').textContent='Five cards. One decision.';announce('');}
  $('variant').onchange=()=>selectVariant($('variant').value);
  function label(k){if(k==='highPair')return v.pairMin===10?'Tens or better':v.pairMin===13?'Kings or better':E.labels[k];if(k==='quads'&&v.pays.aces!==undefined)return v.pays.faceQuads!==undefined?'Four 5s–Ts':'Four 5s–Ks';if(k==='fiveKind'&&v.pays.fiveLow!==undefined)return 'Five 6s–Ks';return E.labels[k];}
  function payEntries(){const order=['royal','deucesAce','deuces','fiveAces','fiveLow','wildRoyal','fiveKind','straightFlush','acesKicker','lowKicker','aces','faceQuads','lowQuads','quads','fullHouse','flush','straight','trips','twoPair','highPair','qualify','wheel','low7','low8','low9','lowT','lowJ','bad5','bad6','bad7','bad8','bad9','badT'];return order.filter(k=>v.pays[k]!==undefined);}
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
    $('variant').value=variantKey(v.id,v.doubleOnDraw);
    $('variant-subtitle').textContent=isOriginal()?v.subtitle:badeucey?'Custom rules & payouts':'Custom paytable';$('variant-family').textContent=v.family+' · '+v.deckSize+' cards'+(v.doubleOnDraw?' · Double on draw':'');
    $('paytable-unit').textContent=badeucey?'Push + points':'Return / 1 credit';
    let html='<table>';
    for(const group of payoutGroups()){
      html+='<tbody>'+(badeucey?`<tr class="group-label"><th colspan="2">${group.name}</th></tr>`:'');
      for(const k of group.keys)html+=`<tr data-pay="${k}"><th scope="row">${label(k)}</th><td>${fmt(v.pays[k])}${badeucey&&k!=='qualify'?'':'×'}</td></tr>`;
      html+='</tbody>';
    }
    $('paytable').innerHTML=html+'</table>';
    $('paytable-note').textContent=badeucey?qualificationSummary()+' Return = 1 + low points + four-card badugi points. Best award per section only. 0 disables an award.':v.id==='low27'?'Aces high. Pairs, straights and flushes lose. Only the best category pays; returns include your stake.':'One category pays. Returns include your stake. Royal payout uses the max-coin rate, normalized to one credit.';
    if(v.doubleOnDraw)$('paytable-note').textContent+=' Double on draw: pay 1 extra credit and receive twice the listed return. You must replace at least one card.';
    const payoutInput=k=>`<div class="pay-input"><label for="pay-${k}">${label(k)}</label><input id="pay-${k}" data-key="${k}" type="number" min="0" max="1000000" step="1" value="${v.pays[k]}" required${badeucey&&k==='qualify'?' disabled':''} /></div>`;
    $('pay-editor').innerHTML=(isCustom(v.id)?`<fieldset id="draw-rules"><legend>Draw variant</legend><label class="rule-input" for="rule-double"><span>Stake rule</span><select id="rule-double"><option value="false">Single stake</option><option value="true"${v.doubleOnDraw?' selected':''}>Optional 2× stake on a draw</option></select></label><p>After the deal, you may add one credit to double the entire final return. Replace at least one card; standing pat cannot double.</p></fieldset>`:'')+(badeucey?qualificationEditor():'')+payoutGroups().map(group=>badeucey?`<fieldset class="payout-group"><legend>${group.name}</legend>${group.keys.map(payoutInput).join('')}</fieldset>`:group.keys.map(payoutInput).join('')).join('');
    $('editor-note').textContent=badeucey?'Choose qualification rules and integer point awards. Apply your changes before playing or solving.':'Edit total returns per credit. Categories follow the game’s ranking; only one category pays.';
    $('pay-form').querySelector('button[type=submit]').textContent=isCustom(v.id)?'Apply rules & payouts':'Apply paytable';
    $('edit-status').textContent=phase==='draw'?'Finish your current draw before changing payouts.':'';
    $('solve-status').textContent='';renderMetrics();renderControls();document.querySelector('.analysis-column').scrollTop=0;document.querySelector('.editor-panel').scrollTop=0;
  }
  function renderMetrics(){
    const result=knownResult();$('return-value').textContent=result?pct(result.rtp):'Not solved';$('lab-rtp').textContent=result?pct(result.rtp):'Not solved';$('analysis-badge').textContent=isOriginal()?'Original paytable':v.doubleOnDraw?'Double on draw':'Custom rules / paytable';
    $('lab-result').textContent=result?`Net EV: ${result.netEV>=0?'+':''}${fmt(result.netEV,6)} credits / initial deal. ${result.rtp<=1?'House':'Player'} edge: ${pct(Math.abs(1-result.rtp))} of total stakes. ${result.deals.toLocaleString()} starting hands solved.`:'Apply your settings, then solve the full game to calculate its exact perfect-play return.';
    $('double-metrics').hidden=!v.doubleOnDraw;
    $('double-metrics').innerHTML=v.doubleOnDraw&&result?`<div><span>Optimal to double</span><strong id="double-frequency">${pct(result.doubleFrequency)}</strong></div><div><span>Average stake / deal</span><strong>${fmt(result.averageStake,6)}</strong></div><div><span>Expected return / deal</span><strong>${fmt(result.expectedReturn,6)}</strong></div><p>Double on ${result.doubleCount.toLocaleString()} of ${result.deals.toLocaleString()} deals. An additional ${pct(result.doubleTieFrequency)} tie between doubling and single stake; use single stake on ties. RTP divides expected return by average total stake. Strategy maximizes net profit per initial deal.</p>`:v.doubleOnDraw?'<p>Solve to see the optimal double frequency and average stake.</p>':'';
  }
  function renderControls(){const active=phase==='draw';$('variant').disabled=active;$('deal').disabled=false;$('deal').innerHTML=active?'Draw cards <span aria-hidden="true">→</span>':'Deal hand <span aria-hidden="true">→</span>';$('solve-hand').disabled=busy||hand.length!==5;$('solve-hand').textContent=phase==='complete'?'Review decision':'Solve hand';$('hold-best').disabled=busy||!rows||!['draw','study'].includes(phase);$('spot-hand').disabled=active;$('spot-form').querySelector('button').disabled=active;$('pay-form').querySelector('button[type=submit]').disabled=active;$('reset-pays').disabled=active;for(const select of document.querySelectorAll('#qualification-rules select,#draw-rules select'))select.disabled=active||(select.id==='rule-badugi-rank'&&$('rule-min-badugi').value==='0');
    $('double-draw').hidden=!v.doubleOnDraw||!active;$('double-draw').disabled=!active||mask===31;$('double-draw').title=mask===31?'Release at least one card to double.':'Add 1 credit, double the final return, and draw.';
    document.querySelectorAll('[data-recommend]').forEach(b=>b.disabled=active);$('pnl').textContent=(pnl>0?'+':'')+fmt(pnl);$('hands-played').textContent=hands;
  }
  function renderHand(animate=false){const canHold=['draw','study'].includes(phase);document.querySelector('.machine').classList.toggle('complete',phase==='complete');$('hand').classList.remove('dealt');$('hand').innerHTML=Array.from({length:5},(_,i)=>`<div class="card-slot${mask&(1<<i)?' held':''}" style="--i:${i}">${PlayingCards.html(hand.length?E.cardText(hand[i]):'BACK',{tag:canHold?'button':'span',interactive:canHold,pressed:canHold?!!(mask&(1<<i)):undefined,selected:!!(mask&(1<<i)),attrs:canHold?{'data-card':i}:{},title:canHold?'Hold or release card '+(i+1):undefined})}<span class="hold-label">${mask&(1<<i)?'HELD':canHold?'HOLD':' '}</span></div>`).join('');if(animate){void $('hand').offsetWidth;$('hand').classList.add('dealt');}
    $('hold-instruction').textContent=phase==='draw'?(v.doubleOnDraw?'Draw at 1×, or add 1 credit and double. Release at least one card to double.':'Select your holds, then draw once.'):phase==='study'?'Study hand · no credit wagered. Deal starts a random hand.':phase==='complete'?'Hand complete. Deal again when you’re ready.':'Deal a hand to begin.';renderControls();
  }
  function toggleHold(i){if(!['draw','study'].includes(phase))return;mask^=1<<i;renderHand();renderStrategy();}
  $('hand').onclick=e=>{const b=e.target.closest('[data-card]');if(b)toggleHold(+b.dataset.card);};
  function random(){const a=new Uint32Array(1);crypto.getRandomValues(a);return a[0]/4294967296;}
  function completeDraw(doubled=false){
    if(phase!=='draw'||(doubled&&(!v.doubleOnDraw||mask===31)))return;
    cancel();announce('');const stake=doubled?2:1;pnl-=stake-1;
    review={hand:[...hand],mask,doubled};strategyHand=[...hand];$('strategy-title').textContent='Decision review';
    hand=E.draw(hand,mask,deck);const result=E.evaluate(hand,v);const returned=stake*result.payout;pnl+=returned;hands++;phase='complete';mask=0;renderHand(true);$('hand-status').textContent=returned===0?'You lose':returned===stake?'Push':'Won +'+fmt(returned-stake);
    document.querySelectorAll('[data-pay]').forEach(el=>el.classList.toggle('paying',result.keys.includes(el.dataset.pay)));if(rows)renderStrategy();else run('hand');
  }
  $('double-draw').onclick=()=>completeDraw(true);
  $('deal').onclick=()=>{if(phase==='draw'){completeDraw();return;}cancel();announce('');
    const shuffled=E.shuffledDeck(v.deckSize,random);hand=shuffled.slice(0,5);deck=shuffled.slice(5);pnl-=1;mask=0;phase='draw';clearStrategy();renderHand(true);$('hand-status').textContent='Choose your hold';document.querySelectorAll('[data-pay]').forEach(el=>el.classList.remove('paying'));
  };
  function describe(m,h=strategyHand){return m===0?'Draw five':m===31?'Hold all five':h.filter((_,i)=>m&(1<<i)).map(E.cardText).join(' ');}
  function decisionLabel(r){return describe(r.mask)+(r.doubled?' · 2×':'');}
  function displayEV(r){return v.doubleOnDraw?r.netEV:r.ev;}
  function formatEV(r){const n=displayEV(r);return (v.doubleOnDraw&&n>0?'+':'')+fmt(n,6)+(v.doubleOnDraw?'':'×');}
  function renderStrategy(){
    if(!rows)return;
    const selectedMask=review?review.mask:mask,selected=rows.find(r=>r.mask===selectedMask&&r.doubled===!!(review?.doubled)),best=rows[0];
    $('decision-summary').hidden=!review;
    if(review){
      const loss=Math.max(0,best.ev-selected.ev);
      $('strategy-title').textContent='Decision review';
      $('strategy-status').textContent=`Original deal: ${strategyHand.map(E.cardText).join(' ')}. `+(v.doubleOnDraw?'EV is expected net profit after subtracting the full 1- or 2-credit stake, before the draw.':'EV is expected return per credit, including your stake, before the draw.');
      $('decision-summary').innerHTML=`<div><span>Your decision ${v.doubleOnDraw?'net ':''}EV</span><strong id="decision-ev" data-ev="${displayEV(selected)}">${formatEV(selected)}</strong><small>${decisionLabel(selected)}</small></div><div><span>Best decision ${v.doubleOnDraw?'net ':''}EV</span><strong id="best-decision-ev" data-ev="${displayEV(best)}">${formatEV(best)}</strong><small>${decisionLabel(best)}</small></div><div><span>EV given up</span><strong id="decision-loss" data-ev="${loss}">${fmt(loss,6)}</strong><small>${loss<1e-10?'Optimal decision':'credits / initial deal'}</small></div>`;
    }else{
      const doubleHold=rows.find(r=>r.mask===mask&&r.doubled);
      $('strategy-status').textContent=`Best: ${decisionLabel(best)} · ${formatEV(best)} ${v.doubleOnDraw?'net credits / initial deal':'returned / credit'}. Your hold: ${formatEV(selected)}.`+(doubleHold?` At 2×: ${formatEV(doubleHold)} net.`:'');
    }
    const visible=showAll?[...rows]:rows.slice(0,5);
    if(review&&!showAll&&!visible.includes(selected))visible.push(selected);
    $('strategy-results').innerHTML=visible.map(r=>{
      const optimal=Math.abs(r.ev-best.ev)<1e-10,chosen=!!review&&r===selected;
      return `<div class="strategy-row${optimal?' best':''}${chosen?' chosen':''}" data-mask="${r.mask}" data-doubled="${r.doubled}"><span class="choice"><span class="rank">${rows.indexOf(r)+1}</span><span>${decisionLabel(r)}${chosen?'<small class="decision-marker">Your decision</small>':''}</span></span><span class="ev">${formatEV(r)}<small>${optimal?(v.doubleOnDraw?'best net EV':'best return'):'−'+fmt(best.ev-r.ev,6)}</small></span></div>`;
    }).join('');
    $('show-all').hidden=false;$('show-all').textContent=showAll?'Show top 5':v.doubleOnDraw?`Show all ${rows.length} decisions`:'Show all 32 holds';renderControls();
  }
  $('show-all').onclick=()=>{showAll=!showAll;renderStrategy();};
  function run(kind){const queryHand=[...(review?review.hand:hand)];cancel();busy=true;renderControls();const id=++request;$('solve-all').disabled=true;$('cancel-solve').hidden=false;$('solve-progress').hidden=false;$('solve-progress').value=0;const status=kind==='all'?$('solve-status'):$('strategy-status');status.textContent=kind==='hand'&&review?'Reviewing your draw decision…':'Starting exact solver…';
    try{worker=new Worker('./worker.js?v=20261020-5');worker.onerror=error=>{if(id!==request)return;finishError(error.message||'The solver could not start. Reload the page and try again.');};worker.onmessage=({data})=>{if(data.id!==request)return;if(data.error){finishError(data.error);return;}if(data.progress!==undefined){status.textContent=data.stage+' · '+Math.round(data.progress*100)+'%';$('solve-progress').value=data.progress;return;}busy=false;$('cancel-solve').hidden=true;$('solve-progress').hidden=true;$('solve-all').disabled=false;
      if(kind==='all'){liveResult=data.result;renderMetrics();document.querySelector('.analysis-column').scrollTop=0;status.textContent='Complete. Every hold was re-optimized for these rules and payouts.';}else{rows=data.result;strategyHand=queryHand;renderStrategy();}worker.terminate();worker=null;renderControls();};worker.postMessage({id,kind,variant:v,hand:queryHand});}
    catch(error){finishError(error.message);}
    function finishError(message){cancel();status.textContent=message;announce(message);}
  }
  $('solve-hand').onclick=()=>run('hand');$('solve-all').onclick=()=>run('all');$('cancel-solve').onclick=()=>{cancel();$('solve-status').textContent='Calculation canceled.';$('strategy-status').textContent=rows?'Previous solution retained.':'Calculation canceled. You can try again.';};
  $('hold-best').onclick=()=>{if(rows){mask=rows[0].mask;renderHand();renderStrategy();if(v.doubleOnDraw)announce(rows[0].doubled?'Best hold selected. Use Double & draw for the optimal stake.':'Best hold selected. Use Draw cards at the single stake.');}};
  $('spot-form').onsubmit=e=>{e.preventDefault();if(phase==='draw')return;try{const h=E.parseHand($('spot-hand').value,v.deckSize);cancel();hand=h;deck=[];mask=0;phase='study';clearStrategy();renderHand();$('hand-status').textContent='Study a specific hand';announce('');run('hand');}catch(error){announce(error.message);}};
  function persist(){try{const key=variantKey(v.id,v.doubleOnDraw);saved[key]=v.pays;if(v.id==='badeucey')savedRules[key]=v.rules;localStorage.setItem(storedKey,JSON.stringify(saved));localStorage.setItem(rulesKey,JSON.stringify(savedRules));return true;}catch{return false;}}
  function apply(pays,rules=v.rules,doubleOnDraw=!!v.doubleOnDraw){if(phase==='draw'){announce('Finish the current draw before changing the game.');return;}cancel();v={...v,pays,doubleOnDraw:isCustom(v.id)&&doubleOnDraw,...(v.id==='badeucey'?{rules:E.normalizeBadeuceyRules(rules)}:{})};liveResult=null;clearStrategy();phase='idle';hand=[];mask=0;const kept=persist();renderConfig();renderHand();$('hand-status').textContent='Five cards. One decision.';announce(kept?'Settings applied and saved in this browser.':'Settings applied for this session; browser storage is unavailable.');}
  $('pay-form').onsubmit=e=>{e.preventDefault();const pays={};for(const input of $('pay-editor').querySelectorAll('input')){if(input.value.trim()===''){announce('Enter a payout for every category.');return;}const n=Number(input.value);if(!Number.isInteger(n)||n<0||n>1000000){announce('Payouts must be whole numbers between 0 and 1,000,000.');return;}pays[input.dataset.key]=n;}const rules=v.id==='badeucey'?{fiveCard:$('rule-five-card').value,minBadugi:Number($('rule-min-badugi').value),maxLowRank:Number($('rule-low-rank').value),maxBadugiRank:Number($('rule-badugi-rank').value)}:undefined;apply(pays,rules,$('rule-double')?.value==='true');};
  $('reset-pays').onclick=()=>apply({...E.byId[v.id].pays},E.byId[v.id].rules,!!v.doubleOnDraw);
  $('pay-form').oninput=()=>{renderControls();$('edit-status').textContent='Unapplied changes. Apply settings to use them in play and the solver.';};
  function renderRecommendations(){
    if(!report)return;
    $('recommendations').innerHTML=['low27','badeucey'].map(id=>`<section class="option-family"><h3>${E.byId[id].name}</h3>${[false,true].map(doubled=>`<details class="option-mode"${doubled?'':' open'}><summary>${doubled?'Optional double on draw':'Single stake'} · ${report.recommendations.filter(r=>r.id===id&&!!r.doubleOnDraw===doubled).length} options</summary>${report.recommendations.filter(r=>r.id===id&&!!r.doubleOnDraw===doubled).map(rec=>`<article class="recommendation"><h4>${rec.name||'Balanced'}</h4><div class="return-comparison">${pct(rec.result.rtp)} RTP</div><p>Net EV ${rec.result.netEV>=0?'+':''}${fmt(rec.result.netEV,6)} / initial deal${doubled?` · Double ${pct(rec.result.doubleFrequency)} of deals`:''}.</p><p>${rec.summary}</p><p>${rec.rationale}</p><button class="text-button" data-recommend="${rec.key||rec.id}">Use ${rec.name||'balanced'} →</button></article>`).join('')}</details>`).join('')}</section>`).join('');
    document.querySelectorAll('[data-recommend]').forEach(b=>b.onclick=()=>{
      if(phase==='draw')return;
      const rec=report.recommendations.find(r=>(r.key||r.id)===b.dataset.recommend);
      selectVariant(variantKey(rec.id,rec.doubleOnDraw));apply({...E.byId[rec.id].pays,...rec.pays},rec.rules||E.byId[rec.id].rules,!!rec.doubleOnDraw);liveResult=rec.result;renderMetrics();setView('lab');
    });renderControls();
  }
  document.addEventListener('keydown',e=>{if(e.repeat||e.altKey||e.ctrlKey||e.metaKey||e.target.closest('input,select,textarea')||$('view-play').hidden)return;if(/^[1-5]$/.test(e.key)){e.preventDefault();toggleHold(+e.key-1);}if(e.code==='Space'&&!e.target.closest('button,summary,a')){e.preventDefault();$('deal').click();}});
  selectVariant('jacks');
  fetch('./analysis.json?v=20261021').then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{report=data;renderMetrics();renderRecommendations();}).catch(()=>{$('recommendations').textContent='Saved analysis could not load. Use “Solve full game” to calculate any paytable locally.';});
})();
