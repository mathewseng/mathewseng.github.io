/* UI state is isolated from evaluators and the worker's exhaustive solver. */
(() => {
  'use strict';
  const E=VideoPoker,$=id=>document.getElementById(id),fmt=(n,d=3)=>Number(n.toFixed(d)).toLocaleString('en-US',{maximumFractionDigits:d}),pct=n=>(n*100).toFixed(4)+'%';
  const clone=v=>JSON.parse(JSON.stringify(v));
  const storedKey='video-poker-paytables-v1';let saved={};try{saved=JSON.parse(localStorage.getItem(storedKey)||'{}');if(!saved||typeof saved!=='object')saved={};}catch{}
  const rulesKey='video-poker-rules-v1';let savedRules={};try{savedRules=JSON.parse(localStorage.getItem(rulesKey)||'{}');if(!savedRules||typeof savedRules!=='object')savedRules={};}catch{}
  let v=clone(E.byId.jacks),phase='idle',hand=[],deck=[],mask=0,credits=100,hands=0,lastReturn=null,rows=null,strategyHand=[],review=null,showAll=false,worker=null,request=0,busy=false,report=null,liveResult=null;
  const families=['Custom variants',...new Set(E.variants.filter(x=>x.family!=='Custom variants').map(x=>x.family))];
  $('variant').innerHTML=families.map(f=>`<optgroup label="${f}">${E.variants.filter(x=>x.family===f).map(x=>`<option value="${x.id}">${x.name}</option>`).join('')}</optgroup>`).join('');
  function configFor(id){
    const result=clone(E.byId[id]),p=saved[id];
    if(p){
      const merged=Object.fromEntries(Object.keys(result.pays).map(k=>[k,p[k]??result.pays[k]]));
      if(Object.values(merged).every(n=>Number.isInteger(n)&&n>=0&&n<=1000000)&&(id!=='badeucey'||merged.qualify===1))result.pays=merged;
    }
    if(id==='badeucey')try{result.rules=E.normalizeBadeuceyRules(savedRules[id]);}catch{}
    return result;
  }
  function isOriginal(){return Object.keys(E.byId[v.id].pays).every(k=>v.pays[k]===E.byId[v.id].pays[k])&&(v.id!=='badeucey'||Object.keys(E.BADEUCEY_RULES).every(k=>v.rules[k]===E.BADEUCEY_RULES[k]));}
  function knownResult(){return liveResult||(isOriginal()?report?.originals[v.id]:null);}
  function announce(message){$('global-status').textContent=message;}
  function setView(view){for(const b of document.querySelectorAll('[data-view]')){const selected=b.dataset.view===view;b.classList.toggle('active',selected);b.setAttribute('aria-pressed',selected);}for(const name of ['play','lab','rules'])$('view-'+name).hidden=name!==view;}
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
  $('open-lab').onclick=()=>setView('lab');
  function cancel(){request++;if(worker){worker.terminate();worker=null;}busy=false;$('solve-progress').hidden=true;$('cancel-solve').hidden=true;$('solve-all').disabled=false;renderControls();}
  function clearStrategy(){rows=null;strategyHand=[];review=null;showAll=false;$('strategy-title').textContent='The best decision';$('decision-summary').hidden=true;$('decision-summary').replaceChildren();$('strategy-results').replaceChildren();$('strategy-status').textContent='Solve a hand to compare the exact return of every hold.';$('show-all').hidden=true;}
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
    $('variant-subtitle').textContent=isOriginal()?v.subtitle:badeucey?'Custom rules & payouts':'Custom paytable';$('variant-family').textContent=v.family+' · '+v.deckSize+' cards';
    $('paytable-unit').textContent=badeucey?'Push + points':'Return / 1 credit';
    let html='<table>';
    for(const group of payoutGroups()){
      html+='<tbody>'+(badeucey?`<tr class="group-label"><th colspan="2">${group.name}</th></tr>`:'');
      for(const k of group.keys)html+=`<tr data-pay="${k}"><th scope="row">${label(k)}</th><td>${fmt(v.pays[k])}${badeucey&&k!=='qualify'?'':'×'}</td></tr>`;
      html+='</tbody>';
    }
    $('paytable').innerHTML=html+'</table>';
    $('paytable-note').textContent=badeucey?qualificationSummary()+' Return = 1 + low points + four-card badugi points. Best award per section only. 0 disables an award.':v.id==='low27'?'Aces high. Pairs, straights and flushes lose. Only the best category pays; returns include your stake.':'One category pays. Returns include your stake. Royal payout uses the max-coin rate, normalized to one credit.';
    const payoutInput=k=>`<div class="pay-input"><label for="pay-${k}">${label(k)}</label><input id="pay-${k}" data-key="${k}" type="number" min="0" max="1000000" step="1" value="${v.pays[k]}" required${badeucey&&k==='qualify'?' disabled':''} /></div>`;
    $('pay-editor').innerHTML=(badeucey?qualificationEditor():'')+payoutGroups().map(group=>badeucey?`<fieldset class="payout-group"><legend>${group.name}</legend>${group.keys.map(payoutInput).join('')}</fieldset>`:group.keys.map(payoutInput).join('')).join('');
    $('editor-note').textContent=badeucey?'Choose qualification rules and integer point awards. Apply your changes before playing or solving.':'Edit total returns per credit. Categories follow the game’s ranking; only one category pays.';
    $('pay-form').querySelector('button[type=submit]').textContent=badeucey?'Apply rules & payouts':'Apply paytable';
    $('edit-status').textContent=phase==='draw'?'Finish your current draw before changing payouts.':'';
    $('solve-status').textContent='';renderMetrics();renderControls();document.querySelector('.analysis-column').scrollTop=0;document.querySelector('.editor-panel').scrollTop=0;
  }
  function renderMetrics(){const result=knownResult();$('return-value').textContent=result?pct(result.rtp):'Not solved';$('lab-rtp').textContent=result?pct(result.rtp):'Not solved';$('analysis-badge').textContent=isOriginal()?'Original paytable':'Custom rules / paytable';$('lab-result').textContent=result?`Net EV: ${result.netEV>=0?'+':''}${fmt(result.netEV,6)} credits / bet. ${result.rtp<=1?'House':'Player'} edge: ${pct(Math.abs(1-result.rtp))}. ${result.deals.toLocaleString()} starting hands solved.`:'Apply your settings, then solve the full game to calculate its exact perfect-play return.';}
  function renderControls(){const active=phase==='draw';$('variant').disabled=active;$('deal').disabled=false;$('deal').innerHTML=active?'Draw cards <span aria-hidden="true">→</span>':credits<1?'Refill credits':'Deal hand <span aria-hidden="true">→</span>';$('solve-hand').disabled=busy||hand.length!==5;$('solve-hand').textContent=phase==='complete'?'Review decision':'Solve hand';$('hold-best').disabled=busy||!rows||!['draw','study'].includes(phase);$('spot-hand').disabled=active;$('spot-form').querySelector('button').disabled=active;$('pay-form').querySelector('button[type=submit]').disabled=active;$('reset-pays').disabled=active;for(const select of document.querySelectorAll('#qualification-rules select'))select.disabled=active||(select.id==='rule-badugi-rank'&&$('rule-min-badugi').value==='0');
    document.querySelectorAll('[data-recommend]').forEach(b=>b.disabled=active);$('credits').textContent=fmt(credits);$('hands-played').textContent=hands;$('last-return').textContent=lastReturn===null?'—':fmt(lastReturn);
  }
  function renderHand(animate=false){const canHold=['draw','study'].includes(phase);document.querySelector('.machine').classList.toggle('complete',phase==='complete');$('hand').classList.remove('dealt');$('hand').innerHTML=Array.from({length:5},(_,i)=>`<div class="card-slot${mask&(1<<i)?' held':''}" style="--i:${i}">${PlayingCards.html(hand.length?E.cardText(hand[i]):'BACK',{tag:canHold?'button':'span',interactive:canHold,pressed:canHold?!!(mask&(1<<i)):undefined,selected:!!(mask&(1<<i)),attrs:canHold?{'data-card':i}:{},title:canHold?'Hold or release card '+(i+1):undefined})}<span class="hold-label">${mask&(1<<i)?'HELD':canHold?'HOLD':' '}</span></div>`).join('');if(animate){void $('hand').offsetWidth;$('hand').classList.add('dealt');}
    $('hold-instruction').textContent=phase==='draw'?'Select your holds, then draw once.':phase==='study'?'Study hand · no credit wagered. Deal starts a random hand.':phase==='complete'?'Hand complete. Deal again when you’re ready.':'Deal a hand to begin.';renderControls();
  }
  function toggleHold(i){if(!['draw','study'].includes(phase))return;mask^=1<<i;renderHand();renderStrategy();}
  $('hand').onclick=e=>{const b=e.target.closest('[data-card]');if(b)toggleHold(+b.dataset.card);};
  function random(){const a=new Uint32Array(1);crypto.getRandomValues(a);return a[0]/4294967296;}
  $('deal').onclick=()=>{cancel();announce('');if(phase==='draw'){
    review={hand:[...hand],mask};strategyHand=[...hand];$('strategy-title').textContent='Decision review';
    hand=E.draw(hand,mask,deck);const result=E.evaluate(hand,v);credits+=result.payout;lastReturn=result.payout;hands++;phase='complete';mask=0;renderHand(true);$('hand-status').textContent=result.payout?`${result.label} · ${fmt(result.payout)} returned`:result.label+' · 0 returned';
    document.querySelectorAll('[data-pay]').forEach(el=>el.classList.toggle('paying',result.keys.includes(el.dataset.pay)));if(rows)renderStrategy();else run('hand');
  }else if(credits<1){credits=100;lastReturn=null;hands=0;renderControls();announce('Refilled to 100 practice credits.');}else{
    const shuffled=E.shuffledDeck(v.deckSize,random);hand=shuffled.slice(0,5);deck=shuffled.slice(5);credits-=1;mask=0;phase='draw';clearStrategy();renderHand(true);$('hand-status').textContent='Choose your hold';document.querySelectorAll('[data-pay]').forEach(el=>el.classList.remove('paying'));
  }};
  function describe(m,h=strategyHand){return m===0?'Draw five':m===31?'Hold all five':h.filter((_,i)=>m&(1<<i)).map(E.cardText).join(' ');}
  function renderStrategy(){
    if(!rows)return;
    const selectedMask=review?review.mask:mask,selected=rows.find(r=>r.mask===selectedMask),best=rows[0];
    $('decision-summary').hidden=!review;
    if(review){
      const loss=Math.max(0,best.ev-selected.ev);
      $('strategy-title').textContent='Decision review';
      $('strategy-status').textContent=`Original deal: ${strategyHand.map(E.cardText).join(' ')}. EV is expected return per credit, including your stake, before the draw.`;
      $('decision-summary').innerHTML=`<div><span>Your decision EV</span><strong id="decision-ev" data-ev="${selected.ev}">${fmt(selected.ev,6)}×</strong><small>${describe(selected.mask)}</small></div><div><span>Best decision EV</span><strong id="best-decision-ev" data-ev="${best.ev}">${fmt(best.ev,6)}×</strong><small>${describe(best.mask)}</small></div><div><span>EV given up</span><strong id="decision-loss" data-ev="${loss}">${fmt(loss,6)}</strong><small>${loss<1e-10?'Optimal decision':'credits / bet'}</small></div>`;
    }else{
      $('strategy-status').textContent=`Best: ${describe(best.mask)} · ${fmt(best.ev,6)} returned / credit.${selected?` Your hold: ${fmt(selected.ev,6)} (${fmt(Math.max(0,best.ev-selected.ev),6)} EV given up).`:''}`;
    }
    const visible=showAll?[...rows]:rows.slice(0,5);
    if(review&&!showAll&&!visible.includes(selected))visible.push(selected);
    $('strategy-results').innerHTML=visible.map(r=>{
      const optimal=Math.abs(r.ev-best.ev)<1e-10,chosen=!!review&&r.mask===review.mask;
      return `<div class="strategy-row${optimal?' best':''}${chosen?' chosen':''}" data-mask="${r.mask}"><span class="choice"><span class="rank">${rows.indexOf(r)+1}</span><span>${describe(r.mask)}${chosen?'<small class="decision-marker">Your decision</small>':''}</span></span><span class="ev">${fmt(r.ev,6)}×<small>${optimal?'best return':'−'+fmt(best.ev-r.ev,6)}</small></span></div>`;
    }).join('');
    $('show-all').hidden=false;$('show-all').textContent=showAll?'Show top 5':'Show all 32 holds';renderControls();
  }
  $('show-all').onclick=()=>{showAll=!showAll;renderStrategy();};
  function run(kind){const queryHand=[...(review?review.hand:hand)];cancel();busy=true;renderControls();const id=++request;$('solve-all').disabled=true;$('cancel-solve').hidden=false;$('solve-progress').hidden=false;$('solve-progress').value=0;const status=kind==='all'?$('solve-status'):$('strategy-status');status.textContent=kind==='hand'&&review?'Reviewing your draw decision…':'Starting exact solver…';
    try{worker=new Worker('./worker.js?v=20261020-4');worker.onerror=error=>{if(id!==request)return;finishError(error.message||'The solver could not start. Reload the page and try again.');};worker.onmessage=({data})=>{if(data.id!==request)return;if(data.error){finishError(data.error);return;}if(data.progress!==undefined){status.textContent=data.stage+' · '+Math.round(data.progress*100)+'%';$('solve-progress').value=data.progress;return;}busy=false;$('cancel-solve').hidden=true;$('solve-progress').hidden=true;$('solve-all').disabled=false;
      if(kind==='all'){liveResult=data.result;renderMetrics();document.querySelector('.analysis-column').scrollTop=0;status.textContent='Complete. Every hold was re-optimized for these rules and payouts.';}else{rows=data.result;strategyHand=queryHand;renderStrategy();}worker.terminate();worker=null;renderControls();};worker.postMessage({id,kind,variant:v,hand:queryHand});}
    catch(error){finishError(error.message);}
    function finishError(message){cancel();status.textContent=message;announce(message);}
  }
  $('solve-hand').onclick=()=>run('hand');$('solve-all').onclick=()=>run('all');$('cancel-solve').onclick=()=>{cancel();$('solve-status').textContent='Calculation canceled.';$('strategy-status').textContent=rows?'Previous solution retained.':'Calculation canceled. You can try again.';};
  $('hold-best').onclick=()=>{if(rows){mask=rows[0].mask;renderHand();renderStrategy();}};
  $('spot-form').onsubmit=e=>{e.preventDefault();if(phase==='draw')return;try{const h=E.parseHand($('spot-hand').value,v.deckSize);cancel();hand=h;deck=[];mask=0;phase='study';clearStrategy();renderHand();$('hand-status').textContent='Study a specific hand';announce('');run('hand');}catch(error){announce(error.message);}};
  function persist(){try{saved[v.id]=v.pays;localStorage.setItem(storedKey,JSON.stringify(saved));if(v.id==='badeucey'){savedRules[v.id]=v.rules;localStorage.setItem(rulesKey,JSON.stringify(savedRules));}return true;}catch{return false;}}
  function apply(pays,rules=v.rules){if(phase==='draw'){announce('Finish the current draw before changing the game.');return;}cancel();v={...v,pays,...(v.id==='badeucey'?{rules:E.normalizeBadeuceyRules(rules)}:{})};liveResult=null;clearStrategy();phase='idle';hand=[];mask=0;const kept=persist();renderConfig();renderHand();$('hand-status').textContent='Five cards. One decision.';announce(kept?'Settings applied and saved in this browser.':'Settings applied for this session; browser storage is unavailable.');}
  $('pay-form').onsubmit=e=>{e.preventDefault();const pays={};for(const input of $('pay-editor').querySelectorAll('input')){if(input.value.trim()===''){announce('Enter a payout for every category.');return;}const n=Number(input.value);if(!Number.isInteger(n)||n<0||n>1000000){announce('Payouts must be whole numbers between 0 and 1,000,000.');return;}pays[input.dataset.key]=n;}const rules=v.id==='badeucey'?{fiveCard:$('rule-five-card').value,minBadugi:Number($('rule-min-badugi').value),maxLowRank:Number($('rule-low-rank').value),maxBadugiRank:Number($('rule-badugi-rank').value)}:undefined;apply(pays,rules);};
  $('reset-pays').onclick=()=>apply({...E.byId[v.id].pays},E.byId[v.id].rules);
  $('pay-form').oninput=()=>{renderControls();$('edit-status').textContent='Unapplied changes. Apply settings to use them in play and the solver.';};
  function renderRecommendations(){if(!report)return;$('recommendations').innerHTML=report.recommendations.map(rec=>`<article class="recommendation"><h3>${E.byId[rec.id].name}</h3><div class="return-comparison">${pct(report.originals[rec.id].rtp)} → ${pct(rec.result.rtp)}</div><p>${rec.summary}</p><p>${rec.rationale}</p><button class="text-button" data-recommend="${rec.id}">Try this paytable →</button></article>`).join('');document.querySelectorAll('[data-recommend]').forEach(b=>b.onclick=()=>{if(phase==='draw')return;const rec=report.recommendations.find(r=>r.id===b.dataset.recommend);selectVariant(rec.id);apply({...E.byId[rec.id].pays,...rec.pays},rec.rules||E.byId[rec.id].rules);liveResult=rec.result;renderMetrics();setView('lab');});renderControls();}
  document.addEventListener('keydown',e=>{if(e.repeat||e.altKey||e.ctrlKey||e.metaKey||e.target.closest('input,select,textarea')||$('view-play').hidden)return;if(/^[1-5]$/.test(e.key)){e.preventDefault();toggleHold(+e.key-1);}if(e.code==='Space'&&!e.target.closest('button,summary,a')){e.preventDefault();$('deal').click();}});
  selectVariant('jacks');
  fetch('./analysis.json?v=20261020-4').then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{report=data;renderMetrics();renderRecommendations();}).catch(()=>{$('recommendations').textContent='Saved analysis could not load. Use “Solve full game” to calculate any paytable locally.';});
})();
