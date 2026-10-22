/* Hidden-deck Monte Carlo tree search. Accepts only Scoundrel.observe(state).
 * Future choices depend on revealed state; unseen cards are drawn on demand.
 * Rollout heuristics and statistical allocation are approximate, not proofs.
 */
(function (root) {
  "use strict";
  const E = root.Scoundrel || (typeof require === "function" ? require("./engine.js") : null);
  const encode = c => c.value + (c.type === "weapon" ? 16 : c.type === "potion" ? 32 : 0);
  const value = c => c & 15, type = c => c >> 4;
  function pack(o) {
    if ("deck" in o || "initialDeck" in o || "seed" in o || !Array.isArray(o.unknownCards) || !Array.isArray(o.bottom)) throw Error("Analysis requires a public observation, never a private deck");
    return { u: o.unknownCards.map(encode).sort((a, b) => a - b), b: o.bottom.map(encode), r: o.room.filter(Boolean).map(encode), h: o.health, w: o.weapon?.value || 0, l: E.weaponLimit(o), p: +o.potionUsed, f: +E.canFlee(o), g: +(o.phase === "ready") };
  }
  function key(s) {
    return String.fromCharCode(...s.u) + "/" + String.fromCharCode(...s.b) + "/" + String.fromCharCode(...(s.f ? s.r : s.r.slice().sort((a, b) => a - b))) + "/" + [s.h, s.w, s.l, s.p, s.f, s.g].join(",");
  }
  function seedFor(s) { let seed = 2166136261; for (const c of key(s)) seed = Math.imul(seed ^ c.charCodeAt(0), 16777619); return seed >>> 0 || 1; }
  function random(seed) { let x = seed >>> 0 || 1; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; }; }
  function moves(s) {
    if (s.g) return [130];
    const result = [];
    for (const c of new Set(s.r)) { result.push(c); if (type(c) === 0 && s.w && value(c) < s.l) result.push(c | 64); }
    if (s.f) { result.push(128); if (s.r.some((c, i) => c !== s.r[s.r.length - 1 - i])) result.push(129); }
    return result.sort((a, b) => a - b);
  }
  const remaining = s => s.u.length + s.b.length + s.r.length;
  const damageLeft = s => [...s.u, ...s.b, ...s.r].reduce((sum, c) => sum + (type(c) === 0 ? value(c) : 0), 0);
  function step(s, move, rng, deferDraw = false) {
    const n = { ...s, u: s.u.slice(), b: s.b.slice(), r: s.r.slice() };
    const draw = () => { if (deferDraw) { n.drawPending = 1; return; } while (n.r.length < 4 && (n.u.length || n.b.length)) n.r.push(n.u.length ? n.u.splice(Math.floor(rng() * n.u.length), 1)[0] : n.b.shift()); };
    const fullRoom = () => (deferDraw ? Math.min(4, remaining(n)) : n.r.length) === 4;
    if (move >= 128) {
      if (move !== 130) { n.b.push(...(move === 129 ? n.r.slice().reverse() : n.r)); n.r = []; }
      draw(); n.p = 0; n.g = 0; n.f = +(move === 130 && fullRoom());
      return { state: n };
    }
    const c = move & 63, v = value(c), t = type(c);
    n.r.splice(n.r.indexOf(c), 1); n.f = 0;
    if (t === 1) { n.w = v; n.l = 15; }
    else if (t === 2) { if (!n.p) n.h = Math.min(20, n.h + v); n.p = 1; }
    else { n.h -= move & 64 ? Math.max(0, v - n.w) : v; if (move & 64) n.l = v; }
    if (n.h <= 0) return { score: n.h - damageLeft(n) };
    if (!remaining(n)) return { score: n.h + (n.h === 20 && t === 2 ? v : 0) };
    if (n.r.length === 1 && (n.u.length || n.b.length)) { draw(); n.p = 0; n.f = +fullRoom(); }
    return { state: n };
  }
  // Compare complete public successor distributions, before sampling any draw.
  // Room order matters again when avoidance becomes available; bottom order
  // always matters. Equal immediate healing/damage alone is insufficient.
  function outcomeKey(s, move) {
    const next = step(s, move, null, true);
    if (next.score != null) return "score:" + next.score;
    const n = next.state;
    // Used potions in a final room below 20 can neither heal nor earn a bonus.
    if (n.p && n.h < 20 && !n.u.length && !n.b.length) n.r = n.r.map(c => type(c) === 2 ? 32 : c);
    return (n.drawPending || 0) + ":" + key(n);
  }
  function actionGroups(s) {
    const groups = new Map();
    for (const move of moves(s)) {
      const signature = outcomeKey(s, move);
      if (groups.has(signature)) groups.get(signature).moves.push(move);
      else groups.set(signature, { move, moves: [move] });
    }
    return [...groups.values()];
  }
  function preference(s, move) {
    if (move === 130) return 0;
    if (move >= 128) {
      const costs = s.r.map(c => type(c) ? 0 : s.w && value(c) < s.l ? Math.max(0, value(c) - s.w) : value(c)).sort((a, b) => a - b);
      const healing = Math.max(0, ...s.r.filter(c => type(c) === 2).map(c => Math.min(value(c), 20 - s.h)));
      const weapon = Math.max(s.w, ...s.r.filter(c => type(c) === 1).map(value));
      return -4 + costs.slice(0, 3).reduce((a, b) => a + b, 0) * 1.3 - healing * .8 - (weapon - s.w) * 1.5;
    }
    const c = move & 63, v = value(c), t = type(c);
    if (t === 1) return (v - s.w * (s.l - 2) / 13) * 2 + 3;
    if (t === 2) return s.p ? -12 : Math.min(v, 20 - s.h) * 1.7 - v * .55;
    const damage = move & 64 ? Math.max(0, v - s.w) : v;
    return (move & 64 ? 4 + v * .4 - (s.l - v) / 13 * Math.min(s.w, 6) : 0) - damage * 2.5 - (damage >= s.h ? 500 : 0);
  }
  function actionMove(o, action) {
    if (action.type === "descend") return 130;
    if (action.type === "flee") return action.direction === "right" ? 129 : 128;
    const c = o.room.find(c => c?.id === action.id);
    return encode(c) | (action.mode === "weapon" ? 64 : 0);
  }
  // Plan the visible room before rollout. This search stops before a draw;
  // it cannot pick a line based on cards that have not been revealed yet.
  function roomPlan(s, cache) {
    const hasDeck = !!(s.u.length || s.b.length);
    function visit(q) {
      const k = q.r.slice().sort((a, b) => a - b).reduce((n, c, i) => n + c * 2 ** (6 * i), 0) + q.h * 2 ** 24 + q.w * 2 ** 29 + q.l * 2 ** 33 + q.p * 2 ** 37 + (+hasDeck) * 2 ** 38;
      if (cache.has(k)) return cache.get(k);
      let best = { move: null, value: -Infinity };
      for (const move of moves({ ...q, f: 0, g: 0 })) {
        const n = { ...q, r: q.r.slice() }, c = move & 63, v = value(c), t = type(c);
        n.r.splice(n.r.indexOf(c), 1);
        if (t === 1) { n.w = v; n.l = 15; }
        else if (t === 2) { if (!n.p) n.h = Math.min(20, n.h + v); n.p = 1; }
        else { n.h -= move & 64 ? Math.max(0, v - n.w) : v; if (move & 64) n.l = v; }
        let utility;
        if (n.h <= 0) utility = -10000 + n.h - n.r.filter(c => type(c) === 0).reduce((sum, c) => sum + value(c), 0);
        else if (!n.r.length) utility = n.h + (n.h === 20 && t === 2 ? v : 0);
        else if (n.r.length === 1 && hasDeck) {
          const power = n.w * (n.l - 2) / 13, carry = n.r[0], rank = value(carry);
          const item = type(carry) === 2 ? rank * .55 : type(carry) === 1 ? Math.max(0, rank - power) * .7 : -Math.max(0, rank - (n.w && rank < n.l ? n.w : 0)) * .7;
          utility = n.h - Math.max(0, 7 - n.h) ** 2 * .5 + power * 1.3 + item;
        } else utility = visit(n).value;
        if (utility > best.value + 1e-9) best = { move, value: utility };
      }
      if (cache.size > 60000) cache.clear();
      cache.set(k, best); return best;
    }
    return visit(s);
  }
  function analyze(observation, options = {}) {
    const initial = pack(observation), rng = random(seedFor(initial));
    const started = Date.now(), iterations = options.iterations ?? 12000, timeMs = options.timeMs ?? 1800;
    const tree = new Map(), endgames = new Map(), plans = new Map();
    let simulations = 0, heuristicSkips = 0;
    function known(s) {
      const k = key(s); if (endgames.has(k)) return endgames.get(k);
      let best = -Infinity;
      for (const m of moves(s)) { const n = step(s, m, rng); best = Math.max(best, n.score ?? known(n.state)); }
      endgames.set(k, best); return best;
    }
    const canFinish = s => !s.u.length && remaining(s) <= 8;
    function makeNode(s) {
      const actions = actionGroups(s).map(group => ({ ...group, prior: preference(s, group.move), n: 0, sum: 0, squares: 0, exact: false }));
      // A fatal hit or final card has a determined score, regardless of shuffle.
      for (const a of actions) {
        const noDraw = () => 0;
        const next = step(s, a.move, noDraw);
        if (next.score != null || canFinish(s)) { const score = next.score ?? known(next.state); Object.assign(a, { n: 1, sum: score, squares: score * score, exact: true }); }
      }
      return { actions, n: 0 };
    }
    const mean = a => a.sum / a.n;
    const uncertainty = a => a.exact ? 0 : a.n < 2 ? Infinity : Math.sqrt(Math.max(0, a.squares / a.n - mean(a) ** 2) / a.n);
    function choose(node, rootNode = false) {
      const unvisited = node.actions.filter(a => !a.n);
      if (unvisited.length) return unvisited.sort((a, b) => (Math.abs(b.prior - a.prior) > 1e-9 ? b.prior - a.prior : a.move - b.move))[0];
      if (rootNode) {
        const initial = node.actions.filter(a => !a.exact && a.n < 48).sort((a, b) => a.n - b.n || (Math.abs(b.prior - a.prior) > 1e-9 ? b.prior - a.prior : a.move - b.move));
        if (initial.length) return initial[0];
      }
      const floor = Math.max(...node.actions.map(a => mean(a) - (a.exact ? 0 : 2.5 * uncertainty(a))));
      let winner = null, high = -Infinity;
      for (const a of node.actions) {
        // Approximate racing: retain a minimum allocation for every root action.
        // This is a search heuristic, never an optimality certificate.
        if (a.n >= (rootNode ? 48 : 12) && !a.exact && mean(a) + 2.5 * uncertainty(a) < floor) { heuristicSkips++; continue; }
        const rank = a.exact ? mean(a) : mean(a) + 65 * Math.sqrt(Math.log(node.n + 2) / a.n) + a.prior / (a.n + 1);
        if (rank > high + 1e-9) { winner = a; high = rank; }
      }
      return winner;
    }
    function rollout(s) {
      while (true) {
        if (!s.u.length && remaining(s) <= 4) return known(s);
        const plan = s.g ? { move: 130, value: 0 } : roomPlan(s, plans);
        const current = s.h - Math.max(0, 7 - s.h) ** 2 * .5 + s.w * (s.l - 2) / 13 * 1.3;
        const move = s.f && plan.value < current - 7 - 1e-9 ? 128 : plan.move;
        const next = step(s, move, rng); if (next.score != null) return next.score; s = next.state;
      }
    }
    const rootNode = makeNode(initial); tree.set(key(initial), rootNode);
    const results = () => E.actions(observation).map(action => {
      let m = actionMove(observation, action);
      if (m === 129 && !rootNode.actions.some(a => a.moves.includes(129))) m = 128;
      const a = rootNode.actions.find(a => a.moves.includes(m));
      return { action, equivalence: a.move, score: a.n ? mean(a) : null, samples: a.n, standardError: Number.isFinite(uncertainty(a)) ? uncertainty(a) : null, exact: a.exact };
    });
    if (!rootNode.actions.every(a => a.exact)) for (; simulations < iterations; simulations++) {
      let s = initial, score, path = [];
      for (let depth = 0; ; depth++) {
        const k = key(s); let node = tree.get(k);
        if (!node || depth >= 9) {
          if (!node && tree.size < 12000) tree.set(k, makeNode(s));
          score = rollout(s); break;
        }
        const a = choose(node, node === rootNode); path.push([node, a]);
        if (a.exact) { score = mean(a); break; }
        const next = step(s, a.move, rng);
        if (next.score != null) { score = next.score; break; }
        s = next.state;
      }
      for (const [node, a] of path) { node.n++; if (!a.exact) { a.n++; a.sum += score; a.squares += score * score; } }
      if (options.onProgress && (simulations + 1) % (options.progressInterval ?? 128) === 0) {
        options.onProgress?.({ results: results(), simulations: simulations + 1, heuristicSkips });
      }
      if ((simulations & 127) === 127) {
        if (Date.now() - started >= timeMs && rootNode.actions.every(a => a.n)) { simulations++; break; }
      }
    }
    const rows = results(), best = rows.filter(r => r.score != null).sort((a, b) => b.score - a.score)[0];
    return { action: best?.action, score: best?.score, results: rows, simulations, heuristicSkips, elapsed: Date.now() - started, method: "hidden-deck-mcts" };
  }
  const api = { analyze, pack, key, seedFor, random, moves, step, outcomeKey, actionGroups, preference, roomPlan, actionMove, encode };
  root.ScoundrelSolver = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : globalThis);
