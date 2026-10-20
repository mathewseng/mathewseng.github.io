/* Shared by play, the browser worker, and the reproducible exhaustive analysis. */
(function (root) {
  'use strict';
  const labels = { faceQuads:'Four Js–Ks', deucesAce:'Four deuces + ace', fiveAces:'Five aces', fiveLow:'Five 3s–5s', royal:'Royal flush', straightFlush:'Straight flush', quads:'Four of a kind', fullHouse:'Full house', flush:'Flush', straight:'Straight', trips:'Three of a kind', twoPair:'Two pair', highPair:'Jacks or better', aces:'Four aces', lowQuads:'Four 2s–4s', acesKicker:'Four aces + 2–4', lowKicker:'Four 2s–4s + A–4', fiveKind:'Five of a kind', wildRoyal:'Wild royal flush', deuces:'Four deuces', lowJ:'J-high', lowT:'T-high', low9:'9-high', low8:'8-high', low7:'7-high', wheel:'Wheel · 7-5-4-3-2', qualify:'Qualifying push', badT:'T-high badugi', bad9:'9-high badugi', bad8:'8-high badugi', bad7:'7-high badugi', bad6:'6-high badugi', bad5:'5-high badugi' };
  const BADEUCEY_RULES = {fiveCard:'high-card',minBadugi:4,maxLowRank:14,maxBadugiRank:14};
  function normalizeBadeuceyRules(r={}) {
    const rules={...BADEUCEY_RULES,...r};
    if(!['high-card','unpaired','any'].includes(rules.fiveCard)||![0,2,3,4].includes(rules.minBadugi)||![14,11,10,9,8,7].includes(rules.maxLowRank)||![14,11,10,9,8,7,6,5,4].includes(rules.maxBadugiRank))throw new Error('Invalid Badeucey qualification rules.');
    return Object.fromEntries(Object.keys(BADEUCEY_RULES).map(k=>[k,rules[k]]));
  }
  const base = {royal:800, straightFlush:50, quads:25, fullHouse:9, flush:6, straight:4, trips:3, twoPair:2, highPair:1};
  const make=(id,name,family,changes={},extra={})=>({id,name,family,deckSize:52,pays:{...base,...changes},...extra});
  const wild={royal:800,deuces:200,wildRoyal:25,fiveKind:15,straightFlush:9,quads:5,fullHouse:3,flush:2,straight:2,trips:1};
  const variants = [
    make('jacks','Jacks or Better','Classic',{}, {subtitle:'9 / 6 · full pay'}),
    make('tens','Tens or Better','Classic',{fullHouse:6,flush:5},{pairMin:10,subtitle:'6 / 5'}),
    make('bonus','Bonus Poker','Bonus',{fullHouse:8,flush:5,aces:80,lowQuads:40},{subtitle:'8 / 5'}),
    make('bonus-deluxe','Bonus Poker Deluxe','Bonus',{quads:80,twoPair:1},{subtitle:'9 / 6'}),
    make('double-bonus','Double Bonus','Bonus',{fullHouse:10,flush:7,straight:5,quads:50,aces:160,lowQuads:80,twoPair:1},{subtitle:'10 / 7'}),
    make('double-double','Double Double Bonus','Bonus',{quads:50,aces:160,lowQuads:80,acesKicker:400,lowKicker:160,twoPair:1},{subtitle:'9 / 6'}),
    make('triple-double','Triple Double Bonus','Bonus',{flush:7,quads:50,aces:160,lowQuads:80,acesKicker:800,lowKicker:400,trips:2,twoPair:1},{subtitle:'9 / 7'}),
    make('triple-plus','Triple Bonus Plus','Bonus',{straightFlush:100,quads:50,aces:240,lowQuads:120,flush:5,twoPair:1},{subtitle:'9 / 5'}),
    make('super-double','Super Double Bonus','Bonus',{straightFlush:80,quads:50,aces:160,lowQuads:80,faceQuads:120,flush:5,twoPair:1},{subtitle:'9 / 5'}),
    make('white-hot','White Hot Aces','Bonus',{straightFlush:80,quads:50,aces:240,lowQuads:120,flush:5,twoPair:1},{subtitle:'9 / 5'}),
    make('all-american','All American','Classic',{straightFlush:200,quads:40,fullHouse:8,flush:8,straight:8,twoPair:1},{subtitle:'8 / 8 / 8'}),
    {id:'deuces',name:'Deuces Wild',family:'Wild cards',deckSize:52,wild:'deuces',pays:wild,subtitle:'Full pay · 25 / 15 / 9'},
    {id:'nsud',name:'Not So Ugly Ducks',family:'Wild cards',deckSize:52,wild:'deuces',pays:{...wild,wildRoyal:25,fiveKind:16,straightFlush:10,quads:4,fullHouse:4,flush:3},subtitle:'Deuces · 25 / 16 / 10'},
    {id:'bonus-deuces',name:'Bonus Deuces Wild',family:'Wild cards',deckSize:52,wild:'deuces',pays:{...wild,deucesAce:400,fiveAces:80,fiveLow:40,fiveKind:20,straightFlush:10,quads:4,fullHouse:4,flush:3,straight:1},subtitle:'10 / 4 / 4'},
    {id:'joker',name:'Joker Poker',family:'Wild cards',deckSize:53,wild:'joker',pairMin:13,pays:{royal:800,fiveKind:200,wildRoyal:100,straightFlush:50,quads:20,fullHouse:7,flush:5,straight:3,trips:2,twoPair:1,highPair:1},subtitle:'Kings or better · 7 / 5'},
    {id:'low27',name:'2–7 Low',family:'Custom variants',deckSize:52,pays:{wheel:10,low7:5,low8:4,low9:3,lowT:2,lowJ:1},subtitle:'Original paytable'},
    {id:'badeucey',name:'Badeucey',family:'Custom variants',deckSize:52,rules:{...BADEUCEY_RULES},pays:{qualify:1,wheel:8,low7:4,low8:2,low9:1,lowT:0,bad5:16,bad6:8,bad7:4,bad8:2,bad9:1,badT:0},subtitle:'Push + low + badugi points'}
  ];
  const byId=Object.fromEntries(variants.map(v=>[v.id,v]));
  const rank=c=>2+Math.floor(c/4), suit=c=>c%4;
  const cardText=c=>c===52?'JK':'23456789TJQKA'[Math.floor(c/4)]+'shdc'[c%4];
  function parseHand(text,deckSize=52) {
    const cards=text.trim().split(/[\s,]+/).map(t=>{
      if (/^(jk|joker)$/i.test(t)) return 52;
      const m=t.match(/^(10|[2-9tjqka])([shdc])$/i);
      if(!m) throw new Error('Use five cards like 7s 5h 4d 3c 2s. Use JK for the joker.');
      return '23456789TJQKA'.indexOf(m[1].toUpperCase().replace('10','T'))*4+'shdc'.indexOf(m[2].toLowerCase());
    });
    validateHand(cards,deckSize);return cards;
  }
  function validateHand(h,n=52){if(h.length!==5||new Set(h).size!==5||h.some(c=>!Number.isInteger(c)||c<0||c>=n)) throw new Error('Choose five different cards from this variant’s deck.');}
  function facts(h,wild) {
    const counts=new Uint8Array(15);let bits=0,sm=0,w=0,high=0;
    for(const c of h){const r=rank(c);if((wild==='deuces'&&r===2)||(wild==='joker'&&c===52)){w++;continue;} counts[r]++;bits|=1<<r;sm|=1<<suit(c);if(r>high)high=r;}
    let pairs=0,trips=0,quad=0,distinct=0,max=0,kicker=0;
    for(let r=2;r<=14;r++){const n=counts[r];if(n){distinct++;max=Math.max(max,n);if(n===1)kicker=r;if(n===2)pairs++;if(n===3)trips=r;if(n===4)quad=r;}}
    let straight=false;
    if(distinct===5){for(let lo=2;lo<=10;lo++)if(bits===(31<<lo))straight=true;}
    const aceLow=bits===((1<<14)|(15<<2));
    return {counts,bits,sm,w,high,pairs,trips,quad,distinct,max,kicker,straight,aceLow,flush:(sm&(sm-1))===0};
  }
  const badugiSubsets={2:[],3:[],4:[]};
  for(let m=1;m<32;m++){
    const indices=[];for(let i=0;i<5;i++)if(m&(1<<i))indices.push(i);
    if(badugiSubsets[indices.length])badugiSubsets[indices.length].push(indices);
  }
  // Minimum highest rank of a valid subset of exactly this size. Aces are high.
  // Testing the minimum qualifying size also finds larger qualifying badugis.
  function badugiHigh(h,size=4) {
    let best=15;
    for(const indices of badugiSubsets[size]){
      let ranks=0,suits=0,high=0,valid=true;
      for(const i of indices){const r=rank(h[i]),rb=1<<r,sb=1<<suit(h[i]);if((ranks&rb)||(suits&sb)){valid=false;break;}ranks|=rb;suits|=sb;high=Math.max(high,r);}
      if(valid)best=Math.min(best,high);
    }
    return best;
  }
  function lowKey(f) {
    if(f.distinct!==5||f.straight||f.flush)return null;
    if(f.bits===((1<<7)|(15<<2)))return 'wheel';
    return {7:'low7',8:'low8',9:'low9',10:'lowT',11:'lowJ'}[f.high]||null;
  }
  function badugiKey(high){return high===10?'badT':high<=9?'bad'+high:null;}
  function lowParts(h) {
    const f=facts(h);if(f.distinct!==5||f.straight||f.flush)return null;
    const badHigh=badugiHigh(h);
    return {low:lowKey(f),high:f.high,badHigh,bad:badugiKey(badHigh)};
  }
  function evaluateBadeucey(h,v) {
    const f=facts(h),rules=v.rules||BADEUCEY_RULES;
    const highCard=f.distinct===5&&!f.straight&&!f.flush;
    if((rules.fiveCard==='high-card'&&!highCard)||(rules.fiveCard==='unpaired'&&f.distinct!==5))return {payout:0,label:'Five-card qualifier not met',keys:[]};
    if(f.high>rules.maxLowRank)return {payout:0,label:'Five-card rank limit exceeded',keys:[]};
    const badHigh=badugiHigh(h),minimum=rules.minBadugi;
    if(minimum>0){
      const qualifyingHigh=minimum===4?badHigh:badugiHigh(h,minimum);
      if(qualifyingHigh>rules.maxBadugiRank)return {payout:0,label:minimum===4&&rules.maxBadugiRank===14?'No four-card badugi':`No qualifying ${minimum}-card badugi`,keys:[]};
    }
    // Relaxing a qualifier admits the push. Awards retain their original meanings:
    // a valid five-card 2–7 low and a full four-card badugi, independently.
    const keys=['qualify',lowKey(f),badugiKey(badHigh)].filter(k=>k&&v.pays[k]!==undefined&&(k==='qualify'||v.pays[k]>0));
    return {payout:keys.reduce((sum,k)=>sum+v.pays[k],0),label:keys.filter(k=>k!=='qualify').map(k=>labels[k]).join(' + ')||'Qualifying push',keys};
  }
  function naturalCategory(f,v) {
    if(f.flush&&(f.straight||f.aceLow))return f.high===14&&!f.aceLow?'royal':'straightFlush';
    if(f.quad){if(f.quad>=11&&f.quad<=13&&v.pays.faceQuads!==undefined)return 'faceQuads';if(f.quad===14&&f.kicker<=4&&v.pays.acesKicker!==undefined)return 'acesKicker';if(f.quad>=2&&f.quad<=4&&(f.kicker===14||f.kicker<=4)&&v.pays.lowKicker!==undefined)return 'lowKicker';if(f.quad===14&&v.pays.aces!==undefined)return 'aces';if(f.quad<=4&&v.pays.lowQuads!==undefined)return 'lowQuads';return 'quads';}
    if(f.trips&&f.pairs)return 'fullHouse';if(f.flush)return 'flush';if(f.straight||f.aceLow)return 'straight';if(f.trips)return 'trips';if(f.pairs===2)return 'twoPair';
    for(let r=v.pairMin||11;r<=14;r++)if(f.counts[r]===2)return 'highPair';return null;
  }
  function wildCategory(f,v) {
    if(!f.w)return naturalCategory(f,v);
    if(v.wild==='deuces'&&f.w===4)return f.high===14&&v.pays.deucesAce!==undefined?'deucesAce':'deuces';
    const royal=(f.bits&~(31<<10))===0&&f.distinct===5-f.w;
    // Joker poker ranks five of a kind above a wild royal; these cannot coincide.
    if(f.max+f.w===5){if(v.pays.fiveAces!==undefined&&f.high===14)return 'fiveAces';if(v.pays.fiveLow!==undefined&&f.high<=5)return 'fiveLow';return 'fiveKind';}
    if(f.flush&&royal)return 'wildRoyal';
    let straight=false;
    if(f.distinct===5-f.w){for(let lo=2;lo<=10;lo++)if((f.bits&~(31<<lo))===0)straight=true;if((f.bits&~((1<<14)|(15<<2)))===0)straight=true;}
    if(f.flush&&straight)return 'straightFlush';if(f.max+f.w>=4)return 'quads';
    for(let a=2;a<=14;a++)for(let b=2;b<=14;b++)if(a!==b&&f.counts[a]<=3&&f.counts[b]<=2&&f.counts[a]+f.counts[b]===5-f.w&&3-f.counts[a]+2-f.counts[b]===f.w)return 'fullHouse';
    if(f.flush)return 'flush';if(straight)return 'straight';if(f.max+f.w>=3)return 'trips';
    if(f.pairs>=2)return 'twoPair';
    for(let r=v.pairMin||11;r<=14;r++)if(f.counts[r]+f.w>=2)return 'highPair';return null;
  }
  function evaluate(h,v) {
    if(typeof v==='string')v=byId[v];
    if(v.id==='badeucey')return evaluateBadeucey(h,v);
    if(v.id==='low27'){
      const p=lowParts(h);if(!p)return {payout:0,label:'Does not qualify',keys:[]};
      const key=p.low;return {payout:v.pays[key]||0,label:key?labels[key]:'Q-high or worse',keys:key?[key]:[]};
    }
    const f=facts(h,v.wild),key=v.wild?wildCategory(f,v):naturalCategory(f,v);
    return {payout:v.pays[key]||0,label:key==='highPair'?(v.pairMin===10?'Tens or better':v.pairMin===13?'Kings or better':labels[key]):(labels[key]||'No paying hand'),keys:key?[key]:[]};
  }
  function shuffledDeck(n=52,random=Math.random){const a=Array.from({length:n},(_,i)=>i);for(let i=n-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
  function draw(hand,mask,deck){validateHand(hand,deck.length+5);if(!Number.isInteger(mask)||mask<0||mask>31)throw Error('Invalid hold');let i=0;return hand.map((c,j)=>mask&(1<<j)?c:deck[i++]);}
  const api={variants,byId,labels,BADEUCEY_RULES,normalizeBadeuceyRules,badugiHigh,rank,suit,cardText,parseHand,validateHand,evaluate,lowParts,shuffledDeck,draw};
  if(typeof module!=='undefined')module.exports=api;else root.VideoPoker=api;
})(typeof self!=='undefined'?self:globalThis);
