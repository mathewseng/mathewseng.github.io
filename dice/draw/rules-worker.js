import { rulesEV } from './rules-ev.mjs';
self.onmessage = ({ data }) => {
  try { self.postMessage({ id: data.id, result: rulesEV(data.config) }); }
  catch (error) { self.postMessage({ id: data.id, error: error.message }); }
};
