// SPDX-License-Identifier: GPL-3.0-or-later
import { XGReferenceBook } from "../engine/xg-reference-book.mjs";
import { RolloutOpeningBook } from "../engine/rollout-book.mjs";
import { Board } from './board.mjs';
import { OpeningGuideData, openingSummary, openingIdea, previewPosition } from './opening-guide-data.mjs';
import { moveTrace } from '../core/move-trace.mjs';
import { shareURL } from '../core/xgid.mjs';

const node = (tag,attrs={},...children) => {
  const n = document.createElement(tag);
  for (const [key,value] of Object.entries(attrs)) n.setAttribute(key,String(value));
  n.append(...children); return n;
};
const format = value => `${value>0?'+':''}${value.toFixed(3)}`;
const lossLabel = value => value===0 ? 'Best' : value<.001 ? '<0.001' : value.toFixed(3);
const diceLabel = roll => [...roll].join('–');
const rollGrid=Array.from({length:36},(_,i)=>`${Math.floor(i/6)+1}${i%6+1}`).filter(cell=>cell[0]<=cell[1]);
const canonicalRoll=cell=>[...cell].sort().reverse().join('');
const notationParts=notation=>notation.split(' ').map(part=>
  node('span',{},...part.split(/(?=[/(])/).flatMap((segment,i)=>i?[node('wbr'),segment]:[segment])));
function die(value) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 24 24'); svg.setAttribute('aria-hidden','true');
  const shape = (tag,attrs) => {
    const n = document.createElementNS(svg.namespaceURI,tag);
    for (const [key,value] of Object.entries(attrs)) n.setAttribute(key,value);
    svg.append(n);
  };
  shape('rect',{x:1,y:1,width:22,height:22,rx:5,class:'opening-die-face'});
  const pips = {1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
  for (const p of pips[value]) shape('circle',{cx:6+p%3*6,cy:6+Math.floor(p/3)*6,r:1.8});
  return svg;
}

export function openingGuide(root) {
  const $ = id => root.querySelector(`#${id}`);
  const data = new OpeningGuideData(undefined, { rolloutBook: new RolloutOpeningBook(), referenceBook: new XGReferenceBook() }), board = new Board($('opening-board'));
  const picker = $('opening-rolls'), list = $('opening-moves'), panel = $('opening-panel');
  let openings, position, mode='opening', openingRoll='31', replyRoll='31';
  let openingChoice=0, replyChoice=0, replySide=0, before=false, generation=0, pickerKey=null;
  let replyPositions;
  const credits=node('p',{class:'small muted','aria-label':'XG contributors'});picker.after(credits);
  const choice = () => mode==='opening' ? openingChoice : replyChoice;
  const status = (message,error=false) => {
    $('opening-status').textContent=message;
    $('opening-retry').hidden=!error;
    root.dataset.loading=String(!!message && !error);
    panel.inert=!!message;
    panel.setAttribute('aria-busy',String(!!message && !error));
    $('opening-before').disabled=$('opening-after').disabled=!!message;
  };
  function navigation() {
    $('opening-stage').setAttribute('aria-label','Study opening or reply');
    for (const button of $('opening-stage').querySelectorAll('button'))
      button.setAttribute('aria-pressed',String(button.dataset.stage===mode));
    $('opening-replies').disabled=!openings||openingRoll[0]===openingRoll[1];
    $('opening-replies').title=openingRoll[0]===openingRoll[1]?'Choose a standard opening to study replies.':'';
    $('opening-side').hidden=mode!=='reply';
    for(const button of $('opening-side').querySelectorAll('button'))
      button.setAttribute('aria-pressed',String(+button.dataset.side===replySide));
    $('opening-context').textContent=mode==='reply'
      ? `After ${replySide?'White':'Black'}’s ${diceLabel(openingRoll)} · ${openings.get(openingRoll).moves[openingChoice].notation}`
      : openingRoll[0]===openingRoll[1] ? 'White plays doubles from the starting position.' : 'White opens. Choose a roll, then a move.';
    $('opening-roll-label').textContent=mode==='opening' ? 'Opening roll · including doubles' : `${replySide?'Black':'White'}’s reply roll`;
    const key=mode==='opening'?'opening':`${openingRoll}:${openingChoice}:${replySide}`;
    if (pickerKey!==key) {
      pickerKey=key;replyPositions=null;
      picker.replaceChildren(...rollGrid.map(cell => {
        const roll=canonicalRoll(cell);
        const button=node('button',{type:'button',class:'opening-roll-choice','data-roll':cell,'data-canonical':roll,
          'aria-label':`${mode==='opening'?'Opening':'Reply'} roll ${diceLabel(roll)}`,
          'aria-pressed':'false'},
          node('span',{class:'opening-roll-content'},
            node('span',{class:'opening-dice'},...[...roll].map(die)),
            node('span',{class:'opening-roll-notation'}),node('span',{class:'opening-roll-idea'},'…'),
            node('span',{class:'opening-roll-alternatives',hidden:''})),
          node('span',{class:'opening-alternative-colors','aria-hidden':'true',hidden:''}));
        // Keep each unique roll in the upper-right half of the six-by-six grid.
        button.style.gridArea=`${cell[0]} / ${cell[1]}`;
        button.addEventListener('click',() => {
          if (mode==='opening') {openingRoll=roll;openingChoice=0;}
          else {replyRoll=roll;replyChoice=0;}
          before=false; refresh();
        });
        return button;
      }));
      if(mode==='opening')rollSummaries(openings);
    }
    for (const button of picker.children)
      button.setAttribute('aria-pressed',String(button.dataset.canonical===(mode==='opening'?openingRoll:replyRoll)));
  }
  function rollSummaries(positions) {
    const authors=[...new Set([...positions.values()].flatMap(p=>p.moves.map(m=>m.referenceCredit?.author).filter(Boolean)))];
    const credit=move=>move.referenceCredit?node('sup',{},`[${authors.indexOf(move.referenceCredit.author)+1}]`):'';
    credits.hidden=!authors.length;credits.textContent=authors.length?`XG contributors: ${authors.map((author,i)=>`${i+1}. ${author}`).join(' · ')}`:'';
    for(const button of picker.children){
      const p=positions.get(button.dataset.canonical);
      if(!p)continue;
      const summary=openingSummary(p,0),notation=p.moves[0].notation;
      // Keep each checker journey together where it fits, but permit natural
      // breaks before slash/count segments in narrow six-column phone cells.
      button.querySelector('.opening-roll-notation').replaceChildren(...notationParts(notation),credit(p.moves[0]));
      button.querySelector('.opening-roll-idea').textContent=summary.label.split(' + ')[0];
      button.dataset.openingKind=summary.kind;
      const alternatives=p.moves.slice(1).map((move,i)=>({...move,...openingSummary(p,i+1)}));
      const labels=button.querySelector('.opening-roll-alternatives'),colors=button.querySelector('.opening-alternative-colors');
      labels.hidden=colors.hidden=!alternatives.length;
      labels.replaceChildren(...alternatives.map(move=>node('span',{
        class:'opening-roll-alternative','data-opening-kind':move.kind,
        title:`${move.notation} · ${move.description}${move.referenceCredit?` · XG by ${move.referenceCredit.author}`:''} · ${move.loss===0?'Also best':`${lossLabel(move.loss)} equity loss`}`,
      },node('span',{class:'opening-kind-dot','aria-hidden':'true'}),
      node('span',{class:'opening-alternative-notation'},...notationParts(move.notation),credit(move)))));
      // Keep the same lower-third color segments in both layouts, including
      // when Compact hides the text to leave room beside the board.
      colors.replaceChildren(...alternatives.map(move=>node('span',{'data-opening-kind':move.kind})));
      const close=alternatives.map(move=>`${move.notation} · ${move.description}${move.referenceCredit?` · XG by ${move.referenceCredit.author}`:''}`).join('\n');
      button.setAttribute('aria-label',`${mode==='opening'?'Opening':'Reply'} roll ${diceLabel(button.dataset.canonical)}, best ${notation}. ${summary.description}${p.moves[0].referenceCredit?` · XG by ${p.moves[0].referenceCredit.author}`:''}${close?` Close alternatives: ${close}`:''}`);
      button.title=`Best: ${notation} · ${summary.description}${p.moves[0].referenceCredit?` · XG by ${p.moves[0].referenceCredit.author}`:''}${close?`\nClose alternatives:\n${close}`:''}`;
    }
  }
  function preview() {
    const move=position.moves[choice()], player=position.state.turn;
    $('opening-before').setAttribute('aria-pressed',String(before));
    $('opening-after').setAttribute('aria-pressed',String(!before));
    $('opening-caption').textContent=before ? 'Before the move' : `${move.loss===0?'Best move':'Close alternative'} · ${move.notation}`;
    const after=previewPosition(position,choice());
    board.showPreview(before?position.state:after,{
      orientation:player,numbers:true,moveHints:false,hideDice:true,
      lastMove:before?null:moveTrace(after,player,move.steps,position.state.dice),
    });
    $('opening-board').setAttribute('aria-label',`${player?'Black':'White'} · ${before?'before the move':move.notation}`);
    $('opening-idea').textContent=openingIdea(position,choice())+(move.referenceCredit?` · XG by ${move.referenceCredit.author}, ${move.referenceCredit.date}`:'');
    for (const row of list.children) row.setAttribute('aria-pressed',String(+row.dataset.choice===choice()));
    revealChoice();
    root.dataset.choice=String(choice());
    $('opening-selection').textContent=`${player?'Black':'White'} ${diceLabel(position.state.dice.join(''))}. ${before?'Before move.':`${move.notation}. ${move.loss===0?'Best move.':`${lossLabel(move.loss)} equity loss.`}`}`;
  }
  function revealChoice() {
    const selected=list.querySelector('[aria-pressed="true"]');
    if(!selected||getComputedStyle(list).overflowY!=='auto')return;
    const row=selected.getBoundingClientRect(),viewport=list.getBoundingClientRect();
    if(row.top<viewport.top)list.scrollTop+=row.top-viewport.top;
    else if(row.bottom>viewport.bottom)list.scrollTop+=row.bottom-viewport.bottom;
  }
  function showPosition() {
    const roll=mode==='opening'?openingRoll:replyRoll;
    root.dataset.mode=mode;root.dataset.roll=roll;
    const startingDouble=openingRoll[0]===openingRoll[1];
    $('opening-heading').textContent=`${mode==='opening'?(startingDouble?'White plays':'White opens'):`${replySide?'Black':'White'} replies`} ${diceLabel(roll)}`;
    $('opening-method').textContent=position.method==='reference'?'XG · published reference':position.method==='rollout'?`GNUbg rollout · ${position.trials} trials`:`GNUbg · ${position.plies} ply`;
    const source=$('opening-source');
    source.hidden=!position.reference;
    if(position.reference){source.href=position.reference.url;source.textContent='View this position in XG’s published book ↗';}
    $('opening-window').textContent=`Close = within ${position.threshold.toFixed(3)} of best`;
    $('opening-empty').hidden=position.moves.length>1;
    list.replaceChildren(...position.moves.map((move,i) => {
      const row=node('button',{type:'button',class:'opening-move','data-choice':i,'aria-pressed':String(i===choice()),
        'aria-label':`${move.notation}. ${openingIdea(position,i)} Equity ${format(move.equity)}${Number.isFinite(move.referenceHalfWidth)?`, XG published bound plus or minus ${move.referenceHalfWidth.toFixed(3)}`:Number.isFinite(move.standardError)?`, approximate 95 percent sampling interval plus or minus ${(1.96*move.standardError).toFixed(3)}`:''}, ${move.loss===0?'best estimate':`estimated loss ${lossLabel(move.loss)}`}`},
        node('span',{class:'opening-notation'},node('span',{class:'opening-rank'},String(i+1)),
          node('span',{},node('strong',{},move.notation),node('span',{class:'opening-move-idea'},openingIdea(position,i)),...(move.referenceCredit?[node('span',{class:'opening-move-idea'},`XG · ${move.referenceCredit.author}`)]:[]))),
        node('span',{class:'opening-equity'},format(move.equity),...(Number.isFinite(move.referenceHalfWidth)?[node('span',{class:'opening-interval'},`±${move.referenceHalfWidth.toFixed(3)}`)]:Number.isFinite(move.standardError)?[node('span',{class:'opening-interval'},`±${(1.96*move.standardError).toFixed(3)}`)]:[])),
        node('span',{class:move.loss===0?'opening-best':'opening-loss'},lossLabel(move.loss)));
      row.addEventListener('click',() => {
        if (mode==='opening') openingChoice=i; else replyChoice=i;
        before=false;preview();
      });
      return row;
    }));
    list.scrollTop=0;
    $('opening-solver').href=shareURL(position.state);
    $('opening-next').hidden=mode==='reply'||startingDouble;
    $('opening-position-note').textContent=(mode==='reply' ? `The board faces ${replySide?'Black':'White'}, moving toward point 1.` : 'Arrows show the move; dotted checkers show where it began.')+(startingDouble?` Starting-position study; actual opening ties reroll. GNUbg · Jacoby on, beavers off. All legal starting moves evaluated at ${position.plies} ply.`:position.method==='reference'?' XG reference · Jacoby, beavers and raccoons on. Intervals are XG’s published bounds where provided; other entries use XGRoller++ estimates.':position.method==='rollout'?' GNUbg fallback · beavers off. EV intervals show approximate 95% sampling uncertainty; model and screening error are excluded.':' GNUbg fallback · beavers off.');
    panel.hidden=false;
    preview();
  }
  async function refresh() {
    const request=++generation;
    navigation();
    if (mode==='opening') {
      position=openings.get(openingRoll);status('');showPosition();return;
    }
    status('Loading replies…');
    try {
      const next=replyPositions||await data.replies(openings.get(openingRoll),openingChoice,replySide);
      if (request!==generation) return;
      if(replyPositions!==next){replyPositions=next;rollSummaries(next);}
      position=next.get(replyRoll);status('');showPosition();
    } catch {
      if (request!==generation) return;
      panel.hidden=true;status('Replies could not load. Check your connection and retry.',true);
    }
  }
  async function start() {
    status('Loading opening moves…');
    try {
      openings=await data.openings();
      $('opening-controls').hidden=false;
      $('opening-threshold').textContent=openings.get(openingRoll).threshold.toFixed(3);
      refresh();
    } catch {
      status('Opening moves could not load. Check your connection and retry.',true);
    }
  }
  function stage(next) {
    if(next==='reply'&&openingRoll[0]===openingRoll[1])return;
    mode=next;before=false;replyChoice=0;refresh();
  }
  function setLayout(layout) {
    root.dataset.layout=layout;
    for(const button of $('opening-layout').querySelectorAll('button'))
      button.setAttribute('aria-pressed',String(button.dataset.layout===layout));
    (layout==='compact'?$('opening-compact-picker'):$('opening-controls')).append($('opening-picker'));
    revealChoice();
  }
  for(const button of $('opening-layout').querySelectorAll('button'))
    button.addEventListener('click',()=>{
      setLayout(button.dataset.layout);
      try {localStorage.setItem('backgammon:opening-guide-layout',button.dataset.layout);} catch {}
    });
  try {if(localStorage.getItem('backgammon:opening-guide-layout')==='compact')setLayout('compact');} catch {}
  $('opening-openings').addEventListener('click',()=>stage('opening'));
  $('opening-replies').addEventListener('click',()=>stage('reply'));
  $('opening-next').addEventListener('click',()=>stage('reply'));
  for(const button of $('opening-side').querySelectorAll('button'))
    button.addEventListener('click',()=>{replySide=+button.dataset.side;replyChoice=0;before=false;refresh();});
  $('opening-before').addEventListener('click',()=>{before=true;preview();});
  $('opening-after').addEventListener('click',()=>{before=false;preview();});
  $('opening-retry').addEventListener('click',()=>openings?refresh():start());
  // Below-the-fold study content never delays the live table/resume links.
  if ('IntersectionObserver' in globalThis) {
    const observer=new IntersectionObserver(entries => {
      if (entries.some(e=>e.isIntersecting)) {observer.disconnect();start();}
    },{rootMargin:'300px'});
    observer.observe(root);
  } else start();
}
