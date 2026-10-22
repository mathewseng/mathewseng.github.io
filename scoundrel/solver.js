/* Perfect-information, anytime branch-and-bound search. Runs in a Web Worker.
 * A reported score always has a complete, legal witness line. `exact` means
 * exhaustive search or an attained admissible upper bound proves optimality.
 */
(function (root) {
  "use strict";
  const E = root.Scoundrel || (typeof require === "function" ? require("./engine.js") : null);
  const encode = (c) => c.value + (c.type === "weapon" ? 16 : c.type === "potion" ? 32 : 0);
  const value = (c) => c & 15;
  const type = (c) => c >> 4;
  const pack = (s) => ({ d: s.deck.map(encode), r: s.room.filter(Boolean).map(encode), h: s.health, w: s.weapon?.value || 0, l: E.weaponLimit(s), p: s.potionUsed, f: E.canFlee(s) });
  // Room order matters when fleeing: those cards are queued in that order.
  const key = (s) => String.fromCharCode(...s.d) + "/" + String.fromCharCode(...(s.f ? s.r : s.r.slice().sort((a, b) => a - b))) + "/" + [s.h, s.w, s.l, +s.p, +s.f].join(",");
  const damageLeft = (s) => [...s.d, ...s.r].reduce((n, c) => n + (type(c) === 0 ? value(c) : 0), 0);

  function upperBound(s) {
    let potion = 0, healing = 0;
    for (const c of [...s.d, ...s.r]) if (type(c) === 2) { potion = Math.max(potion, value(c)); healing += value(c); }
    const health = Math.min(20, s.h + healing);
    return health + (health === 20 ? potion : 0);
  }

  function moves(s) {
    const result = [], seen = new Set();
    for (const c of s.r) {
      if (seen.has(c)) continue;
      seen.add(c);
      if (type(c) === 0) {
        if (s.w && value(c) < s.l) result.push({ c, armed: true });
        result.push({ c, armed: false });
      } else result.push({ c });
    }
    if (s.f) result.push({ flee: true });
    return result;
  }

  function preference(s, m) {
    if (m.flee) return s.r.filter((c) => type(c) === 0).length >= 3 ? 6 : -15;
    const v = value(m.c);
    if (type(m.c) === 1) return 12 + (v - s.w) * 2 + (s.l < 8 ? 8 : 0);
    if (type(m.c) === 2) return s.p ? -24 : Math.min(v, 20 - s.h) * 2 - (s.h === 20 ? 18 : 0);
    const damage = m.armed ? Math.max(0, v - s.w) : v;
    return (m.armed ? 15 + v * 0.3 : 0) - damage * 3 - (damage >= s.h ? 80 : 0);
  }

  function step(s, m) {
    const n = { ...s, r: s.r.slice(), d: s.d };
    if (m.flee) {
      const d = [...s.d, ...s.r];
      n.r = d.slice(0, 4); n.d = d.slice(4); n.p = false; n.f = false;
      return { state: n };
    }
    n.r.splice(n.r.indexOf(m.c), 1);
    n.f = false;
    const v = value(m.c), t = type(m.c);
    if (t === 1) { n.w = v; n.l = 15; }
    else if (t === 2) { if (!s.p) n.h = Math.min(20, s.h + v); n.p = true; }
    else { n.h -= m.armed ? Math.max(0, v - s.w) : v; if (m.armed) n.l = v; }
    if (n.h <= 0) return { score: n.h - damageLeft(n) };
    if (!n.r.length && !n.d.length) return { score: n.h + (n.h === 20 && t === 2 ? v : 0) };
    if (n.r.length === 1 && n.d.length) {
      const draw = Math.min(3, n.d.length);
      n.r = [...n.r, ...n.d.slice(0, draw)]; n.d = n.d.slice(draw); n.p = false;
      n.f = n.r.length === 4;
      return { state: n, advanced: true };
    }
    return { state: n };
  }

  function toAction(state, move) {
    if (!move) return null;
    if (move.flee) return { type: "flee" };
    const c = state.room.find((c) => c && encode(c) === move.c);
    return c ? { type: c.type === "weapon" ? "equip" : c.type === "potion" ? "drink" : "fight", id: c.id, ...(c.type === "monster" ? { mode: move.armed ? "weapon" : "bare" } : {}) } : null;
  }

  function solve(state, options = {}) {
    if (state.phase === "ready") {
      const action = { type: "descend" };
      const result = solve(E.transition(state, action), { ...options, incumbentLine: options.incumbentLine?.[0]?.type === "descend" ? options.incumbentLine.slice(1) : options.incumbentLine });
      return { ...result, action, forced: true, line: [action, ...(result.line || [])] };
    }
    if (state.phase !== "playing") return { action: null, exact: true, score: E.score(state), nodes: 0 };
    const started = Date.now(), budget = options.timeMs ?? 2200, maxNodes = options.maxNodes ?? 220000;
    const rng = E.random(state.seed + ":" + state.steps), initial = pack(state), ceiling = upperBound(initial);
    let nodes = 0, best = null, aborted = false;
    const memo = new Map(), witnesses = new Map();
    if (options.incumbentLine?.length) {
      let actual = state;
      const saved = [];
      for (const action of options.incumbentLine) {
        if (actual.phase === "won" || actual.phase === "lost") break;
        if (action.type !== "descend") {
          const c = actual.room.find((c) => c?.id === action.id);
          saved.push({ before: pack(actual), move: action.type === "flee" ? { flee: true } : { c: encode(c), ...(c.type === "monster" ? { armed: action.mode === "weapon" } : {}) } });
        }
        actual = E.transition(actual, action);
      }
      const terminal = E.score(actual);
      if (terminal != null) {
        let result = { score: terminal, move: null, child: null, exact: true };
        for (let j = saved.length - 1; j >= 0; j--) {
          result = { score: terminal, move: saved[j].move, child: result, exact: terminal === upperBound(saved[j].before) };
          witnesses.set(key(saved[j].before), result);
        }
        best = result;
      }
    }

    // Complete sampled trajectories give a quick, verifiable initial answer.
    // Every root action receives equal rollout effort before deep search.
    const roots = moves(initial).sort((a, b) => preference(initial, b) - preference(initial, a));
    const rollouts = options.rollouts ?? 48;
    for (let i = 0; i < rollouts; i++) {
      const first = roots[i % roots.length];
      let s = initial, move = first, path = [], states = [], terminal;
      while (true) {
        nodes++; states.push(s); path.push(move);
        const next = step(s, move);
        if (next.score != null) { terminal = next.score; break; }
        s = next.state;
        const choices = moves(s);
        move = choices.reduce((winner, candidate) => {
          const rank = preference(s, candidate) + (i < roots.length ? 0 : -Math.log(Math.max(0.00001, rng())) * 14);
          return !winner || rank > winner.rank ? { move: candidate, rank } : winner;
        }, null).move;
      }
      let result = { score: terminal, move: null, child: null, exact: true };
      for (let j = path.length - 1; j >= 0; j--) {
        result = { score: terminal, move: path[j], child: result, exact: terminal === upperBound(states[j]) };
        const k = key(states[j]), old = witnesses.get(k);
        if (!old || result.score > old.score) witnesses.set(k, result);
      }
      if (!best || result.score > best.score) best = result;
      if (best.score === ceiling) break;
      if (Date.now() - started > budget * 0.25) break;
    }
    // Search whole rooms in a beam before DFS. This gives long-term planning
    // across every room, rather than spending the budget in one opening branch.
    // Beam pruning is explicitly approximate; only reaching the upper bound
    // or the subsequent exhaustive search can certify the answer.
    if (best?.score !== ceiling) {
      const width = options.beamWidth ?? 32;
      let frontier = [{ s: initial, trace: null }];
      const remember = (trace, score) => {
        if (best && score <= best.score) return;
        const path = [];
        for (let t = trace; t; t = t.parent) path.push(t);
        let result = { score, move: null, child: null, exact: true };
        for (const t of path) {
          result = { score, move: t.move, child: result, exact: score === upperBound(t.before) };
          const k = key(t.before), old = witnesses.get(k);
          if (!old || score > old.score) witnesses.set(k, result);
        }
        if (!best || score > best.score) best = result;
      };
      let stopBeam = false;
      for (let layer = 0; frontier.length && layer < 16 && !stopBeam; layer++) {
        const candidates = new Map();
        const expand = (s, trace, count) => {
          for (const move of moves(s)) {
            nodes++;
            const next = step(s, move), link = { move, before: s, parent: trace };
            if (next.score != null) { remember(link, next.score); if (best.score === ceiling) { stopBeam = true; return; } continue; }
            const taken = count + (move.flee ? 0 : 1);
            if (next.advanced) {
              const n = next.state;
              // Health dominance is safe: having extra health can never make
              // any future choice worse. All other state is kept identical.
              const k = key({ ...n, h: 0 }), old = candidates.get(k);
              if (!old || n.h > old.s.h) candidates.set(k, { s: n, trace: link });
            } else expand(next.state, link, taken);
            if (stopBeam) return;
          }
        };
        for (const node of frontier) {
          expand(node.s, node.trace, 0);
          if (stopBeam) break;
          if ((nodes & 255) < 100 && Date.now() - started > budget * 0.72) { stopBeam = true; break; }
        }
        const rank = (s) => {
          const cards = [...s.d, ...s.r], weapons = cards.filter((c) => type(c) === 1).map(value).sort((a, b) => b - a);
          let cost = 0, healing = 0;
          for (let v = 2; v <= 14; v++) {
            const count = cards.filter((c) => type(c) === 0 && value(c) === v).length;
            const available = [...weapons, ...(s.w && v < s.l ? [s.w] : [])].sort((a, b) => b - a);
            for (let i = 0; i < count; i++) cost += Math.max(0, v - (available[i] || 0));
          }
          for (const c of cards) if (type(c) === 2) healing += value(c);
          return s.h + healing * 0.55 - cost + s.w * 0.25 + (s.w ? s.l * 0.12 : 0);
        };
        frontier = [...candidates.values()].map((node) => ({ ...node, rank: rank(node.s) })).sort((a, b) => b.rank - a.rank).slice(0, width);
      }
    }
    options.onProgress?.({ action: toAction(state, best?.move), score: best?.score, exact: best?.score === ceiling, nodes, ceiling });

    function search(s) {
      nodes++;
      if (nodes > maxNodes || ((nodes & 255) === 0 && Date.now() - started >= budget)) { aborted = true; return witnesses.get(key(s)) || null; }
      const k = key(s), cached = memo.get(k);
      if (cached) return cached;
      let result = witnesses.get(k) || null;
      const bound = upperBound(s);
      if (result?.score === bound) return { ...result, exact: true };
      const ordered = moves(s).sort((a, b) => preference(s, b) - preference(s, a));
      let complete = true;
      for (const move of ordered) {
        const next = step(s, move);
        const child = next.score != null ? { score: next.score, move: null, child: null, exact: true } : search(next.state);
        if (!child) { complete = false; if (aborted) break; continue; }
        if (!child.exact) complete = false;
        if (!result || child.score > result.score) result = { score: child.score, move, child, exact: false };
        if (result.score === bound) { result = { ...result, exact: true }; break; }
        if (aborted) { complete = false; break; }
      }
      if (result) {
        result = { ...result, exact: result.exact || complete };
        if (result.exact) memo.set(k, result);
        const old = witnesses.get(k);
        if (!old || result.score > old.score) witnesses.set(k, result);
      }
      return result;
    }

    if (best?.score !== ceiling) {
      const searched = search(initial);
      if (searched && (!best || searched.score >= best.score)) best = searched;
    }
    // Expand the compact witness through the actual engine. This checks every
    // recommendation and supplies a reusable legal line across room changes.
    const line = [];
    let actual = state, cursor = best;
    while (cursor?.move && actual.phase !== "won" && actual.phase !== "lost") {
      if (actual.phase === "ready") { const a = { type: "descend" }; line.push(a); actual = E.transition(actual, a); }
      const action = toAction(actual, cursor.move);
      if (!action) throw new Error("Solver witness does not match the dungeon");
      line.push(action); actual = E.transition(actual, action); cursor = cursor.child;
    }
    if (best && E.score(actual) !== best.score) throw new Error("Solver witness failed validation");
    return { action: line[0] || null, score: best?.score ?? null, exact: !!best && (best.exact || best.score === ceiling), ceiling, nodes, line, elapsed: Date.now() - started, exhausted: aborted };
  }

  const api = { solve, pack, moves, step, upperBound };
  root.ScoundrelSolver = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : globalThis);
