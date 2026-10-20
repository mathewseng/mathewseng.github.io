/* UI state is isolated from evaluators and the worker's exhaustive solver. */
(() => {
  'use strict';
  const E=VideoPoker,$=id=>document.getElementById(id),fmt=(n,d=3)=>Number(n.toFixed(d)).toLocaleString('en-US',{maximumFractionDigits:d}),pct=n=>(n*100).toFixed(4)+'%';
  const clone=v=>JSON.parse(JSON.stringify(v));
  const storedKey='video-poker-paytables-v1';let saved={};try{saved=JSON.parse(localStorage.getItem(storedKey)||'{}');if(!saved||typeof saved!=='object')saved={};}catch{}
  let v=clone(E.byId.jacks),phase='idle',hand=[],deck=[],mask=0,credits=100,hands=0,lastReturn=null,rows=null,strategyHand=[],showAll=false,worker=null,request=0,busy=false,report=null,liveResult=null;
  const families=[...new Set(E.variants.map(x=>x.family))];
  $('variant').innerHTML=families.map(f=>`<optgroup label="${f}">${E.variants.filter(x=>x.family===f).map(x=>`<option value="${x.id}">${x.name}</option>`).join('')}</optgroup>`).join('');
  function configFor(id){const result=clone(E.byId[id]),p=saved[id];if(p&&Object.keys(result.pays).every(k=>Number.isFinite(p[k])&&p[k]>=0&&p[k]<=1000000)&&(id!=='badeucey'||p.qualify===1))result.pays={...p};return result;}
  function isOriginal(){return Object.keys(E.byId[v.id].pays).every(k=>v.pays[k]===E.byId[v.id].pays[k]);}
  function knownResult(){return liveResult||(isOriginal()?report?.originals[v.id]:null);}
  function announce(message){$('global-status').textContent=message;}
  function setView(view){for(const b of document.querySelectorAll('[data-view]')){const selected=b.dataset.view===view;b.classList.toggle('active',selected);b.setAttribute('aria-pressed',selected);}for(const name of ['play','lab','rules'])$('view-'+name).hidden=name!==view;}
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
  $('open-lab').onclick=()=>setView('lab');
  function cancel(){request++;if(worker){worker.terminate();worker=null;}busy=false;$('solve-progress').hidden=true;$('cancel-solve').hidden=true;$('solve-all').disabled=false;renderControls();}
  function clearStrategy(){rows=null;strategyHand=[];showAll=false;$('strategy-results').replaceChildren();$('strategy-status').textContent='Solve a hand to compare the exact return of every hold.';$('show-all').hidden=true;}
  function selectVariant(id){cancel();v=configFor(id);liveResult=null;phase='idle';hand=[];deck=[];mask=0;clearStrategy();$('variant').value=id;renderConfig();renderHand();$('hand-status').textContent='Five cards. One decision.';announce('');}
  $('variant').onchange=()=>selectVariant($('variant').value);
  function label(k){if(k==='highPair')return v.pairMin===10?'Tens or better':v.pairMin===13?'Kings or better':E.labels[k];if(k==='quads'&&v.pays.aces!==undefined)return v.pays.faceQuads!==undefined?'Four 5s–Ts':'Four 5s–Ks';if(k==='fiveKind'&&v.pays.fiveLow!==undefined)return 'Five 6s–Ks';return E.labels[k];}
  function payEntries(){const order=['royal','deucesAce','deuces','fiveAces','fiveLow','wildRoyal','fiveKind','straightFlush','acesKicker','lowKicker','aces','faceQuads','lowQuads','quads','fullHouse','flush','straight','trips','twoPair','highPair','qualify','wheel','low7','low8','low9','lowT','lowJ','bad5','bad6','bad7','bad8','bad9'];return order.filter(k=>v.pays[k]!==undefined);}
  function renderConfig(){
    $('variant-subtitle').textContent=isOriginal()?v.subtitle:'Custom paytable';$('variant-family').textContent=v.family+' · '+v.deckSize+' cards';
    const badeucey=v.id==='badeucey';$('paytable-unit').textContent=badeucey?'Push + points':'Return / 1 credit';
    let html='<table><tbody>';
    for(const k of payEntries()){if(badeucey&&k==='wheel')html+='<tr class="group-label"><th colspan="2">Low points · best category only</th></tr>';if(badeucey&&k==='bad5')html+='<tr class="group-label"><th colspan="2">Badugi points · best category only</th></tr>';html+=`<tr data-pay="${k}"><th scope="row">${label(k)}</th><td>${fmt(v.pays[k])}${badeucey&&k!=='qualify'?'':'×'}</td></tr>`;}
    $('paytable').innerHTML=html+'</tbody></table>';
    $('paytable-note').textContent=badeucey?'Five-card high card AND four-card badugi required. Return = 1 + low points + badugi points. Aces high.':v.id==='low27'?'Aces high. Pairs, straights and flushes lose. Only the best category pays; returns include your stake.':'One category pays. Returns include your stake. Royal payout uses the max-coin rate, normalized to one credit.';
    $('pay-editor').innerHTML=payEntries().map(k=>`<div class="pay-input"><label for="pay-${k}">${label(k)}</label><input id="pay-${k}" data-key="${k}" type="number" min="0" max="1000000" step="0.001" value="${v.pays[k]}" required${badeucey&&k==='qualify'?' disabled':''} /></div>`).join('');
    $('editor-note').textContent=badeucey?'The 1-credit qualifying push stays fixed. Edit the low and badugi point awards.':'Edit total returns per credit. Categories follow the game’s ranking; only one category pays.';
    $('edit-status').textContent=phase==='draw'?'Finish your current draw before changing payouts.':'';
    $('solve-status').textContent='';renderMetrics();renderControls();document.querySelector('.analysis-column').scrollTop=0;document.querySelector('.editor-panel').scrollTop=0;
  }
  function renderMetrics(){const result=knownResult();$('return-value').textContent=result?pct(result.rtp):'Not solved';$('lab-rtp').textContent=result?pct(result.rtp):'Not solved';$('analysis-badge').textContent=isOriginal()?'Original paytable':'Custom paytable';$('lab-result').textContent=result?`Net EV: ${result.netEV>=0?'+':''}${fmt(result.netEV,6)} credits / bet. ${result.rtp<=1?'House':'Player'} edge: ${pct(Math.abs(1-result.rtp))}. ${result.deals.toLocaleString()} starting hands solved.`:'Apply your payouts, then solve the full game to calculate its exact perfect-play return.';}
  function renderControls(){const active=phase==='draw';$('variant').disabled=active;$('deal').disabled=false;$('deal').innerHTML=active?'Draw cards <span aria-hidden="true">→</span>':credits<1?'Refill credits':'Deal hand <span aria-hidden="true">→</span>';$('solve-hand').disabled=busy||hand.length!==5||phase==='complete';$('hold-best').disabled=busy||!rows||!['draw','study'].includes(phase);$('spot-hand').disabled=active;$('spot-form').querySelector('button').disabled=active;$('pay-form').querySelector('button[type=submit]').disabled=active;$('reset-pays').disabled=active;
    document.querySelectorAll('[data-recommend]').forEach(b=>b.disabled=active);$('credits').textContent=fmt(credits);$('hands-played').textContent=hands;$('last-return').textContent=lastReturn===null?'—':fmt(lastReturn);
  }
  function renderHand(animate=false){const canHold=['draw','study'].includes(phase);$('hand').classList.remove('dealt');$('hand').innerHTML=Array.from({length:5},(_,i)=>`<div class="card-slot${mask&(1<<i)?' held':''}" style="--i:${i}">${PlayingCards.html(hand.length?E.cardText(hand[i]):'BACK',{tag:canHold?'button':'span',interactive:canHold,pressed:canHold?!!(mask&(1<<i)):undefined,selected:!!(mask&(1<<i)),attrs:canHold?{'data-card':i}:{},title:canHold?'Hold or release card '+(i+1):undefined})}<span class="hold-label">${mask&(1<<i)?'HELD':canHold?'HOLD':' '}</span></div>`).join('');if(animate){void $('hand').offsetWidth;$('hand').classList.add('dealt');}
    $('hold-instruction').textContent=phase==='draw'?'Select your holds, then draw once.':phase==='study'?'Study hand · no credit wagered. Deal starts a random hand.':phase==='complete'?'Hand complete. Deal again when you’re ready.':'Deal a hand to begin.';renderControls();
  }
  function toggleHold(i){if(!['draw','study'].includes(phase))return;mask^=1<<i;renderHand();renderStrategy();}
  $('hand').onclick=e=>{const b=e.target.closest('[data-card]');if(b)toggleHold(+b.dataset.card);};
  function random(){const a=new Uint32Array(1);crypto.getRandomValues(a);return a[0]/4294967296;}
  $('deal').onclick=()=>{cancel();announce('');if(phase==='draw'){
    hand=E.draw(hand,mask,deck);const result=E.evaluate(hand,v);credits+=result.payout;lastReturn=result.payout;hands++;phase='complete';mask=0;renderHand(true);$('hand-status').textContent=result.payout?`${result.label} · ${fmt(result.payout)} returned`:result.label+' · 0 returned';
    document.querySelectorAll('[data-pay]').forEach(el=>el.classList.toggle('paying',result.keys.includes(el.dataset.pay)));clearStrategy();$('strategy-status').textContent='Hand complete. Solve your next deal before drawing to compare holds.';
  }else if(credits<1){credits=100;lastReturn=null;hands=0;renderControls();announce('Refilled to 100 practice credits.');}else{
    const shuffled=E.shuffledDeck(v.deckSize,random);hand=shuffled.slice(0,5);deck=shuffled.slice(5);credits-=1;mask=0;phase='draw';clearStrategy();renderHand(true);$('hand-status').textContent='Choose your hold';document.querySelectorAll('[data-pay]').forEach(el=>el.classList.remove('paying'));
  }};
  function describe(m,h=strategyHand){return m===0?'Draw five':m===31?'Hold all five':h.filter((_,i)=>m&(1<<i)).map(E.cardText).join(' ');}
  function renderStrategy(){if(!rows)return;const selected=rows.find(r=>r.mask===mask),best=rows[0];$('strategy-status').textContent=`Best: ${describe(best.mask)} · ${fmt(best.ev,6)} returned / credit.${selected?` Your hold: ${fmt(selected.ev,6)} (${fmt(Math.max(0,best.ev-selected.ev),6)} EV given up).`:''}`;
    $('strategy-results').innerHTML=(showAll?rows:rows.slice(0,5)).map((r,i)=>`<div class="strategy-row${Math.abs(r.ev-best.ev)<1e-10?' best':''}"><span class="choice"><span class="rank">${i+1}</span><span>${describe(r.mask)}</span></span><span class="ev">${fmt(r.ev,6)}×<small>${i===0?'best return':'−'+fmt(best.ev-r.ev,6)}</small></span></div>`).join('');$('show-all').hidden=false;$('show-all').textContent=showAll?'Show top 5':'Show all 32 holds';renderControls();
  }
  $('show-all').onclick=()=>{showAll=!showAll;renderStrategy();};
  function run(kind){cancel();busy=true;renderControls();const id=++request;$('solve-all').disabled=true;$('cancel-solve').hidden=false;$('solve-progress').hidden=false;$('solve-progress').value=0;const status=kind==='all'?$('solve-status'):$('strategy-status');status.textContent='Starting exact solver…';
    try{worker=new Worker('./worker.js?v=20261020');worker.onerror=error=>{if(id!==request)return;finishError(error.message||'The solver could not start. Reload the page and try again.');};worker.onmessage=({data})=>{if(data.id!==request)return;if(data.error){finishError(data.error);return;}if(data.progress!==undefined){status.textContent=data.stage+' · '+Math.round(data.progress*100)+'%';$('solve-progress').value=data.progress;return;}busy=false;$('cancel-solve').hidden=true;$('solve-progress').hidden=true;$('solve-all').disabled=false;
      if(kind==='all'){liveResult=data.result;renderMetrics();document.querySelector('.analysis-column').scrollTop=0;status.textContent='Complete. Every hold was re-optimized for this paytable.';}else{rows=data.result;strategyHand=[...hand];renderStrategy();}worker.terminate();worker=null;renderControls();};worker.postMessage({id,kind,variant:v,hand});}
    catch(error){finishError(error.message);}
    function finishError(message){cancel();status.textContent=message;announce(message);}
  }
  $('solve-hand').onclick=()=>run('hand');$('solve-all').onclick=()=>run('all');$('cancel-solve').onclick=()=>{cancel();$('solve-status').textContent='Calculation canceled.';$('strategy-status').textContent=rows?'Previous solution retained.':'Calculation canceled. You can try again.';};
  $('hold-best').onclick=()=>{if(rows){mask=rows[0].mask;renderHand();renderStrategy();}};
  $('spot-form').onsubmit=e=>{e.preventDefault();if(phase==='draw')return;try{const h=E.parseHand($('spot-hand').value,v.deckSize);cancel();hand=h;deck=[];mask=0;phase='study';clearStrategy();renderHand();$('hand-status').textContent='Study a specific hand';announce('');run('hand');}catch(error){announce(error.message);}};
  function persist(){try{saved[v.id]=v.pays;localStorage.setItem(storedKey,JSON.stringify(saved));return true;}catch{return false;}}
  function apply(pays){if(phase==='draw'){announce('Finish the current draw before changing the game.');return;}cancel();v={...v,pays};liveResult=null;clearStrategy();phase='idle';hand=[];mask=0;const kept=persist();renderConfig();renderHand();$('hand-status').textContent='Five cards. One decision.';announce(kept?'Paytable applied and saved in this browser.':'Paytable applied for this session; browser storage is unavailable.');}
  $('pay-form').onsubmit=e=>{e.preventDefault();const pays={};for(const input of $('pay-editor').querySelectorAll('input')){if(input.value.trim()===''){announce('Enter a payout for every category.');return;}const n=Number(input.value);if(!Number.isFinite(n)||n<0||n>1000000){announce('Payouts must be between 0 and 1,000,000.');return;}pays[input.dataset.key]=n;}apply(pays);};
  $('reset-pays').onclick=()=>apply({...E.byId[v.id].pays});
  function renderRecommendations(){if(!report)return;$('recommendations').innerHTML=report.recommendations.map(rec=>`<article class="recommendation"><h3>${E.byId[rec.id].name}</h3><div class="return-comparison">${pct(report.originals[rec.id].rtp)} → ${pct(rec.result.rtp)}</div><p>${rec.summary}</p><p>${rec.rationale}</p><button class="text-button" data-recommend="${rec.id}">Try this paytable →</button></article>`).join('');document.querySelectorAll('[data-recommend]').forEach(b=>b.onclick=()=>{if(phase==='draw')return;const rec=report.recommendations.find(r=>r.id===b.dataset.recommend);selectVariant(rec.id);apply({...rec.pays});liveResult=rec.result;renderMetrics();setView('lab');});renderControls();}
  document.addEventListener('keydown',e=>{if(e.repeat||e.altKey||e.ctrlKey||e.metaKey||e.target.closest('input,select,textarea')||$('view-play').hidden)return;if(/^[1-5]$/.test(e.key)){e.preventDefault();toggleHold(+e.key-1);}if(e.code==='Space'&&!e.target.closest('button,summary,a')){e.preventDefault();$('deal').click();}});
  selectVariant('jacks');
  fetch('./analysis.json?v=20261020').then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{report=data;renderMetrics();renderRecommendations();}).catch(()=>{$('recommendations').textContent='Saved analysis could not load. Use “Solve full game” to calculate any paytable locally.';});
})();
