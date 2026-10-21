/* Accessible game browser. The hidden select remains the shared selection state. */
window.VideoPokerGamePicker={create({selections,select,onSelect}){
 const $=id=>document.getElementById(id),dialog=$('game-picker'),trigger=$('game-picker-open'),search=$('game-search'),results=$('game-results'),filters=$('game-filters');
 const families=['All',...new Set(selections.map(x=>x.family).sort((a,b)=>['Custom variants','Cribbage','Classic','Bonus','Wild cards'].indexOf(a)-['Custom variants','Cribbage','Classic','Bonus','Wild cards'].indexOf(b)))];
 let family='All';
 const searchable=value=>value.toLocaleLowerCase().replace(/[–—−]/g,'-').replace(/×/g,'x');
 const description=x=>x.id.startsWith('cribbage')?`${x.id.slice(-1)} cards · ${x.payout==='net'?(x.doubled?'Lose up to twice the fee':'Lose up to the fee'):'Lose up to '+(x.doubled?2:1)}`:x.id==='badeucey'?'Lowball + badugi · push to qualify':x.id==='low27'?'Aces high · no pairs, straights or flushes':VideoPoker.byId[x.id].subtitle;
 filters.replaceChildren(...families.map(name=>{const b=document.createElement('button');b.type='button';b.textContent=name;b.dataset.family=name;b.setAttribute('aria-pressed',String(name===family));b.onclick=()=>{family=name;render();};return b;}));
 function render(){
  const query=searchable(search.value.trim()),matches=selections.filter(x=>(family==='All'||x.family===family)&&searchable(`${x.key} ${x.name} ${x.family} ${VideoPoker.byId[x.id].name} ${description(x)}`).includes(query));
  for(const b of filters.children)b.setAttribute('aria-pressed',String(b.dataset.family===family));
  results.replaceChildren();
  for(const group of families.slice(1)){
   const choices=matches.filter(x=>x.family===group);if(!choices.length)continue;
   const section=document.createElement('section'),heading=document.createElement('h3'),list=document.createElement('div');heading.textContent=group;list.className='game-choices';section.append(heading,list);
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
 trigger.onclick=()=>{family='All';search.value='';render();dialog.showModal();trigger.setAttribute('aria-expanded','true');(matchMedia('(pointer:coarse)').matches||innerWidth<=600?$('game-picker-close'):search).focus({preventScroll:true});};
 $('game-picker-close').onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>{trigger.setAttribute('aria-expanded','false');trigger.focus({preventScroll:true});});
 // A click on the actual backdrop closes; drags starting inside the panel do not.
 let backdrop=false;dialog.addEventListener('pointerdown',e=>{backdrop=e.target===dialog&&outside(e);});dialog.addEventListener('click',e=>{if(backdrop&&e.target===dialog&&outside(e))dialog.close();backdrop=false;});
 function outside(e){const r=dialog.getBoundingClientRect();return e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom;}
 search.addEventListener('input',render);
 dialog.addEventListener('keydown',e=>{
  if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return;
  const buttons=[...results.querySelectorAll('button:not(:disabled)')];if(!buttons.length)return;
  const current=buttons.indexOf(document.activeElement);if(current<0&&document.activeElement!==search)return;
  if(document.activeElement===search&&!e.key.startsWith('Arrow'))return;
  e.preventDefault();let next=e.key==='Home'?0:e.key==='End'?buttons.length-1:current<0?(e.key==='ArrowDown'?0:buttons.length-1):(current+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[next].focus();
 });
 return {sync};
}};
