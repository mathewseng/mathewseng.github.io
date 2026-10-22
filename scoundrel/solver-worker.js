"use strict";
importScripts("engine.js?v=20261022-slots", "solver.js?v=20261022-slots");
let search = null, position = null;
self.onmessage = ({ data }) => {
  const { requestId, observation } = data;
  try {
    const target = data.target === 1000000 ? 1000000 : 100000;
    const signature = JSON.stringify(observation);
    const send = (result, pending) => self.postMessage({ requestId, results: result.results, simulations: result.simulations, target, pending });
    const options = {
      timeMs: Infinity, iterations: target, progressInterval: target === 1000000 ? 10000 : 1000,
      onProgress: progress => {
        if (progress.simulations < target && (target === 100000 && progress.simulations <= 10000 || progress.simulations % 10000 === 0)) send(progress, true);
      },
    };
    if (search && position === signature) { send(search, true); search = search.extend(options); }
    else { position = signature; search = ScoundrelSolver.analyze(observation, options); }
    send(search, false);
  } catch (error) { self.postMessage({ requestId, error: error.message }); }
};
