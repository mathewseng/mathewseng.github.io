"use strict";
importScripts("engine.js?v=20261022-5", "solver.js?v=20261022-ev");
self.onmessage = ({ data }) => {
  const { requestId, observation, deep } = data;
  try {
    const target = deep ? 100000 : 12000;
    const send = (result, pending) => self.postMessage({ requestId, results: result.results, simulations: result.simulations, target, pending });
    let lastProgress = 0;
    const result = ScoundrelSolver.analyze(observation, { timeMs: deep ? Infinity : 1800, iterations: target, onProgress: progress => { if (Date.now() - lastProgress >= 120) { lastProgress = Date.now(); send(progress, true); } } });
    send(result, false);
  } catch (error) { self.postMessage({ requestId, error: error.message }); }
};
