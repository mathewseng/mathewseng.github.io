import { solveHand } from './engine.mjs';
self.onmessage = ({ data }) => {
  try { self.postMessage({ id: data.id, result: solveHand(data.dice, data.config) }); }
  catch (error) { self.postMessage({ id: data.id, error: error.message }); }
};
