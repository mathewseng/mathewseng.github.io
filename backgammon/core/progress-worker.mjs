// SPDX-License-Identifier: GPL-3.0-or-later
import { writeProgress } from './progress-writer.mjs';
let queue = Promise.resolve();
self.onmessage = ({data: {id, payload, history}}) => {
  queue = queue.then(async () => {
    try {
      await writeProgress(JSON.parse(payload), history, key => self.postMessage({type:'stored',id,key}), payload);
      self.postMessage({type:'done',id});
    } catch (error) { self.postMessage({type:'error',id,error:error.message}); }
  });
};
