"use strict";
importScripts("engine.js?v=20261021", "solver.js?v=20261021");
const same = (a, b) => a?.type === b?.type && a?.id === b?.id && a?.mode === b?.mode;
self.onmessage = ({ data }) => {
  const { requestId, state, deep, incumbentLine } = data;
  try {
    const legal = Scoundrel.actions(state);
    const results = legal.map((action) => ({ action, score: null, ceiling: null, exact: false, line: [], nodes: 0 }));
    const send = (pending) => self.postMessage({ requestId, results, pending });
    send(true);
    let root = state, rootPrefix = [];
    if (root.phase === "ready") { rootPrefix = [{ type: "descend" }]; root = Scoundrel.transition(root, rootPrefix[0]); }
    const overall = ScoundrelSolver.solve(root, { timeMs: deep ? 3000 : 1200, maxNodes: deep ? 1000000 : 400000, beamWidth: deep ? 160 : 64, incumbentLine: rootPrefix.length ? incumbentLine?.slice(1) : incumbentLine });
    const totalLine = [...rootPrefix, ...(overall.line || [])];
    const found = results.find((r) => same(r.action, totalLine[0]));
    if (found) Object.assign(found, overall, { action: found.action, line: totalLine });
    send(true);
    for (const row of results) {
      const prefix = [row.action];
      let next = Scoundrel.transition(state, row.action);
      if (next.phase === "ready") { prefix.push({ type: "descend" }); next = Scoundrel.transition(next, prefix[1]); }
      if (["won", "lost"].includes(next.phase)) {
        const score = Scoundrel.score(next);
        Object.assign(row, { score, ceiling: score, exact: true, line: prefix });
      } else if (!row.exact) {
        const continuation = row.line.length ? row.line.slice(prefix.length) : same(incumbentLine?.[0], row.action) ? incumbentLine.slice(prefix.length) : undefined;
        const result = ScoundrelSolver.solve(next, { timeMs: deep ? 2200 : 450, maxNodes: deep ? 700000 : 180000, beamWidth: deep ? 120 : 32, incumbentLine: continuation });
        if (row.score == null || result.score >= row.score) Object.assign(row, result, { action: row.action, line: [...prefix, ...result.line] });
      }
      send(true);
    }
    send(false);
  } catch (error) { self.postMessage({ requestId, error: error.message }); }
};
