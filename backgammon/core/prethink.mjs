// SPDX-License-Identifier: GPL-3.0-or-later
import { positionKey, transition, decisionPlayer, canDouble, boardKey, commitTurn } from './rules.mjs';
import { forcedTurn } from './table.mjs';
import { futureLocalRoll } from './local-rolls.mjs';

export const PRETHINK = Object.freeze({ nodes: 8, milliseconds: 4000, turns: 2, branches: 3, margin: 0.020 });
export const analysisKey = state => positionKey({ ...state, dice: [...state.dice].sort((a,b) => b-a) });
const nodeKey = node => `${analysisKey(node.state)}:${node.rolls || 0}`;
const contextKey = model => JSON.stringify([model.id, analysisKey(model.state), model.config.humanSide, model.config.strength, model.config.reviewStrength, model.localRolls, model.replayDice]);
export const chanceRolls = () => Array.from({length:6}, (_, i) =>
  Array.from({length:i+1}, (_, j) => ({ dice:[i+1,j+1], weight:i === j ? 1/36 : 2/36 })))
  .flat().sort((a,b) => b.weight-a.weight);

// Only real legal transitions. Local seeded games supply one known roll;
// callers without a private sequence enumerate chance outcomes. Never pass
// future dice to GNUbg itself. Weights rank work; they are NOT win chances.
export function continuations(node, result, rolls = chanceRolls()) {
  const s = node.state;
  if (node.turns >= PRETHINK.turns || s.phase === 'over') return [];
  if (s.phase === 'roll' && !canDouble(s)) {
    return rolls.map(({dice,weight}) => ({
      state:transition(s,{type:'roll',dice}), turns:node.turns, weight:node.weight*weight,
      rolls:(node.rolls || 0)+1,
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
    if (choice.action === 'roll') return rolls.map(({dice,weight}) => ({
      state:transition(s,{type:'roll',dice}), turns:node.turns, weight:node.weight*weight/(i+1),
      rolls:(node.rolls || 0)+1,
    }));
    return [{state:transition(s, s.phase === 'move'
      ? {type:'move',steps:choice.steps} : {type:choice.action}, decisionPlayer(s)),
      turns:node.turns + Number(s.phase === 'move'), rolls:node.rolls || 0, weight:node.weight/(i+1)}];
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
  // prepare the next decision. Seeded dice are still consumed only by Play.
  prepareAfter(state, action) {
    const view=this.view();
    if (!view?.enabled || view.game?.config.mode !== 'computer') return;
    const next=transition(state,action,decisionPlayer(state)), model=view.game;
    const plan = { gameId:model.id, keys:new Set(), began:this.now() };
    clearTimeout(this.planTimer);
    this.plan = plan;
    this.planTimer = setTimeout(() => {
      if (this.plan !== plan) return;
      this.plan = null;
      this.engine.cancelWhere(job => job.priority === -20 && plan.keys.has(analysisKey(job.state)));
    }, this.limits.milliseconds);
    // Follow the chosen action through the next cube decision AND its known
    // roll during playback. Previously this stopped at the cube, leaving the
    // expensive checker search to start only after the player tapped Roll.
    const prepare = async (node, remaining) => {
      const current=this.view();
      if (!remaining || this.now()-plan.began >= this.limits.milliseconds || this.plan !== plan || !current?.enabled || current.game?.id !== model.id ||
          current.game.state.sequence > node.state.sequence || !['roll','double','move'].includes(node.state.phase)) return;
      plan.keys.add(analysisKey(node.state));
      const preset=decisionPlayer(node.state)===model.config.humanSide
        ? model.config.reviewStrength||'auto' : model.config.strength||'auto';
      const skip = node.state.phase === 'move' ? forcedTurn(node.state) : node.state.phase === 'roll' && !canDouble(node.state);
      const result=skip ? null : await this.engine.analyze(node.state,{preset,priority:-20,readyOnly:true});
      if (this.plan !== plan) return;
      const dice=node.state.phase === 'roll' ? await futureLocalRoll(model,node.rolls || 0,node.state.turn) : null;
      const children=continuations(node,result,dice ? [{dice,weight:1}] : chanceRolls());
      // One principal continuation here; the idle scheduler covers alternatives.
      if (children[0]) await prepare(children[0],remaining-1);
    };
    prepare({state:next,turns:0,rolls:action.type === 'roll' ? 1 : 0,weight:1},3).catch(()=>{}).finally(() => {
      if (this.plan === plan) clearTimeout(this.planTimer);
    });
  }
  pause() {
    clearTimeout(this.timer); this.timer = null;
    clearTimeout(this.planTimer);
    this.scope = null; this.job = null;
    this.plan = null;
    this.engine.cancelWhere(job => [-20,-5,-4].includes(job.priority));
  }
  update() {
    clearTimeout(this.timer);
    const view = this.view(), model = view?.game;
    if (!view?.enabled || !model?.started || model.config?.mode !== 'computer' ||
        !['roll','double','move'].includes(model.state.phase) || model.state.pending?.type === 'resign') {
      if (this.scope || this.plan || this.job) this.pause();
      return;
    }
    const key = contextKey(model);
    if (this.scope?.key !== key) {
      const position = analysisKey(model.state);
      this.engine.cancelWhere(job => [-20,-5,-4].includes(job.priority) && analysisKey(job.state) !== position &&
        !(this.plan?.gameId === model.id && this.plan.keys.has(analysisKey(job.state))));
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
    const deadline = priority === -20 ? setTimeout(() => {
      if (this.job !== job) return;
      scope.spent = this.limits.milliseconds;
      this.engine.cancelWhere(pending => pending.priority === -20 && analysisKey(pending.state) === jobKey);
    }, Math.max(1,this.limits.milliseconds-scope.spent)) : null;
    try {
      const forced = node.state.phase === 'move' && forcedTurn(node.state);
      const cubeUnavailable = node.state.phase === 'roll' && !canDouble(node.state);
      const result = forced || cubeUnavailable ? {skipped:true} : await this.engine.analyze(node.state, {
        preset, priority, submitted:priority === -4 ? submitted : null,
        readyOnly: priority !== -5,
      });
      if (this.scope !== scope || this.job !== job) return;
      if (jobKey === 'root') scope.root=result;
      scope.done.add(jobKey);
      if (priority === -20) scope.nodes++;
      // Favor the actual completed draft over hypothetical best moves. Keep
      // its next cube decision and predetermined roll in the same exact-context
      // cache that foreground play uses. Peeking never consumes a roll.
      {
        const actual = priority === -4 && result?.actual;
        const plan = actual ? {...result,candidates:[actual]} : result;
        const dice = node.state.phase === 'roll'
          ? await futureLocalRoll(model, node.rolls || 0, node.state.turn) : null;
        if (this.scope !== scope || this.job !== job) return;
        for (const next of continuations(actual ? {...node,weight:4} : node,plan,
          dice ? [{dice,weight:1}] : chanceRolls())) {
          const key=nodeKey(next);
          if (next.state.phase === 'over' || next.turns >= this.limits.turns) continue;
          if (scope.seen.has(key)) {
            const queued=scope.queue.find(n=>nodeKey(n)===key);
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
      clearTimeout(deadline);
      if (priority === -20) scope.spent += this.now()-began;
      if (this.job === job) { this.job=null; this.changed(); this.update(); }
    }
  }
}
