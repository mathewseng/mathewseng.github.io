// SPDX-License-Identifier: GPL-3.0-or-later
import { positionKey, boardKey, commitTurn } from "../core/rules.mjs";
import { ENGINE_VERSION, PRESETS } from "./metadata.mjs";
import { ADAPTIVE_SEARCH } from "./adaptive.mjs";
import { bookEligible } from "./opening-book.mjs";
import { PreferredOpeningBook } from "./xg-reference-book.mjs";
// One worker, bounded LRU, priority queue. Reuse it after cooperative cancellation;
// an unresponsive native call still has a bounded termination fallback.
export class EngineClient {
  constructor({
    workerFactory = () =>
      new Worker(new URL("./worker.mjs", import.meta.url), { type: "module" }),
    onStatus = () => {},
    openingBook = new PreferredOpeningBook(),
    engineName = "GNUbg",
    assetsDescription = "its local databases",
    presetNames = {},
  } = {}) {
    this.factory = workerFactory;
    this.book = openingBook;
    this.onStatus = onStatus;
    this.engineName = engineName;
    this.assetsDescription = assetsDescription;
    this.presetNames = presetNames;
    this.queue = [];
    this.cache = new Map();
    this.readings = new Map();
    this.readingListeners = new Set();
    this.decisions = new Map();
    this.serial = 0;
    this.active = null;
    this.worker = null;
    this.ready = false;
    this.generation = 0;
  }
  start() {
    if (this.initializing) return this.initializing;
    if (this.ready) return Promise.resolve();
    const generation = ++this.generation;
    this.onStatus("loading", `Loading ${this.engineName} and ${this.assetsDescription}…`);
    let resolveReady;
    const pending = new Promise((resolve, reject) => {
      resolveReady = resolve;
      this.initReject = reject;
    });
    this.initializing = pending;
    try {
      this.worker = this.factory();
      this.worker.onerror = (e) => {
        if (generation !== this.generation) return;
        this.fail(
          new Error(
            e.message || "The analysis worker stopped. Retry to load it again.",
          ),
        );
      };
      this.worker.onmessage = ({ data }) => {
        if (generation !== this.generation) return;
        if (data.id === this.retiring?.id) {
          if (["cancelled", "result", "error"].includes(data.type)) {
            clearTimeout(this.retireTimer);
            this.retiring = null;
            this.pump();
          }
          return; // A cancelled search cannot publish a stale evaluation.
        }
        if (data.type === "ready") {
          this.startup = data;
          clearTimeout(this.initTimeout);
          this.ready = true;
          this.initializing = null;
          this.initReject = null;
          this.onStatus(
            "ready",
            `${this.engineName} ready · ${(data.elapsedMs / 1000).toFixed(2)} s startup`,
          );
          resolveReady();
        } else if (data.id === 0 && data.type === "error")
          this.fail(new Error(data.message));
        else if (this.active && data.id === this.active.id) {
          const job = this.active;
          if (data.type === "evaluation" && !job.rollout) {
            job.completed = data.result;
            this.rememberReading(job, data.result);
            this.rememberDecision(job, data.result);
            try {
              for (const listener of job.evaluationListeners) listener(structuredClone(data.result));
            } catch (e) {
              this.fail(e);
              return;
            }
            // Intermediate updates do not resolve Auto. The worker must reach
            // the required minimum, regardless of how long earlier stages took.
            return;
          }
          if (data.type === "progress") {
            try {
              for (const listener of job.progressListeners)
                listener(data.checkpoint);
            } catch (e) {
              this.fail(e);
            }
            return;
          }
          this.active = null;
          clearTimeout(this.jobTimeout);
          if (data.type !== "error" && job.preset === "auto" && !job.rollout &&
              !(data.result?.settings?.plies >= ADAPTIVE_SEARCH.minimumPlies)) {
            job.reject(new Error(`Automatic analysis ended before the required ${ADAPTIVE_SEARCH.minimumPlies} ply. Retry the analysis.`));
            this.onStatus("error", `Automatic analysis did not complete ${ADAPTIVE_SEARCH.minimumPlies} ply.`);
            this.pump();
            return;
          }
          if (data.type === "error") job.reject(new Error(data.message));
          else {
            // Returned results are editable previews; never expose the object
            // retained for future hints/grades to a caller's mutations.
            // An action deadline is not a completed adaptive search. Keep it
            // available for play, without satisfying later full-depth reviews.
            if (data.result.budget?.reason !== 'ready-to-play')
              this.cache.set(job.key, structuredClone(data.result));
            this.rememberReading(job, data.result);
            this.rememberDecision(job, data.result);
            this.trimCache();
            job.resolve(data.result);
          }
          this.onStatus(
            "ready",
            data.type === "error" ? data.message : "Analysis complete",
          );
          this.pump();
        }
      };
      this.initTimeout = setTimeout(
        () =>
          this.fail(
            new Error(
              "Engine loading timed out. Check your connection and retry.",
            ),
          ),
        45000,
      );
      this.worker.postMessage({ id: 0, type: "init" });
    } catch (error) {
      this.fail(error);
    }
    return pending;
  }
  analyze(
    state,
    {
      preset = "quick",
      kind = state.phase === "move" ? "checker" : "cube",
      submitted = null,
      priority = 10,
      rollout = null,
      useBook = true,
      onProgress = () => {},
      onEvaluation = () => {},
      onUnlisted = () => {},
      readyOnly = false,
      displayOnly = false,
    } = {},
  ) {
    readyOnly = readyOnly && preset === 'auto' && !rollout;
    if (readyOnly) {
      let ready;
      try { ready = this.readyResult(state, {preset, submitted, useBook}); }
      catch (error) { return Promise.reject(error); }
      if (ready) {
        const active = this.active;
        // If an optional deeper stage is already inside synchronous WASM,
        // take its completed answer now. Ignore late messages after stopping.
        if (active?.preset === preset && active.priority <= priority &&
            this.normalizedPosition(active.state) === this.normalizedPosition(state) &&
            active.completed?.settings?.plies >= ADAPTIVE_SEARCH.minimumPlies) {
          this.active = null;
          clearTimeout(this.jobTimeout);
          this.retireWorker(active);
          active.resolve(this.asReady(active.completed));
          this.pump();
        }
        return Promise.resolve(ready);
      }
    }
    // Unscreened checker analysis scores every legal result at one depth.
    // Grading a move is a projection of that same result, not another WASM job.
    // Screened searches/rollouts still depend on the submitted move because
    // they must explicitly add it to their finalist set.
    const tryBook = !!this.book && (this.book.eligible?.(state, { preset, kind, rollout, useBook }) ?? bookEligible(state, { preset, kind, rollout, useBook })) &&
      (this.book.mayHave?.(state) ?? true);
    const sharedChecker =
      !tryBook && kind === "checker" && !rollout && PRESETS[preset]?.plies <= 2;
    let submittedKey = null;
    if (kind === "checker" && submitted) {
      try {
        submittedKey = boardKey(commitTurn(state, submitted));
      } catch (error) {
        return Promise.reject(error);
      }
    }
    const callerKey = positionKey(state);
    // Dice order changes presentation, not the decision. Share both orders of
    // each of the 21 rolls, but tag every result with its caller's exact state.
    if (kind === "checker" && !rollout) state = { ...state, dice: [...state.dice].sort((a, b) => b - a) };
    const evaluationListener = onEvaluation;
    onEvaluation = result => evaluationListener({ ...structuredClone(result), positionKey: callerKey });
    const forCaller = promise => promise.then(source => {
      const result = { ...structuredClone(source), positionKey: callerKey };
      if (!(sharedChecker && submittedKey)) return result;
      const actual = result.candidates.find(c => c.key === submittedKey);
      if (!actual) throw new Error("Submitted result missing from complete legal move set.");
      return { ...result, actual,
        error: Math.max(0, result.candidates[0].equity - actual.equity) };
    });
    const keyFor = actual => JSON.stringify([
      ENGINE_VERSION,
      preset === 'auto' ? ADAPTIVE_SEARCH.version : null,
      positionKey(state),
      preset,
      kind,
      actual,
      rollout,
      tryBook,
    ]);
    const key = keyFor(sharedChecker ? null : submittedKey || submitted);
    // Reuse completed finalists at their chosen depth. A clear-lead stop can
    // grade that leader, but other submissions still require a full search.
    const reuseHintKey = kind === "checker" && !rollout && !tryBook &&
      (preset === "auto" || PRESETS[preset]?.plies > 2) && submittedKey ? keyFor(null) : null;
    if (this.cache.has(key)) {
      const result = this.cache.get(key);
      this.cache.delete(key);
      this.cache.set(key, result);
      return forCaller(Promise.resolve({ ...structuredClone(result), cached: true }));
    }
    const hint = this.cache.get(keyFor(null));
    if (submittedKey && hint?.status === "complete" && hint.type === "checker" &&
        !hint.candidates.some(c => c.key === submittedKey)) onUnlisted();
    const reused = this.reuseGrade(reuseHintKey, preset, submittedKey, readyOnly);
    if (reused) return forCaller(Promise.resolve(reused));
    const existing = [this.active, ...this.queue].find((j) => j?.key === key);
    if (existing) {
      existing.displayOnly &&= displayOnly;
      if (readyOnly) {
        existing.readyOnly = true;
        if (existing === this.active && this.worker)
          this.worker.postMessage({type:'finish-ready', id:existing.id});
      }
      existing.progressListeners.add(onProgress);
      existing.evaluationListeners.add(onEvaluation);
      existing.unlistedListeners.add(onUnlisted);
      if (existing.completed) onEvaluation(existing.completed);
      existing.priority = Math.max(existing.priority, priority);
      this.queue.sort((a, b) => b.priority - a.priority || a.id - b.id);
      if (this.active && existing !== this.active && existing.priority > this.active.priority) {
        if (existing.reuseHintKey === this.active.key || this.sharesPreview(this.active, existing)) {
          if (!existing.displayOnly || this.active.displayOnly) this.active.priority = existing.priority;
          if (readyOnly) this.requestReady(this.active);
        }
        else this.cancelActive("Superseded by the current request.");
      }
      this.pump();
      return forCaller(existing.promise);
    }
    const job = {
      id: ++this.serial,
      key,
      state: structuredClone(state),
      preset,
      kind,
      // UI drafts and saved rollout checkpoints remain editable while a job is
      // queued/loading. Evaluate the request that produced this cache key.
      submitted: sharedChecker ? null : structuredClone(submitted),
      priority,
      rollout: structuredClone(rollout),
      tryBook,
      reuseHintKey,
      hintKey: keyFor(null),
      submittedKey,
      progressListeners: new Set([onProgress]),
      evaluationListeners: new Set([onEvaluation]),
      unlistedListeners: new Set([onUnlisted]),
      readyOnly,
      displayOnly,
    };
    job.promise = new Promise((resolve, reject) =>
      Object.assign(job, { resolve, reject }),
    );
    if (this.queue.length >= 32) {
      job.reject(
        new Error("Analysis queue is full. Cancel queued work first."),
      );
      return job.promise;
    }
    this.queue.push(job);
    this.queue.sort((a, b) => b.priority - a.priority || a.id - b.id);
    if (this.active && priority > this.active.priority) {
      if (reuseHintKey === this.active.key || this.sharesPreview(this.active, job)) {
        if (!job.displayOnly || this.active.displayOnly) this.active.priority = priority;
        if (readyOnly) this.requestReady(this.active);
      }
      else this.cancelActive("Superseded by the current request.");
    }
    this.pump();
    return forCaller(job.promise);
  }
  normalizedPosition(state) {
    return positionKey(state.phase === 'move' ? {...state, dice:[...state.dice].sort((a,b)=>b-a)} : state);
  }
  sharesPreview(active, pending) {
    // A quick display and a deeper search of the same decision can share the
    // first evaluation. Do not discard/reinitialize a warm worker between them.
    return !active.cancelBook && !active.rollout && !pending.rollout &&
      active.kind === pending.kind &&
      ((active.displayOnly && active.preset === 'quick') || (pending.displayOnly && pending.preset === 'quick')) &&
      this.normalizedPosition(active.state) === this.normalizedPosition(pending.state);
  }
  asReady(result) {
    return {...structuredClone(result), ...(result.budget ? {budget:{...structuredClone(result.budget), reason:'ready-to-play'}} : {})};
  }
  rememberDecision(job, result) {
    if (job.rollout || result?.status !== 'complete' ||
        !(result.settings?.plies >= ADAPTIVE_SEARCH.minimumPlies || result.method === 'reference')) return;
    // Revisiting a position can start another adaptive search. Its early
    // checkpoint must not replace a deeper answer we already completed.
    const previous = this.decisions.get(job.key)?.result;
    if (previous && result.method !== 'reference' &&
        (previous.method === 'reference' || previous.settings.plies > result.settings.plies)) return;
    // Excluded shallow scores are not playable finalists. Do not retain their
    // thousands of paths in every completed checkpoint of a doubles search.
    const screen = value => value && (() => {
      const {excluded, initial, ...metadata} = value;
      return {...metadata, ...(initial ? {initial:screen(initial)} : {})};
    })();
    result = {...result, ...(result.screening ? {screening:screen(result.screening)} : {})};
    this.decisions.delete(job.key);
    this.decisions.set(job.key, {position:this.normalizedPosition(job.state), preset:job.preset, result});
    // Also bound retained candidate rows, including screened-out alternatives.
    // Sixty-four large doubles results used to count as only sixty-four items.
    this.trimResults(this.decisions, 16, 2048, entry => entry.result);
  }
  resultWeight(result) {
    let count = result.candidates?.length || 1;
    for (let screen=result.screening; screen; screen=screen.initial) count += screen.excluded?.length || 0;
    return count;
  }
  trimResults(map, count, rows, value = r => r) {
    let weight = [...map.values()].reduce((sum, entry) => sum + this.resultWeight(value(entry)), 0);
    while (map.size && (map.size > count || weight > rows)) {
      const key=map.keys().next().value;
      weight -= this.resultWeight(value(map.get(key))); map.delete(key);
    }
  }
  trimCache() { this.trimResults(this.cache, 64, 4096); }
  readyResult(state, {preset='auto', submitted=null, useBook=true} = {}) {
    const key=this.normalizedPosition(state), actualKey=submitted ? boardKey(commitTurn(state,submitted)) : null;
    let best;
    for (const entry of this.decisions.values()) {
      if (entry.position !== key || entry.preset !== preset) continue;
      const result=entry.result;
      if (!useBook && (result.book || result.method === 'reference')) continue;
      const actual=actualKey && (result.actual?.key === actualKey ? result.actual : result.candidates?.find(c=>c.key===actualKey));
      if (actualKey && !actual) continue;
      // Published references have no tree depth; do not replace their grades
      // with engine scores or mix candidates from different methods/depths.
      if (!best || (result.method === 'reference' && best.method !== 'reference') ||
          (best.method !== 'reference' && result.settings.plies >= best.settings.plies))
        best={...result, ...(actual ? {actual,error:Math.max(0,result.candidates[0].equity-actual.equity)} : {})};
    }
    return best ? {...this.asReady(best),positionKey:positionKey(state),cached:true} : null;
  }
  requestReady(job) {
    job.readyOnly = true;
    if (job === this.active && this.worker) this.worker.postMessage({type:'finish-ready',id:job.id});
  }
  gradeBasis(key, preset, submittedKey, readyOnly = false) {
    if (!key) return null;
    if (readyOnly && preset === 'auto') {
      const ready=this.decisions.get(key)?.result;
      if (ready?.type === 'checker' && ready.engine === ENGINE_VERSION &&
          ready.settings?.plies >= ADAPTIVE_SEARCH.minimumPlies) return ready;
    }
    const hint = this.cache.get(key);
    if (hint?.status !== "complete" || hint.type !== "checker" ||
        (preset === "auto"
          ? !(hint.settings?.plies >= ADAPTIVE_SEARCH.minimumPlies &&
              (["predicted-cost", "maximum-depth"].includes(hint.budget?.reason) ||
                (hint.budget?.reason === 'clear-lead' && hint.candidates?.[0]?.key === submittedKey)))
          : hint.settings?.plies !== PRESETS[preset]?.plies ||
            (hint.settings?.pruning !== false) !== PRESETS[preset]?.pruning)) return null;
    return hint;
  }
  // Display-only snapshots, including completed shallow stages of an Auto
  // search. They never resolve a decision early or change its search depth.
  rememberReading(job, result) {
    if (result?.status !== 'complete') return;
    const previous = this.readings.get(job.key)?.result;
    if (previous && this.betterReading(previous, result)) return;
    this.readings.delete(job.key);
    const value = candidate => candidate && ({key:candidate.key,equity:candidate.equity});
    // The rail needs numbers, not thousands of legal-step/probability arrays.
    const reading = {status:result.status,type:result.type,settings:result.settings,method:result.method,engine:result.engine,reference:result.reference,
      perspective:result.perspective,units:result.units,available:result.available,
      outcomes:result.outcomes,decisionOptions:result.decisionOptions,decision:result.decision,
      candidates:result.candidates?.map(value),actual:value(result.actual)};
    const position = this.normalizedPosition(job.state);
    this.readings.set(job.key, { position, preset:job.preset, result:structuredClone(reading) });
    this.trimResults(this.readings, 64, 4096, entry => entry.result);
    for (const subscription of this.readingListeners) {
      if (subscription.position === position) {
        // A display observer must never interrupt an actual playing decision.
        try { subscription.listener(this.peek(subscription.state, {preset:null, submitted:subscription.submitted})); }
        catch (error) { console.error('Equity display update failed', error); }
      }
    }
  }
  betterReading(a, b) {
    if (a.method === 'reference' || b.method === 'reference') return a.method === 'reference' && b.method !== 'reference';
    return (a.settings?.plies ?? -1) > (b.settings?.plies ?? -1);
  }
  subscribeReading(state, listener, {submitted = null} = {}) {
    const subscription = {state:structuredClone(state), position:this.normalizedPosition(state), submitted:structuredClone(submitted), listener};
    this.readingListeners.add(subscription);
    const ready = this.peek(state, {preset:null, submitted});
    if (ready) listener(ready);
    return () => this.readingListeners.delete(subscription);
  }
  peek(state, { preset = 'auto', submitted = null } = {}) {
    const normalize = s => positionKey(s.phase === 'move' ? {...s, dice:[...s.dice].sort((a,b)=>b-a)} : s);
    const key = normalize(state), actualKey = submitted ? boardKey(commitTurn(state, submitted)) : null;
    let best;
    for (const entry of this.readings.values()) {
      if ((preset !== null && entry.preset !== preset) || entry.position !== key) continue;
      const actual = actualKey && (entry.result.actual?.key === actualKey ? entry.result.actual
        : entry.result.candidates?.find(c => c.key === actualKey));
      if (actualKey && !actual) continue;
      if (!best || !this.betterReading(best, entry.result)) {
        best = {...entry.result, actual:actual || undefined};
      }
    }
    return best ? {...structuredClone(best), positionKey:positionKey(state), cached:true} : null;
  }
  reuseGrade(key, preset, submittedKey, readyOnly = false) {
    const hint=this.gradeBasis(key,preset,submittedKey,readyOnly);
    if (!hint?.candidates?.some(c=>c.key===submittedKey)) return null;
    if (this.cache.has(key)) { this.cache.delete(key); this.cache.set(key, hint); }
    const result = structuredClone(hint);
    const actual = result.candidates.find(c => c.key === submittedKey);
    return { ...result, actual, error: Math.max(0, result.candidates[0].equity - actual.equity),
      cached: true, reusedHint: true };
  }
  async pump() {
    if (this.retiring) {
      // A real decision must not wait for an obsolete native call. Background
      // cancellations can wait longer for the next safe checkpoint.
      if (this.queue.some(job => job.priority >= 0) && !this.retiring.urgent) {
        this.retiring.urgent = true;
        this.armRetirement(100);
      }
      return;
    }
    if (this.active || !this.queue.length || this.pumping) return;
    this.pumping = true;
    let generation = this.generation;
    try {
      const pending = this.queue[0];
      const hint = this.cache.get(pending.hintKey);
      if (pending.submittedKey && hint?.status === "complete" && hint.type === "checker" &&
          !hint.candidates.some(c => c.key === pending.submittedKey))
        for (const listener of pending.unlistedListeners) listener();
      // A matching hint may have completed while this grade was queued. Check
      // before starting or messaging a worker, including concurrent callers.
      const reused = this.reuseGrade(pending.reuseHintKey, pending.preset, pending.submittedKey, pending.readyOnly);
      if (reused) {
        this.queue.shift();
        pending.resolve({ ...reused, requestId: pending.id });
        return;
      }
      if (pending.tryBook) {
        this.queue.shift(); this.active = pending;
        const cancelled = new Promise(resolve => { pending.cancelBook = () => resolve(null); });
        const result = await Promise.race([cancelled, this.book.lookup(pending.state, { ...pending, onUnlisted: () => {
          if (this.active === pending) for (const listener of pending.unlistedListeners) listener();
        } })]);
        delete pending.cancelBook;
        if (this.active !== pending) return;
        generation = this.generation;
        if (result) {
          this.active = null;
          result.requestId = pending.id;
          this.cache.set(pending.key, structuredClone(result));
          this.rememberReading(pending, result);
          this.rememberDecision(pending, result);
          this.trimCache();
          pending.resolve(result);
          this.onStatus("ready", `Opening book · ${result.method === "reference" ? "XG published reference" : result.method === "rollout" ? `${result.settings.trials} rollout trials` : `${result.settings.plies} ply`} · ready`);
          return;
        }
        this.active = null; this.queue.unshift(pending);
      }
      const ready = this.start();
      generation = this.generation;
      await ready;
      if (generation !== this.generation) return;
      if (!this.queue.length) return;
      const job = this.queue.shift();
      this.active = job;
      job.started = performance.now();
      this.onStatus("busy", job.rollout ? "Running GNUbg rollout…" : job.preset === "auto" ? `Analyzing · at least ${ADAPTIVE_SEARCH.minimumPlies} ply…` : `Evaluating ${this.presetNames[job.preset] || job.preset}…`);
      this.worker.postMessage({
        id: job.id,
        type: "analyze",
        state: job.state,
        preset: job.preset,
        kind: job.kind,
        submitted: job.submitted,
        rollout: job.rollout,
        readyOnly: job.readyOnly,
        // An unlisted actual move needs one same-depth score, not another
        // adaptive search of alternatives already completed at that depth.
        prepared: this.gradeBasis(job.reuseHintKey, job.preset, job.submittedKey, job.readyOnly),
      });
      this.jobTimeout = setTimeout(
        () =>
          this.fail(
            new Error(
              "Analysis reached its time limit. Completed rollout batches can be resumed; try a shallower tree setting.",
            ),
          ),
        job.displayOnly && job.preset === 'quick' ? 5000 :
        job.rollout || PRESETS[job.preset]?.plies >= 3
          ? (PRESETS[job.preset]?.plies >= 5 ? 86400000 : 1800000)
          : 300000,
      );
    } catch (e) {
      // A cancelled initializer must not reject work queued for its replacement.
      if (generation === this.generation) this.fail(e);
    } finally {
      this.pumping = false;
      if (!this.active && this.queue.length) this.pump();
    }
  }
  armRetirement(milliseconds) {
    clearTimeout(this.retireTimer);
    this.retireTimer = setTimeout(() => {
      this.releaseWorker();
      this.pump();
    }, milliseconds);
  }
  retireWorker(job) {
    if (job && this.ready && this.startup?.cooperativeCancellation) {
      this.retiring = {id:job.id, urgent:this.queue.some(pending => pending.priority >= 0)};
      // On a slow phone one native candidate may exceed a second. If nobody
      // needs the engine yet, let it reach its cancellation checkpoint rather
      // than repeatedly allocate another WASM heap. Foreground work still
      // shortens this to 100 ms in pump(). The fallback remains bounded.
      this.armRetirement(this.retiring.urgent ? 100 : 5000);
      try { this.worker.postMessage({type:"cancel", id:job.id}); }
      catch { this.releaseWorker(); }
    } else this.releaseWorker();
  }
  releaseWorker() {
    clearTimeout(this.retireTimer);
    this.retiring = null;
    this.generation++;
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
  }
  cancelActive(message = "Analysis cancelled.", reuse = true) {
    clearTimeout(this.jobTimeout);
    clearTimeout(this.initTimeout);
    const job = this.active;
    if (job?.cancelBook) {
      job.cancelBook();
      if (!reuse) this.releaseWorker();
    }
    else if (reuse) this.retireWorker(job);
    else this.releaseWorker();
    const error = new DOMException(message, "AbortError");
    this.active?.reject(error);
    this.active = null;
    this.initReject?.(error);
    this.initReject = null;
    this.initializing = null;
    this.onStatus("idle", message);
  }
  cancelWhere(predicate) {
    const rejected = this.queue.filter(predicate);
    this.queue = this.queue.filter(job => !predicate(job));
    for (const job of rejected) job.reject(new DOMException("Background analysis superseded.", "AbortError"));
    if (this.active && predicate(this.active)) this.cancelActive();
    this.pump();
  }
  cancel() {
    for (const j of this.queue.splice(0))
      j.reject(new DOMException("Analysis cancelled.", "AbortError"));
    this.cancelActive("Analysis cancelled.", false);
  }
  fail(error) {
    this.active?.cancelBook?.();
    for (const j of this.queue.splice(0)) j.reject(error);
    if (this.active?.readyOnly && this.active.completed?.settings?.plies >= ADAPTIVE_SEARCH.minimumPlies)
      this.active.resolve(this.asReady(this.active.completed));
    else this.active?.reject(error);
    this.active = null;
    this.initReject?.(error);
    this.initReject = null;
    clearTimeout(this.initTimeout);
    clearTimeout(this.jobTimeout);
    this.releaseWorker();
    this.initializing = null;
    this.onStatus("error", error.message);
  }
  destroy() {
    this.cancel();
    this.cache.clear();
    this.readings.clear();
    this.decisions.clear();
  }
}
