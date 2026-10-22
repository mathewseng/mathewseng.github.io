"use strict";
importScripts("engine.js?v=20261022-5", "solver.js?v=20261022-5");
self.onmessage = ({ data }) => {
  const { requestId, observation, deep } = data;
  try {
    const send = (result, pending) => self.postMessage({ requestId, results: result.results, simulations: result.simulations, pending });
    const result = ScoundrelSolver.analyze(observation, { timeMs: deep ? 6000 : 1800, iterations: deep ? 60000 : 12000, onProgress: progress => send(progress, true) });
    send(result, false);
  } catch (error) { self.postMessage({ requestId, error: error.message }); }
};
