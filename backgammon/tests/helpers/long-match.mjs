// A reproducible, legally replayable 12-game history, without canned grades.
import {initialState, transition, legalTurns, decisionPlayer} from '../../core/rules.mjs';
export function longMatch() {
  const initial=initialState({matchLength:0});
  const model={id:'confirm-long-match',started:true,initial,state:initial,events:[],names:['You','GNUbg']};
  let seed=42;
  const die=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%6+1;};
  const add=action=>{
    const actor=decisionPlayer(model.state);
    model.state=transition(model.state,action,actor);
    model.events.push({actor,action});
  };
  while(model.state.gameNumber<12){
    const s=model.state;
    add(s.phase==='opening'?{type:'opening',dice:[die(),die()]}:s.phase==='over'?{type:'next'}:
      s.phase==='roll'?{type:'roll',dice:[die(),die()]}:{type:'move',steps:legalTurns(s)[0].steps});
    if(model.events.length>4000)throw Error('History fixture did not finish');
  }
  add({type:'opening',dice:[6,1]});
  return model;
}
