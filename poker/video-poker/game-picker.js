/* Accessible game browser. The hidden select remains the shared selection state. */
window.VideoPokerGamePicker={create({selections,select,onSelect}){
 const $=id=>document.getElementById(id),dialog=$('game-picker'),trigger=$('game-picker-open'),search=$('game-search'),results=$('game-results'),filters=$('game-filters');
 const families=['All',...new Set(selections.map(x=>x.family).sort((a,b)=>['Custom variants','Cribbage','Classic','Bonus','Wild cards'].indexOf(a)-['Custom variants','Cribbage','Classic','Bonus','Wild cards'].indexOf(b)))];
 let family='All';
 const searchable=value=>value.toLocaleLowerCase().replace(/[–—−]/g,'-').replace(/×/g,'x');
 const description=x=>x.id.startsWith('cribbage')?`${x.id.slice(-1)} cards · ${x.payout==='net'?(x.doubled?'Lose up to twice the fee':'Lose up to the fee'):'Lose up to '+(x.doubled?2:1)}`:x.id==='badeucey'?'Lowball + badugi · push to qualify':x.id==='low27'?'Aces high · no pairs, straights or flushes':VideoPoker.byId[x.id].subtitle;
 filters.replaceChildren(...families.map(name=>{const b=document.createElement('button');b.type='button';b.textContent=name;b.dataset.family=name;b.setAttribute('aria-pressed',String(name===family));b.onclick=()=>{family=name;render();};return b;}));
 function cribbageGrid(choices){
  const table=document.createElement('table');table.className='cribbage-grid';table.setAttribute('aria-label','Cribbage games by card count and payout rule');
  table.innerHTML='<thead><tr><th scope="col">Cards</th><th scope="colgroup" colspan="2">Capped loss</th><th scope="colgroup" colspan="2">Points − fee</th></tr></thead>';
  const body=document.createElement('tbody');
  for(const count of [4,5,6,7]){
   const rowChoices=choices.filter(x=>VideoPoker.byId[x.id].handSize===count);if(!rowChoices.length)continue;
   const row=document.createElement('tr'),heading=document.createElement('th');heading.scope='row';heading.innerHTML=`<strong>${count}</strong><span>cards</span>`;row.append(heading);
   for(const [column,[payout,doubled]]of [['return',false],['return',true],['net',false],['net',true]].entries()){
    const cell=document.createElement('td'),x=rowChoices.find(x=>x.payout===payout&&x.doubled===doubled);
    if(x){
     const b=document.createElement('button');b.type='button';b.className='game-choice cribbage-choice';b.dataset.game=x.key;b.dataset.cardCount=count;b.dataset.gridColumn=column;
     b.disabled=select.querySelector(`option[value="${x.key}"]`).disabled;b.setAttribute('aria-pressed',String(x.key===select.value));b.setAttribute('aria-label',`${x.name}${x.doubled?'':' · 1×'}`);b.title=`${x.name}. ${description(x)}.`;
     const stake=document.createElement('strong');stake.textContent=x.doubled?'2×':'1×';b.append(stake);
     if(x.key===select.value){const check=document.createElement('span');check.className='cribbage-selected';check.setAttribute('aria-hidden','true');check.textContent='✓';b.append(check);}
     b.onclick=()=>{if(select.value!==x.key)onSelect(x.key);dialog.close();};cell.append(b);
    }else{cell.className='cribbage-filtered';cell.textContent='—';cell.setAttribute('aria-label','Filtered out');}
    row.append(cell);
   }
   body.append(row);
  }
  table.append(body);return table;
 }
 function render(){
  const query=searchable(search.value.trim()),matches=selections.filter(x=>(family==='All'||x.family===family)&&searchable(`${x.key} ${x.name} ${x.family} ${VideoPoker.byId[x.id].name} ${description(x)}`).includes(query));
  for(const b of filters.children)b.setAttribute('aria-pressed',String(b.dataset.family===family));
  results.replaceChildren();
  for(const group of families.slice(1)){
   const choices=matches.filter(x=>x.family===group);if(!choices.length)continue;
   const section=document.createElement('section'),heading=document.createElement('h3'),list=document.createElement('div');heading.textContent=group;list.className='game-choices';section.append(heading,list);
   if(group==='Cribbage'){
    list.className='cribbage-options';list.append(cribbageGrid(choices));
    const note=document.createElement('p');note.className='cribbage-grid-note';note.textContent='Capped loss: lose up to 1. Points − fee: lose up to the fee. At 2×, gains and losses double.';list.append(note);results.append(section);continue;
   }
   for(const x of choices){
    const b=document.createElement('button');b.type='button';b.className='game-choice';b.dataset.game=x.key;b.disabled=select.querySelector(`option[value="${x.key}"]`).disabled;b.setAttribute('aria-pressed',String(x.key===select.value));
    const label=document.createElement('span'),title=document.createElement('strong'),detail=document.createElement('small'),state=document.createElement('span');
    title.textContent=x.name;detail.textContent=description(x);label.append(title,detail);state.className='game-choice-state';state.textContent=x.key===select.value?'Selected':'→';state.setAttribute('aria-hidden','true');b.append(label,state);
    b.onclick=()=>{if(select.value!==x.key)onSelect(x.key);dialog.close();};list.append(b);
   }
   results.append(section);
  }
  results.parentElement.scrollTop=0;
  $('game-empty').hidden=matches.length!==0;
  $('game-result-count').textContent=`${matches.length} ${matches.length===1?'game':'games'}`;
 }
 function sync(){const x=selections.find(x=>x.key===select.value);if(!x)return;$('game-current-name').textContent=x.name;$('game-current-family').textContent=x.family;trigger.setAttribute('aria-label',`Choose game. Current game: ${x.name}`);if(dialog.open)render();}
 trigger.onclick=()=>{family=select.value.startsWith('cribbage')?'Cribbage':'All';search.value='';render();dialog.showModal();trigger.setAttribute('aria-expanded','true');(matchMedia('(pointer:coarse)').matches||innerWidth<=600?$('game-picker-close'):search).focus({preventScroll:true});};
 $('game-picker-close').onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>{trigger.setAttribute('aria-expanded','false');trigger.focus({preventScroll:true});});
 // A click on the actual backdrop closes; drags starting inside the panel do not.
 let backdrop=false;dialog.addEventListener('pointerdown',e=>{backdrop=e.target===dialog&&outside(e);});dialog.addEventListener('click',e=>{if(backdrop&&e.target===dialog&&outside(e))dialog.close();backdrop=false;});
 function outside(e){const r=dialog.getBoundingClientRect();return e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom;}
 search.addEventListener('input',render);
 dialog.addEventListener('keydown',e=>{
  if(!['ArrowDown','ArrowUp','ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
  const buttons=[...results.querySelectorAll('button:not(:disabled)')];if(!buttons.length)return;
  const current=buttons.indexOf(document.activeElement);if(current<0&&document.activeElement!==search)return;
  if(document.activeElement===search&&!['ArrowDown','ArrowUp'].includes(e.key))return;
  if(current>=0&&buttons[current].classList.contains('cribbage-choice')&&e.key.startsWith('Arrow')){
   e.preventDefault();const origin=buttons[current],row=Number(origin.dataset.cardCount),col=Number(origin.dataset.gridColumn),horizontal=['ArrowLeft','ArrowRight'].includes(e.key),direction=['ArrowUp','ArrowLeft'].includes(e.key)?-1:1;
   const candidates=[...origin.closest('table').querySelectorAll('button:not(:disabled)')].filter(b=>horizontal?Number(b.dataset.cardCount)===row&&(Number(b.dataset.gridColumn)-col)*direction>0:Number(b.dataset.gridColumn)===col&&(Number(b.dataset.cardCount)-row)*direction>0).sort((a,b)=>horizontal?Math.abs(Number(a.dataset.gridColumn)-col)-Math.abs(Number(b.dataset.gridColumn)-col):Math.abs(Number(a.dataset.cardCount)-row)-Math.abs(Number(b.dataset.cardCount)-row));
   (candidates[0]||origin).focus();return;
  }
  if(['ArrowLeft','ArrowRight'].includes(e.key))return;
  e.preventDefault();let next=e.key==='Home'?0:e.key==='End'?buttons.length-1:current<0?(e.key==='ArrowDown'?0:buttons.length-1):(current+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[next].focus();
 });
 return {sync};
}};
