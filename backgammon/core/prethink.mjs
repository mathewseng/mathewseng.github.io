// SPDX-License-Identifier: GPL-3.0-or-later
import { positionKey, transition, decisionPlayer, canDouble, boardKey, commitTurn } from './rules.mjs';
import { forcedTurn } from './table.mjs';

export const PRETHINK = Object.freeze({ nodes: 24, milliseconds: 20000, turns: 2, branches: 3, margin: 0.020 });
export const analysisKey = state => positionKey({ ...state, dice: [...state.dice].sort((a,b) => b-a) });
const contextKey = model => JSON.stringify([model.id, analysisKey(model.state), model.config.humanSide, model.config.strength, model.config.reviewStrength]);
export const chanceRolls = () => Array.from({length:6}, (_, i) =>
  Array.from({length:i+1}, (_, j) => ({ dice:[i+1,j+1], weight:i === j ? 1/36 : 2/36 })))
  .flat().sort((a,b) => b.weight-a.weight);

// Only real legal transitions. We enumerate chance outcomes, never draw or
// reserve future dice. Priority weights rank work; they are NOT win chances.
export function continuations(node, result) {
  const s = node.state;
  if (node.turns >= PRETHINK.turns || s.phase === 'over') return [];
  if (s.phase === 'roll' && !canDouble(s)) {
    return chanceRolls().map(({dice,weight}) => ({
      state:transition(s,{type:'roll',dice}), turns:node.turns, weight:node.weight*weight,
    }));
  }
  let choices;
  if (s.phase === 'move') {
    const forced = forcedTurn(s);
    choices = forced ? [{steps:forced.steps,equity:0}] : result?.candidates;
  } else {
    const direction = decisionPlayer(s) === s.turn ? 1 : -1;
    choices = result?.decisionOptions?.map(c => ({...c,equity:c.equity*direction}));
    if (!choices?.length && result?.action) choices = [{action:result.action,equity:0}];
  }
  if (!choices?.length) return [];
  const sorted = [...choices].sort((a,b) => b.equity-a.equity);
  const close = sorted.filter(c => sorted[0].equity-c.equity <= PRETHINK.margin + 1e-10).slice(0,PRETHINK.branches);
  return close.flatMap((choice,i) => {
    // No-double has dice as its children. Other cube actions preserve context.
    if (choice.action === 'roll') return chanceRolls().map(({dice,weight}) => ({
      state:transition(s,{type:'roll',dice}), turns:node.turns, weight:node.weight*weight/(i+1),
    }));
    return [{state:transition(s, s.phase === 'move'
      ? {type:'move',steps:choice.steps} : {type:choice.action}, decisionPlayer(s)),
      turns:node.turns + Number(s.phase === 'move'), weight:node.weight/(i+1)}];
  });
}

// Shares the foreground worker/cache. At most one speculative job is submitted
// at once. Actual decisions outrank speculation; a changed position discards
// old plans, while an already-promoted foreground job is never cancelled here.
export class Prethink {
  constructor({engine, view, changed = () => {}, now = () => performance.now(), limits = PRETHINK}) {
    Object.assign(this,{engine,view,changed,now,limits});
    this.scope = null; this.timer = null; this.job = null;
  }
  get busy() { return !!this.job; }
  // The bot has already chosen its real action. Use its animation hold to
  // prepare the next decision; committed dice are still drawn only by Play.
  prepareAfter(state, action) {
    const view=this.view();
    if (!view?.enabled || view.game?.config.mode !== 'computer') return;
    const next=transition(state,action,decisionPlayer(state));
    if (!['roll','double','move'].includes(next.phase) || (next.phase==='roll'&&!canDouble(next))) return;
    const preset=decisionPlayer(next)===view.game.config.humanSide
      ? view.game.config.reviewStrength||'auto' : view.game.config.strength||'auto';
    this.engine.analyze(next,{preset,priority:-20}).catch(()=>{});
  }
  pause() {
    clearTimeout(this.timer); this.timer = null;
    this.scope = null; this.job = null;
    this.engine.cancelWhere(job => [-20,-5,-4].includes(job.priority));
  }
  update() {
    clearTimeout(this.timer);
    const view = this.view(), model = view?.game;
    if (!view?.enabled || !model?.started || model.config?.mode !== 'computer' ||
        !['roll','double','move'].includes(model.state.phase) || model.state.pending?.type === 'resign') {
      if (this.scope) this.pause();
      return;
    }
    const key = contextKey(model);
    if (this.scope?.key !== key) {
      const position = analysisKey(model.state);
      this.engine.cancelWhere(job => [-20,-5,-4].includes(job.priority) && analysisKey(job.state) !== position);
      this.scope = {key, state:structuredClone(model.state), root:null, done:new Set(), queue:[], seen:new Set(), nodes:0, spent:0};
      this.job = null;
    }
    // A completed real draft takes precedence immediately. Do not wait for a
    // speculative future roll to finish before preparing the Confirm action.
    if (view.idle && this.job?.priority === -20 && view.submitted) {
      const draftKey = boardKey(commitTurn(model.state, view.submitted));
      if (!this.scope.done.has(draftKey)) {
        this.engine.cancelWhere(job => job.priority === -20);
        this.job = null;
      }
    }
    if (view.idle && !this.job) this.timer = setTimeout(() => this.run(), 120);
  }
  async run() {
    const view = this.view(), scope = this.scope;
    if (!scope || !view?.enabled || !view.idle || this.job) return;
    const model = view.game;
    if (contextKey(model) !== scope.key) return this.update();
    const presetFor = state => decisionPlayer(state) === model.config.humanSide
      ? model.config.reviewStrength || 'auto' : model.config.strength || 'auto';
    const submitted = scope.state.phase === 'move' ? view.submitted : null;
    const draftKey = submitted ? boardKey(commitTurn(scope.state,submitted)) : null;
    let node, preset, priority, jobKey;
    if (!scope.root) {
      node = {state:scope.state,turns:0,weight:1}; preset=presetFor(node.state); priority=-5; jobKey='root';
    } else if (draftKey && !scope.done.has(draftKey)) {
      node = {state:scope.state,turns:0,weight:1}; preset=presetFor(node.state); priority=-4; jobKey=draftKey;
    } else {
      if (scope.nodes >= this.limits.nodes || scope.spent >= this.limits.milliseconds) return;
      node=scope.queue.shift(); if (!node) return;
      preset=presetFor(node.state); priority=-20; jobKey=analysisKey(node.state);
    }
    const job = {scope,jobKey,priority}; this.job=job; this.changed();
    const began=this.now();
    try {
      const forced = node.state.phase === 'move' && forcedTurn(node.state);
      const cubeUnavailable = node.state.phase === 'roll' && !canDouble(node.state);
      const result = forced || cubeUnavailable ? {skipped:true} : await this.engine.analyze(node.state, {
        preset, priority, submitted:priority === -4 ? submitted : null,
      });
      if (this.scope !== scope || this.job !== job) return;
      if (jobKey === 'root') scope.root=result;
      scope.done.add(jobKey);
      if (priority === -20) scope.nodes++;
      // Favor the actual completed draft over hypothetical best moves. Keep
      // its next cube decision and all random rolls in the same exact-context
      // cache that foreground play uses; never reserve or mutate live dice.
      {
        const actual = priority === -4 && result?.actual;
        const plan = actual ? {...result,candidates:[actual]} : result;
        for (const next of continuations(actual ? {...node,weight:4} : node,plan)) {
          const key=analysisKey(next.state);
          if (next.state.phase === 'over' || next.turns >= this.limits.turns) continue;
          if (scope.seen.has(key)) {
            const queued=scope.queue.find(n=>analysisKey(n.state)===key);
            if (queued && actual) queued.weight=Math.max(queued.weight,next.weight);
            continue;
          }
          scope.seen.add(key); scope.queue.push(next);
        }
        scope.queue.sort((a,b) => b.weight-a.weight || a.turns-b.turns);
        scope.queue.length=Math.min(scope.queue.length,96);
      }
    } catch (error) {
      // Foreground work can interrupt at any point. Failed speculation must
      // never block play, show a false engine failure, or start a retry loop.
      if (this.scope === scope) {
        if (error.name !== 'AbortError') { scope.root ||= {failed:true}; scope.queue=[]; scope.done.add(jobKey); }
        else if (priority === -20) scope.queue.unshift(node);
      }
    } finally {
      if (priority === -20) scope.spent += this.now()-began;
      if (this.job === job) { this.job=null; this.changed(); this.update(); }
    }
  }
}
