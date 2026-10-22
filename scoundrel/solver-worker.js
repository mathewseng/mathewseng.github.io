"use strict";
importScripts("engine.js?v=20261022-5", "solver.js?v=20261022-auto");
self.onmessage = ({ data }) => {
  const { requestId, observation } = data;
  try {
    const target = 100000;
    const send = (result, pending) => self.postMessage({ requestId, results: result.results, simulations: result.simulations, target, pending });
    const result = ScoundrelSolver.analyze(observation, {
      timeMs: Infinity, iterations: target, progressInterval: 1000,
      onProgress: progress => {
        if (progress.simulations < target && (progress.simulations <= 10000 || progress.simulations % 10000 === 0)) send(progress, true);
      },
    });
    send(result, false);
  } catch (error) { self.postMessage({ requestId, error: error.message }); }
};
