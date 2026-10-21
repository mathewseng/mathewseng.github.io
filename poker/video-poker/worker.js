importScripts('./cribbage.js'+self.location.search,'./engine.js'+self.location.search,'./solver.js'+self.location.search,'./cribbage-solver.js'+self.location.search);
let cacheKey='',table;
onmessage=({data})=>{const {id,kind,variant,hand}=data;try{
  if(variant.cribbage&&(kind==='hand'||variant.handSize>5)){
    const solver=VideoPokerCribbageSolver,progress=p=>postMessage({id,progress:p,stage:kind==='hand'?'Calculating exact draw EVs':'Sampling deals · exact strategy for each'});
    postMessage({id,result:kind==='hand'?solver.solveHand(hand,variant,progress):solver.sampleGame(variant,progress)});return;
  }
  const key=JSON.stringify(variant);if(key!==cacheKey){postMessage({id,progress:0,stage:'Indexing all final hands'});table=VideoPokerSolver.build(variant,p=>postMessage({id,progress:p*.5,stage:'Indexing all final hands'}));cacheKey=key;}
  const result=kind==='all'?VideoPokerSolver.solveAll(variant,table,p=>postMessage({id,progress:.5+p*.5,stage:'Optimizing every starting hand'})):VideoPokerSolver.solveHand(hand,variant,table);postMessage({id,result});
}catch(e){postMessage({id,error:e.message});}};
