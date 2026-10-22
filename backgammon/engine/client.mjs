// SPDX-License-Identifier: GPL-3.0-or-later
import { positionKey, boardKey, commitTurn } from "../core/rules.mjs";
import { ENGINE_VERSION, PRESETS } from "./metadata.mjs";
import { ADAPTIVE_SEARCH } from "./adaptive.mjs";
import { bookEligible } from "./opening-book.mjs";
import { PreferredOpeningBook } from "./xg-reference-book.mjs";
// One worker, bounded LRU, priority queue. Termination is intentional: WASM calls are synchronous.
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
          if (data.type === "evaluation" && job.preset === "auto" && !job.rollout) {
            job.completed = data.result;
            this.rememberReading(job, data.result);
            try {
              for (const listener of job.evaluationListeners) listener(structuredClone(data.result));
            } catch (e) {
              this.fail(e);
              return;
            }
            // Intermediate 0/1-ply updates do not resolve Auto. The worker must
            // complete at least 2 ply, regardless of how long earlier stages took.
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
            job.reject(new Error("Automatic analysis ended before the required 2 ply. Retry the analysis."));
            this.onStatus("error", "Automatic analysis did not complete 2 ply.");
            this.pump();
            return;
          }
          if (data.type === "error") job.reject(new Error(data.message));
          else {
            // Returned results are editable previews; never expose the object
            // retained for future hints/grades to a caller's mutations.
            this.cache.set(job.key, structuredClone(data.result));
            this.rememberReading(job, data.result);
            while (this.cache.size > 64)
              this.cache.delete(this.cache.keys().next().value);
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
    } = {},
  ) {
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
    const reused = this.reuseGrade(reuseHintKey, preset, submittedKey);
    if (reused) return forCaller(Promise.resolve(reused));
    const existing = [this.active, ...this.queue].find((j) => j?.key === key);
    if (existing) {
      existing.progressListeners.add(onProgress);
      existing.evaluationListeners.add(onEvaluation);
      existing.unlistedListeners.add(onUnlisted);
      if (existing.completed) onEvaluation(existing.completed);
      existing.priority = Math.max(existing.priority, priority);
      this.queue.sort((a, b) => b.priority - a.priority || a.id - b.id);
      if (this.active && existing !== this.active && existing.priority > this.active.priority) {
        if (existing.reuseHintKey === this.active.key) this.active.priority = existing.priority;
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
      if (reuseHintKey === this.active.key) this.active.priority = priority;
      else this.cancelActive("Superseded by the current request.");
    }
    this.pump();
    return forCaller(job.promise);
  }
  gradeBasis(key, preset, submittedKey) {
    if (!key) return null;
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
    this.readings.delete(job.key);
    const value = candidate => candidate && ({key:candidate.key,equity:candidate.equity});
    // The rail needs numbers, not thousands of legal-step/probability arrays.
    const reading = {status:result.status,type:result.type,settings:result.settings,method:result.method,engine:result.engine,reference:result.reference,
      perspective:result.perspective,units:result.units,available:result.available,
      outcomes:result.outcomes,decisionOptions:result.decisionOptions,decision:result.decision,
      candidates:result.candidates?.map(value),actual:value(result.actual)};
    this.readings.set(job.key, { position:positionKey(job.state), preset:job.preset, result:structuredClone(reading) });
    while (this.readings.size > 64) this.readings.delete(this.readings.keys().next().value);
  }
  peek(state, { preset = 'auto', submitted = null } = {}) {
    const normalize = s => positionKey(s.phase === 'move' ? {...s, dice:[...s.dice].sort((a,b)=>b-a)} : s);
    const key = normalize(state), actualKey = submitted ? boardKey(commitTurn(state, submitted)) : null;
    let best;
    for (const entry of this.readings.values()) {
      if (entry.preset !== preset || entry.position !== key) continue;
      const actual = actualKey && (entry.result.actual?.key === actualKey ? entry.result.actual
        : entry.result.candidates?.find(c => c.key === actualKey));
      if (actualKey && !actual) continue;
      if (!best || entry.result.settings.plies >= best.settings.plies) {
        best = {...entry.result, actual:actual || undefined};
      }
    }
    return best ? {...structuredClone(best), positionKey:positionKey(state), cached:true} : null;
  }
  reuseGrade(key, preset, submittedKey) {
    const hint=this.gradeBasis(key,preset,submittedKey);
    if (!hint?.candidates?.some(c=>c.key===submittedKey)) return null;
    this.cache.delete(key); this.cache.set(key, hint);
    const result = structuredClone(hint);
    const actual = result.candidates.find(c => c.key === submittedKey);
    return { ...result, actual, error: Math.max(0, result.candidates[0].equity - actual.equity),
      cached: true, reusedHint: true };
  }
  async pump() {
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
      const reused = this.reuseGrade(pending.reuseHintKey, pending.preset, pending.submittedKey);
      if (reused) {
        this.queue.shift();
        pending.resolve({ ...reused, requestId: pending.id });
        return;
      }
      if (pending.tryBook) {
        this.queue.shift(); this.active = pending;
        const result = await this.book.lookup(pending.state, { ...pending, onUnlisted: () => {
          if (this.active === pending) for (const listener of pending.unlistedListeners) listener();
        } });
        if (this.active !== pending) return;
        generation = this.generation;
        if (result) {
          this.active = null;
          result.requestId = pending.id;
          this.cache.set(pending.key, structuredClone(result));
          this.rememberReading(pending, result);
          while (this.cache.size > 64) this.cache.delete(this.cache.keys().next().value);
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
      this.onStatus("busy", job.rollout ? "Running GNUbg rollout…" : job.preset === "auto" ? "Analyzing · at least 2 ply…" : `Evaluating ${this.presetNames[job.preset] || job.preset}…`);
      this.worker.postMessage({
        id: job.id,
        type: "analyze",
        state: job.state,
        preset: job.preset,
        kind: job.kind,
        submitted: job.submitted,
        rollout: job.rollout,
        // An unlisted actual move needs one same-depth score, not another
        // adaptive search of alternatives already completed at that depth.
        prepared: this.gradeBasis(job.reuseHintKey, job.preset, job.submittedKey),
      });
      this.jobTimeout = setTimeout(
        () =>
          this.fail(
            new Error(
              "Analysis reached its time limit. Completed rollout batches can be resumed; try a shallower tree setting.",
            ),
          ),
        job.rollout || ["expert", "research", "verify"].includes(job.preset)
          ? 1800000
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
  cancelActive(message = "Analysis cancelled.") {
    clearTimeout(this.jobTimeout);
    clearTimeout(this.initTimeout);
    this.generation++;
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
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
    this.cancelActive();
  }
  fail(error) {
    for (const j of this.queue.splice(0)) j.reject(error);
    this.active?.reject(error);
    this.active = null;
    this.initReject?.(error);
    this.initReject = null;
    clearTimeout(this.initTimeout);
    clearTimeout(this.jobTimeout);
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
    this.initializing = null;
    this.generation++;
    this.onStatus("error", error.message);
  }
  destroy() {
    this.cancel();
    this.cache.clear();
    this.readings.clear();
  }
}
