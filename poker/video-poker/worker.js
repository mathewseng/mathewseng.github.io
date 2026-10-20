importScripts('./engine.js'+self.location.search,'./solver.js'+self.location.search);
let cacheKey='',table;
onmessage=({data})=>{const {id,kind,variant,hand}=data;try{const key=JSON.stringify(variant);if(key!==cacheKey){postMessage({id,progress:0,stage:'Indexing all final hands'});table=VideoPokerSolver.build(variant,p=>postMessage({id,progress:p*.5,stage:'Indexing all final hands'}));cacheKey=key;}
const result=kind==='all'?VideoPokerSolver.solveAll(variant,table,p=>postMessage({id,progress:.5+p*.5,stage:'Optimizing every starting hand'})):VideoPokerSolver.solveHand(hand,variant,table);postMessage({id,result});}catch(e){postMessage({id,error:e.message});}};
